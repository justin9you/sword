// 数据库入口：把 Resources/ZhuxianData/ 下的 JSON 读进来，建好索引。
//
// 这个文件是手写的，不随数据变化——所以它只做「加载 + 查表」，不碰任何游戏规则。
// 战斗公式、掉落、技能行为还在 JS 侧（src/combat.js、src/skills.js 等），
// 移植时另起文件，别往这里塞。
//
// 由 tools/export-unity.mjs 原样拷进 export/unity/Runtime/。

using System;
using System.Collections.Generic;
using UnityEngine;

namespace Zhuxian.Data
{
    public class ZxDatabase
    {
        /// <summary>Resources 下的目录名，整个包必须放在 Assets/Resources/ZhuxianData/</summary>
        public const string ResourceDir = "ZhuxianData";

        public ZxItem[] items;
        public ZxMonster[] monsters;
        public ZxMap[] maps;
        public ZxNpc[] npcs;
        public ZxQuest[] quests;
        public ZxSect[] sects;
        public ZxConfig config;

        readonly Dictionary<string, ZxItem> itemById = new Dictionary<string, ZxItem>();
        readonly Dictionary<string, ZxMonster> monsterById = new Dictionary<string, ZxMonster>();
        readonly Dictionary<string, ZxMap> mapByKey = new Dictionary<string, ZxMap>();
        readonly Dictionary<string, ZxNpc> npcByKey = new Dictionary<string, ZxNpc>();
        readonly Dictionary<string, List<ZxNpc>> npcsByMap = new Dictionary<string, List<ZxNpc>>();
        readonly Dictionary<string, ZxQuest> questByKey = new Dictionary<string, ZxQuest>();
        readonly Dictionary<string, ZxSect> sectByKey = new Dictionary<string, ZxSect>();
        readonly Dictionary<string, ZxConfigQuality> qualityByKey = new Dictionary<string, ZxConfigQuality>();

        static ZxDatabase cached;

        /// <summary>加载一次并缓存。数据是只读的，全局共用一份就够。</summary>
        public static ZxDatabase Load()
        {
            if (cached == null)
            {
                cached = new ZxDatabase();
                cached.LoadAll();
            }
            return cached;
        }

        /// <summary>热重载 / 编辑器里改了 JSON 想立刻看到效果时用。</summary>
        public static void Clear()
        {
            cached = null;
        }

        void LoadAll()
        {
            items = Require(ReadJson<ZxItemList>("items").items, "items");
            monsters = Require(ReadJson<ZxMonsterList>("monsters").monsters, "monsters");
            maps = Require(ReadJson<ZxMapList>("maps").maps, "maps");
            npcs = Require(ReadJson<ZxNpcList>("npcs").npcs, "npcs");
            quests = Require(ReadJson<ZxQuestList>("quests").quests, "quests");
            sects = Require(ReadJson<ZxSectList>("sects").sects, "sects");
            config = ReadJson<ZxConfig>("config");
            Require(config.expToNext, "config.expToNext");

            foreach (var it in items) itemById[it.id] = it;
            foreach (var m in monsters) monsterById[m.id] = m;
            foreach (var m in maps) mapByKey[m.key] = m;
            foreach (var q in quests) questByKey[q.key] = q;
            foreach (var s in sects) sectByKey[s.key] = s;
            foreach (var q in config.quality) qualityByKey[q.key] = q;

            foreach (var n in npcs)
            {
                npcByKey[n.key] = n;
                List<ZxNpc> onMap;
                if (!npcsByMap.TryGetValue(n.map, out onMap))
                {
                    onMap = new List<ZxNpc>();
                    npcsByMap[n.map] = onMap;
                }
                onMap.Add(n);
            }
        }

        static T ReadJson<T>(string name)
        {
            var asset = Resources.Load<TextAsset>(ResourceDir + "/" + name);
            if (asset == null)
            {
                throw new InvalidOperationException(
                    "读不到 Resources/" + ResourceDir + "/" + name + ".json ——" +
                    "确认 ZhuxianData 整个目录放在了 Assets/Resources/ 下");
            }
            return JsonUtility.FromJson<T>(asset.text);
        }

        /// <summary>
        /// 空表当场报错。JSON 解析不出内容时 JsonUtility 只会给个 null 数组，
        /// 真正的崩溃要等到第一次遍历才发生，那时已经看不出是数据没读进来。
        /// </summary>
        static T[] Require<T>(T[] rows, string what)
        {
            if (rows == null || rows.Length == 0)
            {
                throw new InvalidOperationException(
                    "数据表 " + what + " 是空的 —— 对应的 JSON 没读进来或格式不对，" +
                    "重跑一次 npm run export:unity");
            }
            return rows;
        }

        // ── 查表 ──────────────────────────────────────────────
        // 查不到一律返回 null，调用方自己判。数据里的 id 拼错是接线错误，
        // 不该用一个假对象糊过去——那样错误会飘到很远的地方才炸。

        public ZxItem Item(string id) { return Get(itemById, id); }
        public ZxMonster Monster(string id) { return Get(monsterById, id); }
        public ZxMap Map(string key) { return Get(mapByKey, key); }
        public ZxNpc Npc(string key) { return Get(npcByKey, key); }
        public ZxQuest Quest(string key) { return Get(questByKey, key); }
        public ZxSect Sect(string key) { return Get(sectByKey, key); }
        public ZxConfigQuality Quality(string key) { return Get(qualityByKey, key); }

        static TValue Get<TValue>(Dictionary<string, TValue> dict, string key) where TValue : class
        {
            TValue v;
            return key != null && dict.TryGetValue(key, out v) ? v : null;
        }

        /// <summary>某张图上站着的 NPC；没有就返回空数组</summary>
        public ZxNpc[] NpcsOnMap(string mapKey)
        {
            List<ZxNpc> list;
            if (mapKey == null || !npcsByMap.TryGetValue(mapKey, out list)) return new ZxNpc[0];
            return list.ToArray();
        }

        /// <summary>主线的下一条任务；已经是最后一条就返回 null</summary>
        public ZxQuest NextQuest(string key)
        {
            var q = Quest(key);
            if (q == null) return null;
            var i = q.index + 1;
            return i < quests.Length ? quests[i] : null;
        }

        /// <summary>从 level 升到 level+1 需要的经验；满级返回 int.MaxValue</summary>
        public int ExpToNext(int level)
        {
            var i = level - 1;
            if (i < 0 || i >= config.expToNext.Length) return int.MaxValue;
            return config.expToNext[i];
        }

        /// <summary>格坐标 → 像素坐标。地图里的 x/y/w/h 一律是格。</summary>
        public float ToPixels(float tiles)
        {
            return tiles * config.TILE;
        }
    }
}
