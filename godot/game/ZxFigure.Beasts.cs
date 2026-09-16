// 人形之外的十种形态：兽、狐、蛇、虫、草木、翼、傀儡、幽魂。
//
// 每种都先想清楚「远看靠什么认出来」：野兽是背脊隆起 + 低头前伸，
// 狐是大耳朵 + 蓬尾，蛇是贴地的一串，傀儡是错位堆叠的石块。
// 认得出之后才加眼睛、耳朵、尾巴这些细节。

using Godot;

namespace Zhuxian.Godot
{
    public partial class ZxFigure
    {
        /// <summary>四足兽。狐比狼瘦、耳朵大、尾巴蓬</summary>
        void Beast(Color c, float r, bool fox)
        {
            var len = r * 2.8f;
            var hip = r * 1.25f;
            Top = r * 2.5f;

            var fur = Zx3D.Mat(c, 0.95f, mats);
            var dark = Zx3D.Mat(c.Darkened(0.32f), 0.95f, mats);
            var pale = Zx3D.Mat(c.Lightened(0.3f), 0.95f, mats);

            // 躯干：胶囊默认沿 Y，绕 X 转 90° 就成了沿 Z。再加一块隆起的背脊
            Zx3D.Part(body, new CapsuleMesh { Radius = r * (fox ? 0.6f : 0.72f), Height = len }, fur,
                new Vector3(0, hip, 0), null, new Vector3(90, 0, 0));
            Zx3D.Part(body, new SphereMesh { Radius = r * 0.62f, Height = r * 0.8f }, fur,
                new Vector3(0, hip + r * 0.32f, -len * 0.12f));

            // 脖子压低、头前伸——四足动物不是把头顶在身子正上方的
            var neck = Zx3D.Pivot(body, new Vector3(0, hip + r * 0.1f, len * 0.4f));
            Zx3D.Part(neck, new CapsuleMesh { Radius = r * 0.3f, Height = r * 0.8f }, fur,
                new Vector3(0, r * 0.1f, r * 0.1f), null, new Vector3(58, 0, 0));
            var head = Zx3D.Pivot(neck, new Vector3(0, r * 0.32f, r * 0.42f));
            Zx3D.Part(head, new SphereMesh { Radius = r * 0.44f, Height = r * 0.82f }, fur, Vector3.Zero);
            // 吻部：有没有这一截，是「狗」和「球」的区别
            Zx3D.Part(head, new CapsuleMesh { Radius = r * 0.19f, Height = r * 0.62f }, pale,
                new Vector3(0, -r * 0.1f, r * 0.3f), null, new Vector3(90, 0, 0));
            Zx3D.Part(head, new SphereMesh { Radius = r * 0.09f, Height = r * 0.16f }, dark,
                new Vector3(0, -r * 0.06f, r * 0.58f));
            Eyes(head, r * 0.12f, r * 0.19f, r * 0.34f, r * 0.06f);

            var ear = new CylinderMesh
            {
                TopRadius = 0.001f,
                BottomRadius = r * (fox ? 0.26f : 0.17f),
                Height = r * (fox ? 0.66f : 0.32f),
            };
            for (var s = -1; s <= 1; s += 2)
            {
                Zx3D.Part(head, ear, dark, new Vector3(s * r * 0.24f, r * 0.42f, -r * 0.02f),
                    null, new Vector3(-12, 0, s * 14));
            }

            // 四条腿对角摆：同侧同步是「玩具马」，对角错开才是走路
            var legMesh = new CapsuleMesh { Radius = r * 0.15f, Height = hip };
            var pairs = new[]
            {
                new Vector3(-r * 0.46f, hip * 0.92f, len * 0.3f),
                new Vector3(r * 0.46f, hip * 0.92f, len * 0.3f),
                new Vector3(-r * 0.46f, hip * 0.92f, -len * 0.3f),
                new Vector3(r * 0.46f, hip * 0.92f, -len * 0.3f),
            };
            for (var i = 0; i < pairs.Length; i++)
            {
                var offset = i == 0 || i == 3 ? 0f : Mathf.Pi;
                var leg = Swinger(body, pairs[i], offset, 0.55f);
                Zx3D.Part(leg, legMesh, dark, new Vector3(0, -hip * 0.45f, 0));
            }

            if (fox)
            {
                var tail = Zx3D.Pivot(body, new Vector3(0, hip + r * 0.2f, -len * 0.5f));
                waves.Add(tail);
                for (var i = 0; i < 3; i++)
                {
                    var s = r * (0.34f - i * 0.06f);
                    Zx3D.Part(tail, new SphereMesh { Radius = s, Height = s * 2.4f }, pale,
                        new Vector3(0, r * (0.2f + i * 0.26f), -r * (0.1f + i * 0.22f)),
                        null, new Vector3(-38, 0, 0));
                }
                return;
            }

            Zx3D.Part(body, new CapsuleMesh { Radius = r * 0.11f, Height = r * 0.9f }, dark,
                new Vector3(0, hip + r * 0.28f, -len * 0.52f), null, new Vector3(48, 0, 0));
        }

        /// <summary>蛇：贴地的一串，游动靠每节左右错相位</summary>
        void Snake(Color c, float r)
        {
            Top = r * 1.8f;
            var skin = Zx3D.Mat(c, 0.55f, mats);
            var belly = Zx3D.Mat(c.Lightened(0.32f), 0.55f, mats);

            for (var i = 0; i < 6; i++)
            {
                var seg = Zx3D.Pivot(body, new Vector3(0, r * 0.5f, -i * r * 0.56f));
                waves.Add(seg);
                var s = r * (0.58f - i * 0.06f);
                Zx3D.Part(seg, new SphereMesh { Radius = s, Height = s * 1.7f }, i % 2 == 0 ? skin : belly,
                    Vector3.Zero);
            }

            // 头：楔形（扁 + 前窄），加一条吐出来的信子
            var head = Zx3D.Pivot(body, new Vector3(0, r * 0.62f, r * 0.66f));
            Zx3D.Part(head, new SphereMesh { Radius = r * 0.44f, Height = r * 0.6f }, skin,
                Vector3.Zero, new Vector3(1f, 1f, 1.5f));
            Eyes(head, r * 0.12f, r * 0.19f, r * 0.34f, r * 0.07f, new Color(1f, 0.85f, 0.3f));
            Zx3D.Part(head, new BoxMesh { Size = Vector3.One }, Zx3D.Mat(new Color(0.8f, 0.2f, 0.25f), 0.6f, mats),
                new Vector3(0, -r * 0.02f, r * 0.75f), new Vector3(r * 0.04f, r * 0.03f, r * 0.42f));
        }

        /// <summary>虫豸：三节身子 + 触角 + 抖动的薄翅</summary>
        void Insect(Color c, float r)
        {
            Top = r * 2f;
            floats = true;
            var shell = Zx3D.Mat(c, 0.45f, mats);
            var dark = Zx3D.Mat(c.Darkened(0.45f), 0.55f, mats);
            var stripe = Zx3D.Mat(c.Lightened(0.35f), 0.5f, mats);

            var y = r * 1.05f;
            Zx3D.Part(body, new SphereMesh { Radius = r * 0.72f, Height = r * 1.3f }, shell,
                new Vector3(0, y, -r * 0.62f), new Vector3(1f, 1f, 1.25f));
            Zx3D.Part(body, new SphereMesh { Radius = r * 0.5f, Height = r * 0.9f }, stripe,
                new Vector3(0, y, -r * 0.05f));

            var head = Zx3D.Pivot(body, new Vector3(0, y, r * 0.52f));
            Zx3D.Part(head, new SphereMesh { Radius = r * 0.4f, Height = r * 0.66f }, dark, Vector3.Zero);
            Eyes(head, r * 0.06f, r * 0.2f, r * 0.26f, r * 0.11f, new Color(0.95f, 0.35f, 0.3f));
            for (var s = -1; s <= 1; s += 2)
            {
                Zx3D.Part(head, new CylinderMesh { TopRadius = 0.001f, BottomRadius = r * 0.04f, Height = r * 0.6f },
                    dark, new Vector3(s * r * 0.12f, r * 0.3f, r * 0.1f), null, new Vector3(-28, 0, s * 24));
            }

            for (var i = 0; i < 6; i++)
            {
                var side = i % 2 == 0 ? -1 : 1;
                Zx3D.Part(body, new CapsuleMesh { Radius = r * 0.05f, Height = r * 0.85f }, dark,
                    new Vector3(side * r * 0.46f, y * 0.62f, (i / 2 - 1) * r * 0.42f),
                    null, new Vector3(0, 0, side * 38));
            }

            for (var s = -1; s <= 1; s += 2)
            {
                var w = Zx3D.Pivot(body, new Vector3(s * r * 0.22f, y + r * 0.4f, -r * 0.2f));
                wings.Add(w);
                Zx3D.Part(w, new SphereMesh { Radius = r * 0.66f, Height = r * 0.08f },
                    Zx3D.Flat(new Color(1f, 1f, 1f, 0.28f)), new Vector3(s * r * 0.66f, 0, 0));
            }
        }

        /// <summary>有翅的：蝙蝠是横展的膜翅，朱雀是竖着的鸟身加尾羽</summary>
        void Winged(Color c, float r, bool bird)
        {
            Top = r * 2.4f;
            floats = true;
            var mat = Zx3D.Mat(c, 0.85f, mats);
            var dark = Zx3D.Mat(c.Darkened(0.3f), 0.9f, mats);
            var y = r * 1.6f;

            Zx3D.Part(body, new CapsuleMesh { Radius = r * 0.42f, Height = r * 1.4f }, mat,
                new Vector3(0, y, 0), null, new Vector3(bird ? 72 : 0, 0, 0));

            var head = Zx3D.Pivot(body, new Vector3(0, y + (bird ? r * 0.36f : r * 0.62f), bird ? r * 0.42f : 0));
            Zx3D.Part(head, new SphereMesh { Radius = r * 0.34f, Height = r * 0.62f }, mat, Vector3.Zero);
            Eyes(head, r * 0.08f, r * 0.16f, r * 0.28f, r * 0.06f,
                bird ? new Color(1f, 0.8f, 0.3f) : new Color(0.95f, 0.3f, 0.3f));

            if (bird)
            {
                Zx3D.Part(head, new CylinderMesh { TopRadius = 0.001f, BottomRadius = r * 0.13f, Height = r * 0.44f },
                    Zx3D.Mat(new Color(0.96f, 0.76f, 0.28f), 0.5f, mats),
                    new Vector3(0, -r * 0.04f, r * 0.34f), null, new Vector3(90, 0, 0));
                // 尾羽：三片散开的长条，朱雀的招牌
                for (var i = -1; i <= 1; i++)
                {
                    Zx3D.Part(body, new BoxMesh { Size = Vector3.One }, dark,
                        new Vector3(i * r * 0.18f, y - r * 0.2f, -r * 1.1f),
                        new Vector3(r * 0.14f, r * 0.04f, r * 1.4f),
                        new Vector3(-14, i * 12, 0));
                }
            }
            else
            {
                for (var s = -1; s <= 1; s += 2)
                {
                    Zx3D.Part(head, new CylinderMesh { TopRadius = 0.001f, BottomRadius = r * 0.16f, Height = r * 0.4f },
                        dark, new Vector3(s * r * 0.18f, r * 0.34f, 0), null, new Vector3(-10, 0, s * 16));
                }
            }

            for (var s = -1; s <= 1; s += 2)
            {
                var w = Zx3D.Pivot(body, new Vector3(s * r * 0.3f, y, 0));
                wings.Add(w);
                // 膜翅分两段，扇动时有折角，比一块平板像翅膀
                Zx3D.Part(w, new BoxMesh { Size = Vector3.One }, dark,
                    new Vector3(s * r * 0.62f, 0, 0), new Vector3(r * 1.3f, r * 0.06f, r * 0.95f));
                Zx3D.Part(w, new BoxMesh { Size = Vector3.One }, dark,
                    new Vector3(s * r * 1.5f, -r * 0.12f, -r * 0.1f), new Vector3(r * 0.95f, r * 0.05f, r * 0.7f),
                    new Vector3(0, 0, s * 12));
            }
        }

        /// <summary>草木精怪：树桩身子 + 枝叶冠 + 一对发光的眼</summary>
        void Plant(Color c, float r)
        {
            Top = r * 3.6f;
            var stem = Zx3D.Mat(c.Darkened(0.35f), 1f, mats);
            var leaf = Zx3D.Mat(c, 1f, mats);

            var legL = Swinger(body, new Vector3(-r * 0.3f, r * 0.5f, 0), 0f, 0.35f);
            var legR = Swinger(body, new Vector3(r * 0.3f, r * 0.5f, 0), Mathf.Pi, 0.35f);
            var root = new CapsuleMesh { Radius = r * 0.16f, Height = r * 0.9f };
            Zx3D.Part(legL, root, stem, new Vector3(0, -r * 0.4f, 0));
            Zx3D.Part(legR, root, stem, new Vector3(0, -r * 0.4f, 0));

            torso = Zx3D.Pivot(body, new Vector3(0, r * 0.5f, 0));
            Zx3D.Part(torso, new CylinderMesh { TopRadius = r * 0.42f, BottomRadius = r * 0.7f, Height = r * 1.9f },
                stem, new Vector3(0, r * 0.95f, 0));
            Eyes(torso, r * 1.4f, r * 0.2f, r * 0.44f, r * 0.1f, new Color(1f, 0.93f, 0.5f));

            for (var i = 0; i < 5; i++)
            {
                var a = i * 1.3f;
                var rad = r * (0.5f + (i % 2) * 0.18f);
                Zx3D.Part(torso, new SphereMesh { Radius = rad, Height = rad * 1.4f }, leaf,
                    new Vector3(Mathf.Cos(a) * r * 0.55f, r * (2.05f + i * 0.2f), Mathf.Sin(a) * r * 0.55f));
            }
            // 两条枝丫当手臂
            for (var s = -1; s <= 1; s += 2)
            {
                var arm = Swinger(torso, new Vector3(s * r * 0.55f, r * 1.5f, 0), s > 0 ? 0f : Mathf.Pi, 0.3f);
                Zx3D.Part(arm, new CapsuleMesh { Radius = r * 0.11f, Height = r * 1f }, stem,
                    new Vector3(s * r * 0.2f, -r * 0.35f, 0), null, new Vector3(0, 0, s * 26));
            }
        }

        /// <summary>石傀儡：错位堆叠的石块，关节处露缝，眼睛是烧着的两点</summary>
        void Golem(Color c, float r)
        {
            var h = r * 4f;
            Top = h * 1.08f;
            var stone = Zx3D.Mat(c, 1f, mats);
            var dark = Zx3D.Mat(c.Darkened(0.32f), 1f, mats);
            var box = new BoxMesh { Size = Vector3.One };

            var legL = Swinger(body, new Vector3(-r * 0.46f, h * 0.36f, 0), 0f, 0.4f);
            var legR = Swinger(body, new Vector3(r * 0.46f, h * 0.36f, 0), Mathf.Pi, 0.4f);
            Zx3D.Part(legL, box, dark, new Vector3(0, -h * 0.18f, 0), new Vector3(r * 0.62f, h * 0.38f, r * 0.66f));
            Zx3D.Part(legR, box, dark, new Vector3(0, -h * 0.18f, 0), new Vector3(r * 0.62f, h * 0.38f, r * 0.66f));

            torso = Zx3D.Pivot(body, new Vector3(0, h * 0.36f, 0));
            Zx3D.Part(torso, box, stone, new Vector3(0, h * 0.22f, 0), new Vector3(r * 1.8f, h * 0.4f, r * 1.2f),
                new Vector3(0, 6, 0));
            Zx3D.Part(torso, box, dark, new Vector3(0, h * 0.44f, 0), new Vector3(r * 1.5f, h * 0.1f, r * 1.05f),
                new Vector3(0, -8, 0));

            var head = Zx3D.Pivot(torso, new Vector3(0, h * 0.56f, 0));
            Zx3D.Part(head, box, stone, Vector3.Zero, new Vector3(r * 0.95f, r * 0.85f, r * 0.9f),
                new Vector3(0, 10, 0));
            Eyes(head, 0f, r * 0.24f, r * 0.48f, r * 0.09f, new Color(1f, 0.45f, 0.22f));

            for (var s = -1; s <= 1; s += 2)
            {
                var arm = Swinger(torso, new Vector3(s * r * 1.05f, h * 0.38f, 0), s > 0 ? 0f : Mathf.Pi, 0.38f);
                Zx3D.Part(arm, box, dark, new Vector3(0, -h * 0.14f, 0), new Vector3(r * 0.55f, h * 0.3f, r * 0.55f));
                // 拳头比胳膊粗一圈，抡起来才有分量
                Zx3D.Part(arm, box, stone, new Vector3(0, -h * 0.32f, 0), new Vector3(r * 0.72f, r * 0.62f, r * 0.72f),
                    new Vector3(0, s * 12, 0));
            }
        }

        /// <summary>幽魂：兜帽 + 一路收窄到虚无的袍子，不投影、半透</summary>
        void Ghost(Color c, float r)
        {
            var h = r * 3.8f;
            Top = h;
            floats = true;

            var mat = Zx3D.Glow(c, 1.1f, 0.5f);
            var deep = Zx3D.Glow(c.Darkened(0.3f), 0.8f, 0.55f);

            // 影子会把「飘着」的感觉拆穿，所以这几块都不投影
            NoShadow(Zx3D.Part(body, new CylinderMesh { TopRadius = r * 0.62f, BottomRadius = 0.001f, Height = h * 0.72f },
                mat, new Vector3(0, h * 0.38f, 0)));
            NoShadow(Zx3D.Part(body, new SphereMesh { Radius = r * 0.56f, Height = r * 1.05f }, mat,
                new Vector3(0, h * 0.76f, 0)));
            // 兜帽：比头大一圈的半球，压出一张看不见脸的阴影
            NoShadow(Zx3D.Part(body, new SphereMesh { Radius = r * 0.66f, Height = r * 1f }, deep,
                new Vector3(0, h * 0.8f, -r * 0.06f)));
            Eyes(body, h * 0.76f, r * 0.19f, r * 0.42f, r * 0.08f, new Color(0.65f, 0.95f, 1f));

            // 两条飘着的袖子，代替手臂
            for (var s = -1; s <= 1; s += 2)
            {
                var sleeve = Zx3D.Pivot(body, new Vector3(s * r * 0.5f, h * 0.58f, 0));
                waves.Add(sleeve);
                NoShadow(Zx3D.Part(sleeve, new CylinderMesh { TopRadius = r * 0.2f, BottomRadius = 0.001f, Height = h * 0.3f },
                    mat, new Vector3(0, -h * 0.14f, 0)));
            }
        }

        static MeshInstance3D NoShadow(MeshInstance3D mi)
        {
            mi.CastShadow = GeometryInstance3D.ShadowCastingSetting.Off;
            return mi;
        }
    }
}
