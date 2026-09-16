/**
 * 存档校验的对照样本。对应 src/save.js 里与存储无关的那一半。
 *
 * 只测 serialize / deserialize，不测 localStorage——那部分是宿主的事，
 * C# 那边走 ISaveStorage 接口，网页版走 localStorage，没有可比性。
 *
 * 挑的全是「坏存档」：旧版本存的、字段被手改过的、指向已经删掉的物品的。
 * 这些路径平时跑不到，一旦跑到就是读档白屏或者一滴血出门，
 * 而且没有任何测试覆盖的话，谁也不会注意到自己改坏了它。
 */

import { snapshotBag, snapshotEquip, snapshotStats } from './snapshots.mjs';

export function buildSave({ ZX, saveStore }) {
  const CFG = ZX.CONFIG;

  /** 造一个练了一会儿的角色，用来测往返 */
  function veteran() {
    const p = ZX.Player.create('张小凡', 'qingyun');
    ZX.Player.gainExp(p, 120000);
    p.gold = 8888;
    p.kills = 314;
    p.deaths = 2;
    p.playMs = 1234567.89;
    p.map = 'dazhu';
    p.visited = { caomiao: true, longshou: true, dazhu: true };
    p.quest = { current: 'q5', progress: 3, done: { q1: true, q2: true } };
    p.bag = ZX.Inventory.add(p.bag, 'c_dahuan', 120).bag;
    p.hp = p.stats.hp * 0.6;
    p.mp = p.stats.mp * 0.3;
    ZX.Player.recompute(p);
    return p;
  }

  /**
   * 落盘形态。JS 里 visited 和 quest.done 是拿对象当集合用（{key: true}），
   * C# 那边是数组——信息一样，形状不同。转换放在这里做，
   * 喂给 save.js 的仍旧是它认得的原始对象。
   */
  const wire = (r) => {
    const out = Object.assign({}, r);
    if (r.visited) out.visited = Object.keys(r.visited).sort();
    if (r.quest) {
      out.quest = Object.assign({}, r.quest);
      if (r.quest.done) out.quest.done = Object.keys(r.quest.done).sort();
    }
    return out;
  };

  const snapPlayer = (p) => ({
    name: p.name, sect: p.sect, level: p.level, exp: p.exp, gold: p.gold, points: p.points,
    base: { con: p.base.con, spi: p.base.spi, agi: p.base.agi, wit: p.base.wit },
    hp: p.hp, mp: p.mp,
    map: p.map,
    visited: Object.keys(p.visited).sort(),
    questCurrent: p.quest.current,
    questProgress: p.quest.progress,
    questDone: Object.keys(p.quest.done).sort(),
    kills: p.kills, deaths: p.deaths, playMs: p.playMs,
    bag: snapshotBag(p.bag),
    equip: snapshotEquip(p.equip),
    stats: snapshotStats(p.stats),
  });

  // ── 1. 正常往返：存下来再读回去，该一样的都要一样 ──
  const roundTrip = [];
  {
    const p = veteran();
    const raw = serializeLike(p);
    const back = deserializeVia(ZX, raw, saveStore);
    roundTrip.push({ step: '正常往返', saved: wire(raw), before: snapPlayer(p), after: snapPlayer(back) });
  }

  // ── 2. 各种坏存档 ──
  const hostile = [];
  const base = () => serializeLike(veteran());

  const bad = (step, patch) => {
    const raw = base();
    patch(raw);
    const p = deserializeVia(ZX, raw, saveStore);
    hostile.push({ step: step, saved: wire(raw), after: p ? snapPlayer(p) : null });
  };

  // 缺血量字段（旧版本存档）→ 必须当满血，不能被钳成 1
  bad('缺 hp/mp 字段', (r) => {
    delete r.hp;
    delete r.mp;
  });

  bad('hp 超过上限', (r) => { r.hp = 999999; });
  bad('hp 是 0', (r) => { r.hp = 0; });
  bad('等级超出范围', (r) => { r.level = 9999; });
  bad('等级是 0', (r) => { r.level = 0; });
  bad('经验/金钱是负数', (r) => { r.exp = -500; r.gold = -100; });
  bad('加点超范围', (r) => { r.base = { con: 99999, spi: -3, agi: 10, wit: 10 }; });

  // 背包里躺着一个已经被删掉的物品 id → 丢掉那一格，别的不受影响
  bad('背包有不存在的物品', (r) => {
    r.bag = r.bag.slice();
    r.bag[0] = { id: 'w_bu_cun_zai', n: 3 };
  });
  bad('背包数量超堆叠上限', (r) => {
    r.bag = r.bag.slice();
    r.bag[1] = { id: 'c_xiaohuan', n: 99999 };
  });

  // 装备槽位对不上（把兵器塞进靴子槽）→ 不穿
  bad('装备槽位对不上', (r) => { r.equip = Object.assign({}, r.equip, { boots: 'w_qingyunjian' }); });
  bad('装备等级不够', (r) => { r.equip = Object.assign({}, r.equip, { weapon: 'w_zhuxian' }); });
  bad('装备是不存在的 id', (r) => { r.equip = Object.assign({}, r.equip, { weapon: 'w_bu_cun_zai' }); });

  // 任务：指向不存在的任务要退回开头；明确为 null 表示全做完了，要保住
  bad('任务指向不存在的 key', (r) => { r.quest = Object.assign({}, r.quest, { current: 'q999' }); });
  bad('任务全做完了(current=null)', (r) => { r.quest = Object.assign({}, r.quest, { current: null }); });
  bad('任务进度是负数', (r) => { r.quest = Object.assign({}, r.quest, { progress: -5 }); });

  bad('地图不存在', (r) => { r.map = 'bu_cun_zai'; });
  bad('名字超长', (r) => { r.name = '一二三四五六七八九十甲乙丙丁'; });

  // 缺门派 / 缺名字 → 整份存档作废，当没有存档
  bad('缺门派', (r) => { delete r.sect; });
  bad('缺名字', (r) => { delete r.name; });

  // ── 3. 摘要 ──
  const summaries = [];
  {
    const raw = base();
    summaries.push({ step: '正常摘要', name: raw.name, sect: ZX.sect(raw.sect).name, level: raw.level, map: ZX.MAPS.byKey(raw.map).name });
    const broken = base();
    broken.map = 'bu_cun_zai';
    summaries.push({ step: '地图不存在时回落', name: broken.name, sect: ZX.sect(broken.sect).name, level: broken.level, map: ZX.MAPS.byKey(broken.map).name });
  }

  return { roundTrip: roundTrip, hostile: hostile, summaries: summaries };
}

/**
 * 和 save.js 的 serialize 一样的形状。
 *
 * 不直接调 ZX.Save.save()：那个会往 localStorage 写，而这里只要那份数据。
 * 字段有出入的话对照测试立刻会红，所以不怕两边跑偏。
 */
function serializeLike(p) {
  return {
    v: 1,
    name: p.name, sect: p.sect, level: p.level, exp: p.exp, gold: p.gold, points: p.points,
    base: { con: p.base.con, spi: p.base.spi, agi: p.base.agi, wit: p.base.wit },
    bag: p.bag.map((s) => (s ? { id: s.id, n: s.n } : null)),
    equip: Object.assign({}, p.equip),
    map: p.map,
    hp: Math.round(p.hp),
    mp: Math.round(p.mp),
    quest: { current: p.quest.current, progress: p.quest.progress, done: Object.assign({}, p.quest.done) },
    visited: Object.assign({}, p.visited),
    kills: p.kills, deaths: p.deaths, playMs: Math.round(p.playMs),
    at: 0,
  };
}

/**
 * 走一遍 save.js 的读档路径。
 *
 * save.js 没有把 deserialize 单独导出来，只能借 load() 走一圈。
 * 沙箱里的 localStorage 是内存版的（见 gen-fixtures.mjs），
 * 把原始存档塞进去再 load，整条读档链路含所有校验都会被真实跑到。
 */
function deserializeVia(ZX, raw, saveStore) {
  saveStore.set('zx.save.v1', JSON.stringify(raw));
  return ZX.Save.load();
}
