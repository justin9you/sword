using Zhuxian.Core;

namespace Zhuxian.Tests
{
    /// <summary>
    /// 玩家状态机的对照测试。对应 src/player.js。
    ///
    /// Recompute 是整条数值链的收口：加点、装备、增益全汇到这里。
    /// 它对得上，前面 Stats / Combat / Inventory 的成果才真正连成一条线。
    /// </summary>
    static class PlayerTests
    {
        public static void Run(GameData data)
        {
            var fx = Fixtures.Load<PlayerFixture>("player.json");

            Created(data, fx);
            Leveling(data, fx);
            Spending(data, fx);
            Buffed(data, fx);
            EquipSwap(data, fx);
            Potions(data, fx);
            Regen(data, fx);
            Death(data, fx);
            Movement(data, fx);
        }

        static void Created(GameData data, PlayerFixture fx)
        {
            Check.Group("建号", () =>
            {
                Check.True(fx.created.Length > 0, "样本非空");
                foreach (var c in fx.created)
                {
                    var p = Player.Create(data, "测试", c.sect);
                    var s = c.snapshot;
                    var tag = c.sect + " 建号";

                    Check.True(p.name == s.name, tag + " 名字");
                    Check.True(p.sect == s.sect, tag + " 门派");
                    Check.Equal(p.level, s.level, tag + " 等级");
                    Check.Equal(p.exp, s.exp, tag + " 经验");
                    Check.Equal(p.gold, s.gold, tag + " 金钱");
                    Check.Equal(p.points, s.points, tag + " 可分配点数");
                    Check.Equal(p.@base.con, s.@base.con, tag + " 体质");
                    Check.Equal(p.@base.spi, s.@base.spi, tag + " 灵根");
                    Check.Equal(p.@base.agi, s.@base.agi, tag + " 身法");
                    Check.Equal(p.@base.wit, s.@base.wit, tag + " 悟性");
                    Check.Near(p.hp, s.hp, tag + " 当前气血");
                    Check.Near(p.mp, s.mp, tag + " 当前灵力");
                    InventoryTests.AssertStats(p.stats, s.stats, tag);

                    // 开局给的那身褴褛：位置和数量都要一样
                    Check.Equal(p.bag.Length, s.bag.Length, tag + " 背包格数");
                    for (var i = 0; i < p.bag.Length && i < s.bag.Length; i++)
                    {
                        var a = p.bag[i];
                        var e = s.bag[i];
                        if (e == null)
                        {
                            Check.True(a == null, tag + " 背包第 " + i + " 格应为空");
                        }
                        else
                        {
                            Check.True(a != null && a.id == e.id && a.n == e.n,
                                tag + " 背包第 " + i + " 格",
                                "期望 " + e.id + "×" + e.n + "，实得 " + (a == null ? "空" : a.id + "×" + a.n));
                        }
                    }
                    Check.True(p.equip.weapon == s.equip.weapon, tag + " 起手兵器");
                    Check.True(p.equip.robe == s.equip.robe, tag + " 起手衣袍");
                    Check.True(p.equip.boots == s.equip.boots, tag + " 起手靴履");
                }
            });
        }

        static void Leveling(GameData data, PlayerFixture fx)
        {
            Check.Group("升级", () =>
            {
                Check.True(fx.leveling.Length > 0, "样本非空");
                var p = Player.Create(data, "测试", "qingyun");
                foreach (var c in fx.leveling)
                {
                    var levels = Player.GainExp(data, p, c.gain);
                    var tag = "给 " + c.gain + " 经验";
                    Check.Equal(levels, c.levels, tag + " 升了几级");
                    Check.Equal(p.level, c.level, tag + " 之后的等级");
                    Check.Equal(p.exp, c.exp, tag + " 之后的剩余经验");
                    Check.Equal(p.points, c.points, tag + " 之后的可分配点数");
                    // 升级要回满：满血满蓝才是网页版的手感
                    Check.Near(p.hp, c.hp, tag + " 之后的气血");
                    Check.Near(p.mp, c.mp, tag + " 之后的灵力");
                }
            });
        }

        static void Spending(GameData data, PlayerFixture fx)
        {
            Check.Group("加点", () =>
            {
                Check.True(fx.spending.Length > 0, "样本非空");
                var p = Player.Create(data, "测试", "tianyin");
                Player.GainExp(data, p, 50000);

                foreach (var c in fx.spending)
                {
                    var ok = Player.SpendPoint(data, p, c.key);
                    var tag = "加点 " + c.key;
                    Check.Equal(ok, c.ok, tag + " 是否成功");
                    Check.Equal(p.points, c.points, tag + " 之后剩余点数");
                    Check.Equal(p.@base.con, c.@base.con, tag + " 之后体质");
                    Check.Equal(p.@base.spi, c.@base.spi, tag + " 之后灵根");
                    Check.Equal(p.@base.agi, c.@base.agi, tag + " 之后身法");
                    Check.Equal(p.@base.wit, c.@base.wit, tag + " 之后悟性");
                    InventoryTests.AssertStats(p.stats, c.stats, tag);
                }
            });
        }

        /// <summary>
        /// 带增益重算。atkUp / defUp 是含装备之后再乘、然后取整，
        /// 取整方向写错只有在这里露馅——不带增益时乘数是 1，floor 和 round 看不出区别。
        /// </summary>
        static void Buffed(GameData data, PlayerFixture fx)
        {
            Check.Group("带增益重算属性", () =>
            {
                Check.True(fx.buffed.Length > 0, "样本非空");
                foreach (var c in fx.buffed)
                {
                    var p = Player.Create(data, "测试", "qingyun");
                    Player.GainExp(data, p, 120000);
                    if (c.atkUp != 0) Combat.AddBuff(p.buffs, new Buff { kind = "atkUp", ms = 9000, amount = c.atkUp });
                    if (c.defUp != 0) Combat.AddBuff(p.buffs, new Buff { kind = "defUp", ms = 9000, amount = c.defUp });
                    Combat.AddBuff(p.buffs, new Buff { kind = "lifesteal", ms = 9000, amount = 0.12 });
                    Player.Recompute(data, p);

                    var tag = "atkUp=" + c.atkUp + " defUp=" + c.defUp;
                    Check.Equal(p.level, c.level, tag + " 等级");
                    InventoryTests.AssertStats(p.stats, c.stats, tag);
                }
            });
        }

        static void EquipSwap(GameData data, PlayerFixture fx)
        {
            Check.Group("上限变化时按比例保留血量", () =>
            {
                Check.True(fx.equipSwap.Length > 0, "样本非空");
                var p = Player.Create(data, "测试", "guiwang");
                Player.GainExp(data, p, 200000);

                Check.Near(p.hp, fx.equipSwap[0].hp, "升级后的当前气血");
                Check.Near(p.stats.hp, fx.equipSwap[0].maxHp, "升级后的气血上限");

                if (fx.equipSwap.Length < 2) return;

                var off = Inventory.Unequip(data, p.bag, p.equip, "robe");
                Check.True(off != null, "衣袍应该能脱下来");
                if (off == null) return;

                p.bag = off.Bag;
                p.equip = off.Equip;
                Player.Recompute(data, p);

                // 脱装备掉上限，当前血量按比例跟着掉，但不能掉到 0 把人脱死
                Check.Near(p.hp, fx.equipSwap[1].hp, "脱掉衣袍后的当前气血");
                Check.Near(p.stats.hp, fx.equipSwap[1].maxHp, "脱掉衣袍后的气血上限");
                Check.True(p.hp >= 1, "脱装备不该把人脱死");
            });
        }

        static void Potions(GameData data, PlayerFixture fx)
        {
            Check.Group("吃丹药", () =>
            {
                Check.True(fx.potions.Length > 0, "样本非空");
                var p = Player.Create(data, "测试", "qingyun");

                var full = Player.UsePotion(data, p, 0);
                Check.True(full != null, "满血吃药也该有结果");
                if (full == null) return;
                Check.Equal(full.Ok, fx.potions[0].ok, "满血吃药 ok");
                Check.Equal(full.Healed, fx.potions[0].healed, "满血吃药回了多少血");
                Check.Equal(full.Restored, fx.potions[0].restored, "满血吃药回了多少蓝");
                Check.Near(p.hp, fx.potions[0].hp, "满血吃药后的气血");

                if (fx.potions.Length < 2) return;
                p.hp = 10;
                p.mp = 5;
                var hurt = Player.UsePotion(data, p, 0);
                Check.True(hurt != null, "残血吃药该有结果");
                if (hurt == null) return;
                Check.Equal(hurt.Ok, fx.potions[1].ok, "残血吃药 ok");
                Check.Equal(hurt.Healed, fx.potions[1].healed, "残血吃药回了多少血");
                Check.Equal(hurt.Restored, fx.potions[1].restored, "残血吃药回了多少蓝");
                Check.Near(p.hp, fx.potions[1].hp, "残血吃药后的气血");
                Check.Near(p.mp, fx.potions[1].mp, "残血吃药后的灵力");
            });
        }

        static void Regen(GameData data, PlayerFixture fx)
        {
            Check.Group("自然回复", () =>
            {
                Check.True(fx.regen.Length > 0, "样本非空");
                var p = Player.Create(data, "测试", "qingyun");
                p.hp = 100;
                p.mp = 10;

                for (var i = 0; i < fx.regen.Length; i++)
                {
                    var c = fx.regen[i];
                    Player.TickRegen(data, p, c.dt, c.moving, c.inCombat);
                    var tag = "第 " + i + " 帧（dt=" + c.dt + " 移动=" + c.moving + " 战斗=" + c.inCombat + "）";
                    Check.Near(p.idleMs, c.idleMs, tag + " 站桩计时");
                    Check.Near(p.hp, c.hp, tag + " 气血");
                    Check.Near(p.mp, c.mp, tag + " 灵力");
                }
            });
        }

        static void Death(GameData data, PlayerFixture fx)
        {
            Check.Group("死亡与复活", () =>
            {
                Check.True(fx.death.Length >= 3, "样本非空");
                var p = Player.Create(data, "测试", "fenxiang");
                Player.GainExp(data, p, 30000);
                Combat.AddBuff(p.buffs, new Buff { kind = "atkUp", ms = 9000, amount = 0.5 });
                Player.Recompute(data, p);

                Check.Equal(p.exp, fx.death[0].exp, "带增益时的经验");
                Check.Near(p.stats.atk, fx.death[0].atk, "带增益时的攻击");
                Check.Equal(p.buffs.Count, fx.death[0].buffs, "带增益时的 buff 数");

                var lost = Player.Die(data, p);
                Check.Equal(lost, fx.death[1].lost, "死亡掉了多少经验");
                Check.Equal(p.exp, fx.death[1].exp, "死亡后剩余经验");
                // 死亡清 buff 之后必须重算属性，否则增益会跟着一路复活
                Check.Near(p.stats.atk, fx.death[1].atk, "死亡后的攻击（增益必须已经掉了）");
                Check.Equal(p.buffs.Count, fx.death[1].buffs, "死亡后的 buff 数");
                Check.Equal(p.dead, fx.death[1].dead, "死亡标记");
                Check.Equal(p.deaths, fx.death[1].deaths, "死亡次数");

                Player.Revive(data, p);
                Check.Near(p.hp, fx.death[2].hp, "复活后的气血");
                Check.Near(p.mp, fx.death[2].mp, "复活后的灵力");
                Check.Equal(p.dead, fx.death[2].dead, "复活后的死亡标记");
                Check.Near(p.hurtIframe, fx.death[2].hurtIframe, "复活后的无敌时间");
            });
        }

        static void Movement(GameData data, PlayerFixture fx)
        {
            Check.Group("移速与普攻间隔", () =>
            {
                Check.True(fx.moveSpeed.Length >= 3, "样本非空");
                var p = Player.Create(data, "测试", "qingyun");

                Check.Near(Player.MoveSpeed(data, p), fx.moveSpeed[0].speed, "基础移速");
                Check.Near(Player.AttackInterval(data, p), fx.moveSpeed[0].attackMs, "基础普攻间隔");

                Combat.AddBuff(p.buffs, new Buff { kind = "slow", ms = 3000, amount = 0.45 });
                Check.Near(Player.MoveSpeed(data, p), fx.moveSpeed[1].speed, "减速后的移速");
                Check.Near(Player.AttackInterval(data, p), fx.moveSpeed[1].attackMs, "减速后的普攻间隔");

                p.@base.agi += 200;
                Player.Recompute(data, p);
                Check.Near(Player.MoveSpeed(data, p), fx.moveSpeed[2].speed, "身法拉满后的移速");
                // 普攻间隔最多快到 55%，身法再高也不该突破
                Check.Near(Player.AttackInterval(data, p), fx.moveSpeed[2].attackMs, "身法拉满后的普攻间隔");
            });
        }
    }
}
