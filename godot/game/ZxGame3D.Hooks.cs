// ZxGame3D 的第三块：逻辑层往外抛的事件。
//
// Zhuxian.Core 不认识 Godot，也不知道「打中了」该怎么表现——它只在事件发生时
// 回调 IGameHooks。伤害结算、掉落、任务推进这些「游戏规则」就落在这里，
// 和网页版 src/main.js 里那几个同名函数是一一对应的。

using Godot;
using Zhuxian.Core;
using Zhuxian.Data;

namespace Zhuxian.Godot
{
    public partial class ZxGame3D
    {
        /// <summary>怪打到玩家。伤害在这儿结算——和网页版 monsterAttack 同一套</summary>
        public void OnHitPlayer(MonsterInstance m)
        {
            var p = player;
            if (p.dead) return;
            inCombat = 5000;
            if (p.hurtIframe > 0) return;

            if (Combat.Dodged(p.stats.dodge, rng))
            {
                fx.Float(p.x, p.y, "闪避", new Color(0.8f, 0.85f, 0.9f));
                return;
            }

            var magic = m.def.ranged;
            var res = Combat.Damage(
                m.def.atk,
                magic ? p.stats.mdef : p.stats.def,
                magic ? "magic" : "phys",
                1,
                new Combat.DamageOptions { LevelGap = m.def.lv - p.level },
                data.Config, rng);

            var real = Combat.Absorb(p.buffs, res.Amount);
            p.hp -= real;
            p.hurtIframe = data.Config.HURT_IFRAME_MS;
            Floater(p.x, p.y, real, "hurt");

            // 六合镜：反伤
            var reflect = Combat.GetBuff(p.buffs, "reflect");
            if (reflect != null && real > 0)
            {
                var back = Mathf.Round(real * (reflect.amount ?? 0));
                world.HurtMonster(m, back, this);
                Floater(m.x, m.y, back, "hit");
            }

            if (p.hp <= 0) Died();
        }

        public void OnDot(MonsterInstance m, int amount)
        {
            Floater(m.x, m.y, amount, "hit");
        }

        /// <summary>怪死了：经验、灵石、掉落、任务</summary>
        public void OnDeath(MonsterInstance m)
        {
            var def = m.def;
            player.kills += 1;
            var before = player.level;
            var levels = Player.GainExp(data, player, def.exp);
            player.gold += (int)Mathf.Round((float)(def.gold * rng.Range(0.8, 1.25)));

            Floater(m.x, m.y, def.exp, "exp");

            var loot = world.RollLoot(m, player);
            for (var i = 0; i < loot.Count; i++)
            {
                if (loot[i].q == "epic" || loot[i].q == "legend")
                {
                    hud.Log("※ " + def.name + " 掉落了【" + loot[i].name + "】！");
                }
            }
            if (def.isBoss) hud.Log("【" + def.name + "】伏诛。");

            if (Quest.OnKill(data, player, def))
            {
                var q = Quest.Current(data, player);
                fx.Float(m.x, m.y, "任务 +1", new Color(1f, 0.85f, 0.45f));
                if (q != null) hud.Log("任务进度：" + player.quest.progress + "/" + q.goal.count);
                if (Quest.Complete(data, player)) hud.Log("目标达成，回去复命。");
            }

            if (levels > 0) hud.Log("修为精进，升到 " + player.level + " 级（+" + (player.level - before) + "）。");
        }

        public void Floater(double x, double y, double amount, string kind)
        {
            hits++;
            fx.Float(x, y, ((int)amount).ToString(), FloatColor(kind));
        }

        static Color FloatColor(string kind)
        {
            switch (kind)
            {
                case "hurt": return new Color(0.72f, 0.18f, 0.14f);
                case "heal": return new Color(0.24f, 0.46f, 0.30f);
                case "exp": return new Color(0.52f, 0.42f, 0.20f);
                case "crit": return new Color(0.78f, 0.34f, 0.10f);
                case "miss": return new Color(0.42f, 0.44f, 0.48f);
                default: return new Color(0.16f, 0.17f, 0.20f);
            }
        }

        /// <summary>音效还没搬过来（网页版是 WebAudio 现合成的），先空着</summary>
        public void Sfx(string name)
        {
        }

        public void Log(string message, string kind)
        {
            hud.Log(message);
        }

        public void OnCast(ZxSectSkill skill)
        {
        }
    }
}
