// 跟随相机。一根摇臂：自己站在玩家身上，相机挂在摇臂末端往回看。
//
// 跟随是插值的，用的还是网页版那个 CAM_LERP——两版的镜头手感一致，
// 不会一个跟得死紧一个飘。俯角默认压得比较低，这样能看见人物侧面，
// 纯俯视的话 3D 就白做了。

using System.Collections.Generic;
using Godot;

namespace Zhuxian.Godot
{
    public partial class ZxCameraRig : Node3D
    {
        const float MinPitch = -72f;
        const float MaxPitch = -14f;
        const float MinDist = 4.5f;
        const float MaxDist = 22f;

        Camera3D cam;
        float yaw;
        float pitch = -31f;
        float dist = 7.6f;
        Vector3 at;
        Vector2 bounds;
        readonly List<Rect2> blockers = new List<Rect2>();
        float blockerTop;

        public static ZxCameraRig Build(float lerp)
        {
            var rig = new ZxCameraRig { Name = "CameraRig", follow = lerp };
            rig.cam = new Camera3D { Fov = 58f, Current = true, Far = 400f };
            rig.AddChild(rig.cam);
            // 墨线是全屏后处理，挂在相机底下跟着一起动
            rig.cam.AddChild(ZxInk.Build(new Color(0.05f, 0.05f, 0.07f)));
            rig.Apply();
            return rig;
        }

        float follow = 0.14f;

        /// <summary>镜头朝向在 XZ 平面上的前方。移动要按镜头来，不然转了视角就分不清左右</summary>
        public Vector3 Forward
        {
            get
            {
                var f = -GlobalTransform.Basis.Z;
                f.Y = 0;
                return f.LengthSquared() < 0.0001f ? Vector3.Forward : f.Normalized();
            }
        }

        public Vector3 Right
        {
            get
            {
                var r = GlobalTransform.Basis.X;
                r.Y = 0;
                return r.LengthSquared() < 0.0001f ? Vector3.Right : r.Normalized();
            }
        }

        /// <summary>
        /// 跟上目标。dt 毫秒——按帧插值在高刷屏上会跟得更紧，
        /// 换算成按时间的指数衰减，60Hz 和 144Hz 才是同一个手感。
        /// </summary>
        public void Track(Vector3 target, double dt, bool snap = false)
        {
            if (snap)
            {
                at = target;
            }
            else
            {
                var k = 1f - Mathf.Pow(1f - follow, (float)(dt / 16.6667));
                at = at.Lerp(target, Mathf.Clamp(k, 0f, 1f));
            }
            Position = at;
            // 每帧都要重算：能退多远取决于人物站在图上的哪儿
            cam.Position = new Vector3(0, 0, Reach());
        }

        /// <summary>这张图有多大（单位）。换图要重设，镜头靠它决定能退多远</summary>
        public void SetBounds(float width, float height)
        {
            bounds = new Vector2(width, height);
            Apply();
        }

        /// <summary>
        /// 挡视线的东西：房子、石堆这些障碍的平面矩形，外加它们的大致高度。
        /// 机位退到房子背后就什么都看不见了，所以退之前要先问一句「路上有没有东西」。
        /// </summary>
        public void SetBlockers(IEnumerable<Rect2> rects, float top)
        {
            blockers.Clear();
            blockers.AddRange(rects);
            blockerTop = top;
            Apply();
        }

        public void Orbit(float dYaw, float dPitch)
        {
            yaw -= dYaw;
            pitch = Mathf.Clamp(pitch - dPitch, MinPitch, MaxPitch);
            Apply();
        }

        public void Zoom(float step)
        {
            dist = Mathf.Clamp(dist + step, MinDist, MaxDist);
            Apply();
        }

        void Apply()
        {
            RotationDegrees = new Vector3(pitch, yaw, 0);
            cam.Position = new Vector3(0, 0, Reach());
        }

        /// <summary>
        /// 实际能退多远。人物走到地图边上时，机位会退到围墙外边去——
        /// 那时候看到的是墙的背面，半个屏幕是黑的。所以退之前先算一下
        /// 这条射线什么时候出界，出界前就把机位收住。
        /// </summary>
        float Reach()
        {
            if (bounds.X <= 0 || bounds.Y <= 0) return dist;

            // 机位方向：摇臂的 +Z。只看水平面，抬高多少不影响出不出界
            var back = Basis.FromEuler(new Vector3(Mathf.DegToRad(pitch), Mathf.DegToRad(yaw), 0)).Z;
            const float margin = 0.8f;
            var limit = dist;

            limit = Mathf.Min(limit, Span(at.X, back.X, margin, bounds.X - margin));
            limit = Mathf.Min(limit, Span(at.Z, back.Z, margin, bounds.Y - margin));

            // 被挡住就往回收。机位越远抬得越高，高过屋脊的那一段不算挡
            var o = new Vector2(at.X, at.Z);
            var d = new Vector2(back.X, back.Z);
            for (var i = 0; i < blockers.Count; i++)
            {
                var t = Enter(o, d, blockers[i]);
                if (t < 0 || t >= limit) continue;
                if (at.Y + t * back.Y > blockerTop) continue;
                // 撞上就收到底。下限只保证别贴脸，剩下的交给「挡镜头的自己淡掉」
                limit = Mathf.Max(2.6f, t - 0.4f);
            }

            // 只收一部分。人贴着墙角时按出界点算会把机位怼到脸上，
            // 剩下那点越界由「围墙只朝里画」兜着，反正从外面看不见墙
            return Mathf.Max(dist * 0.55f, limit);
        }

        /// <summary>从 from 沿 step 走，撞到 [lo, hi] 边界前还能走多远</summary>
        static float Span(float from, float step, float lo, float hi)
        {
            if (Mathf.Abs(step) < 0.0001f) return float.MaxValue;
            var edge = step > 0 ? hi : lo;
            return Mathf.Max(0f, (edge - from) / step);
        }

        /// <summary>射线从 o 沿 d 走多远进入矩形 r；根本不进就返回 -1（板块法）</summary>
        static float Enter(Vector2 o, Vector2 d, Rect2 r)
        {
            var lo = r.Position;
            var hi = r.Position + r.Size;
            var tin = 0f;
            var tout = float.MaxValue;

            for (var axis = 0; axis < 2; axis++)
            {
                var step = axis == 0 ? d.X : d.Y;
                var from = axis == 0 ? o.X : o.Y;
                var a = axis == 0 ? lo.X : lo.Y;
                var b = axis == 0 ? hi.X : hi.Y;

                if (Mathf.Abs(step) < 0.0001f)
                {
                    if (from < a || from > b) return -1f;   // 和这条轴平行且在板块外，永远进不去
                    continue;
                }

                var t1 = (a - from) / step;
                var t2 = (b - from) / step;
                if (t1 > t2) (t1, t2) = (t2, t1);
                tin = Mathf.Max(tin, t1);
                tout = Mathf.Min(tout, t2);
            }

            return tout < tin ? -1f : tin;
        }
    }
}
