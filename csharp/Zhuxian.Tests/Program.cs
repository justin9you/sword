using System;
using Zhuxian.Core;
using Zhuxian.Data;

namespace Zhuxian.Tests
{
    /// <summary>
    /// 逻辑层移植的对照测试：同样的输入、同样的随机数序列，
    /// C# 的结果必须和网页版（JS）一字不差。
    ///
    /// 样本由 tools/gen-fixtures.mjs 从 JS 那边跑出来，所以这里比的不是
    /// 「我以为公式该是什么样」，而是「网页版实际算出来是多少」。
    ///
    /// 数据直接读 export/ 下导出的那份，和 Unity 拿到的是同一批数值。
    /// </summary>
    static class Program
    {
        static int Main()
        {
            Console.OutputEncoding = System.Text.Encoding.UTF8;
            Console.WriteLine();
            Console.WriteLine("  逻辑层对照测试（C# ←→ JS）");

            var data = LoadGameData();

            CombatTests.RandomSequence();
            CombatTests.ExpCurve(data.Config);
            CombatTests.Derive(data.Sects);
            CombatTests.Damage(data.Config);
            CombatTests.Buffs();
            CombatTests.Misc();

            InventoryTests.Run(data);
            PlayerTests.Run(data);
            QuestTests.Run(data);
            WorldTests.Run(data);
            SkillsTests.Run(data);
            SaveTests.Run(data);

            return Check.Report();
        }

        static GameData LoadGameData()
        {
            return new GameData(
                Fixtures.LoadGameData<ZxConfig>("config.json"),
                Fixtures.LoadGameData<ZxItemList>("items.json").items,
                Fixtures.LoadGameData<ZxMonsterList>("monsters.json").monsters,
                Fixtures.LoadGameData<ZxMapList>("maps.json").maps,
                Fixtures.LoadGameData<ZxNpcList>("npcs.json").npcs,
                Fixtures.LoadGameData<ZxQuestList>("quests.json").quests,
                Fixtures.LoadGameData<ZxSectList>("sects.json").sects);
        }
    }
}
