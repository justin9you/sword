/**
 * 音效：全部用 WebAudio 实时合成，项目里一个音频文件都没有。
 *
 * iOS 要求音频上下文必须由用户手势创建，所以 unlock() 挂在第一次点击/按键上。
 * 合成不出来（老浏览器、被策略拦了）就整个静音，不影响游戏。
 */
(function (global) {
  'use strict';

  var ZX = global.ZX;

  function Audio() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
    this.broken = false;
  }

  Audio.prototype.unlock = function () {
    if (this.ctx || this.broken) return;
    try {
      var Ctor = global.AudioContext || global.webkitAudioContext;
      if (!Ctor) {
        this.broken = true;
        return;
      }
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
    } catch (e) {
      this.broken = true;
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        this.ctx.resume();
      } catch (e2) {
        // 恢复失败就静音
      }
    }
  };

  /** 一个音：波形 + 频率滑音 + 指数衰减包络 */
  Audio.prototype.tone = function (opt) {
    if (!this.enabled || this.broken) return;
    this.unlock();
    if (!this.ctx) return;
    try {
      var t = this.ctx.currentTime;
      var osc = this.ctx.createOscillator();
      var gain = this.ctx.createGain();
      osc.type = opt.type || 'sine';
      osc.frequency.setValueAtTime(opt.from, t);
      if (opt.to && opt.to !== opt.from) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, opt.to), t + opt.dur);
      }
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(opt.vol || 0.2, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + opt.dur);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + opt.dur + 0.02);
    } catch (e) {
      this.broken = true;
    }
  };

  /** 噪声：用来做打击感和爆炸 */
  Audio.prototype.noise = function (dur, vol, freq) {
    if (!this.enabled || this.broken) return;
    this.unlock();
    if (!this.ctx) return;
    try {
      var t = this.ctx.currentTime;
      var len = Math.floor(this.ctx.sampleRate * dur);
      var buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      }
      var src = this.ctx.createBufferSource();
      src.buffer = buf;
      var filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = freq || 1400;
      var gain = this.ctx.createGain();
      gain.gain.value = vol || 0.16;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      src.start(t);
    } catch (e) {
      this.broken = true;
    }
  };

  var PLAYS = {
    slash: function (a) {
      a.noise(0.13, 0.13, 2600);
      a.tone({ type: 'square', from: 520, to: 260, dur: 0.09, vol: 0.07 });
    },
    hit: function (a) {
      a.noise(0.09, 0.12, 900);
    },
    cast: function (a) {
      a.tone({ type: 'triangle', from: 380, to: 760, dur: 0.16, vol: 0.12 });
    },
    nova: function (a) {
      a.noise(0.32, 0.2, 700);
      a.tone({ type: 'sawtooth', from: 200, to: 60, dur: 0.34, vol: 0.14 });
    },
    heal: function (a) {
      a.tone({ type: 'sine', from: 620, to: 980, dur: 0.26, vol: 0.13 });
    },
    bell: function (a) {
      a.tone({ type: 'sine', from: 1180, to: 780, dur: 0.5, vol: 0.12 });
    },
    levelup: function (a) {
      a.tone({ type: 'sine', from: 520, to: 780, dur: 0.18, vol: 0.16 });
      setTimeout(function () {
        a.tone({ type: 'sine', from: 780, to: 1180, dur: 0.34, vol: 0.16 });
      }, 150);
    },
    loot: function (a) {
      a.tone({ type: 'triangle', from: 880, to: 1320, dur: 0.11, vol: 0.11 });
    },
    coin: function (a) {
      a.tone({ type: 'square', from: 1320, to: 1760, dur: 0.07, vol: 0.08 });
    },
    die: function (a) {
      a.tone({ type: 'sawtooth', from: 320, to: 60, dur: 0.7, vol: 0.18 });
      a.noise(0.5, 0.16, 500);
    },
    quest: function (a) {
      a.tone({ type: 'sine', from: 660, to: 880, dur: 0.14, vol: 0.14 });
      setTimeout(function () {
        a.tone({ type: 'sine', from: 880, to: 1100, dur: 0.22, vol: 0.14 });
      }, 120);
    },
    portal: function (a) {
      a.tone({ type: 'sine', from: 240, to: 720, dur: 0.42, vol: 0.13 });
    },
    error: function (a) {
      a.tone({ type: 'square', from: 220, to: 160, dur: 0.11, vol: 0.09 });
    },
    boss: function (a) {
      a.tone({ type: 'sawtooth', from: 120, to: 70, dur: 0.9, vol: 0.2 });
      a.noise(0.7, 0.18, 400);
    },
  };

  Audio.prototype.play = function (name) {
    var fn = PLAYS[name];
    if (fn) fn(this);
  };

  ZX.Audio = Audio;
})(window);
