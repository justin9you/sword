/**
 * 任务运行时。只维护"当前这一条"，链式推进。
 *
 * 进度记在 player.quest.progress 上（一个数字就够，因为每条任务只有一个目标）。
 * 交任务要回到指定 NPC 面前，这是 MMO 的跑腿味，也顺便把玩家往剧情地点带。
 */
(function (global) {
  'use strict';

  var ZX = global.ZX;

  /** 当前任务定义；全做完了返回 null */
  function current(p) {
    if (!p.quest.current) return null;
    return ZX.QUESTS.byKey(p.quest.current);
  }

  /**
   * 修为够不够复命。
   *
   * 等级只卡这一道关——不卡杀怪计数。打怪的进度永远算数、永远不会丢，
   * 练到等级回来直接交，不用重打一遍。
   */
  function levelShort(p) {
    var q = current(p);
    return !!q && p.level < q.lv;
  }

  /**
   * 目标本身达没达成（杀够了 / 首领打了 / 人见着了），不看等级。
   *
   * 和 complete() 分开是有意的：
   *   goalMet  决定"还用不用继续打"——达成了就不再高亮目标怪
   *   complete 决定"能不能交差"——还要再过一道等级关
   * 混成一个的话，等级不够时 goalMet 会一直是 false，
   * 目标怪就一直高亮着，玩家会以为是没杀够，回去接着刷。
   */
  function goalMet(p) {
    var q = current(p);
    if (!q) return false;
    var g = q.goal;
    if (g.type === 'kill') return p.quest.progress >= g.count;
    if (g.type === 'boss') return p.quest.progress > 0;
    if (g.type === 'level') return p.level >= g.count;
    if (g.type === 'talk') return p.quest.progress > 0;
    return false;
  }

  /** 能不能复命：目标达成，且修为够 */
  function complete(p) {
    return goalMet(p) && !levelShort(p);
  }

  /**
   * 杀怪时调用，推进击杀类目标。
   *
   * 不看等级。曾经这里卡过"低于建议等级就不计数"，结果 15 条任务里有 11 条
   * 刚接到时等级都不够——任务挂在追踪栏上、目标明明白白写着，打了却毫无反应。
   * 沉默地不计数是最糟的反馈：玩家只会以为游戏坏了，不会想到是自己等级不够。
   */
  function onKill(p, monsterDef) {
    var q = current(p);
    if (!q) return false;
    var g = q.goal;
    if (g.type === 'kill' && g.monster === monsterDef.id && p.quest.progress < g.count) {
      p.quest.progress += 1;
      return true;
    }
    if (g.type === 'boss' && g.id === monsterDef.id && p.quest.progress === 0) {
      p.quest.progress = 1;
      return true;
    }
    return false;
  }

  /** 和 NPC 说话时调用 */
  function onTalk(p, npcKey) {
    var q = current(p);
    if (!q) return false;
    if (q.goal.type === 'talk' && q.goal.npc === npcKey && p.quest.progress === 0) {
      p.quest.progress = 1;
      return true;
    }
    return false;
  }

  /** 这个 NPC 身上有没有可交的任务 */
  function canTurnInAt(p, npcKey) {
    var q = current(p);
    return !!q && q.turnIn === npcKey && complete(p);
  }

  /**
   * 交任务：发奖励、推进到下一条。
   * 返回 { quest, exp, gold, items, levels, overflow }。
   * overflow 是背包装不下、掉在地上的物品，交给调用方处理。
   */
  function turnIn(p, npcKey) {
    if (!canTurnInAt(p, npcKey)) return null;
    var q = current(p);
    var r = q.reward || {};
    var overflow = [];

    p.gold += r.gold || 0;
    var levels = ZX.Player.gainExp(p, r.exp || 0);

    if (r.items) {
      for (var i = 0; i < r.items.length; i++) {
        var res = ZX.Inventory.add(p.bag, r.items[i], 1);
        p.bag = res.bag;
        if (res.added < 1) overflow.push(r.items[i]);
      }
    }

    p.quest.done[q.key] = true;
    var next = ZX.QUESTS.next(q.key);
    p.quest.current = next ? next.key : null;
    p.quest.progress = 0;

    return {
      quest: q,
      exp: r.exp || 0,
      gold: r.gold || 0,
      items: r.items || [],
      levels: levels,
      overflow: overflow,
      next: next,
    };
  }

  /** 这个 NPC 是不是当前任务的发布人（对话框里要显示任务简介） */
  function isGiver(p, npcKey) {
    var q = current(p);
    // 用 goalMet 而不是 complete：已经打够了就别再把任务简介念一遍，
    // 哪怕等级还差着——那时该说的是"去练级"，不是"去打怪"
    return !!q && q.giver === npcKey && !goalMet(p);
  }

  /**
   * 站在复命 NPC 面前，目标也达成了，就差等级。
   * 这种情况必须单独说一句——否则玩家跑过来只收到一句闲聊，
   * 完全不知道自己卡在哪儿。
   */
  function waitingForLevel(p, npcKey) {
    var q = current(p);
    return !!q && q.turnIn === npcKey && goalMet(p) && levelShort(p);
  }

  /**
   * 当前任务要打的怪 id。没有击杀类目标、或已经打够了才返回 null。
   *
   * 渲染层拿它在场上把目标怪标出来——不然玩家面对一地长得都差不多的妖兽，
   * 根本不知道该打哪只，只能挨个试。
   */
  function targetMonsterId(p) {
    var q = current(p);
    if (!q || goalMet(p)) return null;
    if (q.goal.type === 'kill') return q.goal.monster;
    if (q.goal.type === 'boss') return q.goal.id;
    return null;
  }

  /**
   * 当前任务该去哪张图。返回 { [地图key]: 'hunt' | 'turnin' }。
   *
   * 山河图面板拿它标颜色——目标怪不在当前这张图时，玩家原本完全不知道该去哪儿，
   * 只能一张张图挨着翻。已经打够了就改指向复命的 NPC 所在地。
   */
  function targetMaps(p) {
    var out = {};
    var q = current(p);
    if (!q) return out;

    // 打够了就指向复命地点——哪怕等级还差着。
    // 去的路上顺手就练上去了，总比让人对着已经杀够的怪继续刷强
    if (goalMet(p)) {
      var npc = ZX.NPCS.byKey(q.turnIn);
      if (npc) out[npc.map] = 'turnin';
      return out;
    }

    var id = targetMonsterId(p);
    if (!id) {
      // 没有击杀类目标（比如找人说话），那就指向该找的那个 NPC
      if (q.goal.type === 'talk') {
        var who = ZX.NPCS.byKey(q.goal.npc);
        if (who) out[who.map] = 'turnin';
      }
      return out;
    }

    var maps = ZX.MAPS.all;
    for (var i = 0; i < maps.length; i++) {
      var m = maps[i];
      var found = !!(m.boss && m.boss.id === id);
      if (!found && m.spawns) {
        for (var j = 0; j < m.spawns.length; j++) {
          if (m.spawns[j].id === id) {
            found = true;
            break;
          }
        }
      }
      if (found) out[m.key] = 'hunt';
    }
    return out;
  }

  ZX.Quest = {
    current: current,
    targetMaps: targetMaps,
    levelShort: levelShort,
    goalMet: goalMet,
    complete: complete,
    onKill: onKill,
    onTalk: onTalk,
    canTurnInAt: canTurnInAt,
    turnIn: turnIn,
    isGiver: isGiver,
    waitingForLevel: waitingForLevel,
    targetMonsterId: targetMonsterId,
  };
})(window);
