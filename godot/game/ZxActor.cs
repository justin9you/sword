// 场上的一个活物：模型 + 血条 + 名字。玩家、怪物、NPC 都是它。
//
// 它不认识 World，也不碰逻辑——位置、血量、朝向全是喂进来的。
// 这样「谁该动」永远由逻辑层说了算，渲染层只负责把状态摆成看得懂的样子。

using Godot;

namespace Zhuxian.Godot
{
    public partial class ZxActor : Node3D
    {
        /// <summary>死亡动画时长（毫秒）。怪物从世界列表里消失后还要倒一下</summary>
        public const double DeathMs = 420;

        ZxFigure fig;
        Node3D bar;
        MeshInstance3D barFill;
        float barWidth;
        Label3D label;
        Node3D mark;

        float yaw;
        Vector3 lastPos;
        bool placed;
        double dying = -1;

        public static ZxActor Make(
            string art, Color color, double radiusPx,
            string name = null, Color? nameColor = null, bool armed = false, bool bar = true)
        {
            var a = new ZxActor { Name = "Actor" };
            a.fig = ZxFigure.Make(art, color, radiusPx, armed);
            a.AddChild(a.fig);

            var top = a.fig.Top + 0.22f;
            if (bar) a.MakeBar(Zx3D.U(radiusPx), top);
            if (!string.IsNullOrEmpty(name)) a.MakeLabel(name, nameColor ?? Colors.White, top + (bar ? 0.26f : 0f));
            return a;
        }

        void MakeBar(float r, float y)
        {
            barWidth = Mathf.Max(0.55f, r * 2.6f);
            bar = new Node3D { Position = new Vector3(0, y, 0), Visible = false };
            AddChild(bar);

            var quad = new QuadMesh { Size = new Vector2(barWidth, 0.09f) };
            Zx3D.Part(bar, quad, Zx3D.Flat(new Color(0.18f, 0.17f, 0.16f, 0.35f), true), Vector3.Zero);
            barFill = Zx3D.Part(bar, quad, Zx3D.Flat(new Color(0.68f, 0.17f, 0.14f), true), new Vector3(0, 0, 0.002f));
        }

        void MakeLabel(string text, Color color, float y)
        {
            label = new Label3D
            {
                Text = text,
                Font = ZxFont.Get(),
                FontSize = 38,
                PixelSize = 0.0035f,
                Billboard = BaseMaterial3D.BillboardModeEnum.Enabled,
                Modulate = color,
                OutlineSize = 16,
                OutlineModulate = new Color(0.98f, 0.96f, 0.92f, 0.95f),
                Position = new Vector3(0, y, 0),
            };
            AddChild(label);
        }

        // ── 每帧 ────────────────────────────────────────────────

        /// <summary>
        /// 把逻辑状态搬到场景里。dt 毫秒；hpFrac 小于 1 才显示血条；
        /// flash01 / swing01 是 0~1 的表现强度。
        /// </summary>
        public void Sync(double x, double y, double fx, double fy, double dt,
            double hpFrac = 1, double flash01 = 0, double swing01 = 0)
        {
            if (dying >= 0) return;

            var pos = Zx3D.Pos(x, y);
            // 「在不在走」不看状态机，直接看这一帧挪了多少——
            // 被击退、被冰冻减速这些情况下状态机说的和眼睛看到的会对不上。
            // 头一帧没有「上一帧」可比，不判成在走，否则刚出生的怪会抖一下腿
            var moved = placed && pos.DistanceTo(lastPos) > 0.0015f;
            placed = true;
            lastPos = pos;
            Position = pos;

            if (fx != 0 || fy != 0)
            {
                // 转身别瞬移，插值一下。角度要走最短路，不然会绕远路转一圈
                var want = Zx3D.Yaw(fx, fy);
                yaw = Mathf.LerpAngle(yaw, want, Mathf.Min(1f, (float)dt * 0.018f));
                Rotation = new Vector3(0, yaw, 0);
            }

            fig.Tick(dt / 1000.0, moved, swing01, flash01);

            if (bar == null) return;
            var frac = Mathf.Clamp((float)hpFrac, 0f, 1f);
            bar.Visible = frac < 0.999f;
            if (!bar.Visible) return;
            // 缩放 + 左移半个缺口，血条就从左边掉而不是两头一起缩
            barFill.Scale = new Vector3(Mathf.Max(frac, 0.001f), 1f, 1f);
            barFill.Position = new Vector3(-barWidth * (1f - frac) / 2f, 0f, 0.002f);
        }

        /// <summary>
        /// 任务目标的金圈。逻辑层随时可能换目标，所以圈是按需建、按帧开关的，
        /// 不能在生成怪的时候一锤定音。
        /// </summary>
        public void ShowMark(bool on, float radius)
        {
            if (mark == null)
            {
                if (!on) return;
                mark = new Node3D { Position = new Vector3(0, 0.05f, 0) };
                AddChild(mark);
                var r = Mathf.Max(0.3f, radius * 1.5f);
                Zx3D.Part(mark, new TorusMesh { InnerRadius = r * 0.82f, OuterRadius = r },
                    Zx3D.Glow(new Color(1f, 0.82f, 0.35f), 1.8f), Vector3.Zero);
            }
            mark.Visible = on;
        }

        // ── 死亡 ────────────────────────────────────────────────

        public void BeginDeath()
        {
            if (dying >= 0) return;
            dying = 0;
            if (bar != null) bar.Visible = false;
            if (label != null) label.Visible = false;
        }

        /// <summary>推进死亡动画，倒完了返回 true——由调用方负责 QueueFree</summary>
        public bool TickDeath(double dt)
        {
            if (dying < 0) return false;
            dying += dt;
            fig.Collapse((float)(dying / DeathMs));
            return dying >= DeathMs;
        }
    }
}
