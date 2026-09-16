using System;
using System.Collections.Generic;

namespace Zhuxian.Tests
{
    /// <summary>
    /// 最小断言器。照着 tools/test-logic.mjs 的输出格式来，两边看着一样。
    /// 失败不抛异常，攒起来一次报完——一条公式错了往往会牵出几十条，
    /// 只看第一条不如一次看全，容易认出是哪一类问题。
    /// </summary>
    public static class Check
    {
        static int passed;
        static readonly List<string> Failures = new List<string>();
        static int groupStart;

        public static void Group(string title, Action body)
        {
            Console.WriteLine();
            Console.WriteLine("  " + title);
            groupStart = Failures.Count;
            body();
            var bad = Failures.Count - groupStart;
            Console.WriteLine(bad > 0 ? "    ✗ " + bad + " 项不通过" : "    ✓ 全部通过");
        }

        public static void True(bool cond, string name, string detail = null)
        {
            if (cond) passed++;
            else Failures.Add(name + (detail != null ? "\n      " + detail : ""));
        }

        public static void Equal(int actual, int expected, string name)
        {
            True(actual == expected, name, "期望 " + expected + "，实得 " + actual);
        }

        public static void Equal(bool actual, bool expected, string name)
        {
            True(actual == expected, name, "期望 " + expected + "，实得 " + actual);
        }

        /// <summary>
        /// 浮点相等。默认容差 1e-12——移植的公式该做到逐位一致，
        /// 放宽容差就等于放过「系数差一点点」这类真问题。
        /// </summary>
        public static void Near(double actual, double expected, string name, double tol = 1e-12)
        {
            var diff = Math.Abs(actual - expected);
            True(diff <= tol, name, "期望 " + R(expected) + "，实得 " + R(actual) + "，差 " + R(diff));
        }

        static string R(double v)
        {
            return v.ToString("R", System.Globalization.CultureInfo.InvariantCulture);
        }

        /// <summary>返回进程退出码：全过 0，有失败 1</summary>
        public static int Report()
        {
            Console.WriteLine();
            Console.WriteLine("────────────────────────────────────────────────────");
            if (Failures.Count > 0)
            {
                Console.WriteLine("  ✗ " + Failures.Count + " 项不通过（" + passed + " 项通过）");
                Console.WriteLine();
                var shown = 0;
                foreach (var f in Failures)
                {
                    Console.WriteLine("    · " + f);
                    if (++shown >= 20)
                    {
                        Console.WriteLine("    …… 还有 " + (Failures.Count - shown) + " 条");
                        break;
                    }
                }
                Console.WriteLine("────────────────────────────────────────────────────");
                return 1;
            }
            Console.WriteLine("  ✓ 全部 " + passed + " 项通过");
            Console.WriteLine("────────────────────────────────────────────────────");
            return 0;
        }
    }
}
