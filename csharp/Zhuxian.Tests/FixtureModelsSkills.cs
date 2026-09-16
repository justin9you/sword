namespace Zhuxian.Tests
{
    // 技能对照样本的形状。字段名和 tools/fixture-cases.mjs 的 buildSkills 一一对应。

    public class SkillsFixture
    {
        public CastFailure[] failures;
        public CastCase[] casts;
        public FlightCase[] flights;
        public BasicCase[] basics;
        public TalismanCase[] talismans;
        public UpkeepCase[] upkeep;
    }

    public class CastFailure
    {
        public string step;
        public string skillKey;
        public bool ok;
        /// <summary>给玩家看的那句人话，必须一字不差</summary>
        public string msg;
    }

    public class CastCase
    {
        public uint seed;
        public string sect;
        public string skillKey;
        public string kind;
        public bool ok;
        public string msg;
        /// <summary>这一次释放摇了几个随机数</summary>
        public int randomsUsed;
        public SkillPlayerSnapshot player;
        public SkillMonsterSnapshot[] monsters;
        public BoltSnapshot[] bolts;
        public VisualSnapshot[] visuals;
        public GameEvent[] events;
    }

    public class SkillPlayerSnapshot
    {
        public double hp;
        public double mp;
        public double swingMs;
        public double atk;
        public double def;
        public string[] buffs;
    }

    public class SkillMonsterSnapshot
    {
        public string id;
        public double hp;
        public double x;
        public double y;
        public bool dead;
        public BuffSnapshotLite[] buffs;
    }

    public class BuffSnapshotLite
    {
        public string kind;
        public double ms;
        public double dps;
        public double amount;
    }

    public class BoltSnapshot
    {
        public string kind;
        public double x;
        public double y;
        public double dx;
        public double dy;
        public double speed;
        public double left;
        public double width;
    }

    public class VisualSnapshot
    {
        public string kind;
        public double r;
        public double ms;
    }

    /// <summary>逻辑层往外抛的一个事件：飘字 / 音效 / 日志 / 释放 / 死亡</summary>
    public class GameEvent
    {
        public string kind;
        public double amount;
        public string tag;
    }

    public class FlightCase
    {
        public uint seed;
        public string skillKey;
        public string kind;
        public int randomsUsed;
        public SkillMonsterSnapshot[] monsters;
        public BoltSnapshot[] bolts;
        public int visuals;
        public GameEvent[] events;
    }

    public class BasicCase
    {
        public uint seed;
        public bool hit;
        public int randomsUsed;
        public double facingX;
        public double facingY;
        public SkillMonsterSnapshot[] monsters;
        public GameEvent[] events;
    }

    public class TalismanCase
    {
        public uint seed;
        public string itemId;
        public string activeKind;
        public bool ok;
        public string msg;
        public int randomsUsed;
        public SkillPlayerSnapshot player;
        public SkillMonsterSnapshot[] monsters;
        public GameEvent[] events;
    }

    public class UpkeepCase
    {
        public double dt;
        public double cd;
        public int bolts;
        public int visuals;
    }
}
