namespace Zhuxian.Tests
{
    // 任务与场景对照样本的形状。字段名和 tools/fixture-cases.mjs 写出来的 JSON 一一对应。
    // 名字对不上时 System.Text.Json 不报错，只会留成默认值，所以每组测试都先断言条数不为 0。

    // ── 任务 ──────────────────────────────────────────────────

    public class QuestFixture
    {
        public QuestStep[] steps;
        public TurnInCase[] turnIns;
    }

    public class QuestStep
    {
        public string step;
        public string current;
        public int progress;
        public int level;
        public bool goalMet;
        public bool levelShort;
        public bool complete;
        public string giver;
        public string turnInNpc;
        public bool isGiverAtGiver;
        public bool waitingAtTurnIn;
        public bool canTurnInAtTurnIn;
        public string targetMonsterId;
        public MapHintEntry[] targetMaps;
        public int doneCount;
    }

    public class MapHintEntry
    {
        public string map;
        /// <summary>hunt 或 turnin</summary>
        public string hint;
    }

    public class TurnInCase
    {
        public string step;
        public int exp;
        public int gold;
        public string[] items;
        public int levels;
        public string[] overflow;
        public string nextKey;
        public int playerGold;
        public int playerLevel;
        public bool wasNull;
    }

    // ── 场景 ──────────────────────────────────────────────────

    public class WorldFixture
    {
        public BuiltCase[] built;
        public CollisionCase[] collisions;
        public RadiusCase[] radius;
        public TickCase[] ticks;
        public LootCase[] loot;
        public WorldDamageCase[] damage;
    }

    public class BuiltCase
    {
        public string mapKey;
        public uint seed;
        public int randomsUsed;
        public WorldSnapshot world;
    }

    public class WorldSnapshot
    {
        public string key;
        public double w;
        public double h;
        public int blocks;
        public PortalSnapshot[] portals;
        public NpcSnapshot[] npcs;
        public MonsterSnapshot[] monsters;
        public DropSnapshot[] drops;
        public bool bossDead;
        public double bossTimer;
    }

    public class PortalSnapshot
    {
        public string to;
        public double x;
        public double y;
        public double r;
    }

    public class NpcSnapshot
    {
        public string key;
        public double x;
        public double y;
    }

    public class MonsterSnapshot
    {
        public int uid;
        public string id;
        public double x;
        public double y;
        public double homeX;
        public double homeY;
        public double hp;
        public double maxHp;
        public string state;
        public double atkCd;
        public double wanderCd;
        public double vx;
        public double vy;
        public double flash;
        public double castFx;
        public bool dead;
        public bool isBoss;
    }

    public class DropSnapshot
    {
        public int uid;
        public string id;
        public int n;
        public double x;
        public double y;
        public double life;
        public double born;
    }

    public class CollisionCase
    {
        public double x;
        public double y;
        public double r;
        public bool blocked;
        /// <summary>为 null 表示这条只测「压不压墙」，不测移动</summary>
        public double? dx;
        public double? dy;
        public double moveX;
        public double moveY;
    }

    public class RadiusCase
    {
        public double fromX;
        public double fromY;
        public double r;
        public int[] hitUids;
        /// <summary>没有怪时是 0</summary>
        public int nearestUid;
    }

    public class TickCase
    {
        public uint seed;
        public int frames;
        public double dt;
        public int randomsUsed;
        /// <summary>正数是「打到玩家」的怪 uid，负数是「这只死了」</summary>
        public int[] hits;
        public WorldSnapshot world;
    }

    public class LootCase
    {
        public uint seed;
        public string monsterId;
        public int level;
        public string[] got;
        public LootDrop[] drops;
    }

    public class LootDrop
    {
        public string id;
        public int n;
        public double x;
        public double y;
    }

    public class WorldDamageCase
    {
        public string step;
        public double real;
        public double hp;
        public string state;
        public bool dead;
        public int deaths;
    }
}
