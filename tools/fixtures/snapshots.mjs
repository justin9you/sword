/**
 * 各组样本共用的快照工具：把运行时对象拍成能写进 JSON 的形状。
 * 字段的取舍要和 C# 侧 FixtureModels*.cs 对齐。
 */

export function cleanBuff(b) {
  return {
    kind: b.kind,
    ms: b.ms,
    frac: b.frac || 0,
    amount: b.amount == null ? null : b.amount,
    value: b.value == null ? null : b.value,
    dps: b.dps == null ? null : b.dps,
  };
}

export function snapshotBag(bag) {
  return bag.map((s) => (s ? { id: s.id, n: s.n } : null));
}

export function snapshotEquip(e) {
  return {
    weapon: e.weapon || null,
    talisman: e.talisman || null,
    robe: e.robe || null,
    bracer: e.bracer || null,
    boots: e.boots || null,
    pendant: e.pendant || null,
  };
}

export function snapshotStats(s) {
  return {
    hp: s.hp, mp: s.mp, atk: s.atk, mag: s.mag, def: s.def, mdef: s.mdef,
    crit: s.crit, dodge: s.dodge, speed: s.speed, lifesteal: s.lifesteal, expBonus: s.expBonus,
  };
}

export function snapshotPlayer(p) {
  return {
    name: p.name,
    sect: p.sect,
    level: p.level,
    exp: p.exp,
    gold: p.gold,
    points: p.points,
    base: { con: p.base.con, spi: p.base.spi, agi: p.base.agi, wit: p.base.wit },
    hp: p.hp,
    mp: p.mp,
    stats: snapshotStats(p.stats),
    bag: snapshotBag(p.bag),
    equip: snapshotEquip(p.equip),
  };
}
