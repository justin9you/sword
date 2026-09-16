// 本文件由 tools/export-gamedata.mjs 生成，不要手改。
// 数据源：src/data/*.js —— 改完数据跑 `npm run export:data` 重新生成。

using System;

namespace Zhuxian.Data
{
  [Serializable]
  public class ZxItem
  {
    public string id;
    public string name;
    public int lv;
    public string q;
    public ZxItemStats stats;
    public string desc;
    public string type;
    public string slot;
    public int price;
    public bool stackable;
    public string sect;
    public ZxItemActive active;
    public ZxItemUse use;
  }

  [Serializable]
  public class ZxItemStats
  {
    public int atk;
    public int hp;
    public bool present;
    public int mag;
    public double crit;
    public int def;
    public int agiSpeed;
    public int speed;
    public int mp;
    public int mdef;
    public double lifesteal;
    public double dodge;
    public double expBonus;
  }

  [Serializable]
  public class ZxItemActive
  {
    public string kind;
    public double heal;
    public int cd;
    public string name;
    public bool present;
    public int healFlat;
    public int radius;
    public int ms;
    public double amount;
    public double power;
    public double burn;
    public int burnMs;
    public double ratio;
    public double shield;
  }

  [Serializable]
  public class ZxItemUse
  {
    public int hp;
    public double hpPct;
    public bool present;
    public int mp;
    public double mpPct;
    public bool regen;
  }

  [Serializable]
  public class ZxMonster
  {
    public string id;
    public string name;
    public int lv;
    public string role;
    public string art;
    public string color;
    public int maxHp;
    public int atk;
    public int def;
    public int mdef;
    public int speed;
    public int radius;
    public bool ranged;
    public int exp;
    public int gold;
    public bool isBoss;
    public bool isElite;
    public int atkMs;
    public int attackRange;
    public string title;
    public string say;
  }

  [Serializable]
  public class ZxMap
  {
    public string key;
    public string name;
    public string sub;
    public int lvMin;
    public int lvMax;
    public string biome;
    public int w;
    public int h;
    public ZxMapStart start;
    public ZxMapBlock[] blocks;
    public ZxMapDecor[] decor;
    public ZxMapSpawn[] spawns;
    public int count;
    public ZxMapBoss boss;
    public string[] npcs;
    public ZxMapPortal[] portals;
    public int index;
    public int bossRespawnMs;
    public bool safe;
  }

  [Serializable]
  public class ZxMapStart
  {
    public int x;
    public int y;
  }

  [Serializable]
  public class ZxMapBlock
  {
    public int x;
    public int y;
    public int w;
    public int h;
  }

  [Serializable]
  public class ZxMapDecor
  {
    public string kind;
    public int count;
  }

  [Serializable]
  public class ZxMapSpawn
  {
    public string id;
    public int weight;
  }

  [Serializable]
  public class ZxMapBoss
  {
    public string id;
    public int x;
    public int y;
    public bool present;
  }

  [Serializable]
  public class ZxMapPortal
  {
    public string to;
    public int x;
    public int y;
  }

  [Serializable]
  public class ZxNpc
  {
    public string key;
    public string name;
    public string title;
    public string map;
    public int x;
    public int y;
    public string color;
    public string[] lines;
    public string[] stock;
    public bool heal;
    public bool shop;
  }

  [Serializable]
  public class ZxQuest
  {
    public string key;
    public string name;
    public string giver;
    public string turnIn;
    public int lv;
    public string brief;
    public ZxQuestGoal goal;
    public ZxQuestReward reward;
    public string done;
    public int index;
  }

  [Serializable]
  public class ZxQuestGoal
  {
    public string type;
    public string monster;
    public int count;
    public string id;
  }

  [Serializable]
  public class ZxQuestReward
  {
    public int exp;
    public int gold;
    public string[] items;
  }

  [Serializable]
  public class ZxSect
  {
    public string key;
    public string name;
    public string art;
    public string color;
    public string desc;
    public string quote;
    public ZxSectGrowth growth;
    public ZxSectStartBase startBase;
    public ZxSectSkill[] skills;
  }

  [Serializable]
  public class ZxSectGrowth
  {
    public double hp;
    public double mp;
    public double atk;
    public double mag;
    public double def;
    public double mdef;
  }

  [Serializable]
  public class ZxSectStartBase
  {
    public int con;
    public int spi;
    public int agi;
    public int wit;
  }

  [Serializable]
  public class ZxSectSkill
  {
    public string key;
    public string name;
    public int lv;
    public int mp;
    public int cd;
    public string kind;
    public string dmg;
    public double power;
    public int speed;
    public int range;
    public string desc;
    public string sect;
    public string color;
    public int width;
    public int radius;
    public double shield;
    public int shieldMs;
    public int stunMs;
    public double buffDef;
    public int buffMs;
    public double heal;
    public int healFlat;
    public double slow;
    public int slowMs;
    public double burn;
    public int burnMs;
    public int knock;
    public double lifesteal;
    public double costHp;
    public double buffAtk;
    public int hits;
  }

  [Serializable]
  public class ZxConfig
  {
    public int TILE;
    public int MAX_DT;
    public int MAX_LEVEL;
    public int MOVE_SPEED;
    public int MELEE_RANGE;
    public int ATTACK_MS;
    public int POINTS_PER_LEVEL;
    public double DEATH_EXP_LOSS;
    public int REGEN_DELAY_MS;
    public double REGEN_RATE;
    public double DAMAGE_JITTER;
    public double DEF_FACTOR;
    public double MDEF_FACTOR;
    public int MIN_DAMAGE;
    public double CRIT_MUL;
    public double LEVEL_GAP_BONUS;
    public double LEVEL_GAP_CAP;
    public int HURT_IFRAME_MS;
    public int SWING_MS;
    public int AGGRO_RANGE;
    public int LEASH_RANGE;
    public int RESPAWN_MS;
    public int MAX_ALIVE;
    public double DROP_GEAR;
    public double ELITE_DROP_MUL;
    public int BOSS_DROPS;
    public int DROP_LIFE_MS;
    public int PICKUP_RANGE;
    public int BAG_SIZE;
    public int STACK_MAX;
    public double CAM_LERP;
    public int FLOAT_MS;
    public int LOG_MAX;
    public ZxConfigSlot[] slots;
    public ZxConfigQuality[] quality;
    public int[] expToNext;
  }

  [Serializable]
  public class ZxConfigSlot
  {
    public string key;
    public string name;
  }

  [Serializable]
  public class ZxConfigQuality
  {
    public string key;
    public string name;
    public string color;
    public double mul;
  }

  [Serializable]
  public class ZxItemList
  {
    public ZxItem[] items;
  }

  [Serializable]
  public class ZxMonsterList
  {
    public ZxMonster[] monsters;
  }

  [Serializable]
  public class ZxMapList
  {
    public ZxMap[] maps;
  }

  [Serializable]
  public class ZxNpcList
  {
    public ZxNpc[] npcs;
  }

  [Serializable]
  public class ZxQuestList
  {
    public ZxQuest[] quests;
  }

  [Serializable]
  public class ZxSectList
  {
    public ZxSect[] sects;
  }
}
