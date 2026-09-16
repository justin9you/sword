// 人物与怪物的模型：搭骨架、做动作。各种形态的具体长相在 ZxFigure.Beasts.cs。
//
// 为什么不导美术资源：这个工程从网页版起就是「零依赖、零外部素材」，
// 3D 这边继续守着——55 种怪按 art 字段归成 12 类形态，颜色从数据里取，
// 加一种怪只要给它挑个 art 和颜色，模型自动有。
//
// 搭的时候有三条经验：
//   · 先立剪影。袍子是上窄下宽的锥，野兽是背脊隆起的梭形——远看认得出是什么，
//     才轮得到细节。一堆等粗的圆柱就是没有剪影。
//   · 一定要有眼睛。两个小黑点的成本几乎为零，但「活物」和「几何体」的差别全在这儿。
//   · 动作分层。腿挂在胯上、手挂在肩上、整个人挂在 body 上，
//     走路摆腿、挥砍抡手、呼吸起伏互不干扰。
//
// 比例跟着逻辑层的半径走（monsters.json 里的 radius，像素），
// 所以「看着大的怪打击范围也大」是真的，不是巧合。

using System.Collections.Generic;
using Godot;

namespace Zhuxian.Godot
{
    public partial class ZxFigure : Node3D
    {
        /// <summary>一条会摆动的肢体。相位错开，两条腿才不会同手同脚</summary>
        class Limb
        {
            public Node3D Node;
            public float Phase;
            public float Amp = 1f;
        }

        readonly List<ShaderMaterial> mats = new List<ShaderMaterial>();
        readonly List<Limb> limbs = new List<Limb>();
        readonly List<Node3D> wings = new List<Node3D>();
        readonly List<Node3D> waves = new List<Node3D>();

        Node3D body;
        Node3D torso;
        Node3D armR;

        float baseY;
        float lean;
        bool floats;
        double phase;
        float flash;

        /// <summary>头顶高度（单位）。血条和名字挂在这个位置之上</summary>
        public float Top { get; private set; }

        public static ZxFigure Make(string art, Color color, double radiusPx, bool armed = false)
        {
            var f = new ZxFigure { Name = "Figure" };
            var r = Zx3D.U(radiusPx);
            f.body = Zx3D.Pivot(f, Vector3.Zero);

            switch (art)
            {
                case "beast": f.Beast(color, r, false); break;
                case "fox": f.Beast(color, r, true); break;
                case "snake": f.Snake(color, r); break;
                case "insect": f.Insect(color, r); break;
                case "plant": f.Plant(color, r); break;
                case "bat": f.Winged(color, r, false); break;
                case "bird": f.Winged(color, r, true); break;
                case "golem": f.Golem(color, r); break;
                case "ghost": f.Ghost(color, r); break;
                case "skeleton": f.Humanoid(new Color(0.87f, 0.86f, 0.79f), r, HumanStyle.Bones, armed); break;
                case "zombie": f.Humanoid(color, r, HumanStyle.Hunched, armed); break;
                default: f.Humanoid(color, r, HumanStyle.Robed, armed); break;
            }

            f.baseY = f.body.Position.Y;
            return f;
        }

        // ── 每帧 ────────────────────────────────────────────────

        /// <summary>
        /// moving 决定摆腿，swing01 是挥砍进度（1→0），flash01 是挨打闪白的强度（1→0）。
        /// 三个量都由逻辑层的状态推出来，这里只负责把它们变成姿势。
        /// </summary>
        public void Tick(double dt, bool moving, double swing01, double flash01)
        {
            phase += dt * (moving ? 9.5 : 1.8);
            var t = (float)phase;
            var gait = moving ? 1f : 0.08f;

            for (var i = 0; i < limbs.Count; i++)
            {
                var limb = limbs[i];
                if (limb.Node == armR && swing01 > 0) continue; // 抡手时右臂归挥砍管
                limb.Node.Rotation = new Vector3(Mathf.Sin(t + limb.Phase) * limb.Amp * gait, 0, 0);
            }

            if (armR != null && swing01 > 0)
            {
                // 从后抡到前，收尾比起手快——快慢有别才像一刀，匀速像体操
                var k = 1f - (float)swing01;
                armR.Rotation = new Vector3(-Mathf.Sin(k * Mathf.Pi) * 2.2f, 0, 0);
            }

            for (var i = 0; i < wings.Count; i++)
            {
                var side = i % 2 == 0 ? 1f : -1f;
                wings[i].Rotation = new Vector3(0, 0, side * (0.45f + Mathf.Sin(t * 2.4f) * 0.55f));
            }

            for (var i = 0; i < waves.Count; i++)
            {
                var seg = waves[i];
                seg.Position = new Vector3(Mathf.Sin(t * 1.5f + i * 0.8f) * 0.14f, seg.Position.Y, seg.Position.Z);
            }

            if (torso != null)
            {
                // 走起来身子前倾一点，停下回正。少了这一下，人是「平移的雕像」
                var want = moving ? lean + 9f : lean;
                torso.RotationDegrees = new Vector3(
                    Mathf.Lerp(torso.RotationDegrees.X, want, Mathf.Min(1f, (float)dt * 8f)), 0, 0);
            }

            if (body != null)
            {
                var bob = floats
                    ? Mathf.Sin(t * 0.7f) * 0.1f
                    : Mathf.Abs(Mathf.Sin(t)) * (moving ? 0.045f : 0.014f);
                body.Position = new Vector3(body.Position.X, baseY + bob, body.Position.Z);
            }

            SetFlash((float)flash01);
        }

        /// <summary>
        /// 挨打的一瞬间墨色被冲淡一下，像泼了笔清水。
        /// 不是「发白光」——水墨里没有光，只有墨的浓淡。
        /// </summary>
        void SetFlash(float amount)
        {
            if (Mathf.IsEqualApprox(amount, flash)) return;
            flash = amount;
            for (var i = 0; i < mats.Count; i++)
            {
                mats[i].SetShaderParameter("flash", amount);
            }
        }

        /// <summary>死亡：整只压扁并沉进地里，由 ZxActor 按毫秒喂进度</summary>
        public void Collapse(float t01)
        {
            if (body == null) return;
            var k = Mathf.Clamp(t01, 0f, 1f);
            body.Scale = new Vector3(1f + k * 0.35f, Mathf.Max(0.05f, 1f - k), 1f + k * 0.35f);
            body.Position = new Vector3(body.Position.X, baseY - k * 0.25f, body.Position.Z);
        }

        // ── 搭骨架用的小件 ──────────────────────────────────────

        Node3D Swinger(Node3D parent, Vector3 at, float phaseOffset, float amp = 0.6f)
        {
            var pivot = Zx3D.Pivot(parent, at);
            limbs.Add(new Limb { Node = pivot, Phase = phaseOffset, Amp = amp });
            return pivot;
        }

        /// <summary>
        /// 两只眼睛。成本极低，回报极高——有眼睛的是活物，没眼睛的是道具。
        /// forward 是脸朝哪边（+Z 是模型的正面）。
        /// </summary>
        void Eyes(Node3D parent, float y, float spread, float forward, float size, Color? glow = null)
        {
            Material mat = glow.HasValue
                ? Zx3D.Glow(glow.Value, 2.2f)
                : Zx3D.Mat(new Color(0.08f, 0.07f, 0.09f), 0.4f);
            var mesh = new SphereMesh { Radius = size, Height = size * 2f };
            for (var s = -1; s <= 1; s += 2)
            {
                Zx3D.Part(parent, mesh, mat, new Vector3(s * spread, y, forward));
            }
        }

        // ── 人形 ────────────────────────────────────────────────

        enum HumanStyle { Robed, Bones, Hunched }

        /// <summary>
        /// 修士的剪影：上窄下宽的道袍 + 束腰 + 发髻。
        /// 腿只露一截靴子——袍子底下本来也看不见腿，省下来的面数拿去做袖子更值。
        /// </summary>
        void Humanoid(Color c, float r, HumanStyle style, bool armed)
        {
            var bony = style == HumanStyle.Bones;
            var h = r * 4.6f;
            Top = h * 1.1f;
            lean = style == HumanStyle.Hunched ? 18f : 0f;

            var cloth = Zx3D.Mat(c, 0.92f, mats);
            var dark = Zx3D.Mat(c.Darkened(0.42f), 0.92f, mats);
            var skin = Zx3D.Mat(bony ? c : c.Lerp(new Color(0.96f, 0.86f, 0.74f), 0.75f), 0.75f, mats);
            var hair = Zx3D.Mat(bony ? c.Darkened(0.2f) : new Color(0.13f, 0.12f, 0.14f), 0.85f, mats);

            // 靴子：挂在胯上摆，袍子下摆只遮到脚踝
            var bootMesh = new BoxMesh { Size = Vector3.One };
            var legL = Swinger(body, new Vector3(-r * 0.3f, h * 0.2f, 0), 0f, 0.5f);
            var legR = Swinger(body, new Vector3(r * 0.3f, h * 0.2f, 0), Mathf.Pi, 0.5f);
            Zx3D.Part(legL, bootMesh, dark, new Vector3(0, -h * 0.09f, r * 0.08f), new Vector3(r * 0.36f, h * 0.12f, r * 0.62f));
            Zx3D.Part(legR, bootMesh, dark, new Vector3(0, -h * 0.09f, r * 0.08f), new Vector3(r * 0.36f, h * 0.12f, r * 0.62f));

            torso = Zx3D.Pivot(body, new Vector3(0, h * 0.2f, 0));
            torso.RotationDegrees = new Vector3(lean, 0, 0);

            if (bony)
            {
                // 白骨兵没有袍子，露的是肋骨
                Zx3D.Part(torso, new CylinderMesh { TopRadius = r * 0.34f, BottomRadius = r * 0.3f, Height = h * 0.42f },
                    skin, new Vector3(0, h * 0.24f, 0));
                for (var i = 0; i < 4; i++)
                {
                    Zx3D.Part(torso, new BoxMesh { Size = Vector3.One }, skin,
                        new Vector3(0, h * 0.14f + i * r * 0.3f, r * 0.1f),
                        new Vector3(r * 0.78f - i * r * 0.06f, r * 0.09f, r * 0.5f));
                }
            }
            else
            {
                // 道袍：一只上窄下宽的锥。剪影全靠它
                Zx3D.Part(torso, new CylinderMesh { TopRadius = r * 0.46f, BottomRadius = r * 1.02f, Height = h * 0.46f },
                    cloth, new Vector3(0, h * 0.23f, 0));
                // 束腰
                Zx3D.Part(torso, new CylinderMesh { TopRadius = r * 0.56f, BottomRadius = r * 0.58f, Height = h * 0.06f },
                    dark, new Vector3(0, h * 0.3f, 0));
                // 前襟：一条竖着的深色带子，正面才不是一块素色
                Zx3D.Part(torso, new BoxMesh { Size = Vector3.One }, dark,
                    new Vector3(0, h * 0.26f, r * 0.42f), new Vector3(r * 0.18f, h * 0.4f, r * 0.12f));
            }

            // 肩：两个小球把袖子和身子接上，不然胳膊像插进去的筷子
            var shoulderY = h * 0.44f;
            Zx3D.Part(torso, new SphereMesh { Radius = r * 0.52f, Height = r * 0.78f }, cloth,
                new Vector3(0, shoulderY, 0));

            var armL = Swinger(torso, new Vector3(-r * 0.5f, shoulderY, 0), Mathf.Pi, 0.45f);
            armR = Swinger(torso, new Vector3(r * 0.5f, shoulderY, 0), 0f, 0.45f);
            if (style == HumanStyle.Hunched)
            {
                // 尸魔是端着手走的
                armL.RotationDegrees = new Vector3(-72, 0, 0);
                armR.RotationDegrees = new Vector3(-72, 0, 0);
                limbs.RemoveAll(l => l.Node == armL);
            }

            foreach (var arm in new[] { armL, armR })
            {
                if (!bony)
                {
                    // 袖：上臂外面罩一截喇叭口
                    Zx3D.Part(arm, new CylinderMesh { TopRadius = r * 0.26f, BottomRadius = r * 0.34f, Height = h * 0.2f },
                        cloth, new Vector3(0, -h * 0.1f, 0));
                }
                Zx3D.Part(arm, new CapsuleMesh { Radius = r * 0.12f, Height = h * 0.3f }, skin,
                    new Vector3(0, -h * 0.2f, 0));
            }

            // 头：脸 + 发 + 髻。发髻是「修士」这个身份最省事的记号
            var headY = h * 0.62f;
            var head = Zx3D.Pivot(torso, new Vector3(0, headY, 0));
            Zx3D.Part(head, new SphereMesh { Radius = r * 0.4f, Height = r * 0.88f }, skin, Vector3.Zero);
            Eyes(head, r * 0.06f, r * 0.16f, r * 0.34f, r * 0.06f,
                style == HumanStyle.Hunched ? new Color(1f, 0.4f, 0.35f) : (Color?)null);

            if (!bony)
            {
                Zx3D.Part(head, new SphereMesh { Radius = r * 0.44f, Height = r * 0.8f }, hair,
                    new Vector3(0, r * 0.12f, -r * 0.05f));
                Zx3D.Part(head, new CylinderMesh { TopRadius = r * 0.13f, BottomRadius = r * 0.2f, Height = r * 0.34f },
                    hair, new Vector3(0, r * 0.5f, -r * 0.02f));
            }

            if (!armed) return;
            // 剑：刃 + 格 + 柄，握在右手里跟着抡
            var steel = Zx3D.Mat(new Color(0.80f, 0.84f, 0.9f), 0.25f, mats);
            var grip = Zx3D.Mat(new Color(0.22f, 0.18f, 0.16f), 0.9f, mats);
            Zx3D.Part(armR, new BoxMesh { Size = Vector3.One }, grip,
                new Vector3(0, -h * 0.28f, r * 0.1f), new Vector3(r * 0.1f, r * 0.1f, h * 0.14f));
            Zx3D.Part(armR, new BoxMesh { Size = Vector3.One }, steel,
                new Vector3(0, -h * 0.28f, r * 0.24f), new Vector3(r * 0.42f, r * 0.08f, r * 0.1f));
            Zx3D.Part(armR, new BoxMesh { Size = Vector3.One }, steel,
                new Vector3(0, -h * 0.28f, r * 0.24f + h * 0.3f), new Vector3(r * 0.1f, r * 0.05f, h * 0.6f));
        }
    }
}
