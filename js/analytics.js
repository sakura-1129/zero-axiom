'use strict';

/* ══════════════ 游玩数据遥测与风格分析引擎 ══════════════ */
const HISTORY_KEY = 'zero_axiom_history_v1';
const HISTORY_LIMIT = 25;

const Analytics = {
  createTelemetry() {
    return {
      dmgPrimary: 0,
      dmgSub: 0,
      dmgBilliard: 0,
      dmgExactZero: 0,
      dmgOverkill: 0,
      billiardHits: 0,
      exactZeroCount: 0,
      overkillCount: 0,
      maxCritDmg: 0,
      peakDps: 0,
      moveDist: 0,
      idleTime: 0,
      skillCasts: 0,
      beaconsCaptured: 0,
      dmgTaken: 0,
      healed: 0,
      capstones: 0,
      buildOrder: [],
    };
  },

  /** 从当前 Game 状态提取可落盘的单局快照 */
  buildRunSummary(win) {
    const t = Game.telemetry || this.createTelemetry();
    const p = Game.player;
    const totalDmg = Math.max(0, Math.round(Game.dmgDealt || 0));
    const dmgKnown = t.dmgPrimary + t.dmgBilliard + t.dmgExactZero + t.dmgOverkill;
    const dmgSub = t.dmgSub > 0 ? t.dmgSub : Math.max(0, totalDmg - dmgKnown);
    const ownedCopy = Object.assign({}, Game.owned || {});
    const relicIds = Object.keys(Game.ownedRelics || {});

    const raw = {
      ts: Date.now(),
      win: !!win,
      orbId: Game.orb || (p && p.orbId) || 'cobalt',
      difficulty: Game.difficulty || 'normal',
      time: Math.round((Game.time || 0) * 10) / 10,
      level: Game.level || 1,
      coreTier: (p && p.coreTier) || 1,
      stage: (p && p.stage) || 1,
      kills: Game.kills || 0,
      dmgDealt: totalDmg,
      peakDps: Math.round(Math.max(t.peakDps || 0, Game.dps || 0)),
      maxCritDmg: Math.round(t.maxCritDmg || 0),
      dmgPrimary: Math.round(t.dmgPrimary || 0),
      dmgSub: Math.round(dmgSub),
      dmgBilliard: Math.round(t.dmgBilliard || 0),
      dmgExactZero: Math.round(t.dmgExactZero || 0),
      dmgOverkill: Math.round(t.dmgOverkill || 0),
      billiardHits: t.billiardHits || 0,
      exactZeroCount: t.exactZeroCount || 0,
      overkillCount: t.overkillCount || 0,
      moveDist: Math.round(t.moveDist || 0),
      idleTime: Math.round((t.idleTime || 0) * 10) / 10,
      skillCasts: t.skillCasts || 0,
      beaconsCaptured: t.beaconsCaptured || 0,
      dmgTaken: Math.round(t.dmgTaken || 0),
      healed: Math.round(t.healed || 0),
      capstones: t.capstones || 0,
      owned: ownedCopy,
      relics: relicIds,
      buildOrder: (t.buildOrder || []).slice(0, 24),
    };
    const analysis = this.computeStyle(raw);
    raw.title = analysis.title;
    raw.scores = analysis.scores;
    return raw;
  },

  /** 计算 5 维游玩风格雷达（0~100）与流派称号 */
  computeStyle(run) {
    const dur = Math.max(1, run.time || 0);
    const dmg = Math.max(1, run.dmgDealt || 0);
    const avgDps = dmg / dur;
    const peakDps = Math.max(avgDps, run.peakDps || 0);

    // 1. 侵略度（输出密度与爆破力）
    const dpsScore = Math.min(65, Math.log10(1 + peakDps) * 18);
    const killRateScore = Math.min(20, ((run.kills || 0) / dur) * 9);
    const capScore = Math.min(15, (run.capstones || 0) * 6 + ((run.stage || 1) - 1) * 4);
    const aggression = clamp(Math.round(dpsScore + killRateScore + capScore), 10, 100);

    // 2. 机动性（走位拉扯）
    const avgSpeed = (run.moveDist || 0) / dur;
    const activeRatio = clamp(1 - (run.idleTime || 0) / dur, 0, 1);
    const mobility = clamp(Math.round((avgSpeed / 220) * 65 + activeRatio * 35), 8, 100);

    // 3. 操控感（主动技频率与信标跑图）
    const castRate = ((run.skillCasts || 0) / dur) * 60; // 每分钟释放次数
    const beaconScore = Math.min(35, (run.beaconsCaptured || 0) * 12);
    const control = clamp(Math.round(Math.min(65, castRate * 4.5) + beaconScore), 8, 100);

    // 4. 法则派（台球对撞 + 精准归零 + 过载传导）
    const mechShare = ((run.dmgBilliard || 0) + (run.dmgExactZero || 0) + (run.dmgOverkill || 0)) / dmg;
    const mechEvents = ((run.billiardHits || 0) + (run.exactZeroCount || 0) * 1.5 + (run.overkillCount || 0)) / (dur / 10);
    const axiom = clamp(Math.round(Math.min(55, mechShare * 110) + Math.min(45, mechEvents * 8)), 8, 100);

    // 5. 坚韧度（生存与续航转化）
    const survRatio = clamp((run.time || 0) / 360, 0, 1);
    const sustainRatio = (run.healed || 0) / Math.max(1, (run.dmgTaken || 0) + (run.healed || 0));
    const resilience = clamp(Math.round(survRatio * 60 + sustainRatio * 25 + (run.win ? 15 : 0)), 10, 100);

    const scores = { aggression, mobility, control, axiom, resilience };

    // 伤害来源占比
    const pPrimary = run.dmgPrimary || 0;
    const pSub = run.dmgSub || 0;
    const pBilliard = run.dmgBilliard || 0;
    const pLaw = (run.dmgExactZero || 0) + (run.dmgOverkill || 0);
    const sum = Math.max(1, pPrimary + pSub + pBilliard + pLaw);
    const breakdown = [
      { id: 'primary', label: '主弹幕', pct: Math.round((pPrimary / sum) * 100), val: pPrimary, color: '#111315' },
      { id: 'sub', label: '副武器', pct: Math.round((pSub / sum) * 100), val: pSub, color: '#0055FF' },
      { id: 'billiard', label: '台球对撞', pct: Math.round((pBilliard / sum) * 100), val: pBilliard, color: '#4F3CC9' },
      { id: 'law', label: '归零/传导', pct: Math.max(0, 100 - Math.round((pPrimary / sum) * 100) - Math.round((pSub / sum) * 100) - Math.round((pBilliard / sum) * 100)), val: pLaw, color: '#D97706' },
    ];

    // 称号判定（优先识别鲜明机制偏好）
    let title = '均衡探索者';
    let comment = '攻守节奏平稳，各项几何法则均有涉猎。';
    let color = '#0055FF';

    const billiardShare = pBilliard / sum;
    const lawShare = pLaw / sum;
    const subShare = pSub / sum;

    if (billiardShare >= 0.18 || (run.billiardHits || 0) >= Math.max(18, dur * 0.45)) {
      title = '台球物理学家';
      comment = '擅长将敌群撞作一团，用动量传递与对撞连锁清场。';
      color = '#4F3CC9';
    } else if (lawShare >= 0.16 || (run.exactZeroCount || 0) >= Math.max(8, dur * 0.22)) {
      title = '数字处刑官';
      comment = '精于控血与溢出收割，把归零双倍经验与传导发挥到极致。';
      color = '#D97706';
    } else if ((run.capstones || 0) >= 2 || (run.stage || 1) >= 3) {
      title = '大成专修宗师';
      comment = '心无旁骛专修核心功法，以高阶质变碾压数值风暴。';
      color = '#E63312';
    } else if ((run.beaconsCaptured || 0) >= 3) {
      title = '信标猎手';
      comment = '极度主动抢占几何信标，善于利用超频与空投滚雪球。';
      color = '#0055FF';
    } else if (mobility >= 72 && control >= 55) {
      title = '极速游侠';
      comment = '全场高频走位与技能机动拉扯，不给包围圈合拢的机会。';
      color = '#00A86B';
    } else if (subShare >= 0.35) {
      title = '自动阵列师';
      comment = '依托环绕卫星、电弧与追踪矩阵构建全自动火力网。';
      color = '#0055FF';
    } else if (aggression >= 68 && mobility <= 42) {
      title = '阵地重炮台';
      comment = '以高额输出与硬朗续航正面迎敌，稳扎稳打推进。';
      color = '#E63312';
    }

    return { title, comment, color, scores, breakdown };
  },

  loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (err) {
      return [];
    }
  },

  saveRun(summary) {
    const list = this.loadHistory();
    list.unshift(summary);
    if (list.length > HISTORY_LIMIT) list.length = HISTORY_LIMIT;
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    } catch (err) { /* 忽略 */ }
    return list;
  },

  clearHistory() {
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch (err) { /* 忽略 */ }
  },

  aggregateCareer(history) {
    const list = Array.isArray(history) ? history : [];
    const n = list.length;
    if (n === 0) {
      return {
        runs: 0, wins: 0, winRate: 0, totalKills: 0, totalTime: 0,
        bestDps: 0, favoriteOrb: null, title: '尚未出战',
        comment: '完成至少一局游戏后即可生成生涯风格画像。',
        scores: { aggression: 0, mobility: 0, control: 0, axiom: 0, resilience: 0 },
      };
    }
    let wins = 0, totalKills = 0, totalTime = 0, bestDps = 0;
    const orbCount = {};
    const titleCount = {};
    const sumScores = { aggression: 0, mobility: 0, control: 0, axiom: 0, resilience: 0 };

    for (let i = 0; i < n; i++) {
      const r = list[i];
      if (r.win) wins++;
      totalKills += r.kills || 0;
      totalTime += r.time || 0;
      if ((r.peakDps || 0) > bestDps) bestDps = r.peakDps || 0;
      const oid = r.orbId || 'cobalt';
      orbCount[oid] = (orbCount[oid] || 0) + 1;
      const sc = r.scores || this.computeStyle(r).scores;
      for (const k in sumScores) sumScores[k] += sc[k] || 0;
      const t = r.title || this.computeStyle(r).title;
      titleCount[t] = (titleCount[t] || 0) + 1;
    }

    let favOrb = 'cobalt', favMax = -1;
    for (const k in orbCount) {
      if (orbCount[k] > favMax) { favMax = orbCount[k]; favOrb = k; }
    }
    let topTitle = '均衡探索者', topTMax = -1;
    for (const k in titleCount) {
      if (titleCount[k] > topTMax) { topTMax = titleCount[k]; topTitle = k; }
    }

    const avgScores = {};
    for (const k in sumScores) avgScores[k] = Math.round(sumScores[k] / n);

    return {
      runs: n,
      wins: wins,
      winRate: Math.round((wins / n) * 100),
      totalKills: totalKills,
      totalTime: totalTime,
      bestDps: bestDps,
      favoriteOrb: favOrb,
      title: topTitle,
      comment: '基于近 ' + n + ' 局统计的生涯主导风格。',
      scores: avgScores,
    };
  },

  /** 瑞士几何五维雷达 SVG（支持可选对比层 compareScores） */
  renderRadarSVG(scores, accent, compareScores) {
    const dims = [
      { key: 'aggression', label: '侵略' },
      { key: 'mobility', label: '机动' },
      { key: 'control', label: '操控' },
      { key: 'axiom', label: '法则' },
      { key: 'resilience', label: '坚韧' },
    ];
    const cx = 100, cy = 96, R = 64;
    const pt = (idx, ratio) => {
      const a = -Math.PI / 2 + (idx / 5) * TAU;
      return [cx + Math.cos(a) * R * ratio, cy + Math.sin(a) * R * ratio];
    };

    let grid = '';
    for (const lv of [0.33, 0.66, 1.0]) {
      const pts = dims.map((_, i) => pt(i, lv).map(v => v.toFixed(1)).join(',')).join(' ');
      grid += '<polygon points="' + pts + '" fill="none" stroke="rgba(17,19,21,0.12)" stroke-width="1"/>';
    }
    for (let i = 0; i < 5; i++) {
      const p = pt(i, 1);
      grid += '<line x1="' + cx + '" y1="' + cy + '" x2="' + p[0].toFixed(1) + '" y2="' + p[1].toFixed(1) + '" stroke="rgba(17,19,21,0.1)" stroke-width="1"/>';
    }

    let comparePoly = '';
    if (compareScores) {
      const cPts = dims.map((d, i) => pt(i, clamp((compareScores[d.key] || 0) / 100, 0.08, 1)).map(v => v.toFixed(1)).join(',')).join(' ');
      comparePoly = '<polygon points="' + cPts + '" fill="rgba(17,19,21,0.06)" stroke="rgba(17,19,21,0.35)" stroke-width="1.2" stroke-dasharray="3 3"/>';
    }

    const col = accent || '#0055FF';
    const mainPts = dims.map((d, i) => pt(i, clamp((scores[d.key] || 0) / 100, 0.08, 1)).map(v => v.toFixed(1)).join(',')).join(' ');
    const mainPoly = '<polygon points="' + mainPts + '" fill="' + col + '" fill-opacity="0.18" stroke="' + col + '" stroke-width="2"/>';

    let labels = '';
    for (let i = 0; i < 5; i++) {
      const p = pt(i, 1.24);
      const val = scores[dims[i].key] || 0;
      labels += '<text x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '" text-anchor="middle" dominant-baseline="middle" font-size="10" font-weight="800" fill="#111315">' + dims[i].label + ' ' + val + '</text>';
    }

    return '<svg class="radar-svg" viewBox="0 0 200 192" aria-label="五维风格雷达">' +
      grid + comparePoly + mainPoly + labels + '</svg>';
  },

  /** 最近局数存活时长趋势图 SVG */
  renderTrendSVG(history) {
    const list = (history || []).slice(0, 10).reverse();
    if (list.length === 0) return '<div class="trend-empty">暂无历史曲线</div>';
    const W = 320, H = 84, padX = 14, padY = 14;
    const maxT = Math.max(60, ...list.map(r => r.time || 0));
    const stepX = list.length > 1 ? (W - padX * 2) / (list.length - 1) : 0;

    const pts = list.map((r, i) => {
      const x = list.length > 1 ? padX + i * stepX : W / 2;
      const y = H - padY - ((r.time || 0) / maxT) * (H - padY * 2);
      return { x, y, r };
    });

    const lineD = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ');
    const dots = pts.map(p =>
      '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="3.4" fill="' + (p.r.win ? '#00A86B' : '#0055FF') + '" stroke="#FFFFFF" stroke-width="1.4"/>'
    ).join('');

    return '<svg class="trend-svg" viewBox="0 0 ' + W + ' ' + H + '" aria-label="近期存活趋势">' +
      '<line x1="' + padX + '" y1="' + (H - padY) + '" x2="' + (W - padX) + '" y2="' + (H - padY) + '" stroke="rgba(17,19,21,0.14)" stroke-width="1"/>' +
      (pts.length > 1 ? '<path d="' + lineD + '" fill="none" stroke="#111315" stroke-width="1.8"/>' : '') +
      dots + '</svg>';
  },
};
