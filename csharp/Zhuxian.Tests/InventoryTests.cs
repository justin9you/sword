using System.Linq;
using Zhuxian.Core;

namespace Zhuxian.Tests
{
    /// <summary>
    /// 背包与装备栏的对照测试。对应 src/inventory.js。
    ///
    /// 挑的都是"翻译时容易写歪"的分支：堆叠上限、跨格扣除、不够扣时整个不动、
    /// 背包满了塞不下、换装备时旧的回到刚空出来那一格。
    /// </summary>
    static class InventoryTests
    {
        public static void Run(GameData data)
        {
            Check.Group("背包与装备", () =>
            {
                var fx = Fixtures.Load<InventoryFixture>("inventory.json");
                Check.True(fx.cases.Length > 0, "样本非空");

                foreach (var c in fx.cases)
                {
                    switch (c.name)
                    {
                        case "堆叠超过上限要开新格":
                        {
                            var r = Inventory.Add(data, Inventory.EmptyBag(data), "c_xiaohuan", 250);
                            Check.Equal(r.Added, c.added, c.name + " 放进去的数量");
                            AssertBag(r.Bag, c.bag, c.name);
                            break;
                        }
                        case "往已有的半堆里加":
                        {
                            var bag = Inventory.Add(data, Inventory.EmptyBag(data), "c_xiaohuan", 50).Bag;
                            var r = Inventory.Add(data, bag, "c_xiaohuan", 60);
                            Check.Equal(r.Added, c.added, c.name + " 放进去的数量");
                            Check.Equal(Inventory.Count(r.Bag, "c_xiaohuan"), c.count, c.name + " 总数");
                            AssertBag(r.Bag, c.bag, c.name);
                            break;
                        }
                        case "多个半堆按顺序填满":
                        {
                            var bag = Inventory.Add(data, Inventory.EmptyBag(data), "c_xiaohuan", 250).Bag;
                            bag = Inventory.RemoveAt(bag, 0, 60);
                            var r = Inventory.Add(data, bag, "c_xiaohuan", 100);
                            Check.Equal(r.Added, c.added, c.name + " 放进去的数量");
                            Check.Equal(Inventory.Count(r.Bag, "c_xiaohuan"), c.count, c.name + " 总数");
                            AssertBag(r.Bag, c.bag, c.name);
                            break;
                        }
                        case "装备不堆叠，一格一件":
                        {
                            var r = Inventory.Add(data, Inventory.EmptyBag(data), "w_chaidao", 3);
                            Check.Equal(r.Added, c.added, c.name + " 放进去的数量");
                            AssertBag(r.Bag, c.bag, c.name);
                            break;
                        }
                        case "背包满了 added 要小于请求数":
                        {
                            var r = Inventory.Add(data, Inventory.EmptyBag(data), "w_chaidao", data.Config.BAG_SIZE + 10);
                            Check.Equal(r.Added, c.added, c.name + " 放进去的数量");
                            Check.Equal(Inventory.IsFull(r.Bag), c.full, c.name + " 背包是否已满");
                            AssertBag(r.Bag, c.bag, c.name);
                            break;
                        }
                        case "跨格扣除":
                        {
                            var bag = Inventory.Add(data, Inventory.EmptyBag(data), "c_xiaohuan", 150).Bag;
                            var after = Inventory.RemoveById(bag, "c_xiaohuan", 120);
                            Check.True(after != null, c.name + " 不该返回 null");
                            if (after == null) break;
                            Check.Equal(Inventory.Count(after, "c_xiaohuan"), c.count, c.name + " 剩余数量");
                            AssertBag(after, c.bag, c.name);
                            break;
                        }
                        case "不够扣时返回 null":
                        {
                            var bag = Inventory.Add(data, Inventory.EmptyBag(data), "c_xiaohuan", 5).Bag;
                            var after = Inventory.RemoveById(bag, "c_xiaohuan", 9);
                            Check.Equal(after == null, c.removeByIdWasNull, c.name);
                            AssertBag(bag, c.bag, c.name + "（原背包不该被动过）");
                            break;
                        }
                        case "扣光后格子要变空":
                        {
                            var bag = Inventory.Add(data, Inventory.EmptyBag(data), "c_xiaohuan", 3).Bag;
                            var after = Inventory.RemoveAt(bag, 0, 3);
                            Check.Equal(Inventory.FirstEmpty(after), c.firstEmpty, c.name + " 第一个空格位置");
                            AssertBag(after, c.bag, c.name);
                            break;
                        }
                        case "换装备时旧的回到原格":
                        {
                            var bag = Inventory.Add(data, Inventory.EmptyBag(data), "w_chaidao", 1).Bag;
                            bag = Inventory.Add(data, bag, "w_qingyunjian", 1).Bag;

                            var e1 = Inventory.Equip(data, bag, Inventory.EmptyEquip(), 0, "qingyun", 10);
                            Check.True(e1 != null, c.name + " 第一次穿装备不该失败");
                            if (e1 == null) break;

                            var e2 = Inventory.Equip(data, e1.Bag, e1.Equip, 1, "qingyun", 10);
                            Check.True(e2 != null, c.name + " 第二次穿装备不该失败");
                            if (e2 == null) break;

                            Check.True((e2.Replaced?.id) == c.replacedId, c.name + " 换下来的那件",
                                "期望 " + c.replacedId + "，实得 " + e2.Replaced?.id);
                            AssertBag(e2.Bag, c.bag, c.name);
                            AssertEquip(e2.Equip, c.equip, c.name);
                            break;
                        }
                        case "等级不够穿不上":
                        {
                            var bag = Inventory.Add(data, Inventory.EmptyBag(data), "w_qingyunjian", 1).Bag;
                            var e = Inventory.Equip(data, bag, Inventory.EmptyEquip(), 0, "qingyun", 1);
                            Check.Equal(e == null, c.equipWasNull, c.name);
                            AssertBag(bag, c.bag, c.name + "（原背包不该被动过）");
                            break;
                        }
                        case "背包满了脱不下装备":
                        {
                            var bag = Inventory.Add(data, Inventory.EmptyBag(data), "c_xiaohuan", 99 * data.Config.BAG_SIZE).Bag;
                            var equip = Inventory.EmptyEquip();
                            equip.weapon = "w_chaidao";
                            var u = Inventory.Unequip(data, bag, equip, "weapon");
                            Check.Equal(Inventory.IsFull(bag), c.full, c.name + " 背包是否已满");
                            Check.Equal(u == null, c.unequipWasNull, c.name);
                            break;
                        }
                        case "全身装备属性合计":
                        {
                            var equip = Inventory.EmptyEquip();
                            equip.weapon = "w_qingyunjian";
                            equip.robe = "a_qingyunpao";
                            equip.boots = "s_caoxie";
                            var s = Inventory.EquipStats(data, equip);
                            AssertStats(s, c.stats, c.name);
                            break;
                        }
                        default:
                            Check.True(false, "样本「" + c.name + "」没有对应的测试分支");
                            break;
                    }
                }
            });
        }

        static void AssertBag(BagSlot[] actual, BagSlotSnapshot[] expected, string tag)
        {
            Check.Equal(actual.Length, expected.Length, tag + " 背包格数");
            var n = System.Math.Min(actual.Length, expected.Length);
            for (var i = 0; i < n; i++)
            {
                var a = actual[i];
                var e = expected[i];
                if (e == null)
                {
                    Check.True(a == null, tag + " 第 " + i + " 格应为空",
                        a == null ? null : "实得 " + a.id + "×" + a.n);
                    continue;
                }
                if (a == null)
                {
                    Check.True(false, tag + " 第 " + i + " 格不该为空", "期望 " + e.id + "×" + e.n);
                    continue;
                }
                Check.True(a.id == e.id && a.n == e.n, tag + " 第 " + i + " 格",
                    "期望 " + e.id + "×" + e.n + "，实得 " + a.id + "×" + a.n);
            }
        }

        static void AssertEquip(Equipment actual, EquipSnapshot expected, string tag)
        {
            Check.True(actual.weapon == expected.weapon, tag + " 兵器槽", Diff(expected.weapon, actual.weapon));
            Check.True(actual.talisman == expected.talisman, tag + " 法宝槽", Diff(expected.talisman, actual.talisman));
            Check.True(actual.robe == expected.robe, tag + " 衣袍槽", Diff(expected.robe, actual.robe));
            Check.True(actual.bracer == expected.bracer, tag + " 护腕槽", Diff(expected.bracer, actual.bracer));
            Check.True(actual.boots == expected.boots, tag + " 靴履槽", Diff(expected.boots, actual.boots));
            Check.True(actual.pendant == expected.pendant, tag + " 玉佩槽", Diff(expected.pendant, actual.pendant));
        }

        static string Diff(string expected, string actual)
        {
            return "期望 " + (expected ?? "空") + "，实得 " + (actual ?? "空");
        }

        internal static void AssertStats(DerivedStats actual, DerivedExpect expected, string tag)
        {
            Check.Near(actual.hp, expected.hp, tag + " 气血");
            Check.Near(actual.mp, expected.mp, tag + " 灵力");
            Check.Near(actual.atk, expected.atk, tag + " 攻击");
            Check.Near(actual.mag, expected.mag, tag + " 法力");
            Check.Near(actual.def, expected.def, tag + " 防御");
            Check.Near(actual.mdef, expected.mdef, tag + " 法防");
            Check.Near(actual.crit, expected.crit, tag + " 暴击");
            Check.Near(actual.dodge, expected.dodge, tag + " 闪避");
            Check.Near(actual.speed, expected.speed, tag + " 移速");
            Check.Near(actual.lifesteal, expected.lifesteal, tag + " 吸血");
            Check.Near(actual.expBonus, expected.expBonus, tag + " 悟性加成");
        }
    }
}
