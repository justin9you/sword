using System;
using System.Collections.Generic;
using Zhuxian.Data;

namespace Zhuxian.Core
{
    /// <summary>
    /// 场景运行时：碰撞、刷怪、怪物 AI、掉落物、传送门、NPC。
    /// 移植自 src/world.js。
    ///
    /// 一个 World 只管一张图。换图就新建一个，旧的直接丢掉——
    /// 怪物状态不跨图保留，省掉一堆同步问题。
    ///
    /// 所有坐标都是像素。地图定义里的格子坐标在构造时就乘好 TILE。
    /// </summary>
    public class World
    {
        readonly GameData data;
        readonly IRng rng;

        public ZxMap Def { get; }
        public string Key => Def.key;
        /// <summary>地图宽高（像素）</summary>
        public double Width { get; }
        public double Height { get; }

        public List<BlockRect> Blocks { get; } = new List<BlockRect>();
        public List<PortalInstance> Portals { get; } = new List<PortalInstance>();
        public List<NpcInstance> Npcs { get; } = new List<NpcInstance>();
        public List<MonsterInstance> Monsters { get; } = new List<MonsterInstance>();
        public List<DropItem> Drops { get; } = new List<DropItem>();

        public bool BossDead { get; private set; }
        public double BossTimer { get; private set; }
        double spawnTimer;

        public World(GameData data, IRng rng, string mapKey)
        {
            this.data = data ?? throw new ArgumentNullException(nameof(data));
            this.rng = rng ?? throw new ArgumentNullException(nameof(rng));

            Def = data.Map(mapKey) ?? (data.Maps.Length > 0 ? data.Maps[0] : null);
            if (Def == null) throw new ArgumentException("没有任何地图数据", nameof(mapKey));

            var t = data.Config.TILE;
            Width = Def.w * t;
            Height = Def.h * t;

            foreach (var b in Def.blocks)
            {
                Blocks.Add(new BlockRect { x = b.x * t, y = b.y * t, w = b.w * t, h = b.h * t });
            }
            if (Def.portals != null)
            {
                foreach (var p in Def.portals)
                {
                    Portals.Add(new PortalInstance
                    {
                        to = p.to,
                        x = p.x * t + t / 2.0,
                        y = p.y * t + t / 2.0,
                        r = t * 0.9,
                    });
                }
            }
            foreach (var n in data.NpcsOnMap(Def.key))
            {
                Npcs.Add(new NpcInstance { def = n, x = n.x * t + t / 2.0, y = n.y * t + t / 2.0, r = 20 });
            }

            // 开场就把怪铺满，不让玩家进图先看半分钟空地
            var count = Math.Min(Def.count, data.Config.MAX_ALIVE);
            for (var i = 0; i < count; i++) SpawnOne();
            if (Def.boss != null && Def.boss.present) SpawnBoss();
        }

        // ── 碰撞 ──────────────────────────────────────────────

        /// <summary>点是否落在障碍或地图外（r 是实体半径）</summary>
        public bool Blocked(double x, double y, double r)
        {
            if (x - r < 0 || y - r < 0 || x + r > Width || y + r > Height) return true;
            for (var i = 0; i < Blocks.Count; i++)
            {
                var b = Blocks[i];
                if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
            }
            return false;
        }

        /// <summary>
        /// 带滑墙的移动：整体走不动就拆成两个轴分别试，
        /// 这样贴着墙斜着走不会被卡死。
        /// </summary>
        public Vec2 Move(double x, double y, double dx, double dy, double r)
        {
            if (!Blocked(x + dx, y + dy, r)) return new Vec2(x + dx, y + dy);

            var nx = x;
            var ny = y;
            if (!Blocked(x + dx, y, r)) nx = x + dx;
            if (!Blocked(nx, y + dy, r)) ny = y + dy;
            return new Vec2(nx, ny);
        }

        /// <summary>在图里找一个不压墙的随机点，尽量离 (awayX, awayY) 远一些</summary>
        public Vec2 FindSpot(double r, double awayX, double awayY, double minDist)
        {
            for (var i = 0; i < 60; i++)
            {
                var x = rng.Range(r + 8, Width - r - 8);
                var y = rng.Range(r + 8, Height - r - 8);
                if (Blocked(x, y, r)) continue;
                if (minDist > 0 && Geometry.Dist(x, y, awayX, awayY) < minDist) continue;
                return new Vec2(x, y);
            }
            return new Vec2(Width / 2, Height / 2);
        }

        // ── 刷怪 ──────────────────────────────────────────────

        MonsterInstance MakeMonster(ZxMonster def, double x, double y)
        {
            return new MonsterInstance
            {
                uid = Uid.Next(),
                def = def,
                x = x,
                y = y,
                homeX = x,
                homeY = y,
                hp = def.maxHp,
                maxHp = def.maxHp,
                state = "idle",
                atkCd = rng.Range(0, def.atkMs),
                wanderCd = rng.Range(500, 2600),
            };
        }

        public MonsterInstance SpawnOne()
        {
            var table = Def.spawns;
            if (table == null || table.Length == 0) return null;
            if (Monsters.Count >= data.Config.MAX_ALIVE) return null;

            var weights = new double[table.Length];
            for (var i = 0; i < table.Length; i++) weights[i] = table[i].weight;
            var pick = WeightedPick.Pick(table, weights, rng);

            var def = data.Monster(pick.id);
            if (def == null) return null;

            var t = data.Config.TILE;
            var spot = FindSpot(def.radius, Def.start.x * t, Def.start.y * t, 260);
            var m = MakeMonster(def, spot.X, spot.Y);
            Monsters.Add(m);
            return m;
        }

        public MonsterInstance SpawnBoss()
        {
            var b = Def.boss;
            if (b == null || !b.present) return null;

            var def = data.Monster(b.id);
            if (def == null) return null;

            var t = data.Config.TILE;
            var m = MakeMonster(def, b.x * t + t / 2.0, b.y * t + t / 2.0);
            m.isBoss = true;
            Monsters.Add(m);
            BossDead = false;
            return m;
        }

        // ── 查询 ──────────────────────────────────────────────

        /// <summary>离 (x,y) 最近的活怪，超过 maxDist 就返回 null</summary>
        public MonsterInstance Nearest(double x, double y, double maxDist)
        {
            MonsterInstance best = null;
            var bestD = maxDist * maxDist;
            for (var i = 0; i < Monsters.Count; i++)
            {
                var m = Monsters[i];
                if (m.dead) continue;
                var d = Geometry.Dist2(x, y, m.x, m.y);
                if (d >= bestD) continue;
                bestD = d;
                best = m;
            }
            return best;
        }

        /// <summary>
        /// 圆形范围内的所有活怪。AOE、弹道、扇形的命中判定都从这里出去。
        ///
        /// 判据是圆与圆相交：两心距 ≤ 半径之和，平方形式是 (r + mr)²。
        /// 写成 r² + mr² 是错的——少了 2·r·mr 这一项，体型越大的怪缩水越多，
        /// 表现就是"贴着首领放大招却打空"。
        /// </summary>
        public List<MonsterInstance> InRadius(double x, double y, double r)
        {
            var out_ = new List<MonsterInstance>();
            for (var i = 0; i < Monsters.Count; i++)
            {
                var m = Monsters[i];
                if (m.dead) continue;
                var reach = r + m.def.radius;
                if (Geometry.Dist2(x, y, m.x, m.y) <= reach * reach) out_.Add(m);
            }
            return out_;
        }

        /// <summary>离玩家最近的可交互对象（NPC / 传送门）</summary>
        public Interactable FindInteractable(double x, double y)
        {
            Interactable best = null;
            var bestD = 70.0 * 70.0;

            for (var i = 0; i < Npcs.Count; i++)
            {
                var n = Npcs[i];
                var d = Geometry.Dist2(x, y, n.x, n.y);
                if (d >= bestD) continue;
                bestD = d;
                best = new Interactable { Kind = "npc", Npc = n };
            }
            for (var i = 0; i < Portals.Count; i++)
            {
                var p = Portals[i];
                var d = Geometry.Dist2(x, y, p.x, p.y);
                if (d >= bestD) continue;
                bestD = d;
                best = new Interactable { Kind = "portal", Portal = p };
            }
            return best;
        }

        // ── 掉落 ──────────────────────────────────────────────

        public void DropAt(double x, double y, string itemId, int n = 1)
        {
            Drops.Add(new DropItem
            {
                uid = Uid.Next(),
                id = itemId,
                n = n,
                x = x + rng.Range(-16, 16),
                y = y + rng.Range(-16, 16),
                life = data.Config.DROP_LIFE_MS,
                born = 0,
            });
        }

        static readonly string[] MaterialIds = { "m_neidan", "m_xuanyu", "m_xueyu", "m_huwei", "m_mojing" };

        /// <summary>
        /// 怪物死亡的掉落结算，返回给日志用的战利品列表。
        /// 金钱不落地，直接进兜。
        /// </summary>
        public List<ZxItem> RollLoot(MonsterInstance m, PlayerState player)
        {
            var out_ = new List<ZxItem>();
            var def = m.def;
            var luck = def.isBoss ? 4.0 : def.isElite ? 2.0 : 1.0;
            var cfg = data.Config;

            // 装备
            var tries = def.isBoss ? cfg.BOSS_DROPS : 1;
            var rate = cfg.DROP_GEAR * (def.isElite ? cfg.ELITE_DROP_MUL : 1);
            for (var i = 0; i < tries; i++)
            {
                // 首领必掉，所以短路掉那次摇点——JS 那边也是 `def.isBoss || U.chance(rate)`，
                // 随机数消耗个数跟着一起对齐
                if (!def.isBoss && !rng.Chance(rate)) continue;

                var gear = data.RollGear(def.lv, player.sect, luck, rng);
                if (gear == null) continue;
                DropAt(m.x, m.y, gear.id, 1);
                out_.Add(gear);
            }

            // 丹药
            if (rng.Chance(def.isElite ? 0.8 : 0.22))
            {
                string potion;
                if (def.lv >= 20) potion = rng.Chance(0.5) ? "c_dahuan" : "c_dajuling";
                else potion = rng.Chance(0.5) ? "c_xiaohuan" : "c_juling";

                var cnt = def.isBoss ? 3 : 1;
                DropAt(m.x, m.y, potion, cnt);
                out_.Add(data.Item(potion));
            }

            // 材料：从高到低找第一件等级压得住的
            if (rng.Chance(def.isElite ? 0.9 : 0.3))
            {
                ZxItem pickMat = null;
                for (var j = MaterialIds.Length - 1; j >= 0; j--)
                {
                    var mi = data.Item(MaterialIds[j]);
                    if (mi == null || mi.lv > def.lv) continue;
                    pickMat = mi;
                    break;
                }
                if (pickMat != null)
                {
                    DropAt(m.x, m.y, pickMat.id, 1);
                    out_.Add(pickMat);
                }
            }

            return out_;
        }

        // ── 每帧推进 ──────────────────────────────────────────

        public void Update(double dt, PlayerState player, IWorldHooks hooks = null)
        {
            hooks ??= NoWorldHooks.Instance;
            var cfg = data.Config;

            for (var i = Monsters.Count - 1; i >= 0; i--)
            {
                var m = Monsters[i];
                if (m.dead)
                {
                    Monsters.RemoveAt(i);
                    continue;
                }
                UpdateMonster(m, dt, player, hooks);
            }

            // 补刷：死一只，过一会儿补一只
            if (Def.spawns != null && Def.spawns.Length > 0)
            {
                spawnTimer -= dt;
                if (spawnTimer <= 0)
                {
                    spawnTimer = cfg.RESPAWN_MS / 3.0;
                    var target = Math.Min(Def.count, cfg.MAX_ALIVE);
                    var alive = 0;
                    for (var i = 0; i < Monsters.Count; i++)
                    {
                        if (!Monsters[i].isBoss) alive++;
                    }
                    if (alive < target) SpawnOne();
                }
            }

            // 首领重生
            if (BossDead && Def.boss != null && Def.boss.present)
            {
                BossTimer -= dt;
                if (BossTimer <= 0) SpawnBoss();
            }

            // 掉落物寿命
            for (var i = Drops.Count - 1; i >= 0; i--)
            {
                var d = Drops[i];
                d.born += dt;
                d.life -= dt;
                if (d.life <= 0) Drops.RemoveAt(i);
            }
        }

        void UpdateMonster(MonsterInstance m, double dt, PlayerState player, IWorldHooks hooks)
        {
            var def = m.def;
            var cfg = data.Config;

            // 持续伤害
            Combat.TickBuffs(m.buffs, dt, (amount, kind) =>
            {
                m.hp -= amount;
                m.flash = 120;
                hooks.OnDot(m, amount);
            });
            // 被灼烧 / 中毒打死也要走同一个死亡入口，
            // 否则首领的重生记账会被跳过，烧死的首领再也不会刷
            if (m.hp <= 0)
            {
                Kill(m, hooks);
                return;
            }

            if (m.flash > 0) m.flash -= dt;
            if (m.castFx > 0) m.castFx -= dt;
            if (m.atkCd > 0) m.atkCd -= dt;

            // 被定住 / 被魅惑就啥也干不了
            if (Combat.Disabled(m.buffs)) return;

            var speed = (double)def.speed;
            var slow = Combat.GetBuff(m.buffs, "slow");
            if (slow != null) speed *= 1 - (slow.amount ?? 0);

            var distToPlayer = player.dead
                ? double.PositiveInfinity
                : Geometry.Dist(m.x, m.y, player.x, player.y);
            var distHome = Geometry.Dist(m.x, m.y, m.homeX, m.homeY);

            // 太远就回家，回家路上不理人；首领不脱战
            if (!m.isBoss && distHome > cfg.LEASH_RANGE) m.state = "return";

            if (m.state == "return")
            {
                if (distHome < 24)
                {
                    m.state = "idle";
                    m.hp = m.maxHp;
                }
                else
                {
                    var back = Geometry.DirTo(m.x, m.y, m.homeX, m.homeY);
                    var rp = Move(m.x, m.y,
                        back.X * speed * 1.5 * (dt / 1000.0),
                        back.Y * speed * 1.5 * (dt / 1000.0),
                        def.radius);
                    m.x = rp.X;
                    m.y = rp.Y;
                }
                return;
            }

            var aggro = def.isBoss ? cfg.AGGRO_RANGE * 1.6 : cfg.AGGRO_RANGE;
            if (distToPlayer < aggro) m.state = "chase";
            else if (m.state == "chase" && distToPlayer > aggro * 1.6) m.state = "idle";

            if (m.state == "idle")
            {
                // 闲逛：隔一阵换个方向溜达两步
                m.wanderCd -= dt;
                if (m.wanderCd <= 0)
                {
                    m.wanderCd = rng.Range(1400, 3800);
                    var a = rng.Range(0, Math.PI * 2);
                    m.vx = Math.Cos(a);
                    m.vy = Math.Sin(a);
                    if (rng.Chance(0.4))
                    {
                        m.vx = 0;
                        m.vy = 0;
                    }
                }
                var wp = Move(m.x, m.y,
                    m.vx * speed * 0.35 * (dt / 1000.0),
                    m.vy * speed * 0.35 * (dt / 1000.0),
                    def.radius);
                m.x = wp.X;
                m.y = wp.Y;
                return;
            }

            // 追击 + 攻击
            var reach = def.attackRange + 8;
            if (distToPlayer > reach)
            {
                var dir = Geometry.DirTo(m.x, m.y, player.x, player.y);
                var np = Move(m.x, m.y,
                    dir.X * speed * (dt / 1000.0),
                    dir.Y * speed * (dt / 1000.0),
                    def.radius);
                m.x = np.X;
                m.y = np.Y;
                m.vx = dir.X;
                m.vy = dir.Y;
            }
            else if (m.atkCd <= 0)
            {
                m.atkCd = def.atkMs;
                m.castFx = 220;
                hooks.OnHitPlayer(m);
            }
        }

        /// <summary>
        /// 怪物死亡的唯一入口。不管是被打死还是被烧死都必须从这里走——
        /// 首领的重生计时就挂在这儿，绕过去的话烧死的首领再也不会刷。
        /// </summary>
        public void Kill(MonsterInstance m, IWorldHooks hooks = null)
        {
            if (m.dead) return;
            m.dead = true;
            if (m.isBoss)
            {
                BossDead = true;
                BossTimer = Def.bossRespawnMs;
            }
            (hooks ?? NoWorldHooks.Instance).OnDeath(m);
        }

        /// <summary>怪物受到伤害的统一入口，处理护盾和死亡。返回真正扣掉的血</summary>
        public double HurtMonster(MonsterInstance m, double amount, IWorldHooks hooks = null)
        {
            var real = Combat.Absorb(m.buffs, amount);
            m.hp -= real;
            m.flash = 140;
            if (m.state == "idle") m.state = "chase";
            if (m.hp <= 0) Kill(m, hooks);
            return real;
        }
    }
}
