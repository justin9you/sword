using System;

namespace Zhuxian.Core
{
    /// <summary>
    /// 随机数来源。逻辑层不直接调 Math.Random / UnityEngine.Random，
    /// 全部从这里取——否则没法做「同一串随机数喂给 JS 和 C#，看结果一不一样」的对照测试，
    /// 而伤害、暴击、掉落这些恰恰是最需要对照的地方。
    /// </summary>
    public interface IRng
    {
        /// <summary>[0, 1) 的浮点，语义同 JS 的 Math.random()</summary>
        double Next();
    }

    /// <summary>
    /// mulberry32：32 位状态的确定性伪随机，JS 和 C# 两边能跑出一模一样的序列。
    /// 只用于测试对照，不要拿它当游戏里的随机源——周期短，也没打算做安全性。
    /// </summary>
    public sealed class Mulberry32 : IRng
    {
        uint state;

        public Mulberry32(uint seed)
        {
            state = seed;
        }

        public double Next()
        {
            unchecked
            {
                state += 0x6D2B79F5u;
                var a = state;
                var t = (a ^ (a >> 15)) * (1u | a);
                t = ((t + ((t ^ (t >> 7)) * (61u | t))) ^ t);
                return (t ^ (t >> 14)) / 4294967296.0;
            }
        }
    }

    /// <summary>游戏里实际用的随机源。</summary>
    public sealed class SystemRng : IRng
    {
        readonly Random random;

        public SystemRng()
        {
            random = new Random();
        }

        public SystemRng(int seed)
        {
            random = new Random(seed);
        }

        public double Next()
        {
            return random.NextDouble();
        }
    }

    /// <summary>util.js 里那几个随机小工具，语义逐行对齐。</summary>
    public static class RngExtensions
    {
        /// <summary>[lo, hi) 之间的浮点</summary>
        public static double Range(this IRng rng, double lo, double hi)
        {
            return lo + rng.Next() * (hi - lo);
        }

        /// <summary>[lo, hi] 之间的整数</summary>
        public static int RangeInt(this IRng rng, int lo, int hi)
        {
            return (int)Math.Floor(lo + rng.Next() * (hi - lo + 1));
        }

        /// <summary>以 p 的概率返回 true</summary>
        public static bool Chance(this IRng rng, double p)
        {
            return rng.Next() < p;
        }
    }
}
