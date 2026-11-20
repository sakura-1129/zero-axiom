'use strict';

/* ══════════════════════════════════════════════
   球球肉鸽 · 数值风暴 (v2.0 几何物理与肉鸽构筑重构)
   ══════════════════════════════════════════════ */

const keys = Object.create(null);
const RECORD_KEY = 'orbrogue_record_v1';
const DIFF_KEY = 'orbrogue_diff_v1';
const ORB_KEY = 'orbrogue_orb_v1';

const Game = {
  state: 'menu',
  canvas: null,
  ctx: null,
  dpr: 1,
  W: 0,
  H: 0,
  lastTs: 0,

  time: 0,
  cam: { x: 0, y: 0 },
  shake: 0,
  flash: 0,

  player: null,
  enemies: [],
  bullets: [],
  ebullets: [],
  xpOrbs: [],
  pickups: [],
  particles: [],
  texts: [],
  fx: [],
  orbPos: [],
  beacons: [],
  decoys: [],
  implosions: [],

  kills: 0,
  dmgDealt: 0,
  dps: 0,
  dpsT: 0,

  level: 1,
  xp: 0,
  xpNeed: 14,
  pendingLevel: 0,
  pendingRelic: 0,
  modalMode: 'skill',

  spawnAcc: 0,
  bossIdx: 0,
  beaconIdx: 0,
  waveIdx: 0,
  boss: null,
  nextId: 1,
  owned: {},
  ownedRelics: {},
  choices: [],
  sepTick: 0,
  wantDash: false,

  menuT: 0,
  menuBalls: [],
  orb: 'cobalt',
  difficulty: 'normal',
  record: { time: 0, kills: 0, level: 1, byDiff: {} },

  /* ───────── 流程 ───────── */
  setOrb(id) {
    if (!ORBS[id]) return;
    this.orb = id;
    try { localStorage.setItem(ORB_KEY, id); } catch (err) { /* 忽略 */ }
    if (UI.syncOrb) UI.syncOrb();
  },

  setDifficulty(id) {
    if (!DIFFICULTIES[id]) return;
    this.difficulty = id;
    try { localStorage.setItem(DIFF_KEY, id); } catch (err) { /* 忽略 */ }
    if (UI.syncDifficulty) UI.syncDifficulty();
    if (UI.updateRecord) UI.updateRecord(this.record);
  },

  start() {
    resetRun();
    this.state = 'playing';
    UI.showGame();
  },

  toTitle() {
    this.state = 'menu';
    resetRun();
    this.player = null;
    UI.showTitle(this.record);
  },

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    UI.hidePause();
  },

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      UI.showPause();
    } else if (this.state === 'paused') {
      this.resume();
    }
  },

  openLevelUp() {
    const choices = rollSkills(3);
    if (choices.length === 0) {
      this.pendingLevel = 0;
      if (this.pendingRelic > 0) { this.openRelicChoice(); return; }
      this.state = 'playing';
      return;
    }
    this.modalMode = 'skill';
    this.state = 'levelup';
    this.choices = choices;
    UI.showLevelUp(choices, 'skill');
    Sfx.play('level');
  },

  openRelicChoice() {
    const choices = rollRelics(3);
    if (choices.length === 0) {
      this.pendingRelic = 0;
      if (this.pendingLevel > 0) { this.openLevelUp(); return; }
      this.state = 'playing';
      return;
    }
    this.modalMode = 'relic';
    this.state = 'levelup';
    this.choices = choices;
    UI.showLevelUp(choices, 'relic');
    Sfx.play('beacon');
  },

  chooseSkill(i) {
    if (this.state !== 'levelup') return;
    const c = this.choices[i];
    if (!c) return;
    this.choices = [];

    if (this.modalMode === 'relic') {
      const relic = c.relic;
      this.ownedRelics[relic.id] = true;
      relic.apply(this.player);
      this.pendingRelic = Math.max(0, this.pendingRelic - 1);
      UI.hideLevelUp();
      UI.syncDock(true);
      Sfx.play('level');
      addText(this.player.x, this.player.y - 42, '✦ ' + relic.name, relic.color, 20);
    } else {
      const p = this.player;
      const oldDmg = Math.round(effectiveDmg());
      const oldHp = p.maxHp;
      const newLv = (this.owned[c.skill.id] || 0) + 1;
      this.owned[c.skill.id] = newLv;
      c.skill.apply(p, newLv);
      this.pendingLevel = Math.max(0, this.pendingLevel - 1);
      UI.hideLevelUp();
      UI.syncDock(true);
      Sfx.play('level');

      // 升级微震波 + 直观属性跃升飘字，强化每一次成长的爽感
      const ringCol = SKILL_TYPES[c.skill.type] ? SKILL_TYPES[c.skill.type].color : '#0055FF';
      Game.fx.push({ kind: 'ring', x: p.x, y: p.y, r: 8, maxR: 135, life: 0.30, max: 0.30, color: ringCol, dead: false });
      for (let k = 0; k < Game.enemies.length; k++) {
        const e = Game.enemies[k];
        if (e.dead) continue;
        const rr = 135 + e.r;
        if (distSq(p.x, p.y, e.x, e.y) <= rr * rr) {
          const dd = Math.sqrt(distSq(e.x, e.y, p.x, p.y)) || 1;
          const kb = effectiveKb(190);
          e.kx += ((e.x - p.x) / dd) * kb;
          e.ky += ((e.y - p.y) / dd) * kb;
        }
      }

      const newDmg = Math.round(effectiveDmg());
      if (newLv >= c.skill.maxLv && c.skill.capstoneDesc) {
        addText(p.x, p.y - 46, '★ 大成 · ' + c.skill.name, '#FFB800', 22, { crit: true, vy: -82, life: 1.0 });
      } else if (c.skill.midLv && newLv === c.skill.midLv && c.skill.midDesc) {
        addText(p.x, p.y - 44, '◆ 中阶 · ' + c.skill.name, '#0055FF', 20, { crit: true, vy: -78, life: 0.98 });
      } else if (newDmg > oldDmg) {
        addText(p.x, p.y - 42, '▲ ' + c.skill.name + ' · 伤 ' + fmt(oldDmg) + '→' + fmt(newDmg), ringCol, 19, { vy: -76, life: 0.95 });
      } else if (p.maxHp > oldHp) {
        addText(p.x, p.y - 42, '▲ ' + c.skill.name + ' · 血 ' + fmt(oldHp) + '→' + fmt(p.maxHp), ringCol, 19, { vy: -76, life: 0.95 });
      } else {
        addText(p.x, p.y - 42, '▲ ' + c.skill.name + ' LV.' + newLv, ringCol, 18, { vy: -72, life: 0.9 });
      }
    }

    if (this.pendingRelic > 0) {
      const self = this;
      setTimeout(function () {
        if (self.state === 'levelup') self.openRelicChoice();
      }, 140);
    } else if (this.pendingLevel > 0) {
      const self = this;
      setTimeout(function () {
        if (self.state === 'levelup') self.openLevelUp();
      }, 140);
    } else {
      this.state = 'playing';
    }
  },

  gameOver(win) {
    if (this.state === 'dead' || this.state === 'win') return;
    this.state = win ? 'win' : 'dead';
    saveRecord();
    UI.syncHud(1, true);
    UI.showOver(win);
    Sfx.play(win ? 'win' : 'dead');
  },
};

/* ══════════════ 初始化 ══════════════ */
function init() {
  const cv = document.getElementById('game');
  Game.canvas = cv;
  Game.ctx = cv.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
  bindInput();
  loadRecord();
  UI.init();
  buildMenuBalls();
  UI.showTitle(Game.record);
  requestAnimationFrame(loop);
}

function resize() {
  Game.dpr = Math.min(window.devicePixelRatio || 1, 2);
  Game.W = window.innerWidth;
  Game.H = window.innerHeight;
  const cv = Game.canvas;
  if (!cv) return;
  cv.width = Math.floor(Game.W * Game.dpr);
  cv.height = Math.floor(Game.H * Game.dpr);
  cv.style.width = Game.W + 'px';
  cv.style.height = Game.H + 'px';
}

function bindInput() {
  window.addEventListener('keydown', function (e) {
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'arrowup' || k === 'arrowdown' || k === 'arrowleft' || k === 'arrowright') {
      e.preventDefault();
    }

    const first = !keys[k];
    keys[k] = true;
    if (!first) return;

    if (k === ' ') {
      if (Game.state === 'playing') Game.wantDash = true;
      else if (Game.state === 'menu') Game.start();
      return;
    }
    if (k === 'enter' && Game.state === 'menu') { Game.start(); return; }
    if (k === 'p' || k === 'escape') { Game.togglePause(); return; }
    if (k === 'm') { Sfx.toggleMute(); UI.syncMute(); return; }

    if (Game.state === 'menu') {
      if (k === '1') Game.setDifficulty('easy');
      else if (k === '2') Game.setDifficulty('normal');
      else if (k === '3') Game.setDifficulty('hard');
    } else if (Game.state === 'levelup') {
      if (k === '1') Game.chooseSkill(0);
      else if (k === '2') Game.chooseSkill(1);
      else if (k === '3') Game.chooseSkill(2);
    }
  });

  window.addEventListener('keyup', function (e) {
    keys[e.key.toLowerCase()] = false;
  });

  window.addEventListener('blur', function () {
    for (const k in keys) keys[k] = false;
  });
}

function loadRecord() {
  try {
    const savedOrb = localStorage.getItem(ORB_KEY);
    if (savedOrb && ORBS[savedOrb]) Game.orb = savedOrb;
    const savedDiff = localStorage.getItem(DIFF_KEY);
    if (savedDiff && DIFFICULTIES[savedDiff]) Game.difficulty = savedDiff;
    const raw = localStorage.getItem(RECORD_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') {
        Game.record.time = obj.time || 0;
        Game.record.kills = obj.kills || 0;
        Game.record.level = obj.level || 1;
        if (obj.byDiff && typeof obj.byDiff === 'object') {
          Game.record.byDiff = obj.byDiff;
        }
      }
    }
  } catch (err) { /* 忽略 */ }
}

function saveRecord() {
  const r = Game.record;
  if (!r.byDiff || typeof r.byDiff !== 'object') r.byDiff = {};
  const dId = Game.difficulty || 'normal';
  const dr = r.byDiff[dId] || (r.byDiff[dId] = { time: 0, kills: 0, level: 1 });
  let changed = false;
  if (Game.time > r.time) { r.time = Game.time; changed = true; }
  if (Game.kills > r.kills) { r.kills = Game.kills; changed = true; }
  if (Game.level > r.level) { r.level = Game.level; changed = true; }
  if (Game.time > dr.time) { dr.time = Game.time; changed = true; }
  if (Game.kills > dr.kills) { dr.kills = Game.kills; changed = true; }
  if (Game.level > dr.level) { dr.level = Game.level; changed = true; }
  if (changed) {
    try { localStorage.setItem(RECORD_KEY, JSON.stringify(r)); } catch (err) { /* 忽略 */ }
  }
}

/* ══════════════ 一局重置 ══════════════ */
function resetRun() {
  const c = CFG.player;

  Game.time = 0;
  Game.kills = 0;
  Game.dmgDealt = 0;
  Game.dps = 0;
  Game.dpsT = 0;
  Game.level = 1;
  Game.xp = 0;
  Game.xpNeed = xpNeedFor(1);
  Game.pendingLevel = 0;
  Game.pendingRelic = 0;
  Game.modalMode = 'skill';
  Game.spawnAcc = 0;
  Game.bossIdx = 0;
  Game.beaconIdx = 0;
  Game.waveIdx = 0;
  Game.boss = null;
  Game.nextId = 1;
  Game.owned = {};
  Game.ownedRelics = {};
  Game.choices = [];
  Game.shake = 0;
  Game.flash = 0;
  Game.sepTick = 0;
  Game.wantDash = false;
  Game.orbPos.length = 0;
  Game.enemies.length = 0;
  Game.bullets.length = 0;
  Game.ebullets.length = 0;
  Game.xpOrbs.length = 0;
  Game.pickups.length = 0;
  Game.particles.length = 0;
  Game.texts.length = 0;
  Game.fx.length = 0;
  Game.beacons.length = 0;
  Game.decoys.length = 0;
  Game.implosions.length = 0;
  Game.cam.x = 0;
  Game.cam.y = 0;

  const orb = getOrb();
  Game.player = {
    x: 0, y: 0, vx: 0, vy: 0, r: c.r,
    orbId: orb.id,
    coreTier: 1,
    hp: orb.maxHp, maxHp: orb.maxHp,
    iframe: 1, dashT: 0, dashCd: 0,
    charges: 1, maxCharges: 1,
    overclockT: 0,
    beaconBuffT: 0,
    dashHit: new Set(),
    shotCounter: 0,
    xpPickCount: 0,
    shieldActive: false,
    shieldCd: 0,
    twinAngle: 0,
    twinFireT: 0,
    fireT: 0, facing: -Math.PI / 2,
    trail: [],
    relics: {
      twinCore: false,
      singularityMagnet: false,
      antimatterShield: false,
    },
    stats: {
      dmg: c.dmg + (orb.dmgBonus || 0),
      dmgMul: 1,
      fireInterval: c.fireInterval * orb.fireMul,
      bullets: c.bullets,
      spread: orb.spreadOverride || c.spread,
      bulletR: c.bulletR,
      pierce: 0,
      crit: c.crit + orb.critBonus,
      critMult: c.critMult,
      speed: c.speed * orb.speedMul,
      regen: 0,
      regenPct: 0,
      pickup: c.pickup,
      xpMul: 1,
      armor: 0,
      dashCd: orb.cd,
      slow: 0,
      vamp: 0,
      vampPct: 0,
      split: 0,
      bounce: 0,
      refract: 0,
      momentum: 0,
      pinball: 0,
      exactHunter: 0,
      midDmg: false,
      midRate: false,
      midMulti: false,
      midPierce: false,
      midCrit: false,
      midSplit: false,
      midBounce: false,
      midOrb: false,
      midChain: false,
      midShock: false,
      midMissile: false,
      capDmg: false,
      capRate: false,
      capMulti: false,
      capPierce: false,
      capCrit: false,
      capSplit: false,
      capBounce: false,
      capOrb: false,
      capChain: false,
      capShock: false,
      capMissile: false,
      capDash: false,
      orbs: 0, orbDmg: 1, orbPhase: 0,
      chainLv: 0, chainT: 2.2, chainDmg: 1.5, chainJumps: 0,
      shockLv: 0, shockT: 2.4, shockDmg: 2.5, shockR: 88,
      missileLv: 0, missileT: 1.6, missileDmg: 1,
    },
  };
}

/* ══════════════ 全局有效伤害、核心阶数与升级预览 ══════════════ */
const TIER_ROMANS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

function tierRoman(tier) {
  return TIER_ROMANS[(tier || 1) - 1] || String(tier);
}

function currentSpeedMul() {
  const p = Game.player;
  if (!p) return 1;
  let m = 1;
  if (p.overclockT > 0) m *= 1.15;
  if (p.beaconBuffT > 0) m *= 1.50;
  return m;
}

function calcPlayerEffectiveDmg(p, baseOverride) {
  if (!p) return 1;
  const s = p.stats;
  let mul = s.dmgMul;
  if (s.momentum > 0) {
    const curSp = s.speed * currentSpeedMul();
    const bonusRatio = Math.max(0, curSp / CFG.player.speed - 1);
    mul *= 1 + (bonusRatio / 0.1) * 0.12 * s.momentum;
  }
  const base = baseOverride !== undefined ? baseOverride : s.dmg;
  return Math.max(0.5, base * mul);
}

function effectiveDmg(baseOverride) {
  return calcPlayerEffectiveDmg(Game.player, baseOverride);
}

/** 计算技能卡片「当前 → 升级后」数值直观对比 */
function previewSkillDelta(skill, nextLv) {
  const p = Game.player;
  if (!p || !skill) return '';
  const clone = {
    maxHp: p.maxHp,
    hp: p.hp,
    stats: Object.assign({}, p.stats),
  };
  const dBefore = Math.round(calcPlayerEffectiveDmg(p));
  skill.apply(clone, nextLv);
  const dAfter = Math.round(calcPlayerEffectiveDmg(clone));

  const diffs = [];
  if (dAfter !== dBefore) {
    diffs.push('单发伤 ' + fmt(dBefore) + ' → ' + fmt(dAfter));
  }
  if (clone.maxHp !== p.maxHp) {
    diffs.push('生命上限 ' + fmt(p.maxHp) + ' → ' + fmt(clone.maxHp));
  }
  if (Math.abs(clone.stats.fireInterval - p.stats.fireInterval) > 0.005) {
    const r0 = (1 / p.stats.fireInterval).toFixed(2);
    const r1 = (1 / clone.stats.fireInterval).toFixed(2);
    diffs.push('射速 ' + r0 + '/s → ' + r1 + '/s');
  }
  if (clone.stats.crit > p.stats.crit + 0.005) {
    diffs.push('暴击 ' + Math.round(p.stats.crit * 100) + '% → ' + Math.round(clone.stats.crit * 100) + '%');
  }
  if (clone.stats.critMult > p.stats.critMult + 0.05) {
    diffs.push('暴伤 ×' + p.stats.critMult.toFixed(1) + ' → ×' + clone.stats.critMult.toFixed(1));
  }
  if (clone.stats.bullets > p.stats.bullets) {
    diffs.push('弹数 ' + p.stats.bullets + ' → ' + clone.stats.bullets);
  }
  if (clone.stats.pierce > p.stats.pierce) {
    diffs.push('穿透 ' + p.stats.pierce + ' → ' + clone.stats.pierce);
  }
  if (clone.stats.orbs > p.stats.orbs) {
    diffs.push('卫星 ' + p.stats.orbs + ' → ' + clone.stats.orbs);
  }
  if (clone.stats.speed > p.stats.speed + 1) {
    diffs.push('移速 ' + Math.round(p.stats.speed) + ' → ' + Math.round(clone.stats.speed));
  }
  if (clone.stats.armor > p.stats.armor + 0.01) {
    diffs.push('减伤 ' + Math.round(p.stats.armor * 100) + '% → ' + Math.round(clone.stats.armor * 100) + '%');
  }
  if (clone.stats.regenPct > (p.stats.regenPct || 0)) {
    const h0 = (p.stats.regen + p.maxHp * (p.stats.regenPct || 0)).toFixed(1);
    const h1 = (clone.stats.regen + clone.maxHp * clone.stats.regenPct).toFixed(1);
    diffs.push('秒回 ' + h0 + ' → ' + h1);
  }
  return diffs.slice(0, 2).join(' · ');
}

function effectiveKb(base) {
  const p = Game.player;
  if (!p) return base;
  const orb = getOrb(p.orbId);
  return base * (orb.kbMul || 1) * (1 + 0.45 * p.stats.pinball);
}

/* ══════════════ 主循环 ══════════════ */
function loop(ts) {
  requestAnimationFrame(loop);
  if (!Game.lastTs) Game.lastTs = ts;
  let dt = (ts - Game.lastTs) / 1000;
  Game.lastTs = ts;
  if (!(dt > 0)) dt = 0;
  if (dt > 0.05) dt = 0.05;

  if (Game.state === 'playing') update(dt);
  else if (Game.state === 'menu') Game.menuT += dt;

  render();
}

/* ══════════════ 更新 ══════════════ */
function update(dt) {
  const p = Game.player;
  if (!p) return;

  Game.time += dt;

  updatePlayer(dt);
  updateTwinCore(dt);
  updateDecoys(dt);
  updateImplosions(dt);
  updateCamera(dt);
  updateSpawner(dt);
  updateBeacons(dt);
  updateEnemies(dt);
  updateBullets(dt);
  updateOrbs(dt);
  updateSub(dt);
  updateEBullets(dt);
  updateDrops(dt);
  updateParticles(dt);
  updateTexts(dt);
  updateFx(dt);

  Game.shake = Math.max(0, Game.shake * (1 - 9 * dt) - 6 * dt);
  Game.flash = Math.max(0, Game.flash - dt * 2.6);

  Game.dpsT += dt;
  if (Game.dpsT >= 0.25) {
    const inst = Game.dmgDealt / Game.dpsT;
    Game.dps = Game.dps * 0.65 + inst * 0.35;
    Game.dmgDealt = 0;
    Game.dpsT = 0;
  }

  UI.syncHud(dt);

  if (p.hp <= 0) { Game.gameOver(false); return; }
  if (Game.time >= CFG.duration) { Game.gameOver(true); return; }
  if (Game.pendingRelic > 0) { Game.openRelicChoice(); return; }
  if (Game.pendingLevel > 0) { Game.openLevelUp(); return; }
}

function updatePlayer(dt) {
  const p = Game.player;
  const s = p.stats;
  const c = CFG.player;

  let ax = 0, ay = 0;
  if (keys['a'] || keys['arrowleft']) ax -= 1;
  if (keys['d'] || keys['arrowright']) ax += 1;
  if (keys['w'] || keys['arrowup']) ay -= 1;
  if (keys['s'] || keys['arrowdown']) ay += 1;
  const len = Math.sqrt(ax * ax + ay * ay);
  if (len > 0) { ax /= len; ay /= len; }

  // 主动技能充能恢复
  const effectiveCd = p.beaconBuffT > 0 ? Math.min(0.25, s.dashCd) : s.dashCd;
  if (p.charges < p.maxCharges) {
    p.dashCd -= dt;
    if (p.dashCd <= 0) {
      p.charges++;
      p.dashCd = p.charges < p.maxCharges ? effectiveCd : 0;
    }
  } else {
    p.dashCd = 0;
  }

  if (Game.wantDash) {
    Game.wantDash = false;
    if (p.charges > 0) triggerOrbSkill();
  }

  let dirX = ax;
  let dirY = ay;
  if (len === 0 && p.dashT > 0) {
    dirX = Math.cos(p.facing);
    dirY = Math.sin(p.facing);
  }

  const speed = s.speed * currentSpeedMul() * (p.dashT > 0 ? c.dashMul : 1);
  const accel = p.dashT > 0 ? 28 : 15;
  const k = Math.min(1, accel * dt);
  p.vx += (dirX * speed - p.vx) * k;
  p.vy += (dirY * speed - p.vy) * k;
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  if (len > 0) p.facing = Math.atan2(ay, ax);

  if (p.dashT > 0) {
    p.dashT -= dt;
    p.trail.push({ x: p.x, y: p.y, life: 0.28 });

    // 疾影球相位切割：冲刺路径撞到的敌球受到切割伤害并向两侧弹开
    if (p.orbId === 'cobalt') {
      const sliceDmg = Math.max(1, Math.round(effectiveDmg() * 1.5));
      const dashLen = Math.hypot(p.vx, p.vy) || 1;
      const dxu = p.vx / dashLen;
      const dyu = p.vy / dashLen;
      for (let i = 0; i < Game.enemies.length; i++) {
        const e = Game.enemies[i];
        if (e.dead || p.dashHit.has(e.id)) continue;
        const rr = p.r + e.r + 6;
        if (distSq(p.x, p.y, e.x, e.y) <= rr * rr) {
          p.dashHit.add(e.id);
          damageEnemy(e, sliceDmg, Math.random() < s.crit, { x: p.x, y: p.y, vx: p.vx, vy: p.vy });
          const side = ((e.x - p.x) * -dyu + (e.y - p.y) * dxu) >= 0 ? 1 : -1;
          const kb = effectiveKb(280);
          e.kx += (-dyu * side + dxu * 0.4) * kb;
          e.ky += (dxu * side + dyu * 0.4) * kb;
        }
      }
    }
  }
  for (let i = p.trail.length - 1; i >= 0; i--) {
    p.trail[i].life -= dt;
    if (p.trail[i].life <= 0) p.trail.splice(i, 1);
  }

  p.iframe -= dt;
  if (p.overclockT > 0) p.overclockT = Math.max(0, p.overclockT - dt);
  if (p.beaconBuffT > 0) p.beaconBuffT = Math.max(0, p.beaconBuffT - dt);

  if (p.relics.antimatterShield && !p.shieldActive) {
    p.shieldCd -= dt;
    if (p.shieldCd <= 0) {
      p.shieldActive = true;
      addText(p.x, p.y - p.r - 18, '护盾就绪', '#E63312', 14);
    }
  }

  const totalRegen = s.regen + p.maxHp * (s.regenPct || 0);
  if (totalRegen > 0 && p.hp < p.maxHp) {
    p.hp = Math.min(p.maxHp, p.hp + totalRegen * dt);
  }

  let fireMul = 1;
  if (p.overclockT > 0) fireMul *= 0.60;
  if (p.beaconBuffT > 0) fireMul *= 0.67;

  p.fireT -= dt;
  if (p.fireT <= 0) {
    fireWeapon();
    p.fireT = Math.max(s.capRate ? 0.04 : 0.055, s.fireInterval * fireMul);
  }
}

function updateTwinCore(dt) {
  const p = Game.player;
  if (!p || !p.relics.twinCore) return;
  p.twinAngle += dt * 1.9;
  p.twinFireT -= dt;
  const tx = p.x + Math.cos(p.twinAngle) * 40;
  const ty = p.y + Math.sin(p.twinAngle) * 40;
  if (p.twinFireT <= 0) {
    p.twinFireT = Math.max(0.11, p.stats.fireInterval * 1.35);
    const tgt = findNearestEnemy(tx, ty, 780);
    if (tgt) {
      const ang = aimAngle({ x: tx, y: ty }, tgt);
      spawnBullet(tx, ty, ang, {
        dmg: Math.max(1, Math.round(effectiveDmg() * 0.55)),
        r: Math.max(6, Math.round(p.stats.bulletR * 0.72)),
        pierce: Math.floor(p.stats.pierce * 0.5),
        bounce: 0,
        split: 0,
        color: '#D97706',
      });
    }
  }
}

function updateDecoys(dt) {
  for (let i = Game.decoys.length - 1; i >= 0; i--) {
    const d = Game.decoys[i];
    d.life -= dt;
    if (d.life <= 0) {
      d.dead = true;
      Game.fx.push({ kind: 'ring', x: d.x, y: d.y, r: 8, maxR: 140, life: 0.28, max: 0.28, color: '#0055FF', dead: false });
      for (let j = 0; j < Game.enemies.length; j++) {
        const e = Game.enemies[j];
        if (e.dead) continue;
        const rr = 140 + e.r;
        if (distSq(d.x, d.y, e.x, e.y) <= rr * rr) {
          damageEnemy(e, d.dmg, false, { x: d.x, y: d.y });
          const dist = Math.sqrt(distSq(e.x, e.y, d.x, d.y)) || 1;
          const kb = effectiveKb(340);
          e.kx += ((e.x - d.x) / dist) * kb;
          e.ky += ((e.y - d.y) / dist) * kb;
        }
      }
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * TAU;
        addParticle(d.x, d.y, Math.cos(a) * 190, Math.sin(a) * 190, 2.8, '#0055FF', 0.24, 'square', a, 10);
      }
      Sfx.play('boom');
    }
  }
  compact(Game.decoys);
}

function updateImplosions(dt) {
  for (let i = Game.implosions.length - 1; i >= 0; i--) {
    const imp = Game.implosions[i];
    imp.t -= dt;
    if (imp.t <= 0) {
      imp.dead = true;
      const p = Game.player;
      const s = p ? p.stats : null;
      const cx = p ? p.x : imp.x;
      const cy = p ? p.y : imp.y;
      Game.fx.push({ kind: 'ring', x: cx, y: cy, r: 10, maxR: imp.r, life: 0.36, max: 0.36, color: '#E63312', dead: false });
      for (let j = 0; j < Game.enemies.length; j++) {
        const e = Game.enemies[j];
        if (e.dead) continue;
        const rr = imp.r + e.r;
        if (distSq(cx, cy, e.x, e.y) < rr * rr) {
          const isCrit = s ? (Math.random() < s.crit) : false;
          const dmg = imp.dmg * (isCrit && s ? s.critMult : 1);
          damageEnemy(e, dmg, isCrit, { x: cx, y: cy });
          const dist = Math.sqrt(distSq(e.x, e.y, cx, cy)) || 1;
          const kb = effectiveKb(430);
          e.kx += ((e.x - cx) / dist) * kb;
          e.ky += ((e.y - cy) / dist) * kb;
        }
      }
      Sfx.play('boom');
      addShake(4);
    }
  }
  compact(Game.implosions);
}

function updateCamera(dt) {
  const p = Game.player;
  const tx = p.x + p.vx * 0.12;
  const ty = p.y + p.vy * 0.12;
  const k = Math.min(1, 6.5 * dt);
  Game.cam.x += (tx - Game.cam.x) * k;
  Game.cam.y += (ty - Game.cam.y) * k;
}

/* ══════════════ 玩家射击 ══════════════ */
function fireWeapon() {
  const p = Game.player;
  const s = p.stats;
  const orb = getOrb(p.orbId);
  const tgt = findNearestEnemy(p.x, p.y, 860);
  const base = tgt ? aimAngle(p, tgt) : p.facing;

  p.shotCounter++;
  const overheat = (s.capRate && (p.shotCounter % 5 === 0)) || (!s.capRate && s.midRate && (p.shotCounter % 8 === 0));

  let n = s.bullets + (orb.extraBullets || 0);
  if (overheat) n *= 2;
  const step = overheat ? s.spread * 0.72 : s.spread;

  const baseR = s.bulletR * (s.capDmg ? 1.48 : (s.midDmg ? 1.18 : 1));
  const baseLife = CFG.player.bulletLife * (orb.bulletLifeMul || 1);

  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * step;
    const ang = base + off;
    const sx = p.x + Math.cos(base) * (p.r + 4);
    const sy = p.y + Math.sin(base) * (p.r + 4);

    if (orb.id === 'cobalt') {
      // 【高速穿刺单针】基础发单发穿刺针弹；冲刺超频期间才激活双针连射
      const needleR = Math.max(6, Math.round(baseR * 0.8));
      const needlePierce = s.pierce + 1;
      if (p.overclockT > 0) {
        const perpX = -Math.sin(ang);
        const perpY = Math.cos(ang);
        const bDmg = Math.max(1, Math.round(effectiveDmg() * 0.72));
        spawnBullet(sx + perpX * 3.5, sy + perpY * 3.5, ang, {
          dmg: bDmg, r: needleR, speed: 880, life: baseLife, pierce: needlePierce,
          color: undefined, primary: true,
        });
        spawnBullet(sx - perpX * 3.5 - Math.cos(ang) * 7, sy - perpY * 3.5 - Math.sin(ang) * 7, ang, {
          dmg: bDmg, r: needleR, speed: 880, life: baseLife, pierce: needlePierce,
          color: undefined, primary: true,
        });
      } else {
        spawnBullet(sx, sy, ang, {
          dmg: Math.max(1, Math.round(effectiveDmg())), r: needleR, speed: 880, life: baseLife, pierce: needlePierce,
          color: undefined, primary: true,
        });
      }
    } else if (orb.id === 'crimson') {
      // 【重型母球弹】大口径重弹，强击退触发台球对撞
      const heavyR = Math.max(12, Math.round(baseR * 1.38));
      const heavyDmg = Math.max(1, Math.round(effectiveDmg() * 1.2));
      spawnBullet(sx, sy, ang, {
        dmg: heavyDmg, r: heavyR, speed: 580, life: baseLife,
        kb: 240, primary: true,
      });
    } else {
      // 【暴击追猎弹】齐射球默认单发精准弹
      const b = spawnBullet(sx, sy, ang, {
        r: baseR, life: baseLife, primary: true,
      });
      // 【暴击谐振】暴击时 45% 概率追加 1 枚微型追踪弹
      if (b && b.crit && Math.random() < 0.45) {
        spawnBullet(sx, sy, ang + rand(-0.35, 0.35), {
          dmg: Math.max(1, Math.round(effectiveDmg() * 0.55)),
          homing: true, pierce: 0, bounce: 0, split: 0,
          r: 6, speed: 480, life: 2.2, color: '#D97706',
        });
      }
    }
  }

  // 【觉醒 · 环形收束】背后额外发射 1 颗护卫弹
  if (s.capMulti) {
    const backA = base + Math.PI;
    spawnBullet(
      p.x + Math.cos(backA) * (p.r + 4),
      p.y + Math.sin(backA) * (p.r + 4),
      backA,
      { r: baseR, life: baseLife, dmg: Math.max(1, Math.round(effectiveDmg())) }
    );
  }

  const mx = p.x + Math.cos(base) * (p.r + 8);
  const my = p.y + Math.sin(base) * (p.r + 8);
  addParticle(mx, my, Math.cos(base) * 90, Math.sin(base) * 90, overheat ? 4.2 : 2.8, orb.ringColor, 0.14);
  Sfx.play('shoot');
}

/** 不同颜色球体的主动技能（空格触发） */
function triggerOrbSkill() {
  const p = Game.player;
  const s = p.stats;
  const c = CFG.player;
  const orb = getOrb(p.orbId);

  if (p.charges <= 0) return;
  p.charges--;
  const effectiveCd = p.beaconBuffT > 0 ? Math.min(0.25, s.dashCd) : s.dashCd;
  if (p.dashCd <= 0) p.dashCd = effectiveCd;

  // 【觉醒 · 残影诱饵】在起点留下几何残影球
  if (s.capDash) {
    Game.decoys.push({
      x: p.x, y: p.y, r: p.r, life: 2.0, max: 2.0,
      dmg: Math.max(4, Math.round(effectiveDmg() * 3.5)),
      dead: false,
    });
  }

  if (orb.id === 'crimson') {
    const pulseR = orb.pulseR;
    const rawDmg = orb.pulseDmg + effectiveDmg() * 3.0;
    p.iframe = Math.max(p.iframe, 0.24);
    Game.fx.push({ kind: 'ring', x: p.x, y: p.y, r: 10, maxR: pulseR, life: 0.32, max: 0.32, color: '#E63312', dead: false });
    Game.fx.push({ kind: 'ring', x: p.x, y: p.y, r: 4, maxR: pulseR * 0.65, life: 0.22, max: 0.22, color: '#111315', dead: false });
    for (let i = 0; i < Game.enemies.length; i++) {
      const e = Game.enemies[i];
      if (e.dead) continue;
      const rr = pulseR + e.r;
      if (distSq(p.x, p.y, e.x, e.y) <= rr * rr) {
        const isCrit = Math.random() < s.crit;
        const hitDmg = rawDmg * (isCrit ? s.critMult : 1);
        damageEnemy(e, hitDmg, isCrit, { x: p.x, y: p.y });
        const d = Math.sqrt(distSq(e.x, e.y, p.x, p.y)) || 1;
        const kb = effectiveKb(460);
        e.kx += ((e.x - p.x) / d) * kb;
        e.ky += ((e.y - p.y) / d) * kb;
      }
    }
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU + rand(-0.15, 0.15);
      const sp = rand(140, 290);
      addParticle(p.x, p.y, Math.cos(a) * sp, Math.sin(a) * sp, rand(2.2, 4), i % 3 === 0 ? '#111315' : '#E63312', 0.28, i % 2 === 0 ? 'needle' : 'cross', a, rand(-8, 8));
    }
    addShake(4.8);
    Sfx.play('boom');
    return;
  }

  if (orb.id === 'amber') {
    const count = orb.burstCount + s.bullets * 2;
    const baseA = p.facing;
    const burstDmg = Math.max(1, Math.round(effectiveDmg() * 1.1));
    for (let i = 0; i < count; i++) {
      const a = baseA + (i / count) * TAU;
      spawnBullet(
        p.x + Math.cos(a) * (p.r + 4),
        p.y + Math.sin(a) * (p.r + 4),
        a,
        {
          dmg: burstDmg,
          pierce: s.pierce + 1,
          bounce: s.bounce,
          split: s.split,
          speed: 680,
          life: 0.95,
          r: Math.max(8, Math.round(s.bulletR * 0.9)),
          color: '#FFB800',
        }
      );
    }
    Game.fx.push({ kind: 'ring', x: p.x, y: p.y, r: 8, maxR: 64, life: 0.22, max: 0.22, color: '#D97706', dead: false });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      addParticle(p.x, p.y, Math.cos(a) * 140, Math.sin(a) * 140, 2.4, '#FFB800', 0.2, 'square', a, 12);
    }
    addShake(2.4);
    Sfx.play('zap');
    return;
  }

  // 默认：钴蓝疾影球（相位冲刺 + 2.0s 动能超频）
  p.dashT = c.dashTime;
  p.iframe = Math.max(p.iframe, 0.38);
  p.overclockT = 2.0;
  p.dashHit.clear();
  Sfx.play('dash');
  for (let i = 0; i < 10; i++) {
    const a = rand(0, TAU);
    const sp = rand(60, 150);
    addParticle(p.x, p.y, Math.cos(a) * sp, Math.sin(a) * sp, rand(2, 4.2), '#0055FF', rand(0.18, 0.34), i % 2 === 0 ? 'needle' : 'circle', a, 0);
  }
}

function spawnBullet(x, y, ang, opt) {
  if (Game.bullets.length >= CFG.maxBullets) return null;
  const p = Game.player;
  const s = p.stats;
  const o = opt || {};
  const sp = o.speed || CFG.player.bulletSpeed;
  const crit = o.crit !== undefined ? o.crit : (Math.random() < s.crit);
  let dmg = o.dmg !== undefined ? o.dmg : effectiveDmg();
  if (crit) dmg *= s.critMult;

  const b = {
    x: x, y: y,
    vx: Math.cos(ang) * sp,
    vy: Math.sin(ang) * sp,
    r: o.r || s.bulletR || CFG.player.bulletR,
    life: o.life || CFG.player.bulletLife,
    dmg: Math.max(1, Math.round(dmg)),
    pierce: o.pierce !== undefined ? o.pierce : s.pierce,
    bounce: o.bounce !== undefined ? o.bounce : s.bounce,
    splits: o.split !== undefined ? o.split : s.split,
    crit: crit,
    homing: !!o.homing,
    cluster: !!o.cluster,
    kb: o.kb || 0,
    pierceCount: 0,
    refracted: false,
    critSplitDone: false,
    color: o.color || (crit ? '#FFB800' : '#111315'),
    hit: new Set(),
    splitDone: false,
    dead: false,
    t: 0,
  };
  Game.bullets.push(b);
  return b;
}

function updateBullets(dt) {
  const arr = Game.bullets;
  const enemies = Game.enemies;
  const p = Game.player;
  const canRefract = p && p.stats.refract > 0;

  for (let i = 0; i < arr.length; i++) {
    const b = arr[i];
    if (b.dead) continue;
    b.t += dt;

    if (b.homing) {
      const tgt = findNearestEnemy(b.x, b.y, 640);
      if (tgt) {
        const want = Math.atan2(tgt.y - b.y, tgt.x - b.x);
        const cur = Math.atan2(b.vy, b.vx);
        const na = cur + clamp(angleDiff(want, cur), -8 * dt, 8 * dt);
        const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        b.vx = Math.cos(na) * sp;
        b.vy = Math.sin(na) * sp;
      }
    }

    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;

    // 【几何折射】飞出可视边界或寿命耗尽时向玩家方向折返一次
    const offScreen = Game.W > 0 && (Math.abs(b.x - Game.cam.x) > Game.W * 0.52 || Math.abs(b.y - Game.cam.y) > Game.H * 0.52);
    if ((b.life <= 0 || offScreen) && canRefract && !b.refracted && !b.homing) {
      b.refracted = true;
      b.hit.clear();
      b.dmg = Math.max(1, Math.round(b.dmg * 0.7));
      b.life = Math.max(0.55, CFG.player.bulletLife * 0.7) * p.stats.refract;
      const sp = Math.hypot(b.vx, b.vy) || CFG.player.bulletSpeed;
      const backA = Math.atan2(p.y - b.y, p.x - b.x) + rand(-0.14, 0.14);
      b.vx = Math.cos(backA) * sp;
      b.vy = Math.sin(backA) * sp;
      Game.fx.push({ kind: 'ring', x: b.x, y: b.y, r: 2, maxR: 12, life: 0.14, max: 0.14, color: '#0055FF', dead: false });
    }

    if (b.life <= 0) { b.dead = true; continue; }

    for (let j = 0; j < enemies.length; j++) {
      const e = enemies[j];
      if (e.dead || b.hit.has(e.id)) continue;
      const rr = b.r + e.r;
      if (distSq(b.x, b.y, e.x, e.y) > rr * rr) continue;
      hitEnemyWithBullet(b, e);
      if (b.dead) break;
    }
  }
  compact(arr);
}

function hitEnemyWithBullet(b, e) {
  const p = Game.player;
  const s = p ? p.stats : null;
  b.hit.add(e.id);
  damageEnemy(e, b.dmg, b.crit, b);

  // 击退：重型弹、中阶破甲重弹或大成重核粉碎
  let kbForce = b.kb || 0;
  if (s && s.capDmg) kbForce += 210;
  else if (s && s.midDmg) kbForce += 70;
  if (kbForce > 0 && !e.dead) {
    const sp = Math.hypot(b.vx, b.vy) || 1;
    const impulse = effectiveKb(kbForce);
    e.kx += (b.vx / sp) * impulse;
    e.ky += (b.vy / sp) * impulse;
  }

  // 【大成 · 集束轰炸】追踪弹命中溅射 65px
  if (b.cluster) {
    const splashDmg = Math.max(1, Math.round(b.dmg * 0.7));
    Game.fx.push({ kind: 'ring', x: b.x, y: b.y, r: 4, maxR: 65, life: 0.18, max: 0.18, color: '#008B74', dead: false });
    for (let i = 0; i < Game.enemies.length; i++) {
      const o = Game.enemies[i];
      if (o.dead || o.id === e.id) continue;
      const rr = 65 + o.r;
      if (distSq(b.x, b.y, o.x, o.y) <= rr * rr) {
        damageEnemy(o, splashDmg, false, { x: b.x, y: b.y });
      }
    }
  }

  // Micro impact ring (clean Modern Swiss hairline shockwave)
  Game.fx.push({
    kind: 'ring',
    x: b.x,
    y: b.y,
    r: 2,
    maxR: b.crit ? 18 : 10,
    life: 0.12,
    max: 0.12,
    color: b.crit ? '#FFB800' : '#0055FF',
    dead: false,
  });

  addShake(b.crit ? 1.0 : 0.35);

  const hitAngle = Math.atan2(b.vy, b.vx);
  const sparkCol = b.crit ? '#FFB800' : '#0055FF';

  const backAngle = hitAngle + Math.PI + rand(-0.45, 0.45);
  const needleSp = rand(90, 180);
  addParticle(
    b.x, b.y,
    Math.cos(backAngle) * needleSp, Math.sin(backAngle) * needleSp,
    rand(2.2, 3.8), sparkCol, 0.16, 'needle', backAngle, 0
  );

  const sqAngle = rand(0, TAU);
  const sqSp = rand(60, 130);
  addParticle(
    b.x, b.y,
    Math.cos(sqAngle) * sqSp, Math.sin(sqAngle) * sqSp,
    rand(1.8, 3.0), b.crit ? '#111315' : '#0055FF', 0.22, 'square', rand(0, TAU), rand(-15, 15)
  );

  if (b.crit) {
    addParticle(
      b.x, b.y,
      rand(-50, 50), rand(-50, 50),
      3.2, '#E63312', 0.25, 'cross', rand(0, TAU), rand(-8, 8)
    );
  } else {
    addParticle(
      b.x, b.y,
      rand(-70, 70), rand(-70, 70),
      rand(1.2, 2.4), '#111315', 0.18, 'circle'
    );
  }

  Sfx.play('hit');

  if (b.pierce > 0) {
    b.pierce--;
    b.pierceCount++;
    if (s && s.capPierce) {
      b.dmg = Math.max(1, Math.round(b.dmg * 1.32));
      b.r = Math.min(26, b.r * 1.08);
    } else if (s && s.midPierce) {
      b.dmg = Math.max(1, Math.round(b.dmg * 1.15));
    }
    return;
  }

  if (b.bounce > 0) {
    const tgt = findNearestEnemyExcept(b.x, b.y, 320, b.hit);
    if (tgt) {
      if (!(s && s.capBounce && b.crit && Math.random() < 0.6)) {
        b.bounce--;
      }
      const a = Math.atan2(tgt.y - b.y, tgt.x - b.x);
      let sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (s && s.capBounce) {
        sp *= 1.22;
        b.dmg = Math.max(1, Math.round(b.dmg * 1.28));
      } else if (s && s.midBounce) {
        b.dmg = Math.max(1, Math.round(b.dmg * 1.12));
      }
      b.vx = Math.cos(a) * sp;
      b.vy = Math.sin(a) * sp;
      b.life = Math.max(b.life, 0.7);
      return;
    }
  }
  b.dead = true;
}

/* ══════════════ 伤害、数字法则与死亡 ══════════════ */
function damageEnemy(e, dmg, crit, from) {
  if (e.dead) return;
  const p = Game.player;
  const s = p ? p.stats : null;

  let raw = dmg;
  // 相位棱镜球减伤护盾 (-60%)，真伤不受影响
  if (e.shielded > 0 && !(from && from.isTrueDamage)) {
    raw *= 0.4;
  }
  let d = Math.max(1, Math.round(raw));

  // 【数字强迫症】剩余血量接近单发伤害时自动补足为精准归零
  if (s && s.exactHunter > 0 && !e.boss && !(from && from.isExactZeroBurst)) {
    if (e.hp > d && e.hp <= d * (1 + 0.25 * s.exactHunter)) {
      d = e.hp;
      e.exactForced = true;
    }
  }

  e.hitCount = (e.hitCount || 0) + 1;
  e.hp -= d;

  // 【大成 · 致命斩杀】暴击直接处决血量低于 20% 的非首领敌球
  if (s && s.capCrit && crit && !e.boss && e.hp > 0 && e.hp < e.maxHp * 0.2) {
    e.hp = 0;
  }

  e.flash = 0.09;
  e.squash = crit ? 0.36 : 0.22;
  e.hitShake = crit ? 5.2 : 2.6;
  if (from && (from.vx !== undefined || from.x !== undefined)) {
    const fvx = from.vx !== undefined ? from.vx : (e.x - from.x);
    const fvy = from.vy !== undefined ? from.vy : (e.y - from.y);
    e.squashAngle = Math.atan2(fvy, fvx);
  } else {
    e.squashAngle = rand(0, TAU);
  }
  Game.dmgDealt += d;

  const isCollide = from && from.isBilliard;
  const numStr = fmt(d);
  const critSize = d >= 100000 ? 36 : d >= 10000 ? 33 : d >= 1000 ? 30 : d >= 100 ? 27 : 25;
  const txtSize = crit ? critSize : (isCollide ? 19 : 17);
  const txtColor = isCollide ? '#4F3CC9' : (crit ? '#E63312' : '#111315');
  addText(
    e.x + rand(-12, 12),
    e.y - e.r * 0.85 - (crit ? 6 : 0),
    (crit ? '✦ ' : (isCollide ? '◆ ' : '')) + numStr,
    txtColor,
    txtSize,
    {
      crit: !!crit,
      vx: rand(-26, 26),
      vy: crit ? -96 : -68,
      life: crit ? 0.94 : 0.78,
    }
  );

  // 【觉醒 · 连锁裂变】首次暴击命中无需击杀也炸出碎片
  if (s && s.capSplit && crit && from && from.splits > 0 && !from.critSplitDone && e.hp > 0) {
    from.critSplitDone = true;
    for (let k = 0; k < 2; k++) {
      spawnBullet(e.x, e.y, rand(0, TAU), {
        dmg: Math.max(1, Math.round(d * 0.55)),
        pierce: 0, bounce: 0, split: 0,
        life: 0.65, r: 6, color: '#0055FF',
      });
    }
  }

  if (e.hp <= 0) {
    // 【精准归零】非单发秒杀基础小怪时，伤害分毫不差打成 0 触发归零爆发
    if (e.hp === 0 && (e.maxHp > d || e.hitCount >= 2 || e.exactForced) && !(from && from.isExactZeroBurst)) {
      e.exactZero = true;
      addText(e.x, e.y - e.r - 16, '✦ 归零', '#D97706', 24, { crit: true, vy: -82, life: 0.9 });
      Game.fx.push({ kind: 'ring', x: e.x, y: e.y, r: 6, maxR: 80, life: 0.28, max: 0.28, color: '#FFB800', dead: false });
      Sfx.play('zero');
      const burstDmg = Math.max(1, Math.round(1.5 * effectiveDmg()));
      for (let i = 0; i < Game.enemies.length; i++) {
        const o = Game.enemies[i];
        if (o.dead || o.id === e.id) continue;
        const rr = 80 + o.r;
        if (distSq(e.x, e.y, o.x, o.y) <= rr * rr) {
          damageEnemy(o, burstDmg, false, { x: e.x, y: e.y, isExactZeroBurst: true });
          const dd = Math.sqrt(distSq(o.x, o.y, e.x, e.y)) || 1;
          const kb = effectiveKb(180);
          o.kx += ((o.x - e.x) / dd) * kb;
          o.ky += ((o.y - e.y) / dd) * kb;
        }
      }
    } else if (e.hp < 0 && !(from && from.isOverkillArc)) {
      // 【过载传导】溢出伤害的 75% 化为蓝色电弧劈向最近敌人
      const overkill = -e.hp;
      if (overkill >= Math.max(2, effectiveDmg() * 0.45)) {
        const tgt = findNearestEnemyExcept(e.x, e.y, 190, new Set([e.id]));
        if (tgt) {
          const arcDmg = Math.max(1, Math.round(overkill * 0.75));
          Game.fx.push({
            kind: 'chain',
            pts: [[e.x, e.y], [tgt.x, tgt.y]],
            life: 0.18, max: 0.18, color: '#0055FF', dead: false,
          });
          damageEnemy(tgt, arcDmg, false, { x: e.x, y: e.y, isOverkillArc: true });
        }
      }
    }

    killEnemy(e, from);
  }
}

function killEnemy(e, from) {
  if (e.dead) return;
  e.dead = true;
  Game.kills++;

  const p = Game.player;
  const s = p ? p.stats : null;
  let xpVal = e.xp;
  if (e.exactZero) xpVal *= 2;
  if (from && from.isBilliard && s && s.pinball > 0) xpVal *= 2;
  dropXp(e.x, e.y, xpVal);
  rollDrop(e);

  // 相位棱镜球死亡：连接线过载，对所有连接敌球造成高额真实伤害
  if (e.type === 'shielder' && e.links && e.links.length > 0) {
    const overloadDmg = Math.max(4, Math.round(e.maxHp * 0.6 + effectiveDmg() * 2));
    for (let k = 0; k < e.links.length; k++) {
      const target = findEnemyById(e.links[k]);
      if (target && !target.dead) {
        Game.fx.push({ kind: 'chain', pts: [[e.x, e.y], [target.x, target.y]], life: 0.24, max: 0.24, color: '#0284C7', dead: false });
        damageEnemy(target, overloadDmg, true, { x: e.x, y: e.y, isTrueDamage: true });
      }
    }
  }

  const count = e.boss ? 44 : (e.r > 20 ? 13 : 7);
  for (let i = 0; i < count; i++) {
    const a = rand(0, TAU);
    const sp = rand(50, e.boss ? 340 : 180);
    const shp = pick(['circle', 'square', 'needle', 'cross']);
    addParticle(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, rand(1.5, e.boss ? 6 : 4), e.color, rand(0.3, 0.75), shp);
  }
  Sfx.play('kill');
  addShake(e.boss ? 20 : (e.r > 22 ? 4 : 1.6));

  if (p && (p.stats.vamp > 0 || p.stats.vampPct > 0) && p.hp < p.maxHp) {
    const vHeal = p.stats.vamp + p.maxHp * (p.stats.vampPct || 0);
    p.hp = Math.min(p.maxHp, p.hp + vHeal);
  }

  if (from && from.splits > 0 && !from.splitDone) {
    from.splitDone = true;
    const n = 2 * from.splits;
    for (let i = 0; i < n; i++) {
      spawnBullet(e.x, e.y, rand(0, TAU), {
        dmg: Math.max(1, Math.round(from.dmg * (s && s.midSplit ? 0.75 : 0.6))),
        pierce: 0, bounce: 0, split: 0,
        life: 0.7, r: 6.5, color: '#0055FF',
      });
    }
  }

  if (e.type === 'splitter') {
    for (let i = 0; i < 2; i++) {
      const a = rand(0, TAU);
      spawnEnemyRaw('walker', e.x + Math.cos(a) * (e.r + 6), e.y + Math.sin(a) * (e.r + 6), 0.5);
    }
  }

  if (e.boss) {
    const tier = e.bossTier || 1;
    Game.boss = null;
    addText(e.x, e.y - e.r - 20, (e.label || '核心') + ' 击破', '#E63312', 26);
    for (let i = 0; i < 2; i++) dropPickup(e.x + rand(-40, 40), e.y + rand(-40, 40), 'heal');
    Game.fx.push({ kind: 'ring', x: e.x, y: e.y, r: 16, maxR: 220, life: 0.45, max: 0.45, color: '#FFB800', dead: false });
    Sfx.play('boom');
    addShake(24);
    if (tier >= 3) {
      Game.gameOver(true);
    } else {
      Game.pendingRelic++;
    }
  }
}

/* ══════════════ 敌人生成与波次事件 ══════════════ */
function offscreenPos() {
  const pad = 62;
  const halfW = Game.W / 2;
  const halfH = Game.H / 2;
  const side = randInt(0, 3);
  if (side === 0) return { x: Game.cam.x - halfW - pad, y: Game.cam.y + rand(-halfH, halfH) };
  if (side === 1) return { x: Game.cam.x + halfW + pad, y: Game.cam.y + rand(-halfH, halfH) };
  if (side === 2) return { x: Game.cam.x + rand(-halfW, halfW), y: Game.cam.y - halfH - pad };
  return { x: Game.cam.x + rand(-halfW, halfW), y: Game.cam.y + halfH + pad };
}

function spawnEnemyRaw(key, x, y, mul, extra) {
  const t = CFG.enemies[key];
  if (!t) return null;
  if (Game.enemies.length >= CFG.maxEnemies && key !== 'boss') return null;

  const d = getDifficulty();
  const opts = extra || {};
  const baseSpeed = opts.speed || t.speed;
  const baseDmg = opts.dmg || t.dmg;
  const hp = Math.max(1, Math.round(t.hp * hpScaleAt(Game.time) * (mul || 1)));
  const e = {
    id: Game.nextId++,
    type: key,
    boss: key === 'boss',
    bossTier: opts.tier || 0,
    label: opts.label || t.label,
    golden: !!opts.golden,
    x: x, y: y,
    vx: 0, vy: 0, kx: 0, ky: 0,
    r: opts.r || t.r,
    hp: hp, maxHp: hp,
    speed: baseSpeed * d.speedMul,
    dmg: Math.max(1, Math.round(baseDmg * dmgScaleAt(Game.time))),
    xp: opts.xp || t.xp,
    color: opts.golden ? '#D97706' : t.color,
    flash: 0,
    squash: 0,
    squashAngle: 0,
    hitShake: 0,
    hitCount: 0,
    exactForced: false,
    collideCd: 0,
    slowT: 0,
    shielded: 0,
    links: [],
    chargeState: 'chase',
    chargeT: 0,
    chargeTx: 0,
    chargeTy: 0,
    chargeVx: 0,
    chargeVy: 0,
    laserState: 'idle',
    laserT: 4.0,
    laserAngle: 0,
    t: rand(0, 3),
    atkCd: rand(0.8, 2.2),
    orbCd: 0,
    sumCd: 6,
    wob: rand(0, TAU),
    dead: false,
  };
  Game.enemies.push(e);
  return e;
}

function spawnEnemy(key) {
  const pos = offscreenPos();
  return spawnEnemyRaw(key, pos.x, pos.y, 1);
}

function spawnBoss(cfg) {
  if (Game.boss && !Game.boss.dead) return;
  const pos = offscreenPos();
  const c = cfg || BOSS_CONFIGS[0];
  const e = spawnEnemyRaw('boss', pos.x, pos.y, c.hpMul, {
    tier: c.tier,
    label: c.label,
    r: c.r,
    speed: c.speed,
    dmg: c.dmg,
  });
  if (!e) return;
  Game.boss = e;
  addText(Game.player.x, Game.player.y - 90, '▲ ' + c.label + ' 出现', '#E63312', 24);
  addShake(12);
  Sfx.play('boss');
}

function updateSpawner(dt) {
  Game.spawnAcc += spawnRateAt(Game.time) * dt;
  while (Game.spawnAcc >= 1) {
    Game.spawnAcc -= 1;
    if (Game.enemies.length >= CFG.maxEnemies) { Game.spawnAcc = 0; break; }
    spawnEnemy(pickEnemyType(Game.time));
  }

  // 三阶段首领：110s / 230s / 340s
  if (Game.bossIdx < BOSS_CONFIGS.length && Game.time >= BOSS_CONFIGS[Game.bossIdx].time) {
    const cfg = BOSS_CONFIGS[Game.bossIdx];
    Game.bossIdx++;
    spawnBoss(cfg);
  }

  // 突发波次事件：01:15 (75s) 疾行包围圈，03:00 (180s) 数字金潮
  const p = Game.player;
  if (Game.waveIdx === 0 && Game.time >= 75) {
    Game.waveIdx = 1;
    addText(p.x, p.y - 84, '▲ 突发波次 · 疾行包围圈', '#F26419', 22);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      spawnEnemyRaw('sprinter', p.x + Math.cos(a) * 420, p.y + Math.sin(a) * 420, 0.65);
    }
    addShake(7);
  } else if (Game.waveIdx === 1 && Game.time >= 180) {
    Game.waveIdx = 2;
    addText(p.x, p.y - 84, '✦ 突发波次 · 数字金潮', '#D97706', 22);
    for (let i = 0; i < 15; i++) {
      const a = (i / 15) * TAU + rand(-0.1, 0.1);
      const r = rand(340, 480);
      spawnEnemyRaw('splitter', p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 1.4, { golden: true, xp: 9 });
    }
    addShake(7);
  }
}

/* ══════════════ 地图限时交互点：【几何信标】 ══════════════ */
const BEACON_MARKS = [45, 100, 155, 210, 265, 310];
const BEACON_REWARDS = [
  { id: 'overclock', label: '超频矩阵', color: '#0055FF' },
  { id: 'airdrop',   label: '模块空投', color: '#D97706' },
  { id: 'magstorm',  label: '磁暴回收', color: '#00A86B' },
];

function updateBeacons(dt) {
  const p = Game.player;
  if (!p) return;

  if (Game.beaconIdx < BEACON_MARKS.length && Game.time >= BEACON_MARKS[Game.beaconIdx]) {
    Game.beaconIdx++;
    const a = rand(0, TAU);
    const dist = rand(380, 520);
    const reward = pick(BEACON_REWARDS);
    Game.beacons.push({
      x: p.x + Math.cos(a) * dist,
      y: p.y + Math.sin(a) * dist,
      r: 115,
      prog: 0,
      need: 4.0,
      life: 25,
      maxLife: 25,
      reward: reward,
      dead: false,
    });
    addText(p.x, p.y - 70, '◆ 几何信标已部署', '#0055FF', 18);
  }

  for (let i = 0; i < Game.beacons.length; i++) {
    const b = Game.beacons[i];
    if (b.dead) continue;
    b.life -= dt;
    if (b.life <= 0) { b.dead = true; continue; }

    const inside = distSq(p.x, p.y, b.x, b.y) <= b.r * b.r;
    if (inside) {
      b.prog += dt;
      if (b.prog >= b.need) {
        captureBeacon(b);
      }
    } else {
      b.prog = Math.max(0, b.prog - dt * 0.5);
    }
  }
  compact(Game.beacons);
}

function captureBeacon(b) {
  b.dead = true;
  const p = Game.player;
  Game.fx.push({ kind: 'ring', x: b.x, y: b.y, r: 12, maxR: 320, life: 0.44, max: 0.44, color: b.reward.color, dead: false });
  const clearDmg = Math.max(4, Math.round(4 + effectiveDmg() * 2));
  for (let i = 0; i < Game.enemies.length; i++) {
    const e = Game.enemies[i];
    if (e.dead) continue;
    const rr = 320 + e.r;
    if (distSq(b.x, b.y, e.x, e.y) <= rr * rr) {
      damageEnemy(e, clearDmg, false, { x: b.x, y: b.y });
      const dd = Math.sqrt(distSq(e.x, e.y, b.x, b.y)) || 1;
      const kb = effectiveKb(420);
      e.kx += ((e.x - b.x) / dd) * kb;
      e.ky += ((e.y - b.y) / dd) * kb;
    }
  }

  if (b.reward.id === 'overclock') {
    p.beaconBuffT = 12.0;
    addText(b.x, b.y - 26, '◆ 超频矩阵 12s', '#0055FF', 22);
  } else if (b.reward.id === 'airdrop') {
    Game.pendingLevel++;
    addText(b.x, b.y - 26, '◆ 模块空投 +1', '#D97706', 22);
  } else {
    for (let i = 0; i < Game.xpOrbs.length; i++) Game.xpOrbs[i].mag = 3.0;
    dropPickup(b.x, b.y, 'heal');
    addText(b.x, b.y - 26, '◆ 磁暴回收', '#00A86B', 22);
  }

  addShake(10);
  Sfx.play('beacon');
}

/* ══════════════ 敌人更新与台球碰撞 ══════════════ */
function findEnemyById(id) {
  const arr = Game.enemies;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].id === id) return arr[i];
  }
  return null;
}

function pointSegDistSq(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1, vy = y2 - y1;
  const wx = px - x1, wy = py - y1;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return distSq(px, py, x1, y1);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return distSq(px, py, x2, y2);
  const t = c1 / c2;
  return distSq(px, py, x1 + t * vx, y1 + t * vy);
}

function updateEnemies(dt) {
  const p = Game.player;
  const slowK = 1 - p.stats.slow;
  const enemies = Game.enemies;

  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.dead) continue;

    e.t += dt;
    if (e.flash > 0) e.flash -= dt;
    if (e.squash > 0) e.squash = Math.max(0, e.squash - dt * 2.2);
    if (e.hitShake > 0) e.hitShake = Math.max(0, e.hitShake - dt * 26);
    if (e.collideCd > 0) e.collideCd -= dt;
    if (e.slowT > 0) e.slowT -= dt;
    if (e.shielded > 0) e.shielded -= dt;
    if (e.orbCd > 0) e.orbCd -= dt;
    if (e.atkCd > 0) e.atkCd -= dt;

    if (distSq(e.x, e.y, p.x, p.y) > 1150 * 1150) {
      const pos = offscreenPos();
      e.x = pos.x;
      e.y = pos.y;
      e.kx = 0;
      e.ky = 0;
      for (let k = 0; k < 5; k++) {
        addParticle(e.x, e.y, rand(-40, 40), rand(-40, 40), rand(1.5, 3), e.color, 0.3);
      }
      continue;
    }

    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / d;
    const ny = dy / d;
    const enemySlow = slowK * (e.slowT > 0 ? 0.5 : 1);
    let vx = 0, vy = 0;

    if (e.boss) {
      vx = nx * e.speed * enemySlow;
      vy = ny * e.speed * enemySlow;
      const tier = e.bossTier || 1;

      if (tier === 2) {
        // 【矩阵切割者 · 贰型】旋转十字激光 + 扇形高速弹
        if (e.laserState === 'idle') {
          e.laserT -= dt;
          if (e.laserT <= 0) {
            e.laserState = 'warn';
            e.laserT = 0.9;
            e.laserAngle = Math.atan2(dy, dx);
          }
        } else if (e.laserState === 'warn') {
          e.laserT -= dt;
          vx *= 0.35; vy *= 0.35;
          if (e.laserT <= 0) {
            e.laserState = 'fire';
            e.laserT = 1.4;
            Sfx.play('zap');
          }
        } else if (e.laserState === 'fire') {
          e.laserT -= dt;
          e.laserAngle += dt * 0.65;
          vx *= 0.35; vy *= 0.35;
          const beamLen = 520;
          for (let b = 0; b < 2; b++) {
            const ba = e.laserAngle + b * (Math.PI / 2);
            const x1 = e.x - Math.cos(ba) * beamLen;
            const y1 = e.y - Math.sin(ba) * beamLen;
            const x2 = e.x + Math.cos(ba) * beamLen;
            const y2 = e.y + Math.sin(ba) * beamLen;
            if (pointSegDistSq(p.x, p.y, x1, y1, x2, y2) <= (p.r + 5) * (p.r + 5)) {
              hurtPlayer({ dmg: e.dmg * 0.75 });
            }
          }
          if (e.laserT <= 0) {
            e.laserState = 'idle';
            e.laserT = 3.8;
          }
        }
        if (e.atkCd <= 0) {
          e.atkCd = 2.4;
          const base = Math.atan2(dy, dx);
          for (let k = -2; k <= 2; k++) {
            spawnEBullet(e.x, e.y, base + k * 0.16, 250, e.dmg * 0.55, '#E63312');
          }
        }
      } else {
        // 壹型 & 终型：环形弹幕 + 召唤（终型额外高速连发并召唤冲锋球）
        if (e.atkCd <= 0) {
          e.atkCd = tier === 3 ? 2.2 : 3.2;
          const base = Math.atan2(dy, dx);
          const cnt = tier === 3 ? 18 : 14;
          for (let k = 0; k < cnt; k++) {
            spawnEBullet(e.x, e.y, base + (k / cnt) * TAU, tier === 3 ? 205 : 178, e.dmg * 0.55, '#E63312');
          }
          Sfx.play('boss');
          addShake(6);
        }
        e.sumCd -= dt;
        if (e.sumCd <= 0) {
          e.sumCd = tier === 3 ? 6.5 : 8.0;
          const sumCnt = tier === 3 ? 4 : 3;
          for (let k = 0; k < sumCnt; k++) {
            const a = rand(0, TAU);
            const sumKey = (tier === 3 && k === 0) ? 'charger' : 'walker';
            spawnEnemyRaw(sumKey, e.x + Math.cos(a) * (e.r + 18), e.y + Math.sin(a) * (e.r + 18), 1);
          }
        }
      }
    } else if (e.type === 'charger') {
      // 【矢量冲锋球】接近后 0.75s 红线瞄准蓄力，然后高速冲锋 0.55s
      if (e.chargeState === 'warn') {
        e.chargeT -= dt;
        vx = 0; vy = 0;
        if (e.chargeT <= 0) {
          e.chargeState = 'dash';
          e.chargeT = 0.55;
          const ca = Math.atan2(e.chargeTy - e.y, e.chargeTx - e.x);
          const dashSp = 460 * dSpeedMul();
          e.chargeVx = Math.cos(ca) * dashSp;
          e.chargeVy = Math.sin(ca) * dashSp;
        }
      } else if (e.chargeState === 'dash') {
        e.chargeT -= dt;
        vx = e.chargeVx * enemySlow;
        vy = e.chargeVy * enemySlow;
        // 冲锋中被击退时，将自身高速冲量转化为台球对撞势能
        if (Math.hypot(e.kx, e.ky) > 80) {
          e.kx += e.chargeVx * 0.5;
          e.ky += e.chargeVy * 0.5;
          e.chargeState = 'chase';
          e.atkCd = 2.6;
        } else if (e.chargeT <= 0) {
          e.chargeState = 'chase';
          e.atkCd = 2.4;
        }
      } else {
        vx = nx * e.speed * enemySlow;
        vy = ny * e.speed * enemySlow;
        if (d < 280 && e.atkCd <= 0) {
          e.chargeState = 'warn';
          e.chargeT = 0.75;
          e.chargeTx = p.x;
          e.chargeTy = p.y;
        }
      }
    } else if (e.type === 'shielder') {
      // 【相位棱镜球】中排游走，连接周围最多 3 名友军提供 60% 减伤
      const want = 250;
      let k2 = 0;
      if (d > want + 35) k2 = 1;
      else if (d < want - 35) k2 = -1;
      vx = (nx * k2 - ny * 0.5) * e.speed * enemySlow;
      vy = (ny * k2 + nx * 0.5) * e.speed * enemySlow;
      if (Game.sepTick % 4 === 0 || e.links.length === 0) {
        e.links.length = 0;
        for (let j = 0; j < enemies.length && e.links.length < 3; j++) {
          const o = enemies[j];
          if (o.dead || o.id === e.id || o.type === 'shielder') continue;
          if (distSq(e.x, e.y, o.x, o.y) <= 160 * 160) {
            e.links.push(o.id);
            o.shielded = 0.28;
          }
        }
      } else {
        for (let k = 0; k < e.links.length; k++) {
          const o = findEnemyById(e.links[k]);
          if (o && !o.dead) o.shielded = 0.28;
        }
      }
    } else if (e.type === 'shooter') {
      const want = 250;
      let k2 = 0;
      if (d > want + 40) k2 = 1;
      else if (d < want - 40) k2 = -1;
      vx = (nx * k2 - ny * 0.45) * e.speed * enemySlow;
      vy = (ny * k2 + nx * 0.45) * e.speed * enemySlow;
      if (e.atkCd <= 0 && d < 660) {
        e.atkCd = 2.0;
        spawnEBullet(e.x, e.y, Math.atan2(dy, dx), 235, e.dmg * 0.75, '#6D28D9');
      }
    } else {
      let sp = e.speed;
      if (e.type === 'sprinter') sp *= 1 + Math.sin(e.t * 6 + e.wob) * 0.18;
      else sp *= 1 + Math.sin(e.t * 2.4 + e.wob) * 0.1;
      vx = nx * sp * enemySlow;
      vy = ny * sp * enemySlow;
    }

    const damp = Math.max(0, 1 - 9 * dt);
    e.kx *= damp;
    e.ky *= damp;

    e.vx = vx;
    e.vy = vy;
    e.x += (vx + e.kx) * dt;
    e.y += (vy + e.ky) * dt;

    const rr = e.r + p.r;
    if (distSq(e.x, e.y, p.x, p.y) < rr * rr) hurtPlayer(e);
  }

  separateEnemies();
  compact(enemies);
}

function dSpeedMul() {
  return getDifficulty().speedMul || 1;
}

function separateEnemies() {
  Game.sepTick++;
  if (Game.sepTick % 2 !== 0) return;
  const arr = Game.enemies;
  const n = Math.min(arr.length, 200);
  const p = Game.player;

  for (let i = 0; i < n; i++) {
    const a = arr[i];
    if (a.dead) continue;
    for (let j = i + 1; j < n; j++) {
      const b = arr[j];
      if (b.dead) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const rr = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 < 0.0001) continue;
      const d = Math.sqrt(d2);
      const push = (rr - d) * 0.42;
      const ux = dx / d;
      const uy = dy / d;
      a.x -= ux * push;
      a.y -= uy * push;
      b.x += ux * push;
      b.y += uy * push;

      // 【台球对撞】相对击退速率 >= 150 px/s 时触发碰撞伤害与动量传递
      const rkx = a.kx - b.kx;
      const rky = a.ky - b.ky;
      const vRel = Math.sqrt(rkx * rkx + rky * rky);
      if (vRel >= 150 && a.collideCd <= 0 && b.collideCd <= 0) {
        a.collideCd = 0.18;
        b.collideCd = 0.18;

        const ka = a.kx * a.kx + a.ky * a.ky;
        const kb = b.kx * b.kx + b.ky * b.ky;
        const fast = ka >= kb ? a : b;
        const slow = fast === a ? b : a;
        const fkx = fast.kx;
        const fky = fast.ky;

        slow.kx += fkx * 0.65;
        slow.ky += fky * 0.65;

        const tx = -uy;
        const ty = ux;
        const sign = (fkx * tx + fky * ty) >= 0 ? 1 : -1;
        fast.kx = fkx * 0.35 + tx * sign * vRel * 0.25;
        fast.ky = fky * 0.35 + ty * sign * vRel * 0.25;

        let colDmg = Math.max(2, Math.round((2 + effectiveDmg() * 0.9) * (vRel / 220)));
        if (p) {
          colDmg = Math.round(colDmg * (getOrb(p.orbId).billiardMul || 1) * (1 + p.stats.pinball));
        }
        colDmg = Math.max(1, colDmg);

        const mx = (a.x + b.x) * 0.5;
        const my = (a.y + b.y) * 0.5;
        a.squash = 0.28;
        b.squash = 0.28;
        Game.fx.push({ kind: 'ring', x: mx, y: my, r: 2, maxR: 16, life: 0.18, max: 0.18, color: '#4F3CC9', dead: false });
        for (let k = 0; k < 4; k++) {
          const ang = (k / 4) * TAU + rand(-0.3, 0.3);
          addParticle(mx, my, Math.cos(ang) * 110, Math.sin(ang) * 110, 2.6, k % 2 === 0 ? '#4F3CC9' : '#E63312', 0.22, 'cross', ang, 10);
        }
        Sfx.play('clack');

        damageEnemy(a, colDmg, false, { x: mx, y: my, isBilliard: true });
        damageEnemy(b, colDmg, false, { x: mx, y: my, isBilliard: true });
      }
    }
  }
}

function triggerAntimatterBreak(p) {
  p.shieldActive = false;
  p.shieldCd = 12.0;
  p.iframe = Math.max(p.iframe, 0.8);
  addText(p.x, p.y - p.r - 18, '✦ 护盾反冲', '#E63312', 20);
  Game.fx.push({ kind: 'ring', x: p.x, y: p.y, r: 12, maxR: 260, life: 0.4, max: 0.4, color: '#E63312', dead: false });
  const dmg = Math.max(6, Math.round(6 + effectiveDmg() * 4));
  for (let i = 0; i < Game.enemies.length; i++) {
    const e = Game.enemies[i];
    if (e.dead) continue;
    const rr = 260 + e.r;
    if (distSq(p.x, p.y, e.x, e.y) <= rr * rr) {
      damageEnemy(e, dmg, true, { x: p.x, y: p.y });
      const d = Math.sqrt(distSq(e.x, e.y, p.x, p.y)) || 1;
      const kb = effectiveKb(480);
      e.kx += ((e.x - p.x) / d) * kb;
      e.ky += ((e.y - p.y) / d) * kb;
    }
  }
  addShake(14);
  Sfx.play('boom');
}

function hurtPlayer(e) {
  const p = Game.player;
  if (p.iframe > 0 || p.hp <= 0) return;

  if (p.shieldActive) {
    triggerAntimatterBreak(p);
    return;
  }

  const dmg = Math.max(1, Math.round(e.dmg * (1 - p.stats.armor)));
  p.hp -= dmg;
  p.iframe = CFG.player.iframe;
  Game.flash = 0.9;
  addShake(9);
  addText(p.x, p.y - p.r - 12, '-' + fmt(dmg), '#E63312', 20, { vy: -70 });
  Sfx.play('hurt');

  for (let i = 0; i < Game.enemies.length; i++) {
    const o = Game.enemies[i];
    if (o.dead) continue;
    const dx = o.x - p.x;
    const dy = o.y - p.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    if (d < 130) {
      const kb = effectiveKb(240);
      o.kx += (dx / d) * kb;
      o.ky += (dy / d) * kb;
    }
  }
}

/* ══════════════ 敌方子弹 ══════════════ */
function spawnEBullet(x, y, ang, sp, dmg, color) {
  if (Game.ebullets.length > 320) return;
  Game.ebullets.push({
    x: x, y: y,
    vx: Math.cos(ang) * sp,
    vy: Math.sin(ang) * sp,
    r: 9,
    life: 6,
    dmg: dmg,
    color: color || '#E63312',
    t: 0,
    dead: false,
  });
}

function updateEBullets(dt) {
  const p = Game.player;
  const slowK = 1 - p.stats.slow;

  for (let i = 0; i < Game.ebullets.length; i++) {
    const b = Game.ebullets[i];
    if (b.dead) continue;
    b.t += dt;
    b.x += b.vx * slowK * dt;
    b.y += b.vy * slowK * dt;
    b.life -= dt;
    if (b.life <= 0) { b.dead = true; continue; }

    const rr = b.r + p.r;
    if (distSq(b.x, b.y, p.x, p.y) < rr * rr) {
      b.dead = true;
      if (p.iframe <= 0) {
        if (p.shieldActive) {
          triggerAntimatterBreak(p);
        } else {
          const dmg = Math.max(1, Math.round(b.dmg * (1 - p.stats.armor)));
          p.hp -= dmg;
          p.iframe = CFG.player.iframe;
          Game.flash = 0.8;
          addShake(7);
          addText(p.x, p.y - p.r - 12, '-' + fmt(dmg), '#E63312', 20, { vy: -70 });
          Sfx.play('hurt');
        }
      }
      for (let k = 0; k < 7; k++) {
        addParticle(b.x, b.y, rand(-90, 90), rand(-90, 90), rand(1.5, 3.4), b.color, 0.3);
      }
    }
  }
  compact(Game.ebullets);
}

/* ══════════════ 副武器（全面吃基础伤害、暴击与攻速加成） ══════════════ */
function updateOrbs(dt) {
  const p = Game.player;
  const s = p.stats;
  Game.orbPos.length = 0;
  if (s.orbs <= 0) return;

  const spinRate = 2.4 * ((s.speed * currentSpeedMul()) / CFG.player.speed) * (s.midOrb ? 1.25 : 1);
  s.orbPhase += dt * spinRate;
  const or = s.midOrb ? 11 : 9;
  const orbDmgBase = effectiveDmg(s.orbDmg + s.dmg * 0.65);

  for (let i = 0; i < s.orbs; i++) {
    const isOuter = s.capOrb && (i % 2 === 1);
    const R = (60 + s.orbs * 3) + (isOuter ? 28 : 0);
    const a = (isOuter ? -s.orbPhase * 0.85 : s.orbPhase) + (i * TAU) / s.orbs;
    const ox = p.x + Math.cos(a) * R;
    const oy = p.y + Math.sin(a) * R;
    Game.orbPos.push({ x: ox, y: oy, r: or, outer: isOuter });

    for (let j = 0; j < Game.enemies.length; j++) {
      const e = Game.enemies[j];
      if (e.dead || e.orbCd > 0) continue;
      const rr = e.r + or;
      if (distSq(ox, oy, e.x, e.y) < rr * rr) {
        e.orbCd = 0.3;
        const isCrit = Math.random() < s.crit;
        const dmg = orbDmgBase * (isCrit ? s.critMult : 1);
        damageEnemy(e, dmg, isCrit, { x: ox, y: oy });

        const dd = Math.sqrt(distSq(e.x, e.y, ox, oy)) || 1;
        const rx = (e.x - ox) / dd;
        const ry = (e.y - oy) / dd;
        if (s.capOrb) {
          // 切线甩出，强力引爆台球碰撞
          const kb = effectiveKb(340);
          e.kx += (-ry + rx * 0.35) * kb;
          e.ky += (rx + ry * 0.35) * kb;
        } else {
          const kb = effectiveKb(210);
          e.kx += rx * kb;
          e.ky += ry * kb;
        }
        addParticle(ox, oy, rand(-60, 60), rand(-60, 60), rand(1.5, 3), '#4F3CC9', 0.25);
      }
    }
  }
}

function updateSub(dt) {
  const s = Game.player.stats;

  if (s.chainLv > 0) {
    s.chainT -= dt;
    if (s.chainT <= 0) {
      s.chainT = Math.max(0.7, 2.4 * (s.fireInterval / CFG.player.fireInterval) * (s.midChain ? 0.8 : 1));
      castChain();
    }
  }
  if (s.shockLv > 0) {
    s.shockT -= dt;
    if (s.shockT <= 0) {
      s.shockT = s.midShock ? 2.24 : 2.8;
      castShock();
    }
  }
  if (s.missileLv > 0) {
    s.missileT -= dt;
    if (s.missileT <= 0) {
      s.missileT = 1.9;
      fireMissiles();
    }
  }
}

function castChain() {
  const p = Game.player;
  const s = p.stats;
  const pts = [[p.x, p.y]];
  const hit = new Set();
  let fromX = p.x;
  let fromY = p.y;
  const jumps = 1 + s.chainJumps;
  const baseChainDmg = effectiveDmg(s.chainDmg + s.dmg * 0.85);

  for (let i = 0; i < jumps; i++) {
    const range = (i === 0 ? 360 : 250) * (s.midChain ? 1.35 : 1);
    let best = null;
    let bd = range * range;
    for (let j = 0; j < Game.enemies.length; j++) {
      const e = Game.enemies[j];
      if (e.dead || hit.has(e.id)) continue;
      const d = distSq(fromX, fromY, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) break;
    hit.add(best.id);
    const isCrit = Math.random() < s.crit;
    damageEnemy(best, baseChainDmg * (isCrit ? s.critMult : 1), isCrit, { x: fromX, y: fromY });
    if (s.capChain) best.slowT = Math.max(best.slowT, 1.4);
    pts.push([best.x, best.y]);
    fromX = best.x;
    fromY = best.y;
  }

  if (pts.length > 1) {
    Game.fx.push({ kind: 'chain', pts: pts, life: 0.22, max: 0.22, color: '#0055FF', dead: false });
    Sfx.play('zap');
  }
}

function castShock() {
  const p = Game.player;
  const s = p.stats;
  const shockDmg = effectiveDmg(s.shockDmg + s.dmg * 1.2);

  if (s.capShock) {
    // 【觉醒 · 引力坍缩】先聚拢撞击，0.3s 后剧烈炸开
    const pullR = s.shockR * 1.6;
    Game.fx.push({ kind: 'ring', x: p.x, y: p.y, r: pullR * 0.85, maxR: pullR, life: 0.26, max: 0.26, color: '#4F3CC9', dead: false });
    for (let i = 0; i < Game.enemies.length; i++) {
      const e = Game.enemies[i];
      if (e.dead) continue;
      const rr = pullR + e.r;
      if (distSq(p.x, p.y, e.x, e.y) < rr * rr) {
        const d = Math.sqrt(distSq(e.x, e.y, p.x, p.y)) || 1;
        const pull = Math.min(d * 2.4, 340);
        e.kx += ((p.x - e.x) / d) * pull;
        e.ky += ((p.y - e.y) / d) * pull;
      }
    }
    Game.implosions.push({ x: p.x, y: p.y, t: 0.3, r: s.shockR * 1.25, dmg: shockDmg * 1.35, dead: false });
    Sfx.play('zap');
    return;
  }

  Game.fx.push({ kind: 'ring', x: p.x, y: p.y, r: 8, maxR: s.shockR, life: 0.42, max: 0.42, color: '#0055FF', dead: false });
  for (let i = 0; i < Game.enemies.length; i++) {
    const e = Game.enemies[i];
    if (e.dead) continue;
    const rr = s.shockR + e.r;
    if (distSq(p.x, p.y, e.x, e.y) < rr * rr) {
      const isCrit = Math.random() < s.crit;
      damageEnemy(e, shockDmg * (isCrit ? s.critMult : 1), isCrit, { x: p.x, y: p.y });
      const d = Math.sqrt(distSq(e.x, e.y, p.x, p.y)) || 1;
      const kb = effectiveKb(380);
      e.kx += ((e.x - p.x) / d) * kb;
      e.ky += ((e.y - p.y) / d) * kb;
    }
  }
  Sfx.play('boom');
}

function fireMissiles() {
  const p = Game.player;
  const s = p.stats;
  const count = s.missileLv + Math.floor((s.bullets - 1) / 2);
  const missileDmg = effectiveDmg(s.missileDmg + s.dmg * 0.9);
  const mPierce = Math.floor(s.pierce * 0.5) + (s.midMissile ? 1 : 0);
  const mSplit = s.split > 0 ? 1 : 0;

  for (let i = 0; i < count; i++) {
    spawnBullet(p.x, p.y, rand(0, TAU), {
      dmg: missileDmg,
      homing: true,
      cluster: s.capMissile,
      pierce: mPierce,
      bounce: 0,
      split: mSplit,
      r: 7,
      speed: s.midMissile ? 546 : 420,
      life: 3.2,
      color: '#008B74',
    });
  }
}

/* ══════════════ 掉落与拾取 ══════════════ */
function dropXp(x, y, v) {
  const p = Game.player;
  const val = v * p.stats.xpMul;
  if (Game.xpOrbs.length >= CFG.maxXpOrbs) { gainXp(val); return; }
  const a = Math.atan2(p.y - y, p.x - x);
  const sp = rand(50, 105);
  Game.xpOrbs.push({
    x: x, y: y,
    vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
    v: val,
    r: 3 + Math.min(4, v),
    t: 0, mag: 0, dead: false,
  });
}

function rollDrop(e) {
  if (e.boss) return;
  const p = Game.player;
  const d = getDifficulty();
  const lowHp = p && (p.hp < p.maxHp * 0.35);
  const healChance = (lowHp ? 0.018 : 0.008) + (d.healBonus || 0);
  const r = Math.random();
  if (r < healChance) dropPickup(e.x, e.y, 'heal');
  else if (r < healChance + 0.008) dropPickup(e.x, e.y, 'magnet');
  else if (r < healChance + 0.012) dropPickup(e.x, e.y, 'bomb');
}

function dropPickup(x, y, kind) {
  if (Game.pickups.length > 24) return;
  Game.pickups.push({ x: x, y: y, kind: kind, r: 13, t: 0, dead: false });
}

function triggerCoreBreakthrough(p, tier, oldDmg, newDmg) {
  Game.fx.push({ kind: 'ring', x: p.x, y: p.y, r: 10, maxR: 230, life: 0.45, max: 0.45, color: '#FFB800', dead: false });
  Game.fx.push({ kind: 'ring', x: p.x, y: p.y, r: 4, maxR: 150, life: 0.34, max: 0.34, color: '#0055FF', dead: false });
  for (let i = 0; i < Game.enemies.length; i++) {
    const e = Game.enemies[i];
    if (e.dead) continue;
    const rr = 220 + e.r;
    if (distSq(p.x, p.y, e.x, e.y) <= rr * rr) {
      const dd = Math.sqrt(distSq(e.x, e.y, p.x, p.y)) || 1;
      const kb = effectiveKb(320);
      e.kx += ((e.x - p.x) / dd) * kb;
      e.ky += ((e.y - p.y) / dd) * kb;
    }
  }
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * TAU;
    addParticle(p.x, p.y, Math.cos(a) * 180, Math.sin(a) * 180, 3.0, k % 2 === 0 ? '#FFB800' : '#0055FF', 0.36, 'square', a, 10);
  }
  addText(
    p.x, p.y - 54,
    '✦ 核心跃迁 TIER ' + tierRoman(tier) + ' · 伤 ' + fmt(oldDmg) + '→' + fmt(newDmg),
    '#E63312', 23, { crit: true, vy: -88, life: 1.15 }
  );
  addShake(8);
  Sfx.play('beacon');
}

function gainXp(v) {
  Game.xp += v;
  const p = Game.player;
  while (Game.xp >= Game.xpNeed) {
    Game.xp -= Game.xpNeed;
    Game.level++;
    Game.xpNeed = xpNeedFor(Game.level);
    if (p && Game.level % 5 === 0) {
      const oldDmg = Math.round(effectiveDmg());
      p.coreTier = Math.max(p.coreTier || 1, 1 + Math.floor(Game.level / 5));
      p.stats.dmg += 1;
      p.stats.dmgMul *= 1.95;
      const oldHp = p.maxHp;
      p.maxHp = Math.round(p.maxHp * 1.55);
      p.hp = Math.min(p.maxHp, p.hp + Math.max(4, p.maxHp - oldHp));
      const newDmg = Math.round(effectiveDmg());
      triggerCoreBreakthrough(p, p.coreTier, oldDmg, newDmg);
    }
    Game.pendingLevel++;
  }
}

function updateDrops(dt) {
  const p = Game.player;
  const pr = p.relics.singularityMagnet ? 4000 : p.stats.pickup;
  const pr2 = pr * pr;

  for (let i = 0; i < Game.xpOrbs.length; i++) {
    const o = Game.xpOrbs[i];
    o.t += dt;
    o.x += o.vx * dt;
    o.y += o.vy * dt;
    const fr = Math.max(0, 1 - 4 * dt);
    o.vx *= fr;
    o.vy *= fr;

    const d2 = distSq(o.x, o.y, p.x, p.y);

    if (o.mag > 0 || p.relics.singularityMagnet) {
      if (o.mag > 0) o.mag -= dt;
      const d = Math.sqrt(d2) || 1;
      const sp = o.mag > 0 ? 1100 : 720;
      o.x += ((p.x - o.x) / d) * sp * dt;
      o.y += ((p.y - o.y) / d) * sp * dt;
    } else if (d2 < pr2) {
      const d = Math.sqrt(d2) || 1;
      const sp = 250 + (1 - d / pr) * 640;
      o.x += ((p.x - o.x) / d) * sp * dt;
      o.y += ((p.y - o.y) / d) * sp * dt;
    } else if (d2 < pr2 * 2.25) {
      const d = Math.sqrt(d2) || 1;
      const range = pr * 1.5;
      const sp = 120 + 90 * (1 - d / range);
      o.x += ((p.x - o.x) / d) * sp * dt;
      o.y += ((p.y - o.y) / d) * sp * dt;
    }

    if (d2 < (p.r + 13) * (p.r + 13)) {
      gainXp(o.v);
      o.dead = true;
      addParticle(o.x, o.y, 0, -60, 3.6, '#00A86B', 0.22);
      Sfx.play('pick');
      if (p.relics.singularityMagnet) {
        p.xpPickCount++;
        if (p.xpPickCount % 15 === 0) castChain();
      }
    }
  }
  compact(Game.xpOrbs);

  for (let i = 0; i < Game.pickups.length; i++) {
    const it = Game.pickups[i];
    it.t += dt;
    if (distSq(it.x, it.y, p.x, p.y) < (p.r + it.r) * (p.r + it.r)) {
      applyPickup(it);
      it.dead = true;
    }
  }
  compact(Game.pickups);
}

function applyPickup(it) {
  const p = Game.player;
  if (it.kind === 'heal') {
    const healAmt = Math.max(5, Math.round(p.maxHp * 0.25));
    p.hp = Math.min(p.maxHp, p.hp + healAmt);
    addText(p.x, p.y - 34, '+' + fmt(healAmt), '#008F5A', 22);
    Sfx.play('pick');
  } else if (it.kind === 'magnet') {
    for (let i = 0; i < Game.xpOrbs.length; i++) Game.xpOrbs[i].mag = 1.6;
    addText(p.x, p.y - 34, '磁力回收', '#0055FF', 18);
    Sfx.play('zap');
  } else if (it.kind === 'bomb') {
    const nukeDmg = Math.max(99999999, Math.round(effectiveDmg() * 500));
    for (let i = 0; i < Game.enemies.length; i++) {
      const e = Game.enemies[i];
      if (e.dead) continue;
      if (distSq(e.x, e.y, p.x, p.y) < 430 * 430) damageEnemy(e, nukeDmg, false, null);
    }
    Game.fx.push({ kind: 'ring', x: p.x, y: p.y, r: 12, maxR: 430, life: 0.5, max: 0.5, color: '#E63312', dead: false });
    addShake(16);
    Sfx.play('boom');
  }
}

/* ══════════════ 特效 ══════════════ */
function addParticle(x, y, vx, vy, r, color, life, shape, rot, vRot) {
  if (Game.particles.length > 640) return;
  Game.particles.push({
    x: x, y: y, vx: vx, vy: vy,
    r: r,
    color: color,
    life: life, max: life,
    shape: shape || 'circle',
    rot: rot !== undefined ? rot : rand(0, TAU),
    vRot: vRot !== undefined ? vRot : rand(-12, 12),
    dead: false,
  });
}

function addText(x, y, str, color, size, opt) {
  if (Game.texts.length > 140) return;
  const o = opt || {};
  const life = o.life || 0.78;
  Game.texts.push({
    x: x, y: y,
    vx: o.vx || 0,
    vy: o.vy !== undefined ? o.vy : -64,
    str: str,
    color: color,
    size: size,
    crit: !!o.crit,
    life: life,
    max: life,
    dead: false,
  });
}

function addShake(v) {
  Game.shake = Math.min(26, Game.shake + v);
}

function updateParticles(dt) {
  const arr = Game.particles;
  for (let i = 0; i < arr.length; i++) {
    const q = arr[i];
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    if (q.vRot) q.rot += q.vRot * dt;
    const fr = Math.max(0, 1 - 3.2 * dt);
    q.vx *= fr;
    q.vy *= fr;
    q.life -= dt;
    if (q.life <= 0) q.dead = true;
  }
  compact(arr);
}

function updateTexts(dt) {
  for (let i = 0; i < Game.texts.length; i++) {
    const t = Game.texts[i];
    t.x += (t.vx || 0) * dt;
    t.y += t.vy * dt;
    const fr = Math.max(0, 1 - 2.6 * dt);
    t.vx = (t.vx || 0) * fr;
    t.vy *= fr;
    t.life -= dt;
    if (t.life <= 0) t.dead = true;
  }
  compact(Game.texts);
}

function updateFx(dt) {
  for (let i = 0; i < Game.fx.length; i++) {
    const f = Game.fx[i];
    f.life -= dt;
    if (f.kind === 'ring') f.r = f.maxR * (1 - f.life / f.max);
    if (f.life <= 0) f.dead = true;
  }
  compact(Game.fx);
}

/* ══════════════ 查询 ══════════════ */
function aimAngle(from, t) {
  const dx = t.x - from.x;
  const dy = t.y - from.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  const lead = Math.min(0.3, d / CFG.player.bulletSpeed);
  const tx = t.x + (t.vx || 0) * lead;
  const ty = t.y + (t.vy || 0) * lead;
  return Math.atan2(ty - from.y, tx - from.x);
}

function findNearestEnemy(x, y, maxDist) {
  let best = null;
  let bd = maxDist * maxDist;
  const arr = Game.enemies;
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i];
    if (e.dead) continue;
    const d = distSq(x, y, e.x, e.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function findNearestEnemyExcept(x, y, maxDist, skip) {
  let best = null;
  let bd = maxDist * maxDist;
  const arr = Game.enemies;
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i];
    if (e.dead || skip.has(e.id)) continue;
    const d = distSq(x, y, e.x, e.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

/* ══════════════ 升级与遗物卡池 ══════════════ */
function rollSkills(n) {
  const owned = Game.owned;
  const pool = [];
  for (let i = 0; i < SKILLS.length; i++) {
    const s = SKILLS[i];
    if ((owned[s.id] || 0) < s.maxLv) pool.push(s);
  }

  const out = [];
  // 若已有在修功法，保底至少 1 张出自已修功法，方便一路专修到大成
  const ownedPool = pool.filter(s => (owned[s.id] || 0) > 0);
  if (ownedPool.length > 0 && out.length < n) {
    ownedPool.sort((a, b) => (owned[b.id] || 0) - (owned[a.id] || 0));
    const pickOwned = Math.random() < 0.68 ? ownedPool[0] : pick(ownedPool);
    const pIdx = pool.indexOf(pickOwned);
    if (pIdx >= 0) {
      pool.splice(pIdx, 1);
      out.push({ skill: pickOwned, lv: owned[pickOwned.id] || 0 });
    }
  }

  while (out.length < n && pool.length > 0) {
    const weights = pool.map(function (s) {
      const lv = owned[s.id] || 0;
      let w = lv > 0 ? (4.5 + lv * 1.1) * (lv >= 3 ? 1.55 : 1) : 1;
      if (s.midLv && lv + 1 === s.midLv) w *= 1.35;
      if (lv + 1 === s.maxLv && s.capstoneDesc) w *= 1.5;
      if (s.type === 'attack') w *= 1.4;
      return w;
    });
    let total = 0;
    for (let i = 0; i < weights.length; i++) total += weights[i];
    let r = Math.random() * total;
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) { idx = i; break; }
    }
    const s = pool.splice(idx, 1)[0];
    out.push({ skill: s, lv: owned[s.id] || 0 });
  }

  const hasCore = out.some(function (o) {
    return o.skill.type === 'attack' || o.skill.type === 'sub';
  });
  if (!hasCore && out.length > 0) {
    let idx = -1;
    for (let i = 0; i < pool.length; i++) {
      if (pool[i].type === 'attack' || pool[i].type === 'sub') { idx = i; break; }
    }
    if (idx >= 0) {
      const s = pool.splice(idx, 1)[0];
      const last = out.length - 1;
      pool.push(out[last].skill);
      out[last] = { skill: s, lv: owned[s.id] || 0 };
    }
  }
  return out;
}

function rollRelics(n) {
  const pool = RELICS.filter(r => !Game.ownedRelics[r.id]);
  const out = [];
  while (out.length < n && pool.length > 0) {
    const idx = randInt(0, pool.length - 1);
    out.push({ relic: pool.splice(idx, 1)[0] });
  }
  return out;
}

/* ══════════════ 渲染 ══════════════ */
function buildMenuBalls() {
  Game.menuBalls.length = 0;
  const colors = ['#E63312', '#0055FF', '#FFB800', '#111315', '#00A86B', '#4F3CC9'];
  for (let i = 0; i < 20; i++) {
    Game.menuBalls.push({
      x: rand(0, 2400), y: rand(0, 1400),
      r: rand(9, 32),
      vx: rand(-14, 14), vy: rand(-14, 14),
      c: pick(colors),
      hp: randInt(1, 128),
    });
  }
}

function render() {
  const ctx = Game.ctx;
  if (!ctx) return;
  const W = Game.W;
  const H = Game.H;

  ctx.setTransform(Game.dpr, 0, 0, Game.dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  if (Game.state === 'menu' || !Game.player) {
    renderMenu(ctx);
    return;
  }

  Render.background(ctx, Game.cam, W, H);

  const sx = Game.shake > 0.3 ? rand(-Game.shake, Game.shake) : 0;
  const sy = Game.shake > 0.3 ? rand(-Game.shake, Game.shake) : 0;

  ctx.save();
  ctx.translate(W / 2 - Game.cam.x + sx, H / 2 - Game.cam.y + sy);
  drawWorld(ctx);
  ctx.restore();

  drawBeaconIndicators(ctx, W, H);

  if (Game.flash > 0.01) {
    ctx.fillStyle = 'rgba(230,51,18,' + (Game.flash * 0.16).toFixed(3) + ')';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(230,51,18,' + (Game.flash * 0.7).toFixed(3) + ')';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, W - 6, H - 6);
  }
}

function renderMenu(ctx) {
  Render.background(ctx, { x: Game.menuT * 14, y: Game.menuT * 7 }, Game.W, Game.H);

  for (let i = 0; i < Game.menuBalls.length; i++) {
    const b = Game.menuBalls[i];
    let x = (b.x + Game.menuT * b.vx) % (Game.W + 160);
    let y = (b.y + Game.menuT * b.vy) % (Game.H + 160);
    if (x < 0) x += Game.W + 160;
    if (y < 0) y += Game.H + 160;
    x -= 80;
    y -= 80;
    Render.drawBall(ctx, x, y, b.r, b.c);
    const txtCol = b.c === '#FFB800' ? '#111315' : '#ffffff';
    Render.text(ctx, String(b.hp), x, y, Math.min(b.r * 1.1, 24), txtCol, null, 800);
  }
}

function drawWorld(ctx) {
  const p = Game.player;

  /* 几何信标（地面层） */
  drawBeacons(ctx);

  /* 经验球 */
  for (let i = 0; i < Game.xpOrbs.length; i++) {
    const o = Game.xpOrbs[i];
    Render.drawBall(ctx, o.x, o.y, o.r + 1.5, '#00A86B', '#007A4D');
  }

  /* 道具 */
  for (let i = 0; i < Game.pickups.length; i++) {
    drawPickup(ctx, Game.pickups[i]);
  }

  /* 残影诱饵 */
  for (let i = 0; i < Game.decoys.length; i++) {
    const d = Game.decoys[i];
    const ratio = clamp(d.life / d.max, 0, 1);
    ctx.save();
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r + 6, -Math.PI / 2, -Math.PI / 2 + TAU * ratio);
    ctx.strokeStyle = '#0055FF';
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.globalAlpha = 0.65;
    Render.drawBall(ctx, d.x, d.y, d.r * 0.85, '#0055FF', '#111315');
    ctx.restore();
  }

  /* 冲锋红线预警 & 相位棱镜连线（敌球下层） */
  for (let i = 0; i < Game.enemies.length; i++) {
    const e = Game.enemies[i];
    if (e.dead) continue;
    if (e.type === 'charger' && e.chargeState === 'warn') {
      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([7, 5]);
      ctx.moveTo(e.x, e.y);
      const ca = Math.atan2(e.chargeTy - e.y, e.chargeTx - e.x);
      ctx.lineTo(e.x + Math.cos(ca) * 320, e.y + Math.sin(ca) * 320);
      ctx.strokeStyle = 'rgba(230, 51, 18, 0.85)';
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.restore();
    } else if (e.type === 'shielder' && e.links.length > 0) {
      ctx.save();
      ctx.beginPath();
      for (let k = 0; k < e.links.length; k++) {
        const tgt = findEnemyById(e.links[k]);
        if (tgt && !tgt.dead) {
          ctx.moveTo(e.x, e.y);
          ctx.lineTo(tgt.x, tgt.y);
        }
      }
      ctx.strokeStyle = 'rgba(2, 132, 199, 0.65)';
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.restore();
    } else if (e.boss && e.bossTier === 2 && e.laserState !== 'idle') {
      const beamLen = 520;
      ctx.save();
      for (let b = 0; b < 2; b++) {
        const ba = e.laserAngle + b * (Math.PI / 2);
        const x1 = e.x - Math.cos(ba) * beamLen;
        const y1 = e.y - Math.sin(ba) * beamLen;
        const x2 = e.x + Math.cos(ba) * beamLen;
        const y2 = e.y + Math.sin(ba) * beamLen;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        if (e.laserState === 'warn') {
          ctx.setLineDash([8, 8]);
          ctx.strokeStyle = 'rgba(230, 51, 18, 0.65)';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          ctx.setLineDash([]);
          ctx.strokeStyle = '#E63312';
          ctx.lineWidth = 8;
          ctx.stroke();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  /* 敌人 */
  for (let i = 0; i < Game.enemies.length; i++) {
    const e = Game.enemies[i];
    if (e.dead) continue;
    const col = e.flash > 0 ? '#FFFFFF' : e.color;
    const stroke = e.flash > 0 ? e.color : (e.golden ? '#111315' : shade(e.color, -0.25));

    const jx = e.hitShake > 0.2 ? rand(-e.hitShake, e.hitShake) : 0;
    const jy = e.hitShake > 0.2 ? rand(-e.hitShake, e.hitShake) : 0;
    const ex = e.x + jx;
    const ey = e.y + jy;

    ctx.save();
    ctx.translate(ex, ey);
    if (e.squash > 0.01) {
      ctx.rotate(e.squashAngle);
      ctx.scale(1 - e.squash * 0.65, 1 + e.squash * 0.85);
    }
    Render.drawBall(ctx, 0, 0, e.r, col, stroke);
    ctx.restore();

    if (e.shielded > 0) {
      ctx.beginPath();
      ctx.arc(ex, ey, e.r + 3.5, 0, TAU);
      ctx.strokeStyle = 'rgba(2, 132, 199, 0.78)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (e.golden) {
      ctx.beginPath();
      ctx.arc(ex, ey, e.r + 3.5, 0, TAU);
      ctx.strokeStyle = '#FFB800';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    if (e.boss) {
      drawBossReticle(ctx, { x: ex, y: ey, r: e.r });
    } else {
      Render.hpRing(ctx, { x: ex, y: ey, r: e.r, hp: e.hp, maxHp: e.maxHp });
    }
    if (e.flash <= 0) Render.hpNumber(ctx, { x: ex, y: ey, r: e.r, hp: e.hp });
  }

  /* 环绕卫星轨道与球体 */
  if (Game.orbPos.length > 0) {
    const orbitR = 60 + p.stats.orbs * 3;
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([4, 6]);
    ctx.arc(p.x, p.y, orbitR, 0, TAU);
    ctx.strokeStyle = 'rgba(0, 85, 255, 0.22)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    if (p.stats.capOrb) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, orbitR + 28, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();

    for (let i = 0; i < Game.orbPos.length; i++) {
      const o = Game.orbPos[i];
      Render.drawBall(ctx, o.x, o.y, o.r, o.outer ? '#0055FF' : '#4F3CC9', '#111315');
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r + 3.5, 0, TAU);
      ctx.strokeStyle = o.outer ? 'rgba(0, 85, 255, 0.35)' : 'rgba(79, 60, 201, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  /* 双子核心镜像副球 */
  if (p.relics.twinCore) {
    const tx = p.x + Math.cos(p.twinAngle) * 40;
    const ty = p.y + Math.sin(p.twinAngle) * 40;
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([3, 5]);
    ctx.arc(p.x, p.y, 40, 0, TAU);
    ctx.strokeStyle = 'rgba(217, 119, 6, 0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    Render.drawBall(ctx, tx, ty, 9, '#FFB800', '#111315');
  }

  /* 玩家子弹（体积、拖尾与外环随伤害量级阶跃进化） */
  for (let i = 0; i < Game.bullets.length; i++) {
    const b = Game.bullets[i];
    const magTier = b.dmg >= 100000 ? 4 : b.dmg >= 10000 ? 3 : b.dmg >= 1000 ? 2 : b.dmg >= 100 ? 1 : 0;
    const visR = b.r + magTier * 1.05;
    const trailSec = 0.022 + magTier * 0.0055;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.vx * trailSec, b.y - b.vy * trailSec);
    ctx.strokeStyle = rgba(b.color, 0.22 + magTier * 0.05);
    ctx.lineWidth = visR * 1.4;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineCap = 'butt';

    if (magTier >= 2) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, visR + 2.8, 0, TAU);
      ctx.strokeStyle = rgba(b.crit ? '#E63312' : b.color, 0.45);
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    const strokeCol = b.crit ? '#111315' : shade(b.color, -0.28);
    Render.drawBall(ctx, b.x, b.y, visR, b.color, strokeCol);
    const numCol = (b.crit || b.color === '#FFB800') ? '#111315' : '#ffffff';
    const bStr = fmt(b.dmg);
    const bFont = bStr.length >= 4 ? Math.max(7.5, visR * 0.78) : bStr.length >= 3 ? Math.max(8.5, visR * 0.94) : Math.max(9.5, visR * 1.15);
    Render.text(ctx, bStr, b.x, b.y, bFont, numCol, null, 800);
  }

  /* 敌方子弹 */
  for (let i = 0; i < Game.ebullets.length; i++) {
    const b = Game.ebullets[i];
    Render.drawBall(ctx, b.x, b.y, b.r, '#ffffff', b.color);
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * 0.55, 0, TAU);
    ctx.fillStyle = b.color;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r + 3.5, 0, TAU);
    ctx.strokeStyle = rgba(b.color, 0.35);
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  /* 玩家 */
  drawPlayer(ctx, p);

  /* 粒子 */
  for (let i = 0; i < Game.particles.length; i++) {
    const q = Game.particles[i];
    const a = clamp(q.life / q.max, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = q.color;
    ctx.strokeStyle = q.color;

    if (q.shape === 'square') {
      const sz = q.r * (0.6 + a * 0.8) * 2;
      ctx.save();
      ctx.translate(q.x, q.y);
      ctx.rotate(q.rot);
      ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
      ctx.restore();
    } else if (q.shape === 'needle') {
      const len = q.r * (1.2 + a * 2.2);
      const w = Math.max(1, q.r * 0.45);
      ctx.save();
      ctx.translate(q.x, q.y);
      ctx.rotate(q.rot);
      ctx.beginPath();
      ctx.moveTo(-len * 0.3, 0);
      ctx.lineTo(len * 0.7, 0);
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
    } else if (q.shape === 'cross') {
      const arm = q.r * (0.8 + a * 0.8);
      const barW = Math.max(1.2, arm * 0.32);
      ctx.save();
      ctx.translate(q.x, q.y);
      ctx.rotate(q.rot);
      ctx.fillRect(-arm, -barW / 2, arm * 2, barW);
      ctx.fillRect(-barW / 2, -arm, barW, arm * 2);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.r * (0.4 + a * 0.6), 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  /* 特效 */
  for (let i = 0; i < Game.fx.length; i++) {
    const f = Game.fx[i];
    const a = clamp(f.life / f.max, 0, 1);
    if (f.kind === 'ring') {
      const lw = Math.min(Math.max(1.2, f.maxR * 0.15), 1.5 + 3 * a);
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, TAU);
      ctx.strokeStyle = rgba(f.color, a * 0.85);
      ctx.lineWidth = lw;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(f.x, f.y, Math.max(0.5, f.r * 0.9), 0, TAU);
      ctx.strokeStyle = rgba('#111315', a * 0.25);
      ctx.lineWidth = Math.max(0.8, lw * 0.4);
      ctx.stroke();
    } else if (f.kind === 'chain') {
      drawChain(ctx, f, a);
    }
  }

  /* 飘字（高对比度瑞士排版 + 暴击弹性放大跃动） */
  for (let i = 0; i < Game.texts.length; i++) {
    const t = Game.texts[i];
    const prog = clamp(1 - t.life / t.max, 0, 1);
    const alpha = prog < 0.58 ? 1 : clamp((1 - prog) / 0.42, 0, 1);
    const pop = t.crit
      ? (prog < 0.16 ? 1 + Math.sin((prog / 0.16) * Math.PI) * 0.36 : 1)
      : (prog < 0.12 ? 1 + Math.sin((prog / 0.12) * Math.PI) * 0.14 : 1);
    const sz = t.size * pop;

    ctx.globalAlpha = alpha;
    if (t.crit) {
      Render.text(ctx, t.str, t.x + 1.5, t.y + 1.5, sz, '#111315', null, 900);
      Render.text(ctx, t.str, t.x, t.y, sz, t.color, '#FFFFFF', 900);
    } else {
      Render.text(ctx, t.str, t.x, t.y, sz, t.color, 'rgba(255,255,255,0.95)', 900);
    }
  }
  ctx.globalAlpha = 1;
}

function drawBeacons(ctx) {
  const p = Game.player;
  for (let i = 0; i < Game.beacons.length; i++) {
    const b = Game.beacons[i];
    if (b.dead) continue;
    const inside = p && distSq(p.x, p.y, b.x, b.y) <= b.r * b.r;
    const ratio = clamp(b.prog / b.need, 0, 1);
    const col = b.reward.color;

    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.beginPath();
    ctx.arc(0, 0, b.r, 0, TAU);
    ctx.fillStyle = rgba(col, inside ? 0.08 : 0.035);
    ctx.fill();

    if (!inside) ctx.setLineDash([8, 6]);
    ctx.rotate(Game.time * 0.35);
    ctx.beginPath();
    ctx.arc(0, 0, b.r, 0, TAU);
    ctx.strokeStyle = rgba(col, inside ? 0.85 : 0.45);
    ctx.lineWidth = inside ? 2.2 : 1.6;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    if (ratio > 0) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r - 5, -Math.PI / 2, -Math.PI / 2 + TAU * ratio);
      ctx.strokeStyle = col;
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    Render.drawBall(ctx, b.x, b.y, 12, '#FFFFFF', col);
    Render.text(ctx, b.reward.label + ' · ' + Math.ceil(b.life) + 's', b.x, b.y - 24, 11, col, 'rgba(247,246,242,0.92)', 800);
  }
}

function drawBeaconIndicators(ctx, W, H) {
  for (let i = 0; i < Game.beacons.length; i++) {
    const b = Game.beacons[i];
    if (b.dead) continue;
    const sx = b.x - Game.cam.x + W / 2;
    const sy = b.y - Game.cam.y + H / 2;
    if (sx >= 24 && sx <= W - 24 && sy >= 24 && sy <= H - 24) continue;

    const ang = Math.atan2(sy - H / 2, sx - W / 2);
    const pad = 34;
    const ix = clamp(sx, pad, W - pad);
    const iy = clamp(sy, pad, H - pad);
    const dist = Math.round(Math.hypot(b.x - Game.cam.x, b.y - Game.cam.y));

    ctx.save();
    ctx.translate(ix, iy);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-7, -7);
    ctx.lineTo(-7, 7);
    ctx.closePath();
    ctx.fillStyle = b.reward.color;
    ctx.fill();
    ctx.strokeStyle = '#111315';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    Render.text(ctx, dist + 'm', ix, iy + 16, 10, '#111315', 'rgba(247,246,242,0.9)', 800);
  }
}

function drawBossReticle(ctx, e) {
  const rot = Game.time * 0.7;
  const r1 = e.r + 9;
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.arc(0, 0, r1, 0, TAU);
  ctx.strokeStyle = '#E63312';
  ctx.lineWidth = 2;
  ctx.stroke();

  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (r1 - 4), Math.sin(a) * (r1 - 4));
    ctx.lineTo(Math.cos(a) * (r1 + 6), Math.sin(a) * (r1 + 6));
    ctx.strokeStyle = '#E63312';
    ctx.lineWidth = 2.4;
    ctx.stroke();
  }
  ctx.restore();
}

function drawPickup(ctx, it) {
  const pulse = 1 + Math.sin(it.t * 6) * 0.06;
  const r = it.r * pulse;
  const bg = it.kind === 'heal' ? '#FFFFFF' : it.kind === 'magnet' ? '#0055FF' : '#111315';
  const sc = it.kind === 'heal' ? '#E63312' : it.kind === 'magnet' ? '#003BB5' : '#111315';

  Render.drawBall(ctx, it.x, it.y, r, bg, sc);

  ctx.save();
  ctx.translate(it.x, it.y);
  if (it.kind === 'heal') {
    ctx.fillStyle = '#E63312';
    ctx.fillRect(-2.1, -6.2, 4.2, 12.4);
    ctx.fillRect(-6.2, -2.1, 12.4, 4.2);
  } else if (it.kind === 'magnet') {
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0.8, 4.5, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-5.8, 0.8, 3, 4.4);
    ctx.fillRect(2.8, 0.8, 3, 4.4);
  } else {
    ctx.fillStyle = '#FFB800';
    ctx.beginPath();
    ctx.arc(0, 0.5, 4.8, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#FFB800';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(0, 8);
    ctx.moveTo(-7, 0.5); ctx.lineTo(7, 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPlayer(ctx, p) {
  const orb = getOrb(p.orbId);
  for (let i = 0; i < p.trail.length; i++) {
    const t = p.trail[i];
    const ratio = t.life / 0.28;
    ctx.globalAlpha = ratio * 0.35;
    ctx.beginPath();
    ctx.arc(t.x, t.y, p.r * (0.7 + ratio * 0.25), 0, TAU);
    ctx.strokeStyle = orb.color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const tier = clamp(p.coreTier || 1, 1, 5);
  const drawR = p.r + (tier - 1) * 1.1;
  const pulse = 1 + Math.sin(Game.time * 4) * 0.035;
  let alpha = 1;
  if (p.iframe > 0) alpha = 0.45 + Math.abs(Math.sin(Game.time * 34)) * 0.45;

  // 核心阶跃外环进化（TIER II ~ V 瑞士几何精密装甲环）
  if (tier >= 2) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Game.time * 0.55);
    const rOuter = drawR + 5.5;
    ctx.beginPath();
    ctx.arc(0, 0, rOuter, 0, TAU);
    ctx.strokeStyle = rgba(orb.ringColor, tier >= 4 ? 0.52 : 0.34);
    ctx.lineWidth = 1.4;
    ctx.stroke();
    const tickCount = tier >= 5 ? 8 : 4;
    for (let k = 0; k < tickCount; k++) {
      const ta = (k / tickCount) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ta) * (rOuter - 2.5), Math.sin(ta) * (rOuter - 2.5));
      ctx.lineTo(Math.cos(ta) * (rOuter + 3.2), Math.sin(ta) * (rOuter + 3.2));
      ctx.strokeStyle = k % 2 === 0 ? '#111315' : orb.ringColor;
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }
    if (tier >= 3) {
      ctx.rotate(-Game.time * 1.05);
      const sq = (drawR + 7.5) * 0.74;
      ctx.strokeStyle = rgba('#111315', 0.24);
      ctx.lineWidth = 1.2;
      ctx.strokeRect(-sq, -sq, sq * 2, sq * 2);
    }
    if (tier >= 4) {
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.arc(0, 0, drawR + 10.5, 0, TAU);
      ctx.strokeStyle = rgba(tier >= 5 ? '#FFB800' : '#0055FF', 0.55);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  ctx.globalAlpha = alpha;
  Render.drawBall(ctx, p.x, p.y, drawR * pulse, orb.color, orb.stroke);

  ctx.save();
  ctx.translate(p.x, p.y);
  if (orb.id === 'crimson') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-1.8, -5.8, 3.6, 11.6);
    ctx.fillRect(-5.8, -1.8, 11.6, 3.6);
  } else if (orb.id === 'amber') {
    ctx.rotate(Game.time * 1.4);
    ctx.strokeStyle = '#111315';
    ctx.lineWidth = 1.8;
    ctx.strokeRect(-4.2, -4.2, 8.4, 8.4);
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, 4.2, 0, TAU);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  // 反物质护盾外环
  if (p.shieldActive) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Game.time * 0.9);
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const ha = (k / 6) * TAU;
      const hx = Math.cos(ha) * (p.r + 12);
      const hy = Math.sin(ha) * (p.r + 12);
      if (k === 0) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    ctx.strokeStyle = '#E63312';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // 超频光环
  if (p.overclockT > 0 || p.beaconBuffT > 0) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 11, 0, TAU);
    ctx.strokeStyle = p.beaconBuffT > 0 ? '#FFB800' : '#0055FF';
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r + 3.5, 0, TAU);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2.6;
  ctx.stroke();

  const rr = p.r + 7.5 + Math.sin(Game.time * 3) * 1.2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, rr, 0, TAU);
  ctx.strokeStyle = 'rgba(17, 19, 21, 0.35)';
  ctx.lineWidth = 1.25;
  ctx.stroke();

  const a = p.facing;
  const tx = p.x + Math.cos(a) * (p.r + 6);
  const ty = p.y + Math.sin(a) * (p.r + 6);
  ctx.beginPath();
  ctx.arc(tx, ty, 3.2, 0, TAU);
  ctx.fillStyle = '#111315';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(tx, ty, 1.4, 0, TAU);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
}

function drawChain(ctx, f, a) {
  const pts = f.pts;
  const col = f.color || '#0055FF';
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const x1 = pts[i - 1][0], y1 = pts[i - 1][1];
    const x2 = pts[i][0], y2 = pts[i][1];
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const nx = -(y2 - y1);
    const ny = x2 - x1;
    const nl = Math.sqrt(nx * nx + ny * ny) || 1;
    const jitter = (Math.random() - 0.5) * 12;
    ctx.lineTo(mx + (nx / nl) * jitter, my + (ny / nl) * jitter);
    ctx.lineTo(x2, y2);
  }

  ctx.strokeStyle = rgba(col, a * 0.25);
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.strokeStyle = rgba(col, a * 0.95);
  ctx.lineWidth = 2.2;
  ctx.stroke();

  for (let i = 1; i < pts.length; i++) {
    ctx.beginPath();
    ctx.arc(pts[i][0], pts[i][1], 5 * a + 2.5, 0, TAU);
    ctx.fillStyle = rgba('#FFFFFF', a * 0.9);
    ctx.fill();
    ctx.strokeStyle = rgba(col, a * 0.9);
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }
}

/* ══════════════ 启动 ══════════════ */
init();
