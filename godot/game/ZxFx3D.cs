// 特效层：飞行物、法术光效、飘字。
//
// 逻辑层已经把这些东西算好了（Fx.Bolts / Fx.Visuals 里躺着的就是），
// 这里做的只是「把清单同步成节点」——每帧对一遍，新的补上、没了的删掉。
// 所以特效的命中范围和看到的一致：画的半径就是判定的半径。

using System.Collections.Generic;
using Godot;
using Zhuxian.Core;

namespace Zhuxian.Godot
{
    public partial class ZxFx3D : Node3D
    {
        readonly Dictionary<int, Node3D> bolts = new Dictionary<int, Node3D>();
        readonly Dictionary<VisualFx, Node3D> visuals = new Dictionary<VisualFx, Node3D>();
        readonly List<Floater> floaters = new List<Floater>();
        readonly List<int> gone = new List<int>();
        readonly List<VisualFx> goneFx = new List<VisualFx>();

        class Floater
        {
            public Label3D Node;
            public double Life;
            public double Total;
            public Vector3 From;
        }

        public void Sync(GameContext game, double dt)
        {
            SyncBolts(game);
            SyncVisuals(game);
            TickFloaters(dt);
        }

        // ── 飞行物 ──────────────────────────────────────────────

        void SyncBolts(GameContext game)
        {
            var live = game.Fx.Bolts;
            for (var i = 0; i < live.Count; i++)
            {
                var b = live[i];
                Node3D n;
                if (!bolts.TryGetValue(b.uid, out n))
                {
                    n = MakeBolt(b);
                    bolts[b.uid] = n;
                    AddChild(n);
                }
                n.Position = Zx3D.Pos(b.x, b.y, 0.55f);
                n.Rotation = new Vector3(0, Zx3D.Yaw(b.dx, b.dy), 0);
            }

            // 逻辑层删掉的（打中了、飞到头了）跟着删
            gone.Clear();
            foreach (var kv in bolts)
            {
                var alive = false;
                for (var i = 0; i < live.Count && !alive; i++) alive = live[i].uid == kv.Key;
                if (!alive) gone.Add(kv.Key);
            }
            for (var i = 0; i < gone.Count; i++)
            {
                bolts[gone[i]].QueueFree();
                bolts.Remove(gone[i]);
            }
        }

        static Node3D MakeBolt(Bolt b)
        {
            var color = Zx3D.Hex(b.color, new Color(0.7f, 0.86f, 1f));
            var r = Mathf.Max(0.08f, Zx3D.U(b.width) * 0.5f);
            var n = new Node3D();
            var mat = Zx3D.Glow(color, 1.5f);

            if (b.kind == "pierce")
            {
                // 穿刺是一道横着飞的剑气，拉长比球更像
                Zx3D.Part(n, new BoxMesh { Size = Vector3.One }, mat, Vector3.Zero,
                    new Vector3(r * 0.5f, r * 0.5f, r * 4f));
            }
            else
            {
                Zx3D.Part(n, new SphereMesh { Radius = r, Height = r * 2f }, mat, Vector3.Zero);
                Zx3D.Part(n, new SphereMesh { Radius = r * 1.9f, Height = r * 3.8f },
                    Zx3D.Glow(color, 0.7f, 0.18f), Vector3.Zero);
            }

            n.AddChild(new OmniLight3D
            {
                LightColor = color,
                LightEnergy = 1.1f,
                OmniRange = 5.5f,
                ShadowEnabled = false,
            });
            return n;
        }

        // ── 法术光效 ────────────────────────────────────────────

        void SyncVisuals(GameContext game)
        {
            var live = game.Fx.Visuals;
            for (var i = 0; i < live.Count; i++)
            {
                var v = live[i];
                Node3D n;
                if (!visuals.TryGetValue(v, out n))
                {
                    n = MakeVisual(v);
                    visuals[v] = n;
                    AddChild(n);
                }
                // 0 → 1 的进度。护盾这类 follow 的会一直跟着玩家走
                var k = v.ms > 0 ? Mathf.Clamp((float)(1 - v.life / v.ms), 0f, 1f) : 1f;
                n.Position = Zx3D.Pos(v.x, v.y, 0.1f);
                Grow(v, n, k);
            }

            goneFx.Clear();
            foreach (var kv in visuals)
            {
                if (!live.Contains(kv.Key)) goneFx.Add(kv.Key);
            }
            for (var i = 0; i < goneFx.Count; i++)
            {
                visuals[goneFx[i]].QueueFree();
                visuals.Remove(goneFx[i]);
            }
        }

        static Node3D MakeVisual(VisualFx v)
        {
            var color = Zx3D.Hex(v.color, new Color(0.85f, 0.9f, 1f));
            var r = Mathf.Max(0.12f, Zx3D.U(v.r));
            var n = new Node3D();
            var mat = Zx3D.Glow(color, 1.3f, 0.7f);

            switch (v.kind)
            {
                case "slash":
                    // 一段弧：贴着人物前方扫出去，朝向来自出手时的 facing
                    n.Rotation = new Vector3(0, Zx3D.Yaw(v.ax, v.ay), 0);
                    for (var i = -2; i <= 2; i++)
                    {
                        var a = i * 0.38f;
                        Zx3D.Part(n, new BoxMesh { Size = Vector3.One }, mat,
                            new Vector3(Mathf.Sin(a) * r * 0.72f, 0.5f, Mathf.Cos(a) * r * 0.72f),
                            new Vector3(r * 0.5f, 0.06f, 0.07f),
                            new Vector3(0, -Mathf.RadToDeg(a), 0));
                    }
                    break;

                case "nova":
                case "ring":
                    Zx3D.Part(n, new TorusMesh { InnerRadius = r * 0.86f, OuterRadius = r }, mat,
                        new Vector3(0, 0.08f, 0));
                    break;

                default: // impact、spark：一团小光点
                    Zx3D.Part(n, new SphereMesh { Radius = r, Height = r * 2f }, mat, new Vector3(0, 0.45f, 0));
                    break;
            }
            return n;
        }

        static void Grow(VisualFx v, Node3D n, float k)
        {
            switch (v.kind)
            {
                case "nova":
                    // 冲击波从中心炸开：先小后大，同时淡出
                    n.Scale = Vector3.One * Mathf.Lerp(0.25f, 1.05f, k);
                    break;
                case "ring":
                    // 护盾类是长在身上的，只轻微呼吸，不炸开
                    n.Scale = Vector3.One * (1f + Mathf.Sin(k * Mathf.Pi * 3f) * 0.06f);
                    break;
                case "slash":
                    n.Scale = Vector3.One * Mathf.Lerp(0.75f, 1.15f, k);
                    break;
                default:
                    n.Scale = Vector3.One * Mathf.Lerp(0.6f, 1.6f, k);
                    break;
            }
        }

        // ── 飘字 ────────────────────────────────────────────────

        /// <summary>伤害数字、拾取提示。往上飘一截然后淡掉</summary>
        public void Float(double x, double y, string text, Color color, double ms = 850)
        {
            var label = new Label3D
            {
                Text = text,
                Font = ZxFont.Get(),
                FontSize = 44,
                PixelSize = 0.0035f,
                Billboard = BaseMaterial3D.BillboardModeEnum.Enabled,
                Modulate = color,
                OutlineSize = 18,
                OutlineModulate = new Color(0.98f, 0.96f, 0.92f, 0.95f),
                NoDepthTest = true,
                Position = Zx3D.Pos(x, y, 1.1f),
            };
            AddChild(label);
            floaters.Add(new Floater { Node = label, Life = ms, Total = ms, From = label.Position });
        }

        void TickFloaters(double dt)
        {
            for (var i = floaters.Count - 1; i >= 0; i--)
            {
                var f = floaters[i];
                f.Life -= dt;
                if (f.Life <= 0)
                {
                    f.Node.QueueFree();
                    floaters.RemoveAt(i);
                    continue;
                }
                var k = (float)(1 - f.Life / f.Total);
                f.Node.Position = f.From + new Vector3(0, k * 1.1f, 0);
                var c = f.Node.Modulate;
                f.Node.Modulate = new Color(c.R, c.G, c.B, 1f - k * k);
            }
        }

        /// <summary>换图时整层清空。节点全在自己名下，删干净不留残影</summary>
        public void Clear()
        {
            foreach (var kv in bolts) kv.Value.QueueFree();
            foreach (var kv in visuals) kv.Value.QueueFree();
            for (var i = 0; i < floaters.Count; i++) floaters[i].Node.QueueFree();
            bolts.Clear();
            visuals.Clear();
            floaters.Clear();
        }
    }
}
