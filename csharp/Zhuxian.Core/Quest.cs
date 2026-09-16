using System;
using System.Collections.Generic;
using Zhuxian.Data;

namespace Zhuxian.Core
{
    /// <summary>交任务的结果</summary>
    public class TurnInResult
    {
        public ZxQuest Quest;
        public int Exp;
        public int Gold;
        public string[] Items;
        /// <summary>这次交任务顺带升了几级</summary>
        public int Levels;
        /// <summary>背包装不下、掉在地上的物品，交给调用方处理</summary>
        public List<string> Overflow = new List<string>();
        /// <summary>链上的下一条；已经是最后一条就是 null</summary>
        public ZxQuest Next;
    }

    /// <summary>山河图上该去哪儿：打怪还是复命</summary>
    public enum MapHint
    {
        Hunt,
        TurnIn,
    }

    /// <summary>
    /// 任务运行时。移植自 src/quest.js。只维护"当前这一条"，链式推进。
    ///
    /// 进度就是一个数字——每条任务只有一个目标，不需要更复杂的结构。
    /// </summary>
    public static class Quest
    {
        /// <summary>当前任务定义；全做完了返回 null</summary>
        public static ZxQuest Current(GameData data, PlayerState p)
        {
            if (string.IsNullOrEmpty(p.quest.current)) return null;
            return data.Quest(p.quest.current);
        }

        /// <summary>
        /// 修为够不够复命。
        ///
        /// 等级只卡这一道关，不卡杀怪计数——打怪的进度永远算数、永远不会丢，
        /// 练到等级回来直接交，不用重打一遍。
        /// </summary>
        public static bool LevelShort(GameData data, PlayerState p)
        {
            var q = Current(data, p);
            return q != null && p.level < q.lv;
        }

        /// <summary>
        /// 目标本身达没达成（杀够了 / 首领打了 / 人见着了），不看等级。
        ///
        /// 和 Complete 分开是有意的：
        ///   GoalMet  决定"还用不用继续打"——达成了就不再高亮目标怪
        ///   Complete 决定"能不能交差"——还要再过一道等级关
        /// 混成一个的话，等级不够时 GoalMet 会一直是 false，目标怪就一直高亮着，
        /// 玩家会以为是没杀够，回去接着刷。
        /// </summary>
        public static bool GoalMet(GameData data, PlayerState p)
        {
            var q = Current(data, p);
            if (q == null) return false;

            var g = q.goal;
            switch (g.type)
            {
                case "kill": return p.quest.progress >= g.count;
                case "boss": return p.quest.progress > 0;
                case "level": return p.level >= g.count;
                case "talk": return p.quest.progress > 0;
                default: return false;
            }
        }

        /// <summary>能不能复命：目标达成，且修为够</summary>
        public static bool Complete(GameData data, PlayerState p)
        {
            return GoalMet(data, p) && !LevelShort(data, p);
        }

        /// <summary>
        /// 杀怪时调用，推进击杀类目标。返回这一下有没有算进度。
        ///
        /// 不看等级。曾经这里卡过"低于建议等级就不计数"，结果 15 条任务里有 11 条
        /// 刚接到时等级都不够——任务挂在追踪栏上、目标明明白白写着，打了却毫无反应。
        /// 沉默地不计数是最糟的反馈：玩家只会以为游戏坏了。
        /// </summary>
        public static bool OnKill(GameData data, PlayerState p, ZxMonster monster)
        {
            var q = Current(data, p);
            if (q == null) return false;

            var g = q.goal;
            if (g.type == "kill" && g.monster == monster.id && p.quest.progress < g.count)
            {
                p.quest.progress += 1;
                return true;
            }
            if (g.type == "boss" && g.id == monster.id && p.quest.progress == 0)
            {
                p.quest.progress = 1;
                return true;
            }
            return false;
        }

        /// <summary>和 NPC 说话时调用</summary>
        public static bool OnTalk(GameData data, PlayerState p, string npcKey)
        {
            var q = Current(data, p);
            if (q == null) return false;
            if (q.goal.type != "talk") return false;

            RequireTalkGoalSupport();
            return false;
        }

        /// <summary>
        /// talk 类任务目前一条都没有——15 条主线全是 kill 和 boss。
        /// 于是导出的 ZxQuestGoal 里压根没有 npc 字段（字段表是照着真实数据生成的），
        /// 这边也就没法把 quest.js 里那几行原样翻过来。
        ///
        /// 与其偷偷返回 false 装作没这回事，不如在真出现时当场喊出来：
        /// 那种"任务就是推不动"的 bug，查起来能耗掉一整个下午。
        /// </summary>
        static void RequireTalkGoalSupport()
        {
            throw new NotSupportedException(
                "数据里出现了 talk 类任务，但 C# 移植版还没支持 —— " +
                "需要在 quests.js 的 goal 上补 npc 字段、重跑 npm run export:data，" +
                "再把 Quest.OnTalk / TargetMaps 里的 talk 分支补全");
        }

        /// <summary>这个 NPC 身上有没有可交的任务</summary>
        public static bool CanTurnInAt(GameData data, PlayerState p, string npcKey)
        {
            var q = Current(data, p);
            return q != null && q.turnIn == npcKey && Complete(data, p);
        }

        /// <summary>交任务：发奖励、推进到下一条。交不了返回 null</summary>
        public static TurnInResult TurnIn(GameData data, PlayerState p, string npcKey)
        {
            if (!CanTurnInAt(data, p, npcKey)) return null;

            var q = Current(data, p);
            var r = q.reward;
            var result = new TurnInResult
            {
                Quest = q,
                Exp = r?.exp ?? 0,
                Gold = r?.gold ?? 0,
                Items = r?.items ?? Array.Empty<string>(),
            };

            p.gold += result.Gold;
            result.Levels = Player.GainExp(data, p, result.Exp);

            foreach (var id in result.Items)
            {
                var res = Inventory.Add(data, p.bag, id, 1);
                p.bag = res.Bag;
                if (res.Added < 1) result.Overflow.Add(id);
            }

            p.quest.done.Add(q.key);
            var next = NextQuest(data, q.key);
            p.quest.current = next?.key;
            p.quest.progress = 0;
            result.Next = next;

            return result;
        }

        /// <summary>链上的下一条；查不到这条 key 时从头开始，到头了返回 null</summary>
        public static ZxQuest NextQuest(GameData data, string key)
        {
            var q = data.Quest(key);
            if (q == null) return data.Quests.Length > 0 ? data.Quests[0] : null;
            var i = q.index + 1;
            return i < data.Quests.Length ? data.Quests[i] : null;
        }

        /// <summary>这个 NPC 是不是当前任务的发布人（对话框里要显示任务简介）</summary>
        public static bool IsGiver(GameData data, PlayerState p, string npcKey)
        {
            var q = Current(data, p);
            // 用 GoalMet 而不是 Complete：已经打够了就别再把任务简介念一遍，
            // 哪怕等级还差着——那时该说的是"去练级"，不是"去打怪"
            return q != null && q.giver == npcKey && !GoalMet(data, p);
        }

        /// <summary>
        /// 站在复命 NPC 面前，目标也达成了，就差等级。
        /// 这种情况必须单独说一句——否则玩家跑过来只收到一句闲聊，
        /// 完全不知道自己卡在哪儿。
        /// </summary>
        public static bool WaitingForLevel(GameData data, PlayerState p, string npcKey)
        {
            var q = Current(data, p);
            return q != null && q.turnIn == npcKey && GoalMet(data, p) && LevelShort(data, p);
        }

        /// <summary>
        /// 当前任务要打的怪 id。没有击杀类目标、或已经打够了就返回 null。
        /// 渲染层拿它在场上把目标怪标出来——不然一地长得都差不多的妖兽，
        /// 玩家只能挨个试。
        /// </summary>
        public static string TargetMonsterId(GameData data, PlayerState p)
        {
            var q = Current(data, p);
            if (q == null || GoalMet(data, p)) return null;
            if (q.goal.type == "kill") return q.goal.monster;
            if (q.goal.type == "boss") return q.goal.id;
            return null;
        }

        /// <summary>
        /// 当前任务该去哪张图。山河图面板拿它标颜色——
        /// 目标怪不在当前这张图时，玩家原本只能一张张图挨着翻。
        /// </summary>
        public static Dictionary<string, MapHint> TargetMaps(GameData data, PlayerState p)
        {
            var out_ = new Dictionary<string, MapHint>();
            var q = Current(data, p);
            if (q == null) return out_;

            // 打够了就指向复命地点——哪怕等级还差着。
            // 去的路上顺手就练上去了，总比让人对着已经杀够的怪继续刷强
            if (GoalMet(data, p))
            {
                var npc = data.Npc(q.turnIn);
                if (npc != null) out_[npc.map] = MapHint.TurnIn;
                return out_;
            }

            var id = TargetMonsterId(data, p);
            if (id == null)
            {
                // 没有击杀类目标（比如找人说话），那就指向该找的那个 NPC
                if (q.goal.type == "talk") RequireTalkGoalSupport();
                return out_;
            }

            foreach (var m in data.Maps)
            {
                var found = m.boss != null && m.boss.present && m.boss.id == id;
                if (!found && m.spawns != null)
                {
                    foreach (var s in m.spawns)
                    {
                        if (s.id != id) continue;
                        found = true;
                        break;
                    }
                }
                if (found) out_[m.key] = MapHint.Hunt;
            }
            return out_;
        }
    }
}
