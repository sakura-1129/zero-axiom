'use strict';

/* ══════════════════════════════════════════════
   归零法则 · ZERO AXIOM (v2.0 几何物理与肉鸽构筑重构)
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
  orbLasers: [],
  beacons: [],
  decoys: [],
  implosions: [],
  mirrors: [],
  blackholes: [],
  thunderPillars: [],
  lotusArrays: [],

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
  breakthroughFocus: false,

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
      const cat = applyRelicCatalyst(this.player, relic);
      this.pendingRelic = Math.max(0, this.pendingRelic - 1);
      UI.hideLevelUp();
      UI.syncDock(true);
      Sfx.play('level');
      const catTag = cat ? (' · ' + getArchMeta(cat.archId).short + '+' + cat.pts) : '';
      addText(this.player.x, this.player.y - 42, '✦ ' + relic.name + catTag, relic.color, 20);
    } else {
      const p = this.player;
      const oldDmg = Math.round(effectiveDmg());
      const oldHp = p.maxHp;
      const newLv = (this.owned[c.skill.id] || 0) + 1;
      this.owned[c.skill.id] = newLv;
      c.skill.apply(p, newLv);
      applySkillArchPts(p, c.skill);
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
  if (Render.install) Render.install(Game.ctx);
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
  Game.breakthroughFocus = false;
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
  Game.mirrors.length = 0;
  Game.blackholes.length = 0;
  Game.thunderPillars.length = 0;
  Game.lotusArrays.length = 0;
  Game.orbLasers.length = 0;
  Game.cam.x = 0;
  Game.cam.y = 0;

  const orb = getOrb();
  Game.player = {
    x: 0, y: 0, vx: 0, vy: 0, r: c.r,
    orbId: orb.id,
    coreTier: 1,
    archetypes: { xianxia: 0, norse: 0, xuanhuan: 0, arcane: 0, billiard: 0, exact_zero: 0 },
    archStages: { xianxia: 0, norse: 0, xuanhuan: 0, arcane: 0, billiard: 0, exact_zero: 0 },
    primaryArch: null,
    maxedArchs: [],
    stage: 1,
    superposition: null,
    lotusCd: 3.2,
    blackholeCd: 6.2,
    prismPhase: 0,
    norseZoneCd: 0,
    stakeZapT: 0,
    arcaneNetT: 0,
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
      midPinball: false,
      capPinball: false,
      midExact: false,
      capExact: false,
      midRefract: false,
      capRefract: false,
      midMomentum: false,
      capMomentum: false,
      midSlow: false,
      capSlow: false,
      midVamp: false,
      capVamp: false,
      midHp: false,
      capHp: false,
      orbs: 0, orbDmg: 1, orbPhase: 0,
      chainLv: 0, chainT: 2.2, chainDmg: 1.5, chainJumps: 0,
      shockLv: 0, shockT: 2.4, shockDmg: 2.5, shockR: 88,
      missileLv: 0, missileT: 1.6, missileDmg: 1,
    },
  };
}

/* ══════════════ 四阶进化状态机与流派辅助 ══════════════ */
const ARCH_IDS = ['xianxia', 'norse', 'xuanhuan', 'arcane', 'billiard', 'exact_zero'];

const ARCH_FALLBACK = {
  xianxia:    { id: 'xianxia',    code: 'XIAN',   short: '仙侠', label: '国风仙侠', coreName: '太虚剑丸', color: '#00A86B', stages: ['青冥剑胚', '两仪剑胎', '太虚万剑道果'] },
  norse:      { id: 'norse',      code: 'NORSE',  short: '北欧', label: '北欧神话', coreName: '雷神炉心', color: '#4F3CC9', stages: ['卢恩雷石', '锻铁雷锤核', '诸神黄昏炉心'] },
  xuanhuan:   { id: 'xuanhuan',   code: 'XUAN',   short: '玄幻', label: '东方玄幻', coreName: '焚天帝丹', color: '#E63312', stages: ['赤炎丹胚', '子母双色灵丹', '佛怒火莲圣体'] },
  arcane:     { id: 'arcane',     code: 'ARCANE', short: '奥术', label: '英式奥术', coreName: '阿瓦隆星盘', color: '#D97706', stages: ['学徒星徽', '所罗门六芒核', '大魔导天球仪'] },
  billiard:   { id: 'billiard',   code: 'PHYS',   short: '台球', label: '台球物理', coreName: '大师母球', color: '#111315', stages: ['纯白母球', '黑八配重核', '黄金陀螺撞针'] },
  exact_zero: { id: 'exact_zero', code: 'MATH',   short: '归零', label: '数字法则', coreName: '天机归零', color: '#0055FF', stages: ['算筹原核', '游标卡尺核', '天道归零罗盘'] },
};

const COMBOS_FALLBACK = [
  { id: 'xian_xuan',   code: 'XIAN × XUAN',   name: '红莲业火剑仙', pair: ['xianxia', 'xuanhuan'], a: { name: '太虚万剑', col: '#00A86B', type: 'xianxia' },    b: { name: '佛怒火莲', col: '#E63312', type: 'xuanhuan' },   desc: '金丹化火莲丹；飞剑命中直接引爆三层剑气火莲！' },
  { id: 'xian_norse',  code: 'XIAN × NORSE',  name: '九霄雷罚剑域', pair: ['xianxia', 'norse'],    a: { name: '太虚万剑', col: '#00A86B', type: 'xianxia' },    b: { name: '雷神炉心', col: '#4F3CC9', type: 'norse' },      desc: '飞剑化引雷剑桩钉入敌球，自动拉起高压电网并降下天降雷柱！' },
  { id: 'norse_phys',  code: 'NORSE × PHYS',  name: '诸神雷霆保龄', pair: ['norse', 'billiard'],   a: { name: '雷神炉心', col: '#4F3CC9', type: 'norse' },      b: { name: '黄金撞针', col: '#111315', type: 'billiard' },   desc: '被撞飞的敌球化为充能雷球，每次台球对撞直接劈下天降雷柱！' },
  { id: 'xuan_phys',   code: 'XUAN × PHYS',   name: '奇点坍缩开球', pair: ['xuanhuan', 'billiard'],a: { name: '佛怒火莲', col: '#E63312', type: 'xuanhuan' },   b: { name: '黄金撞针', col: '#111315', type: 'billiard' },   desc: '鲲鹏黑洞吸聚敌球后轰入火莲母球，触发连环零距离火莲对撞！' },
  { id: 'arcane_xian', code: 'ARCANE × XIAN', name: '所罗门分光剑阵', pair: ['arcane', 'xianxia'],   a: { name: '魔导天球', col: '#D97706', type: 'arcane' },     b: { name: '太虚万剑', col: '#00A86B', type: 'xianxia' },    desc: '飞剑穿过六芒星棱镜时，1 剑光谱折射分裂为 3 柄黄金激光剑！' },
  { id: 'arcane_zero', code: 'ARCANE × MATH', name: '宿命同调矩阵', pair: ['arcane', 'exact_zero'],a: { name: '魔导天球', col: '#D97706', type: 'arcane' },     b: { name: '天道归零', col: '#0055FF', type: 'exact_zero' }, desc: '激光网连接敌球血量宿命同调，1 球触发精准归零则全网同时殉爆！' },
];

function getMaxUltimates() {
  return typeof MAX_ULTIMATES !== 'undefined' ? MAX_ULTIMATES : 2;
}

function getArchThresholds() {
  return typeof ARCH_THRESHOLDS !== 'undefined'
    ? ARCH_THRESHOLDS
    : { stage1: 1, stage2: 10, stage3: 20, capLocked: 19 };
}

function getArchMeta(id) {
  if (typeof ARCHETYPES !== 'undefined' && ARCHETYPES[id]) return ARCHETYPES[id];
  return ARCH_FALLBACK[id] || ARCH_FALLBACK.xianxia;
}

function getArchStageName(archId, stageIdx0) {
  const m = getArchMeta(archId);
  const st = m && m.stages ? m.stages[stageIdx0] : null;
  if (!st) return m ? (m.coreName || m.short) : '';
  return typeof st === 'string' ? st : (st.name || '');
}

function normalizeCombo(raw, a, b) {
  if (!raw) return null;
  const tA = (raw.a && raw.a.type) || (typeof raw.a === 'string' ? raw.a : (raw.pair && raw.pair[0]) || a);
  const tB = (raw.b && raw.b.type) || (typeof raw.b === 'string' ? raw.b : (raw.pair && raw.pair[1]) || b);
  const mA = getArchMeta(tA);
  const mB = getArchMeta(tB);
  return {
    id: raw.id || [tA, tB].sort().join('_'),
    code: raw.code || (mA.code + ' × ' + mB.code),
    name: raw.name,
    desc: raw.desc || raw.sub || '',
    a: {
      type: tA,
      col: (raw.a && raw.a.col) || mA.color,
      name: (raw.a && raw.a.name) || mA.coreName || mA.short,
    },
    b: {
      type: tB,
      col: (raw.b && raw.b.col) || mB.color,
      name: (raw.b && raw.b.name) || mB.coreName || mB.short,
    },
    isFallback: !!raw.isFallback,
  };
}

function resolveAceCombo(a, b) {
  if (!a || !b || a === b) return null;
  const sorted = [a, b].sort();
  if (typeof COMBO_MAP !== 'undefined' && COMBO_MAP) {
    const keys = [
      sorted.join('|'), sorted.join('+'), sorted.join('_'), sorted.join(':'),
      a + '|' + b, b + '|' + a, a + '+' + b, b + '+' + a, a + '_' + b, b + '_' + a,
    ];
    for (let i = 0; i < keys.length; i++) {
      if (COMBO_MAP[keys[i]]) return normalizeCombo(COMBO_MAP[keys[i]], a, b);
    }
  }
  const lists = [typeof COMBOS !== 'undefined' ? COMBOS : null, COMBOS_FALLBACK];
  for (let l = 0; l < lists.length; l++) {
    const arr = lists[l];
    if (!Array.isArray(arr)) continue;
    for (let i = 0; i < arr.length; i++) {
      const c = arr[i];
      const p0 = (c.pair && c.pair[0]) || (c.a && c.a.type) || (typeof c.a === 'string' ? c.a : null);
      const p1 = (c.pair && c.pair[1]) || (c.b && c.b.type) || (typeof c.b === 'string' ? c.b : null);
      if ((p0 === a && p1 === b) || (p0 === b && p1 === a)) {
        return normalizeCombo(c, a, b);
      }
    }
  }
  return null;
}

function resolveCombo(a, b) {
  const ace = resolveAceCombo(a, b);
  if (ace) return ace;
  const mA = getArchMeta(a);
  const mB = getArchMeta(b);
  return {
    id: [a, b].sort().join('_'),
    code: mA.code + ' × ' + mB.code,
    name: '双极共鸣 · ' + mA.short + '×' + mB.short,
    desc: '两条Ⅲ阶终极法则共鸣叠加，双形态同步释放且所有伤害 +35%。',
    a: { type: a, col: mA.color, name: mA.coreName || mA.short },
    b: { type: b, col: mB.color, name: mB.coreName || mB.short },
    isFallback: true,
  };
}

function getComboPartners(archId) {
  if (!archId) return [];
  if (typeof COMBO_PARTNERS !== 'undefined' && Array.isArray(COMBO_PARTNERS[archId])) {
    return COMBO_PARTNERS[archId];
  }
  const out = [];
  for (let i = 0; i < ARCH_IDS.length; i++) {
    const other = ARCH_IDS[i];
    if (other !== archId && resolveAceCombo(archId, other)) out.push(other);
  }
  return out;
}

function applySkillArchPts(p, skill) {
  if (!p || !p.archetypes || !skill || !skill.archetype) return;
  const archId = skill.archetype;
  if (p.archetypes[archId] === undefined) return;
  const th = getArchThresholds();
  const maxUlt = getMaxUltimates();
  const pts = skill.archPts || 1;
  const locked = p.maxedArchs.length >= maxUlt && p.maxedArchs.indexOf(archId) < 0;
  if (locked) {
    p.archetypes[archId] = Math.min(th.capLocked, (p.archetypes[archId] || 0) + pts);
  } else {
    p.archetypes[archId] = (p.archetypes[archId] || 0) + pts;
  }
  evaluateEvolution(p, archId);
}

function applyRelicCatalyst(p, relic) {
  if (!p || !p.archetypes || !relic) return null;
  const th = getArchThresholds();
  const maxUlt = getMaxUltimates();
  if (p.maxedArchs.length >= maxUlt) return null;

  const pts = relic.catalystPts || 3;
  const cands = Array.isArray(relic.archetypes) ? relic.archetypes : [];
  let eligible = cands.filter(id => (p.archStages[id] || 0) < 3);

  let target = null;
  if (p.maxedArchs.length === 1) {
    const partners = getComboPartners(p.maxedArchs[0]);
    const partnerCands = eligible.filter(id => partners.indexOf(id) >= 0);
    if (partnerCands.length > 0) {
      partnerCands.sort((a, b) => (p.archetypes[b] || 0) - (p.archetypes[a] || 0));
      target = partnerCands[0];
    }
  }
  if (!target && eligible.length > 0) {
    eligible.sort((a, b) => {
      const diff = (p.archetypes[b] || 0) - (p.archetypes[a] || 0);
      if (diff !== 0) return diff;
      return (a === p.primaryArch ? -1 : 0) - (b === p.primaryArch ? -1 : 0);
    });
    target = eligible[0];
  }
  if (!target) {
    if (p.maxedArchs.length === 1) {
      const partners = getComboPartners(p.maxedArchs[0]).filter(id => (p.archStages[id] || 0) < 3);
      if (partners.length > 0) {
        partners.sort((a, b) => (p.archetypes[b] || 0) - (p.archetypes[a] || 0));
        target = partners[0];
      }
    }
  }
  if (!target) {
    const unmaxed = ARCH_IDS.filter(id => (p.archStages[id] || 0) < 3 && (p.archetypes[id] || 0) > 0);
    unmaxed.sort((a, b) => (p.archetypes[b] || 0) - (p.archetypes[a] || 0));
    target = unmaxed[0] || cands[0] || p.primaryArch || 'xianxia';
  }
  if (!target || (p.archStages[target] || 0) >= 3) return null;

  p.archetypes[target] = (p.archetypes[target] || 0) + pts;
  evaluateEvolution(p, target);
  return { archId: target, pts: pts };
}

function onEnterStage2(p, archId) {
  const m = getArchMeta(archId);
  const stName = getArchStageName(archId, 1);
  if (archId === 'xianxia') {
    p.stats.orbs = Math.max(p.stats.orbs || 0, 1);
  }
  Game.fx.push({ kind: 'ring', x: p.x, y: p.y, r: 10, maxR: 165, life: 0.36, max: 0.36, color: m.color, dead: false });
  addText(p.x, p.y - 48, '◆ Ⅱ阶蜕变 · ' + stName, m.color, 20, { crit: true, vy: -80, life: 1.0 });
}

function onEnterStage3(p, archId) {
  const m = getArchMeta(archId);
  const stName = getArchStageName(archId, 2);
  if (archId === 'xianxia') {
    p.stats.orbs = Math.max(p.stats.orbs || 0, 2);
  }
  Game.fx.push({ kind: 'ring', x: p.x, y: p.y, r: 12, maxR: 220, life: 0.44, max: 0.44, color: '#FFB800', dead: false });
  Game.fx.push({ kind: 'ring', x: p.x, y: p.y, r: 6, maxR: 150, life: 0.34, max: 0.34, color: m.color, dead: false });
  addText(p.x, p.y - 54, '★ Ⅲ阶觉醒 · ' + stName, '#FFB800', 22, { crit: true, vy: -86, life: 1.15 });
  addShake(10);
  Sfx.play('beacon');
}

function onEnterStage4(p, combo) {
  if (combo.isFallback && !p._fallbackApplied) {
    p._fallbackApplied = true;
    p.stats.dmgMul *= 1.35;
  }
  Game.fx.push({ kind: 'ring', x: p.x, y: p.y, r: 14, maxR: 260, life: 0.50, max: 0.50, color: combo.a.col, dead: false });
  Game.fx.push({ kind: 'ring', x: p.x, y: p.y, r: 10, maxR: 210, life: 0.44, max: 0.44, color: combo.b.col, dead: false });
  addText(p.x, p.y - 60, '✦ Ⅳ阶叠加态 · ' + combo.name, '#E63312', 24, { crit: true, vy: -92, life: 1.3 });
  addShake(14);
  Sfx.play('beacon');
}

function evaluateEvolution(p, touchedArchId) {
  if (!p || !p.archetypes) return;
  const th = getArchThresholds();
  const maxUlt = getMaxUltimates();

  const order = [];
  if (touchedArchId && ARCH_IDS.indexOf(touchedArchId) >= 0) order.push(touchedArchId);
  for (let i = 0; i < ARCH_IDS.length; i++) {
    if (order.indexOf(ARCH_IDS[i]) < 0) order.push(ARCH_IDS[i]);
  }

  for (let i = 0; i < order.length; i++) {
    const id = order[i];
    const prevSt = p.archStages[id] || 0;
    if (p.maxedArchs.length >= maxUlt && p.maxedArchs.indexOf(id) < 0) {
      if ((p.archetypes[id] || 0) > th.capLocked) p.archetypes[id] = th.capLocked;
    }
    const pts = p.archetypes[id] || 0;
    let newSt = 0;
    if (pts >= th.stage3 && (p.maxedArchs.length < maxUlt || p.maxedArchs.indexOf(id) >= 0)) {
      newSt = 3;
    } else if (pts >= th.stage2) {
      newSt = 2;
    } else if (pts >= th.stage1) {
      newSt = 1;
    }

    if (newSt > prevSt) {
      p.archStages[id] = newSt;
      if (newSt >= 1 && !p.primaryArch) p.primaryArch = id;
      if (newSt >= 2 && prevSt < 2) {
        p.stage = Math.max(p.stage || 1, 2);
        onEnterStage2(p, id);
      }
      if (newSt >= 3 && prevSt < 3) {
        if (p.maxedArchs.indexOf(id) < 0 && p.maxedArchs.length < maxUlt) {
          p.maxedArchs.push(id);
        }
        p.stage = Math.max(p.stage || 1, 3);
        onEnterStage3(p, id);
      }
    } else {
      p.archStages[id] = newSt;
    }
  }

  if (p.maxedArchs.length >= maxUlt) {
    for (let i = 0; i < ARCH_IDS.length; i++) {
      const id = ARCH_IDS[i];
      if (p.maxedArchs.indexOf(id) < 0) {
        if ((p.archetypes[id] || 0) > th.capLocked) p.archetypes[id] = th.capLocked;
        if ((p.archStages[id] || 0) >= 3) p.archStages[id] = 2;
      }
    }
  }

  let bestArch = p.primaryArch;
  let bestScore = -1;
  for (let i = 0; i < order.length; i++) {
    const id = order[i];
    const st = p.archStages[id] || 0;
    const pts = p.archetypes[id] || 0;
    if (pts <= 0 && st <= 0) continue;
    const score = st * 1000 + pts;
    if (score > bestScore) { bestScore = score; bestArch = id; }
  }
  if (bestArch) p.primaryArch = bestArch;

  if (p.maxedArchs.length >= maxUlt && !p.superposition) {
    const combo = resolveCombo(p.maxedArchs[0], p.maxedArchs[1]);
    p.superposition = combo;
    p.stage = 4;
    onEnterStage4(p, combo);
  }
}

function previewSkillEvolution(p, skill) {
  if (!p || !p.archetypes || !skill || !skill.archetype) return null;
  const archId = skill.archetype;
  const th = getArchThresholds();
  const maxUlt = getMaxUltimates();
  const curPts = p.archetypes[archId] || 0;
  const curSt = p.archStages[archId] || 0;
  const locked = p.maxedArchs.length >= maxUlt && p.maxedArchs.indexOf(archId) < 0;
  const add = skill.archPts || 1;
  const nextPts = locked ? Math.min(th.capLocked, curPts + add) : curPts + add;
  const nextSt = locked
    ? curSt
    : (nextPts >= th.stage3 ? 3 : nextPts >= th.stage2 ? 2 : nextPts >= th.stage1 ? 1 : 0);
  const willSuper = !!(curSt < 3 && nextSt === 3 && p.maxedArchs.length === maxUlt - 1 && !p.superposition);
  const combo = willSuper ? resolveCombo(p.maxedArchs[0], archId) : null;
  return { archId, curPts, nextPts, curSt, nextSt, locked, willSuper, combo };
}

/* ══════════════ 全局有效伤害、核心阶数与升级预览 ══════════════ */
const TIER_ROMANS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const STAGE_ROMANS = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ'];

function tierRoman(tier) {
  return TIER_ROMANS[(tier || 1) - 1] || String(tier);
}

function stageRoman(st) {
  return STAGE_ROMANS[(st || 1) - 1] || String(st);
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
  if (s.capHp && p.hp >= p.maxHp * 0.6) {
    mul *= 1 + Math.min(1.5, p.maxHp * 0.0025);
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
    charges: p.charges,
    maxCharges: p.maxCharges,
    relics: Object.assign({}, p.relics),
    stats: Object.assign({}, p.stats),
  };
  const dBefore = Math.round(calcPlayerEffectiveDmg(p));
  skill.apply(clone, nextLv);
  const dAfter = Math.round(calcPlayerEffectiveDmg(clone));

  const diffs = [];
  const evo = previewSkillEvolution(p, skill);
  if (evo && evo.willSuper && evo.combo) {
    diffs.push('Ⅳ阶叠加 · ' + evo.combo.name);
  } else if (evo && evo.nextSt > evo.curSt && evo.curSt >= 1) {
    diffs.push(stageRoman(evo.curSt) + '阶 → ' + stageRoman(evo.nextSt) + '阶');
  }
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
  if (clone.stats.bounce > p.stats.bounce) {
    diffs.push('弹射 ' + p.stats.bounce + ' → ' + clone.stats.bounce);
  }
  if (clone.stats.split > p.stats.split) {
    diffs.push('分裂 ' + p.stats.split + ' → ' + clone.stats.split);
  }
  if (clone.stats.orbs > p.stats.orbs) {
    diffs.push('卫星 ' + p.stats.orbs + ' → ' + clone.stats.orbs);
  }
  if (clone.stats.chainJumps > p.stats.chainJumps) {
    diffs.push('连锁 ' + (1 + p.stats.chainJumps) + ' → ' + (1 + clone.stats.chainJumps));
  }
  if (clone.stats.shockR > p.stats.shockR) {
    diffs.push('震波 ' + Math.round(p.stats.shockR) + ' → ' + Math.round(clone.stats.shockR));
  }
  if (clone.stats.missileLv > p.stats.missileLv) {
    diffs.push('飞弹 ' + p.stats.missileLv + ' → ' + clone.stats.missileLv);
  }
  if (clone.stats.speed > p.stats.speed + 1) {
    diffs.push('移速 ' + Math.round(p.stats.speed) + ' → ' + Math.round(clone.stats.speed));
  }
  if (clone.stats.armor > p.stats.armor + 0.01) {
    diffs.push('减伤 ' + Math.round(p.stats.armor * 100) + '% → ' + Math.round(clone.stats.armor * 100) + '%');
  }
  if (clone.stats.regen > p.stats.regen + 0.01 || clone.stats.regenPct > (p.stats.regenPct || 0)) {
    const h0 = (p.stats.regen + p.maxHp * (p.stats.regenPct || 0)).toFixed(1);
    const h1 = (clone.stats.regen + clone.maxHp * (clone.stats.regenPct || 0)).toFixed(1);
    diffs.push('秒回 ' + h0 + ' → ' + h1);
  }
  if (clone.stats.dashCd < p.stats.dashCd - 0.02) {
    diffs.push('冷却 ' + p.stats.dashCd.toFixed(1) + 's → ' + clone.stats.dashCd.toFixed(1) + 's');
  }
  if (clone.stats.refract > p.stats.refract) {
    diffs.push('折射 ' + p.stats.refract + ' → ' + clone.stats.refract);
  }
  if (clone.stats.momentum > p.stats.momentum) {
    diffs.push('化劲 ' + p.stats.momentum + ' → ' + clone.stats.momentum);
  }
  if (clone.stats.pinball > p.stats.pinball) {
    diffs.push('对撞伤 ×' + (1 + p.stats.pinball) + ' → ×' + (1 + clone.stats.pinball));
  }
  if (clone.stats.exactHunter > p.stats.exactHunter) {
    diffs.push('归零容差 ' + Math.round((1 + 0.25 * p.stats.exactHunter) * 100) + '% → ' + Math.round((1 + 0.25 * clone.stats.exactHunter) * 100) + '%');
  }
  if (clone.stats.xpMul > p.stats.xpMul + 0.01) {
    diffs.push('经验 ×' + p.stats.xpMul.toFixed(1) + ' → ×' + clone.stats.xpMul.toFixed(1));
  }
  if (clone.stats.pickup > p.stats.pickup + 1) {
    diffs.push('拾取 ' + Math.round(p.stats.pickup) + ' → ' + Math.round(clone.stats.pickup));
  }
  if (clone.stats.slow > p.stats.slow + 0.01) {
    diffs.push('减速 ' + Math.round(p.stats.slow * 100) + '% → ' + Math.round(clone.stats.slow * 100) + '%');
  }
  if (clone.stats.vampPct > (p.stats.vampPct || 0)) {
    diffs.push('吸血 ' + ((p.stats.vampPct || 0) * 100).toFixed(1) + '% → ' + (clone.stats.vampPct * 100).toFixed(1) + '%');
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
  updateMirrors(dt);
  updateBlackholes(dt);
  updateThunderPillars(dt);
  updateLotusArrays(dt);
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
  if (p.norseZoneCd > 0) p.norseZoneCd = Math.max(0, p.norseZoneCd - dt);

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
    // 【大成 · 引力残影诱饵】持续嘲讽聚拢周围 190px 敌球
    for (let j = 0; j < Game.enemies.length; j++) {
      const e = Game.enemies[j];
      if (e.dead || e.boss) continue;
      const d2 = distSq(d.x, d.y, e.x, e.y);
      if (d2 <= 190 * 190 && d2 > 9) {
        const dist = Math.sqrt(d2) || 1;
        e.kx += ((d.x - e.x) / dist) * 260 * dt;
        e.ky += ((d.y - e.y) / dist) * 260 * dt;
      }
    }
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
      Game.fx.push({ kind: 'slowfield', x: cx, y: cy, r: imp.r, life: 2.0, max: 2.0, color: '#4F3CC9', dead: false });
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
  const tgt = findBestPrimaryTarget(p.x, p.y, 860);
  const base = tgt ? aimAngle(p, tgt) : p.facing;

  p.shotCounter++;
  const overheat = (s.capRate && (p.shotCounter % 5 === 0)) || (!s.capRate && s.midRate && (p.shotCounter % 8 === 0));

  let n = s.bullets + (orb.extraBullets || 0);
  if (overheat) n *= 2;
  const step = overheat ? s.spread * 0.72 : s.spread;

  const baseR = s.bulletR * (s.capDmg ? 1.48 : (s.midDmg ? 1.18 : 1));
  const baseLife = CFG.player.bulletLife * (orb.bulletLifeMul || 1);
  const st = p.archStages || {};
  const isHammer = (st.norse || 0) >= 2;
  const isFireOrb = (st.xuanhuan || 0) >= 2;
  const isXianSword = (st.xianxia || 0) >= 1;

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
          color: undefined, primary: true, isHammer, isFireOrb, isXianSword,
        });
        spawnBullet(sx - perpX * 3.5 - Math.cos(ang) * 7, sy - perpY * 3.5 - Math.sin(ang) * 7, ang, {
          dmg: bDmg, r: needleR, speed: 880, life: baseLife, pierce: needlePierce,
          color: undefined, primary: true, isHammer, isFireOrb, isXianSword,
        });
      } else {
        spawnBullet(sx, sy, ang, {
          dmg: Math.max(1, Math.round(effectiveDmg())), r: needleR, speed: 880, life: baseLife, pierce: needlePierce,
          color: undefined, primary: true, isHammer, isFireOrb, isXianSword,
        });
      }
    } else if (orb.id === 'crimson') {
      // 【重型母球弹】大口径重弹，强击退触发台球对撞
      const heavyR = Math.max(12, Math.round(baseR * 1.38));
      const heavyDmg = Math.max(1, Math.round(effectiveDmg() * 1.2));
      spawnBullet(sx, sy, ang, {
        dmg: heavyDmg, r: heavyR, speed: 580, life: baseLife,
        kb: 240, primary: true, isHammer, isFireOrb, isXianSword,
      });
    } else {
      // 【暴击追猎弹】齐射球默认单发精准弹
      const b = spawnBullet(sx, sy, ang, {
        r: baseR, life: baseLife, primary: true, isHammer, isFireOrb, isXianSword,
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

  // 【仙侠 Ⅲ阶 · 太虚万剑齐射】额外释放 2 柄自动追踪青冥飞剑
  if ((st.xianxia || 0) >= 3) {
    const swDmg = Math.max(1, Math.round(effectiveDmg() * 0.85));
    for (let k = -1; k <= 1; k += 2) {
      const sa = base + k * 0.34;
      spawnBullet(p.x + Math.cos(sa) * (p.r + 4), p.y + Math.sin(sa) * (p.r + 4), sa, {
        dmg: swDmg, r: Math.max(7, Math.round(baseR * 0.85)),
        speed: 740, life: baseLife * 1.15, pierce: Math.max(1, s.pierce),
        homing: true, isXianSword: true, color: '#00A86B',
      });
    }
  }

  // 【大成 · 螺旋弹幕矩阵】每次射击额外释放 4 枚旋转交叉弧线弹幕
  if (s.capMulti) {
    const spinBase = p.shotCounter * 0.45;
    for (let k = 0; k < 4; k++) {
      const sa = spinBase + (k / 4) * TAU;
      spawnBullet(
        p.x + Math.cos(sa) * (p.r + 4),
        p.y + Math.sin(sa) * (p.r + 4),
        sa,
        {
          r: Math.max(6, Math.round(baseR * 0.85)),
          life: baseLife * 0.9,
          dmg: Math.max(1, Math.round(effectiveDmg() * 0.85)),
          spin: k % 2 === 0 ? 1.85 : -1.85,
          color: '#0055FF',
        }
      );
    }
  }

  // 【大成 · 脉冲激光模式】第 3 发及之后每轮额外扫射贯穿几何激光
  if (s.capRate && p.shotCounter % 3 === 0) {
    const beamLen = 780;
    const x2 = p.x + Math.cos(base) * beamLen;
    const y2 = p.y + Math.sin(base) * beamLen;
    const beamCrit = Math.random() < s.crit;
    const beamDmg = Math.max(1, Math.round(effectiveDmg() * 0.85 * (beamCrit ? s.critMult : 1)));
    for (let j = 0; j < Game.enemies.length; j++) {
      const e = Game.enemies[j];
      if (e.dead) continue;
      if (pointSegDistSq(e.x, e.y, p.x, p.y, x2, y2) <= (e.r + 8) * (e.r + 8)) {
        damageEnemy(e, beamDmg, beamCrit, { x: p.x, y: p.y, vx: Math.cos(base) * 500, vy: Math.sin(base) * 500 });
      }
    }
    Game.fx.push({ kind: 'beam', x1: p.x, y1: p.y, x2: x2, y2: y2, life: 0.16, max: 0.16, color: beamCrit ? '#E63312' : '#0055FF', dead: false });
    Sfx.play('zap');
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

  // 【Ⅲ阶主动联动】北欧雷柱 / 玄幻黑洞 / 仙侠青莲剑阵
  const st = p.archStages || {};
  if ((st.norse || 0) >= 3) {
    const tgt = findNearestEnemy(p.x, p.y, 420);
    const px = tgt ? tgt.x : (p.x + Math.cos(p.facing) * 140);
    const py = tgt ? tgt.y : (p.y + Math.sin(p.facing) * 140);
    spawnNorseThunderPillar(px, py, Math.max(4, Math.round(effectiveDmg() * 3.2)));
  }
  if ((st.xuanhuan || 0) >= 3) {
    spawnKunpengBlackhole(p);
  }
  if ((st.xianxia || 0) >= 3) {
    castSwordLotusArray(p);
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
    basePierce: o.pierce !== undefined ? o.pierce : s.pierce,
    bounce: o.bounce !== undefined ? o.bounce : s.bounce,
    splits: o.split !== undefined ? o.split : s.split,
    crit: crit,
    homing: !!o.homing,
    cluster: !!o.cluster,
    primary: !!o.primary,
    spin: o.spin || 0,
    isSubSwarm: !!o.isSubSwarm,
    isRecursiveSplit: !!o.isRecursiveSplit,
    isRicochetFork: !!o.isRicochetFork,
    isHammer: !!o.isHammer,
    isFireOrb: !!o.isFireOrb,
    isXianSword: !!o.isXianSword,
    isSwordQi: !!o.isSwordQi,
    isPrismSplit: !!o.isPrismSplit,
    isLotusCue: !!o.isLotusCue,
    arcTick: o.isHammer ? 0.14 : 0,
    midSwordSplitDone: false,
    mirrorSpawned: false,
    prismSplitDone: false,
    isLotusDetonated: false,
    sawActive: false,
    sawTick: 0,
    implodeDone: false,
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

    if (b.sawActive) {
      b.sawTick -= dt;
      if (b.sawTick <= 0) {
        b.sawTick = 0.18;
        b.hit.clear();
      }
      const tgt = findNearestEnemy(b.x, b.y, 320);
      if (tgt) {
        const want = Math.atan2(tgt.y - b.y, tgt.x - b.x) + 0.55;
        const cur = Math.atan2(b.vy, b.vx);
        const na = cur + clamp(angleDiff(want, cur), -12 * dt, 12 * dt);
        const sp = Math.max(360, Math.sqrt(b.vx * b.vx + b.vy * b.vy));
        b.vx = Math.cos(na) * sp;
        b.vy = Math.sin(na) * sp;
      }
    } else if (b.spin) {
      const ca = Math.atan2(b.vy, b.vx) + b.spin * dt;
      const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      b.vx = Math.cos(ca) * sp;
      b.vy = Math.sin(ca) * sp;
    } else if (b.homing) {
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

    // 【北欧 Ⅱ阶 · 锻铁雷锤】飞行途中持续向两侧敌球劈出分支电弧
    if (b.isHammer && !b.dead) {
      b.arcTick -= dt;
      if (b.arcTick <= 0) {
        b.arcTick = 0.16;
        const arcTgt = findNearestEnemyExcept(b.x, b.y, 155, b.hit);
        if (arcTgt) {
          const arcDmg = Math.max(1, Math.round(b.dmg * 0.35));
          damageEnemy(arcTgt, arcDmg, false, { x: b.x, y: b.y });
          Game.fx.push({ kind: 'chain', pts: [[b.x, b.y], [arcTgt.x, arcTgt.y]], life: 0.12, max: 0.12, color: '#4F3CC9', dead: false });
        }
      }
    }

    // 【Ⅳ阶 · 所罗门分光剑阵】飞剑穿过棱镜分裂为 3 柄黄金激光飞剑
    if (p && p.superposition && p.superposition.id === 'arcane_xian' &&
        (b.primary || b.isXianSword) && !b.prismSplitDone && !b.isPrismSplit && !b.isSwordQi && Game.mirrors.length > 0) {
      for (let mIdx = 0; mIdx < Game.mirrors.length; mIdx++) {
        const mr = Game.mirrors[mIdx];
        const rrM = mr.r + b.r + 10;
        if (distSq(b.x, b.y, mr.x, mr.y) <= rrM * rrM) {
          b.prismSplitDone = true;
          const baseA = Math.atan2(b.vy, b.vx);
          const swDmg = Math.max(1, Math.round(b.dmg * 0.72));
          for (let k = -1; k <= 1; k++) {
            spawnBullet(mr.x, mr.y, baseA + k * 0.25, {
              dmg: swDmg, r: Math.max(6, Math.round(b.r * 0.85)),
              speed: 860, life: 0.95, pierce: Math.max(1, b.pierce),
              bounce: 0, split: 0, isPrismSplit: true, isXianSword: true, color: '#FFB800',
            });
          }
          Game.fx.push({ kind: 'ring', x: mr.x, y: mr.y, r: 4, maxR: 28, life: 0.16, max: 0.16, color: '#FFB800', dead: false });
          b.dead = true;
          break;
        }
      }
      if (b.dead) continue;
    }

    // 【几何折射 · 霍格沃茨回旋咒】支持多次折返；中阶自动锁敌零衰减；大成 135% 增伤并留六芒星棱镜
    const offScreen = Game.W > 0 && (Math.abs(b.x - Game.cam.x) > Game.W * 0.52 || Math.abs(b.y - Game.cam.y) > Game.H * 0.52);
    const refractLeft = b.refractLeft !== undefined ? b.refractLeft : (canRefract && !b.refracted ? p.stats.refract : 0);
    if ((b.life <= 0 || offScreen) && canRefract && refractLeft > 0 && !b.homing) {
      b.refracted = true;
      b.refractLeft = refractLeft - 1;
      b.hit.clear();
      const dmgKeep = s.capRefract ? 1.35 : (s.midRefract ? 1.0 : 0.85);
      b.dmg = Math.max(1, Math.round(b.dmg * dmgKeep));
      b.life = Math.max(0.65, CFG.player.bulletLife * 0.8);
      const sp = Math.hypot(b.vx, b.vy) || CFG.player.bulletSpeed;
      let backA = Math.atan2(p.y - b.y, p.x - b.x) + rand(-0.14, 0.14);
      if (s.midRefract) {
        const refTgt = findNearestEnemy(b.x, b.y, 460);
        if (refTgt) backA = Math.atan2(refTgt.y - b.y, refTgt.x - b.x);
      }
      b.vx = Math.cos(backA) * sp;
      b.vy = Math.sin(backA) * sp;
      Game.fx.push({ kind: 'ring', x: b.x, y: b.y, r: 2, maxR: s.capRefract ? 20 : 12, life: 0.16, max: 0.16, color: s.capRefract ? '#FFB800' : '#0055FF', dead: false });
      if (s.capRefract && Game.mirrors.length < 8) {
        Game.mirrors.push({ x: b.x, y: b.y, r: 16, rot: 0, life: 2.2, max: 2.2, perm: false, fireT: 0.15 });
      }
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

  // 【大成 · 重核坍缩弹】主弹丸命中首个目标时生成 95px 引力坍缩场并引爆 60% 范围伤害
  if (s && s.capDmg && b.primary && !b.implodeDone) {
    b.implodeDone = true;
    const impDmg = Math.max(1, Math.round(b.dmg * 0.6));
    Game.fx.push({ kind: 'ring', x: e.x, y: e.y, r: 95, maxR: 95, life: 0.22, max: 0.22, color: '#E63312', dead: false });
    for (let i = 0; i < Game.enemies.length; i++) {
      const o = Game.enemies[i];
      if (o.dead || o.id === e.id) continue;
      const rr = 95 + o.r;
      if (distSq(e.x, e.y, o.x, o.y) <= rr * rr) {
        const dd = Math.sqrt(distSq(o.x, o.y, e.x, e.y)) || 1;
        o.kx += ((e.x - o.x) / dd) * 180;
        o.ky += ((e.y - o.y) / dd) * 180;
        damageEnemy(o, impDmg, false, { x: e.x, y: e.y });
      }
    }
  }

  // 【大成 · 子母集束蜂群】追踪弹命中溅射 65px 后分裂 2 枚二段蜂群飞弹
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
    if (!b.isSubSwarm) {
      for (let m = 0; m < 2; m++) {
        spawnBullet(b.x, b.y, rand(0, TAU), {
          dmg: Math.max(1, Math.round(b.dmg * 0.55)),
          homing: true, isSubSwarm: true, cluster: false,
          pierce: 0, bounce: 0, split: 0,
          r: 5.5, speed: 520, life: 1.8, color: '#008B74',
        });
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

  // 【大成 · 递归母子分裂】每次命中直接炸出碎片弹
  if (s && s.capSplit && b.splits > 0 && !b.critSplitDone && !b.isRecursiveSplit) {
    b.critSplitDone = true;
    const sc = 2 + Math.floor(b.splits * 0.5);
    for (let k = 0; k < sc; k++) {
      spawnBullet(b.x, b.y, rand(0, TAU), {
        dmg: Math.max(1, Math.round(b.dmg * 0.65)),
        pierce: 0, bounce: 0, split: 0, isRecursiveSplit: true,
        life: 0.75, r: 6, color: '#0055FF',
      });
    }
  }

  Sfx.play('hit');

  if (p && ((p.stage || 1) >= 2 || p.superposition)) {
    applyHitArchetypeEffects(b, e, p);
  }

  // 【弹穿叠加态】同时拥有穿透与弹射时：主弹继续向前穿透的同时，向近敌分叉弹射一发折跃子弹
  if (b.pierce > 0 && b.bounce > 0 && !b.isRicochetFork) {
    const forkTgt = findNearestEnemyExcept(b.x, b.y, 320, b.hit);
    if (forkTgt) {
      if (!(s && s.capBounce && b.crit && Math.random() < 0.6)) {
        b.bounce--;
      }
      const fa = Math.atan2(forkTgt.y - b.y, forkTgt.x - b.x);
      const fsp = (Math.hypot(b.vx, b.vy) || CFG.player.bulletSpeed) * (s && s.capBounce ? 1.22 : 1.05);
      const forkDmg = Math.max(1, Math.round(b.dmg * (s && s.capBounce ? 0.95 : 0.78)));
      const forkB = spawnBullet(b.x, b.y, fa, {
        dmg: forkDmg,
        pierce: Math.max(0, Math.floor(b.pierce * 0.5)),
        bounce: 0,
        split: 0,
        isRicochetFork: true,
        r: Math.max(6, Math.round(b.r * 0.85)),
        speed: fsp,
        life: 0.85,
        color: '#4F3CC9',
      });
      if (forkB) forkB.hit.add(e.id);
      Game.fx.push({ kind: 'chain', pts: [[b.x, b.y], [forkTgt.x, forkTgt.y]], life: 0.14, max: 0.14, color: '#4F3CC9', dead: false });
    }
  }

  if (b.pierce > 0) {
    b.pierce--;
    b.pierceCount++;
    if (s && s.capPierce) {
      b.dmg = Math.max(1, Math.round(b.dmg * 1.32));
      b.r = Math.min(26, b.r * 1.08);
      // 【大成 · 空间折跃贯穿】自动修正航向折跃追踪下一个未命中敌球
      const nextTgt = findNearestEnemyExcept(b.x, b.y, 280, b.hit);
      if (nextTgt) {
        const na = Math.atan2(nextTgt.y - b.y, nextTgt.x - b.x);
        const sp = Math.hypot(b.vx, b.vy) || CFG.player.bulletSpeed;
        b.vx = Math.cos(na) * sp;
        b.vy = Math.sin(na) * sp;
        Game.fx.push({ kind: 'chain', pts: [[b.x, b.y], [nextTgt.x, nextTgt.y]], life: 0.12, max: 0.12, color: '#0055FF', dead: false });
      }
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
      // 弹穿叠加态：弹射后重置已命中列表并重充 1 次穿透，避免弹射后直接断档
      if (b.basePierce > 0) {
        b.pierce = Math.max(b.pierce, 1);
        b.hit.clear();
        b.hit.add(e.id);
      }
      return;
    }
  }

  // 【大成 · 永恒回旋飞刃】弹射耗尽后化为旋转飞刃持续切割 1.2s
  if (s && s.capBounce && !b.sawActive && !b.isSubSwarm) {
    b.sawActive = true;
    b.life = 1.2;
    b.sawTick = 0.18;
    b.pierce = 99;
    b.dmg = Math.max(1, Math.round(b.dmg * 0.7));
    b.color = '#E63312';
    return;
  }

  // 【霍格沃茨回旋咒】命中耗尽穿透/弹射时也触发折返，无需打空才能折返
  const refLeft = b.refractLeft !== undefined ? b.refractLeft : (s ? s.refract : 0);
  if (s && s.refract > 0 && refLeft > 0 && !b.isSubSwarm) {
    b.refracted = true;
    b.refractLeft = refLeft - 1;
    b.hit.clear();
    b.hit.add(e.id);
    const dmgKeep = s.capRefract ? 1.35 : (s.midRefract ? 1.0 : 0.85);
    b.dmg = Math.max(1, Math.round(b.dmg * dmgKeep));
    b.life = Math.max(b.life, 0.75);
    const sp = Math.hypot(b.vx, b.vy) || CFG.player.bulletSpeed;
    const nxt = s.midRefract ? findNearestEnemyExcept(b.x, b.y, 440, b.hit) : null;
    const backA = nxt ? Math.atan2(nxt.y - b.y, nxt.x - b.x) : (Math.atan2(p.y - b.y, p.x - b.x) + rand(-0.22, 0.22));
    b.vx = Math.cos(backA) * sp;
    b.vy = Math.sin(backA) * sp;
    Game.fx.push({ kind: 'ring', x: b.x, y: b.y, r: 2, maxR: s.capRefract ? 20 : 12, life: 0.16, max: 0.16, color: s.capRefract ? '#FFB800' : '#0055FF', dead: false });
    if (s.capRefract && Game.mirrors.length < 8) {
      Game.mirrors.push({ x: b.x, y: b.y, r: 16, rot: 0, life: 2.2, max: 2.2, perm: false, fireT: 0.15 });
    }
    return;
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

  // 【数字强迫症 / 归零 Ⅱ阶游标卡尺】残血接近单发伤害时自动补足为精准归零
  const ezSt = Math.max(
    (p && p.archStages && p.archStages.exact_zero) || 0,
    (s && s.capExact) ? 3 : ((s && s.midExact) ? 2 : 0)
  );
  const ezFactor = Math.max(ezSt >= 2 ? 1.35 : 1, 1 + 0.25 * (s ? s.exactHunter : 0));
  if (ezFactor > 1 && !e.boss && !(from && from.isExactZeroBurst)) {
    if (e.hp > d && e.hp <= d * ezFactor) {
      d = e.hp;
      e.exactForced = true;
    }
  }

  e.hitCount = (e.hitCount || 0) + 1;
  e.hp -= d;

  // 【大成 · 暴击十字斩】暴击直接处决 <20% 血非首领敌球，并引爆 85px 红墨十字斩波
  if (s && s.capCrit && crit && !e.boss && e.hp > 0 && e.hp < e.maxHp * 0.2) {
    e.hp = 0;
  }
  if (s && s.capCrit && crit && !(from && from.isCritCross)) {
    const crossDmg = Math.max(1, Math.round(d * 0.45));
    Game.fx.push({ kind: 'ring', x: e.x, y: e.y, r: 8, maxR: 85, life: 0.2, max: 0.2, color: '#E63312', dead: false });
    for (let k = 0; k < Game.enemies.length; k++) {
      const o = Game.enemies[k];
      if (o.dead || o.id === e.id) continue;
      const rr = 85 + o.r;
      if (distSq(e.x, e.y, o.x, o.y) <= rr * rr) {
        damageEnemy(o, crossDmg, false, { x: e.x, y: e.y, isCritCross: true });
      }
    }
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
      const ezR = ezSt >= 3 ? 115 : 80;
      addText(e.x, e.y - e.r - 16, '✦ 归零', '#D97706', ezSt >= 3 ? 26 : 24, { crit: true, vy: -82, life: 0.9 });
      Game.fx.push({ kind: 'ring', x: e.x, y: e.y, r: 6, maxR: ezR, life: 0.28, max: 0.28, color: '#FFB800', dead: false });
      if (ezSt >= 3) {
        Game.fx.push({ kind: 'deconstruct_cross', x: e.x, y: e.y, r: ezR, life: 0.30, max: 0.30, color: '#FFB800', dead: false });
      }
      Sfx.play('zero');
      const burstDmg = Math.max(1, Math.round(1.5 * effectiveDmg()));
      for (let i = 0; i < Game.enemies.length; i++) {
        const o = Game.enemies[i];
        if (o.dead || o.id === e.id) continue;
        const rr = ezR + o.r;
        if (distSq(e.x, e.y, o.x, o.y) <= rr * rr) {
          damageEnemy(o, burstDmg, false, { x: e.x, y: e.y, isExactZeroBurst: true });
          const dd = Math.sqrt(distSq(o.x, o.y, e.x, e.y)) || 1;
          const kb = effectiveKb(180);
          o.kx += ((o.x - e.x) / dd) * kb;
          o.ky += ((o.y - e.y) / dd) * kb;
        }
      }
      // 【Ⅳ阶 · 宿命同调矩阵】激光网连接的敌球同步归零殉爆
      if (p && p.superposition && p.superposition.id === 'arcane_zero' && e.laserNetT > 0 && !(from && from.isFateSync)) {
        for (let i = 0; i < Game.enemies.length; i++) {
          const o = Game.enemies[i];
          if (o.dead || o.id === e.id || !(o.laserNetT > 0) || o.boss) continue;
          Game.fx.push({ kind: 'chain', pts: [[e.x, e.y], [o.x, o.y]], life: 0.24, max: 0.24, color: '#FFB800', dead: false });
          damageEnemy(o, o.hp, true, { x: e.x, y: e.y, isFateSync: true, isExactZeroBurst: true });
        }
      }
    } else if (e.hp < 0 && !(from && from.isOverkillArc)) {
      // 【过载传导】Ⅰ阶 75%/190px/1跳；归零 Ⅱ阶升至 80%/180px/1跳，Ⅲ阶升至 3 跳高压电弧链
      const overkill = -e.hp;
      const minOverkill = ezSt >= 2 ? 3 : Math.max(2, effectiveDmg() * 0.45);
      if (overkill >= minOverkill) {
        const ratio = ezSt >= 2 ? 0.80 : 0.75;
        const range = ezSt >= 3 ? 220 : (ezSt >= 2 ? 180 : 190);
        const maxJumps = ezSt >= 3 ? 3 : 1;
        const arcDmg = Math.max(1, Math.round(overkill * ratio));
        const visited = new Set([e.id]);
        const pts = [[e.x, e.y]];
        let fxX = e.x, fxY = e.y;
        for (let j = 0; j < maxJumps; j++) {
          const tgt = findNearestEnemyExcept(fxX, fxY, range, visited);
          if (!tgt) break;
          visited.add(tgt.id);
          pts.push([tgt.x, tgt.y]);
          fxX = tgt.x;
          fxY = tgt.y;
          damageEnemy(tgt, arcDmg, false, { x: e.x, y: e.y, isOverkillArc: true });
        }
        if (pts.length > 1) {
          Game.fx.push({ kind: 'chain', pts: pts, life: 0.18, max: 0.18, color: '#0055FF', dead: false });
          if (ezSt >= 2) addText(e.x, e.y - e.r - 12, '过载 +' + fmt(arcDmg), '#0055FF', 16);
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

  if (from && from.isRecursiveSplit) {
    for (let i = 0; i < 2; i++) {
      spawnBullet(e.x, e.y, rand(0, TAU), {
        dmg: Math.max(1, Math.round(from.dmg * 0.7)),
        homing: true, pierce: 0, bounce: 0, split: 0,
        life: 1.4, r: 5, speed: 460, color: '#0055FF',
      });
    }
  } else if (from && from.splits > 0 && !from.splitDone) {
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
    combo: 0,
    thunderMarkT: 0,
    stakeT: 0,
    laserNetT: 0,
    thunderCharged: false,
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
    if (e.thunderMarkT > 0) e.thunderMarkT -= dt;
    if (e.stakeT > 0) e.stakeT -= dt;
    if (e.laserNetT > 0) e.laserNetT -= dt;

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
    const enemySlow = slowK * (e.slowT > 0 ? 0.5 : 1) * (e.thunderMarkT > 0 ? 0.8 : 1);
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

    const kSpd = Math.hypot(e.kx, e.ky);
    if (p && p.superposition && p.superposition.id === 'norse_phys') {
      e.thunderCharged = kSpd > 95;
    } else {
      e.thunderCharged = false;
    }

    // 【台球 Ⅲ阶 · 黄金陀螺撞针】被击飞的敌球获得屏幕四壁全弹性反弹
    const physStMove = Math.max(
      (p && p.archStages && p.archStages.billiard) || 0,
      (p && p.stats && p.stats.capPinball) ? 3 : ((p && p.stats && p.stats.midPinball) ? 2 : 0)
    );
    if (physStMove >= 3 && !e.boss && kSpd > 85 && Game.W > 0 && Game.H > 0) {
      const minX = Game.cam.x - Game.W * 0.48 + e.r;
      const maxX = Game.cam.x + Game.W * 0.48 - e.r;
      const minY = Game.cam.y - Game.H * 0.48 + e.r;
      const maxY = Game.cam.y + Game.H * 0.48 - e.r;
      let bouncedWall = false;
      if (e.x < minX) { e.x = minX; e.kx = Math.abs(e.kx) * 0.95; bouncedWall = true; }
      else if (e.x > maxX) { e.x = maxX; e.kx = -Math.abs(e.kx) * 0.95; bouncedWall = true; }
      if (e.y < minY) { e.y = minY; e.ky = Math.abs(e.ky) * 0.95; bouncedWall = true; }
      else if (e.y > maxY) { e.y = maxY; e.ky = -Math.abs(e.ky) * 0.95; bouncedWall = true; }
      if (bouncedWall) {
        e.combo = Math.min(12, (e.combo || 0) + 1);
        Game.fx.push({ kind: 'ring', x: e.x, y: e.y, r: 4, maxR: 22, life: 0.16, max: 0.16, color: '#FFB800', dead: false });
      }
    } else if (kSpd < 45) {
      e.combo = 0;
    }

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

      // 【台球对撞】Ⅰ阶保持 150px/s / 0.18s；台球 Ⅱ阶(黑八配重核)升级为 120px/s / 0.14s / 85%/40% + 连撞计数
      const physSt = Math.max(
        (p && p.archStages && p.archStages.billiard) || 0,
        (p && p.stats && p.stats.capPinball) ? 3 : ((p && p.stats && p.stats.midPinball) ? 2 : 0)
      );
      const isPhys2 = physSt >= 2 || (p && p.stats.pinball > 0);
      const vThresh = isPhys2 ? 120 : 150;
      const rkx = a.kx - b.kx;
      const rky = a.ky - b.ky;
      const vRel = Math.sqrt(rkx * rkx + rky * rky);
      if (vRel >= vThresh && a.collideCd <= 0 && b.collideCd <= 0) {
        const cd = isPhys2 ? 0.14 : 0.18;
        a.collideCd = cd;
        b.collideCd = cd;

        const ka = a.kx * a.kx + a.ky * a.ky;
        const kb = b.kx * b.kx + b.ky * b.ky;
        const fast = ka >= kb ? a : b;
        const slow = fast === a ? b : a;
        const fkx = fast.kx;
        const fky = fast.ky;

        const xfer = isPhys2 ? 0.85 : 0.65;
        const keep = isPhys2 ? 0.40 : 0.35;
        slow.kx += fkx * xfer;
        slow.ky += fky * xfer;

        const tx = -uy;
        const ty = ux;
        const sign = (fkx * tx + fky * ty) >= 0 ? 1 : -1;
        fast.kx = fkx * keep + tx * sign * vRel * 0.25;
        fast.ky = fky * keep + ty * sign * vRel * 0.25;

        const combo = isPhys2 ? Math.min(12, Math.max(a.combo || 0, b.combo || 0) + 1) : 0;
        if (isPhys2) { a.combo = combo; b.combo = combo; }

        let colDmg = Math.max(2, Math.round((2 + effectiveDmg() * 0.9) * (vRel / 220)));
        if (p) {
          colDmg = Math.round(colDmg * (getOrb(p.orbId).billiardMul || 1) * (1 + p.stats.pinball) * (combo > 0 ? (1 + 0.15 * combo) : 1));
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
        if (combo >= 2) {
          addText(mx, my - 18, '连撞×' + combo + '!', '#D97706', 18 + Math.min(6, combo));
        }

        damageEnemy(a, colDmg, false, { x: mx, y: my, isBilliard: true });
        damageEnemy(b, colDmg, false, { x: mx, y: my, isBilliard: true });

        // 【Ⅳ阶 · 诸神雷霆保龄】每次台球对撞直接劈下天降雷柱
        if (p && p.superposition && p.superposition.id === 'norse_phys') {
          spawnNorseThunderPillar(mx, my, Math.max(2, Math.round(colDmg * 1.3)));
        }
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

  const rawDmg = Math.max(1, Math.round(e.dmg * (1 - p.stats.armor)));
  const hitCap = Math.max(1, Math.floor(p.maxHp * 0.28));
  const dmg = Math.min(rawDmg, hitCap);
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
    if (d < 165) {
      const kb = effectiveKb(300);
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
          const rawDmg = Math.max(1, Math.round(b.dmg * (1 - p.stats.armor)));
          const hitCap = Math.max(1, Math.floor(p.maxHp * 0.28));
          const dmg = Math.min(rawDmg, hitCap);
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
  Game.orbLasers.length = 0;
  if (s.orbs <= 0) return;

  const spinRate = 2.4 * ((s.speed * currentSpeedMul()) / CFG.player.speed) * (s.midOrb ? 1.25 : 1);
  s.orbPhase += dt * spinRate;
  const or = s.midOrb ? 11 : 9;
  const orbDmgBase = effectiveDmg(s.orbDmg + s.dmg * 0.65);
  const isTaiji = (p.archStages && (p.archStages.xianxia || 0) >= 3);
  const isXianXuan = !!(p.superposition && p.superposition.id === 'xian_xuan');

  for (let i = 0; i < s.orbs; i++) {
    const isOuter = s.capOrb && (i % 2 === 1);
    const R = (60 + s.orbs * 3) + (isOuter ? 28 : 0);
    const a = (isOuter ? -s.orbPhase * 0.85 : s.orbPhase) + (i * TAU) / s.orbs;
    const ox = p.x + Math.cos(a) * R;
    const oy = p.y + Math.sin(a) * R;
    Game.orbPos.push({ x: ox, y: oy, r: or, outer: isOuter, taiji: isTaiji, fireLotus: isXianXuan, idx: i });

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
        if (s.capOrb || isTaiji) {
          // 切线甩出，强力引爆台球碰撞
          const kb = effectiveKb(340);
          e.kx += (-ry + rx * 0.35) * kb;
          e.ky += (rx + ry * 0.35) * kb;
        } else {
          const kb = effectiveKb(210);
          e.kx += rx * kb;
          e.ky += ry * kb;
        }
        if (isXianXuan) {
          Game.fx.push({ kind: 'lotus', x: ox, y: oy, r: 6, maxR: 46, life: 0.26, max: 0.26, rot: rand(0, TAU), layers: 2, color: '#E63312', dead: false });
        }
        addParticle(ox, oy, rand(-60, 60), rand(-60, 60), rand(1.5, 3), isXianXuan ? '#E63312' : '#4F3CC9', 0.25);
      }
    }
  }

  // 【大成 · 双星脉冲激光阵】内外环卫星之间连成持续电离激光束
  if (s.capOrb && Game.orbPos.length >= 2) {
    const laserDmg = Math.max(1, Math.round(orbDmgBase * 0.35));
    for (let i = 0; i < Game.orbPos.length; i++) {
      const a = Game.orbPos[i];
      const b = Game.orbPos[(i + 1) % Game.orbPos.length];
      Game.orbLasers.push([a.x, a.y, b.x, b.y]);
      for (let j = 0; j < Game.enemies.length; j++) {
        const e = Game.enemies[j];
        if (e.dead || e.orbCd > 0) continue;
        if (pointSegDistSq(e.x, e.y, a.x, a.y, b.x, b.y) <= (e.r + 6) * (e.r + 6)) {
          e.orbCd = 0.25;
          damageEnemy(e, laserDmg, false, { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 });
        }
      }
    }
  }
}

function updateSub(dt) {
  const p = Game.player;
  const s = p.stats;
  const st = p.archStages || {};

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

  // 【仙侠 Ⅲ阶 · 八瓣几何青莲剑阵】周期性全屏绽放剑莲切割
  if ((st.xianxia || 0) >= 3) {
    p.lotusCd -= dt;
    if (p.lotusCd <= 0) {
      p.lotusCd = 3.6;
      castSwordLotusArray(p);
    }
  }

  // 【玄幻 Ⅲ阶 · 鲲鹏吞天黑洞】周期性聚怪内爆
  if ((st.xuanhuan || 0) >= 3) {
    p.blackholeCd -= dt;
    if (p.blackholeCd <= 0) {
      p.blackholeCd = 6.5;
      spawnKunpengBlackhole(p);
    }
  }

  // 【奥术 Ⅲ阶 · 大魔导天球仪】4 座棱镜节点发射黑金贯穿激光网
  if ((st.arcane || 0) >= 3) {
    p.arcaneNetT -= dt;
    if (p.arcaneNetT <= 0) {
      p.arcaneNetT = 0.72;
      fireArcaneLaserNet(p);
    }
  }

  // 【Ⅳ阶 · 九霄雷罚剑域】引雷剑桩间拉起高压电网并降下天降雷柱
  if (p.superposition && p.superposition.id === 'xian_norse') {
    p.stakeZapT -= dt;
    if (p.stakeZapT <= 0) {
      p.stakeZapT = 0.45;
      const staked = Game.enemies.filter(e => !e.dead && e.stakeT > 0);
      if (staked.length >= 1) {
        const zDmg = Math.max(2, Math.round(effectiveDmg() * 0.9));
        if (staked.length >= 2) {
          const pts = staked.slice(0, 6).map(e => [e.x, e.y]);
          Game.fx.push({ kind: 'chain', pts: pts, life: 0.24, max: 0.24, color: '#00A86B', dead: false });
          for (let k = 0; k < staked.length && k < 6; k++) {
            damageEnemy(staked[k], zDmg, false, { x: p.x, y: p.y });
          }
        }
        spawnNorseThunderPillar(staked[0].x, staked[0].y, Math.max(3, Math.round(effectiveDmg() * 1.4)));
      }
    }
  }
}

/* ══════════════ 六大流派 Ⅱ/Ⅲ/Ⅳ 阶域内技能与实体更新 ══════════════ */
function applyHitArchetypeEffects(b, e, p) {
  const st = p.archStages || {};
  const sup = p.superposition ? p.superposition.id : null;

  // 【仙侠 Ⅱ阶 · 两仪剑胎】首次命中向两侧分裂 2 道微型子剑气
  if ((st.xianxia || 0) >= 2 && b.primary && !b.midSwordSplitDone && !b.isSwordQi) {
    b.midSwordSplitDone = true;
    const baseA = Math.atan2(b.vy, b.vx);
    const qiDmg = Math.max(1, Math.round(b.dmg * 0.45));
    for (let side = -1; side <= 1; side += 2) {
      spawnBullet(e.x, e.y, baseA + side * 1.25, {
        dmg: qiDmg, r: 6, speed: 620, life: 0.45,
        pierce: 0, bounce: 0, split: 0, isSwordQi: true, color: '#00A86B',
      });
    }
  }

  // 【北欧 Ⅱ/Ⅲ阶】烙印四角雷印；Ⅲ阶召唤垂直黑蓝天降雷柱
  if ((st.norse || 0) >= 2 && !e.dead) {
    e.thunderMarkT = 2.0;
    if ((st.norse || 0) >= 3 && p.norseZoneCd <= 0 && (b.crit || b.isHammer)) {
      p.norseZoneCd = 1.05;
      spawnNorseThunderPillar(e.x, e.y, Math.max(2, Math.round(b.dmg * 1.15)));
    }
  }

  // 【玄幻 Ⅱ/Ⅲ阶】双层十字旋转火框 + 1.5s 灼烧印记；Ⅲ阶三层火莲溅射
  if ((st.xuanhuan || 0) >= 2) {
    const x3 = (st.xuanhuan || 0) >= 3;
    const lotusR = x3 ? 74 : 50;
    Game.fx.push({ kind: 'lotus', x: e.x, y: e.y, r: 6, maxR: lotusR, life: 0.34, max: 0.34, rot: rand(0, TAU), layers: x3 ? 3 : 2, color: '#E63312', dead: false });
    if (x3) {
      const spDmg = Math.max(1, Math.round(b.dmg * 0.5));
      for (let i = 0; i < Game.enemies.length; i++) {
        const o = Game.enemies[i];
        if (o.dead || o.id === e.id) continue;
        const rr = lotusR + o.r;
        if (distSq(e.x, e.y, o.x, o.y) <= rr * rr) damageEnemy(o, spDmg, false, { x: e.x, y: e.y });
      }
    }
    let burnCnt = 0;
    for (let i = 0; i < Game.fx.length; i++) if (Game.fx[i].kind === 'burnfield') burnCnt++;
    if (burnCnt < 10) {
      Game.fx.push({ kind: 'burnfield', x: e.x, y: e.y, r: 46, life: 1.5, max: 1.5, tickT: 0.3, dmg: Math.max(1, Math.round(b.dmg * 0.3)), color: '#E63312', dead: false });
    }
  }

  // 【奥术 Ⅱ阶 · 所罗门六芒核】首次命中生成持续 2s 的临时三角折射镜
  if ((st.arcane || 0) >= 2 && b.primary && !b.mirrorSpawned) {
    b.mirrorSpawned = true;
    const temps = Game.mirrors.filter(m => !m.permanent);
    if (temps.length >= 6) temps[0].dead = true;
    Game.mirrors.push({ x: e.x, y: e.y, r: 16, life: 2.0, max: 2.0, fireT: 0.25, permanent: false, dead: false });
  }

  // 【Ⅳ阶 · 红莲业火剑仙】飞剑命中敌球直接在体内引爆三层剑气火莲
  if (sup === 'xian_xuan' && (b.primary || b.isXianSword) && !b.isLotusDetonated) {
    b.isLotusDetonated = true;
    const fDmg = Math.max(1, Math.round(b.dmg * 0.55));
    Game.fx.push({ kind: 'lotus', x: e.x, y: e.y, r: 8, maxR: 68, life: 0.38, max: 0.38, rot: rand(0, TAU), layers: 3, color: '#00A86B', dead: false });
    for (let i = 0; i < Game.enemies.length; i++) {
      const o = Game.enemies[i];
      if (o.dead || o.id === e.id) continue;
      const rr = 68 + o.r;
      if (distSq(e.x, e.y, o.x, o.y) <= rr * rr) damageEnemy(o, fDmg, false, { x: e.x, y: e.y });
    }
  }

  // 【Ⅳ阶 · 九霄雷罚剑域】飞剑化引雷剑桩钉入敌球 2.5s
  if (sup === 'xian_norse' && (b.primary || b.isXianSword) && !e.dead) {
    e.stakeT = 2.5;
  }

  // 【Ⅳ阶 · 奇点坍缩开球】火莲母球命中引爆连环烈焰震荡
  if (b.isLotusCue) {
    const cDmg = Math.max(2, Math.round(b.dmg * 0.45));
    Game.fx.push({ kind: 'lotus', x: e.x, y: e.y, r: 10, maxR: 92, life: 0.36, max: 0.36, rot: rand(0, TAU), layers: 3, color: '#E63312', dead: false });
    for (let i = 0; i < Game.enemies.length; i++) {
      const o = Game.enemies[i];
      if (o.dead || o.id === e.id) continue;
      const rr = 92 + o.r;
      if (distSq(e.x, e.y, o.x, o.y) <= rr * rr) {
        damageEnemy(o, cDmg, false, { x: e.x, y: e.y });
        const dd = Math.sqrt(distSq(o.x, o.y, e.x, e.y)) || 1;
        const kb = effectiveKb(340);
        o.kx += ((o.x - e.x) / dd) * kb;
        o.ky += ((o.y - e.y) / dd) * kb;
      }
    }
  }
}

function spawnNorseThunderPillar(x, y, dmg) {
  if (Game.thunderPillars.length >= 10) return;
  Game.thunderPillars.push({ x: x, y: y, w: 34, life: 0.44, max: 0.44, dead: false });
  const r = 68;
  for (let i = 0; i < Game.enemies.length; i++) {
    const e = Game.enemies[i];
    if (e.dead) continue;
    if (distSq(x, y, e.x, e.y) <= (r + e.r) * (r + e.r)) {
      const crit = Game.player && Math.random() < Game.player.stats.crit;
      const hitD = dmg * (crit && Game.player ? Game.player.stats.critMult : 1);
      damageEnemy(e, hitD, crit, { x: x, y: y });
      e.slowT = Math.max(e.slowT, 1.5);
    }
  }
  Game.fx.push({ kind: 'rune_array', x: x, y: y, r: 92, life: 2.0, max: 2.0, tickT: 0.38, dmg: Math.max(1, Math.round(dmg * 0.35)), color: '#4F3CC9', dead: false });
  Sfx.play('zap');
  addShake(4);
}

function updateThunderPillars(dt) {
  for (let i = 0; i < Game.thunderPillars.length; i++) {
    const tp = Game.thunderPillars[i];
    tp.life -= dt;
    if (tp.life <= 0) tp.dead = true;
  }
  compact(Game.thunderPillars);
}

function castSwordLotusArray(p) {
  const r = 215;
  Game.lotusArrays.push({ x: p.x, y: p.y, r: r, life: 0.55, max: 0.55, rot: rand(0, TAU), dead: false });
  const dmg = Math.max(2, Math.round(effectiveDmg() * 2.4));
  for (let i = 0; i < Game.enemies.length; i++) {
    const e = Game.enemies[i];
    if (e.dead) continue;
    if (distSq(p.x, p.y, e.x, e.y) <= (r + e.r) * (r + e.r)) {
      const isCrit = Math.random() < p.stats.crit;
      damageEnemy(e, dmg * (isCrit ? p.stats.critMult : 1), isCrit, { x: p.x, y: p.y });
      const dd = Math.sqrt(distSq(e.x, e.y, p.x, p.y)) || 1;
      const kb = effectiveKb(220);
      e.kx += ((e.x - p.x) / dd) * kb;
      e.ky += ((e.y - p.y) / dd) * kb;
    }
  }
  Sfx.play('zap');
}

function updateLotusArrays(dt) {
  for (let i = 0; i < Game.lotusArrays.length; i++) {
    const la = Game.lotusArrays[i];
    la.life -= dt;
    la.rot += dt * 2.2;
    if (la.life <= 0) la.dead = true;
  }
  compact(Game.lotusArrays);
}

function spawnKunpengBlackhole(p) {
  if (Game.blackholes.length >= 2) return;
  const tgt = findNearestEnemy(p.x, p.y, 440);
  const bx = tgt ? tgt.x : (p.x + Math.cos(p.facing) * 160);
  const by = tgt ? tgt.y : (p.y + Math.sin(p.facing) * 160);
  Game.blackholes.push({
    x: bx, y: by, r: 195, life: 2.2, max: 2.2, tickT: 0.25,
    dmg: Math.max(4, Math.round(effectiveDmg() * 2.8)),
    cueFired: false, dead: false,
  });
}

function updateBlackholes(dt) {
  const p = Game.player;
  for (let i = 0; i < Game.blackholes.length; i++) {
    const bh = Game.blackholes[i];
    bh.life -= dt;
    bh.tickT -= dt;

    for (let j = 0; j < Game.enemies.length; j++) {
      const e = Game.enemies[j];
      if (e.dead || e.boss) continue;
      const d2 = distSq(bh.x, bh.y, e.x, e.y);
      if (d2 <= bh.r * bh.r && d2 > 16) {
        const d = Math.sqrt(d2) || 1;
        e.kx += ((bh.x - e.x) / d) * 320 * dt;
        e.ky += ((bh.y - e.y) / d) * 320 * dt;
      }
    }

    if (bh.tickT <= 0) {
      bh.tickT = 0.28;
      const gd = Math.max(1, Math.round(bh.dmg * 0.25));
      for (let j = 0; j < Game.enemies.length; j++) {
        const e = Game.enemies[j];
        if (!e.dead && distSq(bh.x, bh.y, e.x, e.y) <= (bh.r * 0.72 + e.r) * (bh.r * 0.72 + e.r)) {
          damageEnemy(e, gd, false, { x: bh.x, y: bh.y });
        }
      }
    }

    // 【Ⅳ阶 · 奇点坍缩开球】吸聚后轰入一发重型火莲母球引爆连环碰撞
    if (p && p.superposition && p.superposition.id === 'xuan_phys' && !bh.cueFired && bh.life <= bh.max - 0.65) {
      bh.cueFired = true;
      const ang = Math.atan2(bh.y - p.y, bh.x - p.x);
      spawnBullet(p.x + Math.cos(ang) * (p.r + 6), p.y + Math.sin(ang) * (p.r + 6), ang, {
        dmg: Math.max(6, Math.round(effectiveDmg() * 4.2)),
        r: 19, speed: 680, life: 1.4, pierce: 10, kb: 520,
        isLotusCue: true, color: '#E63312',
      });
    }

    if (bh.life <= 0) {
      bh.dead = true;
      Game.fx.push({ kind: 'lotus', x: bh.x, y: bh.y, r: 12, maxR: bh.r, life: 0.44, max: 0.44, rot: 0, layers: 3, color: '#E63312', dead: false });
      for (let j = 0; j < Game.enemies.length; j++) {
        const e = Game.enemies[j];
        if (e.dead) continue;
        if (distSq(bh.x, bh.y, e.x, e.y) <= (bh.r + e.r) * (bh.r + e.r)) {
          damageEnemy(e, bh.dmg, true, { x: bh.x, y: bh.y });
          const dd = Math.sqrt(distSq(e.x, e.y, bh.x, bh.y)) || 1;
          const kb = effectiveKb(420);
          e.kx += ((e.x - bh.x) / dd) * kb;
          e.ky += ((e.y - bh.y) / dd) * kb;
        }
      }
      Sfx.play('boom');
      addShake(6);
    }
  }
  compact(Game.blackholes);
}

function updateMirrors(dt) {
  const p = Game.player;
  if (!p) return;
  const arc3 = (p.archStages && (p.archStages.arcane || 0) >= 3);
  if (arc3) {
    p.prismPhase += dt * 0.9;
    let permCount = 0;
    for (let i = 0; i < Game.mirrors.length; i++) if (Game.mirrors[i].permanent) permCount++;
    if (permCount < 4) {
      for (let k = permCount; k < 4; k++) {
        Game.mirrors.push({ x: p.x, y: p.y, r: 17, life: 999, max: 999, fireT: 0.2 * k, permanent: true, idx: k, dead: false });
      }
    }
  }

  let permIdx = 0;
  for (let i = 0; i < Game.mirrors.length; i++) {
    const m = Game.mirrors[i];
    if (m.dead) continue;
    if (m.permanent) {
      if (!arc3) { m.dead = true; continue; }
      const ang = p.prismPhase + (permIdx * TAU) / 4;
      m.x = p.x + Math.cos(ang) * 135;
      m.y = p.y + Math.sin(ang) * 135;
      permIdx++;
    } else {
      m.life -= dt;
      if (m.life <= 0) { m.dead = true; continue; }
      m.fireT -= dt;
      if (m.fireT <= 0) {
        m.fireT = 0.45;
        const tgt = findNearestEnemy(m.x, m.y, 240);
        if (tgt) {
          const ld = Math.max(1, Math.round(effectiveDmg() * 0.55));
          damageEnemy(tgt, ld, false, { x: m.x, y: m.y });
          tgt.laserNetT = Math.max(tgt.laserNetT || 0, 1.4);
          Game.fx.push({ kind: 'arcane_beam', x1: m.x, y1: m.y, x2: tgt.x, y2: tgt.y, life: 0.16, max: 0.16, color: '#D97706', dead: false });
        }
      }
    }
  }
  compact(Game.mirrors);
}

function fireArcaneLaserNet(p) {
  const perms = Game.mirrors.filter(m => !m.dead && m.permanent);
  if (perms.length === 0) return;
  const dmg = Math.max(2, Math.round(effectiveDmg() * 0.95));
  for (let i = 0; i < perms.length; i++) {
    const m = perms[i];
    const visited = new Set();
    let fx = m.x, fy = m.y;
    for (let bounce = 0; bounce < 3; bounce++) {
      const tgt = findNearestEnemyExcept(fx, fy, 320, visited);
      if (!tgt) break;
      visited.add(tgt.id);
      tgt.laserNetT = 1.8;
      const isCrit = Math.random() < p.stats.crit;
      damageEnemy(tgt, dmg * (isCrit ? p.stats.critMult : 1), isCrit, { x: fx, y: fy });
      Game.fx.push({ kind: 'arcane_beam', x1: fx, y1: fy, x2: tgt.x, y2: tgt.y, life: 0.22, max: 0.22, color: '#FFB800', dead: false });
      fx = tgt.x;
      fy = tgt.y;
    }
  }
  Sfx.play('zap');
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
    if (s.capChain && pts.length >= 3) {
      Game.fx.push({
        kind: 'grid',
        pts: pts.slice(1).concat([pts[1]]),
        life: 1.8, max: 1.8, tickT: 0.32,
        dmg: Math.max(1, Math.round(baseChainDmg * 0.5)),
        color: '#0055FF', dead: false,
      });
    }
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
    if (p) {
      const lvHpGain = Math.max(3, Math.round(p.maxHp * 0.05 + 3));
      p.maxHp += lvHpGain;
      p.hp = Math.min(p.maxHp, p.hp + lvHpGain);
    }
    if (p && Game.level % 5 === 0) {
      const oldDmg = Math.round(effectiveDmg());
      p.coreTier = Math.max(p.coreTier || 1, 1 + Math.floor(Game.level / 5));
      p.stats.dmg += 1;
      p.stats.dmgMul *= 1.50;
      const oldHp = p.maxHp;
      p.maxHp = Math.round(p.maxHp * 1.35);
      p.hp = Math.min(p.maxHp, p.hp + Math.max(4, p.maxHp - oldHp));
      const newDmg = Math.round(effectiveDmg());
      triggerCoreBreakthrough(p, p.coreTier, oldDmg, newDmg);
      if (p.coreTier <= 3) Game.breakthroughFocus = true;
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
  Game.shake = Math.min(7, Game.shake + v * 0.32);
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
    else if (f.kind === 'grid' && f.pts && f.pts.length >= 2) {
      f.tickT -= dt;
      if (f.tickT <= 0) {
        f.tickT = 0.32;
        for (let j = 0; j < Game.enemies.length; j++) {
          const e = Game.enemies[j];
          if (e.dead) continue;
          let hitGrid = false;
          for (let k = 0; k < f.pts.length - 1; k++) {
            if (pointSegDistSq(e.x, e.y, f.pts[k][0], f.pts[k][1], f.pts[k + 1][0], f.pts[k + 1][1]) <= (e.r + 18) * (e.r + 18)) {
              hitGrid = true;
              break;
            }
          }
          if (hitGrid) {
            e.slowT = Math.max(e.slowT, 1.4);
            damageEnemy(e, f.dmg, false, null);
          }
        }
      }
    } else if (f.kind === 'slowfield') {
      for (let j = 0; j < Game.enemies.length; j++) {
        const e = Game.enemies[j];
        if (!e.dead && distSq(f.x, f.y, e.x, e.y) <= (f.r + e.r) * (f.r + e.r)) {
          e.slowT = Math.max(e.slowT, 0.25);
        }
      }
    } else if (f.kind === 'burnfield' || f.kind === 'rune_array') {
      f.tickT -= dt;
      if (f.tickT <= 0) {
        f.tickT = f.kind === 'burnfield' ? 0.3 : 0.38;
        for (let j = 0; j < Game.enemies.length; j++) {
          const e = Game.enemies[j];
          if (!e.dead && distSq(f.x, f.y, e.x, e.y) <= (f.r + e.r) * (f.r + e.r)) {
            if (f.kind === 'rune_array') e.slowT = Math.max(e.slowT, 0.9);
            damageEnemy(e, f.dmg, false, { x: f.x, y: f.y });
          }
        }
      }
    } else if (f.kind === 'lotus') {
      f.r = f.maxR * (1 - f.life / f.max);
    }
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

/** 优先收割残血/已受伤敌球，避免新刷的高血量怪肉身挡枪导致断档 */
function findBestPrimaryTarget(x, y, maxDist) {
  let best = null;
  let bestScore = Infinity;
  const max2 = maxDist * maxDist;
  const arr = Game.enemies;
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i];
    if (e.dead) continue;
    const d2 = distSq(x, y, e.x, e.y);
    if (d2 >= max2) continue;
    const ratio = clamp(e.hp / (e.maxHp || 1), 0, 1);
    let score = d2 * (0.55 + 0.45 * ratio);
    if (e.hp < e.maxHp) score *= 0.72;
    if (score < bestScore) { bestScore = score; best = e; }
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
  const p = Game.player;
  const th = getArchThresholds();
  const maxUlt = getMaxUltimates();
  const maxedCount = p && p.maxedArchs ? p.maxedArchs.length : 0;

  let pool = [];
  for (let i = 0; i < SKILLS.length; i++) {
    const s = SKILLS[i];
    if ((owned[s.id] || 0) >= s.maxLv) continue;
    // 一旦已有两条流派达到 Ⅲ阶，屏蔽未觉醒流派的 Ⅲ阶突破核心卡（保留属性/特殊补强）
    if (maxedCount >= maxUlt && s.archetype && p.maxedArchs.indexOf(s.archetype) < 0) {
      const curPts = p.archetypes[s.archetype] || 0;
      const ptsAdd = s.archPts || 1;
      if ((ptsAdd >= 2 || s.type === 'attack' || s.type === 'sub') && curPts + ptsAdd >= th.stage3) continue;
    }
    pool.push(s);
  }
  if (pool.length < n) {
    pool = SKILLS.filter(s => (owned[s.id] || 0) < s.maxLv);
  }

  const out = [];
  const archPtsMap = p && p.archetypes ? p.archetypes : {};
  const archStMap = p && p.archStages ? p.archStages : {};
  const partners = (maxedCount === 1 && p && !p.superposition) ? getComboPartners(p.maxedArchs[0]) : [];
  let totalArchPts = 0;
  for (let i = 0; i < ARCH_IDS.length; i++) totalArchPts += (archPtsMap[ARCH_IDS[i]] || 0);

  const activeSorted = ARCH_IDS
    .filter(id => (archPtsMap[id] || 0) > 0 && (archStMap[id] || 0) < 3)
    .sort((a, b) => (archPtsMap[b] || 0) - (archPtsMap[a] || 0));
  const top2 = activeSorted.slice(0, 2);

  // 槽位 1：已拥有未满级功法保底（兼容 Test 13 直接设置 Game.owned = { dmg: 2 }）
  const ownedPool = pool.filter(s => (owned[s.id] || 0) > 0);
  if (ownedPool.length > 0 && out.length < n) {
    ownedPool.sort((a, b) => {
      const aInc = a.archetype && (archStMap[a.archetype] || 0) < 3 ? (archPtsMap[a.archetype] || 0) : -1;
      const bInc = b.archetype && (archStMap[b.archetype] || 0) < 3 ? (archPtsMap[b.archetype] || 0) : -1;
      if (bInc !== aInc) return bInc - aInc;
      const lvDiff = (owned[b.id] || 0) - (owned[a.id] || 0);
      if (lvDiff !== 0) return lvDiff;
      return (b.archPts || 1) - (a.archPts || 1);
    });
    const pickOwned = Math.random() < 0.68 ? ownedPool[0] : pick(ownedPool);
    const pIdx = pool.indexOf(pickOwned);
    if (pIdx >= 0) {
      pool.splice(pIdx, 1);
      out.push({ skill: pickOwned, lv: owned[pickOwned.id] || 0 });
    }
  }

  // 槽位 2：已有 1 个 Ⅲ阶流派时，引导出 1 张合法 COMBO 搭档流派卡，防止卡手
  if (partners.length > 0 && out.length < n && out.every(o => partners.indexOf(o.skill.archetype) < 0)) {
    const partnerPool = pool.filter(s => s.archetype && partners.indexOf(s.archetype) >= 0);
    if (partnerPool.length > 0) {
      partnerPool.sort((a, b) => {
        const ptsDiff = (archPtsMap[b.archetype] || 0) - (archPtsMap[a.archetype] || 0);
        if (ptsDiff !== 0) return ptsDiff;
        const coreDiff = (b.archPts || 1) - (a.archPts || 1);
        if (coreDiff !== 0) return coreDiff;
        return (owned[b.id] || 0) - (owned[a.id] || 0);
      });
      const chosen = Math.random() < 0.72 ? partnerPool[0] : pick(partnerPool);
      const pIdx = pool.indexOf(chosen);
      if (pIdx >= 0) {
        pool.splice(pIdx, 1);
        out.push({ skill: chosen, lv: owned[chosen.id] || 0 });
      }
    }
  }

  const starterOrb = p ? getOrb(p.orbId) : null;
  const focus = !!Game.breakthroughFocus;

  while (out.length < n && pool.length > 0) {
    const weights = pool.map(function (s) {
      const lv = owned[s.id] || 0;
      let w = lv > 0 ? (4.5 + lv * 1.1) * (lv >= 3 ? 1.55 : 1) : 1;
      if (s.midLv && lv + 1 === s.midLv) w *= 1.35;
      if (lv + 1 === s.maxLv && s.capstoneDesc) w *= 1.5;
      if (s.type === 'attack') w *= 1.4;

      if (p && s.archetype) {
        const aId = s.archetype;
        const pts = archPtsMap[aId] || 0;
        const add = s.archPts || 1;
        if (totalArchPts === 0 && starterOrb && starterOrb.archetype === aId) w *= 1.35;
        if (maxedCount >= 1 && p.maxedArchs.indexOf(aId) >= 0) w *= 1.35;
        else if (partners.length > 0) {
          if (partners.indexOf(aId) >= 0) {
            w *= pts > 0 ? 4.2 : 2.8;
          } else {
            w *= 0.45;
          }
        } else if (top2.length > 0) {
          if (top2.indexOf(aId) >= 0) w *= 2.3;
          else if (top2.length >= 2 && pts === 0) w *= 0.45;
        }
        if (maxedCount < maxUlt && p.maxedArchs.indexOf(aId) < 0) {
          if (pts < th.stage2 && pts + add >= th.stage2) w *= 2.0;
          if (pts < th.stage3 && pts + add >= th.stage3) w *= 2.4;
        }
        if (focus && (top2.indexOf(aId) >= 0 || partners.indexOf(aId) >= 0)) w *= 2.2;
      }
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

  Game.breakthroughFocus = false;

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

  Render.vignette(ctx, W, H);

  drawBeaconIndicators(ctx, W, H);

  if (Game.flash > 0.01) {
    ctx.fillStyle = rgba('#E63312', (Game.flash * 0.16).toFixed(3));
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = rgba('#E63312', (Game.flash * 0.7).toFixed(3));
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
  Render.vignette(ctx, Game.W, Game.H);
}

function drawWorld(ctx) {
  const p = Game.player;

  /* 几何信标（地面层） */
  drawBeacons(ctx);

  /* 流派地面领域：灼烧印记 / 卢恩麻痹阵 / 鲲鹏黑洞 / 八瓣青莲剑阵 */
  for (let i = 0; i < Game.fx.length; i++) {
    const f = Game.fx[i];
    if (f.kind !== 'burnfield' && f.kind !== 'rune_array') continue;
    const a = clamp(f.life / f.max, 0, 1);
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.beginPath();
    ctx.arc(0, 0, f.r, 0, TAU);
    ctx.fillStyle = rgba(f.color, a * 0.10);
    ctx.fill();
    ctx.rotate(Game.time * (f.kind === 'rune_array' ? 0.6 : -0.8));
    if (f.kind === 'rune_array') {
      const sq = f.r * 0.72;
      ctx.strokeStyle = rgba('#4F3CC9', a * 0.65);
      ctx.lineWidth = 1.8;
      ctx.strokeRect(-sq, -sq, sq * 2, sq * 2);
      ctx.rotate(Math.PI / 4);
      ctx.strokeRect(-sq, -sq, sq * 2, sq * 2);
    } else {
      ctx.strokeStyle = rgba('#E63312', a * 0.65);
      ctx.lineWidth = 1.8;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  for (let i = 0; i < Game.blackholes.length; i++) {
    const bh = Game.blackholes[i];
    const a = clamp(bh.life / bh.max, 0, 1);
    ctx.save();
    ctx.translate(bh.x, bh.y);
    ctx.beginPath();
    ctx.arc(0, 0, bh.r, 0, TAU);
    ctx.fillStyle = rgba('#111315', 0.14 * a);
    ctx.fill();
    ctx.rotate(Game.time * 2.4);
    for (let arm = 0; arm < 6; arm++) {
      ctx.rotate(TAU / 6);
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(bh.r * 0.85, bh.r * 0.28);
      ctx.strokeStyle = arm % 2 === 0 ? rgba('#E63312', 0.75 * a) : rgba('#FFB800', 0.65 * a);
      ctx.lineWidth = 2.2;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, TAU);
    ctx.fillStyle = '#111315';
    ctx.fill();
    ctx.strokeStyle = '#FFB800';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  for (let i = 0; i < Game.lotusArrays.length; i++) {
    const la = Game.lotusArrays[i];
    const a = clamp(la.life / la.max, 0, 1);
    const curR = la.r * (0.4 + 0.6 * (1 - a));
    ctx.save();
    ctx.translate(la.x, la.y);
    ctx.rotate(la.rot);
    for (let k = 0; k < 8; k++) {
      ctx.rotate(TAU / 8);
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(curR, -12 * a);
      ctx.lineTo(curR + 12, 0);
      ctx.lineTo(curR, 12 * a);
      ctx.strokeStyle = k % 2 === 0 ? rgba('#00A86B', a * 0.88) : rgba('#111315', a * 0.75);
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  /* 奥术三角/六芒折射棱镜 */
  for (let i = 0; i < Game.mirrors.length; i++) {
    const m = Game.mirrors[i];
    if (m.dead) continue;
    const a = m.permanent ? 0.95 : clamp(m.life / m.max, 0, 1);
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(Game.time * (m.permanent ? 1.5 : 1.0));
    const mr = m.r;
    const layers = m.permanent ? 2 : 1;
    for (let l = 0; l < layers; l++) {
      if (l === 1) ctx.rotate(Math.PI);
      ctx.beginPath();
      ctx.moveTo(0, -mr);
      ctx.lineTo(mr * 0.86, mr * 0.52);
      ctx.lineTo(-mr * 0.86, mr * 0.52);
      ctx.lineTo(0, -mr);
      ctx.strokeStyle = l === 0 ? rgba('#D97706', a) : rgba('#111315', a * 0.85);
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  /* 台球 Ⅱ阶瞄准延长虚线 + 撞击点幽灵预测圈 */
  const physStDraw = Math.max(
    (p && p.archStages && p.archStages.billiard) || 0,
    (p && p.stats && p.stats.capPinball) ? 3 : ((p && p.stats && p.stats.midPinball) ? 2 : 0)
  );
  if (p && physStDraw >= 2) {
    const aimTgt = findNearestEnemy(p.x, p.y, 720);
    if (aimTgt) {
      const ang = aimAngle(p, aimTgt);
      const dx = aimTgt.x - p.x;
      const dy = aimTgt.y - p.y;
      const dist = Math.hypot(dx, dy) || 1;
      const gx = p.x + Math.cos(ang) * dist;
      const gy = p.y + Math.sin(ang) * dist;
      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([6, 6]);
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(gx + Math.cos(ang) * 90, gy + Math.sin(ang) * 90);
      ctx.strokeStyle = rgba('#111315', 0.42);
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(gx, gy, aimTgt.r * 0.62, 0, TAU);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }

  /* 经验球 */
  for (let i = 0; i < Game.xpOrbs.length; i++) {
    const o = Game.xpOrbs[i];
    Render.drawBall(ctx, o.x, o.y, o.r + 1, '#00A86B', '#008F5A');
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
      ctx.strokeStyle = rgba('#E63312', 0.85);
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
      ctx.strokeStyle = rgba('#0284C7', 0.65);
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
          ctx.strokeStyle = rgba('#E63312', 0.65);
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
      ctx.strokeStyle = rgba('#0284C7', 0.78);
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
    if (e.thunderMarkT > 0) {
      const m = e.r + 5;
      ctx.strokeStyle = '#4F3CC9';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(ex - m, ey - m + 5); ctx.lineTo(ex - m, ey - m); ctx.lineTo(ex - m + 5, ey - m);
      ctx.moveTo(ex + m - 5, ey - m); ctx.lineTo(ex + m, ey - m); ctx.lineTo(ex + m, ey - m + 5);
      ctx.moveTo(ex - m, ey + m - 5); ctx.lineTo(ex - m, ey + m); ctx.lineTo(ex - m + 5, ey + m);
      ctx.moveTo(ex + m - 5, ey + m); ctx.lineTo(ex + m, ey + m); ctx.lineTo(ex + m, ey + m - 5);
      ctx.stroke();
    }
    if (e.stakeT > 0) {
      ctx.strokeStyle = '#00A86B';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(ex, ey - e.r - 14);
      ctx.lineTo(ex, ey - e.r + 2);
      ctx.moveTo(ex - 5, ey - e.r - 9);
      ctx.lineTo(ex + 5, ey - e.r - 9);
      ctx.stroke();
    }
    if (e.laserNetT > 0) {
      ctx.beginPath();
      ctx.arc(ex, ey, e.r + 6, 0, TAU);
      ctx.strokeStyle = rgba('#FFB800', 0.72);
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    if (e.thunderCharged) {
      ctx.beginPath();
      ctx.arc(ex, ey, e.r + 5, 0, TAU);
      ctx.strokeStyle = '#4F3CC9';
      ctx.lineWidth = 2.2;
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
    ctx.strokeStyle = rgba('#0055FF', 0.22);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    if (p.stats.capOrb) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, orbitR + 28, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();

    for (let i = 0; i < Game.orbLasers.length; i++) {
      const l = Game.orbLasers[i];
      ctx.beginPath();
      ctx.moveTo(l[0], l[1]);
      ctx.lineTo(l[2], l[3]);
      ctx.strokeStyle = 'rgba(0, 85, 255, 0.65)';
      ctx.lineWidth = 2.4;
      ctx.stroke();
    }

    for (let i = 0; i < Game.orbPos.length; i++) {
      const o = Game.orbPos[i];
      const oCol = o.fireLotus ? (o.idx % 2 === 0 ? '#E63312' : '#FFB800')
        : o.taiji ? (o.idx % 2 === 0 ? '#FFFFFF' : '#111315')
        : (o.outer ? '#0055FF' : '#4F3CC9');
      const oStroke = o.taiji ? '#00A86B' : '#111315';
      Render.drawBall(ctx, o.x, o.y, o.r, oCol, oStroke);
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r + 3.5, 0, TAU);
      ctx.strokeStyle = o.fireLotus ? rgba('#E63312', 0.45) : (o.outer ? rgba('#0055FF', 0.35) : rgba('#4F3CC9', 0.35));
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
    ctx.strokeStyle = rgba('#D97706', 0.28);
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

    if (b.sawActive) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(Game.time * 18);
      ctx.strokeStyle = '#E63312';
      ctx.lineWidth = 2;
      ctx.strokeRect(-(visR + 3), -(visR + 3), (visR + 3) * 2, (visR + 3) * 2);
      ctx.restore();
    } else if (b.isHammer) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(Game.time * 16);
      ctx.strokeStyle = '#4F3CC9';
      ctx.lineWidth = 2;
      ctx.strokeRect(-(visR + 2.5), -(visR + 2.5), (visR + 2.5) * 2, (visR + 2.5) * 2);
      ctx.restore();
    } else if (b.isFireOrb || b.isLotusCue) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(-Game.time * 10);
      ctx.strokeStyle = '#FFB800';
      ctx.lineWidth = 1.8;
      ctx.strokeRect(-(visR + 2), -(visR + 2), (visR + 2) * 2, (visR + 2) * 2);
      ctx.restore();
    } else if (b.isXianSword || b.isPrismSplit) {
      const sa = Math.atan2(b.vy, b.vx);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(sa);
      ctx.beginPath();
      ctx.moveTo(visR + 6, 0);
      ctx.lineTo(0, visR * 0.65);
      ctx.lineTo(-visR - 5, 0);
      ctx.lineTo(0, -visR * 0.65);
      ctx.lineTo(visR + 6, 0);
      ctx.strokeStyle = b.isPrismSplit ? '#FFB800' : '#00A86B';
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.restore();
    } else if (magTier >= 2) {
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
    } else if (f.kind === 'chain' || f.kind === 'grid') {
      drawChain(ctx, f, a);
    } else if (f.kind === 'beam') {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(f.x1, f.y1);
      ctx.lineTo(f.x2, f.y2);
      ctx.strokeStyle = rgba(f.color, a * 0.85);
      ctx.lineWidth = 6 * a + 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(f.x1, f.y1);
      ctx.lineTo(f.x2, f.y2);
      ctx.strokeStyle = rgba('#FFFFFF', a * 0.9);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    } else if (f.kind === 'arcane_beam') {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(f.x1, f.y1);
      ctx.lineTo(f.x2, f.y2);
      ctx.strokeStyle = rgba('#111315', a * 0.85);
      ctx.lineWidth = 5 * a + 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(f.x1, f.y1);
      ctx.lineTo(f.x2, f.y2);
      ctx.strokeStyle = rgba(f.color || '#FFB800', a * 0.95);
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.restore();
    } else if (f.kind === 'lotus') {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rot + (1 - a) * 1.5);
      const layers = f.layers || 2;
      const cols = ['#E63312', '#FFB800', '#111315'];
      for (let l = 0; l < layers; l++) {
        if (l > 0) ctx.rotate(Math.PI / (layers * 2));
        const sz = f.r * (0.72 - l * 0.1);
        ctx.strokeStyle = rgba(l === 0 && f.color ? f.color : cols[l % cols.length], a * 0.85);
        ctx.lineWidth = 2.2 - l * 0.3;
        ctx.strokeRect(-sz, -sz, sz * 2, sz * 2);
      }
      ctx.restore();
    } else if (f.kind === 'deconstruct_cross') {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.strokeStyle = rgba(f.color || '#FFB800', a * 0.9);
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-f.r, 0); ctx.lineTo(f.r, 0);
      ctx.moveTo(0, -f.r); ctx.lineTo(0, f.r);
      ctx.stroke();
      ctx.strokeRect(-f.r * 0.45, -f.r * 0.45, f.r * 0.9, f.r * 0.9);
      ctx.restore();
    } else if (f.kind === 'slowfield') {
      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([6, 6]);
      ctx.arc(f.x, f.y, f.r, 0, TAU);
      ctx.fillStyle = rgba(f.color, a * 0.08);
      ctx.fill();
      ctx.strokeStyle = rgba(f.color, a * 0.45);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }

  /* 北欧天降雷柱（黑蓝双层垂直贯通光束） */
  for (let i = 0; i < Game.thunderPillars.length; i++) {
    const tp = Game.thunderPillars[i];
    const a = clamp(tp.life / tp.max, 0, 1);
    const halfH = Math.max(520, (Game.H || 800) * 0.7);
    const w = tp.w * (0.55 + a * 0.45);
    ctx.save();
    ctx.fillStyle = rgba('#111315', a * 0.78);
    ctx.fillRect(tp.x - w * 0.5, tp.y - halfH, w, halfH);
    ctx.fillStyle = rgba('#0055FF', a * 0.9);
    ctx.fillRect(tp.x - w * 0.25, tp.y - halfH, w * 0.5, halfH);
    ctx.beginPath();
    ctx.arc(tp.x, tp.y, 68 * (1 - a * 0.3), 0, TAU);
    ctx.strokeStyle = rgba('#4F3CC9', a * 0.85);
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
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
    Render.text(ctx, b.reward.label + ' · ' + Math.ceil(b.life) + 's', b.x, b.y - 24, 11, col, 'rgba(247,245,239,0.92)', 800);
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

  // 地面定位光盘：低饱和染色圆 + 细刻度环，让玩家在密集敌群中一眼可辨
  const haloR = p.r + 26;
  ctx.beginPath();
  ctx.arc(p.x, p.y, haloR, 0, TAU);
  ctx.fillStyle = rgba(orb.ringColor, 0.11);
  ctx.fill();
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(-Game.time * 0.25);
  ctx.beginPath();
  ctx.setLineDash([2, 7]);
  ctx.arc(0, 0, haloR, 0, TAU);
  ctx.strokeStyle = rgba(orb.ringColor, 0.6);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
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

  // 【仙侠 Ⅲ阶】脚下展开旋转太极八卦罗盘虚线环
  if (p.archStages && (p.archStages.xianxia || 0) >= 3) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Game.time * 0.45);
    ctx.beginPath();
    ctx.setLineDash([5, 5]);
    ctx.arc(0, 0, drawR + 18, 0, TAU);
    ctx.strokeStyle = rgba('#00A86B', 0.45);
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  ctx.globalAlpha = alpha;
  if (p.superposition) {
    drawSuperpositionOrb(ctx, p.x, p.y, drawR * pulse, p.superposition, Game.time);
  } else if (p.primaryArch && p.archStages && p.archStages[p.primaryArch] >= 1) {
    drawStyledOrb(ctx, p.x, p.y, drawR * pulse, p.primaryArch, p.archStages[p.primaryArch] - 1, Game.time);
  } else {
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
  }
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
    if (ctx.closePath) ctx.closePath();
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
  ctx.strokeStyle = rgba('#111315', 0.35);
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

function drawStyledOrb(ctx, x, y, r, archId, stageIdx, t) {
  ctx.save();
  ctx.translate(x, y);
  if (archId === 'xianxia' && stageIdx >= 1) {
    ctx.save(); ctx.rotate(t * 1.4); ctx.strokeStyle = '#00A86B'; ctx.lineWidth = 2;
    const cnt = stageIdx === 2 ? 8 : 4;
    for (let i = 0; i < cnt; i++) {
      ctx.rotate(TAU / cnt);
      ctx.beginPath(); ctx.moveTo(r + 3, 0); ctx.lineTo(r + (stageIdx === 2 ? 10 : 7), 0); ctx.stroke();
    }
    ctx.restore();
  } else if (archId === 'norse' && stageIdx >= 1) {
    ctx.save(); ctx.rotate(t * 2);
    const cnt = stageIdx === 2 ? 6 : 3;
    for (let i = 0; i < cnt; i++) {
      ctx.rotate(TAU / cnt);
      ctx.beginPath(); ctx.moveTo(r + 9, 0); ctx.lineTo(r + 3, -3.5); ctx.lineTo(r + 3, 3.5); ctx.lineTo(r + 9, 0);
      ctx.fillStyle = stageIdx === 2 ? '#FFB800' : '#4F3CC9'; ctx.fill();
    }
    ctx.restore();
  } else if (archId === 'xuanhuan' && stageIdx >= 1) {
    ctx.save(); ctx.rotate(t * 1.5);
    const sz = r * 1.25;
    ctx.strokeStyle = stageIdx === 2 ? '#FFB800' : '#E63312'; ctx.lineWidth = 1.8;
    ctx.strokeRect(-sz, -sz, sz * 2, sz * 2);
    if (stageIdx === 2) { ctx.rotate(Math.PI / 4); ctx.strokeStyle = '#111315'; ctx.strokeRect(-sz, -sz, sz * 2, sz * 2); }
    ctx.restore();
  } else if (archId === 'arcane' && stageIdx >= 1) {
    ctx.save(); ctx.rotate(t * 1.2); ctx.strokeStyle = '#D97706'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, 0, r + 6, 0, TAU); ctx.stroke();
    const cnt = stageIdx === 2 ? 4 : 2;
    for (let i = 0; i < cnt; i++) {
      ctx.rotate(TAU / cnt);
      ctx.fillStyle = '#FFB800';
      ctx.fillRect(r + 4, -2.5, 5, 5);
    }
    ctx.restore();
  } else if (archId === 'billiard' && stageIdx >= 1) {
    ctx.save(); ctx.rotate(t * 0.6); ctx.strokeStyle = '#111315'; ctx.lineWidth = 1.8;
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath(); ctx.arc(0, 0, r + 5, -0.35, 0.35); ctx.stroke();
    }
    ctx.restore();
  } else if (archId === 'exact_zero' && stageIdx >= 1) {
    ctx.save(); ctx.rotate(-t * 0.9); ctx.strokeStyle = '#0055FF'; ctx.lineWidth = 1.6;
    const m = r + 6;
    ctx.beginPath();
    ctx.moveTo(-m, 0); ctx.lineTo(-r - 1, 0); ctx.moveTo(m, 0); ctx.lineTo(r + 1, 0);
    ctx.moveTo(0, -m); ctx.lineTo(0, -r - 1); ctx.moveTo(0, m); ctx.lineTo(0, r + 1);
    ctx.stroke();
    ctx.restore();
  }

  const baseCol = archId === 'billiard' ? (stageIdx === 2 ? '#111315' : '#FFFFFF')
    : archId === 'xianxia' ? '#00A86B' : archId === 'norse' ? '#4F3CC9'
    : archId === 'xuanhuan' ? '#E63312' : archId === 'arcane' ? '#FFB800' : '#0055FF';
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = baseCol; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = '#111315'; ctx.stroke();

  const s = r * 0.58;
  ctx.strokeStyle = '#FFFFFF'; ctx.fillStyle = '#FFFFFF'; ctx.lineWidth = 1.8;
  if (archId === 'xianxia') {
    if (stageIdx === 0) {
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.45, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.45, 0); ctx.lineTo(0, -s); ctx.stroke();
    } else if (stageIdx === 1) {
      ctx.rotate(t * 1.5);
      ctx.beginPath(); ctx.arc(0, 0, s, -Math.PI / 2, Math.PI / 2); ctx.fillStyle = '#111315'; ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, s, Math.PI / 2, -Math.PI / 2); ctx.fillStyle = '#FFFFFF'; ctx.fill();
    } else {
      ctx.rotate(t * 1.2);
      for (let k = 0; k < 2; k++) { ctx.rotate(Math.PI / 4); ctx.strokeRect(-s * 0.72, -s * 0.72, s * 1.44, s * 1.44); }
    }
  } else if (archId === 'norse') {
    ctx.strokeStyle = stageIdx === 2 ? '#FFB800' : '#FFFFFF';
    if (stageIdx === 0) {
      ctx.beginPath(); ctx.moveTo(s * 0.35, -s * 0.8); ctx.lineTo(-s * 0.4, 0); ctx.lineTo(s * 0.4, 0); ctx.lineTo(-s * 0.35, s * 0.8); ctx.stroke();
    } else if (stageIdx === 1) {
      ctx.strokeRect(-s * 0.65, -s * 0.65, s * 1.3, s * 0.55);
      ctx.beginPath(); ctx.moveTo(0, -s * 0.1); ctx.lineTo(0, s * 0.85); ctx.stroke();
    } else {
      ctx.rotate(t * 0.9);
      for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(0, s); ctx.stroke(); }
    }
  } else if (archId === 'xuanhuan') {
    if (stageIdx === 0) {
      ctx.beginPath(); ctx.arc(0, 0, s * 0.45, 0, TAU); ctx.fill();
    } else if (stageIdx === 1) {
      ctx.rotate(t * 1.6); ctx.fillStyle = '#FFB800'; ctx.fillRect(-s * 0.6, -s * 0.6, s * 1.2, s * 1.2);
      ctx.beginPath(); ctx.arc(0, 0, s * 0.3, 0, TAU); ctx.fillStyle = '#111315'; ctx.fill();
    } else {
      ctx.rotate(-t * 1.4); ctx.strokeStyle = '#FFB800';
      for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 4); ctx.strokeRect(-s * 0.65, -s * 0.65, s * 1.3, s * 1.3); }
    }
  } else if (archId === 'arcane') {
    ctx.strokeStyle = '#111315';
    if (stageIdx === 0) {
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.85, s * 0.6); ctx.lineTo(-s * 0.85, s * 0.6); ctx.lineTo(0, -s); ctx.stroke();
    } else if (stageIdx === 1) {
      ctx.rotate(t);
      for (let k = 0; k < 2; k++) {
        ctx.rotate(Math.PI); ctx.strokeStyle = k ? '#FFFFFF' : '#111315';
        ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.85, s * 0.5); ctx.lineTo(-s * 0.85, s * 0.5); ctx.lineTo(0, -s); ctx.stroke();
      }
    } else {
      ctx.rotate(t * 1.5); ctx.beginPath(); ctx.arc(0, 0, s * 0.88, 0, TAU); ctx.stroke();
      ctx.save();
      ctx.scale(1, 0.41);
      ctx.beginPath(); ctx.arc(0, 0, s * 0.88, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  } else if (archId === 'billiard') {
    if (stageIdx === 0) {
      ctx.beginPath(); ctx.arc(0, 0, r * 0.26, 0, TAU); ctx.fillStyle = '#E63312'; ctx.fill();
    } else if (stageIdx === 1) {
      ctx.fillStyle = '#111315'; ctx.fillRect(-r * 0.9, -r * 0.4, r * 1.8, r * 0.8);
      ctx.beginPath(); ctx.arc(0, 0, r * 0.36, 0, TAU); ctx.fillStyle = '#FFFFFF'; ctx.fill();
    } else {
      ctx.rotate(t * 2.5); ctx.strokeStyle = '#FFB800';
      for (let i = 0; i < 3; i++) { ctx.rotate(TAU / 3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * 0.85, 0); ctx.stroke(); }
    }
  } else {
    if (stageIdx === 0) {
      ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.6); ctx.lineTo(-s * 0.3, s * 0.6); ctx.moveTo(s * 0.3, -s * 0.6); ctx.lineTo(s * 0.3, s * 0.6); ctx.stroke();
    } else if (stageIdx === 1) {
      ctx.beginPath(); ctx.arc(0, 0, s * 0.55, 0, TAU); ctx.stroke();
    } else {
      ctx.rotate(t); ctx.strokeStyle = '#FFB800'; ctx.strokeRect(-s * 0.7, -s * 0.7, s * 1.4, s * 1.4);
    }
  }
  ctx.restore();
}

function drawSuperpositionOrb(ctx, x, y, r, combo, t) {
  ctx.save();
  ctx.translate(x, y);
  const colA = combo.a.col;
  const colB = combo.b.col;
  ctx.save(); ctx.rotate(t * 1.4);
  const or = r * 1.3;
  ctx.strokeStyle = colA; ctx.lineWidth = 1.8; ctx.strokeRect(-or * 0.7, -or * 0.7, or * 1.4, or * 1.4);
  ctx.rotate(Math.PI / 4 - t * 2.8); ctx.strokeStyle = colB; ctx.strokeRect(-or * 0.7, -or * 0.7, or * 1.4, or * 1.4);
  ctx.restore();

  ctx.save(); ctx.rotate(t * 0.8);
  ctx.beginPath(); ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2); ctx.fillStyle = colA; ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, r, Math.PI / 2, -Math.PI / 2); ctx.fillStyle = colB; ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.strokeStyle = '#111315'; ctx.lineWidth = 2.2; ctx.stroke();
  ctx.restore();

  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.lineWidth = 2.2; ctx.strokeStyle = '#111315'; ctx.stroke();
  const s = r * 0.6;
  ctx.rotate(-t * 1.5); ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.8;
  ctx.strokeRect(-s * 0.68, -s * 0.68, s * 1.36, s * 1.36);
  ctx.rotate(Math.PI / 4); ctx.strokeStyle = '#FFB800';
  ctx.strokeRect(-s * 0.68, -s * 0.68, s * 1.36, s * 1.36);
  ctx.restore();
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
