using System;
using System.Collections.Generic;
using Zhuxian.Data;

namespace Zhuxian.Core
{
    /// <summary>
    /// 背包里的一格。只存 id 和数量——装备没有随机词缀，
    /// 不需要把整个物品对象存进存档，改了数值表旧存档也照样能读。
    /// </summary>
    [Serializable]
    public class BagSlot
    {
        public string id;
        public int n;

        public BagSlot(string id, int n)
        {
            this.id = id;
            this.n = n;
        }

        public BagSlot Clone()
        {
            return new BagSlot(id, n);
        }
    }

    /// <summary>
    /// 装备栏。JS 那边是个按槽位 key 索引的对象，这里用具名字段 + 按 key 存取，
    /// 拼错槽位名当场抛错，不会像字典那样悄悄多出一个用不上的键。
    /// </summary>
    [Serializable]
    public class Equipment
    {
        public string weapon;
        public string talisman;
        public string robe;
        public string bracer;
        public string boots;
        public string pendant;

        public string Get(string slot)
        {
            switch (slot)
            {
                case "weapon": return weapon;
                case "talisman": return talisman;
                case "robe": return robe;
                case "bracer": return bracer;
                case "boots": return boots;
                case "pendant": return pendant;
                default: throw new ArgumentException("没有这个装备槽：" + slot, nameof(slot));
            }
        }

        public void Set(string slot, string itemId)
        {
            switch (slot)
            {
                case "weapon": weapon = itemId; break;
                case "talisman": talisman = itemId; break;
                case "robe": robe = itemId; break;
                case "bracer": bracer = itemId; break;
                case "boots": boots = itemId; break;
                case "pendant": pendant = itemId; break;
                default: throw new ArgumentException("没有这个装备槽：" + slot, nameof(slot));
            }
        }

        public Equipment Clone()
        {
            return (Equipment)MemberwiseClone();
        }
    }

    /// <summary>放东西进背包的结果</summary>
    public readonly struct AddResult
    {
        public readonly BagSlot[] Bag;
        /// <summary>真正放进去的数量。背包满了会小于请求的 n</summary>
        public readonly int Added;

        public AddResult(BagSlot[] bag, int added)
        {
            Bag = bag;
            Added = added;
        }
    }

    /// <summary>穿装备的结果</summary>
    public class EquipResult
    {
        public BagSlot[] Bag;
        public Equipment Equip;
        public ZxItem Item;
        /// <summary>被换下来的那件，没有就是 null</summary>
        public ZxItem Replaced;
    }

    /// <summary>脱装备的结果</summary>
    public class UnequipResult
    {
        public BagSlot[] Bag;
        public Equipment Equip;
    }

    /// <summary>
    /// 背包与装备栏。移植自 src/inventory.js。
    ///
    /// 所有方法都返回新数组 / 新对象，不在原地改——和 JS 侧一致。
    /// 这条不是洁癖：UI 靠比引用决定要不要重绘，就地改会让界面不刷新。
    /// </summary>
    public static class Inventory
    {
        public static BagSlot[] EmptyBag(GameData data)
        {
            return new BagSlot[data.Config.BAG_SIZE];
        }

        public static Equipment EmptyEquip()
        {
            return new Equipment();
        }

        /// <summary>背包里这件物品一共有几个</summary>
        public static int Count(BagSlot[] bag, string id)
        {
            var n = 0;
            for (var i = 0; i < bag.Length; i++)
            {
                if (bag[i] != null && bag[i].id == id) n += bag[i].n;
            }
            return n;
        }

        public static int FirstEmpty(BagSlot[] bag)
        {
            for (var i = 0; i < bag.Length; i++)
            {
                if (bag[i] == null) return i;
            }
            return -1;
        }

        public static bool IsFull(BagSlot[] bag)
        {
            return FirstEmpty(bag) < 0;
        }

        /// <summary>
        /// 放进背包：先往已有的堆里塞，塞不下再占空格。
        /// 不可堆叠的东西一格一个。
        /// </summary>
        public static AddResult Add(GameData data, BagSlot[] bag, string id, int n = 1)
        {
            var item = data.Item(id);
            if (item == null) return new AddResult(bag, 0);
            if (n <= 0) n = 1;

            var next = CloneBag(bag);
            var added = 0;
            var stackMax = data.Config.STACK_MAX;

            if (item.stackable)
            {
                for (var i = 0; i < next.Length && n > 0; i++)
                {
                    var s = next[i];
                    if (s == null || s.id != id || s.n >= stackMax) continue;
                    var room = Math.Min(stackMax - s.n, n);
                    next[i] = new BagSlot(id, s.n + room);
                    n -= room;
                    added += room;
                }
            }

            while (n > 0)
            {
                var slot = FirstEmpty(next);
                if (slot < 0) break;
                var put = item.stackable ? Math.Min(stackMax, n) : 1;
                next[slot] = new BagSlot(id, put);
                n -= put;
                added += put;
            }

            return new AddResult(next, added);
        }

        /// <summary>从指定格子拿走 n 个。格子空着或越界就原样返回</summary>
        public static BagSlot[] RemoveAt(BagSlot[] bag, int index, int n = 1)
        {
            if (index < 0 || index >= bag.Length || bag[index] == null) return bag;
            if (n <= 0) n = 1;

            var next = CloneBag(bag);
            var left = next[index].n - n;
            next[index] = left > 0 ? new BagSlot(next[index].id, left) : null;
            return next;
        }

        /// <summary>按 id 扣除 n 个（可跨格子）。不够扣就什么都不做，返回 null</summary>
        public static BagSlot[] RemoveById(BagSlot[] bag, string id, int n = 1)
        {
            if (n <= 0) n = 1;
            if (Count(bag, id) < n) return null;

            var next = CloneBag(bag);
            for (var i = 0; i < next.Length && n > 0; i++)
            {
                if (next[i] == null || next[i].id != id) continue;
                var take = Math.Min(next[i].n, n);
                var left = next[i].n - take;
                next[i] = left > 0 ? new BagSlot(id, left) : null;
                n -= take;
            }
            return next;
        }

        /// <summary>
        /// 穿装备：背包第 index 格的东西换到对应槽位，原来穿着的退回那一格。
        /// 穿不上（等级或门派不符、那格不是装备）返回 null。
        /// </summary>
        public static EquipResult Equip(
            GameData data, BagSlot[] bag, Equipment equipped, int index, string sectKey, int level)
        {
            if (index < 0 || index >= bag.Length) return null;
            var stack = bag[index];
            if (stack == null) return null;

            var item = data.Item(stack.id);
            if (!data.CanEquip(item, sectKey, level)) return null;

            var nextBag = CloneBag(bag);
            var nextEquip = equipped.Clone();

            var old = nextEquip.Get(item.slot);
            nextEquip.Set(item.slot, item.id);
            // 换下来的旧装备正好占回刚空出来的那一格
            nextBag[index] = old != null ? new BagSlot(old, 1) : null;

            return new EquipResult
            {
                Bag = nextBag,
                Equip = nextEquip,
                Item = item,
                Replaced = old != null ? data.Item(old) : null,
            };
        }

        /// <summary>脱下某个槽位，退回背包。背包满了就脱不下来，返回 null</summary>
        public static UnequipResult Unequip(GameData data, BagSlot[] bag, Equipment equipped, string slotKey)
        {
            var id = equipped.Get(slotKey);
            if (id == null) return null;
            if (IsFull(bag)) return null;

            var res = Add(data, bag, id, 1);
            var nextEquip = equipped.Clone();
            nextEquip.Set(slotKey, null);
            return new UnequipResult { Bag = res.Bag, Equip = nextEquip };
        }

        /// <summary>全身装备的属性合计</summary>
        public static DerivedStats EquipStats(GameData data, Equipment equipped)
        {
            var total = Stats.Empty();
            foreach (var slot in data.SlotKeys)
            {
                var item = data.Item(equipped.Get(slot));
                if (item != null) Stats.AddInto(total, item.stats);
            }
            return total;
        }

        /// <summary>当前装着的法宝（决定主动技第 6 格），没有就是 null</summary>
        public static ZxItem Talisman(GameData data, Equipment equipped)
        {
            return data.Item(equipped.talisman);
        }

        static BagSlot[] CloneBag(BagSlot[] bag)
        {
            var next = new BagSlot[bag.Length];
            Array.Copy(bag, next, bag.Length);
            return next;
        }
    }
}
