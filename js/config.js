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
    iframe: 0.55,
  },

  /* 敌人基础值 —— 具备压迫感的几何敌潮，随时间指数膨胀 */
  enemies: {
    walker:   { label: '游荡球',     r: 16, speed: 118, hp: 3,   dmg: 4, xp: 2,  color: '#E63312', weight: 1 },
    sprinter: { label: '疾行球',     r: 12, speed: 146, hp: 3,   dmg: 4, xp: 2,  color: '#F26419', weight: 1 },
    splitter: { label: '裂变球',     r: 20, speed: 105, hp: 10,  dmg: 5, xp: 3,  color: '#D92662', weight: 1 },
    charger:  { label: '矢量冲锋球', r: 17, speed: 120, hp: 18,  dmg: 7, xp: 5,  color: '#EA580C', weight: 1 },
    tank:     { label: '重甲球',     r: 27, speed: 74,  hp: 32,  dmg: 9, xp: 5,  color: '#4F3CC9', weight: 1 },
    shooter:  { label: '炮击球',     r: 18, speed: 88,  hp: 15,  dmg: 6, xp: 4,  color: '#6D28D9', weight: 1 },
    shielder: { label: '相位棱镜球', r: 19, speed: 86,  hp: 24,  dmg: 5, xp: 6,  color: '#0284C7', weight: 1 },
    boss:     { label: '秩序核心',   r: 54, speed: 68,  hp: 360, dmg: 9, xp: 45, color: '#111315', weight: 0 },
  },
};

/* 三阶段首领预设 */
const BOSS_CONFIGS = [
  { tier: 1, time: 110, label: '秩序核心 · 壹型',   r: 52, hpMul: 2.40, speed: 68, dmg: 9 },
  { tier: 2, time: 220, label: '矩阵切割者 · 贰型', r: 56, hpMul: 4.50, speed: 74, dmg: 12 },
  { tier: 3, time: 330, label: '奇点主宰 · 终型',   r: 62, hpMul: 6.80, speed: 80, dmg: 15 },
];

/* ══════════════ 技能类型 ══════════════ */
const SKILL_TYPES = {
  attack:  { label: '攻击',   code: 'ATK', color: '#E63312' },
  sub:     { label: '副武器', code: 'SUB', color: '#4F3CC9' },
  stat:    { label: '属性',   code: 'SYS', color: '#0055FF' },
  special: { label: '特殊',   code: 'SPC', color: '#D97706' },
};

/* ══════════════ 四阶进化流派与双极叠加态 ══════════════ */
const MAX_ULTIMATES = 2;
const ARCH_THRESHOLDS = { stage1: 1, stage2: 10, stage3: 20, capLocked: 19 };

const ARCHETYPES = {
  xianxia: {
    id: 'xianxia',
    code: 'XIAN',
    short: '仙侠',
    label: '国风仙侠',
    coreName: '太虚剑丸',
    color: '#00A86B',
    stages: [
      { stage: 1, roman: 'Ⅰ', name: '青冥剑胚', desc: '单发青冥飞剑，基础穿透 1。' },
      { stage: 2, roman: 'Ⅱ', name: '两仪剑胎', desc: '解锁 1 颗护体金丹；飞剑首次命中自动分裂出 2 道微型子剑气。' },
      { stage: 3, roman: 'Ⅲ', name: '太虚万剑道果', desc: '双金丹八卦罗盘 + 齐射 3 柄追踪飞剑，周期性绽放八瓣几何青莲剑阵。' },
    ],
  },
  norse: {
    id: 'norse',
    code: 'NORSE',
    short: '北欧',
    label: '北欧神话',
    coreName: '雷神炉心',
    color: '#4F3CC9',
    stages: [
      { stage: 1, roman: 'Ⅰ', name: '卢恩雷石', desc: '发射小型雷球，命中触发短距电弧。' },
      { stage: 2, roman: 'Ⅱ', name: '锻铁雷锤核', desc: '普攻蜕变为旋转几何战锤，飞行途中向两侧持续放电并烙印四角雷印。' },
      { stage: 3, roman: 'Ⅲ', name: '诸神黄昏炉心', desc: '战锤命中或主动技召唤黑蓝双层天降雷柱并展开八角卢恩法阵。' },
    ],
  },
  xuanhuan: {
    id: 'xuanhuan',
    code: 'XUAN',
    short: '玄幻',
    label: '东方玄幻',
    coreName: '焚天帝丹',
    color: '#E63312',
    stages: [
      { stage: 1, roman: 'Ⅰ', name: '赤炎丹胚', desc: '发射赤火弹，命中产生单层圆形火环。' },
      { stage: 2, roman: 'Ⅱ', name: '子母双色灵丹', desc: '火弹外嵌旋转方框，命中展开双层十字旋转火框并留下 1.5s 灼烧印记。' },
      { stage: 3, roman: 'Ⅲ', name: '佛怒火莲圣体', desc: '命中绽放红金黑三层旋转火莲，周期性召唤鲲鹏吞天黑洞聚怪内爆。' },
    ],
  },
  arcane: {
    id: 'arcane',
    code: 'ARCANE',
    short: '奥术',
    label: '英式奥术',
    coreName: '阿瓦隆星盘',
    color: '#D97706',
    stages: [
      { stage: 1, roman: 'Ⅰ', name: '学徒星徽', desc: '发射金色奥术弹，在最近敌人之间弹射。' },
      { stage: 2, roman: 'Ⅱ', name: '所罗门六芒核', desc: '首次命中原地生成持续 2s 的临时三角折射镜自动发射细激光。' },
      { stage: 3, roman: 'Ⅲ', name: '大魔导天球仪', desc: '环绕黄金星象仪，常驻 4 座六芒星棱镜发射黑金贯穿折射激光。' },
    ],
  },
  billiard: {
    id: 'billiard',
    code: 'PHYS',
    short: '台球',
    label: '台球物理',
    coreName: '大师母球',
    color: '#111315',
    stages: [
      { stage: 1, roman: 'Ⅰ', name: '纯白母球', desc: '发射带基础击退的重弹，触发基础球体对撞。' },
      { stage: 2, roman: 'Ⅱ', name: '黑八配重核', desc: '解锁台球瞄准延长虚线与撞击预测白圈，碰撞冷却降至 0.14s 并开启连撞计数。' },
      { stage: 3, roman: 'Ⅲ', name: '黄金陀螺撞针', desc: '击飞敌球获得屏幕四壁全弹性反弹，打出金色连撞崩撞。' },
    ],
  },
  exact_zero: {
    id: 'exact_zero',
    code: 'MATH',
    short: '归零',
    label: '数字法则',
    coreName: '天机归零',
    color: '#0055FF',
    stages: [
      { stage: 1, roman: 'Ⅰ', name: '算筹原核', desc: '分毫不差归零时触发基础归零震波与 2× 经验。' },
      { stage: 2, roman: 'Ⅱ', name: '游标卡尺核', desc: '精准归零容差放宽至 ≥1.35× 单发伤害，过载电弧伤害升至 80%。' },
      { stage: 3, roman: 'Ⅲ', name: '天道归零罗盘', desc: '精准归零爆发大范围金色十字解构阵，溢出伤害触发 3 跳高压电弧链。' },
    ],
  },
};

const ARCHETYPE_ORDER = ['xianxia', 'norse', 'xuanhuan', 'arcane', 'billiard', 'exact_zero'];

function sortPair(a, b) {
  return a < b ? (a + '+' + b) : (b + '+' + a);
}

const COMBOS = [
  {
    id: 'xian_xuan',
    code: 'XIAN × XUAN',
    name: '红莲业火剑仙',
    sub: '飞剑刺入敌球引爆三层火莲，双丹蜕为旋转火莲金丹',
    a: { name: '太虚万剑', col: '#00A86B', type: 'xianxia' },
    b: { name: '佛怒火莲', col: '#E63312', type: 'xuanhuan' },
  },
  {
    id: 'xian_norse',
    code: 'XIAN × NORSE',
    name: '九霄雷罚剑域',
    sub: '飞剑化作引雷剑桩钉入敌球，自动拉起卢恩电网与天降雷柱',
    a: { name: '太虚万剑', col: '#00A86B', type: 'xianxia' },
    b: { name: '雷神炉心', col: '#4F3CC9', type: 'norse' },
  },
  {
    id: 'norse_phys',
    code: 'NORSE × PHYS',
    name: '诸神雷霆保龄',
    sub: '被撞飞的敌球化为充能雷球，每次台球对撞劈下天降雷柱',
    a: { name: '雷神炉心', col: '#4F3CC9', type: 'norse' },
    b: { name: '黄金撞针', col: '#111315', type: 'billiard' },
  },
  {
    id: 'xuan_phys',
    code: 'XUAN × PHYS',
    name: '奇点坍缩开球',
    sub: '鲲鹏黑洞强行聚怪成球堆，发射重型火莲母球一杆轰入连环爆破',
    a: { name: '佛怒火莲', col: '#E63312', type: 'xuanhuan' },
    b: { name: '黄金撞针', col: '#111315', type: 'billiard' },
  },
  {
    id: 'arcane_xian',
    code: 'ARCANE × XIAN',
    name: '所罗门分光剑阵',
    sub: '飞剑穿过六芒星棱镜，1 剑光谱折射分裂为 3 柄黄金激光剑',
    a: { name: '魔导天球', col: '#D97706', type: 'arcane' },
    b: { name: '太虚万剑', col: '#00A86B', type: 'xianxia' },
  },
  {
    id: 'arcane_zero',
    code: 'ARCANE × MATH',
    name: '宿命同调矩阵',
    sub: '激光网连接敌球共享宿命同调，1 球精准归零则整张网同时归零殉爆',
    a: { name: '魔导天球', col: '#D97706', type: 'arcane' },
    b: { name: '天道归零', col: '#0055FF', type: 'exact_zero' },
  },
];

const COMBO_MAP = {};
const COMBO_PARTNERS = {
  xianxia: [],
  norse: [],
  xuanhuan: [],
  arcane: [],
  billiard: [],
  exact_zero: [],
};
for (const c of COMBOS) {
  COMBO_MAP[sortPair(c.a.type, c.b.type)] = c;
  COMBO_PARTNERS[c.a.type].push(c.b.type);
  COMBO_PARTNERS[c.b.type].push(c.a.type);
}

function getCombo(a, b) {
  return COMBO_MAP[sortPair(a, b)] || null;
}

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

/* ══════════════ 技能池（26 技能归属六大流派 · 保留原 ID） ══════════════ */
const SKILLS = [
  /* ── 攻击（core: +2 流派点数 / aux: +1 流派点数） ── */
  {
    id: 'dmg', name: '焚天帝丹 · 赤炎重炮', type: 'attack', archetype: 'xuanhuan', archPts: 2, maxLv: 8, midLv: 4,
    desc: lv => ((lv || 0) >= 3 ? '基础伤害 +2 且全局伤害 ×1.38，副武器与主动技同享指数膨胀。' : '基础伤害 +1（Lv.4 起 +2）且全局伤害 ×1.38，副武器与主动技同享指数膨胀。'),
    midDesc: '【中阶 · 子母双色灵丹】弹丸体积 +18%，命中附带 70 击退与火环冲击。',
    capstoneDesc: '【大成 · 佛怒火莲圣体】伤害额外 ×1.60；主弹丸命中首个目标引爆 95px 引力坍缩火莲（60% 范围伤）。',
    apply: (p, lv) => {
      const curLv = lv || 1;
      p.stats.dmg += (curLv >= 4 ? 2 : 1);
      p.stats.dmgMul *= 1.38;
      if (curLv >= 4) p.stats.midDmg = true;
      if (curLv >= 8 && !p.stats.capDmg) {
        p.stats.capDmg = true;
        p.stats.dmgMul *= 1.6;
      }
    },
  },
  {
    id: 'rate', name: '奥术过载咏唱', type: 'attack', archetype: 'arcane', archPts: 1, maxLv: 8, midLv: 4,
    desc: () => '射击间隔 -12%，同时缩短电弧链冷却。',
    midDesc: '【中阶 · 连发预热】每 7 次普攻后，第 8 次倾泻双倍弹幕。',
    capstoneDesc: '【大成 · 贯穿星辉射线】第 3 次普攻起追加瞬间贯穿屏幕的几何射线，扫射命中沿途所有敌球（85% 伤）。',
    apply: (p, lv) => {
      p.stats.fireInterval *= 0.88;
      if (lv >= 4) p.stats.midRate = true;
      if (lv >= 8) p.stats.capRate = true;
    },
  },
  {
    id: 'multi', name: '星象仪多重齐射', type: 'attack', archetype: 'arcane', archPts: 1, maxLv: 5, midLv: 3,
    desc: () => '每次多射出 1 颗弹丸（追踪弹同步 +1），代价：射击间隔 +12%。',
    midDesc: '【中阶 · 收束阵列】散射角收窄 20%。',
    capstoneDesc: '【大成 · 天球螺旋矩阵】每次射击额外释放 4 枚旋转交叉弧线弹幕，形成 360° 弹幕网。',
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
    id: 'pierce', name: '青冥剑胚 · 剑气贯虹', type: 'attack', archetype: 'xianxia', archPts: 2, maxLv: 8, midLv: 4,
    desc: () => '飞剑额外穿透 1 个敌人，且全局伤害 ×1.15。',
    midDesc: '【中阶 · 两仪剑胎】每穿透 1 个目标，后续伤害递增 +15%。',
    capstoneDesc: '【大成 · 太虚万剑道果】飞剑击穿后折跃追踪下一敌球并递增 +32% 伤害。',
    apply: (p, lv) => {
      p.stats.pierce += 1;
      p.stats.dmgMul *= 1.15;
      if (lv >= 4) p.stats.midPierce = true;
      if (lv >= 8) p.stats.capPierce = true;
    },
  },
  {
    id: 'crit', name: '奥丁之矛 · 必杀神印', type: 'attack', archetype: 'norse', archPts: 2, maxLv: 8, midLv: 4,
    desc: () => '暴击率 +9%、暴击倍率 +0.25，全武器与震波同步享暴击收益。',
    midDesc: '【中阶 · 卢恩死印】暴击倍率额外 +0.40。',
    capstoneDesc: '【大成 · 冈格尼尔贯杀】暴击倍率再 +0.80；暴击处决 <20% 血非首领敌球并引爆 85px 十字斩波。',
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
    id: 'split', name: '子母火莲裂变', type: 'attack', archetype: 'xuanhuan', archPts: 2, maxLv: 8, midLv: 4,
    desc: () => '击杀炸开碎片弹（+1 碎片），且全局伤害 ×1.15。',
    midDesc: '【中阶 · 高能破片】碎片弹伤害继承提升至 75%。',
    capstoneDesc: '【大成 · 递归母子火莲】每次命中直接炸出碎片弹，碎片击杀再裂变追踪微弹。',
    apply: (p, lv) => {
      p.stats.split += 1;
      p.stats.dmgMul *= 1.15;
      if (lv >= 4) p.stats.midSplit = true;
      if (lv >= 8) p.stats.capSplit = true;
    },
  },
  {
    id: 'bounce', name: '阿瓦隆星徽 · 折光弹射', type: 'attack', archetype: 'arcane', archPts: 2, maxLv: 8, midLv: 4,
    desc: () => '弹丸穿透耗尽后弹向另一敌球（+1 次），且全局伤害 ×1.16。',
    midDesc: '【中阶 · 所罗门六芒核】每次弹射伤害递增 +12%。',
    capstoneDesc: '【大成 · 大魔导回旋刃】弹射耗尽化为环绕切割 1.2s 的旋转飞刃（暴击 60% 不耗次数）。',
    apply: (p, lv) => {
      p.stats.bounce += 1;
      p.stats.dmgMul *= 1.16;
      if (lv >= 4) p.stats.midBounce = true;
      if (lv >= 8) p.stats.capBounce = true;
    },
  },

  /* ── 副武器（8 级主修核心修炼路线） ── */
  {
    id: 'orb', name: '太虚护体金丹', type: 'sub', archetype: 'xianxia', archPts: 2, maxLv: 8, midLv: 4,
    desc: () => '增加 1 颗护体金丹（金丹伤 +2），且全局伤害 ×1.14。',
    midDesc: '【中阶 · 两仪星环】金丹转速 +25%，球体半径扩大至 11px。',
    capstoneDesc: '【大成 · 太虚八卦剑阵】额外 +2 金丹且内外环连成持续电离激光束，高速甩出敌球。',
    apply: (p, lv) => {
      p.stats.orbs += 1;
      p.stats.orbDmg += 2;
      p.stats.dmgMul *= 1.14;
      if (lv >= 4) p.stats.midOrb = true;
      if (lv >= 8 && !p.stats.capOrb) {
        p.stats.capOrb = true;
        p.stats.orbs += 2;
      }
    },
  },
  {
    id: 'chain', name: '卢恩雷石 · 妙尔尼尔电弧', type: 'sub', archetype: 'norse', archPts: 2, maxLv: 8, midLv: 4,
    desc: () => '释放连锁闪电（跳跃 +1、电弧伤 +3），且全局伤害 ×1.15。',
    midDesc: '【中阶 · 锻铁雷锤核】电弧冷却 -20%，索敌范围 +35%。',
    capstoneDesc: '【大成 · 诸神黄昏雷网】跳跃 +3，命中节点建立 1.8s 闭合卢恩电网持续电击并麻痹减速 50%。',
    apply: (p, lv) => {
      p.stats.chainLv += 1;
      p.stats.chainJumps += 1;
      p.stats.chainDmg += 3;
      p.stats.dmgMul *= 1.15;
      if (lv >= 4) p.stats.midChain = true;
      if (lv >= 8 && !p.stats.capChain) {
        p.stats.capChain = true;
        p.stats.chainJumps += 3;
      }
    },
  },
  {
    id: 'shock', name: '黑八配重 · 脉冲震爆', type: 'sub', archetype: 'billiard', archPts: 2, maxLv: 8, midLv: 4,
    desc: () => '震开周身敌球引爆台球连撞（震波伤 +4、范围 +15），全局伤害 ×1.15。',
    midDesc: '【中阶 · 震荡余波】冲击波触发间隔 -20%。',
    capstoneDesc: '【大成 · 引力奇点开球】聚拢敌球引爆高频台球群撞，炸开后留下 2 秒强力减速引力残场。',
    apply: (p, lv) => {
      p.stats.shockLv += 1;
      p.stats.shockDmg += 4;
      p.stats.shockR += 15;
      p.stats.dmgMul *= 1.15;
      if (lv >= 4) p.stats.midShock = true;
      if (lv >= 8) p.stats.capShock = true;
    },
  },
  {
    id: 'missile', name: '奥术飞弹阵', type: 'sub', archetype: 'arcane', archPts: 2, maxLv: 8, midLv: 4,
    desc: () => '发射自动索敌飞弹（+1 枚、基础伤 +2），且全局伤害 ×1.15。',
    midDesc: '【中阶 · 超导推进】飞弹速度 +30%，可额外穿透 1 个敌人。',
    capstoneDesc: '【大成 · 子母集束蜂群】飞弹命中引爆 65px 溅射后，分裂 2 枚二段蜂群飞弹追击敌球。',
    apply: (p, lv) => {
      p.stats.missileLv += 1;
      p.stats.missileDmg += 2;
      p.stats.dmgMul *= 1.15;
      if (lv >= 4) p.stats.midMissile = true;
      if (lv >= 8) p.stats.capMissile = true;
    },
  },

  /* ── 属性（辅助组件：+1 流派点数） ── */
  {
    id: 'speed', name: '御风剑诀', type: 'stat', archetype: 'xianxia', archPts: 1, maxLv: 5,
    desc: () => '移动速度 +12%。',
    apply: p => { p.stats.speed *= 1.12; },
  },
  {
    id: 'hp', name: '黑八钢骨配重壳', type: 'stat', archetype: 'billiard', archPts: 1, maxLv: 6,
    desc: () => '生命上限提升 26%（+4 固定），并立即回复等额生命。',
    apply: p => {
      const gain = Math.max(6, Math.round(p.maxHp * 0.26 + 4));
      p.maxHp += gain;
      p.hp = Math.min(p.maxHp, p.hp + gain);
    },
  },
  {
    id: 'regen', name: '九转还魂丹', type: 'stat', archetype: 'xuanhuan', archPts: 1, maxLv: 5,
    desc: () => '每秒回复 1.8% 最大生命 + 0.5。',
    apply: p => {
      p.stats.regen += 0.5;
      p.stats.regenPct = (p.stats.regenPct || 0) + 0.018;
    },
  },
  {
    id: 'magnet', name: '奇点坐标吸附', type: 'stat', archetype: 'exact_zero', archPts: 1, maxLv: 4,
    desc: () => '经验拾取范围 +50%。',
    apply: p => { p.stats.pickup *= 1.50; },
  },
  {
    id: 'xp', name: '算筹演算 · 经验倍增', type: 'stat', archetype: 'exact_zero', archPts: 1, maxLv: 4,
    desc: () => '经验获取 +25%。',
    apply: p => { p.stats.xpMul += 0.25; },
  },
  {
    id: 'armor', name: '曜石重甲配重壳', type: 'stat', archetype: 'billiard', archPts: 1, maxLv: 4,
    desc: () => '受到伤害 -15%（上限 60%）。',
    apply: p => { p.stats.armor = Math.min(0.6, p.stats.armor + 0.15); },
  },
  {
    id: 'dash', name: '太虚缩地术', type: 'stat', archetype: 'xianxia', archPts: 1, maxLv: 5,
    desc: () => '主动技能（空格）冷却 -14%。',
    capstoneDesc: '【大成 · 引力剑影分身】释放空格技能原地留下持续嘲讽聚怪的 2 秒几何残影，结束时剧烈爆炸。',
    apply: (p, lv) => {
      p.stats.dashCd *= 0.86;
      if (lv >= 5) p.stats.capDash = true;
    },
  },

  /* ── 特殊与双向抉择卡 ── */
  {
    id: 'slow', name: '帧率冻结 · 时间压制', type: 'special', archetype: 'exact_zero', archPts: 1, maxLv: 4,
    desc: () => '所有敌人移速 -9%。',
    apply: p => { p.stats.slow = Math.min(0.45, p.stats.slow + 0.09); },
  },
  {
    id: 'vamp', name: '英灵殿血祭', type: 'special', archetype: 'norse', archPts: 1, maxLv: 5,
    desc: () => '每次击杀回复 1.2% 最大生命 + 0.5。',
    apply: p => {
      p.stats.vamp += 0.5;
      p.stats.vampPct = (p.stats.vampPct || 0) + 0.012;
    },
  },
  {
    id: 'heavy_cannon', name: '盘古开天重锤', type: 'special', archetype: 'xuanhuan', archPts: 1, maxLv: 1, dual: true,
    desc: () => '弹丸伤害 ×2.2、半径 +6、穿透 +2；代价：射击间隔 +45%。',
    apply: p => {
      p.stats.dmgMul *= 2.2;
      p.stats.bulletR += 6;
      p.stats.pierce += 2;
      p.stats.fireInterval *= 1.45;
    },
  },
  {
    id: 'glass_core', name: '狂战士的血誓', type: 'special', archetype: 'norse', archPts: 1, maxLv: 1, dual: true,
    desc: () => '全局伤害 ×1.55、暴击率 +20%；代价：生命上限 -35%。',
    apply: p => {
      p.stats.dmgMul *= 1.55;
      p.stats.crit += 0.20;
      p.maxHp = Math.max(8, Math.round(p.maxHp * 0.65));
      p.hp = Math.min(p.hp, p.maxHp);
    },
  },
  {
    id: 'refract', name: '霍格沃茨回旋咒', type: 'special', archetype: 'arcane', archPts: 1, maxLv: 4,
    desc: () => '子弹飞出屏幕或耗尽射程时自动向回折返（保留 70% 伤害）。',
    apply: p => { p.stats.refract += 1; },
  },
  {
    id: 'momentum', name: '凌波微步 · 化劲', type: 'special', archetype: 'xianxia', archPts: 1, maxLv: 4,
    desc: () => '高于基础移速的部分，每 +10% 移速额外提供 +12% 全局伤害。',
    apply: p => { p.stats.momentum += 1; },
  },
  {
    id: 'pinball_master', name: '巨灵神之掌 · 崩撞', type: 'special', archetype: 'billiard', archPts: 2, maxLv: 8, midLv: 4,
    desc: () => '击退力度 +45%，敌球【球体对撞】伤害翻倍且击杀必爆双倍经验，全局伤害 ×1.14。',
    midDesc: '【中阶 · 黑八配重核】解锁台球瞄准虚线与撞击预测白圈，碰撞冷却缩短并激活连撞计数。',
    capstoneDesc: '【大成 · 黄金陀螺撞针】被击飞敌球获四壁全弹性反弹，触发连撞递进金色崩撞。',
    apply: (p, lv) => {
      p.stats.pinball += 1;
      p.stats.dmgMul *= 1.14;
      if (lv >= 4) p.stats.midPinball = true;
      if (lv >= 8) p.stats.capPinball = true;
    },
  },
  {
    id: 'exact_hunter', name: '天机算尽 · 归零劫', type: 'special', archetype: 'exact_zero', archPts: 2, maxLv: 8, midLv: 4,
    desc: () => '敌球剩余血量低于单发伤害 1.25× 时自动补足触发【精准归零】，全局伤害 ×1.14。',
    midDesc: '【中阶 · 游标卡尺核】精准归零容差提升至 ≥1.35× 单发伤，溢出伤害传导 80% 过载电弧。',
    capstoneDesc: '【大成 · 天道归零罗盘】精准归零引爆大范围十字解构阵，溢出伤害连锁 3 跳高压电弧。',
    apply: (p, lv) => {
      p.stats.exactHunter += 1;
      p.stats.dmgMul *= 1.14;
      if (lv >= 4) p.stats.midExact = true;
      if (lv >= 8) p.stats.capExact = true;
    },
  },
];

const SKILL_MAP = {};
for (const s of SKILLS) SKILL_MAP[s.id] = s;

/* ══════════════ Boss 核心遗物（含 +3 流派共鸣触媒） ══════════════ */
const RELICS = [
  {
    id: 'twin_core',
    name: '双生道果 · 太虚子母核',
    tag: 'RELIC · 核心遗物',
    color: '#D97706',
    archetypes: ['xianxia', 'arcane'],
    catalystPts: 3,
    desc: '生成继承 50% 属性的镜像副球同步射击，并注入 +3 仙侠/奥术流派共鸣点数。',
    apply: p => { p.relics.twinCore = true; },
  },
  {
    id: 'charge_matrix',
    name: '雷神蓄能矩阵',
    tag: 'RELIC · 核心遗物',
    color: '#0055FF',
    archetypes: ['norse', 'exact_zero'],
    catalystPts: 3,
    desc: '空格主动技能最大充能次数 +1，并注入 +3 北欧/归零流派共鸣点数。',
    apply: p => {
      p.maxCharges += 1;
      p.charges = Math.min(p.maxCharges, p.charges + 1);
    },
  },
  {
    id: 'singularity_magnet',
    name: '天机奇点 · 归零磁极',
    tag: 'RELIC · 核心遗物',
    color: '#00A86B',
    archetypes: ['exact_zero', 'xuanhuan'],
    catalystPts: 3,
    desc: '全屏吸取经验且每 15 颗触发电弧链，并注入 +3 归零/玄幻流派共鸣点数。',
    apply: p => {
      p.relics.singularityMagnet = true;
      p.stats.pickup = Math.max(p.stats.pickup, 4000);
    },
  },
  {
    id: 'antimatter_shield',
    name: '焚天反物质金钟罩',
    tag: 'RELIC · 核心遗物',
    color: '#E63312',
    archetypes: ['xuanhuan', 'billiard'],
    catalystPts: 3,
    desc: '每 12 秒生成护盾（碎盾 260px 震爆），并注入 +3 玄幻/台球流派共鸣点数。',
    apply: p => {
      p.relics.antimatterShield = true;
      p.shieldActive = true;
      p.shieldCd = 0;
    },
  },
];

const RELIC_MAP = {};
for (const r of RELICS) RELIC_MAP[r.id] = r;

/* ══════════════ 可选球体（不同颜色、专属普攻、流派偏向与主动技） ══════════════ */
const ORBS = {
  cobalt: {
    id: 'cobalt',
    code: 'ORB-A',
    name: '青冥疾影球',
    archetype: 'xianxia',
    secondaryArch: 'exact_zero',
    skillName: '相位冲刺',
    skillKeyLabel: '冲刺',
    summary: '穿刺剑针 · 相位超频 · 偏向仙侠',
    desc: '高速穿刺单针（穿透+1）；冲刺切割路径敌球并进入 2 秒超频双针连射（软引导偏向仙侠/归零）',
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
    name: '黑八震荡球',
    archetype: 'billiard',
    secondaryArch: 'xuanhuan',
    skillName: '脉冲震爆',
    skillKeyLabel: '震爆',
    summary: '重型击退 · 台球对撞 · 偏向台球',
    desc: '重型母球弹强力击退触发对撞；震爆随攻击指数成长（8+3.0×伤）（软引导偏向台球/玄幻）',
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
    name: '阿瓦隆齐射球',
    archetype: 'arcane',
    secondaryArch: 'norse',
    skillName: '环向齐射',
    skillKeyLabel: '齐射',
    summary: '暴击追猎 · 环向齐射 · 偏向奥术',
    desc: '高暴击单发精准弹（暴击45%追加追踪弹）；空格环向齐射随散射扩容（软引导偏向奥术/北欧）',
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
    desc: '敌血 ×1.25 · 刷怪 ×1.20 · 敌伤 ×1.30',
    color: '#E63312',
    hpMul: 1.25,
    spawnMul: 1.20,
    dmgMul: 1.30,
    speedMul: 1.08,
    xpNeedMul: 1.06,
    healBonus: 0,
  },
};

const DIFF_ORDER = ['easy', 'normal', 'hard'];

function getDifficulty(diffId) {
  const id = diffId || (typeof Game !== 'undefined' && Game.difficulty ? Game.difficulty : 'normal');
  return DIFFICULTIES[id] || DIFFICULTIES.normal;
}

/* ══════════════ 成长曲线（6 分钟平衡递进曲线） ══════════════ */
function xpNeedFor(level, diffId) {
  const d = getDifficulty(diffId);
  return Math.max(4, Math.round((6 + level * 7 + level * level * 1.05) * d.xpNeedMul));
}

/** 敌人血量倍率 —— 平滑递进加压，避免新怪血量断层锁死发育 */
function hpScaleAt(t, diffId) {
  const d = getDifficulty(diffId);
  return (1 + (t / 46) * (1 + t / 64)) * Math.pow(1.0148, t) * d.hpMul;
}

/** 敌人攻击力倍率 —— 平缓递进，避免后期数值爆炸秒杀玩家 */
function dmgScaleAt(t, diffId) {
  const d = getDifficulty(diffId);
  return (1 + (t / 110) * (1 + t / 150)) * Math.pow(1.0048, t) * d.dmgMul;
}

/** 每秒刷怪数 —— 从 1.35/s 起步，平稳攀升至 10.0/s（随难度倍率缩放） */
function spawnRateAt(t, diffId) {
  const d = getDifficulty(diffId);
  return Math.min(10.0 * d.spawnMul, (1.35 + t / 24) * d.spawnMul);
}

/** 当前威胁等级（仅展示） */
function threatAt(t) {
  return 1 + Math.floor(t / 30);
}

/** 按时间挑选敌人种类 —— 更早引入精英怪与混合阵型 */
function pickEnemyType(t) {
  const walkerW   = Math.max(16, 100 - (t > 60 ? (t - 60) * 0.40 : 0));
  const sprinterW = t > 20 ? Math.min(52, 24 + (t - 20) * 0.45) : 0;
  const splitterW = t > 30 ? Math.min(48, 20 + (t - 30) * 0.35) : 0;
  const chargerW  = t > 42 ? Math.min(38, 16 + (t - 42) * 0.28) : 0;
  const tankW     = t > 60 ? Math.min(38, 14 + (t - 60) * 0.24) : 0;
  const shooterW  = t > 78 ? Math.min(36, 14 + (t - 78) * 0.22) : 0;
  const shielderW = t > 96 ? Math.min(32, 12 + (t - 96) * 0.20) : 0;

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
