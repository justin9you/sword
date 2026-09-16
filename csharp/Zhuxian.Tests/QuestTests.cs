using System.Collections.Generic;
using Zhuxian.Core;

namespace Zhuxian.Tests
{
    /// <summary>
    /// 任务推进的对照测试。对应 src/quest.js。
    ///
    /// 重点盯两处：
    ///   goalMet（打够没）和 complete（能不能交）必须分开——等级不够时目标怪不该还高亮；
    ///   杀怪计数不看等级——低于建议等级打的怪照样算数，否则任务就"打了没反应"。
    /// </summary>
    static class QuestTests
    {
        public static void Run(GameData data)
        {
            Check.Group("任务推进", () =>
            {
                var fx = Fixtures.Load<QuestFixture>("quest.json");
                Check.True(fx.steps.Length > 0, "样本非空");

                var p = Player.Create(data, "测试", "qingyun");
                var yegou = data.Monster("yegou");
                var shanzhu = data.Monster("shanzhu");
                var shanzei = data.Monster("shanzei");
                var step = 0;

                Assert(data, p, fx.steps[step++], "刚建号");

                for (var i = 0; i < 3; i++) Quest.OnKill(data, p, yegou);
                Assert(data, p, fx.steps[step++], "杀了3只");

                // 杀别的怪不该算进度
                Quest.OnKill(data, p, shanzhu);
                Assert(data, p, fx.steps[step++], "杀了只野猪");

                for (var i = 0; i < 3; i++) Quest.OnKill(data, p, yegou);
                Assert(data, p, fx.steps[step++], "杀满6只");

                // 杀超了也不该继续加
                Quest.OnKill(data, p, yegou);
                Assert(data, p, fx.steps[step++], "超杀一只");

                var r = Quest.TurnIn(data, p, "linjingyu");
                Check.True(r != null, "交 q1 应该成功");
                if (r != null)
                {
                    var e = fx.turnIns[0];
                    Check.Equal(r.Exp, e.exp, "交 q1 给的经验");
                    Check.Equal(r.Gold, e.gold, "交 q1 给的金钱");
                    Check.Equal(r.Levels, e.levels, "交 q1 顺带升了几级");
                    Check.Equal(r.Items.Length, e.items.Length, "交 q1 给的物品数");
                    for (var i = 0; i < r.Items.Length && i < e.items.Length; i++)
                    {
                        Check.True(r.Items[i] == e.items[i], "交 q1 第 " + i + " 件物品",
                            "期望 " + e.items[i] + "，实得 " + r.Items[i]);
                    }
                    Check.Equal(r.Overflow.Count, e.overflow.Length, "交 q1 溢出到地上的件数");
                    Check.True((r.Next?.key) == e.nextKey, "交 q1 之后的下一条任务",
                        "期望 " + e.nextKey + "，实得 " + r.Next?.key);
                    Check.Equal(p.gold, e.playerGold, "交 q1 之后的金钱");
                    Check.Equal(p.level, e.playerLevel, "交 q1 之后的等级");
                }
                Assert(data, p, fx.steps[step++], "交完 q1");

                for (var i = 0; i < 5; i++) Quest.OnKill(data, p, shanzei);
                Assert(data, p, fx.steps[step++], "q2 目标打完");

                // 找错人交不了
                Check.Equal(Quest.TurnIn(data, p, "tianbuyi") == null, fx.turnIns[1].wasNull, "找错人交任务");
            });
        }

        static void Assert(GameData data, PlayerState p, QuestStep e, string tag)
        {
            Check.True(p.quest.current == e.current, tag + " 当前任务",
                "期望 " + e.current + "，实得 " + p.quest.current);
            Check.Equal(p.quest.progress, e.progress, tag + " 进度");
            Check.Equal(p.level, e.level, tag + " 等级");
            Check.Equal(Quest.GoalMet(data, p), e.goalMet, tag + " 目标达成");
            Check.Equal(Quest.LevelShort(data, p), e.levelShort, tag + " 修为不够");
            Check.Equal(Quest.Complete(data, p), e.complete, tag + " 能否复命");
            // 问的是当前这条任务自己的发布人 / 复命人。
            // 固定问某一个 NPC 的话，「目标打完但等级不够」那一刻正好问不到点上——
            // 而那是唯一能区分 goalMet 和 complete 的时刻
            var cur = Quest.Current(data, p);
            Check.True(cur?.giver == e.giver, tag + " 发布人", "期望 " + e.giver + "，实得 " + cur?.giver);
            Check.True(cur?.turnIn == e.turnInNpc, tag + " 复命人");
            Check.Equal(Quest.IsGiver(data, p, e.giver), e.isGiverAtGiver, tag + " 发布人处显示任务简介");
            Check.Equal(Quest.WaitingForLevel(data, p, e.turnInNpc), e.waitingAtTurnIn, tag + " 卡在等级上");
            Check.Equal(Quest.CanTurnInAt(data, p, e.turnInNpc), e.canTurnInAtTurnIn, tag + " 能不能复命");
            Check.True(Quest.TargetMonsterId(data, p) == e.targetMonsterId, tag + " 目标怪",
                "期望 " + e.targetMonsterId + "，实得 " + Quest.TargetMonsterId(data, p));
            Check.Equal(p.quest.done.Count, e.doneCount, tag + " 已交任务数");

            AssertMaps(Quest.TargetMaps(data, p), e.targetMaps, tag);
        }

        static void AssertMaps(Dictionary<string, MapHint> actual, MapHintEntry[] expected, string tag)
        {
            Check.Equal(actual.Count, expected.Length, tag + " 目标地图数量");
            foreach (var e in expected)
            {
                if (!actual.TryGetValue(e.map, out var hint))
                {
                    Check.True(false, tag + " 目标地图缺了 " + e.map);
                    continue;
                }
                var want = e.hint == "turnin" ? MapHint.TurnIn : MapHint.Hunt;
                Check.True(hint == want, tag + " 地图 " + e.map + " 的提示类型",
                    "期望 " + e.hint + "，实得 " + hint);
            }
        }
    }
}
