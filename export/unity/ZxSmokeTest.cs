// 数据包冒烟测试：挂在任意 GameObject 上，按 Play 就知道数据管道通没通。
//
// 只依赖这个数据包本身，不需要逻辑层。回答的是最基本的那个问题——
// JSON 读进来了吗、字段对得上吗、几个已知的坑是不是像文档说的那样。
//
// 想连游戏逻辑一起验，把 csharp/Zhuxian.Core 也拖进工程——那边有完整的战斗、
// 背包、任务、技能、存档，Godot 适配器里的 ZxSmoke.cs 就是这么干的。
//
// 由 tools/export-gamedata.mjs 原样拷进 export/unity/。

using System.Text;
using UnityEngine;
using Zhuxian.Data;

namespace Zhuxian.Data
{
    public class ZxSmokeTest : MonoBehaviour
    {
        [Tooltip("勾上则在 Start 时自动跑一遍")]
        public bool runOnStart = true;

        int passed;
        int failed;
        StringBuilder report;

        void Start()
        {
            if (runOnStart) Run();
        }

        [ContextMenu("跑一遍数据包冒烟测试")]
        public void Run()
        {
            passed = 0;
            failed = 0;
            report = new StringBuilder();
            report.AppendLine("诛仙数据包冒烟测试");
            report.AppendLine("────────────────────────");

            ZxDatabase db;
            try
            {
                ZxDatabase.Clear();
                db = ZxDatabase.Load();
            }
            catch (System.Exception e)
            {
                Debug.LogError("✗ 数据包加载失败：" + e.Message +
                               "\n确认 ZhuxianData 整个目录放在了 Assets/Resources/ 下");
                return;
            }

            Counts(db);
            Lookups(db);
            KnownTraps(db);
            Conversions(db);

            report.AppendLine("────────────────────────");
            report.Append(failed == 0 ? "✓ 全部 " + passed + " 项通过" : "✗ " + failed + " 项不通过（" + passed + " 项通过）");

            if (failed == 0) Debug.Log(report.ToString());
            else Debug.LogError(report.ToString());
        }

        void Counts(ZxDatabase db)
        {
            Section("表都读进来了");
            Check(db.items.Length > 0, "物品 " + db.items.Length + " 件");
            Check(db.monsters.Length > 0, "怪物 " + db.monsters.Length + " 种");
            Check(db.maps.Length > 0, "地图 " + db.maps.Length + " 张");
            Check(db.npcs.Length > 0, "NPC " + db.npcs.Length + " 个");
            Check(db.quests.Length > 0, "任务 " + db.quests.Length + " 条");
            Check(db.sects.Length > 0, "门派 " + db.sects.Length + " 个");
            Check(db.config != null && db.config.TILE > 0, "数值常量（一格 " + (db.config?.TILE ?? 0) + " 像素）");
        }

        void Lookups(ZxDatabase db)
        {
            Section("按 id 查得到");

            var sword = db.Item("w_qingyunjian");
            Check(sword != null, "青云弟子剑" + (sword == null ? "（查不到）" : "：攻击 " + sword.stats.atk + "，等级 " + sword.lv));

            var wolf = db.Monster("yegou");
            Check(wolf != null, "野狗" + (wolf == null ? "（查不到）" : "：气血 " + wolf.maxHp + "，经验 " + wolf.exp));

            var village = db.Map("caomiao");
            Check(village != null, "草庙村" + (village == null ? "（查不到）" : "：" + village.w + "×" + village.h + " 格，刷怪 " + village.spawns.Length + " 种"));

            var sect = db.Sect("qingyun");
            Check(sect != null && sect.skills.Length > 0,
                "青云门" + (sect == null ? "（查不到）" : "：" + sect.skills.Length + " 个技能，头一个是「" + sect.skills[0].name + "」"));

            var onMap = db.NpcsOnMap("caomiao");
            Check(onMap.Length > 0, "草庙村上有 " + onMap.Length + " 个 NPC");

            // 查不到的 id 必须返回 null，不能给个假对象——
            // 否则接线错了也不报，问题会飘到很远的地方才炸
            Check(db.Item("gen_ben_mei_zhe_dong_xi") == null, "查不到的 id 返回 null");
        }

        void KnownTraps(ZxDatabase db)
        {
            Section("几个已知的坑");

            // JsonUtility 不给可序列化类留 null，所以可选字段靠 present 标记区分
            var potion = db.Item("c_xiaohuan");
            var weapon = db.Item("w_qingyunjian");
            Check(potion != null && !potion.stats.present, "丹药没有属性加成（stats.present = false）");
            Check(weapon != null && weapon.stats.present, "兵器有属性加成（stats.present = true）");

            var talisman = FindActiveTalisman(db);
            Check(talisman != null, talisman == null ? "没找到带主动效果的法宝" :
                "法宝「" + talisman.name + "」的主动效果是 " + talisman.active.kind);

            // 缺席的数组在导出时已经补成空数组，不用担心 null
            var plainNpc = FindNpcWithoutShop(db);
            Check(plainNpc == null || plainNpc.stock != null,
                plainNpc == null ? "（每个 NPC 都开店）" : "不卖东西的 NPC「" + plainNpc.name + "」的货单是空数组而不是 null");

            // 有一张图是没有首领的安全区
            var safe = FindMapWithoutBoss(db);
            Check(safe != null, safe == null ? "（每张图都有首领）" : "「" + safe.name + "」没有首领（boss.present = false）");
        }

        void Conversions(ZxDatabase db)
        {
            Section("坐标与曲线");

            var village = db.Map("caomiao");
            if (village != null)
            {
                var px = db.ToPixels(village.start.x);
                Check(px > 0, "出生点第 " + village.start.x + " 格 = " + px + " 像素");
            }

            var need12 = db.ExpToNext(12);
            var need13 = db.ExpToNext(13);
            Check(need12 > 0 && need13 > need12, "12 级升 13 级要 " + need12 + " 经验，再往上要 " + need13 + "（曲线递增）");
            Check(db.ExpToNext(db.config.MAX_LEVEL) == int.MaxValue, "满级（" + db.config.MAX_LEVEL + "）不再要经验");

            var quality = db.Quality("legend");
            Check(quality != null, quality == null ? "查不到神器品质" : "神器品质：" + quality.name + "，售价倍率 " + quality.mul);
        }

        // ── 找样例用的小工具 ──────────────────────────────────

        ZxItem FindActiveTalisman(ZxDatabase db)
        {
            foreach (var it in db.items)
            {
                if (it.active != null && it.active.present) return it;
            }
            return null;
        }

        ZxNpc FindNpcWithoutShop(ZxDatabase db)
        {
            foreach (var n in db.npcs)
            {
                if (!n.shop) return n;
            }
            return null;
        }

        ZxMap FindMapWithoutBoss(ZxDatabase db)
        {
            foreach (var m in db.maps)
            {
                if (m.boss == null || !m.boss.present) return m;
            }
            return null;
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
