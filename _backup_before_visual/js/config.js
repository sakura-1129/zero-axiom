'use strict';

/* ══════════════ 全局数值 ══════════════ */
const CFG = {
  duration: 360,            // 一局时长（6 分钟）
  maxEnemies: 240,
  maxBullets: 420,
  maxXpOrbs: 320,

  player: {
    r: 14,
    speed: 230,
    maxHp: 30,
    pickup: 95,
    fireInterval: 0.62,
    dmg: 1,
    bullets: 1,
    spread: 0.075,
    bulletSpeed: 730,
    bulletR: 9,
    bulletLife: 1.25,
    crit: 0.05,
    critMult: 2.0,
    dashCd: 2.5,
    dashTime: 0.16,
    dashMul: 3.3,
    iframe: 0.60,
  },

  /* 敌人基础值 —— 微尘起步（3血2伤），随时间递进膨胀至十万/百万级 */
  enemies: {
    walker:   { label: '游荡球',     r: 16, speed: 92,  hp: 3,   dmg: 2, xp: 2,  color: '#E63312', weight: 1 },
    sprinter: { label: '疾行球',     r: 12, speed: 146, hp: 2,   dmg: 2, xp: 2,  color: '#F26419', weight: 1 },
    splitter: { label: '裂变球',     r: 20, speed: 88,  hp: 7,   dmg: 3, xp: 3,  color: '#D92662', weight: 1 },
    charger:  { label: '矢量冲锋球', r: 17, speed: 90,  hp: 12,  dmg: 4, xp: 5,  color: '#EA580C', weight: 1 },
    tank:     { label: '重甲球',     r: 27, speed: 58,  hp: 20,  dmg: 5, xp: 5,  color: '#4F3CC9', weight: 1 },
    shooter:  { label: '炮击球',     r: 18, speed: 70,  hp: 10,  dmg: 3, xp: 4,  color: '#6D28D9', weight: 1 },
    shielder: { label: '相位棱镜球', r: 19, speed: 66,  hp: 16,  dmg: 2, xp: 6,  color: '#0284C7', weight: 1 },
    boss:     { label: '秩序核心',   r: 54, speed: 56,  hp: 360, dmg: 6, xp: 45, color: '#111315', weight: 0 },
  },
};

/* 三阶段首领预设 */
const BOSS_CONFIGS = [
  { tier: 1, time: 110, label: '秩序核心 · 壹型',   r: 52, hpMul: 1.0,  speed: 56, dmg: 6 },
  { tier: 2, time: 230, label: '矩阵切割者 · 贰型', r: 56, hpMul: 1.50, speed: 58, dmg: 8 },
  { tier: 3, time: 340, label: '奇点主宰 · 终型',   r: 62, hpMul: 2.20, speed: 62, dmg: 10 },
];

/* ══════════════ 技能类型 ══════════════ */
const SKILL_TYPES = {
  attack:  { label: '攻击',   code: 'ATK', color: '#E63312' },
  sub:     { label: '副武器', code: 'SUB', color: '#4F3CC9' },
  stat:    { label: '属性',   code: 'SYS', color: '#0055FF' },
  special: { label: '特殊',   code: 'SPC', color: '#D97706' },
};

/* ══════════════ 瑞士几何 SVG 图标 ══════════════ */
const SKILL_SVGS = {
  dmg:            '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/>',
  rate:           '<polygon points="13 2 5 14 11 14 10 22 19 10 13 10 13 2" fill="currentColor" stroke="none"/>',
  multi:          '<circle cx="12" cy="5" r="2.2" fill="currentColor" stroke="none"/><circle cx="5.5" cy="17" r="2.2" fill="currentColor" stroke="none"/><circle cx="18.5" cy="17" r="2.2" fill="currentColor" stroke="none"/><line x1="12" y1="13" x2="12" y2="7.5"/><line x1="12" y1="13" x2="6.8" y2="15.8"/><line x1="12" y1="13" x2="17.2" y2="15.8"/>',
  pierce:         '<line x1="3" y1="12" x2="19" y2="12"/><polyline points="14 7 20 12 14 17"/><line x1="11" y1="5" x2="11" y2="19" stroke-dasharray="2 2"/>',
  crit:           '<line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="5.6" y1="5.6" x2="18.4" y2="18.4"/><line x1="18.4" y1="5.6" x2="5.6" y2="18.4"/>',
  split:          '<circle cx="6" cy="12" r="3" fill="currentColor" stroke="none"/><line x1="9" y1="12" x2="17" y2="6.5"/><line x1="9" y1="12" x2="17" y2="17.5"/><circle cx="18.5" cy="6" r="2"/><circle cx="18.5" cy="18" r="2"/>',
  bounce:         '<polyline points="4 17 10 7 15 15 20 7"/><polyline points="16 7 20 7 20 11"/>',
  orb:            '<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="8.5" stroke-dasharray="3 3"/><circle cx="18" cy="6" r="2.2" fill="currentColor" stroke="none"/>',
  chain:          '<polyline points="4 18 9 11 14 14 20 5"/><circle cx="4" cy="18" r="2" fill="currentColor" stroke="none"/><circle cx="9" cy="11" r="2" fill="currentColor" stroke="none"/><circle cx="14" cy="14" r="2" fill="currentColor" stroke="none"/><circle cx="20" cy="5" r="2" fill="currentColor" stroke="none"/>',
  shock:          '<circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="9.5"/>',
  missile:        '<polygon points="12 3 19 20 12 16 5 20 12 3"/>',
  speed:          '<polyline points="5 6 11 12 5 18"/><polyline points="12 6 18 12 12 18"/>',
  hp:             '<path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z" fill="currentColor" stroke="none"/>',
  regen:          '<circle cx="12" cy="12" r="8.5"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>',
  magnet:         '<path d="M6 6v6a6 6 0 0 0 12 0V6"/><line x1="4" y1="6" x2="8" y2="6"/><line x1="16" y1="6" x2="20" y2="6"/>',
  xp:             '<rect x="5" y="5" width="14" height="14" transform="rotate(45 12 12)"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>',
  armor:          '<polygon points="12 3 20 7 18 16 12 21 6 16 4 7"/>',
  dash:           '<circle cx="15" cy="12" r="5"/><line x1="3" y1="9" x2="8" y2="9"/><line x1="2" y1="12" x2="7" y2="12"/><line x1="3" y1="15" x2="8" y2="15"/>',
  slow:           '<circle cx="12" cy="12" r="8.5"/><polyline points="12 7 12 12 15.5 14"/>',
  vamp:           '<polygon points="12 4 19 13 12 20 5 13"/><circle cx="12" cy="13" r="2" fill="currentColor" stroke="none"/>',
  heavy_cannon:   '<circle cx="10" cy="12" r="6" fill="currentColor" stroke="none"/><line x1="16" y1="9" x2="21" y2="9"/><line x1="16" y1="12" x2="22" y2="12"/><line x1="16" y1="15" x2="21" y2="15"/>',
  glass_core:     '<polygon points="12 3 20 12 12 21 4 12"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/>',
  refract:        '<polyline points="4 6 18 6 6 18 20 18"/><polyline points="16 14 20 18 16 22"/>',
  momentum:       '<line x1="4" y1="18" x2="18" y2="6"/><polyline points="11 6 18 6 18 13"/><circle cx="5" cy="17" r="2" fill="currentColor" stroke="none"/>',
  pinball_master: '<circle cx="7" cy="15" r="3.5"/><circle cx="17" cy="9" r="3.5" fill="currentColor" stroke="none"/><line x1="10" y1="13" x2="14" y2="11" stroke-dasharray="2 2"/>',
  exact_hunter:   '<circle cx="12" cy="12" r="7"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>',
  twin_core:      '<circle cx="8" cy="12" r="4.5"/><circle cx="16" cy="12" r="3" fill="currentColor" stroke="none"/>',
  charge_matrix:  '<rect x="4" y="6" width="6" height="12"/><rect x="14" y="6" width="6" height="12" fill="currentColor" stroke="none"/>',
  singularity_magnet: '<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="10" stroke-dasharray="2 3"/>',
  antimatter_shield: '<polygon points="12 2 21 7 21 17 12 22 3 17 3 7"/><circle cx="12" cy="12" r="4"/>',
};

function skillIcon(id, size) {
  const px = size || 24;
  return '<svg width="' + px + '" height="' + px + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">' +
    (SKILL_SVGS[id] || '<circle cx="12" cy="12" r="6"/>') + '</svg>';
}

/* ══════════════ 技能池（含 Lv.Max 觉醒与双向特殊卡） ══════════════ */
const SKILLS = [
  /* ── 攻击（纵深修炼：6~10 级，中阶质变 + 终极觉醒） ── */
  {
    id: 'dmg', name: '弹芯强化', type: 'attack', maxLv: 10, midLv: 5,
    desc: () => '基础伤害 +1 且全局伤害 ×1.32，副武器与主动技同享指数膨胀。',
    midDesc: '【中阶 · 破甲重弹】弹丸体积 +18%，命中附带 70 击退。',
    capstoneDesc: '【大成 · 重核粉碎】弹丸体积再 +25%、击退 +140，全局伤害额外 ×1.5。',
    apply: (p, lv) => {
      p.stats.dmg += 1;
      p.stats.dmgMul *= 1.32;
      if (lv >= 5) p.stats.midDmg = true;
      if (lv >= 10 && !p.stats.capDmg) {
        p.stats.capDmg = true;
        p.stats.dmgMul *= 1.5;
      }
    },
  },
  {
    id: 'rate', name: '急速发射', type: 'attack', maxLv: 8, midLv: 4,
    desc: () => '射击间隔 -12%，同时缩短电弧链冷却。',
    midDesc: '【中阶 · 连发预热】每 7 次普攻后，第 8 次倾泻双倍弹幕。',
    capstoneDesc: '【大成 · 过热狂潮】每 4 次普攻后第 5 次倾泻双倍弹幕，射速下限解锁至 0.04s。',
    apply: (p, lv) => {
      p.stats.fireInterval *= 0.88;
      if (lv >= 4) p.stats.midRate = true;
      if (lv >= 8) p.stats.capRate = true;
    },
  },
  {
    id: 'multi', name: '多重散射', type: 'attack', maxLv: 5, midLv: 3,
    desc: () => '每次多射出 1 颗弹丸（追踪弹同步 +1），代价：射击间隔 +12%。',
    midDesc: '【中阶 · 收束阵列】散射角收窄 20%。',
    capstoneDesc: '【大成 · 环形收束】散射角再收窄 30%，并在背后追加 1 颗护卫弹。',
    apply: (p, lv) => {
      p.stats.bullets += 1;
      p.stats.fireInterval *= 1.12;
      if (lv >= 3 && !p.stats.midMulti) {
        p.stats.midMulti = true;
        p.stats.spread *= 0.8;
      }
      if (lv >= 5 && !p.stats.capMulti) {
        p.stats.capMulti = true;
        p.stats.spread *= 0.7;
      }
    },
  },
  {
    id: 'pierce', name: '穿透弹芯', type: 'attack', maxLv: 8, midLv: 4,
    desc: () => '弹丸额外穿透 1 个敌人，且全局伤害 ×1.15。',
    midDesc: '【中阶 · 棱镜递增】每穿透 1 个目标，后续伤害递增 +15%。',
    capstoneDesc: '【大成 · 终极贯穿】每穿透 1 个目标，后续伤害与体积递增 +32%。',
    apply: (p, lv) => {
      p.stats.pierce += 1;
      p.stats.dmgMul *= 1.15;
      if (lv >= 4) p.stats.midPierce = true;
      if (lv >= 8) p.stats.capPierce = true;
    },
  },
  {
    id: 'crit', name: '暴击内核', type: 'attack', maxLv: 8, midLv: 4,
    desc: () => '暴击率 +9%、暴击倍率 +0.25，全武器与震波同步享暴击收益。',
    midDesc: '【中阶 · 弱点洞察】暴击倍率额外 +0.40。',
    capstoneDesc: '【大成 · 致命斩杀】暴伤额外 +0.80，暴击直接处决血量 <20% 的非首领敌球。',
    apply: (p, lv) => {
      p.stats.crit += 0.09;
      p.stats.critMult += 0.25;
      if (lv >= 4 && !p.stats.midCrit) {
        p.stats.midCrit = true;
        p.stats.critMult += 0.4;
      }
      if (lv >= 8 && !p.stats.capCrit) {
        p.stats.capCrit = true;
        p.stats.critMult += 0.8;
      }
    },
  },
  {
    id: 'split', name: '分裂弹片', type: 'attack', maxLv: 6, midLv: 3,
    desc: () => '弹丸击杀目标后炸开碎片弹（+1 碎片），且全局伤害 ×1.14。',
    midDesc: '【中阶 · 高能破片】碎片弹伤害继承提升至 75%。',
    capstoneDesc: '【大成 · 连锁裂变】无需击杀，弹丸首次暴击命中也会立刻炸出碎片。',
    apply: (p, lv) => {
      p.stats.split += 1;
      p.stats.dmgMul *= 1.14;
      if (lv >= 3) p.stats.midSplit = true;
      if (lv >= 6) p.stats.capSplit = true;
    },
  },
  {
    id: 'bounce', name: '弹射', type: 'attack', maxLv: 6, midLv: 3,
    desc: () => '弹丸穿透耗尽后弹向另一颗敌球（+1 次），且全局伤害 ×1.16。',
    midDesc: '【中阶 · 势能递增】每次弹射伤害递增 +12%。',
    capstoneDesc: '【大成 · 动能乒乓】每次弹射提速 +22%、增伤 +28%，暴击 60% 概率不耗次数。',
    apply: (p, lv) => {
      p.stats.bounce += 1;
      p.stats.dmgMul *= 1.16;
      if (lv >= 3) p.stats.midBounce = true;
      if (lv >= 6) p.stats.capBounce = true;
    },
  },

  /* ── 副武器（8 级独立主 C 修炼路线） ── */
  {
    id: 'orb', name: '环绕卫星', type: 'sub', maxLv: 8, midLv: 4,
    desc: () => '增加 1 颗环绕卫星（卫星伤 +2），且全局伤害 ×1.10。',
    midDesc: '【中阶 · 高速星环】卫星转速 +25%，球体半径扩大至 11px。',
    capstoneDesc: '【大成 · 双层星轨】额外 +2 卫星，碰撞时将敌球高速甩出触发台球对撞。',
    apply: (p, lv) => {
      p.stats.orbs += 1;
      p.stats.orbDmg += 2;
      p.stats.dmgMul *= 1.10;
      if (lv >= 4) p.stats.midOrb = true;
      if (lv >= 8 && !p.stats.capOrb) {
        p.stats.capOrb = true;
        p.stats.orbs += 2;
      }
    },
  },
  {
    id: 'chain', name: '电弧链', type: 'sub', maxLv: 8, midLv: 4,
    desc: () => '释放连锁闪电（跳跃 +1、电弧伤 +3），且全局伤害 ×1.12。',
    midDesc: '【中阶 · 高压传导】电弧冷却 -20%，索敌范围 +35%。',
    capstoneDesc: '【大成 · 雷暴闭环】电弧再 +3 跳，命中敌球麻痹减速 50% 持续 1.4 秒。',
    apply: (p, lv) => {
      p.stats.chainLv += 1;
      p.stats.chainJumps += 1;
      p.stats.chainDmg += 3;
      p.stats.dmgMul *= 1.12;
      if (lv >= 4) p.stats.midChain = true;
      if (lv >= 8 && !p.stats.capChain) {
        p.stats.capChain = true;
        p.stats.chainJumps += 3;
      }
    },
  },
  {
    id: 'shock', name: '冲击波', type: 'sub', maxLv: 8, midLv: 4,
    desc: () => '震开周身敌球（震波伤 +4、范围 +15），且全局伤害 ×1.12。',
    midDesc: '【中阶 · 震荡余波】冲击波触发间隔 -20%。',
    capstoneDesc: '【大成 · 引力坍缩】先将大范围敌球向中心聚拢撞击，0.3 秒后再剧烈炸开。',
    apply: (p, lv) => {
      p.stats.shockLv += 1;
      p.stats.shockDmg += 4;
      p.stats.shockR += 15;
      p.stats.dmgMul *= 1.12;
      if (lv >= 4) p.stats.midShock = true;
      if (lv >= 8) p.stats.capShock = true;
    },
  },
  {
    id: 'missile', name: '追踪弹', type: 'sub', maxLv: 8, midLv: 4,
    desc: () => '发射自动索敌飞弹（+1 枚、基础伤 +2），且全局伤害 ×1.12。',
    midDesc: '【中阶 · 超导推进】飞弹速度 +30%，可额外穿透 1 个敌人。',
    capstoneDesc: '【大成 · 集束轰炸】追踪弹命中时引爆 65px 范围溅射伤害。',
    apply: (p, lv) => {
      p.stats.missileLv += 1;
      p.stats.missileDmg += 2;
      p.stats.dmgMul *= 1.12;
      if (lv >= 4) p.stats.midMissile = true;
      if (lv >= 8) p.stats.capMissile = true;
    },
  },

  /* ── 属性 ── */
  {
    id: 'speed', name: '轻盈', type: 'stat', maxLv: 6,
    desc: () => '移动速度 +10%。',
    apply: p => { p.stats.speed *= 1.10; },
  },
  {
    id: 'hp', name: '坚韧', type: 'stat', maxLv: 8,
    desc: () => '生命上限提升 26%（+4 固定），并立即回复等额生命。',
    apply: p => {
      const gain = Math.max(6, Math.round(p.maxHp * 0.26 + 4));
      p.maxHp += gain;
      p.hp = Math.min(p.maxHp, p.hp + gain);
    },
  },
  {
    id: 'regen', name: '再生', type: 'stat', maxLv: 6,
    desc: () => '每秒回复 1.5% 最大生命 + 0.4。',
    apply: p => {
      p.stats.regen += 0.4;
      p.stats.regenPct = (p.stats.regenPct || 0) + 0.015;
    },
  },
  {
    id: 'magnet', name: '磁力', type: 'stat', maxLv: 5,
    desc: () => '经验拾取范围 +40%。',
    apply: p => { p.stats.pickup *= 1.40; },
  },
  {
    id: 'xp', name: '悟性', type: 'stat', maxLv: 5,
    desc: () => '经验获取 +20%。',
    apply: p => { p.stats.xpMul += 0.2; },
  },
  {
    id: 'armor', name: '护壳', type: 'stat', maxLv: 4,
    desc: () => '受到伤害 -15%（上限 60%）。',
    apply: p => { p.stats.armor = Math.min(0.6, p.stats.armor + 0.15); },
  },
  {
    id: 'dash', name: '灵巧', type: 'stat', maxLv: 5,
    desc: () => '主动技能（空格）冷却 -14%。',
    capstoneDesc: '【大成 · 残影诱饵】释放空格技能后原地留下 2 秒几何残影，结束时爆炸清场。',
    apply: (p, lv) => {
      p.stats.dashCd *= 0.86;
      if (lv >= 5) p.stats.capDash = true;
    },
  },

  /* ── 特殊与双向抉择卡 ── */
  {
    id: 'slow', name: '时间压制', type: 'special', maxLv: 5,
    desc: () => '所有敌人移速 -7%。',
    apply: p => { p.stats.slow = Math.min(0.45, p.stats.slow + 0.07); },
  },
  {
    id: 'vamp', name: '汲取', type: 'special', maxLv: 5,
    desc: () => '每次击杀回复 1.2% 最大生命 + 0.5。',
    apply: p => {
      p.stats.vamp += 0.5;
      p.stats.vampPct = (p.stats.vampPct || 0) + 0.012;
    },
  },
  {
    id: 'heavy_cannon', name: '巨炮协议', type: 'special', maxLv: 1, dual: true,
    desc: () => '弹丸伤害 ×2.2、半径 +6、穿透 +2；代价：射击间隔 +45%。',
    apply: p => {
      p.stats.dmgMul *= 2.2;
      p.stats.bulletR += 6;
      p.stats.pierce += 2;
      p.stats.fireInterval *= 1.45;
    },
  },
  {
    id: 'glass_core', name: '玻璃核心', type: 'special', maxLv: 1, dual: true,
    desc: () => '全局伤害 ×1.55、暴击率 +20%；代价：生命上限 -35%。',
    apply: p => {
      p.stats.dmgMul *= 1.55;
      p.stats.crit += 0.20;
      p.maxHp = Math.max(8, Math.round(p.maxHp * 0.65));
      p.hp = Math.min(p.hp, p.maxHp);
    },
  },
  {
    id: 'refract', name: '几何折射', type: 'special', maxLv: 4,
    desc: () => '子弹飞出屏幕或耗尽射程时自动向回折返（保留 70% 伤害）。',
    apply: p => { p.stats.refract += 1; },
  },
  {
    id: 'momentum', name: '动量转换', type: 'special', maxLv: 4,
    desc: () => '高于基础移速的部分，每 +10% 移速额外提供 +12% 全局伤害。',
    apply: p => { p.stats.momentum += 1; },
  },
  {
    id: 'pinball_master', name: '台球宗师', type: 'special', maxLv: 5,
    desc: () => '击退力度 +45%，敌球【球体对撞】伤害翻倍且击杀必爆双倍经验。',
    apply: p => { p.stats.pinball += 1; },
  },
  {
    id: 'exact_hunter', name: '数字强迫症', type: 'special', maxLv: 5,
    desc: () => '敌球剩余血量低于单发伤害 1.25× 时，自动补足伤害触发【精准归零】。',
    apply: p => { p.stats.exactHunter += 1; },
  },
];

const SKILL_MAP = {};
for (const s of SKILLS) SKILL_MAP[s.id] = s;

/* ══════════════ Boss 核心遗物 ══════════════ */
const RELICS = [
  {
    id: 'twin_core',
    name: '双子核心',
    tag: 'RELIC · 核心遗物',
    color: '#D97706',
    desc: '生成一颗继承 50% 属性的镜像副球，同步环绕并自动射击。',
    apply: p => { p.relics.twinCore = true; },
  },
  {
    id: 'charge_matrix',
    name: '充能矩阵',
    tag: 'RELIC · 核心遗物',
    color: '#0055FF',
    desc: '空格主动技能最大充能次数 +1（可连续释放两次）。',
    apply: p => {
      p.maxCharges += 1;
      p.charges = Math.min(p.maxCharges, p.charges + 1);
    },
  },
  {
    id: 'singularity_magnet',
    name: '奇点磁极',
    tag: 'RELIC · 核心遗物',
    color: '#00A86B',
    desc: '经验拾取范围扩展至全屏，且每拾取 15 颗经验球自动释放一次电弧链。',
    apply: p => {
      p.relics.singularityMagnet = true;
      p.stats.pickup = Math.max(p.stats.pickup, 4000);
    },
  },
  {
    id: 'antimatter_shield',
    name: '反物质护盾',
    tag: 'RELIC · 核心遗物',
    color: '#E63312',
    desc: '每 12 秒生成一层抵挡 1 次伤害的外环护盾；破碎时触发 260px 高伤震爆。',
    apply: p => {
      p.relics.antimatterShield = true;
      p.shieldActive = true;
      p.shieldCd = 0;
    },
  },
];

const RELIC_MAP = {};
for (const r of RELICS) RELIC_MAP[r.id] = r;

/* ══════════════ 可选球体（不同颜色、专属普攻、被动与主动技） ══════════════ */
const ORBS = {
  cobalt: {
    id: 'cobalt',
    code: 'ORB-A',
    name: '疾影球',
    skillName: '相位冲刺',
    skillKeyLabel: '冲刺',
    summary: '穿刺单针 · 冲刺超频连射',
    desc: '高速穿刺单针（穿透+1）；冲刺切割路径敌球并进入 2 秒超频双针连射',
    color: '#0055FF',
    stroke: '#111315',
    ringColor: '#0055FF',
    cd: 2.4,
    maxHp: 30,
    speedMul: 1.10,
    fireMul: 0.90,
    dmgBonus: 0,
    critBonus: 0,
    spreadOverride: null,
    extraBullets: 0,
    bulletLifeMul: 1.0,
    kbMul: 1.0,
    billiardMul: 1.0,
  },
  crimson: {
    id: 'crimson',
    code: 'ORB-B',
    name: '震荡球',
    skillName: '脉冲震爆',
    skillKeyLabel: '震爆',
    summary: '重型击退 · 台球对撞大师',
    desc: '重型母球弹强力击退触发对撞；震爆随攻击指数成长（8+3.0×伤）',
    color: '#E63312',
    stroke: '#111315',
    ringColor: '#E63312',
    cd: 3.4,
    maxHp: 38,
    speedMul: 0.96,
    fireMul: 1.12,
    dmgBonus: 1,
    critBonus: 0,
    spreadOverride: null,
    extraBullets: 0,
    bulletLifeMul: 1.0,
    kbMul: 1.35,
    billiardMul: 1.5,
    pulseR: 165,
    pulseDmg: 8,
  },
  amber: {
    id: 'amber',
    code: 'ORB-C',
    name: '齐射球',
    skillName: '环向齐射',
    skillKeyLabel: '齐射',
    summary: '暴击追猎 · 空格环向齐射',
    desc: '高暴击单发精准弹（暴击45%追加追踪弹）；空格环向齐射随散射扩容',
    color: '#FFB800',
    stroke: '#111315',
    ringColor: '#D97706',
    cd: 3.2,
    maxHp: 30,
    speedMul: 1.0,
    fireMul: 1.00,
    dmgBonus: 0,
    critBonus: 0.14,
    spreadOverride: 0.11,
    extraBullets: 0,
    bulletLifeMul: 0.85,
    kbMul: 1.0,
    billiardMul: 1.0,
    burstCount: 8,
  },
};

const ORB_ORDER = ['cobalt', 'crimson', 'amber'];

function getOrb(orbId) {
  const id = orbId || (typeof Game !== 'undefined' && Game.orb ? Game.orb : 'cobalt');
  return ORBS[id] || ORBS.cobalt;
}

/* ══════════════ 难度档位 ══════════════ */
const DIFFICULTIES = {
  easy: {
    id: 'easy',
    code: '01',
    name: '舒缓',
    en: 'RELAXED',
    summary: '轻度压力 · 快速构筑成型',
    desc: '敌血 ×0.78 · 刷怪 ×0.78 · 升级更快',
    color: '#00A86B',
    hpMul: 0.78,
    spawnMul: 0.78,
    dmgMul: 0.75,
    speedMul: 0.90,
    xpNeedMul: 0.78,
    healBonus: 0.006,
  },
  normal: {
    id: 'normal',
    code: '02',
    name: '标准',
    en: 'STANDARD',
    summary: '平衡节奏 · 推荐基准挑战',
    desc: '敌血 ×1.00 · 刷怪 ×1.00 · 标准数值',
    color: '#0055FF',
    hpMul: 1.0,
    spawnMul: 1.0,
    dmgMul: 1.0,
    speedMul: 1.0,
    xpNeedMul: 1.0,
    healBonus: 0,
  },
  hard: {
    id: 'hard',
    code: '03',
    name: '高压',
    en: 'EXTREME',
    summary: '密集围堵 · 高速硬核生存',
    desc: '敌血 ×1.35 · 刷怪 ×1.30 · 敌速更快',
    color: '#E63312',
    hpMul: 1.35,
    spawnMul: 1.30,
    dmgMul: 1.30,
    speedMul: 1.12,
    xpNeedMul: 1.18,
    healBonus: 0,
  },
};

const DIFF_ORDER = ['easy', 'normal', 'hard'];

function getDifficulty(diffId) {
  const id = diffId || (typeof Game !== 'undefined' && Game.difficulty ? Game.difficulty : 'normal');
  return DIFFICULTIES[id] || DIFFICULTIES.normal;
}

/* ══════════════ 成长曲线（6 分钟平滑递进膨胀曲线） ══════════════ */
function xpNeedFor(level, diffId) {
  const d = getDifficulty(diffId);
  return Math.max(4, Math.round((4 + level * 5 + level * level * 0.95) * d.xpNeedMul));
}

/** 敌人血量倍率 —— 递进式指数膨胀：前期留出喘息与升级空间，中后期跨入十万/百万级 */
function hpScaleAt(t, diffId) {
  const d = getDifficulty(diffId);
  return (1 + (t / 55) * (1 + t / 75)) * Math.pow(1.0135, t) * d.hpMul;
}

/** 敌人攻击力倍率 —— 与玩家血量核心跃迁同步平滑膨胀 */
function dmgScaleAt(t, diffId) {
  const d = getDifficulty(diffId);
  return (1 + (t / 120) * (1 + t / 180)) * Math.pow(1.0055, t) * d.dmgMul;
}

/** 每秒刷怪数 —— 从 1.35/s 起步，6 分钟内最高攀升至 10.0/s（随难度倍率缩放） */
function spawnRateAt(t, diffId) {
  const d = getDifficulty(diffId);
  return Math.min(10.0 * d.spawnMul, (1.35 + t / 36) * d.spawnMul);
}

/** 当前威胁等级（仅展示） */
function threatAt(t) {
  return 1 + Math.floor(t / 30);
}

/** 按时间挑选敌人种类 —— 6 分钟内逐步引入冲锋球与棱镜球 */
function pickEnemyType(t) {
  const walkerW   = Math.max(18, 100 - (t > 80 ? (t - 80) * 0.35 : 0));
  const sprinterW = t > 20  ? Math.min(50, 22 + (t - 20) * 0.40) : 0;
  const splitterW = t > 50  ? Math.min(45, 18 + (t - 50) * 0.30) : 0;
  const chargerW  = t > 75  ? Math.min(34, 12 + (t - 75) * 0.22) : 0;
  const tankW     = t > 105 ? Math.min(36, 12 + (t - 105) * 0.20) : 0;
  const shooterW  = t > 135 ? Math.min(34, 12 + (t - 135) * 0.20) : 0;
  const shielderW = t > 165 ? Math.min(28, 10 + (t - 165) * 0.18) : 0;

  const pool = [
    { key: 'walker',   w: walkerW },
    { key: 'sprinter', w: sprinterW },
    { key: 'splitter', w: splitterW },
    { key: 'charger',  w: chargerW },
    { key: 'tank',     w: tankW },
    { key: 'shooter',  w: shooterW },
    { key: 'shielder', w: shielderW },
  ];
  return weightedPick(pool, o => o.w).key;
}
