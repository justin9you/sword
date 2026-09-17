/**
 * 场景运行时：碰撞、刷怪、怪物 AI、掉落物、传送门、NPC。
 *
 * 一个 World 只管一张图。换图就新建一个，旧的直接丢掉——
 * 怪物状态不跨图保留（和大多数 MMO 的分线一个道理），省掉一堆同步问题。
 *
 * 所有坐标都是像素。地图定义里的格子坐标在 create 时就乘好 TILE。
 */
(function (global) {
  'use strict';

  var ZX = global.ZX;
  var CFG = ZX.CONFIG;
  var U = ZX.U;
  var C = ZX.Combat;

  function create(mapKey) {
    var def = ZX.MAPS.byKey(mapKey);
    var T = CFG.TILE;

    var w = {
      def: def,
      key: def.key,
      w: def.w * T,
      h: def.h * T,
      blocks: def.blocks.map(function (b) {
        return { x: b.x * T, y: b.y * T, w: b.w * T, h: b.h * T };
      }),
      portals: (def.portals || []).map(function (p) {
        return { to: p.to, x: p.x * T + T / 2, y: p.y * T + T / 2, r: T * 0.9 };
      }),
      npcs: ZX.NPCS.onMap(def.key).map(function (n) {
        return { def: n, x: n.x * T + T / 2, y: n.y * T + T / 2, r: 20 };
      }),
      monsters: [],
      drops: [],
      bossDead: false,
      bossTimer: 0,
      spawnTimer: 0,
    };

    // 开场就把怪铺满，不让玩家进图先看半分钟空地
    var n = Math.min(def.count, CFG.MAX_ALIVE);
    for (var i = 0; i < n; i++) spawnOne(w);
    if (def.boss) spawnBoss(w);

    return w;
  }

  // ── 碰撞 ────────────────────────────────────────────────
  /** 点是否落在障碍或地图外（r 是实体半径） */
  function blocked(w, x, y, r) {
    if (x - r < 0 || y - r < 0 || x + r > w.w || y + r > w.h) return true;
    for (var i = 0; i < w.blocks.length; i++) {
      var b = w.blocks[i];
      if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
    }
    return false;
  }

  /**
   * 带滑墙的移动：整体走不动就拆成两个轴分别试，
   * 这样贴着墙斜着走不会被卡死。返回新坐标。
   */
  function move(w, x, y, dx, dy, r) {
    if (!blocked(w, x + dx, y + dy, r)) return { x: x + dx, y: y + dy };
    var nx = x;
    var ny = y;
    if (!blocked(w, x + dx, y, r)) nx = x + dx;
    if (!blocked(w, nx, y + dy, r)) ny = y + dy;
    return { x: nx, y: ny };
  }

  /** 在图里找一个不压墙的随机点，尽量离 away 远一些 */
  function findSpot(w, r, awayX, awayY, minDist) {
    for (var i = 0; i < 60; i++) {
      var x = U.rand(r + 8, w.w - r - 8);
      var y = U.rand(r + 8, w.h - r - 8);
      if (blocked(w, x, y, r)) continue;
      if (minDist && awayX != null && U.dist(x, y, awayX, awayY) < minDist) continue;
      return { x: x, y: y };
    }
    return { x: w.w / 2, y: w.h / 2 };
  }

  // ── 刷怪 ────────────────────────────────────────────────
  function makeMonster(def, x, y) {
    return {
      uid: U.uid(),
      def: def,
      x: x, y: y,
      homeX: x, homeY: y,
      hp: def.maxHp,
      maxHp: def.maxHp,
      state: 'idle',
      atkCd: U.rand(0, def.atkMs),
      wanderCd: U.rand(500, 2600),
      vx: 0, vy: 0,
      buffs: [],
      flash: 0,
      dead: false,
      castFx: 0,
    };
  }

  function spawnOne(w) {
    var table = w.def.spawns;
    if (!table || !table.length) return null;
    if (w.monsters.length >= CFG.MAX_ALIVE) return null;
    var pick = U.pickWeighted(table);
    var def = ZX.MONSTERS.byId(pick.id);
    if (!def) return null;
    var spot = findSpot(w, def.radius, w.def.start.x * CFG.TILE, w.def.start.y * CFG.TILE, 260);
    var m = makeMonster(def, spot.x, spot.y);
    w.monsters.push(m);
    return m;
  }

  function spawnBoss(w) {
    var b = w.def.boss;
    if (!b) return null;
    var def = ZX.MONSTERS.byId(b.id);
    if (!def) return null;
    var m = makeMonster(def, b.x * CFG.TILE + CFG.TILE / 2, b.y * CFG.TILE + CFG.TILE / 2);
    m.isBoss = true;
    w.monsters.push(m);
    w.bossDead = false;
    return m;
  }

  // ── 查询 ────────────────────────────────────────────────
  /** 离 (x,y) 最近的活怪，超过 maxDist 就返回 null */
  function nearest(w, x, y, maxDist) {
    var best = null;
    var bestD = maxDist * maxDist;
    for (var i = 0; i < w.monsters.length; i++) {
      var m = w.monsters[i];
      if (m.dead) continue;
      var d = U.dist2(x, y, m.x, m.y);
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    return best;
  }

  /**
   * 圆形范围内的所有活怪。所有 AOE、弹道、扇形的命中判定都从这里出去。
   *
   * 判据是圆与圆相交：两心距 ≤ 半径之和，平方形式是 (r + mr)²。
   * 写成 r² + mr² 是错的——少了 2·r·mr 这一项，体型越大的怪缩水越多，
   * 表现就是"贴着 Boss 放大招却打空"。
   */
  function inRadius(w, x, y, r) {
    var out = [];
    for (var i = 0; i < w.monsters.length; i++) {
      var m = w.monsters[i];
      if (m.dead) continue;
      var reach = r + m.def.radius;
      if (U.dist2(x, y, m.x, m.y) <= reach * reach) out.push(m);
    }
    return out;
  }

  /** 离玩家最近的可交互对象（NPC / 传送门），用于"按 E 交互" */
  function interactable(w, x, y) {
    var best = null;
    var bestD = 70 * 70;
    var i;
    for (i = 0; i < w.npcs.length; i++) {
      var n = w.npcs[i];
      var d = U.dist2(x, y, n.x, n.y);
      if (d < bestD) {
        bestD = d;
        best = { kind: 'npc', npc: n };
      }
    }
    for (i = 0; i < w.portals.length; i++) {
      var p = w.portals[i];
      var pd = U.dist2(x, y, p.x, p.y);
      if (pd < bestD) {
        bestD = pd;
        best = { kind: 'portal', portal: p };
      }
    }
    return best;
  }

  // ── 掉落 ────────────────────────────────────────────────
  function dropAt(w, x, y, itemId, n) {
    w.drops.push({
      uid: U.uid(),
      id: itemId,
      n: n || 1,
      x: x + U.rand(-16, 16),
      y: y + U.rand(-16, 16),
      life: CFG.DROP_LIFE_MS,
      born: 0,
    });
  }

  /**
   * 怪物死亡的掉落结算。返回给日志用的战利品列表。
   * 金钱不落地，直接进兜（MMO 里也没人捡铜板）。
   */
  function rollLoot(w, m, player) {
    var out = [];
    var def = m.def;
    // luck 进 rollGear 决定品质曲线，不只是"多掉几件"。
    // Boss 给到 7，好东西的权重才真正压得过凡品（见 items.js 的 LUCK_POW）
    var luck = def.isBoss ? 7 : def.isElite ? 2.4 : 1;

    // 装备
    var tries = def.isBoss ? CFG.BOSS_DROPS : 1;
    var rate = CFG.DROP_GEAR * (def.isElite ? CFG.ELITE_DROP_MUL : 1);
    for (var i = 0; i < tries; i++) {
      if (def.isBoss || U.chance(rate)) {
        var gear = ZX.ITEMS.rollGear(def.lv, player.sect, luck);
        if (gear) {
          dropAt(w, m.x, m.y, gear.id, 1);
          out.push(gear);
        }
      }
    }

    // 丹药
    if (U.chance(def.isElite ? 0.8 : 0.22)) {
      var potion = def.lv >= 20 ? (U.chance(0.5) ? 'c_dahuan' : 'c_dajuling')
        : (U.chance(0.5) ? 'c_xiaohuan' : 'c_juling');
      var cnt = def.isBoss ? 3 : 1;
      dropAt(w, m.x, m.y, potion, cnt);
      out.push(ZX.ITEMS.byId(potion));
    }

    // 材料
    if (U.chance(def.isElite ? 0.9 : 0.3)) {
      var mats = ['m_neidan', 'm_xuanyu', 'm_xueyu', 'm_huwei', 'm_mojing'];
      var pickMat = null;
      for (var j = mats.length - 1; j >= 0; j--) {
        var mi = ZX.ITEMS.byId(mats[j]);
        if (mi.lv <= def.lv) {
          pickMat = mi;
          break;
        }
      }
      if (pickMat) {
        dropAt(w, m.x, m.y, pickMat.id, 1);
        out.push(pickMat);
      }
    }

    return out;
  }

  // ── 每帧推进 ────────────────────────────────────────────
  /**
   * hooks: {
   *   onHitPlayer(monster, kind, power)  怪物打到玩家
   *   onDot(monster, amount)             怪物身上的持续伤害跳字
   *   onDeath(monster)                   怪物死了（经验/任务/掉落由 main 决定）
   * }
   */
  function update(w, dt, player, hooks) {
    var i;

    // 怪物
    for (i = w.monsters.length - 1; i >= 0; i--) {
      var m = w.monsters[i];
      if (m.dead) {
        w.monsters.splice(i, 1);
        continue;
      }
      updateMonster(w, m, dt, player, hooks);
    }

    // 补刷：死一只，过一会儿补一只
    if (w.def.spawns && w.def.spawns.length) {
      w.spawnTimer -= dt;
      if (w.spawnTimer <= 0) {
        w.spawnTimer = CFG.RESPAWN_MS / 3;
        var target = Math.min(w.def.count, CFG.MAX_ALIVE);
        var alive = 0;
        for (i = 0; i < w.monsters.length; i++) {
          if (!w.monsters[i].isBoss) alive++;
        }
        if (alive < target) spawnOne(w);
      }
    }

    // Boss 重生
    if (w.bossDead && w.def.boss) {
      w.bossTimer -= dt;
      if (w.bossTimer <= 0) spawnBoss(w);
    }

    // 掉落物寿命
    for (i = w.drops.length - 1; i >= 0; i--) {
      var d = w.drops[i];
      d.born += dt;
      d.life -= dt;
      if (d.life <= 0) w.drops.splice(i, 1);
    }
  }

  function updateMonster(w, m, dt, player, hooks) {
    var def = m.def;

    // 持续伤害
    C.tickBuffs(m, dt, function (amount) {
      m.hp -= amount;
      m.flash = 120;
      if (hooks && hooks.onDot) hooks.onDot(m, amount);
    });
    // 被灼烧/中毒打死也要走同一个死亡入口，否则首领的重生记账会被跳过
    if (m.hp <= 0) {
      kill(w, m, hooks);
      return;
    }

    if (m.flash > 0) m.flash -= dt;
    if (m.castFx > 0) m.castFx -= dt;
    if (m.atkCd > 0) m.atkCd -= dt;

    // 被定住 / 被魅惑就啥也干不了
    if (C.disabled(m)) return;

    var speed = def.speed;
    var slow = C.getBuff(m, 'slow');
    if (slow) speed *= 1 - slow.amount;

    var distToPlayer = player.dead ? Infinity : U.dist(m.x, m.y, player.x, player.y);
    var distHome = U.dist(m.x, m.y, m.homeX, m.homeY);

    // 状态机：太远就回家，回家路上不理人；Boss 不脱战
    if (!m.isBoss && distHome > CFG.LEASH_RANGE) m.state = 'return';

    if (m.state === 'return') {
      if (distHome < 24) {
        m.state = 'idle';
        m.hp = m.maxHp;
      } else {
        var back = U.dirTo(m.x, m.y, m.homeX, m.homeY);
        var rp = move(w, m.x, m.y, back.x * speed * 1.5 * (dt / 1000), back.y * speed * 1.5 * (dt / 1000), def.radius);
        m.x = rp.x;
        m.y = rp.y;
      }
      return;
    }

    // 和平地图：野怪不会因为你走近就扑上来。
    // 注意只关掉"因距离进入 chase"这一条——被打之后 hurtMonster 照样把它拨到 chase，
    // 所以它不是木头人，只是不主动惹事。首领在哪张图都照常扑。
    var peaceful = w.def.passive && !def.isBoss;
    var aggro = def.isBoss ? CFG.AGGRO_RANGE * 1.6 : CFG.AGGRO_RANGE;
    if (!peaceful && distToPlayer < aggro) m.state = 'chase';
    else if (m.state === 'chase' && distToPlayer > aggro * 1.6) m.state = 'idle';

    if (m.state === 'idle') {
      // 闲逛：隔一阵换个方向溜达两步
      m.wanderCd -= dt;
      if (m.wanderCd <= 0) {
        m.wanderCd = U.rand(1400, 3800);
        var a = U.rand(0, Math.PI * 2);
        m.vx = Math.cos(a);
        m.vy = Math.sin(a);
        if (U.chance(0.4)) {
          m.vx = 0;
          m.vy = 0;
        }
      }
      var wp = move(w, m.x, m.y, m.vx * speed * 0.35 * (dt / 1000), m.vy * speed * 0.35 * (dt / 1000), def.radius);
      m.x = wp.x;
      m.y = wp.y;
      return;
    }

    // 追击 + 攻击
    var reach = def.attackRange + 8;
    if (distToPlayer > reach) {
      var dir = U.dirTo(m.x, m.y, player.x, player.y);
      var np = move(w, m.x, m.y, dir.x * speed * (dt / 1000), dir.y * speed * (dt / 1000), def.radius);
      m.x = np.x;
      m.y = np.y;
      m.vx = dir.x;
      m.vy = dir.y;
    } else if (m.atkCd <= 0) {
      m.atkCd = def.atkMs;
      m.castFx = 220;
      if (hooks && hooks.onHitPlayer) hooks.onHitPlayer(m);
    }
  }

  /**
   * 怪物死亡的唯一入口。
   * 不管是被打死还是被灼烧/中毒烧死，都必须从这里走——
   * 首领的重生计时就挂在这儿，绕过去的话烧死的 Boss 再也不会刷。
   */
  function kill(w, m, hooks) {
    if (m.dead) return;
    m.dead = true;
    if (m.isBoss) {
      w.bossDead = true;
      w.bossTimer = w.def.bossRespawnMs;
    }
    if (hooks && hooks.onDeath) hooks.onDeath(m);
  }

  /** 怪物受到伤害的统一入口，处理护盾和死亡 */
  function hurtMonster(w, m, amount, hooks) {
    var real = C.absorb(m, amount);
    m.hp -= real;
    m.flash = 140;
    if (m.state === 'idle') m.state = 'chase';
    if (m.hp <= 0) kill(w, m, hooks);
    return real;
  }

  ZX.World = {
    create: create,
    blocked: blocked,
    move: move,
    findSpot: findSpot,
    nearest: nearest,
    inRadius: inRadius,
    interactable: interactable,
    dropAt: dropAt,
    rollLoot: rollLoot,
    update: update,
    hurtMonster: hurtMonster,
    kill: kill,
    spawnOne: spawnOne,
  };
})(window);
