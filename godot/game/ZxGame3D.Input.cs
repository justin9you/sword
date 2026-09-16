// ZxGame3D 的另一半：输入、交互，以及两个不开窗口也能跑的自检模式。
//
// 键位用原始按键判断，不走 InputMap——这样 project.godot 里不用配一堆动作，
// 拿到工程直接按就有反应，也省得动作名和代码两头对不上。

using System.Collections.Generic;
using Godot;
using Zhuxian.Core;
using Zhuxian.Data;

namespace Zhuxian.Godot
{
    public partial class ZxGame3D
    {
        /// <summary>技能自动瞄准的范围（像素）。够不着就照着面朝的方向放</summary>
        const double AimRange = 460;

        string startSect = "qingyun";
        string startMap;
        int startLevel = 1;

        int frames;
        int checkFrames = -1;
        string shotPath;
        bool shooting;
        int npcLine;
        double autoCd;
        int autoCasts;

        /// <summary>
        /// 读命令行参数（放在 -- 后面传）。除了调试方便，
        /// --check / --shot 是 CI 用来验「场景搭得起来、画得出来」的入口。
        /// </summary>
        void ReadArgs()
        {
            foreach (var raw in OS.GetCmdlineUserArgs())
            {
                var arg = raw;
                var eq = arg.IndexOf('=');
                var key = eq < 0 ? arg : arg.Substring(0, eq);
                var val = eq < 0 ? "" : arg.Substring(eq + 1);

                switch (key)
                {
                    case "--sect": startSect = val; break;
                    case "--map": startMap = val; break;
                    case "--level": startLevel = Mathf.Max(1, val.ToInt()); break;
                    case "--shot": shotPath = val; break;
                    case "--check": checkFrames = val.Length > 0 ? val.ToInt() : 120; break;
                }
            }
        }

        /// <summary>升到指定等级要多少经验。--level 用，攒的是各级差值之和</summary>
        static int ExpForLevel(GameData data, int level)
        {
            var total = 0;
            for (var lv = 1; lv < level; lv++) total += Stats.ExpToNext(lv, data.Config);
            return total;
        }

        // ── 移动 ────────────────────────────────────────────────

        /// <summary>按镜头方向走。返回这一帧是不是真的挪动了（回气要看它）</summary>
        bool MoveByInput(double dt)
        {
            if (player.dead || Combat.Disabled(player.buffs)) return false;
            if (checkFrames > 0) return AutoWalk(dt);

            var ax = 0f;
            var az = 0f;
            if (Input.IsKeyPressed(Key.W) || Input.IsKeyPressed(Key.Up)) az += 1f;
            if (Input.IsKeyPressed(Key.S) || Input.IsKeyPressed(Key.Down)) az -= 1f;
            if (Input.IsKeyPressed(Key.D) || Input.IsKeyPressed(Key.Right)) ax += 1f;
            if (Input.IsKeyPressed(Key.A) || Input.IsKeyPressed(Key.Left)) ax -= 1f;
            if (ax == 0f && az == 0f) return false;

            var dir = (cam.Forward * az + cam.Right * ax).Normalized();
            var v = Player.MoveSpeed(data, player) * (dt / 1000.0);
            // 逻辑层认像素，3D 这边的方向是单位向量，乘速度就直接是像素位移
            var next = world.Move(player.x, player.y, dir.X * v, dir.Z * v, 12);

            var moved = next.X != player.x || next.Y != player.y;
            player.x = next.X;
            player.y = next.Y;
            player.facingX = dir.X;
            player.facingY = dir.Z;
            return moved;
        }

        /// <summary>
        /// 自检模式下没人按键，就让它自己找最近的怪走过去。
        ///
        /// 这一步不是为了好玩：站着不动的话，移动、追怪、命中、掉血、掉落、
        /// 拾取这几条线一条都跑不到，自检就只能证明「场景搭得起来」。
        /// </summary>
        bool AutoWalk(double dt)
        {
            // 顺手把技能也放了：弹道、冲击波、斩击弧这些特效节点只有真放出来才建，
            // 不放的话自检等于没验特效层
            autoCd -= dt;
            if (autoCd <= 0)
            {
                autoCd = 700;
                var sect = data.Sect(player.sect);
                if (sect?.skills != null && world.Nearest(player.x, player.y, AimRange) != null)
                {
                    for (var i = 0; i < sect.skills.Length && i < 4; i++)
                    {
                        if (player.level < sect.skills[i].lv) continue;
                        var aim = Aim(sect.skills[i].range > 0 ? sect.skills[i].range : AimRange);
                        FaceTo(aim);
                        if (!Skills.Cast(game, sect.skills[i], aim.X, aim.Y).Ok) continue;
                        autoCasts++;
                        break;
                    }
                }
            }

            var target = world.Nearest(player.x, player.y, 2000);
            var tx = target != null ? target.x : world.Width / 2;
            var ty = target != null ? target.y : world.Height / 2;
            if (Geometry.Dist(player.x, player.y, tx, ty) < data.Config.MELEE_RANGE * 0.7) return false;

            var dir = Geometry.DirTo(player.x, player.y, tx, ty);
            var v = Player.MoveSpeed(data, player) * (dt / 1000.0);
            var next = world.Move(player.x, player.y, dir.X * v, dir.Y * v, 12);

            var moved = next.X != player.x || next.Y != player.y;
            player.x = next.X;
            player.y = next.Y;
            player.facingX = dir.X;
            player.facingY = dir.Y;
            return moved;
        }

        // ── 按键 ────────────────────────────────────────────────

        public override void _UnhandledInput(InputEvent e)
        {
            if (e is InputEventMouseMotion motion && Input.IsMouseButtonPressed(MouseButton.Right))
            {
                cam.Orbit(motion.Relative.X * 0.25f, motion.Relative.Y * 0.2f);
                return;
            }

            if (e is InputEventMouseButton mb && mb.Pressed)
            {
                if (mb.ButtonIndex == MouseButton.WheelUp) cam.Zoom(-1f);
                else if (mb.ButtonIndex == MouseButton.WheelDown) cam.Zoom(1f);
                else if (mb.ButtonIndex == MouseButton.Left) Strike();
                return;
            }

            if (!(e is InputEventKey key) || !key.Pressed || key.Echo) return;

            switch (key.Keycode)
            {
                case Key.Space: Strike(); break;
                case Key.Key1: CastSlot(0); break;
                case Key.Key2: CastSlot(1); break;
                case Key.Key3: CastSlot(2); break;
                case Key.Key4: CastSlot(3); break;
                case Key.R: Talisman(); break;
                case Key.F: Interact(); break;
                case Key.H: Potion(); break;
                case Key.Escape: GetTree().Quit(); break;
            }
        }

        void Strike()
        {
            if (player.dead || player.attackCd > 0 || Combat.Disabled(player.buffs)) return;
            if (!Skills.BasicAttack(game)) return;
            player.attackCd = Player.AttackInterval(data, player);
            inCombat = 5000;
        }

        void CastSlot(int index)
        {
            var sect = data.Sect(player.sect);
            if (sect?.skills == null || index >= sect.skills.Length) return;

            var skill = sect.skills[index];
            if (player.level < skill.lv)
            {
                hud.Log(skill.name + " 要 " + skill.lv + " 级才能用。");
                return;
            }

            var aim = Aim(skill.range > 0 ? skill.range : AimRange);
            FaceTo(aim);
            var res = Skills.Cast(game, skill, aim.X, aim.Y);
            if (!res.Ok) hud.Log(res.Message);
            else inCombat = 5000;
        }

        void Talisman()
        {
            var aim = Aim(AimRange);
            var res = Skills.CastTalisman(game, aim.X, aim.Y);
            if (!res.Ok) hud.Log(res.Message);
        }

        /// <summary>
        /// 放技能前先把朝向摆好。
        ///
        /// strike 类技能是瞬发的，Skills.Cast 里立刻拿 facing 去筛前方扇形里的目标。
        /// 放完再转身等于每次都用上一次的朝向打——站着不动换个方向放，第一下必空。
        /// </summary>
        void FaceTo(Vec2 aim)
        {
            if (aim.X == player.x && aim.Y == player.y) return;
            var dir = Geometry.DirTo(player.x, player.y, aim.X, aim.Y);
            player.facingX = dir.X;
            player.facingY = dir.Y;
        }

        /// <summary>瞄点：优先最近的怪，没怪就照着人物面朝的方向放</summary>
        Vec2 Aim(double range)
        {
            var target = world.Nearest(player.x, player.y, AimRange);
            if (target != null) return new Vec2(target.x, target.y);
            return new Vec2(player.x + player.facingX * range, player.y + player.facingY * range);
        }

        // ── 交互 ────────────────────────────────────────────────

        void Interact()
        {
            if (player.dead) return;
            var hit = world.FindInteractable(player.x, player.y);
            if (hit == null)
            {
                hud.Log("附近没什么可打交道的。");
                return;
            }
            if (hit.Kind == "portal")
            {
                EnterMap(hit.Portal.to);
                hud.Log("进入" + world.Def.name + "。" + world.Def.sub);
                return;
            }
            Talk(hit.Npc.def);
        }

        /// <summary>
        /// 跟 NPC 说话。面板还没搬过来，先把话一句一句说完，
        /// 顺带把任务该接的接了、该交的交了——不然任务链在 3D 里是断的。
        /// </summary>
        void Talk(ZxNpc npc)
        {
            if (Quest.CanTurnInAt(data, player, npc.key))
            {
                var r = Quest.TurnIn(data, player, npc.key);
                if (r != null)
                {
                    hud.Log("【" + r.Quest.name + "】复命：经验 +" + r.Exp + "，灵石 +" + r.Gold);
                    if (r.Levels > 0) hud.Log("修为精进，升到 " + player.level + " 级。");
                    if (r.Next != null) hud.Log("新任务：" + r.Next.name);
                    npcLine = 0;
                    return;
                }
            }

            if (Quest.WaitingForLevel(data, player, npc.key))
            {
                hud.Log(npc.name + "：修为还差些火候，再去历练历练。");
                return;
            }
            if (Quest.OnTalk(data, player, npc.key))
            {
                var q = Quest.Current(data, player);
                if (q != null) hud.Log("接下任务【" + q.name + "】：" + q.brief);
                return;
            }

            if (npc.lines == null || npc.lines.Length == 0)
            {
                hud.Log(npc.name + " 只是点了点头。");
                return;
            }
            hud.Log(npc.name + "：" + npc.lines[npcLine % npc.lines.Length]);
            npcLine++;
        }

        void Potion()
        {
            // 缺血就挑回血的，缺蓝就挑回蓝的；同样管用先吃便宜的（和网页版一个策略）
            var needHp = player.hp < player.stats.hp * 0.9;
            var best = -1;
            var bestPrice = int.MaxValue;

            for (var i = 0; i < player.bag.Length; i++)
            {
                var slot = player.bag[i];
                if (slot == null) continue;
                var item = data.Item(slot.id);
                if (item == null || item.type != "potion" || item.lv > player.level) continue;
                if (item.use == null) continue;

                var heals = item.use.hp + item.use.hpPct * player.stats.hp;
                var mana = item.use.mp + item.use.mpPct * player.stats.mp;
                if (needHp && heals <= 0) continue;
                if (!needHp && mana <= 0) continue;
                if (item.price >= bestPrice) continue;
                bestPrice = item.price;
                best = i;
            }

            if (best < 0)
            {
                hud.Log("没有合用的丹药。");
                return;
            }

            var r = Player.UsePotion(data, player, best);
            if (r == null || !r.Ok)
            {
                hud.Log(r?.Message ?? "吃不下。");
                return;
            }
            if (r.Healed > 0) fx.Float(player.x, player.y, "+" + r.Healed, new Color(0.55f, 0.95f, 0.6f));
            if (r.Restored > 0) hud.Log("灵力 +" + r.Restored);
        }

        // ── 提示与自检 ──────────────────────────────────────────

        void AfterFrame()
        {
            UpdateHint();

            frames++;

            // 两个都给的话，跑够 --check 的帧数再截图——让人物先走过去打起来，
            // 截到的才是有特效、有飘字的画面，而不是开局站桩
            var shotAt = checkFrames > 0 ? checkFrames : 45;
            if (shotPath != null)
            {
                if (frames < shotAt || shooting) return;
                shooting = true;
                if (checkFrames > 0) Report();
                Shoot(shotPath);
                return;
            }
            if (checkFrames > 0 && frames >= checkFrames)
            {
                Report();
                GetTree().Quit();
            }
        }

        void UpdateHint()
        {
            if (player.dead)
            {
                hud.SetHint("");
                return;
            }
            var hit = world.FindInteractable(player.x, player.y);
            if (hit == null) hud.SetHint("");
            else if (hit.Kind == "portal") hud.SetHint("按 F 前往 " + (data.Map(hit.Portal.to)?.name ?? hit.Portal.to));
            else hud.SetHint("按 F 与 " + hit.Npc.def.name + " 说话");
        }

        /// <summary>--shot：等这一帧画完再抓，抓完就退。没画完抓到的是黑屏</summary>
        async void Shoot(string path)
        {
            await ToSignal(RenderingServer.Singleton, "frame_post_draw");
            var image = GetViewport().GetTexture().GetImage();
            var err = image.SavePng(path);
            GD.Print(err == Error.Ok ? "截图已保存：" + path : "截图失败：" + err);
            GetTree().Quit();
        }

        /// <summary>
        /// --check：无头跑若干帧，报一遍「该有的东西在不在」。
        ///
        /// 判据是和逻辑层对账，不是写死数量——河阳城是安全区，本来就一只怪都没有，
        /// 「怪物模型 > 0」那种判据会把正确的地图判成错的。
        /// </summary>
        void Report()
        {
            var terrainParts = terrain != null ? terrain.GetChildCount() : 0;
            var npcs = npcRoot != null ? npcRoot.GetChildCount() : 0;
            var alive = 0;
            for (var i = 0; i < world.Monsters.Count; i++)
            {
                if (!world.Monsters[i].dead) alive++;
            }

            var checks = new List<(bool ok, string what)>
            {
                (terrainParts > 0, "地形部件 " + terrainParts + " 个"),
                (npcs == world.Npcs.Count, "NPC 模型 " + npcs + " 个，和逻辑层对得上"),
                (monsterActors.Count == alive, "怪物模型 " + monsterActors.Count + " 只，逻辑层活着 " + alive + " 只"),
                (me != null, "人物模型建起来了"),
                (world != null, "在 " + world?.Def.name + "（" + world?.Def.biome + "）"),
                (player.x > 0 && player.y > 0, "人物落点 " + (int)player.x + "," + (int)player.y),
                (frames >= checkFrames, "连跑 " + frames + " 帧没崩"),
            };

            // 战斗只在「这张图有怪 + 跑够久」时才作为判据：
            // 安全区打不着人，帧数太少也走不到怪跟前，那时候要求打出伤害是冤枉它
            var fightable = alive > 0 && checkFrames >= 400;
            var fight = "自动战斗：放了 " + autoCasts + " 次技能，飘了 " + hits + " 次伤害，击杀 " +
                player.kills + "，死亡 " + player.deaths;
            if (fightable) checks.Add((hits > 0 && autoCasts > 0, fight));

            var text = "诛仙 · 3D 渲染自检\n────────────────────────\n";
            var failed = 0;
            foreach (var c in checks)
            {
                if (!c.ok) failed++;
                text += (c.ok ? "  ✓ " : "  ✗ ") + c.what + "\n";
            }
            if (!fightable) text += "  · " + fight + "（本图无怪或帧数不足，不作判据）\n";
            text += "────────────────────────\n";
            text += failed == 0
                ? "✓ 全部 " + checks.Count + " 项通过 —— 场景搭得起来，逻辑也在跑"
                : "✗ " + failed + " 项不通过";

            if (failed == 0) GD.Print(text);
            else GD.PrintErr(text);
        }
    }
}
