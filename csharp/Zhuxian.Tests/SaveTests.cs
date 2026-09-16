using System;
using System.Linq;
using Zhuxian.Core;

namespace Zhuxian.Tests
{
    /// <summary>
    /// 存档校验的对照测试。对应 src/save.js 里与存储无关的那一半。
    ///
    /// 这里全是「坏存档」：旧版本存的、字段被手改过的、指向已经删掉的物品的。
    /// 这些路径平时跑不到，一旦跑到就是读档白屏或者一滴血出门。
    /// </summary>
    static class SaveTests
    {
        public static void Run(GameData data)
        {
            RoundTrip(data);
            Hostile(data);
            Summaries(data);
        }

        static void RoundTrip(GameData data)
        {
            Check.Group("存档往返", () =>
            {
                var fx = Fixtures.Load<SaveFixture>("save.json");
                Check.True(fx.roundTrip.Length > 0, "样本非空");

                var c = fx.roundTrip[0];
                var p = Save.Deserialize(data, ToSaveData(c.saved));
                Check.True(p != null, "正常存档应该读得出来");
                if (p == null) return;

                AssertPlayer(p, c.after, "往返");

                // 再存一次：存下来的东西必须和存档里一致，
                // 不然存一次就走样一点，存几次角色就飘了
                var again = Save.Serialize(p);
                Check.Near(again.level ?? 0, c.saved.level ?? 0, "再存一次的等级");
                Check.Near(again.exp ?? 0, c.saved.exp ?? 0, "再存一次的经验");
                Check.Near(again.gold ?? 0, c.saved.gold ?? 0, "再存一次的金钱");
                Check.True(again.map == c.saved.map, "再存一次的地图");
                Check.True(again.quest.current == c.saved.quest.current, "再存一次的当前任务");
            });
        }

        static void Hostile(GameData data)
        {
            Check.Group("坏存档不能把人读崩", () =>
            {
                var fx = Fixtures.Load<SaveFixture>("save.json");
                Check.True(fx.hostile.Length > 0, "样本非空");

                foreach (var c in fx.hostile)
                {
                    var p = Save.Deserialize(data, ToSaveData(c.saved));

                    if (c.after == null)
                    {
                        // 缺门派 / 缺名字：整份存档作废，当没有存档
                        Check.True(p == null, c.step + " 应该整份作废");
                        continue;
                    }

                    Check.True(p != null, c.step + " 不该读成 null");
                    if (p == null) continue;
                    AssertPlayer(p, c.after, c.step);
                }
            });
        }

        static void Summaries(GameData data)
        {
            Check.Group("存档摘要", () =>
            {
                var fx = Fixtures.Load<SaveFixture>("save.json");
                Check.True(fx.summaries.Length > 0, "样本非空");

                var normal = Save.Summarize(data, ToSaveData(fx.roundTrip[0].saved));
                Check.True(normal != null, "正常存档该有摘要");
                if (normal == null) return;
                Check.True(normal.Name == fx.summaries[0].name, "摘要里的名字");
                Check.True(normal.Sect == fx.summaries[0].sect, "摘要里的门派名",
                    "期望 " + fx.summaries[0].sect + "，实得 " + normal.Sect);
                Check.Equal(normal.Level, fx.summaries[0].level, "摘要里的等级");
                Check.True(normal.Map == fx.summaries[0].map, "摘要里的地图名",
                    "期望 " + fx.summaries[0].map + "，实得 " + normal.Map);

                // 地图 key 认不出来时回落到第一张图，不该崩也不该显示空白
                var broken = ToSaveData(fx.roundTrip[0].saved);
                broken.map = "bu_cun_zai";
                var fallback = Save.Summarize(data, broken);
                Check.True(fallback != null && fallback.Map == fx.summaries[1].map,
                    "地图不存在时摘要回落", "期望 " + fx.summaries[1].map + "，实得 " + fallback?.Map);
            });
        }

        /// <summary>样本里的原始存档 → C# 的 SaveData</summary>
        static SaveData ToSaveData(RawSave r)
        {
            return new SaveData
            {
                v = r.v,
                name = r.name,
                sect = r.sect,
                level = r.level,
                exp = r.exp,
                gold = r.gold,
                points = r.points,
                @base = r.@base == null ? null : new BaseStats(r.@base.con, r.@base.spi, r.@base.agi, r.@base.wit),
                bag = r.bag?.Select(s => s == null ? null : new BagSlot(s.id, s.n)).ToArray(),
                equip = r.equip == null ? null : new Equipment
                {
                    weapon = r.equip.weapon, talisman = r.equip.talisman, robe = r.equip.robe,
                    bracer = r.equip.bracer, boots = r.equip.boots, pendant = r.equip.pendant,
                },
                map = r.map,
                hp = r.hp,
                mp = r.mp,
                quest = r.quest == null ? null : new QuestSave
                {
                    current = r.quest.current,
                    progress = r.quest.progress,
                    done = r.quest.done,
                },
                visited = r.visited,
                kills = r.kills,
                deaths = r.deaths,
                playMs = r.playMs,
                at = r.at,
            };
        }

        static void AssertPlayer(PlayerState p, SavedPlayerSnapshot e, string tag)
        {
            Check.True(p.name == e.name, tag + " 名字", "期望 " + e.name + "，实得 " + p.name);
            Check.True(p.sect == e.sect, tag + " 门派");
            Check.Equal(p.level, e.level, tag + " 等级");
            Check.Equal(p.exp, e.exp, tag + " 经验");
            Check.Equal(p.gold, e.gold, tag + " 金钱");
            Check.Equal(p.points, e.points, tag + " 可分配点数");
            Check.Equal(p.@base.con, e.@base.con, tag + " 体质");
            Check.Equal(p.@base.spi, e.@base.spi, tag + " 灵根");
            Check.Equal(p.@base.agi, e.@base.agi, tag + " 身法");
            Check.Equal(p.@base.wit, e.@base.wit, tag + " 悟性");
            Check.Near(p.hp, e.hp, tag + " 当前气血");
            Check.Near(p.mp, e.mp, tag + " 当前灵力");
            Check.True(p.map == e.map, tag + " 所在地图", "期望 " + e.map + "，实得 " + p.map);

            var visited = p.visited.OrderBy(x => x, StringComparer.Ordinal).ToArray();
            Check.Equal(visited.Length, e.visited.Length, tag + " 去过的地图数量");
            for (var i = 0; i < visited.Length && i < e.visited.Length; i++)
            {
                Check.True(visited[i] == e.visited[i], tag + " 去过的第 " + i + " 张图",
                    "期望 " + e.visited[i] + "，实得 " + visited[i]);
            }

            Check.True(p.quest.current == e.questCurrent, tag + " 当前任务",
                "期望 " + (e.questCurrent ?? "null") + "，实得 " + (p.quest.current ?? "null"));
            Check.Equal(p.quest.progress, e.questProgress, tag + " 任务进度");
            Check.Equal(p.quest.done.Count, e.questDone.Length, tag + " 已交任务数");

            Check.Equal(p.kills, e.kills, tag + " 击杀数");
            Check.Equal(p.deaths, e.deaths, tag + " 死亡数");
            Check.Near(p.playMs, e.playMs, tag + " 游戏时长");

            Check.Equal(p.bag.Length, e.bag.Length, tag + " 背包格数");
            for (var i = 0; i < p.bag.Length && i < e.bag.Length; i++)
            {
                var a = p.bag[i];
                var x = e.bag[i];
                if (x == null)
                {
                    Check.True(a == null, tag + " 背包第 " + i + " 格应为空",
                        a == null ? null : "实得 " + a.id + "×" + a.n);
                    continue;
                }
                Check.True(a != null && a.id == x.id && a.n == x.n, tag + " 背包第 " + i + " 格",
                    "期望 " + x.id + "×" + x.n + "，实得 " + (a == null ? "空" : a.id + "×" + a.n));
            }

            Check.True(p.equip.weapon == e.equip.weapon, tag + " 兵器",
                "期望 " + (e.equip.weapon ?? "空") + "，实得 " + (p.equip.weapon ?? "空"));
            Check.True(p.equip.robe == e.equip.robe, tag + " 衣袍");
            Check.True(p.equip.boots == e.equip.boots, tag + " 靴履");
            Check.True(p.equip.talisman == e.equip.talisman, tag + " 法宝");

            InventoryTests.AssertStats(p.stats, e.stats, tag);
        }
    }
}
