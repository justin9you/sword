// 3D 版的场景根节点：把 Zhuxian.Core 跑起来，再把它的状态画成 3D 世界。
//
// 这里是唯一一处「引擎 ↔ 逻辑」的接缝。规矩只有一条：
// 逻辑层是源头，渲染层是镜子——所有位置、血量、命中都从 Core 读，
// 3D 这边不自己算一份，也不往回改。所以网页版怎么打，这边就怎么打。
//
// 每帧的顺序刻意和网页版 src/main.js 的 step() 对齐：
// 输入 → 移动 → 状态 → 自动普攻 → 技能推进 → 世界推进 → 拾取 → 镜头。
// 顺序变了数值就会出现细微差异，所以别图省事重排。

using System.Collections.Generic;
using Godot;
using Zhuxian.Core;
using Zhuxian.Data;
using GodotEnvironment = global::Godot.Environment;

namespace Zhuxian.Godot
{
    public partial class ZxGame3D : Node3D, IGameHooks
    {
        /// <summary>死亡后躺多久爬起来（毫秒）。和网页版一致</summary>
        const double ReviveMs = 3000;

        GameData data;
        IRng rng;
        PlayerState player;
        World world;
        GameContext game;

        ZxCameraRig cam;
        ZxHud hud;
        ZxFx3D fx;
        ZxDrops drops;
        ZxTerrain terrain;
        WorldEnvironment env;
        DirectionalLight3D sun;

        ZxActor me;
        readonly List<ZxActor> npcActors = new List<ZxActor>();
        readonly Dictionary<int, ZxActor> monsterActors = new Dictionary<int, ZxActor>();
        readonly List<ZxActor> dying = new List<ZxActor>();
        readonly List<int> vanished = new List<int>();
        Node3D npcRoot;

        double inCombat;
        double reviveIn;
        bool bagWarned;
        /// <summary>飘过多少次伤害数字。只有自检在看它——用来证明战斗真跑起来了</summary>
        int hits;

        public override void _Ready()
        {
            ReadArgs();

            data = ZxGodotData.Load();
            Zx3D.UseTile(data.Config.TILE);
            rng = new SystemRng();

            BuildStage();

            player = Player.Create(data, "张小凡", startSect);
            if (startLevel > 1) Player.GainExp(data, player, ExpForLevel(data, startLevel));

            EnterMap(startMap ?? player.map);
            game = new GameContext(data, rng, player, world, this);

            me = ZxActor.Make("humanoid", Zx3D.Hex(data.Sect(player.sect).color, Colors.White),
                12, player.name, new Color(0.95f, 0.93f, 0.8f), true, false);
            AddChild(me);

            hud.Log("进入" + world.Def.name + "。" + world.Def.sub);
        }

        public override void _Process(double delta)
        {
            // 掉帧时把步长钳住。不钳的话卡一下就会「瞬移穿墙」——
            // 这条和网页版是同一个 MAX_DT
            var dt = Mathf.Min(delta * 1000.0, data.Config.MAX_DT);

            Step(dt);
            SyncActors(dt);
            fx.Sync(game, dt);
            drops.Sync(data, world, dt);
            hud.Refresh(data, player, world);
            hud.RefreshSkills(data.Sect(player.sect), player);
            cam.Track(Zx3D.Pos(player.x, player.y, 0.6f), dt);

            AfterFrame();
        }

        // ── 舞台 ────────────────────────────────────────────────

        void BuildStage()
        {
            env = new WorldEnvironment { Environment = new GodotEnvironment() };
            AddChild(env);

            sun = new DirectionalLight3D
            {
                RotationDegrees = new Vector3(-52, -38, 0),
                LightEnergy = 1.3f,
                ShadowEnabled = true,
                ShadowBias = 0.04f,
            };
            AddChild(sun);

            cam = ZxCameraRig.Build((float)data.Config.CAM_LERP);
            AddChild(cam);

            fx = new ZxFx3D { Name = "Fx" };
            AddChild(fx);
            drops = new ZxDrops { Name = "Drops" };
            AddChild(drops);

            hud = ZxHud.Build();
            AddChild(hud);
        }

        /// <summary>
        /// 纸。
        ///
        /// 水墨没有天空盒，背景就是一张纸——所以这里用纯色底，不用 Sky。
        /// 远处靠深度雾整个化进纸里，那就是留白：中国画里远山不是画淡，是干脆不画。
        /// 环境光同样给纸色，免得物体的背光面偏色。
        /// </summary>
        void Paint(ZxPalette pal)
        {
            var e = env.Environment;

            e.BackgroundMode = GodotEnvironment.BGMode.Color;
            e.BackgroundColor = pal.Paper;
            e.AmbientLightSource = GodotEnvironment.AmbientSource.Color;
            e.AmbientLightColor = pal.Paper;
            e.AmbientLightEnergy = 1f;

            // 按深度留白。用 Depth 模式而不是密度雾：起止距离说得死，
            // 「多远开始化、多远化干净」在每张图上都可控
            e.FogEnabled = true;
            e.FogMode = GodotEnvironment.FogModeEnum.Depth;
            e.FogLightColor = pal.Paper;
            e.FogLightEnergy = 1f;
            e.FogDepthBegin = 16f;
            e.FogDepthEnd = 52f;
            e.FogDepthCurve = 0.9f;

            // 法术还是要亮的——满纸墨色里那一点光就是「法」。但阈值提高，
            // 只让自发光的东西泛光，纸面本身不许发光
            e.GlowEnabled = true;
            e.GlowIntensity = 0.32f;
            e.GlowBloom = 0.1f;
            e.GlowHdrThreshold = 1.25f;

            // 整体再压一道：水墨是低饱和高对比，不是灰蒙蒙
            e.AdjustmentEnabled = true;
            e.AdjustmentSaturation = 0.72f;
            e.AdjustmentContrast = 1.06f;
            e.TonemapMode = GodotEnvironment.ToneMapper.Linear;

            // 水墨不画投影。关掉之后画面立刻「平」下来，那正是要的，
            // 顺带把阴影图整块开销省了——核显上这是真金白银
            // 墨色也跟着生态换
            ZxInk.UseInk(pal.Ink);

            sun.ShadowEnabled = false;
            sun.LightEnergy = 0.0f;
        }

        // ── 换图 ────────────────────────────────────────────────

        void EnterMap(string key)
        {
            terrain?.QueueFree();
            npcRoot?.QueueFree();
            foreach (var kv in monsterActors) kv.Value.QueueFree();
            for (var i = 0; i < dying.Count; i++) dying[i].QueueFree();
            monsterActors.Clear();
            dying.Clear();
            fx?.Clear();
            drops?.Clear();

            world = new World(data, rng, key);
            if (game != null)
            {
                game.World = world;
                // 逻辑层的飞行物也要一起丢掉。留着的话，上一张图放出去还没飞完的
                // 那一发会带着旧坐标接着飞，然后拿去和新图的墙和怪做判定——
                // 在莫名其妙的位置炸一下，甚至打到新图里毫不相干的怪
                game.Fx.Bolts.Clear();
                game.Fx.Visuals.Clear();
            }

            player.map = world.Key;
            player.visited.Add(world.Key);
            var t = data.Config.TILE;
            player.x = world.Def.start.x * t + t / 2.0;
            player.y = world.Def.start.y * t + t / 2.0;
            // 出生点被障碍压住时挪到最近的空地，否则人直接生在石堆里
            if (world.Blocked(player.x, player.y, 12))
            {
                var free = world.FindSpot(12, player.x, player.y, 0);
                player.x = free.X;
                player.y = free.Y;
            }

            var pal = ZxPalette.Of(world.Def.biome);
            // 材质要在建地形和建人物之前就知道这张图用的是哪张纸
            ZxWash.Use(pal);
            Paint(pal);

            terrain = ZxTerrain.Build(data, world, pal);
            AddChild(terrain);

            npcRoot = new Node3D { Name = "Npcs" };
            AddChild(npcRoot);
            npcActors.Clear();
            foreach (var n in world.Npcs)
            {
                var actor = ZxActor.Make("humanoid", Zx3D.Hex(n.def.color, Colors.LightGray), 16,
                    n.def.name, new Color(0.98f, 0.88f, 0.55f), false, false);
                actor.Position = Zx3D.Pos(n.x, n.y);
                npcRoot.AddChild(actor);
                npcActors.Add(actor);
            }

            cam?.SetBounds(Zx3D.U(world.Width), Zx3D.U(world.Height));
            cam?.SetBlockers(BlockerRects(), 2.6f);
            cam?.Track(Zx3D.Pos(player.x, player.y, 0.6f), 0, true);
            inCombat = 0;
        }

        /// <summary>障碍的平面矩形（单位）。给镜头用来判断视线被什么挡住了</summary>
        List<Rect2> BlockerRects()
        {
            var rects = new List<Rect2>(world.Blocks.Count);
            foreach (var b in world.Blocks)
            {
                rects.Add(new Rect2(Zx3D.U(b.x), Zx3D.U(b.y), Zx3D.U(b.w), Zx3D.U(b.h)));
            }
            return rects;
        }

        // ── 每帧推进 ────────────────────────────────────────────

        void Step(double dt)
        {
            var p = player;
            p.playMs += dt;

            var moving = MoveByInput(dt);

            if (p.hurtIframe > 0) p.hurtIframe -= dt;
            if (p.attackCd > 0) p.attackCd -= dt;
            if (p.swingMs > 0) p.swingMs -= dt;
            if (inCombat > 0) inCombat -= dt;

            var tick = Combat.TickBuffs(p.buffs, dt, (amount, kind) =>
            {
                p.hp -= amount;
                Floater(p.x, p.y, amount, "hurt");
                if (p.hp <= 0) Died();
            });
            // 只要有 buff 到期就重算：护盾还在时血炼到期的话，攻击加成会一直虚挂着
            if (tick.Expired > 0) Player.Recompute(data, p);

            Player.TickRegen(data, p, dt, moving, inCombat > 0);

            // 自动普攻：怪进了射程就自己打，和网页版一样不用一直点
            if (!p.dead && p.attackCd <= 0 && !Combat.Disabled(p.buffs))
            {
                var target = world.Nearest(p.x, p.y, data.Config.MELEE_RANGE + 12);
                if (target != null && Skills.BasicAttack(game))
                {
                    p.attackCd = Player.AttackInterval(data, p);
                    inCombat = 5000;
                }
            }

            Skills.Update(game, dt);
            world.Update(dt, p, this);
            Pickup();

            if (!p.dead || reviveIn <= 0) return;
            reviveIn -= dt;
            if (reviveIn > 0) return;
            Player.Revive(data, p);
            var t = data.Config.TILE;
            p.x = world.Def.start.x * t + t / 2.0;
            p.y = world.Def.start.y * t + t / 2.0;
            cam.Track(Zx3D.Pos(p.x, p.y, 0.6f), 0, true);
            hud.SetDead(false);
            hud.Log("你缓过一口气，重新站了起来。");
        }

        void SyncActors(double dt)
        {
            var cfg = data.Config;
            var swing = player.swingMs > 0 ? player.swingMs / cfg.SWING_MS : 0;
            // 只在挨打头一瞬间闪白。整个无敌帧都闪的话，人会白成一团发光的球
            var hurt = Mathf.Max(0, player.hurtIframe / cfg.HURT_IFRAME_MS - 0.6) * 2.5;
            me.Sync(player.x, player.y, player.facingX, player.facingY, dt,
                player.stats.hp > 0 ? player.hp / player.stats.hp : 0, hurt, swing);
            me.Visible = !player.dead;

            // NPC 站着不动，但也得喘气——一动不动的人形比没有还出戏
            for (var i = 0; i < npcActors.Count; i++)
            {
                var n = world.Npcs[i];
                npcActors[i].Sync(n.x, n.y, 0, 0, dt);
            }

            var wanted = Quest.TargetMonsterId(data, player);

            for (var i = 0; i < world.Monsters.Count; i++)
            {
                var m = world.Monsters[i];
                if (m.dead) continue;

                ZxActor actor;
                if (!monsterActors.TryGetValue(m.uid, out actor))
                {
                    var named = m.isBoss || m.def.isElite;
                    actor = ZxActor.Make(m.def.art, Zx3D.Hex(m.def.color, Colors.Gray), m.def.radius,
                        named ? m.def.name : null,
                        m.isBoss ? new Color(1f, 0.6f, 0.4f) : new Color(0.95f, 0.85f, 0.6f));
                    if (m.isBoss) actor.Scale = Vector3.One * 1.25f;
                    monsterActors[m.uid] = actor;
                    AddChild(actor);
                }
                // 任务目标头顶戴个金圈——网页版也是这么标的，免得闷头打错怪
                actor.ShowMark(wanted != null && wanted == m.def.id, Zx3D.U(m.def.radius));
                actor.Sync(m.x, m.y, m.vx, m.vy, dt, m.maxHp > 0 ? m.hp / m.maxHp : 0,
                    m.flash > 0 ? m.flash / MonsterInstance.FlashMs : 0);
            }

            // 逻辑层已经把死掉的怪从列表里删了，这边让它倒下去再消失
            vanished.Clear();
            foreach (var kv in monsterActors)
            {
                var alive = false;
                for (var i = 0; i < world.Monsters.Count && !alive; i++)
                {
                    alive = !world.Monsters[i].dead && world.Monsters[i].uid == kv.Key;
                }
                if (!alive) vanished.Add(kv.Key);
            }
            for (var i = 0; i < vanished.Count; i++)
            {
                var actor = monsterActors[vanished[i]];
                actor.BeginDeath();
                dying.Add(actor);
                monsterActors.Remove(vanished[i]);
            }
            for (var i = dying.Count - 1; i >= 0; i--)
            {
                if (!dying[i].TickDeath(dt)) continue;
                dying[i].QueueFree();
                dying.RemoveAt(i);
            }
        }

        /// <summary>走到掉落物上自动捡</summary>
        void Pickup()
        {
            if (player.dead) return;
            var range = data.Config.PICKUP_RANGE;
            for (var i = world.Drops.Count - 1; i >= 0; i--)
            {
                var d = world.Drops[i];
                if (d.born < 300) continue;
                if (Geometry.Dist2(player.x, player.y, d.x, d.y) > range * range) continue;

                var res = Inventory.Add(data, player.bag, d.id, d.n);
                if (res.Added <= 0)
                {
                    if (!bagWarned)
                    {
                        bagWarned = true;
                        hud.Log("背包满了，捡不了东西。");
                    }
                    continue;
                }
                bagWarned = false;
                player.bag = res.Bag;
                var item = data.Item(d.id);
                fx.Float(player.x, player.y, item != null ? item.name : "物品", new Color(1f, 0.85f, 0.45f));
                if (res.Added < d.n) d.n -= res.Added;
                else world.Drops.RemoveAt(i);
            }
        }

        void Died()
        {
            if (player.dead) return;
            player.hp = 0;
            var lost = Player.Die(data, player);
            reviveIn = ReviveMs;
            hud.SetDead(true);
            hud.Log("气绝。损失经验 " + lost + "，三息之后于本图复生。");
        }
    }
}
