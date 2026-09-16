using System;
using System.Collections.Generic;
using System.Linq;
using Zhuxian.Data;

namespace Zhuxian.Core
{
    /// <summary>
    /// 技能与法宝的释放、弹道、命中结算。移植自 src/skills.js。
    ///
    /// 所有技能最终都落到 ApplyHit 上——命中判定各不相同，伤害口径只有一个。
    ///
    /// 释放失败时返回一句人话（灵力不够 / 还在冷却），由 UI 直接显示，
    /// 不静默失败——玩家按了没反应是最糟的手感。
    /// </summary>
    public static class Skills
    {
        // ── 命中结算 ──────────────────────────────────────────

        static void Visual(GameContext game, VisualFx v)
        {
            v.life = v.ms;
            game.Fx.Visuals.Add(v);
        }

        /// <summary>
        /// 单次命中结算：算伤害 → 扣血 → 吸血 → 附加状态 → 飘字。
        /// 这是玩家打怪的唯一入口。
        /// </summary>
        public static double ApplyHit(GameContext game, MonsterInstance m, HitOptions opt)
        {
            var p = game.Player;
            var s = p.stats;
            var isMagic = opt.Dmg == "magic";
            var atkVal = isMagic ? s.mag : s.atk;
            var defVal = isMagic ? (double)m.def.mdef : m.def.def;

            var res = Combat.Damage(atkVal, defVal, opt.Dmg, opt.Power,
                new Combat.DamageOptions
                {
                    CritRate = s.crit,
                    LevelGap = p.level - m.def.lv,
                },
                game.Data.Config, game.Rng);

            var real = game.World.HurtMonster(m, res.Amount, game.Hooks);
            game.Hooks.Floater(m.x, m.y - m.def.radius - 8, real, res.Crit ? "crit" : "hit");

            // 命中点炸一下。伤害数字说的是"扣了多少"，火花说的是"这一下打上了"——
            // 两者缺一个，打击感就差一截
            Visual(game, new VisualFx
            {
                kind = "impact", x = m.x, y = m.y,
                r = res.Crit ? 26 : 17,
                ms = res.Crit ? 260 : 180,
                color = res.Crit ? "#ffd24a" : "#ffffff",
            });

            // 吸血：技能自带的 + 装备/增益的，取和
            var steal = opt.Lifesteal + s.lifesteal;
            if (steal > 0 && !p.dead)
            {
                var back = Combat.Lifesteal(steal, real);
                var room = p.stats.hp - p.hp;
                if (room > 0)
                {
                    var got = Math.Min(room, back);
                    p.hp += got;
                    game.Hooks.Floater(p.x, p.y - 34, got, "heal");
                }
            }

            // 附加状态
            if (opt.Burn != 0)
            {
                Combat.AddBuff(m.buffs, new Buff
                {
                    kind = "burn",
                    ms = opt.BurnMs != 0 ? opt.BurnMs : 4000,
                    dps = atkVal * opt.Burn,
                });
            }
            if (opt.Poison != 0)
            {
                Combat.AddBuff(m.buffs, new Buff
                {
                    kind = "poison",
                    ms = opt.PoisonMs != 0 ? opt.PoisonMs : 6000,
                    dps = atkVal * opt.Poison,
                });
            }
            if (opt.StunMs != 0) Combat.AddBuff(m.buffs, new Buff { kind = "stun", ms = opt.StunMs });
            if (opt.CharmMs != 0) Combat.AddBuff(m.buffs, new Buff { kind = "charm", ms = opt.CharmMs });
            if (opt.Slow != 0)
            {
                Combat.AddBuff(m.buffs, new Buff
                {
                    kind = "slow",
                    ms = opt.SlowMs != 0 ? opt.SlowMs : 3000,
                    amount = opt.Slow,
                });
            }
            if (opt.Knock != 0)
            {
                var d = Geometry.DirTo(p.x, p.y, m.x, m.y);
                var np = game.World.Move(m.x, m.y, d.X * opt.Knock, d.Y * opt.Knock, m.def.radius);
                m.x = np.X;
                m.y = np.Y;
            }

            return real;
        }

        // ── 各种命中形状 ──────────────────────────────────────

        static int DoNova(GameContext game, double x, double y, double radius, HitOptions opt)
        {
            var list = game.World.InRadius(x, y, radius);
            foreach (var m in list) ApplyHit(game, m, opt);

            Visual(game, new VisualFx { kind = "nova", x = x, y = y, r = radius, ms = 380, color = opt.Color });
            game.Hooks.Sfx("nova");
            return list.Count;
        }

        static int DoStrike(GameContext game, HitOptions opt)
        {
            var p = game.Player;
            var range = opt.Range != 0 ? opt.Range : 90;

            // 朝向前方半圆内、射程内的怪，按距离取最多 3 个
            var cands = game.World.InRadius(p.x, p.y, range);
            var hits = new List<MonsterInstance>();
            foreach (var m in cands)
            {
                var d = Geometry.DirTo(p.x, p.y, m.x, m.y);
                if (d.X * p.facingX + d.Y * p.facingY > -0.1) hits.Add(m);
            }

            // 用 OrderBy 而不是 List.Sort：OrderBy 是稳定排序，和 JS 的 Array.sort 一致。
            // List.Sort 不稳定，距离相同的两只怪谁在前是不确定的——多段技能打谁不打谁就会飘
            hits = hits
                .OrderBy(m => Geometry.Dist2(p.x, p.y, m.x, m.y))
                .Take(3)
                .ToList();

            // 让人物做出挥砍动作。多段技能也只播一次，不然会抽搐
            p.swingMs = game.Data.Config.SWING_MS;

            var times = opt.Hits != 0 ? opt.Hits : 1;
            for (var t = 0; t < times; t++)
            {
                foreach (var m in hits)
                {
                    if (!m.dead) ApplyHit(game, m, opt);
                }
            }

            Visual(game, new VisualFx
            {
                kind = "slash", x = p.x, y = p.y, r = range,
                ax = p.facingX, ay = p.facingY, ms = 220, color = opt.Color,
            });
            game.Hooks.Sfx("slash");
            return hits.Count;
        }

        static void DoPierce(GameContext game, double tx, double ty, HitOptions opt)
        {
            var p = game.Player;
            var dir = Geometry.DirTo(p.x, p.y, tx, ty);
            game.Fx.Bolts.Add(new Bolt
            {
                uid = Uid.Next(),
                kind = "pierce",
                x = p.x, y = p.y,
                dx = dir.X, dy = dir.Y,
                speed = opt.Speed != 0 ? opt.Speed : 600,
                left = opt.Range != 0 ? opt.Range : 360,
                width = opt.Width != 0 ? opt.Width : 26,
                opt = opt,
                color = opt.Color,
            });
            game.Hooks.Sfx("cast");
        }

        static void DoBolt(GameContext game, double tx, double ty, HitOptions opt)
        {
            var p = game.Player;
            var dir = Geometry.DirTo(p.x, p.y, tx, ty);
            game.Fx.Bolts.Add(new Bolt
            {
                uid = Uid.Next(),
                kind = "bolt",
                x = p.x, y = p.y,
                dx = dir.X, dy = dir.Y,
                speed = opt.Speed != 0 ? opt.Speed : 420,
                left = opt.Range != 0 ? opt.Range : 320,
                width = 14,
                opt = opt,
                color = opt.Color,
            });
            game.Hooks.Sfx("cast");
        }

        static void DoBlast(GameContext game, double tx, double ty, HitOptions opt)
        {
            var p = game.Player;

            // 落点钳在射程内，点太远就打在射程边上，而不是放空
            var d = Geometry.Dist(p.x, p.y, tx, ty);
            var max = opt.Range != 0 ? opt.Range : 300;
            if (d > max)
            {
                var dir = Geometry.DirTo(p.x, p.y, tx, ty);
                tx = p.x + dir.X * max;
                ty = p.y + dir.Y * max;
            }

            var dir2 = Geometry.DirTo(p.x, p.y, tx, ty);
            game.Fx.Bolts.Add(new Bolt
            {
                uid = Uid.Next(),
                kind = "blast",
                x = p.x, y = p.y,
                tx = tx, ty = ty,
                dx = dir2.X, dy = dir2.Y,
                speed = 560,
                left = Geometry.Dist(p.x, p.y, tx, ty) + 1,
                width = 12,
                opt = opt,
                color = opt.Color,
            });
            game.Hooks.Sfx("cast");
        }

        // ── 释放 ──────────────────────────────────────────────

        /// <summary>技能定义摊平成命中参数</summary>
        static HitOptions OptionsOf(ZxSectSkill def)
        {
            return new HitOptions
            {
                Dmg = def.dmg,
                Power = def.power,
                Lifesteal = def.lifesteal,
                Burn = def.burn,
                BurnMs = def.burnMs,
                StunMs = def.stunMs,
                Slow = def.slow,
                SlowMs = def.slowMs,
                Knock = def.knock,
                Hits = def.hits,
                Range = def.range,
                Speed = def.speed,
                Width = def.width,
                Radius = def.radius,
                Color = def.color,
            };
        }

        /// <summary>
        /// 放技能。tx/ty 是瞄准点（鼠标位置，或摇杆方向上的一点）。
        /// </summary>
        public static CastResult Cast(GameContext game, ZxSectSkill def, double tx, double ty)
        {
            var p = game.Player;
            if (p.dead) return CastResult.Fail("你已经倒下了。");
            if (Combat.Disabled(p.buffs)) return CastResult.Fail("动弹不得！");

            var cd = p.cd.TryGetValue(def.key, out var left) ? left : 0;
            if (cd > 0)
            {
                return CastResult.Fail(def.name + " 还需 " + (cd / 1000).ToString("F1") + " 秒");
            }
            if (p.mp < def.mp) return CastResult.Fail("灵力不足。");

            var costHp = def.costHp != 0 ? Math.Floor(p.stats.hp * def.costHp) : 0;
            if (costHp != 0 && p.hp <= costHp) return CastResult.Fail("气血不足以支撑血炼。");

            p.mp -= def.mp;
            if (costHp != 0)
            {
                p.hp -= costHp;
                game.Hooks.Floater(p.x, p.y - 34, costHp, "hurt");
            }
            p.cd[def.key] = def.cd;

            var opt = OptionsOf(def);

            switch (def.kind)
            {
                case "strike": DoStrike(game, opt); break;
                case "bolt": DoBolt(game, tx, ty, opt); break;
                case "pierce": DoPierce(game, tx, ty, opt); break;
                case "nova": DoNova(game, p.x, p.y, def.radius, opt); break;
                case "blast": DoBlast(game, tx, ty, opt); break;
                case "buff":
                case "heal":
                    // 这两类没有命中形状，效果全在下面的自身增益部分
                    break;
            }

            // 自身增益部分。很多攻击技也带护盾，所以独立于 kind 判断
            if (def.shield != 0)
            {
                Combat.AddBuff(p.buffs, new Buff
                {
                    kind = "shield",
                    ms = def.shieldMs != 0 ? def.shieldMs : 8000,
                    value = Math.Floor(p.stats.hp * def.shield),
                });
                Visual(game, new VisualFx { kind = "ring", x = p.x, y = p.y, r = 44, ms = 500, color = "#9fd8ff", follow = true });
            }
            if (def.buffAtk != 0)
            {
                Combat.AddBuff(p.buffs, new Buff
                {
                    kind = "atkUp",
                    ms = def.buffMs != 0 ? def.buffMs : 8000,
                    amount = def.buffAtk,
                });
                Player.Recompute(game.Data, p);
            }
            if (def.buffDef != 0)
            {
                Combat.AddBuff(p.buffs, new Buff
                {
                    kind = "defUp",
                    ms = def.buffMs != 0 ? def.buffMs : 8000,
                    amount = def.buffDef,
                });
                Player.Recompute(game.Data, p);
            }
            if (def.heal != 0)
            {
                var amount = Math.Floor(p.stats.hp * def.heal) + def.healFlat;
                var got = Math.Min(amount, p.stats.hp - p.hp);
                p.hp += got;
                game.Hooks.Floater(p.x, p.y - 34, got, "heal");
                Visual(game, new VisualFx { kind = "ring", x = p.x, y = p.y, r = 40, ms = 520, color = "#8ef0b0", follow = true });
                game.Hooks.Sfx("heal");
            }

            game.Hooks.OnCast(def);
            return CastResult.Success;
        }

        /// <summary>法宝主动技。和门派技能共用冷却表，key 用 talisman</summary>
        public static CastResult CastTalisman(GameContext game, double tx, double ty)
        {
            var p = game.Player;
            var item = Inventory.Talisman(game.Data, p.equip);
            if (item == null || item.active == null || !item.active.present)
            {
                return CastResult.Fail("没有装备法宝。");
            }
            if (p.dead) return CastResult.Fail("你已经倒下了。");

            var a = item.active;
            var cd = p.cd.TryGetValue("talisman", out var left) ? left : 0;
            if (cd > 0)
            {
                return CastResult.Fail(item.name + " 尚未凝聚（" + (cd / 1000).ToString("F1") + " 秒）");
            }
            p.cd["talisman"] = a.cd;

            switch (a.kind)
            {
                case "heal":
                {
                    var amount = Math.Floor(p.stats.hp * a.heal) + a.healFlat;
                    var got = Math.Min(amount, p.stats.hp - p.hp);
                    p.hp += got;
                    game.Hooks.Floater(p.x, p.y - 34, got, "heal");
                    Visual(game, new VisualFx { kind = "ring", x = p.x, y = p.y, r = 46, ms = 600, color = "#8ef0b0", follow = true });
                    game.Hooks.Sfx("heal");
                    break;
                }
                case "nova":
                    DoNova(game, p.x, p.y, a.radius, new HitOptions
                    {
                        Dmg = "magic", Power = a.power, Burn = a.burn, BurnMs = a.burnMs, Color = "#ff9a4a",
                    });
                    break;
                case "stun":
                {
                    foreach (var m in game.World.InRadius(p.x, p.y, a.radius))
                    {
                        Combat.AddBuff(m.buffs, new Buff { kind = "stun", ms = a.ms });
                    }
                    Visual(game, new VisualFx { kind = "nova", x = p.x, y = p.y, r = a.radius, ms = 420, color = "#b48ff0" });
                    game.Hooks.Sfx("nova");
                    break;
                }
                case "charm":
                {
                    foreach (var m in game.World.InRadius(p.x, p.y, a.radius))
                    {
                        Combat.AddBuff(m.buffs, new Buff { kind = "charm", ms = a.ms });
                    }
                    Visual(game, new VisualFx { kind = "nova", x = p.x, y = p.y, r = a.radius, ms = 420, color = "#f0a0c8" });
                    game.Hooks.Sfx("bell");
                    break;
                }
                case "poison":
                {
                    foreach (var m in game.World.InRadius(p.x, p.y, a.radius))
                    {
                        Combat.AddBuff(m.buffs, new Buff { kind = "poison", ms = a.ms, dps = p.stats.atk * a.power });
                    }
                    Visual(game, new VisualFx { kind = "nova", x = p.x, y = p.y, r = a.radius, ms = 520, color = "#8fc44a" });
                    game.Hooks.Sfx("nova");
                    break;
                }
                case "lifesteal":
                    Combat.AddBuff(p.buffs, new Buff { kind = "lifesteal", ms = a.ms, amount = a.amount });
                    Player.Recompute(game.Data, p);
                    Visual(game, new VisualFx { kind = "ring", x = p.x, y = p.y, r = 42, ms = 600, color = "#e05a6e", follow = true });
                    break;
                case "reflect":
                    Combat.AddBuff(p.buffs, new Buff { kind = "reflect", ms = a.ms, amount = a.ratio });
                    Visual(game, new VisualFx { kind = "ring", x = p.x, y = p.y, r = 46, ms = 600, color = "#9ae0ff", follow = true });
                    break;
                case "shield":
                    Combat.AddBuff(p.buffs, new Buff { kind = "shield", ms = a.ms, value = Math.Floor(p.stats.hp * a.shield) });
                    Visual(game, new VisualFx { kind = "ring", x = p.x, y = p.y, r = 48, ms = 600, color = "#ffd98a", follow = true });
                    break;
            }

            game.Hooks.Log("祭出【" + item.name + "】· " + a.name, "skill");
            return CastResult.Success;
        }

        /// <summary>普通攻击：近身扇形，走和技能一样的结算</summary>
        public static bool BasicAttack(GameContext game)
        {
            var p = game.Player;
            var cfg = game.Data.Config;
            var target = game.World.Nearest(p.x, p.y, cfg.MELEE_RANGE + 20);
            if (target == null) return false;

            var dir = Geometry.DirTo(p.x, p.y, target.x, target.y);
            p.facingX = dir.X;
            p.facingY = dir.Y;

            DoStrike(game, new HitOptions
            {
                Dmg = "phys",
                Power = 1,
                Range = cfg.MELEE_RANGE,
                Color = game.Data.Sect(p.sect).color,
            });
            return true;
        }

        // ── 每帧推进 ──────────────────────────────────────────

        public static void Update(GameContext game, double dt)
        {
            var p = game.Player;

            // 冷却
            foreach (var key in p.cd.Keys.ToList())
            {
                if (p.cd[key] > 0) p.cd[key] = Math.Max(0, p.cd[key] - dt);
            }

            // 飞行物
            for (var i = game.Fx.Bolts.Count - 1; i >= 0; i--)
            {
                var b = game.Fx.Bolts[i];
                var step = b.speed * (dt / 1000.0);
                b.x += b.dx * step;
                b.y += b.dy * step;
                b.left -= step;

                var done = false;

                // 撞墙就停（blast 停在墙前也照样炸）
                if (game.World.Blocked(b.x, b.y, 4)) done = true;

                foreach (var m in game.World.InRadius(b.x, b.y, b.width))
                {
                    if (b.hit.Contains(m.uid)) continue;
                    b.hit.Add(m.uid);
                    if (b.kind == "blast") continue; // 落点炸，路上不碰

                    ApplyHit(game, m, b.opt);
                    if (b.kind == "bolt")
                    {
                        done = true;
                        break;
                    }
                }

                if (b.left <= 0) done = true;

                if (!done) continue;

                if (b.kind == "blast")
                {
                    DoNova(game, b.x, b.y, b.opt.Radius != 0 ? b.opt.Radius : 120, b.opt);
                }
                else
                {
                    Visual(game, new VisualFx { kind = "spark", x = b.x, y = b.y, r = 16, ms = 200, color = b.color });
                }
                game.Fx.Bolts.RemoveAt(i);
            }

            // 特效寿命
            for (var i = game.Fx.Visuals.Count - 1; i >= 0; i--)
            {
                var v = game.Fx.Visuals[i];
                v.life -= dt;
                if (v.follow)
                {
                    v.x = p.x;
                    v.y = p.y;
                }
                if (v.life <= 0) game.Fx.Visuals.RemoveAt(i);
            }
        }
    }
}
