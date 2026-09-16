using System;
using System.Collections.Generic;
using System.Linq;

namespace Zhuxian.Core
{
    /// <summary>任务进度的存档形态</summary>
    [Serializable]
    public class QuestSave
    {
        /// <summary>当前这条的 key；全做完了是 null</summary>
        public string current;
        public double? progress;
        public string[] done;
    }

    /// <summary>
    /// 一份存档。只放「不可再生」的数据：等级、加点、背包 id、任务进度。
    /// 属性、技能列表这些能算出来的一律不存——改了数值表，老存档也不会崩。
    ///
    /// 数值字段用 double? 而不是 int：要能表达「这个字段压根不在存档里」。
    /// 缺字段和字段为 0 得分得开，不然旧存档读进来会被当成 0 级 0 血。
    /// </summary>
    [Serializable]
    public class SaveData
    {
        public int v = 1;
        public string name;
        public string sect;
        public double? level;
        public double? exp;
        public double? gold;
        public double? points;
        public BaseStats @base;
        public BagSlot[] bag;
        public Equipment equip;
        public string map;
        public double? hp;
        public double? mp;
        public QuestSave quest;
        public string[] visited;
        public double? kills;
        public double? deaths;
        public double? playMs;
        /// <summary>存档时间戳（Unix 毫秒）</summary>
        public long at;
    }

    /// <summary>标题页「继续游戏」要显示的摘要</summary>
    public class SaveSummary
    {
        public string Name;
        /// <summary>门派名，不是 key</summary>
        public string Sect;
        public int Level;
        /// <summary>地图名，不是 key</summary>
        public string Map;
    }

    /// <summary>
    /// 存档落在哪儿由宿主决定：网页版是 localStorage，Unity 可以是
    /// PlayerPrefs 或文件，测试里就是内存。Core 不关心，也不该关心。
    ///
    /// 实现方要自己兜住异常（磁盘满、无痕模式、权限不足），
    /// 读不到就返回 null，写不进就返回 false——不要往上抛，
    /// 存档失败不该打断游戏。
    /// </summary>
    public interface ISaveStorage
    {
        SaveData Read();
        bool Write(SaveData data);
        void Clear();
    }

    /// <summary>
    /// 存档的序列化与校验。移植自 src/save.js 里与存储无关的那一半。
    ///
    /// Deserialize 是这里的重点：存档可能来自旧版本，也可能被人手改坏了，
    /// 所以逐字段校验、越界就钳、认不出来就丢掉，绝不让坏数据进到游戏里。
    /// </summary>
    public static class Save
    {
        public static SaveData Serialize(PlayerState p)
        {
            return new SaveData
            {
                v = 1,
                name = p.name,
                sect = p.sect,
                level = p.level,
                exp = p.exp,
                gold = p.gold,
                points = p.points,
                @base = p.@base.Clone(),
                bag = p.bag.Select(s => s?.Clone()).ToArray(),
                equip = p.equip.Clone(),
                map = p.map,
                hp = JsMath.Round(p.hp),
                mp = JsMath.Round(p.mp),
                quest = new QuestSave
                {
                    current = p.quest.current,
                    progress = p.quest.progress,
                    done = p.quest.done.ToArray(),
                },
                visited = p.visited.ToArray(),
                kills = p.kills,
                deaths = p.deaths,
                playMs = JsMath.Round(p.playMs),
                at = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            };
        }

        /// <summary>
        /// 读档：逐字段校验后灌进一个新建的角色。
        /// 存档缺了关键信息（门派 / 名字）就返回 null，当没有存档处理。
        /// </summary>
        public static PlayerState Deserialize(GameData data, SaveData raw)
        {
            if (raw == null) return null;
            if (string.IsNullOrEmpty(raw.sect) || string.IsNullOrEmpty(raw.name)) return null;

            var cfg = data.Config;
            var p = Player.Create(data, Truncate(raw.name, 12), raw.sect);

            p.level = ClampInt(raw.level, 1, cfg.MAX_LEVEL);
            p.exp = (int)Math.Max(0, Num(raw.exp));
            p.gold = (int)Math.Max(0, Num(raw.gold));
            p.points = (int)Math.Max(0, Num(raw.points));

            if (raw.@base != null)
            {
                foreach (var k in Stats.BaseKeys)
                {
                    p.@base.Set(k, ClampInt(raw.@base.Get(k), 0, 9999));
                }
            }

            // 背包：格子数以当前配置为准，认不出来的物品 id 直接丢掉
            var bag = Inventory.EmptyBag(data);
            if (raw.bag != null)
            {
                for (var i = 0; i < bag.Length && i < raw.bag.Length; i++)
                {
                    var s = raw.bag[i];
                    if (s == null || data.Item(s.id) == null) continue;
                    bag[i] = new BagSlot(s.id, ClampInt(s.n, 1, cfg.STACK_MAX));
                }
            }
            p.bag = bag;

            // 装备：校验物品存在、槽位对得上、穿得起
            var equip = Inventory.EmptyEquip();
            if (raw.equip != null)
            {
                foreach (var slotKey in data.SlotKeys)
                {
                    var item = data.Item(raw.equip.Get(slotKey));
                    if (item == null || item.slot != slotKey) continue;
                    if (!data.CanEquip(item, p.sect, p.level)) continue;
                    equip.Set(slotKey, item.id);
                }
            }
            p.equip = equip;

            p.map = (data.Map(raw.map) ?? data.Maps[0]).key;
            p.visited = raw.visited != null ? new HashSet<string>(raw.visited) : new HashSet<string> { "caomiao" };
            p.visited.Add(p.map);

            if (raw.quest != null)
            {
                var cur = raw.quest.current;
                p.quest = new QuestProgress
                {
                    // current 明确是 null 表示主线全做完了，要保住这个状态；
                    // 只有"指向一条不存在的任务"才退回开头
                    current = cur == null ? null : (data.Quest(cur) != null ? cur : "q1"),
                    progress = (int)Math.Max(0, Num(raw.quest.progress)),
                    done = raw.quest.done != null ? new HashSet<string>(raw.quest.done) : new HashSet<string>(),
                };
            }

            p.kills = (int)Math.Max(0, Num(raw.kills));
            p.deaths = (int)Math.Max(0, Num(raw.deaths));
            p.playMs = Math.Max(0, Num(raw.playMs));

            Player.Recompute(data, p);

            // 存档里没记血量（旧版本存档、字段被删）时要当满血处理。
            // 不能图省事写 ClampInt(raw.hp, 1, max)——那样缺字段会被钳成 1，
            // 玩家一读档就剩一滴血，出门就死。
            p.hp = raw.hp.HasValue ? ClampInt(raw.hp, 1, (int)p.stats.hp) : p.stats.hp;
            p.mp = raw.mp.HasValue ? ClampInt(raw.mp, 0, (int)p.stats.mp) : p.stats.mp;
            return p;
        }

        /// <summary>摘要，给标题页的「继续游戏」按钮显示</summary>
        public static SaveSummary Summarize(GameData data, SaveData raw)
        {
            if (raw == null || string.IsNullOrEmpty(raw.sect)) return null;
            return new SaveSummary
            {
                Name = raw.name,
                Sect = data.Sect(raw.sect).name,
                Level = ClampInt(raw.level, 1, data.Config.MAX_LEVEL),
                Map = (data.Map(raw.map) ?? data.Maps[0]).name,
            };
        }

        // ── 校验小工具。和 save.js 里的同名函数逐行对齐 ──

        static double Num(double? v)
        {
            return v.HasValue && !double.IsNaN(v.Value) && !double.IsInfinity(v.Value) ? v.Value : 0;
        }

        static int ClampInt(double? v, int lo, int hi)
        {
            if (!v.HasValue || double.IsNaN(v.Value) || double.IsInfinity(v.Value)) return lo;
            return (int)Math.Max(lo, Math.Min(hi, Math.Floor(v.Value)));
        }

        static int ClampInt(int v, int lo, int hi)
        {
            return Math.Max(lo, Math.Min(hi, v));
        }

        static string Truncate(string s, int max)
        {
            return s.Length <= max ? s : s.Substring(0, max);
        }
    }
}
