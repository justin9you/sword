using System;
using System.Collections.Generic;

namespace Zhuxian.Core
{
    /// <summary>二维向量，只用来传坐标和方向</summary>
    public readonly struct Vec2
    {
        public readonly double X;
        public readonly double Y;

        public Vec2(double x, double y)
        {
            X = x;
            Y = y;
        }
    }

    /// <summary>几何小工具。移植自 src/util.js。</summary>
    public static class Geometry
    {
        public static double Dist(double ax, double ay, double bx, double by)
        {
            var dx = bx - ax;
            var dy = by - ay;
            return Math.Sqrt(dx * dx + dy * dy);
        }

        /// <summary>距离平方，省一次开方——只比大小的地方用它</summary>
        public static double Dist2(double ax, double ay, double bx, double by)
        {
            var dx = bx - ax;
            var dy = by - ay;
            return dx * dx + dy * dy;
        }

        /// <summary>从 a 指向 b 的单位向量；两点重合时返回朝下</summary>
        public static Vec2 DirTo(double ax, double ay, double bx, double by)
        {
            var dx = bx - ax;
            var dy = by - ay;
            var len = Math.Sqrt(dx * dx + dy * dy);
            if (len < 0.0001) return new Vec2(0, 1);
            return new Vec2(dx / len, dy / len);
        }
    }

    /// <summary>
    /// 自增 ID。存档里只存数值，不存对象引用。
    ///
    /// 和 JS 一样是全局计数器。测试之间要 Reset，否则上一组用例留下的计数
    /// 会把下一组的 uid 顶走——对照样本里的 uid 就对不上了。
    /// </summary>
    public static class Uid
    {
        static int seq;

        public static int Next()
        {
            seq += 1;
            return seq;
        }

        /// <summary>让读档后的新实体 ID 不和存档里的撞上</summary>
        public static void Seed(int n)
        {
            if (n > seq) seq = n;
        }

        public static void Reset()
        {
            seq = 0;
        }
    }

    /// <summary>带权重的抽取。表里没写权重的按 1 算。</summary>
    public static class WeightedPick
    {
        /// <summary>
        /// 从 items 里按 weights 抽一个。两个表同序等长。
        ///
        /// 权重直接传表而不是传个算权重的函数：JS 那边权重是先算好存在数组里的，
        /// 而这个算法要遍历两遍（先求和再滚动），传函数就会把每个权重算两次——
        /// 算式里带 Math.pow 和自增计数器的话，第二遍出来的数就不是第一遍那个了。
        ///
        /// 「roll 减到 &lt;= 0 就返回」和「循环走完了返回最后一个」都和 JS 对齐：
        /// 浮点累加误差真的会让循环走完，那时兜底返回最后一个，而不是返回 null。
        /// </summary>
        public static T Pick<T>(IList<T> items, IList<double> weights, IRng rng)
        {
            if (items.Count != weights.Count)
            {
                throw new ArgumentException(
                    "权重表和候选表长度不一致：" + items.Count + " vs " + weights.Count, nameof(weights));
            }

            var total = 0.0;
            for (var i = 0; i < weights.Count; i++) total += weights[i];

            var roll = rng.Next() * total;
            for (var i = 0; i < items.Count; i++)
            {
                roll -= weights[i];
                if (roll <= 0) return items[i];
            }
            return items[items.Count - 1];
        }
    }
}
