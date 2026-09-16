using System;
using Zhuxian.Data;

namespace Zhuxian.Core
{
    /// <summary>
    /// 基础属性：玩家看得见、能加点的四项。
    /// 对应 src/stats.js 的 base。
    /// </summary>
    [Serializable]
    public class BaseStats
    {
        /// <summary>体质</summary>
        public int con;
        /// <summary>灵根</summary>
        public int spi;
        /// <summary>身法</summary>
        public int agi;
        /// <summary>悟性</summary>
        public int wit;

        public BaseStats()
        {
        }

        public BaseStats(int con, int spi, int agi, int wit)
        {
            this.con = con;
            this.spi = spi;
            this.agi = agi;
            this.wit = wit;
        }

        public BaseStats Clone()
        {
            return new BaseStats(con, spi, agi, wit);
        }

        public int Get(string key)
        {
            switch (key)
            {
                case "con": return con;
                case "spi": return spi;
                case "agi": return agi;
                case "wit": return wit;
                default: throw new ArgumentException("不是基础属性：" + key, nameof(key));
            }
        }

        public void Add(string key, int delta)
        {
            switch (key)
            {
                case "con": con += delta; break;
                case "spi": spi += delta; break;
                case "agi": agi += delta; break;
                case "wit": wit += delta; break;
                default: throw new ArgumentException("不是基础属性：" + key, nameof(key));
            }
        }
    }

    /// <summary>
    /// 衍生属性：打架真正用的那一套。
    ///
    /// 全部用 double 存，不用 int——JS 那边就是一路 number 算到底，
    /// 中间哪一步该取整是公式说了算（见 Stats.Derive / Player.Recompute）。
    /// 这里要是提前取整，误差会在装备加成、百分比增益上越滚越大。
    /// </summary>
    [Serializable]
    public class DerivedStats
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

        public DerivedStats Clone()
        {
            return (DerivedStats)MemberwiseClone();
        }
    }

    /// <summary>
    /// 属性体系与等级曲线。移植自 src/stats.js，公式逐行对齐。
    /// 怪物也走同一套换算，玩家和怪物才在同一个数值尺度上。
    /// </summary>
    public static class Stats
    {
        public static readonly string[] BaseKeys = { "con", "spi", "agi", "wit" };

        /// <summary>没门派时的默认成长，对应 stats.js 里 derive 的兜底</summary>
        static readonly ZxSectGrowth DefaultGrowth = new ZxSectGrowth
        {
            hp = 9, mp = 5, atk = 1.4, mag = 1.4, def = 1, mdef = 1,
        };

        /// <summary>
        /// 升到下一级需要的经验。满级返回 int.MaxValue（JS 那边是 Infinity）。
        /// </summary>
        public static int ExpToNext(int level, ZxConfig config)
        {
            if (level >= config.MAX_LEVEL) return int.MaxValue;
            return JsMath.FloorToInt(52.0 * Math.Pow(level, 1.62) + 42.0 * level + 60.0);
        }

        /// <summary>基础属性 → 衍生属性</summary>
        public static DerivedStats Derive(int level, BaseStats bs, ZxSect sect)
        {
            var g = sect != null && sect.growth != null ? sect.growth : DefaultGrowth;
            return new DerivedStats
            {
                hp = Math.Floor(120 + level * g.hp + bs.con * 11.0),
                mp = Math.Floor(60 + level * g.mp + bs.spi * 8.0),
                atk = Math.Floor(8 + level * g.atk + bs.con * 0.6 + bs.agi * 0.9),
                mag = Math.Floor(8 + level * g.mag + bs.spi * 1.7),
                def = Math.Floor(4 + level * g.def + bs.con * 0.8),
                mdef = Math.Floor(4 + level * g.mdef + bs.spi * 0.7),
                crit = 0.03 + bs.agi * 0.0035 + bs.wit * 0.001,
                dodge = 0.02 + bs.agi * 0.003,
                speed = 0,
                lifesteal = 0,
                expBonus = bs.wit * 0.006,
            };
        }

        /// <summary>空的衍生属性表，用来累加装备加成</summary>
        public static DerivedStats Empty()
        {
            return new DerivedStats();
        }

        /// <summary>
        /// 把装备上的加成累加进来。
        ///
        /// JS 的 addInto 是遍历对象上所有数字字段，所以 items.js 里那个只有一件装备写了的
        /// agiSpeed 也会被塞进属性表——但全项目没有任何地方读它，等于一个死字段。
        /// 这里按字段显式相加，行为一致，只是不再把死字段带进来。
        /// </summary>
        public static DerivedStats AddInto(DerivedStats target, ZxItemStats bonus)
        {
            if (bonus == null) return target;
            target.hp += bonus.hp;
            target.mp += bonus.mp;
            target.atk += bonus.atk;
            target.mag += bonus.mag;
            target.def += bonus.def;
            target.mdef += bonus.mdef;
            target.crit += bonus.crit;
            target.dodge += bonus.dodge;
            target.speed += bonus.speed;
            target.lifesteal += bonus.lifesteal;
            target.expBonus += bonus.expBonus;
            return target;
        }

        /// <summary>两份衍生属性相加</summary>
        public static DerivedStats AddInto(DerivedStats target, DerivedStats bonus)
        {
            if (bonus == null) return target;
            target.hp += bonus.hp;
            target.mp += bonus.mp;
            target.atk += bonus.atk;
            target.mag += bonus.mag;
            target.def += bonus.def;
            target.mdef += bonus.mdef;
            target.crit += bonus.crit;
            target.dodge += bonus.dodge;
            target.speed += bonus.speed;
            target.lifesteal += bonus.lifesteal;
            target.expBonus += bonus.expBonus;
            return target;
        }
    }
}
