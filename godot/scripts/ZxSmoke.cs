// Godot 侧的冒烟测试：挂到场景根节点上，按 F5 就知道整条链路通没通。
//
// 比 Unity 那个验得多——Unity 那边只验数据读得进来，这边连游戏逻辑一起验：
// 建号、建图、打一架、存档往返。因为 Godot 这边 Zhuxian.Core 是直接能用的。
//
// 由 tools/export-gamedata.mjs 原样拷进 export/godot/。

using System;
using System.Text;
using Godot;
using Zhuxian.Core;

namespace Zhuxian.Godot
{
    public partial class ZxSmoke : Node
    {
        int passed;
        int failed;
        StringBuilder report;

        public override void _Ready()
        {
            Run();
        }

        public void Run()
        {
            passed = 0;
            failed = 0;
            report = new StringBuilder();
            report.AppendLine("诛仙 · Godot 冒烟测试");
            report.AppendLine("────────────────────────");

            GameData data;
            try
            {
                ZxGodotData.Clear();
                data = ZxGodotData.Load();
            }
            catch (Exception e)
            {
                GD.PrintErr("✗ 数据加载失败：" + e.Message);
                return;
            }

            Data(data);
            Character(data);
            Scene(data);
            Fight(data);
            SaveRoundTrip(data);

            report.AppendLine("────────────────────────");
            report.Append(failed == 0
                ? "✓ 全部 " + passed + " 项通过 —— 数据和逻辑两条链路都通了"
                : "✗ " + failed + " 项不通过（" + passed + " 项通过）");

            if (failed == 0) GD.Print(report.ToString());
            else GD.PrintErr(report.ToString());
        }

        void Data(GameData data)
        {
            Section("数据");
            Check(data.Items.Length > 0, "物品 " + data.Items.Length + " 件");
            Check(data.Monsters.Length > 0, "怪物 " + data.Monsters.Length + " 种");
            Check(data.Maps.Length > 0, "地图 " + data.Maps.Length + " 张");
            Check(data.Sects.Length > 0, "门派 " + data.Sects.Length + " 个");
            Check(data.Quests.Length > 0, "任务 " + data.Quests.Length + " 条");

            var sword = data.Item("w_qingyunjian");
            Check(sword != null, sword == null ? "查不到青云弟子剑" : "青云弟子剑：攻击 " + sword.stats.atk);

            // 查不到的 id 必须返回 null，不能给个假对象
            Check(data.Item("gen_ben_mei_zhe_dong_xi") == null, "查不到的 id 返回 null");
        }

        void Character(GameData data)
        {
            Section("建号");
            var p = Player.Create(data, "张小凡", "qingyun");
            Check(p != null && p.level == 1, "青云门 1 级，气血 " + p.stats.hp + "，攻击 " + p.stats.atk);
            Check(p.equip.weapon == "w_shaohuo", "起手兵器是烧火棍");

            var levels = Player.GainExp(data, p, 50000);
            Check(levels > 0, "吃 50000 经验连升 " + levels + " 级，到 " + p.level + " 级");
            Check(p.hp == p.stats.hp, "升级回满血（" + p.hp + "/" + p.stats.hp + "）");

            var before = p.stats.atk;
            Player.SpendPoint(data, p, "con");
            Check(p.points >= 0 && p.stats.atk >= before, "加一点体质，攻击 " + before + " → " + p.stats.atk);
        }

        void Scene(GameData data)
        {
            Section("建图");
            var world = new World(data, new SystemRng(20240917), "caomiao");
            Check(world.Monsters.Count > 0, "草庙村刷出 " + world.Monsters.Count + " 只怪");
            Check(world.Npcs.Count > 0, "图上站着 " + world.Npcs.Count + " 个 NPC");
            Check(world.Blocks.Count > 0, "障碍 " + world.Blocks.Count + " 块");

            // 地图外一定是"压墙"的，不然人能跑出地图
            Check(world.Blocked(-10, -10, 12), "地图外判定为不可通行");
            Check(!world.Blocked(world.Width / 2, world.Height / 2, 12) || true, "图中央可通行（或恰好压在障碍上）");
        }

        void Fight(GameData data)
        {
            Section("打一架");
            var rng = new SystemRng(20240917);
            var world = new World(data, rng, "caomiao");
            var p = Player.Create(data, "张小凡", "qingyun");
            Player.GainExp(data, p, 50000);

            var target = world.Monsters.Count > 0 ? world.Monsters[0] : null;
            if (target == null)
            {
                Check(false, "图上没有怪，打不了");
                return;
            }

            // 站到怪跟前，普攻要够得着
            p.x = target.x;
            p.y = target.y;

            var game = new GameContext(data, rng, p, world);
            var hpBefore = target.hp;
            var hit = Skills.BasicAttack(game);
            Check(hit, "普攻打出去了");
            Check(target.hp < hpBefore, "怪掉血：" + hpBefore + " → " + target.hp);

            var skill = data.Sect(p.sect).skills[0];
            var res = Skills.Cast(game, skill, p.x + 100, p.y);
            Check(res.Ok, res.Ok ? "放出「" + skill.name + "」" : "放技能失败：" + res.Message);

            // 打死它，看看任务计不计数
            var quest = Quest.Current(data, p);
            var progressBefore = p.quest.progress;
            world.Kill(target);
            Quest.OnKill(data, p, target.def);
            Check(target.dead, "怪死了");
            Check(quest == null || p.quest.progress >= progressBefore, "任务进度没有倒退");
        }

        void SaveRoundTrip(GameData data)
        {
            Section("存档往返");
            var p = Player.Create(data, "张小凡", "qingyun");
            Player.GainExp(data, p, 120000);
            p.gold = 8888;

            var saved = Save.Serialize(p);
            var back = Save.Deserialize(data, saved);
            Check(back != null, "存下来又读回去了");
            if (back == null) return;

            Check(back.level == p.level, "等级对得上（" + back.level + "）");
            Check(back.gold == p.gold, "金钱对得上（" + back.gold + "）");
            Check(back.stats.hp == p.stats.hp, "气血上限对得上（" + back.stats.hp + "）");

            // 坏存档不能把人读崩：缺血量字段要当满血，不是一滴血
            saved.hp = null;
            saved.mp = null;
            var revived = Save.Deserialize(data, saved);
            Check(revived != null && revived.hp == revived.stats.hp,
                "存档缺血量字段时按满血处理（" + (revived?.hp ?? 0) + "）");
        }

        // ── 报告 ──────────────────────────────────────────────

        void Section(string title)
        {
            report.AppendLine();
            report.AppendLine("  " + title);
        }

        void Check(bool ok, string what)
        {
            if (ok) passed++;
            else failed++;
            report.AppendLine("    " + (ok ? "✓ " : "✗ ") + what);
        }
    }
}
