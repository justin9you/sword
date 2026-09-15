/**
 * 总控：开局流程、游戏循环、换图、战斗结算、自动存档。
 *
 * 一帧的顺序（顺序本身就是规则，别随便调）：
 *   收输入 → 处理动作 → 玩家移动 → 自动普攻 → 技能推进
 *   → 世界推进（怪物 AI 会在这里反打玩家）→ 拾取 → 传送判定 → 界面刷新 → 绘制
 *
 * 面板打开时游戏不暂停（MMO 的习惯），但输入队列里的移动会被吃掉，
 * 免得一边翻背包一边梦游。
 */
(function (global) {
  'use strict';

  var ZX = global.ZX;
  var CFG = ZX.CONFIG;
  var U = ZX.U;
  var C = ZX.Combat;
  var W = ZX.World;

  var canvas = document.getElementById('game');
  var game = {
    player: null,
    world: null,
    renderer: new ZX.Renderer(canvas),
    input: new ZX.Input(canvas),
    audio: new ZX.Audio(),
    ui: null,
    panels: null,
    fx: ZX.Skills.newFx(),
    moving: false,
    inCombat: 0,      // >0 表示还在战斗中（脱战计时）
    running: false,
    saveTimer: 0,
    t: 0,
  };

  var settings = ZX.Save.loadSettings();
  game.audio.enabled = settings.sound;

  // ── 对外的回调，供各模块回头说话 ────────────────────────
  game.hooks = {
    log: function (text, kind) {
      if (game.ui) game.ui.log(text, kind);
    },
    floater: function (x, y, text, kind) {
      game.renderer.floater(x, y, text, kind);
    },
    sfx: function (name) {
      game.audio.play(name);
    },
    onCast: function () {
      game.inCombat = 5000;
    },
    onHitPlayer: function (m) {
      monsterAttack(m);
    },
    onDot: function (m, amount) {
      // 灼烧/中毒是"放完技能就不用管"的伤害，不跳字的话玩家根本看不出它生没生效
      game.renderer.floater(m.x, m.y - m.def.radius - 8, amount, 'hit');
      game.inCombat = 5000;
    },
    onDeath: function (m) {
      monsterDied(m);
    },
  };

  game.onLevelUp = function (levels) {
    var p = game.player;
    game.audio.play('levelup');
    game.ui.toast('修为精进　Lv.' + p.level, 'level');
    game.hooks.log('境界提升至 ' + p.level + ' 级，可分配根骨 ' + p.points + ' 点。', 'quest');
    game.renderer.floater(p.x, p.y - 50, '升级！', 'crit');

    // 刚解锁的新技能要说一声，不然玩家不知道多了个键
    var all = ZX.sect(p.sect).skills;
    for (var i = 0; i < all.length; i++) {
      if (all[i].lv > p.level - levels && all[i].lv <= p.level) {
        game.hooks.log('参悟【' + all[i].name + '】，快捷键 ' + (i + 1) + '。', 'skill');
      }
    }
  };

  game.changeMap = function (key, silent) {
    var p = game.player;
    var def = ZX.MAPS.byKey(key);
    game.world = W.create(key);
    p.map = key;
    p.visited[key] = true;

    var spot = def.start;
    p.x = spot.x * CFG.TILE + CFG.TILE / 2;
    p.y = spot.y * CFG.TILE + CFG.TILE / 2;
    // 出生点被障碍压住时挪到最近的空地
    if (W.blocked(game.world, p.x, p.y, 12)) {
      var free = W.findSpot(game.world, 12);
      p.x = free.x;
      p.y = free.y;
    }

    game.fx = ZX.Skills.newFx();
    game.renderer.floaters.length = 0;
    game.renderer.follow(game.world, p.x, p.y, true);
    game.inCombat = 0;
    game.ui.setMap(def);

    if (!silent) {
      game.audio.play('portal');
      game.ui.toast(def.name, 'map');
      game.hooks.log('来到【' + def.name + '】——' + def.sub, 'sys');
      if (def.safe) game.hooks.log('此处为安全之地，无妖物出没。', 'sys');
    }
    ZX.Save.save(p);
  };

  // ── 战斗 ────────────────────────────────────────────────
  /** 怪物打玩家 */
  function monsterAttack(m) {
    var p = game.player;
    if (p.dead) return;
    game.inCombat = 5000;

    if (p.hurtIframe > 0) return;

    if (C.dodged(p.stats.dodge)) {
      game.renderer.floater(p.x, p.y - 36, '闪避', 'miss');
      return;
    }

    var isMagic = m.def.ranged;
    var res = C.damage(
      m.def.atk,
      isMagic ? p.stats.mdef : p.stats.def,
      isMagic ? 'magic' : 'phys',
      1,
      { levelGap: m.def.lv - p.level }
    );

    var real = C.absorb(p, res.amount);
    p.hp -= real;
    p.hurtIframe = CFG.HURT_IFRAME_MS;
    game.renderer.floater(p.x, p.y - 36, real, 'hurt');
    game.audio.play('hit');

    // 六合镜：反伤
    var reflect = C.getBuff(p, 'reflect');
    if (reflect && real > 0) {
      var back = Math.round(real * reflect.amount);
      W.hurtMonster(game.world, m, back, game.hooks);
      game.renderer.floater(m.x, m.y - m.def.radius - 8, back, 'hit');
    }

    if (p.hp <= 0) playerDied();
  }

  function playerDied() {
    var p = game.player;
    if (p.dead) return;
    p.hp = 0;
    var lost = ZX.Player.die(p);
    game.audio.play('die');
    game.ui.toast('你倒下了', 'death');
    game.hooks.log('气绝。损失经验 ' + U.big(lost) + '。三息之后于本图复生。', 'warn');
    ZX.Save.save(p);

    setTimeout(function () {
      if (!game.running) return;
      ZX.Player.revive(p);
      var def = ZX.MAPS.byKey(p.map);
      p.x = def.start.x * CFG.TILE + CFG.TILE / 2;
      p.y = def.start.y * CFG.TILE + CFG.TILE / 2;
      game.renderer.follow(game.world, p.x, p.y, true);
      game.inCombat = 0;
      game.hooks.log('你缓过一口气，重新站了起来。', 'sys');
    }, 3000);
  }

  /** 怪物死了：经验、灵石、掉落、任务 */
  function monsterDied(m) {
    var p = game.player;
    var def = m.def;

    p.kills += 1;
    var before = p.level;
    var levels = ZX.Player.gainExp(p, def.exp);
    var goldGot = Math.round(def.gold * U.rand(0.8, 1.25));
    p.gold += goldGot;

    game.renderer.floater(m.x, m.y - def.radius - 22, '+' + U.big(def.exp), 'exp');
    if (def.isElite) {
      game.hooks.log('击杀 ' + def.name + '，经验 +' + U.big(def.exp) + '，灵石 +' + goldGot, 'combat');
    }

    var loot = W.rollLoot(game.world, m, p);
    for (var i = 0; i < loot.length; i++) {
      if (loot[i].q === 'epic' || loot[i].q === 'legend') {
        game.hooks.log('※ ' + def.name + ' 掉落了【' + loot[i].name + '】！', 'loot');
        game.audio.play('loot');
      }
    }

    if (def.isBoss) {
      game.audio.play('boss');
      game.ui.toast('讨伐成功　' + def.name, 'boss');
      game.hooks.log('【' + def.name + '】伏诛。' + (def.say ? '它最后说：「' + def.say + '」' : ''), 'quest');
    }

    var wanted = ZX.Quest.targetMonsterId(p);
    if (ZX.Quest.onKill(p, def)) {
      var q = ZX.Quest.current(p);
      game.hooks.log('任务进度：' + ZX.QUESTS.goalText(q, p.quest.progress), 'quest');
      game.renderer.floater(m.x, m.y - def.radius - 38, '任务 +1', 'gold');
      if (ZX.Quest.complete(p)) {
        game.audio.play('quest');
        var turn = ZX.NPCS.byKey(q.turnIn);
        game.ui.toast('可以复命了', 'quest');
        game.hooks.log('【' + q.name + '】目标达成，回去找 ' + (turn ? turn.name : '发布人') +
          '（' + (turn ? ZX.MAPS.byKey(turn.map).name : '') + '）复命。', 'quest');
      }
    } else if (wanted && wanted !== def.id) {
      // 打错目标时说一声。否则玩家闷头刷半天不涨进度，
      // 只会以为是任务坏了——而不会想到自己打的根本不是那只怪。
      var want = ZX.MONSTERS.byId(wanted);
      if (want && !game.wrongTargetCd) {
        game.wrongTargetCd = true;
        game.hooks.log(def.name + ' 不是当前任务目标，要打的是【' + want.name + '】（头顶有金圈）。', 'warn');
        setTimeout(function () { game.wrongTargetCd = false; }, 8000);
      }
    }

    if (levels > 0) game.onLevelUp(p.level - before);
  }

  // ── 输入动作 ────────────────────────────────────────────
  function handleAction(action) {
    var p = game.player;
    var ui = game.ui;
    var panels = game.panels;

    switch (action) {
      case 'attack':
        if (!p.dead && !C.disabled(p)) {
          if (ZX.Skills.basicAttack(game)) {
            p.attackCd = ZX.Player.attackInterval(p);
            game.inCombat = 5000;
          }
        }
        break;

      case 'talisman': {
        var aim = game.input.aimWorld(game.renderer, p);
        var r = ZX.Skills.castTalisman(game, aim.x, aim.y);
        if (!r.ok) {
          ui.log(r.msg, 'warn');
          game.audio.play('error');
        } else {
          game.inCombat = 5000;
        }
        break;
      }

      case 'interact':
        interact();
        break;

      case 'potion':
        quickPotion();
        break;

      case 'bag':
        toggle('bag', function () { panels.bag(); });
        break;
      case 'char':
        toggle('char', function () { panels.char(); });
        break;
      case 'skills':
        toggle('skills', function () { panels.skills(); });
        break;
      case 'quest':
        toggle('quest', function () { panels.quest(); });
        break;
      case 'map':
        toggle('map', function () { panels.map(); });
        break;

      case 'menu':
        // 逐层往回退：先关物品详情，再关面板。
        // 一下子全关掉的话，看个装备属性就得重新打开背包
        if (!ui.el.itempop.classList.contains('hidden')) panels.closeItem();
        else if (ui.isBlocking()) ui.closePanel();
        else toggle('menu', function () { showMenu(); });
        break;

      default:
        // skill1..skill6
        if (action.indexOf('skill') === 0) {
          var idx = Number(action.slice(5)) - 1;
          var list = ZX.skillsOf(p.sect, p.level);
          var def = list[idx];
          if (!def) {
            ui.log('尚未参悟这一式。', 'warn');
            break;
          }
          var a = game.input.aimWorld(game.renderer, p);
          // 朝向必须在 cast 之前定好：strike 类技能是瞬发的，
          // cast() 里立刻就用 p.facing 去筛前方扇形里的目标。
          // 放完再转身等于每次都拿上一次的朝向打，站桩换向时第一下必空。
          if (a.x !== p.x || a.y !== p.y) p.facing = U.dirTo(p.x, p.y, a.x, a.y);
          var res = ZX.Skills.cast(game, def, a.x, a.y);
          if (!res.ok) {
            ui.log(res.msg, 'warn');
            game.audio.play('error');
          } else {
            game.inCombat = 5000;
          }
        }
        break;
    }
  }

  function toggle(name, open) {
    var ui = game.ui;
    if (ui.openPanel === name) ui.closePanel();
    else open();
  }

  /** 和身边的 NPC / 传送门交互 */
  function interact() {
    var p = game.player;
    var hit = W.interactable(game.world, p.x, p.y);
    if (!hit) {
      game.ui.log('附近没什么可打交道的。', 'sys');
      return;
    }
    if (hit.kind === 'npc') {
      game.panels.talk(hit.npc.def);
    } else {
      game.changeMap(hit.portal.to);
    }
  }

  /** R 键：从背包里挑一颗能用的、最省的补药 */
  function quickPotion() {
    var p = game.player;
    var needHp = p.hp < p.stats.hp * 0.9;
    var best = -1;
    var bestScore = Infinity;
    for (var i = 0; i < p.bag.length; i++) {
      if (!p.bag[i]) continue;
      var item = ZX.ITEMS.byId(p.bag[i].id);
      if (!item || item.type !== 'potion' || item.lv > p.level) continue;
      var heals = (item.use.hp || 0) + (item.use.hpPct || 0) * p.stats.hp;
      var mana = (item.use.mp || 0) + (item.use.mpPct || 0) * p.stats.mp;
      if (needHp && heals <= 0) continue;
      if (!needHp && mana <= 0) continue;
      var score = item.price; // 同样管用就先吃便宜的
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best < 0) {
      game.ui.log('没有合用的丹药。', 'warn');
      game.audio.play('error');
      return;
    }
    var r = ZX.Player.usePotion(p, best);
    if (r && r.ok) {
      game.audio.play('heal');
      if (r.healed) game.renderer.floater(p.x, p.y - 34, r.healed, 'heal');
      if (r.restored) game.ui.log('灵力 +' + r.restored, 'loot');
    }
  }

  function showMenu() {
    var p = game.player;
    var html = '<div class="menu-list">' +
      '<div class="hint">操作：WASD/方向键 移动　鼠标 瞄准　左键/空格 普攻　1-6 技能　Q 法宝　' +
      'E/右键 交互　R 快速吃药　B 背包　C 角色　K 技能　L 任务　M 山河图　Esc 菜单</div>' +
      '<button class="btn" id="mn-sound">音效：' + (game.audio.enabled ? '开' : '关') + '</button>' +
      '<button class="btn" id="mn-save">立即存档</button>' +
      '<button class="btn danger" id="mn-wipe">重新开始（清空存档）</button>' +
      '<div class="hint">进度自动保存在这台设备的浏览器里。清空浏览器数据会一并清掉。</div>' +
      '</div>';
    game.ui.show('menu', '菜单', html);

    document.getElementById('mn-sound').addEventListener('click', function () {
      game.audio.enabled = !game.audio.enabled;
      ZX.Save.saveSettings({ sound: game.audio.enabled });
      showMenu();
    });
    document.getElementById('mn-save').addEventListener('click', function () {
      ZX.Save.save(p);
      game.ui.log('已存档。', 'sys');
      game.ui.closePanel();
    });
    document.getElementById('mn-wipe').addEventListener('click', function () {
      if (!global.confirm('清空存档，重头再来？这一步没法撤销。')) return;
      ZX.Save.wipe();
      global.location.reload();
    });
  }

  // ── 主循环 ──────────────────────────────────────────────
  var last = 0;
  var crashes = 0;

  /**
   * 一帧。
   *
   * 整个循环靠 requestAnimationFrame 自己接自己——所以这里必须兜住异常：
   * 漏出去一个错误，下一帧的 rAF 就排不上，画面直接定格、按键全无反应，
   * 玩家只能刷新页面，还不知道发生了什么。宁可这一帧不画，也要让循环活着。
   */
  function frame(now) {
    if (!game.running) return;
    var dt = Math.min(CFG.MAX_DT, now - last || 16);
    last = now;
    game.t += dt;

    try {
      step(dt);
      game.renderer.draw(game, game.t);
      drawOverlay();
      crashes = 0;
    } catch (e) {
      onFrameError(e);
    }

    global.requestAnimationFrame(frame);
  }

  /**
   * 帧内出错的处理：告诉玩家、存档保住进度。
   * 连着炸说明是稳定复现的错误，再跑下去只会刷屏，这时才停循环。
   */
  function onFrameError(e) {
    crashes += 1;
    if (global.console && global.console.error) global.console.error(e);

    if (crashes === 1) {
      try {
        ZX.Save.save(game.player);
        game.ui.log('出错了：' + (e && e.message ? e.message : e) + '（进度已保存）', 'warn');
      } catch (ignored) {
        // 连存档和日志都挂了，那就只剩下面的停机提示
      }
    }

    if (crashes >= 60) {
      game.running = false;
      try {
        game.ui.toast('游戏出错了，请刷新页面', 'death');
        game.ui.log('连续出错，已停止。进度已保存，刷新后可继续。', 'warn');
      } catch (ignored2) {
        // 界面也坏了就没辙了，至少存档已经落盘
      }
    }
  }

  function step(dt) {
    var p = game.player;
    p.playMs += dt;

    // 输入
    var dir = game.input.update();
    var actions = game.input.drain();
    for (var i = 0; i < actions.length; i++) handleAction(actions[i]);

    // 玩家移动（面板开着也能走，但死了/被定住不行）
    game.moving = false;
    if (!p.dead && !C.disabled(p) && (dir.x || dir.y)) {
      var v = ZX.Player.moveSpeed(p) * (dt / 1000);
      var np = W.move(game.world, p.x, p.y, dir.x * v, dir.y * v, 12);
      if (np.x !== p.x || np.y !== p.y) game.moving = true;
      p.x = np.x;
      p.y = np.y;
      p.facing = { x: dir.x, y: dir.y };
    }

    // 自身状态
    if (p.hurtIframe > 0) p.hurtIframe -= dt;
    if (p.attackCd > 0) p.attackCd -= dt;
    if (game.inCombat > 0) game.inCombat -= dt;

    var tick = C.tickBuffs(p, dt, function (amount) {
      p.hp -= amount;
      game.renderer.floater(p.x, p.y - 36, amount, 'hurt');
      if (p.hp <= 0) playerDied();
    });
    // 只要有 buff 到期就重算，不能等身上 buff 全空——
    // 否则护盾还在的时候血炼到期，攻击加成会一直虚挂着
    if (tick.expired > 0) ZX.Player.recompute(p);

    ZX.Player.tickRegen(p, dt, game.moving, game.inCombat > 0);

    // 自动普攻：有怪在射程内就自己打，省得一直点
    if (!p.dead && p.attackCd <= 0 && !C.disabled(p)) {
      var target = W.nearest(game.world, p.x, p.y, CFG.MELEE_RANGE + 12);
      if (target) {
        ZX.Skills.basicAttack(game);
        p.attackCd = ZX.Player.attackInterval(p);
        game.inCombat = 5000;
      }
    }

    ZX.Skills.update(game, dt);
    W.update(game.world, dt, p, game.hooks);
    pickup();
    game.renderer.updateFloaters(dt);
    game.renderer.follow(game.world, p.x, p.y);
    game.ui.update(dt);

    // 自动存档
    game.saveTimer -= dt;
    if (game.saveTimer <= 0) {
      game.saveTimer = 20000;
      ZX.Save.save(p);
    }
  }

  /** 走到掉落物上自动捡 */
  function pickup() {
    var p = game.player;
    if (p.dead) return;
    var drops = game.world.drops;
    for (var i = drops.length - 1; i >= 0; i--) {
      var d = drops[i];
      if (d.born < 300) continue; // 刚掉出来的先让它飞一下
      if (U.dist2(p.x, p.y, d.x, d.y) > CFG.PICKUP_RANGE * CFG.PICKUP_RANGE) continue;

      var res = ZX.Inventory.add(p.bag, d.id, d.n);
      if (res.added <= 0) {
        if (!game.bagWarned) {
          game.bagWarned = true;
          game.ui.log('背包满了，捡不了东西。', 'warn');
          setTimeout(function () { game.bagWarned = false; }, 4000);
        }
        continue;
      }
      p.bag = res.bag;
      var item = ZX.ITEMS.byId(d.id);
      game.audio.play('loot');
      game.renderer.floater(p.x, p.y - 48, item.name, 'gold');
      if (res.added < d.n) d.n -= res.added;
      else drops.splice(i, 1);
    }
  }

  /** 画在最上层的东西：摇杆、交互提示、死亡遮罩 */
  function drawOverlay() {
    var ctx = game.renderer.ctx;
    var p = game.player;

    var stick = game.input.stickView();
    if (stick) {
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(stick.ox, stick.oy, 52, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(stick.x, stick.y, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 身边有可交互目标时给个提示
    var hit = W.interactable(game.world, p.x, p.y);
    if (hit && !p.dead) {
      var text = hit.kind === 'npc'
        ? '［E］与 ' + hit.npc.def.name + ' 交谈'
        : '［E］前往 ' + ZX.MAPS.byKey(hit.portal.to).name;
      ctx.save();
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      var w = ctx.measureText(text).width + 24;
      var cx = game.renderer.vw / 2;
      var cy = game.renderer.vh - 132;
      ctx.fillStyle = 'rgba(10,12,18,0.82)';
      ctx.fillRect(cx - w / 2, cy - 18, w, 26);
      ctx.strokeStyle = 'rgba(160,200,240,0.4)';
      ctx.strokeRect(cx - w / 2, cy - 18, w, 26);
      ctx.fillStyle = '#d8e4f0';
      ctx.fillText(text, cx, cy);
      ctx.restore();
    }

    if (p.dead) {
      ctx.save();
      ctx.fillStyle = 'rgba(40,0,10,0.45)';
      ctx.fillRect(0, 0, game.renderer.vw, game.renderer.vh);
      ctx.restore();
    }
  }

  // ── 开局 ────────────────────────────────────────────────
  function startGame(player) {
    game.player = player;
    game.ui = new ZX.UI(game);
    game.panels = new ZX.Panels(game, game.ui);
    game.ui.setIdentity(player);

    document.getElementById('title').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    canvas.classList.remove('hidden');

    game.changeMap(player.map, true);
    game.ui.setMap(ZX.MAPS.byKey(player.map));
    game.ui.log('——《诛仙》江湖录——', 'sys');
    game.ui.log('天地不仁，以万物为刍狗。', 'sys');
    game.ui.log('操作：WASD 移动，鼠标瞄准，1-6 放技能，Q 用法宝，E 交互，Esc 菜单。', 'sys');

    var q = ZX.Quest.current(player);
    if (q) {
      var giver = ZX.NPCS.byKey(q.giver);
      game.ui.log('当前因果：【' + q.name + '】　去找 ' + (giver ? giver.name : '？') +
        '（' + (giver ? ZX.MAPS.byKey(giver.map).name : '') + '）', 'quest');
    }

    game.running = true;
    last = performance.now();
    global.requestAnimationFrame(frame);
  }

  // ── 标题页 ──────────────────────────────────────────────
  function buildTitle() {
    var wrap = document.getElementById('sect-list');
    var chosen = ZX.SECTS[0].key;

    for (var i = 0; i < ZX.SECTS.length; i++) {
      (function (s) {
        var card = document.createElement('button');
        card.className = 'sect-card' + (s.key === chosen ? ' on' : '');
        card.style.setProperty('--c', s.color);
        card.innerHTML =
          '<div class="sc-name">' + ZX.esc(s.name) + '</div>' +
          '<div class="sc-art">' + ZX.esc(s.art) + '</div>' +
          '<div class="sc-desc">' + ZX.esc(s.desc) + '</div>' +
          '<div class="sc-quote">「' + ZX.esc(s.quote) + '」</div>';
        card.addEventListener('click', function () {
          chosen = s.key;
          var cards = wrap.children;
          for (var k = 0; k < cards.length; k++) cards[k].classList.remove('on');
          card.classList.add('on');
        });
        wrap.appendChild(card);
      })(ZX.SECTS[i]);
    }

    var nameInput = document.getElementById('name-input');

    document.getElementById('btn-new').addEventListener('click', function () {
      game.audio.unlock();
      var name = (nameInput.value || '').trim().slice(0, 12) || '张小凡';
      if (ZX.Save.hasSave() && !global.confirm('已有存档，新开一号会把它覆盖掉。继续？')) return;
      ZX.Save.wipe();
      startGame(ZX.Player.create(name, chosen));
    });

    var cont = document.getElementById('btn-continue');
    var sum = ZX.Save.summary();
    if (sum) {
      cont.classList.remove('hidden');
      cont.textContent = '继续　' + sum.name + '　' + sum.sect + ' Lv.' + sum.level + '　' + sum.map;
      cont.addEventListener('click', function () {
        game.audio.unlock();
        var p = ZX.Save.load();
        if (!p) {
          global.alert('存档读不出来，只能重开了。');
          return;
        }
        startGame(p);
      });
    }
  }

  // ── 接线 ────────────────────────────────────────────────
  global.addEventListener('resize', function () {
    game.renderer.resize();
    if (game.world && game.player) game.renderer.follow(game.world, game.player.x, game.player.y, true);
  });

  // 切后台先存一次，手机上被系统杀掉也不丢进度
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && game.player) ZX.Save.save(game.player);
  });
  global.addEventListener('pagehide', function () {
    if (game.player) ZX.Save.save(game.player);
  });

  document.addEventListener('pointerdown', function unlockOnce() {
    game.audio.unlock();
    document.removeEventListener('pointerdown', unlockOnce);
  });

  buildTitle();

  // 注册 Service Worker，装到桌面后可离线玩
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    global.addEventListener('load', function () {
      // 进页面时就记下有没有旧的 SW 在管事，下面判断"是不是更新"要用
      var hadController = !!navigator.serviceWorker.controller;

      // updateViaCache: 'none' —— 别用 HTTP 缓存里的 sw.js。
      // GitHub Pages 对所有文件都发 cache-control: max-age=600，
      // 不加这句的话，刚发布的新版本最多要等 10 分钟才会被发现。
      navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
        .then(function (reg) {
          reg.update();
          // 从后台切回来时再查一次，手机上这是最常见的"回到游戏"路径
          document.addEventListener('visibilitychange', function () {
            if (!document.hidden) reg.update();
          });
        })
        .catch(function () {
          // 注册失败不影响在线游玩
        });

      /**
       * 新版本接管的那一刻，自动刷新一次。
       *
       * 不这么做的话：页面还挂在旧 SW 上，静态资源走的仍是旧缓存，
       * 用户会觉得"我明明刷新了，怎么还是老样子"——得刷第二次才行。
       * 进度不会丢，切后台和关页面时都存过档。
       */
      var reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        // 首次安装（本来就没有 SW）不用刷，那是全新的页面
        if (!hadController || reloading) return;
        reloading = true;
        if (game.player) ZX.Save.save(game.player);
        global.location.reload();
      });
    });
  }
})(window);
