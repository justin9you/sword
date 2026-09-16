// 生态调色板——水墨版。
//
// 原来每种生态给一套彩色（网页版 src/art.js 那张表）。水墨世界里颜色几乎被抽干，
// 于是「11 种生态怎么还分得清」就成了真问题。答案是三样东西一起变，而不是只换色相：
//
//   · 纸色：草庙村是暖黄的熟宣，龙首峰是冷青的生宣，滴血洞是发灰的旧纸。
//     背景占的面积最大，纸一换，整张画的气味就变了。
//   · 墨色：多数地方是偏蓝的松烟墨，焚香谷用偏褐的油烟墨，鬼王宗近乎纯黑。
//   · 设色：极少量的一点颜色，浅绛的路数——赭石、花青、石绿、朱砂。
//     只染在有墨的地方，纸白处不染。
//
// 三样叠起来，「这是竹林」和「这是滴血洞」一眼分得出，而整体仍然是水墨。

using System.Collections.Generic;
using Godot;

namespace Zhuxian.Godot
{
    public struct ZxPalette
    {
        /// <summary>纸色。背景、远景、受光面都归它</summary>
        public Color Paper;
        /// <summary>墨色。背光面、轮廓积墨归它</summary>
        public Color Ink;
        /// <summary>设色。浅绛一路，用量极小</summary>
        public Color Accent;
        /// <summary>地面的两档纸色，用来铺出极淡的格子</summary>
        public Color Ground;
        public Color Ground2;

        /// <summary>远处化进纸里——「远则无墨」</summary>
        public Color Fog => Paper;

        static readonly Dictionary<string, string[]> Table = new Dictionary<string, string[]>
        {
            // biome          paper      ink        accent     ground     ground2
            { "village",  new[] { "#efe8d8", "#23262b", "#8a7346", "#e9e1cd", "#e2d8c0" } },
            { "mountain", new[] { "#eceef1", "#1d2430", "#4f7392", "#e4e8ec", "#d9e0e7" } },
            { "bamboo",   new[] { "#eaeee0", "#1f2a22", "#567f47", "#e2e8d6", "#d7e0c9" } },
            { "town",     new[] { "#f1e9da", "#27231d", "#9a6733", "#eae0cd", "#e2d6bd" } },
            { "cave",     new[] { "#dcd7e0", "#16121c", "#65538a", "#d3cddb", "#c8c1d1" } },
            { "dead",     new[] { "#e2e4e7", "#171a20", "#586b80", "#d8dce1", "#cdd3d9" } },
            { "fire",     new[] { "#f0e1d3", "#2a1a14", "#b1452a", "#e8d5c3", "#e0cab4" } },
            { "forest",   new[] { "#e9eee3", "#1b2419", "#527a41", "#e0e8d8", "#d5e0cb" } },
            { "swamp",    new[] { "#e6e8da", "#1a1e16", "#77854a", "#dce0ce", "#d1d8c1" } },
            { "dark",     new[] { "#d7d3db", "#120f18", "#745a90", "#cec7d5", "#c3bbca" } },
            { "sky",      new[] { "#eef1f7", "#1c2230", "#6f92bd", "#e6ebf3", "#dbe3ee" } },
        };

        public static ZxPalette Of(string biome)
        {
            string[] c;
            if (biome == null || !Table.TryGetValue(biome, out c)) c = Table["village"];
            return new ZxPalette
            {
                Paper = Zx3D.Hex(c[0], new Color(0.93f, 0.91f, 0.85f)),
                Ink = Zx3D.Hex(c[1], new Color(0.11f, 0.12f, 0.15f)),
                Accent = Zx3D.Hex(c[2], new Color(0.54f, 0.45f, 0.27f)),
                Ground = Zx3D.Hex(c[3], new Color(0.91f, 0.88f, 0.8f)),
                Ground2 = Zx3D.Hex(c[4], new Color(0.88f, 0.85f, 0.75f)),
            };
        }
    }
}
