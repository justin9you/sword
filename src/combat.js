/**
 * 战斗数值：伤害公式、增益减益、持续伤害。
 *
 * 玩家和怪物走同一套公式（只是属性来源不同），这样"我打它 100，它打我 100"
 * 这件事在数值上是自洽的，调平衡时不用两头猜。
 *
 * 伤害 = (攻击 × 技能倍率 − 防御 × 系数) × 等级压制 × 暴击 × 随机浮动
 * 护盾在最后一步吸收，反伤在结算之后回敬。
 */
(function (global) {
  'use strict';

  var ZX = global.ZX;
  var CFG = ZX.CONFIG;
  var U = ZX.U;

  /**
   * 算一次伤害。
   * atkVal   攻击方的 攻击 或 法力
   * defVal   防御方的 防御 或 法防
   * kind     'phys' | 'magic'，只决定用哪个减伤系数
   * power    技能倍率，普攻是 1
   * opts     { critRate, levelGap, ignoreDef }
   */
  function damage(atkVal, defVal, kind, power, opts) {
    opts = opts || {};
    var factor = kind === 'magic' ? CFG.MDEF_FACTOR : CFG.DEF_FACTOR;
    var mitigated = defVal * factor * (1 - (opts.ignoreDef || 0));
    var raw = atkVal * (power || 1) - mitigated;

    // 等级压制：高打低加伤，低打高减伤，上下都钳住，避免越级白给或完全打不动
    var gap = opts.levelGap || 0;
    var gapMul = 1 + U.clamp(gap * CFG.LEVEL_GAP_BONUS, -CFG.LEVEL_GAP_CAP, CFG.LEVEL_GAP_CAP);
    raw *= gapMul;

    var crit = false;
    if (opts.critRate && Math.random() < opts.critRate) {
      crit = true;
      raw *= CFG.CRIT_MUL;
    }

    raw *= 1 + U.rand(-CFG.DAMAGE_JITTER, CFG.DAMAGE_JITTER);
    return { amount: Math.max(CFG.MIN_DAMAGE, Math.round(raw)), crit: crit };
  }

  // ── 增益 / 减益 ─────────────────────────────────────────
  /**
   * 挂一个 buff。同名的直接刷新（取更强的那个），不叠加，
   * 免得连按同一个技能把自己叠成神仙。
   */
  function addBuff(target, buff) {
    if (!target.buffs) target.buffs = [];
    for (var i = 0; i < target.buffs.length; i++) {
      var b = target.buffs[i];
      if (b.kind === buff.kind) {
        b.ms = Math.max(b.ms, buff.ms);
        if (buff.amount != null) b.amount = Math.max(b.amount || 0, buff.amount);
        if (buff.value != null) b.value = Math.max(b.value || 0, buff.value);
        if (buff.dps != null) b.dps = Math.max(b.dps || 0, buff.dps);
        return b;
      }
    }
    target.buffs.push(buff);
    return buff;
  }

  function hasBuff(target, kind) {
    if (!target.buffs) return false;
    for (var i = 0; i < target.buffs.length; i++) {
      if (target.buffs[i].kind === kind) return true;
    }
    return false;
  }

  function getBuff(target, kind) {
    if (!target.buffs) return null;
    for (var i = 0; i < target.buffs.length; i++) {
      if (target.buffs[i].kind === kind) return target.buffs[i];
    }
    return null;
  }

  /** 定身 / 魅惑期间不能行动 */
  function disabled(target) {
    return hasBuff(target, 'stun') || hasBuff(target, 'charm');
  }

  /**
   * 推进所有 buff 的计时，结算持续伤害。
   * onDot(amount) 由调用方决定伤害怎么落到血条上（玩家和怪物扣血方式不同）。
   * 返回这一帧的 DOT 总伤害。
   */
  function tickBuffs(target, dt, onDot) {
    if (!target.buffs || !target.buffs.length) return 0;
    var total = 0;
    var kept = [];
    for (var i = 0; i < target.buffs.length; i++) {
      var b = target.buffs[i];
      b.ms -= dt;

      if ((b.kind === 'burn' || b.kind === 'poison') && b.dps) {
        var d = b.dps * (dt / 1000);
        b.frac = (b.frac || 0) + d;
        // 攒够 1 点才结算，避免每帧飘出 0 伤害
        if (b.frac >= 1) {
          var whole = Math.floor(b.frac);
          b.frac -= whole;
          total += whole;
          if (onDot) onDot(whole, b.kind);
        }
      }

      if (b.ms > 0 && !(b.kind === 'shield' && b.value <= 0)) kept.push(b);
    }
    target.buffs = kept;
    return total;
  }

  /**
   * 护盾吸收。返回真正打在血条上的伤害。
   * 护盾值扣完就自动过期（tickBuffs 里清掉）。
   */
  function absorb(target, amount) {
    var s = getBuff(target, 'shield');
    if (!s || s.value <= 0) return amount;
    var taken = Math.min(s.value, amount);
    s.value -= taken;
    return amount - taken;
  }

  /** 闪避判定 */
  function dodged(dodgeRate) {
    return dodgeRate > 0 && Math.random() < dodgeRate;
  }

  /** 吸血：按打出的伤害回血，返回回了多少 */
  function lifesteal(rate, dealt) {
    if (!rate || rate <= 0) return 0;
    return Math.max(1, Math.round(dealt * rate));
  }

  ZX.Combat = {
    damage: damage,
    addBuff: addBuff,
    hasBuff: hasBuff,
    getBuff: getBuff,
    disabled: disabled,
    tickBuffs: tickBuffs,
    absorb: absorb,
    dodged: dodged,
    lifesteal: lifesteal,
  };
})(window);
