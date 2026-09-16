// 中文字体。
//
// Godot 自带的默认字体里没有汉字，直接用的话游戏里满屏豆腐块。
// 所以这里走 SystemFont——按名字去系统里找，找不到一个就退到下一个。
// 不打包字体文件是有意的：字体动辄十几 MB，而这个工程整体是「零外部资源」的。

using Godot;

namespace Zhuxian.Godot
{
    public static class ZxFont
    {
        static SystemFont cached;

        /// <summary>
        /// 按 Windows → macOS → Linux 的常见中文字体挨个碰运气。
        /// 一个都没有的话 Godot 会退回默认字体，汉字会变方块，
        /// 但游戏本身照跑——字体缺失不该让人进不去。
        /// </summary>
        public static Font Get()
        {
            if (cached != null) return cached;
            cached = new SystemFont
            {
                FontNames = new[]
                {
                    "Microsoft YaHei UI", "Microsoft YaHei", "SimHei", "SimSun",
                    "PingFang SC", "Hiragino Sans GB",
                    "Noto Sans CJK SC", "Source Han Sans SC", "WenQuanYi Micro Hei",
                    "sans-serif",
                },
                Antialiasing = TextServer.FontAntialiasing.Gray,
            };
            return cached;
        }
    }
}
