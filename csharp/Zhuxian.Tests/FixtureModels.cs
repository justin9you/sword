using System;
using Zhuxian.Core;

namespace Zhuxian.Tests
{
    // 对照样本的形状。字段名和 tools/gen-fixtures.mjs 写出来的 JSON 一一对应，
    // 改了那边就要改这边——名字对不上时 System.Text.Json 不报错，只会留成默认值，
    // 所以每组测试都先断言条数不为 0，免得"样本没读进来"伪装成"全部通过"。

    public class RngFixture
    {
        public uint seed;
        public double[] values;
    }

    public class ExpFixture
    {
        public ExpCase[] cases;
    }

    public class ExpCase
    {
        public int level;
        /// <summary>满级那条是 -1，对应 JS 的 Infinity</summary>
        public int need;
    }

    public class DeriveFixture
    {
        public DeriveCase[] cases;
    }

    public class DeriveCase
    {
        public string sect;
        public int level;
        public BaseStats100 @base;
        public DerivedExpect expect;
    }

    /// <summary>样本里的 base 就是四项基础属性</summary>
    public class BaseStats100
    {
        public int con;
        public int spi;
        public int agi;
        public int wit;

        public BaseStats ToCore()
        {
            return new BaseStats(con, spi, agi, wit);
        }
    }

    public class DerivedExpect
    {
        public double hp;
        public double mp;
        public double atk;
        public double mag;
        public double def;
        public double mdef;
        public double crit;
        public double dodge;
        public double speed;
        public double lifesteal;
        public double expBonus;
    }

    public class DamageFixture
    {
        public DamageCase[] cases;
    }

    public class DamageCase
    {
        public double atk;
        public double def;
        public string kind;
        public double power;
        public double critRate;
        public int levelGap;
        public double ignoreDef;
        public uint seed;
        /// <summary>这条样本在 JS 侧消耗了几个随机数——消耗顺序不同是移植的经典坑</summary>
        public int randomsUsed;
        public DamageExpect expect;
    }

    public class DamageExpect
    {
        public int amount;
        public bool crit;
    }

    public class BuffFixture
    {
        public BuffCase[] cases;
    }

    public class BuffCase
    {
        public string name;
        public TickExpect[] ticks;
        public double[] through;
        public BuffSnapshot[] buffs;
    }

    public class TickExpect
    {
        public int dot;
        public int expired;
    }

    public class BuffSnapshot
    {
        public string kind;
        public double ms;
        public double frac;
        public double? amount;
        public double? value;
        public double? dps;
    }

    public class MiscFixture
    {
        public LifestealCase[] lifesteal;
        public DodgeCase[] dodge;
    }

    public class LifestealCase
    {
        public double rate;
        public double dealt;
        public int expect;
    }

    public class DodgeCase
    {
        public double rate;
        public uint seed;
        public bool expect;
    }

    // ── 背包 ──────────────────────────────────────────────────

    public class InventoryFixture
    {
        public InventoryCase[] cases;
    }

    public class InventoryCase
    {
        public string name;
        public BagSlotSnapshot[] bag;
        public EquipSnapshot equip;
        public DerivedExpect stats;
        public int added;
        public int count;
        public int firstEmpty;
        public bool full;
        public bool removeByIdWasNull;
        public bool equipWasNull;
        public bool unequipWasNull;
        public string replacedId;
    }

    public class BagSlotSnapshot
    {
        public string id;
        public int n;
    }

    public class EquipSnapshot
    {
        public string weapon;
        public string talisman;
        public string robe;
        public string bracer;
        public string boots;
        public string pendant;
    }

    // ── 玩家 ──────────────────────────────────────────────────

    public class PlayerFixture
    {
        public CreatedCase[] created;
        public LevelingCase[] leveling;
        public SpendingCase[] spending;
        public BuffedCase[] buffed;
        public EquipSwapCase[] equipSwap;
        public PotionCase[] potions;
        public RegenCase[] regen;
        public DeathCase[] death;
        public MoveSpeedCase[] moveSpeed;
    }

    public class CreatedCase
    {
        public string sect;
        public PlayerSnapshot snapshot;
    }

    public class PlayerSnapshot
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
        public DerivedExpect stats;
        public BagSlotSnapshot[] bag;
        public EquipSnapshot equip;
    }

    public class LevelingCase
    {
        public double gain;
        public int levels;
        public int level;
        public int exp;
        public int points;
        public double hp;
        public double mp;
    }

    public class SpendingCase
    {
        public string key;
        public bool ok;
        public int points;
        public BaseStats100 @base;
        public DerivedExpect stats;
    }

    public class BuffedCase
    {
        public double atkUp;
        public double defUp;
        public int level;
        public DerivedExpect stats;
    }

    public class EquipSwapCase
    {
        public string step;
        public double hp;
        public double maxHp;
    }

    public class PotionCase
    {
        public string step;
        public bool ok;
        public int healed;
        public int restored;
        public double hp;
        public double mp;
    }

    public class RegenCase
    {
        public double dt;
        public bool moving;
        public bool inCombat;
        public double idleMs;
        public double hp;
        public double mp;
    }

    public class DeathCase
    {
        public string step;
        public int lost;
        public int exp;
        public double atk;
        public int buffs;
        public bool dead;
        public int deaths;
        public double hp;
        public double mp;
        public double hurtIframe;
    }

    public class MoveSpeedCase
    {
        public string step;
        public double speed;
        public double attackMs;
    }
}
