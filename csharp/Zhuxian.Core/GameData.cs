using System;
using System.Collections.Generic;
using Zhuxian.Data;

namespace Zhuxian.Core
{
    /// <summary>
    /// 逻辑层用的数据查表。对应 JS 侧的 ZX.ITEMS / ZX.MONSTERS / ZX.SECTS…
    ///
    /// 这里只建索引，不读文件——读文件是宿主的事（Unity 走 ZxDatabase 的 Resources，
    /// 测试工程走 System.Text.Json）。Core 不碰 IO，才能既跑在 Unity 里又跑在
    /// 普通 dotnet 测试里。
    ///
    /// 查不到一律返回 null，跟 JS 的 byId 一致：id 拼错是接线错误，
    /// 不该拿一个假对象糊过去，那样错误会飘到很远的地方才炸。
    /// </summary>
    public class GameData
    {
        public ZxConfig Config { get; }
        public ZxItem[] Items { get; }
        public ZxMonster[] Monsters { get; }
        public ZxMap[] Maps { get; }
        public ZxNpc[] Npcs { get; }
        public ZxQuest[] Quests { get; }
        public ZxSect[] Sects { get; }

        /// <summary>装备槽位的 key，顺序即面板里的显示顺序</summary>
        public string[] SlotKeys { get; }

        readonly Dictionary<string, ZxItem> itemById = new Dictionary<string, ZxItem>();
        readonly Dictionary<string, ZxMonster> monsterById = new Dictionary<string, ZxMonster>();
        readonly Dictionary<string, ZxMap> mapByKey = new Dictionary<string, ZxMap>();
        readonly Dictionary<string, ZxNpc> npcByKey = new Dictionary<string, ZxNpc>();
        readonly Dictionary<string, ZxQuest> questByKey = new Dictionary<string, ZxQuest>();
        readonly Dictionary<string, ZxSect> sectByKey = new Dictionary<string, ZxSect>();
        readonly HashSet<string> gearSlots = new HashSet<string>();

        public GameData(
            ZxConfig config,
            ZxItem[] items, ZxMonster[] monsters, ZxMap[] maps,
            ZxNpc[] npcs, ZxQuest[] quests, ZxSect[] sects)
        {
            Config = config ?? throw new ArgumentNullException(nameof(config));
            Items = items ?? Array.Empty<ZxItem>();
            Monsters = monsters ?? Array.Empty<ZxMonster>();
            Maps = maps ?? Array.Empty<ZxMap>();
            Npcs = npcs ?? Array.Empty<ZxNpc>();
            Quests = quests ?? Array.Empty<ZxQuest>();
            Sects = sects ?? Array.Empty<ZxSect>();

            foreach (var it in Items) itemById[it.id] = it;
            foreach (var m in Monsters) monsterById[m.id] = m;
            foreach (var m in Maps) mapByKey[m.key] = m;
            foreach (var n in Npcs) npcByKey[n.key] = n;
            foreach (var q in Quests) questByKey[q.key] = q;
            foreach (var s in Sects) sectByKey[s.key] = s;

            SlotKeys = new string[Config.slots.Length];
            for (var i = 0; i < Config.slots.Length; i++)
            {
                SlotKeys[i] = Config.slots[i].key;
                gearSlots.Add(Config.slots[i].key);
            }
        }

        public ZxItem Item(string id) { return Lookup(itemById, id); }
        public ZxMonster Monster(string id) { return Lookup(monsterById, id); }
        public ZxMap Map(string key) { return Lookup(mapByKey, key); }
        public ZxNpc Npc(string key) { return Lookup(npcByKey, key); }
        public ZxQuest Quest(string key) { return Lookup(questByKey, key); }

        /// <summary>门派。查不到时退回第一个，对应 JS 的 ZX.sect()</summary>
        public ZxSect Sect(string key)
        {
            var s = Lookup(sectByKey, key);
            return s ?? (Sects.Length > 0 ? Sects[0] : null);
        }

        static TValue Lookup<TValue>(Dictionary<string, TValue> dict, string key) where TValue : class
        {
            TValue v;
            return key != null && dict.TryGetValue(key, out v) ? v : null;
        }

        /// <summary>是不是能穿在身上的装备（对应 ITEMS.isGear）</summary>
        public bool IsGear(ZxItem item)
        {
            return item != null && item.slot != null && gearSlots.Contains(item.slot);
        }

        /// <summary>这个门派、这个等级的人能不能穿（对应 ITEMS.canEquip）</summary>
        public bool CanEquip(ZxItem item, string sectKey, int level)
        {
            if (!IsGear(item)) return false;
            if (item.lv > level) return false;
            if (!string.IsNullOrEmpty(item.sect) && item.sect != sectKey) return false;
            return true;
        }

        /// <summary>卖价 = 标价的三成，至少 1</summary>
        public int SellPrice(ZxItem item)
        {
            return Math.Max(1, JsMath.FloorToInt(item.price * 0.3));
        }

        /// <summary>这张图上站着的 NPC</summary>
        public List<ZxNpc> NpcsOnMap(string mapKey)
        {
            var out_ = new List<ZxNpc>();
            foreach (var n in Npcs)
            {
                if (n.map == mapKey) out_.Add(n);
            }
            return out_;
        }

        /// <summary>品质对应的掉落权重。越好的越稀有。</summary>
        static double QualityWeight(string q)
        {
            switch (q)
            {
                case "common": return 10;
                case "fine": return 6;
                case "rare": return 3;
                case "epic": return 1.2;
                case "legend": return 0.35;
                default: return 0;
            }
        }

        /// <summary>
        /// luck 对各品质的作用力度。品质越高指数越大，凡品用负指数压下去。
        ///
        /// 原来除凡品外一律线性放大，等于好的坏的一起变多，
        /// 掉落里各档的相对比例一点没动——首领打完还是一堆凡品。
        /// 必须和 items.js 里的 LUCK_POW 一字不差，否则两边掉落会分叉。
        /// </summary>
        static double LuckPow(string q)
        {
            switch (q)
            {
                case "common": return -0.9;
                case "fine": return 0.3;
                case "rare": return 0.9;
                case "epic": return 1.35;
                case "legend": return 1.7;
                default: return 0;
            }
        }

        /// <summary>
        /// 掉落用：在 [level-7, level+2] 这个窗口里挑一件装备。
        /// 越靠近玩家等级越容易出；本门派专属的权重更高，免得刷一堆用不了的。
        /// luck 来自精英 / 首领，抬高好东西的权重。
        /// </summary>
        public ZxItem RollGear(int level, string sectKey, double luck, IRng rng)
        {
            var pool = new List<ZxItem>();
            var weights = new List<double>();

            foreach (var it in Items)
            {
                if (!IsGear(it)) continue;
                if (it.lv > level + 2 || it.lv < level - 7) continue;
                if (!string.IsNullOrEmpty(it.sect) && it.sect != sectKey) continue;

                // luck 为 0 时取 1，和 JS 的 Math.pow(luck || 1, pow) 对齐
                var w = QualityWeight(it.q) * Math.Pow(luck != 0 ? luck : 1.0, LuckPow(it.q));
                var sectBonus = !string.IsNullOrEmpty(it.sect) ? 1.8 : 1.0;

                pool.Add(it);
                weights.Add(w * sectBonus);
            }

            if (pool.Count == 0) return null;
            return WeightedPick.Pick(pool, weights, rng);
        }
    }
}
