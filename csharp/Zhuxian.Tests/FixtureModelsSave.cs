namespace Zhuxian.Tests
{
    // 存档对照样本的形状。对应 tools/fixtures/save.mjs。

    public class SaveFixture
    {
        public RoundTripCase[] roundTrip;
        public HostileCase[] hostile;
        public SummaryCase[] summaries;
    }

    public class RoundTripCase
    {
        public string step;
        public RawSave saved;
        public SavedPlayerSnapshot before;
        public SavedPlayerSnapshot after;
    }

    public class HostileCase
    {
        public string step;
        public RawSave saved;
        /// <summary>为 null 表示这份存档整个作废（缺门派 / 缺名字）</summary>
        public SavedPlayerSnapshot after;
    }

    /// <summary>
    /// 样本里的原始存档。数值用 double? 才能表达「这个字段压根不在存档里」——
    /// 缺 hp 和 hp 为 0 是两回事：前者该当满血，后者该钳成 1。
    /// </summary>
    public class RawSave
    {
        public int v;
        public string name;
        public string sect;
        public double? level;
        public double? exp;
        public double? gold;
        public double? points;
        public BaseStats100 @base;
        public BagSlotSnapshot[] bag;
        public EquipSnapshot equip;
        public string map;
        public double? hp;
        public double? mp;
        public RawQuest quest;
        /// <summary>JS 那边是 {地图key: true} 的对象，导出时拍平成数组</summary>
        public string[] visited;
        public double? kills;
        public double? deaths;
        public double? playMs;
        public long at;
    }

    public class RawQuest
    {
        public string current;
        public double? progress;
        public string[] done;
    }

    public class SavedPlayerSnapshot
    {
        public string name;
        public string sect;
        public int level;
        public int exp;
        public int gold;
        public int points;
        public BaseStats100 @base;
        public double hp;
        public double mp;
        public string map;
        public string[] visited;
        public string questCurrent;
        public int questProgress;
        public string[] questDone;
        public int kills;
        public int deaths;
        public double playMs;
        public BagSlotSnapshot[] bag;
        public EquipSnapshot equip;
        public DerivedExpect stats;
    }

    public class SummaryCase
    {
        public string step;
        public string name;
        /// <summary>门派名，不是 key</summary>
        public string sect;
        public int level;
        /// <summary>地图名，不是 key</summary>
        public string map;
    }
}
