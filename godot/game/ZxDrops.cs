// 掉落物。转着的小方块，颜色按品质来——远远看一眼就知道值不值得绕过去捡。
//
// 和特效层一个做法：每帧对一遍 World.Drops，多退少补。掉落物的寿命、
// 清理都归逻辑层管，这里不记账。

using System.Collections.Generic;
using Godot;
using Zhuxian.Core;
using Zhuxian.Data;

namespace Zhuxian.Godot
{
    public partial class ZxDrops : Node3D
    {
        readonly Dictionary<int, Node3D> nodes = new Dictionary<int, Node3D>();
        readonly List<int> gone = new List<int>();

        public void Sync(GameData data, World world, double dt)
        {
            var live = world.Drops;
            for (var i = 0; i < live.Count; i++)
            {
                var d = live[i];
                Node3D n;
                if (!nodes.TryGetValue(d.uid, out n))
                {
                    n = Make(data, d);
                    nodes[d.uid] = n;
                    AddChild(n);
                }
                // 刚掉出来的往上弹一下，然后落回去慢慢转
                var pop = d.born < 300 ? Mathf.Sin((float)(d.born / 300.0) * Mathf.Pi) * 0.35f : 0f;
                n.Position = Zx3D.Pos(d.x, d.y, 0.3f + pop);
                n.RotateY((float)(dt / 1000.0) * 2.2f);
            }

            gone.Clear();
            foreach (var kv in nodes)
            {
                var alive = false;
                for (var i = 0; i < live.Count && !alive; i++) alive = live[i].uid == kv.Key;
                if (!alive) gone.Add(kv.Key);
            }
            for (var i = 0; i < gone.Count; i++)
            {
                nodes[gone[i]].QueueFree();
                nodes.Remove(gone[i]);
            }
        }

        static Node3D Make(GameData data, DropItem d)
        {
            var item = data.Item(d.id);
            var color = Quality(data, item);
            var n = new Node3D();

            Zx3D.Part(n, new BoxMesh { Size = Vector3.One }, Zx3D.Glow(color, 1.5f),
                Vector3.Zero, new Vector3(0.22f, 0.22f, 0.22f), new Vector3(0, 0, 45));
            // 地上一圈光晕，草丛里也不至于看丢
            Zx3D.Part(n, new TorusMesh { InnerRadius = 0.26f, OuterRadius = 0.32f },
                Zx3D.Glow(color, 1.1f, 0.5f), new Vector3(0, -0.26f, 0));
            return n;
        }

        static Color Quality(GameData data, ZxItem item)
        {
            var fallback = new Color(0.72f, 0.76f, 0.81f);
            if (item == null || data.Config.quality == null) return fallback;
            foreach (var q in data.Config.quality)
            {
                if (q.key == item.q) return Zx3D.Hex(q.color, fallback);
            }
            return fallback;
        }

        public void Clear()
        {
            foreach (var kv in nodes) kv.Value.QueueFree();
            nodes.Clear();
        }
    }
}
