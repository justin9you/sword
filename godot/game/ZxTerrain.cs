// 一张图的静态部分：地面、边墙、障碍、传送门、草木装饰。
//
// 全部按 World 里已经算好的像素坐标来摆——碰撞怎么判的，看到的就是什么样，
// 不存在「看着能过去其实撞墙」。障碍的高度纯是表现，逻辑层只认平面矩形。
//
// 换图就整棵丢掉重建（QueueFree），和逻辑层「一个 World 只管一张图」一个路子。

using Godot;
using Zhuxian.Core;
using Zhuxian.Data;

namespace Zhuxian.Godot
{
    public partial class ZxTerrain : Node3D
    {
        /// <summary>最多点几盏灯。灯笼火把这些每盏都是实时光源，铺满一张图会把帧数拖垮</summary>
        const int MaxLights = 6;

        ZxPalette pal;
        Mulberry32 rng;
        int lights;

        public static ZxTerrain Build(GameData data, World world, ZxPalette palette)
        {
            var t = new ZxTerrain
            {
                Name = "Terrain",
                pal = palette,
                // 同一张图每次进来草木长在同一个位置，靠的是拿地图 key 当种子
                rng = new Mulberry32(Zx3D.Seed(world.Key)),
            };
            t.Ground(world);
            t.Walls(world);
            t.Blocks(world);
            t.Portals(data, world);
            t.Decor(world);
            return t;
        }

        // ── 地面 ────────────────────────────────────────────────

        void Ground(World world)
        {
            var w = Zx3D.U(world.Width);
            var h = Zx3D.U(world.Height);

            // 地面是一张「一格一像素」的贴图：整张图多大就画多大，UV 一比一铺上去。
            // 关键是每格再乘一个随机的明暗——纯棋盘格远看就是一张国际象棋盘，
            // 有了这点噪声才像地面。
            var img = Image.CreateEmpty(world.Def.w, world.Def.h, false, Image.Format.Rgb8);
            for (var y = 0; y < world.Def.h; y++)
            {
                for (var x = 0; x < world.Def.w; x++)
                {
                    var c = (x + y) % 2 == 0 ? pal.Ground : pal.Ground2;
                    var shade = (float)rng.Range(-0.05, 0.05);
                    img.SetPixel(x, y, shade >= 0 ? c.Lightened(shade) : c.Darkened(-shade));
                }
            }

            var mat = new StandardMaterial3D
            {
                AlbedoTexture = ImageTexture.CreateFromImage(img),
                TextureFilter = BaseMaterial3D.TextureFilterEnum.Nearest,
                Roughness = 1f,
                Metallic = 0f,
                DiffuseMode = BaseMaterial3D.DiffuseModeEnum.Toon,
                SpecularMode = BaseMaterial3D.SpecularModeEnum.Toon,
            };

            var mi = new MeshInstance3D
            {
                Mesh = new PlaneMesh { Size = new Vector2(w, h) },
                MaterialOverride = mat,
                Position = new Vector3(w / 2f, 0f, h / 2f),
                // 地面只收阴影不投阴影，省一遍阴影图
                CastShadow = GeometryInstance3D.ShadowCastingSetting.Off,
            };
            AddChild(mi);
        }

        /// <summary>
        /// 地图边界的围墙。逻辑层判「出界即不可通行」，但玩家看不见这条线，
        /// 撞上去会以为是卡住了，所以把它画出来。
        ///
        /// 刻意用朝里的单面片，不用有厚度的方块：人贴着边走时镜头会退到墙外，
        /// 那时候实心墙会糊住半个屏幕，而单面片从背后是看不见的。
        /// </summary>
        void Walls(World world)
        {
            var w = Zx3D.U(world.Width);
            var h = Zx3D.U(world.Height);
            const float tall = 2.2f;

            var mat = Zx3D.Mat(pal.Ink.Lerp(pal.Ground, 0.25f), 1f);
            var wide = new QuadMesh { Size = new Vector2(w, tall) };
            var deep = new QuadMesh { Size = new Vector2(h, tall) };

            NoShadow(Zx3D.Part(this, wide, mat, new Vector3(w / 2f, tall / 2f, 0), null, Vector3.Zero));
            NoShadow(Zx3D.Part(this, wide, mat, new Vector3(w / 2f, tall / 2f, h), null, new Vector3(0, 180, 0)));
            NoShadow(Zx3D.Part(this, deep, mat, new Vector3(0, tall / 2f, h / 2f), null, new Vector3(0, 90, 0)));
            NoShadow(Zx3D.Part(this, deep, mat, new Vector3(w, tall / 2f, h / 2f), null, new Vector3(0, -90, 0)));
        }

        static void NoShadow(MeshInstance3D mi)
        {
            mi.CastShadow = GeometryInstance3D.ShadowCastingSetting.Off;
        }

        // ── 障碍 ────────────────────────────────────────────────

        void Blocks(World world)
        {
            var biome = world.Def.biome;
            var house = biome == "village" || biome == "town";
            var box = new BoxMesh { Size = Vector3.One };

            foreach (var b in world.Blocks)
            {
                var w = Zx3D.U(b.w);
                var d = Zx3D.U(b.h);
                var cx = Zx3D.U(b.x) + w / 2f;
                var cz = Zx3D.U(b.y) + d / 2f;

                if (house) House(box, cx, cz, w, d);
                else Boulder(box, cx, cz, w, d);
            }
        }

        /// <summary>
        /// 村镇里的障碍是房子。
        ///
        /// 土墙特意不取地面色系：整张图已经是一片绿了，房子再用绿的就糊成一坨。
        /// 屋脊、门、窗这三样加起来不到十行，但「有人住」和「一个方块」的差别就在这儿。
        /// </summary>
        void House(Mesh box, float cx, float cz, float w, float d)
        {
            var wall = 1.5f + (float)rng.Next() * 0.4f;
            var wallMat = ZxWash.FadeNear(ZxWash.Mat(new Color(0.9f, 0.88f, 0.84f), 0.34f), 3.0f);
            var roofMat = ZxWash.FadeNear(ZxWash.Mat(pal.Ink, 0.92f), 3.0f);
            var woodMat = ZxWash.FadeNear(ZxWash.Mat(new Color(0.35f, 0.26f, 0.2f), 0.85f), 3.0f);

            Zx3D.Part(this, box, wallMat, new Vector3(cx, wall / 2f, cz), new Vector3(w, wall, d));

            // 屋顶出檐：比墙宽一圈，屋檐的阴影会在墙上压一道，立体感全靠它
            Zx3D.Part(this, new PrismMesh { Size = Vector3.One }, roofMat,
                new Vector3(cx, wall + 0.45f, cz), new Vector3(w * 1.24f, 0.9f, d * 1.24f));
            Zx3D.Part(this, box, woodMat, new Vector3(cx, wall + 0.9f, cz),
                new Vector3(w * 1.28f, 0.12f, 0.16f));

            // 门朝南（+Z），窗开在门旁边
            Zx3D.Part(this, box, woodMat, new Vector3(cx, 0.42f, cz + d / 2f),
                new Vector3(0.62f, 0.84f, 0.08f));
            Zx3D.Part(this, box, woodMat, new Vector3(cx + w * 0.3f, wall * 0.62f, cz + d / 2f),
                new Vector3(0.42f, 0.36f, 0.08f));
        }

        /// <summary>野外的障碍是石堆：几块歪着的方块叠一起，别太整齐</summary>
        void Boulder(Mesh box, float cx, float cz, float w, float d)
        {
            var mat = ZxWash.FadeNear(ZxWash.Mat(pal.Ink.Lerp(pal.Ground2, 0.5f), 0.62f), 3.0f);
            var h = 0.85f + (float)rng.Next() * 0.7f;
            Zx3D.Part(this, box, mat, new Vector3(cx, h / 2f, cz),
                new Vector3(w, h, d), new Vector3(0, (float)rng.Range(-6, 6), 0));

            var lumps = 3 + (int)(rng.Next() * 3);
            for (var i = 0; i < lumps; i++)
            {
                var s = 0.35f + (float)rng.Next() * 0.45f;
                Zx3D.Part(this, box, mat,
                    new Vector3(cx + (float)rng.Range(-w / 2, w / 2), h + s * 0.35f, cz + (float)rng.Range(-d / 2, d / 2)),
                    new Vector3(s * 1.6f, s, s * 1.6f),
                    new Vector3((float)rng.Range(-12, 12), (float)rng.Range(0, 90), (float)rng.Range(-12, 12)));
            }
        }

        // ── 传送门 ──────────────────────────────────────────────

        void Portals(GameData data, World world)
        {
            foreach (var p in world.Portals)
            {
                var target = data.Map(p.to);
                var r = Zx3D.U(p.r);
                var node = new Node3D { Position = Zx3D.Pos(p.x, p.y) };
                AddChild(node);

                var glow = Zx3D.Glow(pal.Accent.Lerp(Colors.White, 0.35f), 2.2f);
                Zx3D.Part(node, new TorusMesh { InnerRadius = r * 0.78f, OuterRadius = r }, glow, new Vector3(0, 0.06f, 0));

                // 一根半透明的光柱，隔着半张图也看得见门在哪
                Zx3D.Part(node, new CylinderMesh { TopRadius = r * 0.5f, BottomRadius = r * 0.85f, Height = 3.4f },
                    Zx3D.Glow(pal.Accent, 1.1f, 0.16f), new Vector3(0, 1.7f, 0));

                node.AddChild(new Label3D
                {
                    Text = target != null ? "往 " + target.name : "传送",
                    Font = ZxFont.Get(),
                    FontSize = 42,
                    PixelSize = 0.004f,
                    Billboard = BaseMaterial3D.BillboardModeEnum.Enabled,
                    Modulate = pal.Accent.Lerp(Colors.White, 0.6f),
                    OutlineSize = 14,
                    Position = new Vector3(0, 2.1f, 0),
                });
            }
        }

        // ── 草木 ────────────────────────────────────────────────

        void Decor(World world)
        {
            if (world.Def.decor == null) return;
            var t = Zx3D.Tile;

            foreach (var d in world.Def.decor)
            {
                for (var i = 0; i < d.count; i++)
                {
                    // 找个不压墙的位置。找不到就跳过这一株，不硬塞
                    for (var tries = 0; tries < 8; tries++)
                    {
                        var x = rng.Range(t * 0.6, world.Width - t * 0.6);
                        var y = rng.Range(t * 0.6, world.Height - t * 0.6);
                        if (world.Blocked(x, y, t * 0.45)) continue;
                        Piece(d.kind, Zx3D.Pos(x, y));
                        break;
                    }
                }
            }
        }

        void Piece(string kind, Vector3 at)
        {
            var node = new Node3D { Position = at, RotationDegrees = new Vector3(0, (float)rng.Range(0, 360), 0) };
            AddChild(node);

            switch (kind)
            {
                case "tree": Tree(node, pal.Accent, 1f); break;
                case "deadtree": Tree(node, pal.Ink.Lerp(pal.Ground2, 0.5f), 0f); break;
                case "bamboo": Bamboo(node); break;
                case "rock": Rock(node, pal.Ground2.Lightened(0.1f)); break;
                case "bone": Rock(node, new Color(0.82f, 0.80f, 0.72f)); break;
                case "stalag": Spike(node, pal.Ground2.Lightened(0.15f), 1.8f, false); break;
                case "crystal": Spike(node, pal.Accent, 1.4f, true); break;
                case "pillar": Pillar(node); break;
                case "stall": Stall(node); break;
                case "lantern": Lamp(node, new Color(1f, 0.72f, 0.35f), 1.7f); break;
                case "torch": Lamp(node, new Color(1f, 0.55f, 0.22f), 1.4f); break;
                case "lava":
                case "ember": Puddle(node, new Color(1f, 0.42f, 0.18f), true); break;
                case "swamp": Puddle(node, pal.Accent.Darkened(0.4f), false); break;
                case "sword": Blade(node); break;
                case "cloud":
                case "fog": Haze(node); break;
                case "bat": Flyer(node, pal.Ink.Lerp(Colors.White, 0.18f)); break;
                default: Tuft(node); break;   // grass、vine 之类的杂草都走这条
            }
        }

        void Tree(Node3D n, Color leaf, float density)
        {
            var h = (float)rng.Range(1.6, 2.6);
            Zx3D.Part(n, new CylinderMesh { TopRadius = 0.07f, BottomRadius = 0.12f, Height = h },
                Zx3D.FadeNear(ZxWash.Mat(pal.Ink, 0.95f)), new Vector3(0, h / 2f, 0));

            if (density <= 0)
            {
                // 枯树：光秃秃几根斜枝
                for (var i = 0; i < 3; i++)
                {
                    Zx3D.Part(n, new CylinderMesh { TopRadius = 0.02f, BottomRadius = 0.05f, Height = 0.7f },
                        Zx3D.Mat(pal.Ink.Lerp(pal.Ground2, 0.35f), 1f),
                        new Vector3(0, h * 0.75f + i * 0.14f, 0),
                        null, new Vector3((float)rng.Range(-45, 45), i * 120, (float)rng.Range(20, 55)));
                }
                return;
            }

            // 树冠用几团深浅不同、横着错开的球——一串同色的球叠上去就是棒棒糖
            var lit = Zx3D.FadeNear(ZxWash.Mat(leaf, 0.82f));
            var shade = Zx3D.FadeNear(ZxWash.Mat(leaf.Darkened(0.35f), 1f));
            var crown = h * 0.84f;

            Zx3D.Part(n, new SphereMesh { Radius = 0.58f, Height = 0.82f }, shade,
                new Vector3(0, crown + 0.08f, 0));
            for (var i = 0; i < 4; i++)
            {
                var a = i * 1.7f + (float)rng.Next();
                var r = (float)rng.Range(0.3, 0.46);
                Zx3D.Part(n, new SphereMesh { Radius = r, Height = r * 1.55f }, i % 2 == 0 ? lit : shade,
                    new Vector3(
                        Mathf.Cos(a) * 0.38f,
                        crown + (float)rng.Range(0.14, 0.42),
                        Mathf.Sin(a) * 0.38f));
            }
        }

        void Bamboo(Node3D n)
        {
            var mat = Zx3D.FadeNear(Zx3D.Mat(new Color(0.42f, 0.66f, 0.34f), 0.9f));
            var leaf = Zx3D.FadeNear(Zx3D.Mat(new Color(0.55f, 0.79f, 0.45f), 0.95f));

            for (var i = 0; i < 3; i++)
            {
                var h = (float)rng.Range(2.4, 3.6);
                var off = new Vector3((float)rng.Range(-0.22, 0.22), h / 2f, (float)rng.Range(-0.22, 0.22));
                Zx3D.Part(n, new CylinderMesh { TopRadius = 0.05f, BottomRadius = 0.06f, Height = h }, mat, off,
                    null, new Vector3((float)rng.Range(-5, 5), 0, (float)rng.Range(-5, 5)));

                // 竹叶是斜挑出去的几片，不是顶一个球——顶球看着像蘑菇
                for (var k = 0; k < 4; k++)
                {
                    var a = k * 1.6f + (float)rng.Next();
                    var y = h * (0.62f + k * 0.11f);
                    Zx3D.Part(n, new BoxMesh { Size = Vector3.One }, leaf,
                        new Vector3(off.X + Mathf.Cos(a) * 0.26f, y, off.Z + Mathf.Sin(a) * 0.26f),
                        new Vector3(0.5f, 0.015f, 0.12f),
                        new Vector3(0, -Mathf.RadToDeg(a), (float)rng.Range(12, 30)));
                }
            }
        }

        void Rock(Node3D n, Color c)
        {
            var s = (float)rng.Range(0.3, 0.62);
            Zx3D.Part(n, new SphereMesh { Radius = s, Height = s * 1.3f }, Zx3D.Mat(c, 1f),
                new Vector3(0, s * 0.42f, 0),
                new Vector3(1f, 0.72f, (float)rng.Range(0.8, 1.25)),
                new Vector3((float)rng.Range(-15, 15), 0, (float)rng.Range(-15, 15)));
        }

        void Spike(Node3D n, Color c, float tall, bool glow)
        {
            var h = (float)rng.Range(tall * 0.6, tall);
            Material mat = glow ? Zx3D.Glow(c, 1.3f) : Zx3D.Mat(c, 0.85f);
            Zx3D.Part(n, new CylinderMesh { TopRadius = 0.01f, BottomRadius = (float)rng.Range(0.18, 0.32), Height = h },
                mat, new Vector3(0, h / 2f, 0), null, new Vector3((float)rng.Range(-8, 8), 0, (float)rng.Range(-8, 8)));
        }

        void Pillar(Node3D n)
        {
            var h = (float)rng.Range(2.4, 3.6);
            Zx3D.Part(n, new CylinderMesh { TopRadius = 0.26f, BottomRadius = 0.3f, Height = h },
                Zx3D.Mat(pal.Ground2.Lightened(0.18f), 0.9f), new Vector3(0, h / 2f, 0));
            Zx3D.Part(n, new BoxMesh { Size = Vector3.One }, Zx3D.Mat(pal.Ink.Lerp(pal.Ground2, 0.6f), 0.9f),
                new Vector3(0, h + 0.09f, 0), new Vector3(0.78f, 0.18f, 0.78f));
        }

        void Stall(Node3D n)
        {
            Zx3D.Part(n, new BoxMesh { Size = Vector3.One }, Zx3D.Mat(pal.Ground2.Lightened(0.2f), 0.95f),
                new Vector3(0, 0.36f, 0), new Vector3(1.3f, 0.72f, 0.9f));
            Zx3D.Part(n, new BoxMesh { Size = Vector3.One }, Zx3D.Mat(new Color(0.72f, 0.28f, 0.24f), 0.95f),
                new Vector3(0, 0.95f, 0), new Vector3(1.6f, 0.12f, 1.2f));
        }

        void Lamp(Node3D n, Color c, float h)
        {
            Zx3D.Part(n, new CylinderMesh { TopRadius = 0.04f, BottomRadius = 0.06f, Height = h },
                Zx3D.Mat(pal.Ink, 1f), new Vector3(0, h / 2f, 0));
            Zx3D.Part(n, new SphereMesh { Radius = 0.17f, Height = 0.36f }, Zx3D.Glow(c, 2.4f),
                new Vector3(0, h + 0.1f, 0));

            if (lights >= MaxLights) return;
            lights++;
            n.AddChild(new OmniLight3D
            {
                Position = new Vector3(0, h + 0.1f, 0),
                LightColor = c,
                LightEnergy = 1.6f,
                OmniRange = 7f,
                ShadowEnabled = false,
            });
        }

        void Puddle(Node3D n, Color c, bool hot)
        {
            var r = (float)rng.Range(0.5, 1.1);
            Material mat = hot ? Zx3D.Glow(c, 1.8f, 0.9f) : Zx3D.Mat(c, 0.25f);
            Zx3D.Part(n, new CylinderMesh { TopRadius = r, BottomRadius = r, Height = 0.06f }, mat,
                new Vector3(0, 0.03f, 0));

            if (!hot || lights >= MaxLights) return;
            lights++;
            n.AddChild(new OmniLight3D
            {
                Position = new Vector3(0, 0.5f, 0),
                LightColor = c,
                LightEnergy = 1.3f,
                OmniRange = 6f,
                ShadowEnabled = false,
            });
        }

        void Blade(Node3D n)
        {
            var mat = Zx3D.Mat(new Color(0.68f, 0.72f, 0.78f), 0.35f);
            Zx3D.Part(n, new BoxMesh { Size = Vector3.One }, mat, new Vector3(0, 0.62f, 0),
                new Vector3(0.06f, 1.25f, 0.012f), new Vector3((float)rng.Range(-14, 14), 0, (float)rng.Range(-14, 14)));
        }

        void Tuft(Node3D n)
        {
            // 草要吃光。用不吃光的材质会在暗处自己发亮，一地荧光草
            var mat = Zx3D.Mat(pal.Accent.Darkened(0.25f), 1f);
            for (var i = 0; i < 3; i++)
            {
                var h = (float)rng.Range(0.22, 0.42);
                Zx3D.Part(n, new CylinderMesh { TopRadius = 0.004f, BottomRadius = 0.03f, Height = h }, mat,
                    new Vector3((float)rng.Range(-0.12, 0.12), h / 2f, (float)rng.Range(-0.12, 0.12)),
                    null, new Vector3((float)rng.Range(-18, 18), 0, (float)rng.Range(-18, 18)));
            }
        }

        void Haze(Node3D n)
        {
            var r = (float)rng.Range(1.2, 2.4);
            Zx3D.Part(n, new SphereMesh { Radius = r, Height = r * 0.7f },
                Zx3D.Flat(new Color(pal.Ink.R, pal.Ink.G, pal.Ink.B, 0.1f)),
                new Vector3(0, (float)rng.Range(1.6, 3.2), 0));
        }

        void Flyer(Node3D n, Color c)
        {
            var y = (float)rng.Range(2.2, 3.4);
            Zx3D.Part(n, new SphereMesh { Radius = 0.1f, Height = 0.16f }, Zx3D.Mat(c, 1f), new Vector3(0, y, 0));
            for (var s = -1; s <= 1; s += 2)
            {
                Zx3D.Part(n, new BoxMesh { Size = Vector3.One }, Zx3D.Flat(new Color(c.R, c.G, c.B, 0.85f)),
                    new Vector3(s * 0.16f, y, 0), new Vector3(0.26f, 0.012f, 0.14f),
                    new Vector3(0, 0, s * 18f));
            }
        }
    }
}
