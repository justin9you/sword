/**
 * 对照样本的内容定义。由 tools/gen-fixtures.mjs 调用。
 *
 * 每个 build* 函数拿到一个上下文：
 *   ZX          跑起来的 JS 游戏模块
 *   mulberry32  确定性随机，和 C# 侧 Zhuxian.Core/Rng.cs 是同一个算法
 *   withRandom  在一段代码里接管 Math.random，并记下这段用掉了哪些随机数
 *
 * 挑样本的原则：挑那些「翻错了但看着还挺对」的地方——取整方向、边界条件、
 * 随机数消耗顺序、以及"背包满了会怎样"这类分支。纯直给的公式反而不用堆太多条。
 */

// 战斗数值：随机序列、等级曲线、属性换算、伤害公式、增益、吸血闪避。
// 对应 src/stats.js 和 src/combat.js。

import { cleanBuff } from './snapshots.mjs';
/** 随机序列本身。两边的 mulberry32 对不上的话，后面全白搭，先把这个钉死 */
export function buildRng({ mulberry32 }) {
  const roll = mulberry32(12345);
  const values = [];
  for (let i = 0; i < 64; i++) values.push(roll());
  return { seed: 12345, values: values };
}

export function buildExp({ ZX }) {
  const cases = [];
  for (let lv = 1; lv <= ZX.CONFIG.MAX_LEVEL; lv++) {
    const need = ZX.Stats.expToNext(lv);
    cases.push({ level: lv, need: need === Infinity ? -1 : need });
  }
  return { cases: cases };
}

export function buildDerive({ ZX, mulberry32 }) {
  const roll = mulberry32(777);
  const cases = [];
  for (const sect of ZX.SECTS) {
    for (let i = 0; i < 40; i++) {
      const level = 1 + Math.floor(roll() * ZX.CONFIG.MAX_LEVEL);
      const base = {
        con: Math.floor(roll() * 60),
        spi: Math.floor(roll() * 60),
        agi: Math.floor(roll() * 60),
        wit: Math.floor(roll() * 60),
      };
      cases.push({ sect: sect.key, level: level, base: base, expect: ZX.Stats.derive(level, base, sect) });
    }
  }
  return { cases: cases };
}

export function buildDamage({ ZX, mulberry32, withRandom }) {
  const roll = mulberry32(2024);
  const cases = [];

  for (let i = 0; i < 200; i++) {
    const atk = Math.floor(roll() * 900) + 10;
    const def = Math.floor(roll() * 400);
    const kind = roll() < 0.5 ? 'phys' : 'magic';
    const power = 0.8 + roll() * 3;
    const critRate = i % 4 === 0 ? 0 : roll() * 0.6;
    const levelGap = Math.floor(roll() * 41) - 20;
    const ignoreDef = i % 5 === 0 ? roll() * 0.5 : 0;
    const seed = 9000 + i;

    const { value: out, used } = withRandom(seed, () =>
      ZX.Combat.damage(atk, def, kind, power, {
        critRate: critRate, levelGap: levelGap, ignoreDef: ignoreDef,
      })
    );

    cases.push({
      atk, def, kind, power, critRate, levelGap, ignoreDef,
      seed: seed, randomsUsed: used.length,
      expect: { amount: out.amount, crit: out.crit },
    });
  }
  return { cases: cases };
}

export function buildBuffs({ ZX }) {
  const cases = [];

  {
    const t = { buffs: [] };
    ZX.Combat.addBuff(t, { kind: 'atkUp', ms: 3000, amount: 0.2 });
    ZX.Combat.addBuff(t, { kind: 'atkUp', ms: 1000, amount: 0.35 });
    ZX.Combat.addBuff(t, { kind: 'shield', ms: 5000, value: 120 });
    cases.push({ name: '同名刷新取更强', buffs: t.buffs.map(cleanBuff) });
  }

  {
    const t = { buffs: [{ kind: 'burn', ms: 5000, dps: 6 }] };
    const ticks = [];
    for (let i = 0; i < 20; i++) {
      const r = ZX.Combat.tickBuffs(t, 100, null);
      ticks.push({ dot: r.dot, expired: r.expired });
    }
    cases.push({ name: '灼烧攒够1点才结算', ticks: ticks, buffs: t.buffs.map(cleanBuff) });
  }

  {
    const t = { buffs: [{ kind: 'shield', ms: 9000, value: 100 }] };
    const through = [];
    for (const hit of [30, 40, 50, 20, 10]) through.push(ZX.Combat.absorb(t, hit));
    cases.push({ name: '护盾吸收', through: through, buffs: t.buffs.map(cleanBuff) });
  }

  {
    const t = {
      buffs: [
        { kind: 'atkUp', ms: 200, amount: 0.3 },
        { kind: 'shield', ms: 5000, value: 80 },
      ],
    };
    const r1 = ZX.Combat.tickBuffs(t, 150, null);
    const r2 = ZX.Combat.tickBuffs(t, 150, null);
    cases.push({
      name: '部分过期也要报 expired',
      ticks: [{ dot: r1.dot, expired: r1.expired }, { dot: r2.dot, expired: r2.expired }],
      buffs: t.buffs.map(cleanBuff),
    });
  }

  return { cases: cases };
}

export function buildMisc({ ZX, withRandom }) {
  const lifesteal = [];
  for (const [rate, dealt] of [[0, 100], [0.1, 100], [0.05, 3], [0.5, 77], [0.9, 1]]) {
    lifesteal.push({ rate: rate, dealt: dealt, expect: ZX.Combat.lifesteal(rate, dealt) });
  }

  const dodge = [];
  for (let i = 0; i < 30; i++) {
    const rate = i / 30;
    const seed = 500 + i;
    const { value } = withRandom(seed, () => ZX.Combat.dodged(rate));
    dodge.push({ rate: rate, seed: seed, expect: value });
  }

  return { lifesteal: lifesteal, dodge: dodge };
}
