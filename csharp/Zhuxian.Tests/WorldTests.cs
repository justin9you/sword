using System.Collections.Generic;
using Zhuxian.Core;

namespace Zhuxian.Tests
{
    /// <summary>
    /// 场景的对照测试。对应 src/world.js。
    ///
    /// 这块随机最多——刷怪点、闲逛方向、掉落表全靠摇点，而且是一环扣一环：
    /// 只要有一处多摇或少摇一个随机数，后面整张图就全错位。所以每段都在同一个
    /// 种子下重放，连怪的 uid、坐标、攻击冷却都逐个比。
    /// </summary>
    static class WorldTests
    {
        public static void Run(GameData data)
        {
            var fx = Fixtures.Load<WorldFixture>("world.json");

            // uid 是个全局自增计数器，样本那边从头到尾只涨不回头
            // （JS 的 seedUid(0) 只在参数更大时才抬计数器，等于空操作）。
            // 所以这里也只在最开头归零一次，之后各组按同样的顺序建图，uid 才对得上。
            Uid.Reset();

            Built(data, fx);
            Collisions(data, fx);
            Radius(data, fx);
            Ticks(data, fx);
            Loot(data, fx);
            Damage(data, fx);
        }

        /// <summary>按种子建一张图。注意不要在这里重置 uid——见 Run 里的说明</summary>
        static World Build(GameData data, IRng rng, string mapKey)
        {
            return new World(data, rng, mapKey);
        }

        static void Built(GameData data, WorldFixture fx)
        {
            Check.Group("建图", () =>
            {
                Check.True(fx.built.Length > 0, "样本非空");
                foreach (var c in fx.built)
                {
                    var rng = new CountingRng(new Mulberry32(c.seed));
                    var w = Build(data, rng, c.mapKey);
                    var tag = c.mapKey;

                    Check.Near(w.Width, c.world.w, tag + " 图宽");
                    Check.Near(w.Height, c.world.h, tag + " 图高");
                    Check.Equal(w.Blocks.Count, c.world.blocks, tag + " 障碍数量");
                    Check.Equal(w.Portals.Count, c.world.portals.Length, tag + " 传送门数量");
                    Check.Equal(w.Npcs.Count, c.world.npcs.Length, tag + " NPC 数量");

                    for (var i = 0; i < w.Portals.Count && i < c.world.portals.Length; i++)
                    {
                        var a = w.Portals[i];
                        var e = c.world.portals[i];
                        Check.True(a.to == e.to, tag + " 第 " + i + " 个传送门通往哪儿");
                        Check.Near(a.x, e.x, tag + " 第 " + i + " 个传送门 x");
                        Check.Near(a.y, e.y, tag + " 第 " + i + " 个传送门 y");
                        Check.Near(a.r, e.r, tag + " 第 " + i + " 个传送门半径");
                    }
                    for (var i = 0; i < w.Npcs.Count && i < c.world.npcs.Length; i++)
                    {
                        Check.True(w.Npcs[i].def.key == c.world.npcs[i].key, tag + " 第 " + i + " 个 NPC");
                        Check.Near(w.Npcs[i].x, c.world.npcs[i].x, tag + " 第 " + i + " 个 NPC 的 x");
                        Check.Near(w.Npcs[i].y, c.world.npcs[i].y, tag + " 第 " + i + " 个 NPC 的 y");
                    }

                    AssertMonsters(w.Monsters, c.world.monsters, tag);

                    // 随机数消耗个数：刷怪的摇点顺序错一处，整张图就全错位
                    Check.Equal(rng.Count, c.randomsUsed, tag + " 建图消耗的随机数个数");
                    Check.Equal(w.BossDead, c.world.bossDead, tag + " 首领死亡标记");
                }
            });
        }

        static void Collisions(GameData data, WorldFixture fx)
        {
            Check.Group("碰撞与滑墙", () =>
            {
                Check.True(fx.collisions.Length > 0, "样本非空");
                var w = Build(data, new Mulberry32(4100), "caomiao");

                foreach (var c in fx.collisions)
                {
                    if (c.dx == null && c.dy == null)
                    {
                        Check.Equal(w.Blocked(c.x, c.y, c.r), c.blocked,
                            "(" + c.x + "," + c.y + ") r=" + c.r + " 是否压墙");
                        continue;
                    }
                    // 整体走不动时要拆成两个轴分别试，贴着墙斜走不该卡死
                    var outp = w.Move(c.x, c.y, c.dx.Value, c.dy.Value, c.r);
                    Check.Near(outp.X, c.moveX, "从 (" + c.x + "," + c.y + ") 移动后的 x");
                    Check.Near(outp.Y, c.moveY, "从 (" + c.x + "," + c.y + ") 移动后的 y");
                }
            });
        }

        static void Radius(GameData data, WorldFixture fx)
        {
            Check.Group("圆范围命中", () =>
            {
                Check.True(fx.radius.Length > 0, "样本非空");
                var w = Build(data, new Mulberry32(4200), "caomiao");

                foreach (var c in fx.radius)
                {
                    // 判据是 (r + mr)²；写成 r² + mr² 会让体型大的怪缩水，
                    // 表现就是贴着首领放大招却打空
                    var hit = w.InRadius(c.fromX, c.fromY, c.r);
                    Check.Equal(hit.Count, c.hitUids.Length, "半径 " + c.r + " 命中数量");
                    for (var i = 0; i < hit.Count && i < c.hitUids.Length; i++)
                    {
                        Check.Equal(hit[i].uid, c.hitUids[i], "半径 " + c.r + " 第 " + i + " 个命中的 uid");
                    }

                    var near = w.Nearest(c.fromX, c.fromY, 99999);
                    Check.Equal(near?.uid ?? 0, c.nearestUid, "半径 " + c.r + " 时最近的怪");
                }
            });
        }

        static void Ticks(GameData data, WorldFixture fx)
        {
            Check.Group("推进与怪物 AI", () =>
            {
                Check.True(fx.ticks.Length > 0, "样本非空");
                foreach (var c in fx.ticks)
                {
                    // 样本那边建图用一个种子、推进用另一个，所以这里也要中途换随机源：
                    // World 只握一个 IRng，就让这个 IRng 自己可切换
                    var rng = new SwappableRng(new Mulberry32(4300));
                    var w = new World(data, rng, "caomiao");

                    var player = Player.Create(data, "测试", "qingyun");
                    player.x = w.Def.start.x * data.Config.TILE;
                    player.y = w.Def.start.y * data.Config.TILE;

                    var counting = new CountingRng(new Mulberry32(c.seed));
                    rng.Inner = counting;

                    var hooks = new RecordingHooks();
                    for (var i = 0; i < c.frames; i++) w.Update(c.dt, player, hooks);

                    var tag = "推进 " + c.frames + " 帧";
                    Check.Equal(counting.Count, c.randomsUsed, tag + " 消耗的随机数个数");
                    Check.Equal(hooks.Events.Count, c.hits.Length, tag + " 事件数量");
                    for (var i = 0; i < hooks.Events.Count && i < c.hits.Length; i++)
                    {
                        Check.Equal(hooks.Events[i], c.hits[i], tag + " 第 " + i + " 个事件");
                    }
                    AssertMonsters(w.Monsters, c.world.monsters, tag);
                    Check.Equal(w.Drops.Count, c.world.drops.Length, tag + " 地上掉落物数量");
                }
            });
        }

        static void Loot(GameData data, WorldFixture fx)
        {
            Check.Group("掉落", () =>
            {
                Check.True(fx.loot.Length > 0, "样本非空");
                foreach (var c in fx.loot)
                {
                    var rng = new Mulberry32(c.seed);
                    var w = new World(data, rng, "caomiao");

                    var player = Player.Create(data, "测试", "qingyun");
                    player.level = c.level;

                    var fake = new MonsterInstance { def = data.Monster(c.monsterId), x = 500, y = 500, uid = 999 };
                    w.Drops.Clear();
                    var got = w.RollLoot(fake, player);

                    var tag = c.monsterId + " 掉落";
                    Check.Equal(got.Count, c.got.Length, tag + " 战利品数量");
                    for (var i = 0; i < got.Count && i < c.got.Length; i++)
                    {
                        Check.True(got[i].id == c.got[i], tag + " 第 " + i + " 件",
                            "期望 " + c.got[i] + "，实得 " + got[i].id);
                    }

                    Check.Equal(w.Drops.Count, c.drops.Length, tag + " 落地物品数量");
                    for (var i = 0; i < w.Drops.Count && i < c.drops.Length; i++)
                    {
                        var a = w.Drops[i];
                        var e = c.drops[i];
                        Check.True(a.id == e.id, tag + " 落地第 " + i + " 件的 id",
                            "期望 " + e.id + "，实得 " + a.id);
                        Check.Equal(a.n, e.n, tag + " 落地第 " + i + " 件的数量");
                        // 落点带随机抖动，抖动的摇点顺序也要一致
                        Check.Near(a.x, e.x, tag + " 落地第 " + i + " 件的 x");
                        Check.Near(a.y, e.y, tag + " 落地第 " + i + " 件的 y");
                    }
                }
            });
        }

        static void Damage(GameData data, WorldFixture fx)
        {
            Check.Group("怪物受伤与死亡", () =>
            {
                Check.True(fx.damage.Length >= 3, "样本非空");
                var w = Build(data, new Mulberry32(4500), "caomiao");
                var m = w.Monsters[0];
                Combat.AddBuff(m.buffs, new Buff { kind = "shield", ms = 9000, value = 30 });

                var hooks = new RecordingHooks();
                var hits = new double[] { 50, 20, 99999 };

                for (var i = 0; i < hits.Length && i < fx.damage.Length; i++)
                {
                    var e = fx.damage[i];
                    var real = w.HurtMonster(m, hits[i], hooks);
                    Check.Near(real, e.real, e.step + " 真正扣掉的血");
                    Check.Near(m.hp, e.hp, e.step + " 剩余气血");
                    Check.True(m.state == e.state, e.step + " 状态", "期望 " + e.state + "，实得 " + m.state);
                    Check.Equal(m.dead, e.dead, e.step + " 死亡标记");
                    Check.Equal(hooks.Deaths, e.deaths, e.step + " 死亡回调次数");
                }
            });
        }

        static void AssertMonsters(List<MonsterInstance> actual, MonsterSnapshot[] expected, string tag)
        {
            Check.Equal(actual.Count, expected.Length, tag + " 怪物数量");
            var n = actual.Count < expected.Length ? actual.Count : expected.Length;
            for (var i = 0; i < n; i++)
            {
                var a = actual[i];
                var e = expected[i];
                var who = tag + " 第 " + i + " 只怪";
                Check.Equal(a.uid, e.uid, who + " 的 uid");
                Check.True(a.def.id == e.id, who + " 的种类", "期望 " + e.id + "，实得 " + a.def.id);
                Check.Near(a.x, e.x, who + " 的 x");
                Check.Near(a.y, e.y, who + " 的 y");
                Check.Near(a.homeX, e.homeX, who + " 的出生点 x");
                Check.Near(a.homeY, e.homeY, who + " 的出生点 y");
                Check.Near(a.hp, e.hp, who + " 的气血");
                Check.True(a.state == e.state, who + " 的状态", "期望 " + e.state + "，实得 " + a.state);
                Check.Near(a.atkCd, e.atkCd, who + " 的攻击冷却");
                Check.Near(a.wanderCd, e.wanderCd, who + " 的闲逛计时");
                Check.Near(a.vx, e.vx, who + " 的朝向 x");
                Check.Near(a.vy, e.vy, who + " 的朝向 y");
                Check.Equal(a.isBoss, e.isBoss, who + " 是不是首领");
            }
        }

        /// <summary>记下 World 回调过来的事件。死亡事件记成负的 uid，和样本那边对齐</summary>
        sealed class RecordingHooks : IWorldHooks
        {
            public readonly List<int> Events = new List<int>();
            public int Deaths;

            public void OnHitPlayer(MonsterInstance monster)
            {
                Events.Add(monster.uid);
            }

            public void OnDot(MonsterInstance monster, int amount)
            {
            }

            public void OnDeath(MonsterInstance monster)
            {
                Deaths++;
                Events.Add(-monster.uid);
            }
        }
    }
}
