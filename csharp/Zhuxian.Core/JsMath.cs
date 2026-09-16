using System;

namespace Zhuxian.Core
{
    /// <summary>
    /// JS 语义的数学运算。
    ///
    /// 移植最容易翻车的地方不是公式本身，是取整：
    /// JS 的 Math.round 是「加 0.5 后向下取整」，2.5 → 3，-2.5 → -2；
    /// C# 的 Math.Round 默认是银行家舍入，2.5 → 2，3.5 → 4。
    /// 直接用 Math.Round，伤害数字会跟网页版差 1，而且只在 .5 上差——
    /// 这种偏差肉眼看不出来，只有对照测试能抓到。
    ///
    /// 所有从 JS 翻过来的取整一律走这里，不要直接调 Math.Round。
    /// </summary>
    public static class JsMath
    {
        /// <summary>等价于 JS 的 Math.round</summary>
        public static double Round(double v)
        {
            return Math.Floor(v + 0.5);
        }

        /// <summary>等价于 JS 的 Math.round，取 int</summary>
        public static int RoundToInt(double v)
        {
            return (int)Math.Floor(v + 0.5);
        }

        /// <summary>等价于 JS 的 Math.floor，取 int</summary>
        public static int FloorToInt(double v)
        {
            return (int)Math.Floor(v);
        }

        /// <summary>等价于 util.js 的 clamp</summary>
        public static double Clamp(double v, double lo, double hi)
        {
            return v < lo ? lo : v > hi ? hi : v;
        }
    }
}
