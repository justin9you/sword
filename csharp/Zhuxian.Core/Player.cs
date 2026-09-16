using System;
using System.Collections.Generic;
using Zhuxian.Data;

namespace Zhuxian.Core
{
    /// <summary>任务进度</summary>
    [Serializable]
    public class QuestProgress
    {
        /// <summary>当前这条主线的 key，全部做完是 null</summary>
        public string current = "q1";
        /// <summary>当前这条已经完成了多少（杀了几只）</summary>
        public int progress;
        /// <summary>交过的任务</summary>
        public HashSet<string> done = new HashSet<string>();
    }

    /// <summary>
    /// 玩家状态。对应 src/player.js 里那个 p 对象。
    ///
    /// 数值分三层，改任何一层都要 Recompute()：
    ///   base（加点） → Derive（等级+门派换算） → + 装备 + 增益 = stats（打架用的）
    /// 当前气血 / 灵力独立存在 hp / mp 上，上限变了会按比例跟着变，脱装备不会暴毙。
    ///
    /// hp / mp 用 double：自然回复每帧加的是个小数，取整会让回血变慢甚至回不动。
    /// </summary>
    [Serializable]
    public class PlayerState
    {
        public string name = "无名";
        public string sect;
        public int level = 1;
        public int exp;
        public int gold = 100;
        public int points;
        public BaseStats @base = new BaseStats();

        public BagSlot[] bag;
        public Equipment equip = new Equipment();

        public string map = "caomiao";
        public double x;
        public double y;
        public double facingX;
        public double facingY = 1;

        public double hp = 1;
        public double mp = 1;
        public DerivedStats stats;

        /// <summary>技能 key → 还有多少毫秒好</summary>
        public Dictionary<string, double> cd = new Dictionary<string, double>();
        public List<Buff> buffs = new List<Buff>();

        public QuestProgress quest = new QuestProgress();
        public HashSet<string> visited = new HashSet<string> { "caomiao" };
        public int kills;
        public int deaths;
        public double playMs;

        // 运行时的战斗状态，不入存档
        public double attackCd;
        public double hurtIframe;
        /// <summary>挥砍动作剩余时长，渲染层用它画出手姿势</summary>
        public double swingMs;
        public double idleMs;
        public bool dead;
    }

    /// <summary>吃丹药的结果</summary>
    public class PotionResult
    {
        public bool Ok;
        /// <summary>没吃成时的说明</summary>
        public string Message;
        public ZxItem Item;
        public int Healed;
        public int Restored;
    }

    /// <summary>玩家状态机。移植自 src/player.js。</summary>
    public static class Player
    {
        public static PlayerState Create(GameData data, string name, string sectKey)
        {
            var sect = data.Sect(sectKey);
            var cfg = data.Config;

            var p = new PlayerState
            {
                name = string.IsNullOrEmpty(name) ? "无名" : name,
                sect = sect.key,
                @base = new BaseStats(
                    sect.startBase.con, sect.startBase.spi,
                    sect.startBase.agi, sect.startBase.wit),
                bag = Inventory.EmptyBag(data),
                equip = Inventory.EmptyEquip(),
            };

            // 开局给一身褴褛，免得 1 级赤手空拳
            p.bag = Inventory.Add(data, p.bag, "c_xiaohuan", 5).Bag;
            p.bag = Inventory.Add(data, p.bag, "c_juling", 3).Bag;
            p.equip.weapon = "w_shaohuo";
            p.equip.robe = "a_bu";
            p.equip.boots = "s_caoxie";

            Recompute(data, p);
            p.hp = p.stats.hp;
            p.mp = p.stats.mp;
            return p;
        }

        /// <summary>重算 stats。任何影响属性的操作之后都得调它</summary>
        public static PlayerState Recompute(GameData data, PlayerState p)
        {
            var sect = data.Sect(p.sect);
            var s = Stats.Derive(p.level, p.@base, sect);
            Stats.AddInto(s, Inventory.EquipStats(data, p.equip));

            // 增益里的百分比加成最后乘，保证「+25% 防御」指的是含装备之后的防御
            var mulAtk = 1.0;
            var mulDef = 1.0;
            for (var i = 0; i < p.buffs.Count; i++)
            {
                var b = p.buffs[i];
                if (b.kind == "atkUp") mulAtk += b.amount ?? 0;
                if (b.kind == "defUp") mulDef += b.amount ?? 0;
                if (b.kind == "lifesteal") s.lifesteal += b.amount ?? 0;
            }
            s.atk = Math.Floor(s.atk * mulAtk);
            s.mag = Math.Floor(s.mag * mulAtk);
            s.def = Math.Floor(s.def * mulDef);
            s.mdef = Math.Floor(s.mdef * mulDef);

            s.hp = Math.Max(1, s.hp);
            s.mp = Math.Max(0, s.mp);
            s.crit = JsMath.Clamp(s.crit, 0, 0.75);
            s.dodge = JsMath.Clamp(s.dodge, 0, 0.6);
            s.lifesteal = JsMath.Clamp(s.lifesteal, 0, 0.9);

            var oldMax = p.stats != null ? p.stats.hp : s.hp;
            var oldMaxMp = p.stats != null ? p.stats.mp : s.mp;
            p.stats = s;

            // 上限变化时按比例保留当前值，脱装备不会直接死
            if (oldMax != s.hp && oldMax > 0) p.hp = Math.Max(1, JsMath.Round(p.hp * (s.hp / oldMax)));
            if (oldMaxMp != s.mp && oldMaxMp > 0) p.mp = JsMath.Round(p.mp * (s.mp / oldMaxMp));
            p.hp = JsMath.Clamp(p.hp, 0, s.hp);
            p.mp = JsMath.Clamp(p.mp, 0, s.mp);
            return p;
        }

        /// <summary>移动速度（像素/秒），含装备加成与减速</summary>
        public static double MoveSpeed(GameData data, PlayerState p)
        {
            var v = data.Config.MOVE_SPEED + p.stats.speed;
            for (var i = 0; i < p.buffs.Count; i++)
            {
                if (p.buffs[i].kind == "slow") v *= 1 - (p.buffs[i].amount ?? 0);
            }
            return Math.Max(40, v);
        }

        /// <summary>普攻间隔：身法越高越快，最多快到 55%</summary>
        public static double AttackInterval(GameData data, PlayerState p)
        {
            var k = 1 - Math.Min(0.45, p.@base.agi * 0.004);
            return data.Config.ATTACK_MS * k;
        }

        /// <summary>
        /// 加经验，可能连升数级，返回这次升了几级（0 表示没升）。
        /// 悟性带来的加成在这里生效。
        /// </summary>
        public static int GainExp(GameData data, PlayerState p, double amount)
        {
            var cfg = data.Config;
            if (p.level >= cfg.MAX_LEVEL) return 0;

            var got = JsMath.FloorToInt(amount * (1 + p.stats.expBonus));
            p.exp += got;

            var levels = 0;
            while (p.level < cfg.MAX_LEVEL)
            {
                var need = Stats.ExpToNext(p.level, cfg);
                if (p.exp < need) break;
                p.exp -= need;
                p.level += 1;
                p.points += cfg.POINTS_PER_LEVEL;
                levels += 1;
            }

            if (levels > 0)
            {
                Recompute(data, p);
                p.hp = p.stats.hp;
                p.mp = p.stats.mp;
            }
            if (p.level >= cfg.MAX_LEVEL) p.exp = 0;
            return levels;
        }

        /// <summary>加一点基础属性</summary>
        public static bool SpendPoint(GameData data, PlayerState p, string key)
        {
            if (p.points <= 0) return false;
            if (Array.IndexOf(Stats.BaseKeys, key) < 0) return false;

            p.points -= 1;
            p.@base.Add(key, 1);
            Recompute(data, p);
            return true;
        }

        /// <summary>吃丹药。那格不是丹药返回 null，等级不够返回 Ok=false</summary>
        public static PotionResult UsePotion(GameData data, PlayerState p, int index)
        {
            if (index < 0 || index >= p.bag.Length) return null;
            var stack = p.bag[index];
            if (stack == null) return null;

            var item = data.Item(stack.id);
            if (item == null || item.type != "potion") return null;
            if (item.lv > p.level)
            {
                return new PotionResult { Ok = false, Message = "修为不够，压不住这颗丹的药力。" };
            }

            var u = item.use;
            var healed = 0;
            var restored = 0;

            if (u != null && (u.hp != 0 || u.hpPct != 0))
            {
                var h = u.hp + Math.Floor(p.stats.hp * u.hpPct);
                healed = (int)Math.Min(h, p.stats.hp - p.hp);
                p.hp += healed;
            }
            if (u != null && (u.mp != 0 || u.mpPct != 0))
            {
                var m = u.mp + Math.Floor(p.stats.mp * u.mpPct);
                restored = (int)Math.Min(m, p.stats.mp - p.mp);
                p.mp += restored;
            }

            p.bag = Inventory.RemoveAt(p.bag, index, 1);
            return new PotionResult { Ok = true, Item = item, Healed = healed, Restored = restored };
        }

        /// <summary>每帧的自然回复：站着不动一会儿才开始回</summary>
        public static void TickRegen(GameData data, PlayerState p, double dt, bool moving, bool inCombat)
        {
            var cfg = data.Config;
            if (moving || inCombat)
            {
                p.idleMs = 0;
                return;
            }

            p.idleMs += dt;
            if (p.idleMs < cfg.REGEN_DELAY_MS) return;

            var rate = cfg.REGEN_RATE * (dt / 1000.0);
            p.hp = Math.Min(p.stats.hp, p.hp + p.stats.hp * rate);
            p.mp = Math.Min(p.stats.mp, p.mp + p.stats.mp * rate);
        }

        /// <summary>死亡：扣一成经验，回城。返回掉了多少经验，给日志用</summary>
        public static int Die(GameData data, PlayerState p)
        {
            var lost = JsMath.FloorToInt(p.exp * data.Config.DEATH_EXP_LOSS);
            p.exp = Math.Max(0, p.exp - lost);
            p.deaths += 1;
            p.dead = true;
            p.buffs.Clear();
            // 清 buff 之后必须重算：死的那一刻身上若带着血炼，
            // 加成会跟着一路复活，白捡一身属性
            Recompute(data, p);
            return lost;
        }

        public static void Revive(GameData data, PlayerState p)
        {
            p.dead = false;
            p.hp = Math.Max(1, Math.Floor(p.stats.hp * 0.5));
            p.mp = Math.Max(0, Math.Floor(p.stats.mp * 0.5));
            p.hurtIframe = 1200;
        }
    }
}
