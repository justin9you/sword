// 2D 逻辑坐标 ↔ 3D 世界坐标的换算，以及搭模型要用的几个小工具。
//
// 逻辑层的坐标一律是像素，一格 TILE 像素（数据里是 48）。3D 这边把「一格」
// 定为 1 个单位，于是 40×30 格的地图就是 40×30 的地面，人物半径 12 像素
// 就是 0.25 个单位。好处是地图数据里的格子坐标不用二次换算，调试时
// 「第几格」和世界坐标对得上。
//
// 轴向约定：逻辑的 x → 世界 X，逻辑的 y → 世界 Z，Y 轴朝上。
// 所以「朝向」在 3D 里就是绕 Y 轴转，角度 = atan2(facingX, facingY)。

using System.Collections.Generic;
using Godot;

namespace Zhuxian.Godot
{
    public static class Zx3D
    {
        /// <summary>一格多少像素。开局由 ZxGame3D 从 config 里灌进来，别在别处改</summary>
        public static float Tile { get; private set; } = 48f;

        public static void UseTile(double tile)
        {
            if (tile > 0) Tile = (float)tile;
        }

        /// <summary>像素 → 单位</summary>
        public static float U(double px)
        {
            return (float)(px / Tile);
        }

        /// <summary>逻辑坐标 (x, y) → 世界坐标，h 是离地高度（单位）</summary>
        public static Vector3 Pos(double x, double y, float h = 0f)
        {
            return new Vector3(U(x), h, U(y));
        }

        /// <summary>朝向向量 → 绕 Y 轴的弧度。模型一律按「面朝 +Z」来搭</summary>
        public static float Yaw(double fx, double fy)
        {
            if (fx == 0 && fy == 0) return 0f;
            return Mathf.Atan2((float)fx, (float)fy);
        }

        /// <summary>"#rrggbb" → Color。数据里的颜色都是这个写法，解析不了就用兜底色</summary>
        public static Color Hex(string hex, Color fallback)
        {
            if (string.IsNullOrEmpty(hex)) return fallback;
            return Color.FromString(hex, fallback);
        }

        // ── 搭模型 ──────────────────────────────────────────────

        /// <summary>
        /// 造一块材质。mats 传进来的话会把材质登记进去，
        /// 挨打闪白（ZxFigure.Flash）要靠这张表一次性改完所有部件。
        /// </summary>
        /// <summary>
        /// 一块墨色材质。全工程的物体都从这儿取色。
        ///
        /// roughness 这个参数留着没删，是因为几十处调用都在传它——水墨不吃粗糙度，
        /// 这里直接忽略。真正决定长相的是 ZxWash 里那支着色器。
        /// </summary>
        public static ShaderMaterial Mat(Color color, float roughness = 0.85f, List<ShaderMaterial> mats = null)
        {
            var m = ZxWash.Mat(color);
            mats?.Add(m);
            return m;
        }

        /// <summary>不吃光的材质：血条、特效、地面标记这类东西用，省得被阴影糊掉</summary>
        public static StandardMaterial3D Flat(Color color, bool billboard = false)
        {
            var m = new StandardMaterial3D
            {
                AlbedoColor = color,
                ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded,
                Transparency = color.A < 1f
                    ? BaseMaterial3D.TransparencyEnum.Alpha
                    : BaseMaterial3D.TransparencyEnum.Disabled,
                CullMode = BaseMaterial3D.CullModeEnum.Disabled,
            };
            if (billboard) m.BillboardMode = BaseMaterial3D.BillboardModeEnum.Enabled;
            return m;
        }

        /// <summary>自发光材质：法术、灯火、传送门。energy 越大越晃眼</summary>
        public static StandardMaterial3D Glow(Color color, float energy = 1.6f, float alpha = 1f)
        {
            var c = new Color(color.R, color.G, color.B, alpha);
            var m = new StandardMaterial3D
            {
                AlbedoColor = c,
                EmissionEnabled = true,
                Emission = color,
                EmissionEnergyMultiplier = energy,
                Roughness = 0.4f,
            };
            if (alpha < 1f)
            {
                m.Transparency = BaseMaterial3D.TransparencyEnum.Alpha;
                m.CullMode = BaseMaterial3D.CullModeEnum.Disabled;
            }
            return m;
        }

        /// <summary>挂一块网格到父节点上。搭人物和地形全靠它，省掉四行样板</summary>
        public static MeshInstance3D Part(
            Node3D parent, Mesh mesh, Material mat,
            Vector3 pos, Vector3? scale = null, Vector3? rotDeg = null)
        {
            var mi = new MeshInstance3D { Mesh = mesh, MaterialOverride = mat, Position = pos };
            if (scale.HasValue) mi.Scale = scale.Value;
            if (rotDeg.HasValue) mi.RotationDegrees = rotDeg.Value;
            parent.AddChild(mi);
            return mi;
        }

        /// <summary>
        /// 贴到镜头跟前就淡掉。树冠、竹叶这些长在头顶的东西，镜头一贴上去
        /// 就是一块糊住半个屏幕的绿斑——与其让相机绕开每一棵树，不如让树自己让开。
        /// </summary>
        public static ShaderMaterial FadeNear(ShaderMaterial m)
        {
            return ZxWash.FadeNear(m);
        }

        /// <summary>空的中间节点。用来做「绕某个点转」——摆腿、挥手都要它</summary>
        public static Node3D Pivot(Node3D parent, Vector3 pos)
        {
            var n = new Node3D { Position = pos };
            parent.AddChild(n);
            return n;
        }

        /// <summary>字符串 → 种子。地图上的草木要每次长在同一个地方，就得有个稳定的哈希</summary>
        public static uint Seed(string text)
        {
            uint h = 2166136261u;
            if (text == null) return h;
            for (var i = 0; i < text.Length; i++)
            {
                h ^= text[i];
                h *= 16777619u;
            }
            return h;
        }
    }
}
