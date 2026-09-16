using System;
using System.Collections.Generic;
using System.Linq;
using Zhuxian.Core;
using Zhuxian.Data;

namespace Zhuxian.Tests
{
    /// <summary>
    /// 技能释放与弹道的对照测试。对应 src/skills.js。
    ///
    /// 这块是随机数消耗最密集的地方：一发范围技能打中 5 只怪就是 5 次伤害结算、
    /// 最多 10 个随机数，顺序错一个后面全歪。所以每条用例都比"这段摇了几次"。
    /// </summary>
    static class SkillsTests
    {
        public static void Run(GameData data)
        {
            var fx = Fixtures.Load<SkillsFixture>("skills.json");

            Failures(data, fx);
            Casts(data, fx);
            Flights(data, fx);
            Basics(data, fx);
            Talismans(data, fx);
            Upkeep(data, fx);
        }

        /// <summary>
        /// 造一局，和样本那边的 newGame 一一对应：
        /// 建图 → 建号 → 拉到满级 → 回满血蓝 → 站到图中央、面朝右。
        /// </summary>
        static (GameContext game, RecordingHooks hooks) NewGame(GameData data, IRng rng, string sectKey, int level)
        {
            var world = new World(data, rng, "caomiao");
            var player = Player.Create(data, "测试", sectKey ?? "qingyun");
            if (level > 0)
            {
                Player.GainExp(data, player, 999999999);
                player.level = level;
            }
            Player.Recompute(data, player);
            player.hp = player.stats.hp;
            player.mp = player.stats.mp;
            player.x = world.Width / 2;
            player.y = world.Height / 2;
            player.facingX = 1;
            player.facingY = 0;

            var hooks = new RecordingHooks();
            var game = new GameContext(data, rng, player, world, hooks);
            return (game, hooks);
        }

        /// <summary>把怪摆到玩家跟前，免得靠刷怪的随机位置碰运气</summary>
        static void PlaceMonsters(GameData data, GameContext game, (string id, double dx, double dy)[] spec)
        {
            var p = game.Player;
            game.World.Monsters.Clear();
            foreach (var (id, dx, dy) in spec)
            {
                var def = data.Monster(id);
                game.World.Monsters.Add(new MonsterInstance
                {
                    uid = Uid.Next(),
                    def = def,
                    x = p.x + dx, y = p.y + dy,
                    homeX = p.x + dx, homeY = p.y + dy,
                    hp = def.maxHp, maxHp = def.maxHp,
                    state = "idle", atkCd = 0, wanderCd = 9999,
                });
            }
        }

        static readonly (string, double, double)[] FivePack =
        {
            ("yegou", 40, 0), ("shanzhu", 70, 30), ("qingshe", -60, 10),
            ("shanzei", 120, -20), ("linghou", 200, 5),
        };

        static void Failures(GameData data, SkillsFixture fx)
        {
            Check.Group("技能释放失败的理由", () =>
            {
                Check.True(fx.failures.Length > 0, "样本非空");

                var (game, _) = NewGame(data, new Mulberry32(5000), "qingyun", 0);
                var p = game.Player;
                var skill = data.Sect(p.sect).skills[0];

                // 释放失败必须给一句人话，UI 直接显示——按了没反应是最糟的手感
                p.mp = 0;
                var poor = Skills.Cast(game, skill, p.x + 100, p.y);
                AssertFail(poor, fx.failures[0], "灵力不足");

                p.mp = p.stats.mp;
                Skills.Cast(game, skill, p.x + 100, p.y);
                var cooling = Skills.Cast(game, skill, p.x + 100, p.y);
                AssertFail(cooling, fx.failures[1], "冷却中");

                p.cd[skill.key] = 0;
                Combat.AddBuff(p.buffs, new Buff { kind = "stun", ms = 2000 });
                AssertFail(Skills.Cast(game, skill, p.x + 100, p.y), fx.failures[2], "被定身");

                p.buffs.Clear();
                p.dead = true;
                AssertFail(Skills.Cast(game, skill, p.x + 100, p.y), fx.failures[3], "已倒下");
            });
        }

        static void AssertFail(CastResult actual, CastFailure expected, string tag)
        {
            Check.Equal(actual.Ok, expected.ok, tag + " 是否成功");
            Check.True(actual.Message == expected.msg, tag + " 的提示语",
                "期望 " + expected.msg + "，实得 " + actual.Message);
        }

        static void Casts(GameData data, SkillsFixture fx)
        {
            Check.Group("四门派全部技能", () =>
            {
                Check.True(fx.casts.Length > 0, "样本非空");

                foreach (var c in fx.casts)
                {
                    var (game, hooks) = NewGame(data, new Mulberry32(c.seed), c.sect, 65);
                    PlaceMonsters(data, game, FivePack);
                    var p = game.Player;

                    var skill = data.Sect(c.sect).skills.First(s => s.key == c.skillKey);
                    var counting = new CountingRng(new Mulberry32(c.seed));
                    var casted = new GameContext(data, counting, p, game.World, hooks);
                    foreach (var v in game.Fx.Visuals) casted.Fx.Visuals.Add(v);

                    var res = Skills.Cast(casted, skill, p.x + 300, p.y);
                    var tag = c.sect + "/" + c.skillKey + "(" + c.kind + ")";

                    Check.Equal(res.Ok, c.ok, tag + " 是否放出去");
                    Check.Equal(counting.Count, c.randomsUsed, tag + " 消耗的随机数个数");
                    AssertPlayer(p, c.player, tag);
                    AssertMonsters(casted.World.Monsters, c.monsters, tag);
                    AssertBolts(casted.Fx.Bolts, c.bolts, tag);

                    Check.Equal(casted.Fx.Visuals.Count, c.visuals.Length, tag + " 特效数量");
                    for (var i = 0; i < casted.Fx.Visuals.Count && i < c.visuals.Length; i++)
                    {
                        Check.True(casted.Fx.Visuals[i].kind == c.visuals[i].kind,
                            tag + " 第 " + i + " 个特效类型",
                            "期望 " + c.visuals[i].kind + "，实得 " + casted.Fx.Visuals[i].kind);
                        Check.Near(casted.Fx.Visuals[i].r, c.visuals[i].r, tag + " 第 " + i + " 个特效半径");
                    }

                    AssertEvents(hooks.Events, c.events, tag);
                }
            });
        }

        static void Flights(GameData data, SkillsFixture fx)
        {
            Check.Group("弹道飞行", () =>
            {
                Check.True(fx.flights.Length > 0, "样本非空");

                foreach (var c in fx.flights)
                {
                    var (game, hooks) = NewGame(data, new Mulberry32(c.seed), "qingyun", 65);
                    PlaceMonsters(data, game, new[] { ("yegou", 80.0, 0.0), ("shanzhu", 160.0, 0.0), ("qingshe", 240.0, 0.0) });
                    var p = game.Player;

                    var skill = data.Sect("qingyun").skills.First(s => s.key == c.skillKey);
                    var counting = new CountingRng(new Mulberry32(c.seed));
                    var flying = new GameContext(data, counting, p, game.World, hooks);

                    Skills.Cast(flying, skill, p.x + 300, p.y);
                    for (var i = 0; i < 20; i++) Skills.Update(flying, 50);

                    // bolt 撞一只就停、pierce 穿过去继续飞、blast 路上不碰只炸落点——
                    // 三种行为的差别全在怪的血量上
                    var tag = c.skillKey + "(" + c.kind + ")";
                    Check.Equal(counting.Count, c.randomsUsed, tag + " 消耗的随机数个数");
                    AssertMonsters(flying.World.Monsters, c.monsters, tag);
                    AssertBolts(flying.Fx.Bolts, c.bolts, tag);
                    AssertEvents(hooks.Events, c.events, tag);
                }
            });
        }

        static void Basics(GameData data, SkillsFixture fx)
        {
            Check.Group("普通攻击", () =>
            {
                Check.True(fx.basics.Length >= 2, "样本非空");

                var c = fx.basics[0];
                var (game, hooks) = NewGame(data, new Mulberry32(c.seed), "qingyun", 30);
                PlaceMonsters(data, game, new[]
                {
                    ("yegou", 30.0, 0.0), ("shanzhu", 45.0, 10.0), ("qingshe", 20.0, -20.0),
                    ("shanzei", 35.0, 25.0), ("linghou", -300.0, 0.0),
                });
                var counting = new CountingRng(new Mulberry32(c.seed));
                var ctx = new GameContext(data, counting, game.Player, game.World, hooks);

                var hit = Skills.BasicAttack(ctx);
                Check.Equal(hit, c.hit, "普攻是否打到");
                Check.Equal(counting.Count, c.randomsUsed, "普攻消耗的随机数个数");
                // 普攻会把人物朝向转向最近的怪
                Check.Near(ctx.Player.facingX, c.facingX, "普攻后的朝向 x");
                Check.Near(ctx.Player.facingY, c.facingY, "普攻后的朝向 y");
                AssertMonsters(ctx.World.Monsters, c.monsters, "普攻");
                AssertEvents(hooks.Events, c.events, "普攻");

                // 周围没怪时打空，不该有任何动静
                var empty = fx.basics[1];
                var (g2, h2) = NewGame(data, new Mulberry32(empty.seed), "qingyun", 30);
                g2.World.Monsters.Clear();
                Check.Equal(Skills.BasicAttack(g2), empty.hit, "周围没怪时普攻打空");
                Check.Equal(h2.Events.Count, 0, "打空不该抛任何事件");
            });
        }

        static void Talismans(GameData data, SkillsFixture fx)
        {
            Check.Group("法宝主动技", () =>
            {
                Check.True(fx.talismans.Length > 0, "样本非空");

                foreach (var c in fx.talismans)
                {
                    var (game, hooks) = NewGame(data, new Mulberry32(c.seed), "qingyun", c.itemId == null ? 10 : 65);
                    var p = game.Player;

                    if (c.itemId == null)
                    {
                        // 没装法宝
                        var none = Skills.CastTalisman(game, 0, 0);
                        Check.Equal(none.Ok, c.ok, "没装法宝时释放");
                        Check.True(none.Message == c.msg, "没装法宝的提示语",
                            "期望 " + c.msg + "，实得 " + none.Message);
                        continue;
                    }

                    PlaceMonsters(data, game, new[] { ("yegou", 40.0, 0.0), ("shanzhu", 70.0, 30.0), ("qingshe", -60.0, 10.0) });
                    p.equip.talisman = c.itemId;
                    Player.Recompute(data, p);
                    p.hp = Math.Floor(p.stats.hp * 0.5);

                    var counting = new CountingRng(new Mulberry32(c.seed));
                    var ctx = new GameContext(data, counting, p, game.World, hooks);
                    var res = Skills.CastTalisman(ctx, p.x + 100, p.y);

                    var tag = c.itemId + "(" + c.activeKind + ")";
                    Check.Equal(res.Ok, c.ok, tag + " 是否放出去");
                    Check.Equal(counting.Count, c.randomsUsed, tag + " 消耗的随机数个数");
                    AssertPlayer(p, c.player, tag);
                    AssertMonsters(ctx.World.Monsters, c.monsters, tag);
                    AssertEvents(hooks.Events, c.events, tag);
                }
            });
        }

        static void Upkeep(GameData data, SkillsFixture fx)
        {
            Check.Group("冷却推进与特效寿命", () =>
            {
                Check.True(fx.upkeep.Length > 0, "样本非空");

                var (game, hooks) = NewGame(data, new Mulberry32(5600), "qingyun", 65);
                PlaceMonsters(data, game, new[] { ("yegou", 40.0, 0.0) });
                var p = game.Player;
                var skill = data.Sect("qingyun").skills[0];

                var ctx = new GameContext(data, new Mulberry32(5600), p, game.World, hooks);
                Skills.Cast(ctx, skill, p.x + 100, p.y);

                foreach (var c in fx.upkeep)
                {
                    Skills.Update(ctx, c.dt);
                    var tag = "推进 " + c.dt + "ms 后";
                    Check.Near(p.cd[skill.key], c.cd, tag + " 的冷却剩余");
                    Check.Equal(ctx.Fx.Bolts.Count, c.bolts, tag + " 的飞行物数量");
                    Check.Equal(ctx.Fx.Visuals.Count, c.visuals, tag + " 的特效数量");
                }
            });
        }

        // ── 断言工具 ──────────────────────────────────────────

        static void AssertPlayer(PlayerState p, SkillPlayerSnapshot e, string tag)
        {
            Check.Near(p.hp, e.hp, tag + " 释放后的气血");
            Check.Near(p.mp, e.mp, tag + " 释放后的灵力");
            Check.Near(p.swingMs, e.swingMs, tag + " 的挥砍动作时长");
            Check.Near(p.stats.atk, e.atk, tag + " 释放后的攻击");
            Check.Near(p.stats.def, e.def, tag + " 释放后的防御");
            Check.Equal(p.buffs.Count, e.buffs.Length, tag + " 身上的增益个数");
            for (var i = 0; i < p.buffs.Count && i < e.buffs.Length; i++)
            {
                Check.True(p.buffs[i].kind == e.buffs[i], tag + " 第 " + i + " 个增益",
                    "期望 " + e.buffs[i] + "，实得 " + p.buffs[i].kind);
            }
        }

        static void AssertMonsters(List<MonsterInstance> actual, SkillMonsterSnapshot[] expected, string tag)
        {
            Check.Equal(actual.Count, expected.Length, tag + " 怪物数量");
            var n = Math.Min(actual.Count, expected.Length);
            for (var i = 0; i < n; i++)
            {
                var a = actual[i];
                var e = expected[i];
                var who = tag + " 第 " + i + " 只怪";
                Check.True(a.def.id == e.id, who + " 的种类", "期望 " + e.id + "，实得 " + a.def.id);
                Check.Near(a.hp, e.hp, who + " 的气血");
                // 击退会挪动坐标，所以位置也得比
                Check.Near(a.x, e.x, who + " 的 x");
                Check.Near(a.y, e.y, who + " 的 y");
                Check.Equal(a.dead, e.dead, who + " 的死亡标记");

                Check.Equal(a.buffs.Count, e.buffs.Length, who + " 身上的状态个数");
                for (var j = 0; j < a.buffs.Count && j < e.buffs.Length; j++)
                {
                    Check.True(a.buffs[j].kind == e.buffs[j].kind, who + " 第 " + j + " 个状态",
                        "期望 " + e.buffs[j].kind + "，实得 " + a.buffs[j].kind);
                    Check.Near(a.buffs[j].ms, e.buffs[j].ms, who + " 第 " + j + " 个状态的时长");
                    Check.Near(a.buffs[j].dps ?? 0, e.buffs[j].dps, who + " 第 " + j + " 个状态的每秒伤害");
                    Check.Near(a.buffs[j].amount ?? 0, e.buffs[j].amount, who + " 第 " + j + " 个状态的强度");
                }
            }
        }

        static void AssertBolts(List<Bolt> actual, BoltSnapshot[] expected, string tag)
        {
            Check.Equal(actual.Count, expected.Length, tag + " 飞行物数量");
            var n = Math.Min(actual.Count, expected.Length);
            for (var i = 0; i < n; i++)
            {
                var a = actual[i];
                var e = expected[i];
                var who = tag + " 第 " + i + " 个飞行物";
                Check.True(a.kind == e.kind, who + " 的种类", "期望 " + e.kind + "，实得 " + a.kind);
                Check.Near(a.x, e.x, who + " 的 x");
                Check.Near(a.y, e.y, who + " 的 y");
                Check.Near(a.dx, e.dx, who + " 的方向 x");
                Check.Near(a.dy, e.dy, who + " 的方向 y");
                Check.Near(a.speed, e.speed, who + " 的速度");
                Check.Near(a.left, e.left, who + " 的剩余射程");
                Check.Near(a.width, e.width, who + " 的判定宽度");
            }
        }

        static void AssertEvents(List<GameEvent> actual, GameEvent[] expected, string tag)
        {
            Check.Equal(actual.Count, expected.Length, tag + " 抛出的事件数量");
            var n = Math.Min(actual.Count, expected.Length);
            for (var i = 0; i < n; i++)
            {
                var a = actual[i];
                var e = expected[i];
                Check.True(a.kind == e.kind && a.tag == e.tag, tag + " 第 " + i + " 个事件",
                    "期望 " + e.kind + "/" + e.tag + "，实得 " + a.kind + "/" + a.tag);
                Check.Near(a.amount, e.amount, tag + " 第 " + i + " 个事件的数值");
            }
        }

        /// <summary>把逻辑层抛出来的事件按顺序记下来，和样本那边逐条对</summary>
        sealed class RecordingHooks : IGameHooks
        {
            public readonly List<GameEvent> Events = new List<GameEvent>();

            public void OnHitPlayer(MonsterInstance monster) { }
            public void OnDot(MonsterInstance monster, int amount) { }

            public void OnDeath(MonsterInstance monster)
            {
                Events.Add(new GameEvent { kind = "death", tag = monster.def.id });
            }

            public void Floater(double x, double y, double amount, string kind)
            {
                Events.Add(new GameEvent { kind = "floater", amount = amount, tag = kind });
            }

            public void Sfx(string name)
            {
                Events.Add(new GameEvent { kind = "sfx", tag = name });
            }

            public void Log(string message, string kind)
            {
                Events.Add(new GameEvent { kind = "log", tag = kind });
            }

            public void OnCast(ZxSectSkill skill)
            {
                Events.Add(new GameEvent { kind = "cast", tag = skill.key });
            }
        }
    }
}
