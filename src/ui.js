/**
 * HUD 与面板外壳：血蓝条、经验条、技能栏、小地图、日志、提示。
 *
 * 面板内容在 ui-panels.js；这里只管外壳、开关和每帧刷新的那几个数字。
 * 文本一律走 esc() 转义后再拼 HTML——玩家起的名字也是外部输入，不能直接塞进去。
 */
(function (global) {
  'use strict';

  var ZX = global.ZX;
  var U = ZX.U;

  function $(id) {
    return document.getElementById(id);
  }

  /** 拼 HTML 前必须过一遍，玩家名字是唯一的外部输入，但一样不能信 */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function UI(game) {
    this.game = game;
    this.el = {
      hud: $('hud'),
      hpFill: $('hp-fill'), hpText: $('hp-text'),
      mpFill: $('mp-fill'), mpText: $('mp-text'),
      expFill: $('exp-fill'), expText: $('exp-text'),
      lvl: $('lvl'), pname: $('pname'), psect: $('psect'),
      gold: $('gold'),
      mapName: $('map-name'), mapSub: $('map-sub'),
      skillbar: $('skillbar'),
      log: $('log'),
      toast: $('toast'),
      panel: $('panel'), panelTitle: $('panel-title'), panelBody: $('panel-body'),
      dialog: $('dialog'),
      itempop: $('itempop'),
      minimap: $('minimap'),
      questTrack: $('quest-track'),
      buffs: $('buffs'),
      bossbar: $('bossbar'), bossName: $('boss-name'),
      bossFill: $('boss-fill'), bossText: $('boss-text'),
    };
    this.minimapCtx = this.el.minimap ? this.el.minimap.getContext('2d') : null;
    this.openPanel = null;
    this.logLines = [];
    this.toastTimer = 0;
    this.lastSkillSig = '';
    this.bindStatic();
  }

  UI.prototype.bindStatic = function () {
    var self = this;
    var game = this.game;

    // 顶部按钮栏
    var buttons = document.querySelectorAll('[data-action]');
    for (var i = 0; i < buttons.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          game.input.press(btn.getAttribute('data-action'));
        });
      })(buttons[i]);
    }

    $('panel-close').addEventListener('click', function () {
      self.closePanel();
    });

    // 点面板外的遮罩也关掉
    this.el.panel.addEventListener('click', function (e) {
      if (e.target === self.el.panel) self.closePanel();
    });
  };

  // ── 日志与提示 ──────────────────────────────────────────
  var LOG_CLASS = {
    sys: 'l-sys', combat: 'l-combat', loot: 'l-loot',
    quest: 'l-quest', skill: 'l-skill', warn: 'l-warn',
  };

  UI.prototype.log = function (text, kind) {
    this.logLines.push({ text: text, kind: kind || 'sys' });
    if (this.logLines.length > ZX.CONFIG.LOG_MAX) this.logLines.shift();

    var div = document.createElement('div');
    div.className = 'log-line ' + (LOG_CLASS[kind] || LOG_CLASS.sys);
    div.textContent = text;
    this.el.log.appendChild(div);
    while (this.el.log.children.length > ZX.CONFIG.LOG_MAX) {
      this.el.log.removeChild(this.el.log.firstChild);
    }
    this.el.log.scrollTop = this.el.log.scrollHeight;
  };

  /** 屏幕正中的大字提示：升级、进图、放不下东西 */
  UI.prototype.toast = function (text, kind) {
    this.el.toast.textContent = text;
    this.el.toast.className = 'toast show ' + (kind || '');
    this.toastTimer = 1800;
  };

  // ── 面板 ────────────────────────────────────────────────
  UI.prototype.show = function (name, title, html) {
    this.openPanel = name;
    this.el.panelTitle.textContent = title;
    this.el.panelBody.innerHTML = html;
    this.el.panel.classList.remove('hidden');
    this.el.panel.setAttribute('data-panel', name);
  };

  UI.prototype.closePanel = function () {
    this.openPanel = null;
    this.el.panel.classList.add('hidden');
    this.el.dialog.classList.add('hidden');
    this.el.itempop.classList.add('hidden');
  };

  /** 有任何浮层挡着（面板 / 对话 / 物品详情）*/
  UI.prototype.isBlocking = function () {
    return !this.el.panel.classList.contains('hidden') ||
      !this.el.dialog.classList.contains('hidden') ||
      !this.el.itempop.classList.contains('hidden');
  };

  // ── 每帧刷新 ────────────────────────────────────────────
  UI.prototype.update = function (dt) {
    var p = this.game.player;
    var s = p.stats;

    setBar(this.el.hpFill, p.hp / s.hp);
    setBar(this.el.mpFill, s.mp > 0 ? p.mp / s.mp : 0);
    this.el.hpText.textContent = Math.ceil(p.hp) + ' / ' + s.hp;
    this.el.mpText.textContent = Math.ceil(p.mp) + ' / ' + s.mp;

    var need = ZX.Stats.expToNext(p.level);
    var ratio = need === Infinity ? 1 : p.exp / need;
    setBar(this.el.expFill, ratio);
    this.el.expText.textContent = need === Infinity
      ? '已至大乘'
      : U.big(p.exp) + ' / ' + U.big(need) + '（' + (ratio * 100).toFixed(1) + '%）';

    this.el.lvl.textContent = p.level;
    this.el.gold.textContent = U.big(p.gold);

    this.updateSkillbar();
    this.updateBuffs();
    this.updateQuestTrack();
    this.updateBossBar();
    this.drawMinimap();

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.className = 'toast';
    }
  };

  function setBar(el, ratio) {
    if (el) el.style.width = (U.clamp(ratio, 0, 1) * 100).toFixed(2) + '%';
  }

  /** 技能栏：结构只在技能集变化时重建，之后每帧只改冷却遮罩 */
  UI.prototype.updateSkillbar = function () {
    var p = this.game.player;
    var skills = ZX.skillsOf(p.sect, p.level);
    var tal = ZX.Inventory.talisman(p.equip);
    var sig = skills.length + '|' + (tal ? tal.id : '-');

    if (sig !== this.lastSkillSig) {
      this.lastSkillSig = sig;
      this.buildSkillbar(skills, tal);
    }

    var slots = this.el.skillbar.children;
    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i];
      var key = slot.getAttribute('data-skill');
      var cd = p.cd[key] || 0;
      var max = Number(slot.getAttribute('data-cd')) || 1;
      var mask = slot.querySelector('.cd-mask');
      var txt = slot.querySelector('.cd-text');
      if (cd > 0) {
        mask.style.height = (U.clamp(cd / max, 0, 1) * 100) + '%';
        txt.textContent = cd > 1000 ? Math.ceil(cd / 1000) : (cd / 1000).toFixed(1);
        slot.classList.add('cooling');
      } else {
        mask.style.height = '0%';
        txt.textContent = '';
        slot.classList.remove('cooling');
      }
      var cost = Number(slot.getAttribute('data-mp')) || 0;
      slot.classList.toggle('nomp', p.mp < cost);
    }
  };

  UI.prototype.buildSkillbar = function (skills, tal) {
    var self = this;
    var bar = this.el.skillbar;
    bar.innerHTML = '';

    for (var i = 0; i < skills.length; i++) {
      bar.appendChild(skillSlot(self, skills[i], String(i + 1), 'skill' + (i + 1)));
    }
    if (tal && tal.active) {
      bar.appendChild(talismanSlot(self, tal));
    }
  };

  function skillSlot(ui, def, hotkey, action) {
    var el = document.createElement('button');
    el.className = 'slot';
    el.setAttribute('data-skill', def.key);
    el.setAttribute('data-cd', def.cd);
    el.setAttribute('data-mp', def.mp);
    el.style.setProperty('--slot-color', def.color);
    el.innerHTML =
      '<span class="cd-mask"></span>' +
      '<span class="slot-name">' + esc(def.name.slice(0, 5)) + '</span>' +
      '<span class="slot-key">' + esc(hotkey) + '</span>' +
      '<span class="cd-text"></span>';
    el.title = def.name + '　灵力 ' + def.mp + '　冷却 ' + (def.cd / 1000) + 's\n' + def.desc;
    el.addEventListener('click', function (e) {
      e.preventDefault();
      ui.game.input.press(action);
    });
    return el;
  }

  function talismanSlot(ui, item) {
    var el = document.createElement('button');
    el.className = 'slot slot-talisman';
    el.setAttribute('data-skill', 'talisman');
    el.setAttribute('data-cd', item.active.cd);
    el.setAttribute('data-mp', 0);
    el.style.setProperty('--slot-color', ZX.QUALITY[item.q].color);
    el.innerHTML =
      '<span class="cd-mask"></span>' +
      '<span class="slot-name">' + esc(item.name.slice(0, 4)) + '</span>' +
      '<span class="slot-key">Q</span>' +
      '<span class="cd-text"></span>';
    el.title = '【法宝】' + item.name + ' · ' + item.active.name + '\n' + item.desc;
    el.addEventListener('click', function (e) {
      e.preventDefault();
      ui.game.input.press('talisman');
    });
    return el;
  }

  var BUFF_LABEL = {
    shield: '护体', atkUp: '血炼', defUp: '梵光', lifesteal: '噬血',
    reflect: '六合', slow: '迟滞', stun: '定身', burn: '灼烧', poison: '中毒', charm: '迷魅',
  };

  UI.prototype.updateBuffs = function () {
    var p = this.game.player;
    var html = '';
    for (var i = 0; i < p.buffs.length; i++) {
      var b = p.buffs[i];
      var label = BUFF_LABEL[b.kind] || b.kind;
      html += '<span class="buff b-' + esc(b.kind) + '">' + esc(label) +
        ' <i>' + Math.ceil(b.ms / 1000) + '</i></span>';
    }
    this.el.buffs.innerHTML = html;
  };

  UI.prototype.updateQuestTrack = function () {
    var p = this.game.player;
    var q = ZX.Quest.current(p);
    if (!q) {
      this.el.questTrack.innerHTML = '<div class="qt-name">江湖路远</div>' +
        '<div class="qt-goal">主线已尽。天地间只剩你一个人在走。</div>';
      return;
    }
    var met = ZX.Quest.goalMet(p);
    var short = ZX.Quest.levelShort(p);

    // 三种状态说三句话：还在打 / 打够了但差等级 / 可以复命了
    var note = short ? '（需 ' + q.lv + ' 级复命）' : '';
    var tail = '';
    if (met && short) tail = '　→ 练到 ' + q.lv + ' 级再去复命';
    else if (met) tail = '　→ 回去复命';

    this.el.questTrack.innerHTML =
      '<div class="qt-name">' + esc(q.name) + esc(note) + '</div>' +
      '<div class="qt-goal' + (met ? ' done' : '') + '">' +
      esc(ZX.QUESTS.goalText(q, p.quest.progress)) + esc(tail) + '</div>';
  };

  UI.prototype.updateBossBar = function () {
    var world = this.game.world;
    var boss = null;
    for (var i = 0; i < world.monsters.length; i++) {
      var m = world.monsters[i];
      if (m.isBoss && !m.dead && m.state === 'chase') {
        boss = m;
        break;
      }
    }
    if (!boss) {
      this.el.bossbar.classList.add('hidden');
      // 收起时把左右两栏放回原位
      this.el.hud.classList.remove('boss-on');
      return;
    }
    this.el.bossbar.classList.remove('hidden');
    // 顶部通栏会占掉一段高度，让左右两栏整体下移，免得压住玩家血条
    this.el.hud.classList.add('boss-on');

    this.el.bossName.textContent = '◆ ' + boss.def.name +
      (boss.def.title ? '　' + boss.def.title : '') + '　Lv.' + boss.def.lv;
    setBar(this.el.bossFill, boss.hp / boss.maxHp);
    this.el.bossText.textContent = U.big(Math.ceil(boss.hp)) + ' / ' + U.big(boss.maxHp) +
      '（' + Math.round((boss.hp / boss.maxHp) * 100) + '%）';
  };

  /** 小地图：地图轮廓 + 障碍 + 怪物红点 + 传送门 + 自己 */
  UI.prototype.drawMinimap = function () {
    var ctx = this.minimapCtx;
    if (!ctx) return;
    var world = this.game.world;
    var p = this.game.player;
    var cw = this.el.minimap.width;
    var ch = this.el.minimap.height;
    var k = Math.min(cw / world.w, ch / world.h);
    var ox = (cw - world.w * k) / 2;
    var oy = (ch - world.h * k) / 2;

    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = 'rgba(12,14,20,0.82)';
    ctx.fillRect(ox, oy, world.w * k, world.h * k);

    ctx.fillStyle = 'rgba(160,180,210,0.28)';
    var i;
    for (i = 0; i < world.blocks.length; i++) {
      var b = world.blocks[i];
      ctx.fillRect(ox + b.x * k, oy + b.y * k, b.w * k, b.h * k);
    }

    for (i = 0; i < world.portals.length; i++) {
      var pt = world.portals[i];
      ctx.fillStyle = '#7fd8ff';
      ctx.fillRect(ox + pt.x * k - 2, oy + pt.y * k - 2, 4, 4);
    }

    for (i = 0; i < world.npcs.length; i++) {
      var n = world.npcs[i];
      ctx.fillStyle = '#ffd24a';
      ctx.fillRect(ox + n.x * k - 1.5, oy + n.y * k - 1.5, 3, 3);
    }

    // 任务目标在小地图上也标成金色，省得满图乱找
    var questId = ZX.Quest.targetMonsterId(p);
    for (i = 0; i < world.monsters.length; i++) {
      var m = world.monsters[i];
      if (m.dead) continue;
      var isTarget = questId && m.def.id === questId;
      ctx.fillStyle = isTarget ? '#ffd24a'
        : m.isBoss ? '#ff4a6a'
          : m.def.isElite ? '#ffa04a'
            : 'rgba(224,90,90,0.75)';
      var size = m.isBoss ? 4 : isTarget ? 3.5 : 2;
      ctx.fillRect(ox + m.x * k - size / 2, oy + m.y * k - size / 2, size, size);
    }

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ox + p.x * k, oy + p.y * k, 2.6, 0, Math.PI * 2);
    ctx.fill();
  };

  /** 换图时刷新标题 */
  UI.prototype.setMap = function (mapDef) {
    this.el.mapName.textContent = mapDef.name;
    this.el.mapSub.textContent = mapDef.sub + '　Lv.' + mapDef.lv[0] + '-' + mapDef.lv[1];
  };

  UI.prototype.setIdentity = function (p) {
    this.el.pname.textContent = p.name;
    this.el.psect.textContent = ZX.sect(p.sect).name;
  };

  ZX.UI = UI;
  ZX.esc = esc;
})(window);
