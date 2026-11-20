'use strict';

/* 纯程序化音效，零外部资源 */
const Sfx = {
  ctx: null,
  master: null,
  muted: false,
  _lastHit: 0,
  _lastShoot: 0,
  _lastClack: 0,

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.3;
      this.master.connect(this.ctx.destination);
    } catch (e) {
      this.ctx = null;
    }
  },

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.3;
    return this.muted;
  },

  _tone(freqStart, freqEnd, dur, type, vol, delay) {
    const c = this.ctx;
    const t0 = c.currentTime + (delay || 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freqStart, t0);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.012, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  },

  play(name) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;

    switch (name) {
      case 'shoot':
        if (now - this._lastShoot < 0.035) return;
        this._lastShoot = now;
        this._tone(900, 480, 0.06, 'triangle', 0.05);
        break;

      case 'hit':
        if (now - this._lastHit < 0.03) return;
        this._lastHit = now;
        this._tone(340, 160, 0.045, 'square', 0.035);
        break;

      case 'kill':
        this._tone(200, 60, 0.11, 'triangle', 0.09);
        break;

      case 'pick':
        this._tone(1250, 1700, 0.05, 'sine', 0.035);
        break;

      case 'hurt':
        this._tone(180, 55, 0.26, 'sawtooth', 0.13);
        break;

      case 'dash':
        this._tone(320, 700, 0.1, 'sine', 0.06);
        break;

      case 'zap':
        this._tone(1400, 420, 0.1, 'square', 0.05);
        break;

      case 'boom':
        this._tone(140, 34, 0.3, 'sine', 0.14);
        break;

      case 'level':
        this._tone(523, 523, 0.12, 'sine', 0.09, 0);
        this._tone(659, 659, 0.12, 'sine', 0.09, 0.09);
        this._tone(784, 784, 0.2, 'sine', 0.1, 0.18);
        break;

      case 'boss':
        this._tone(90, 52, 0.5, 'sawtooth', 0.1);
        break;

      case 'win':
        this._tone(523, 523, 0.14, 'triangle', 0.1, 0);
        this._tone(659, 659, 0.14, 'triangle', 0.1, 0.13);
        this._tone(784, 784, 0.14, 'triangle', 0.1, 0.26);
        this._tone(1046, 1046, 0.4, 'triangle', 0.11, 0.39);
        break;

      case 'dead':
        this._tone(400, 60, 0.7, 'sawtooth', 0.12);
        break;

      case 'clack':
        if (now - this._lastClack < 0.04) return;
        this._lastClack = now;
        this._tone(1100, 520, 0.04, 'triangle', 0.06);
        break;

      case 'zero':
        this._tone(880, 1320, 0.08, 'sine', 0.065);
        break;

      case 'beacon':
        this._tone(587, 587, 0.1, 'sine', 0.08, 0);
        this._tone(880, 880, 0.16, 'sine', 0.09, 0.08);
        break;
    }
  },
};
