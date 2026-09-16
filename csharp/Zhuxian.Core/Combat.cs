using System;
using System.Collections.Generic;
using Zhuxian.Data;

namespace Zhuxian.Core
{
    /// <summary>限时增益 / 减益。对应 combat.js 里往 target.buffs 里塞的那个对象。</summary>
    [Serializable]
    public class Buff
    {
        /// <summary>stun / charm / shield / burn / poison / atkUp / defUp / lifesteal / slow</summary>
        public string kind;
        /// <summary>剩余毫秒</summary>
        public double ms;
        /// <summary>百分比类的量（atkUp / defUp / lifesteal / slow）</summary>
        public double? amount;
        /// <summary>护盾剩余可吸收量</summary>
        public double? value;
        /// <summary>每秒持续伤害（burn / poison）</summary>
        public double? dps;
        /// <summary>攒不满 1 点的持续伤害余数</summary>
        public double frac;

        public Buff Clone()
        {
            return (Buff)MemberwiseClone();
        }
    }

    /// <summary>一次伤害结算的结果</summary>
    public readonly struct DamageResult
    {
        public readonly int Amount;
        public readonly bool Crit;

        public DamageResult(int amount, bool crit)
        {
            Amount = amount;
            Crit = crit;
        }
    }

    /// <summary>tickBuffs 的结果</summary>
    public readonly struct BuffTickResult
    {
        /// <summary>这一帧结算掉的持续伤害总量</summary>
        public readonly int Dot;

        /// <summary>
        /// 这一帧过期掉的 buff 个数。调用方要据此重算属性——
        /// 不能只看列表空没空：同时挂着护盾和攻击加成时，攻击加成先到期，
        /// 列表还不空，属性就会一直停在虚高的数上。
        /// </summary>
        public readonly int Expired;

        public BuffTickResult(int dot, int expired)
        {
            Dot = dot;
            Expired = expired;
        }
    }

    /// <summary>
    /// 战斗数值：伤害公式、增益减益、持续伤害。移植自 src/combat.js。
    ///
    /// 玩家和怪物走同一套公式，只是属性来源不同——"我打它 100，它打我 100"
    /// 在数值上才是自洽的。
    ///
    /// 伤害 = (攻击 × 技能倍率 − 防御 × 系数) × 等级压制 × 暴击 × 随机浮动
    /// </summary>
    public static class Combat
    {
        /// <summary>damage() 的可选参数，对应 JS 那个 opts 对象</summary>
        public struct DamageOptions
        {
            public double CritRate;
            /// <summary>攻击方等级 − 防御方等级</summary>
            public int LevelGap;
            /// <summary>无视防御的比例，0~1</summary>
            public double IgnoreDef;
        }

        /// <summary>
        /// 算一次伤害。
        /// </summary>
        /// <param name="atkVal">攻击方的 攻击 或 法力</param>
        /// <param name="defVal">防御方的 防御 或 法防</param>
        /// <param name="kind">phys / magic，只决定用哪个减伤系数</param>
        /// <param name="power">技能倍率，普攻传 1</param>
        public static DamageResult Damage(
            double atkVal, double defVal, string kind, double power,
            DamageOptions opts, ZxConfig config, IRng rng)
        {
            var factor = kind == "magic" ? config.MDEF_FACTOR : config.DEF_FACTOR;
            var mitigated = defVal * factor * (1 - opts.IgnoreDef);
            var raw = atkVal * (power == 0 ? 1 : power) - mitigated;

            // 等级压制：高打低加伤，低打高减伤，上下都钳住，
            // 免得越级白给，也免得完全打不动
            var gapMul = 1 + JsMath.Clamp(
                opts.LevelGap * config.LEVEL_GAP_BONUS,
                -config.LEVEL_GAP_CAP,
                config.LEVEL_GAP_CAP);
            raw *= gapMul;

            var crit = false;
            if (opts.CritRate > 0 && rng.Next() < opts.CritRate)
            {
                crit = true;
                raw *= config.CRIT_MUL;
            }

            raw *= 1 + rng.Range(-config.DAMAGE_JITTER, config.DAMAGE_JITTER);
            return new DamageResult(
                (int)Math.Max(config.MIN_DAMAGE, JsMath.Round(raw)),
                crit);
        }

        /// <summary>
        /// 挂一个 buff。同名的直接刷新（取更强的那个），不叠加——
        /// 否则连按同一个技能能把自己叠成神仙。
        /// </summary>
        public static Buff AddBuff(List<Buff> buffs, Buff buff)
        {
            for (var i = 0; i < buffs.Count; i++)
            {
                var b = buffs[i];
                if (b.kind != buff.kind) continue;

                b.ms = Math.Max(b.ms, buff.ms);
                if (buff.amount.HasValue) b.amount = Math.Max(b.amount ?? 0, buff.amount.Value);
                if (buff.value.HasValue) b.value = Math.Max(b.value ?? 0, buff.value.Value);
                if (buff.dps.HasValue) b.dps = Math.Max(b.dps ?? 0, buff.dps.Value);
                return b;
            }
            buffs.Add(buff);
            return buff;
        }

        public static bool HasBuff(List<Buff> buffs, string kind)
        {
            return GetBuff(buffs, kind) != null;
        }

        public static Buff GetBuff(List<Buff> buffs, string kind)
        {
            if (buffs == null) return null;
            for (var i = 0; i < buffs.Count; i++)
            {
                if (buffs[i].kind == kind) return buffs[i];
            }
            return null;
        }

        /// <summary>定身 / 魅惑期间不能行动</summary>
        public static bool Disabled(List<Buff> buffs)
        {
            return HasBuff(buffs, "stun") || HasBuff(buffs, "charm");
        }

        /// <summary>
        /// 推进所有 buff 的计时，结算持续伤害。过期的从列表里就地移除。
        /// onDot(伤害, 类型) 由调用方决定伤害怎么落到血条上——玩家和怪物扣血方式不同。
        /// </summary>
        public static BuffTickResult TickBuffs(List<Buff> buffs, double dt, Action<int, string> onDot)
        {
            if (buffs == null || buffs.Count == 0) return new BuffTickResult(0, 0);

            var total = 0;
            var kept = new List<Buff>(buffs.Count);

            for (var i = 0; i < buffs.Count; i++)
            {
                var b = buffs[i];
                b.ms -= dt;

                if ((b.kind == "burn" || b.kind == "poison") && b.dps.HasValue && b.dps.Value != 0)
                {
                    b.frac += b.dps.Value * (dt / 1000.0);
                    // 攒够 1 点才结算，免得每帧飘出个 0 伤害
                    if (b.frac >= 1)
                    {
                        var whole = JsMath.FloorToInt(b.frac);
                        b.frac -= whole;
                        total += whole;
                        onDot?.Invoke(whole, b.kind);
                    }
                }

                // 注意 JS 那边是 b.value <= 0：value 没设过时是 undefined，比较结果为 false，
                // 护盾会被留下。这里用 HasValue 保持同样的行为，别用 (value ?? 0)——
                // 那会把「没写 value 的护盾」当成已经耗尽，行为就对不上了。
                if (b.ms > 0 && !(b.kind == "shield" && b.value.HasValue && b.value.Value <= 0)) kept.Add(b);
            }

            var expired = buffs.Count - kept.Count;
            buffs.Clear();
            buffs.AddRange(kept);
            return new BuffTickResult(total, expired);
        }

        /// <summary>
        /// 护盾吸收，返回真正打在血条上的伤害。
        /// 护盾扣完就自动过期（在 TickBuffs 里清掉）。
        ///
        /// 收发都用 double：护盾值可能是算出来的小数（技能按比例给盾），
        /// 这里提前取整的话，剩下的伤害会跟网页版差零点几，一路积到血条上。
        /// </summary>
        public static double Absorb(List<Buff> buffs, double amount)
        {
            var s = GetBuff(buffs, "shield");
            if (s == null || !s.value.HasValue || s.value.Value <= 0) return amount;

            var taken = Math.Min(s.value.Value, amount);
            s.value -= taken;
            return amount - taken;
        }

        /// <summary>闪避判定</summary>
        public static bool Dodged(double dodgeRate, IRng rng)
        {
            return dodgeRate > 0 && rng.Next() < dodgeRate;
        }

        /// <summary>吸血：按打出的伤害回血，返回回了多少</summary>
        public static int Lifesteal(double rate, double dealt)
        {
            if (rate <= 0) return 0;
            return (int)Math.Max(1, JsMath.Round(dealt * rate));
        }
    }
}
