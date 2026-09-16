using System;
using System.Collections.Generic;
using System.Linq;
using Zhuxian.Core;
using Zhuxian.Data;

namespace Zhuxian.Tests
{
    /// <summary>
    /// 战斗数值的对照测试：随机数发生器、等级曲线、属性换算、伤害公式、
    /// 增益与持续伤害、吸血闪避。对应 src/stats.js 和 src/combat.js。
    /// </summary>
    static class CombatTests
    {
        /// <summary>
        /// 先钉死随机数发生器本身。两边的 mulberry32 只要差一位，
        /// 后面所有带随机的对照都会红，却看不出根因在这儿。
        /// </summary>
        public static void RandomSequence()
        {
            Check.Group("随机数发生器", () =>
            {
                var fx = Fixtures.Load<RngFixture>("rng.json");
                Check.True(fx.values.Length > 0, "样本非空");

                var rng = new Mulberry32(fx.seed);
                for (var i = 0; i < fx.values.Length; i++)
                {
                    Check.Near(rng.Next(), fx.values[i], "第 " + i + " 个随机数", 0);
                }
            });
        }

        public static void ExpCurve(ZxConfig config)
        {
            Check.Group("等级曲线", () =>
            {
                var fx = Fixtures.Load<ExpFixture>("exp.json");
                Check.True(fx.cases.Length > 0, "样本非空");

                foreach (var c in fx.cases)
                {
                    var need = Stats.ExpToNext(c.level, config);
                    if (c.need < 0)
                    {
                        Check.Equal(need, int.MaxValue, "满级（" + c.level + "）不再给经验需求");
                    }
                    else
                    {
                        Check.Equal(need, c.need, c.level + " 级升级所需经验");
                    }
                }

                // 顺带和导出的经验表对一遍：公式和查表两条路必须同一个答案
                for (var lv = 1; lv < config.MAX_LEVEL; lv++)
                {
                    Check.Equal(Stats.ExpToNext(lv, config), config.expToNext[lv - 1],
                        lv + " 级：公式算的 == config.expToNext 表里的");
                }
            });
        }

        public static void Derive(ZxSect[] sects)
        {
            Check.Group("属性换算", () =>
            {
                var fx = Fixtures.Load<DeriveFixture>("derive.json");
                Check.True(fx.cases.Length > 0, "样本非空");

                var byKey = sects.ToDictionary(s => s.key);
                foreach (var c in fx.cases)
                {
                    var s = Stats.Derive(c.level, c.@base.ToCore(), byKey[c.sect]);
                    var tag = c.sect + " " + c.level + " 级";
                    Check.Near(s.hp, c.expect.hp, tag + " 气血");
                    Check.Near(s.mp, c.expect.mp, tag + " 灵力");
                    Check.Near(s.atk, c.expect.atk, tag + " 攻击");
                    Check.Near(s.mag, c.expect.mag, tag + " 法力");
                    Check.Near(s.def, c.expect.def, tag + " 防御");
                    Check.Near(s.mdef, c.expect.mdef, tag + " 法防");
                    Check.Near(s.crit, c.expect.crit, tag + " 暴击");
                    Check.Near(s.dodge, c.expect.dodge, tag + " 闪避");
                    Check.Near(s.expBonus, c.expect.expBonus, tag + " 悟性加成");
                }
            });
        }

        public static void Damage(ZxConfig config)
        {
            Check.Group("伤害公式", () =>
            {
                var fx = Fixtures.Load<DamageFixture>("damage.json");
                Check.True(fx.cases.Length > 0, "样本非空");

                var critMismatch = 0;
                foreach (var c in fx.cases)
                {
                    // 用同一个种子重放这条样本在 JS 侧用掉的随机数
                    var counting = new CountingRng(new Mulberry32(c.seed));
                    var r = Combat.Damage(
                        c.atk, c.def, c.kind, c.power,
                        new Combat.DamageOptions
                        {
                            CritRate = c.critRate,
                            LevelGap = c.levelGap,
                            IgnoreDef = c.ignoreDef,
                        },
                        config, counting);

                    var tag = "伤害 atk=" + c.atk + " def=" + c.def + " " + c.kind;
                    Check.Equal(r.Amount, c.expect.amount, tag);
                    if (r.Crit != c.expect.crit) critMismatch++;
                    Check.Equal(r.Crit, c.expect.crit, tag + " 暴击判定");

                    // 随机数消耗个数也要一致：暴击没触发时该不该多消耗一个，
                    // 两边不一样的话，单看某一条结果可能碰巧相同，连着打就全歪了
                    Check.Equal(counting.Count, c.randomsUsed, tag + " 随机数消耗个数");
                }
                Check.True(critMismatch == 0, "暴击判定整体一致", critMismatch + " 条对不上");
            });
        }

        public static void Buffs()
        {
            Check.Group("增益与持续伤害", () =>
            {
                var fx = Fixtures.Load<BuffFixture>("buffs.json");
                Check.True(fx.cases.Length > 0, "样本非空");

                foreach (var c in fx.cases)
                {
                    switch (c.name)
                    {
                        case "同名刷新取更强":
                        {
                            var buffs = new List<Buff>();
                            Combat.AddBuff(buffs, new Buff { kind = "atkUp", ms = 3000, amount = 0.2 });
                            Combat.AddBuff(buffs, new Buff { kind = "atkUp", ms = 1000, amount = 0.35 });
                            Combat.AddBuff(buffs, new Buff { kind = "shield", ms = 5000, value = 120 });
                            AssertBuffs(buffs, c.buffs, c.name);
                            break;
                        }
                        case "灼烧攒够1点才结算":
                        {
                            var buffs = new List<Buff> { new Buff { kind = "burn", ms = 5000, dps = 6 } };
                            for (var i = 0; i < c.ticks.Length; i++)
                            {
                                var r = Combat.TickBuffs(buffs, 100, null);
                                Check.Equal(r.Dot, c.ticks[i].dot, c.name + " 第 " + i + " 帧伤害");
                                Check.Equal(r.Expired, c.ticks[i].expired, c.name + " 第 " + i + " 帧过期数");
                            }
                            AssertBuffs(buffs, c.buffs, c.name);
                            break;
                        }
                        case "护盾吸收":
                        {
                            var buffs = new List<Buff> { new Buff { kind = "shield", ms = 9000, value = 100 } };
                            var hits = new[] { 30.0, 40.0, 50.0, 20.0, 10.0 };
                            for (var i = 0; i < hits.Length; i++)
                            {
                                Check.Near(Combat.Absorb(buffs, hits[i]), c.through[i],
                                    c.name + " 第 " + i + " 下穿透伤害");
                            }
                            AssertBuffs(buffs, c.buffs, c.name);
                            break;
                        }
                        case "部分过期也要报 expired":
                        {
                            var buffs = new List<Buff>
                            {
                                new Buff { kind = "atkUp", ms = 200, amount = 0.3 },
                                new Buff { kind = "shield", ms = 5000, value = 80 },
                            };
                            for (var i = 0; i < c.ticks.Length; i++)
                            {
                                var r = Combat.TickBuffs(buffs, 150, null);
                                Check.Equal(r.Dot, c.ticks[i].dot, c.name + " 第 " + i + " 次 dot");
                                Check.Equal(r.Expired, c.ticks[i].expired, c.name + " 第 " + i + " 次 expired");
                            }
                            AssertBuffs(buffs, c.buffs, c.name);
                            break;
                        }
                        default:
                            Check.True(false, "样本 " + c.name + " 没有对应的测试分支");
                            break;
                    }
                }
            });
        }

        public static void AssertBuffs(List<Buff> actual, BuffSnapshot[] expected, string tag)
        {
            Check.Equal(actual.Count, expected.Length, tag + " 剩余 buff 个数");
            var n = Math.Min(actual.Count, expected.Length);
            for (var i = 0; i < n; i++)
            {
                var a = actual[i];
                var e = expected[i];
                Check.True(a.kind == e.kind, tag + " 第 " + i + " 个 buff 类型",
                    "期望 " + e.kind + "，实得 " + a.kind);
                Check.Near(a.ms, e.ms, tag + " 第 " + i + " 个 buff 剩余时长");
                Check.Near(a.frac, e.frac, tag + " 第 " + i + " 个 buff 伤害余数", 1e-9);
                Check.Near(a.amount ?? 0, e.amount ?? 0, tag + " 第 " + i + " 个 buff amount");
                Check.Near(a.value ?? 0, e.value ?? 0, tag + " 第 " + i + " 个 buff value");
                Check.Near(a.dps ?? 0, e.dps ?? 0, tag + " 第 " + i + " 个 buff dps");
            }
        }

        public static void Misc()
        {
            Check.Group("吸血与闪避", () =>
            {
                var fx = Fixtures.Load<MiscFixture>("misc.json");
                Check.True(fx.lifesteal.Length > 0 && fx.dodge.Length > 0, "样本非空");

                foreach (var c in fx.lifesteal)
                {
                    Check.Equal(Combat.Lifesteal(c.rate, c.dealt), c.expect,
                        "吸血 rate=" + c.rate + " dealt=" + c.dealt);
                }

                foreach (var c in fx.dodge)
                {
                    var counting = new CountingRng(new Mulberry32(c.seed));
                    Check.Equal(Combat.Dodged(c.rate, counting), c.expect, "闪避 rate=" + c.rate);
                    // rate 为 0 时 JS 会短路掉、不摇随机数，这里也不该摇
                    Check.Equal(counting.Count, c.rate > 0 ? 1 : 0,
                        "闪避 rate=" + c.rate + " 的随机数消耗");
                }
            });
        }

    }
}
