'use strict';

const UI = {
  el: {},
  _hudT: 0,
  _dockSig: '',

  init() {
    const ids = [
      'hud', 'hpFill', 'hpLabel', 'xpFill', 'xpLabel', 'lvLabel', 'tierBadge', 'clock', 'threat',
      'kills', 'dps', 'btnMute', 'btnPauseHud', 'bossbar', 'bossFill', 'bossName', 'dock', 'dashbox', 'dashArc', 'dashLabel', 'dashCharges', 'tip',
      'screenTitle', 'brandBall', 'orbGrid', 'orbSummary', 'diffGrid', 'diffSummary', 'btnStart', 'record',
      'screenLevel', 'lvHead', 'lvTitle', 'lvSub', 'lvNum', 'cards',
      'screenPause', 'pauseStats', 'btnResume', 'btnQuit',
      'screenOver', 'overTitle', 'overSub', 'overStats', 'overBuild', 'btnAgain', 'btnTitle',
    ];
    for (const id of ids) this.el[id] = document.getElementById(id);

    this.renderOrbs();
    this.renderDifficulties();

    this.el.btnStart.onclick = () => { Sfx.init(); Game.start(); };
    this.el.btnAgain.onclick = () => { Sfx.init(); Game.start(); };
    this.el.btnTitle.onclick = () => Game.toTitle();
    this.el.btnResume.onclick = () => Game.resume();
    this.el.btnQuit.onclick = () => Game.toTitle();
    if (this.el.btnPauseHud) this.el.btnPauseHud.onclick = () => Game.togglePause();
    if (this.el.btnMute) {
      this.el.btnMute.onclick = () => {
        Sfx.init();
        Sfx.toggleMute();
        this.syncMute();
      };
    }

    if (this.el.orbGrid) {
      this.el.orbGrid.addEventListener('click', ev => {
        const btn = ev.target.closest('.orb-btn');
        if (!btn) return;
        Sfx.init();
        Game.setOrb(btn.dataset.orb);
      });
    }

    if (this.el.diffGrid) {
      this.el.diffGrid.addEventListener('click', ev => {
        const btn = ev.target.closest('.diff-btn');
        if (!btn) return;
        Sfx.init();
        Game.setDifficulty(btn.dataset.diff);
      });
    }

    this.el.cards.addEventListener('click', ev => {
      const card = ev.target.closest('.card');
      if (!card) return;
      Game.chooseSkill(Number(card.dataset.idx));
    });

    window.addEventListener('pointerdown', () => Sfx.init(), { once: true });
    window.addEventListener('keydown', () => Sfx.init(), { once: true });
    this.syncMute();
  },

  syncMute() {
    if (!this.el.btnMute) return;
    this.el.btnMute.classList.toggle('muted', Sfx.muted);
    this.el.btnMute.title = Sfx.muted ? '取消静音 (M)' : '静音 (M)';
  },

  renderOrbs() {
    if (!this.el.orbGrid || typeof ORB_ORDER === 'undefined') return;
    this.el.orbGrid.innerHTML = ORB_ORDER.map(id => {
      const o = ORBS[id];
      return '<button type="button" class="orb-btn" data-orb="' + o.id + '" style="--accent:' + o.color + '" aria-pressed="false">' +
        '<div class="orb-top">' +
          '<span class="orb-swatch"></span>' +
          '<span class="orb-title-wrap"><strong class="orb-name">' + o.name + '</strong><span class="orb-skill">' + o.skillName + '</span></span>' +
        '</div>' +
        '<div class="orb-desc">' + o.desc + '</div>' +
      '</button>';
    }).join('');
    this.syncOrb();
  },

  syncOrb() {
    if (!this.el.orbGrid || typeof getOrb !== 'function') return;
    const cur = getOrb();
    const btns = this.el.orbGrid.querySelectorAll ? this.el.orbGrid.querySelectorAll('.orb-btn') : [];
    for (const btn of btns) {
      const on = btn.dataset.orb === cur.id;
      btn.classList.toggle('active', on);
      if (btn.setAttribute) btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    if (this.el.orbSummary) {
      this.el.orbSummary.textContent = cur.name + ' · ' + cur.summary;
      this.el.orbSummary.style.color = cur.ringColor;
    }
    if (this.el.brandBall) {
      this.el.brandBall.style.background = cur.color;
    }
  },

  renderDifficulties() {
    if (!this.el.diffGrid || typeof DIFF_ORDER === 'undefined') return;
    this.el.diffGrid.innerHTML = DIFF_ORDER.map(id => {
      const d = DIFFICULTIES[id];
      return '<button type="button" class="diff-btn" data-diff="' + d.id + '" style="--accent:' + d.color + '" aria-pressed="false">' +
        '<div class="diff-top"><span class="diff-code">' + d.code + ' · ' + d.en + '</span><span class="diff-dot"></span></div>' +
        '<div class="diff-name">' + d.name + '</div>' +
        '<div class="diff-desc">' + d.desc + '</div>' +
      '</button>';
    }).join('');
    this.syncDifficulty();
  },

  syncDifficulty() {
    if (!this.el.diffGrid || typeof getDifficulty !== 'function') return;
    const cur = getDifficulty();
    const btns = this.el.diffGrid.querySelectorAll ? this.el.diffGrid.querySelectorAll('.diff-btn') : [];
    for (const btn of btns) {
      const on = btn.dataset.diff === cur.id;
      btn.classList.toggle('active', on);
      if (btn.setAttribute) btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    if (this.el.diffSummary) {
      this.el.diffSummary.textContent = cur.name + ' · ' + cur.summary;
      this.el.diffSummary.style.color = cur.color;
    }
  },

  updateRecord(best) {
    if (!this.el.record) return;
    const d = typeof getDifficulty === 'function' ? getDifficulty() : null;
    const dr = (best && best.byDiff && d && best.byDiff[d.id]) ? best.byDiff[d.id] : best;
    const label = d ? ('[' + d.name + '] ') : '';
    if (dr && (dr.time > 0 || dr.kills > 0)) {
      this.el.record.textContent = label + '最佳存活 ' + fmtTime(dr.time) + ' · 最高击杀 ' + dr.kills + ' · 最高等级 ' + (dr.level || 1);
    } else {
      this.el.record.textContent = label + '最佳存活 00:00 · 最高击杀 0 · 最高等级 1';
    }
  },

  /* ───────── 屏幕切换 ───────── */
  hideAllScreens() {
    this.el.screenTitle.classList.add('hidden');
    this.el.screenLevel.classList.add('hidden');
    this.el.screenPause.classList.add('hidden');
    this.el.screenOver.classList.add('hidden');
  },

  showTitle(best) {
    this.hideAllScreens();
    this.el.hud.classList.add('hidden');
    this.el.screenTitle.classList.remove('hidden');
    this.syncOrb();
    this.syncDifficulty();
    this.updateRecord(best);
  },

  showGame() {
    this.hideAllScreens();
    this.el.hud.classList.remove('hidden');
    this._dockSig = '';
    this.syncDock(true);
    this.syncHud(1, true);

    const orb = typeof getOrb === 'function' ? getOrb() : null;
    if (orb && this.el.dashLabel) this.el.dashLabel.textContent = orb.skillKeyLabel;
    if (orb && this.el.dashbox) this.el.dashbox.style.setProperty('--accent', orb.ringColor);

    // 重播开局操作提示
    const tip = this.el.tip;
    if (tip) {
      if (orb) tip.textContent = 'WASD 移动 · 自动射击 · 空格 ' + orb.skillName;
      tip.style.animation = 'none';
      void tip.offsetWidth;
      tip.style.animation = 'tipFade 4.5s ease-out forwards';
    }
  },

  showLevelUp(choices, mode) {
    const isRelic = mode === 'relic';
    if (this.el.lvHead) this.el.lvHead.classList.toggle('relic', isRelic);
    if (this.el.lvTitle) this.el.lvTitle.textContent = isRelic ? 'CORE OVERDRIVE' : 'SYSTEM UPGRADE';
    if (this.el.lvSub) {
      if (isRelic) {
        this.el.lvSub.innerHTML = 'BOSS 击破 · 选择一件 <b>核心遗物</b>';
      } else {
        const lvStr = (Game.level < 10 ? '0' : '') + Game.level;
        this.el.lvSub.innerHTML = 'LV.<b id="lvNum">' + lvStr + '</b> · 选择一项强化模块';
        this.el.lvNum = document.getElementById('lvNum');
      }
    }
    this.el.cards.innerHTML = choices.map((c, i) => isRelic ? this.relicCardHTML(c, i) : this.cardHTML(c, i)).join('');
    this.el.screenLevel.classList.remove('hidden');
  },

  hideLevelUp() { this.el.screenLevel.classList.add('hidden'); },

  relicCardHTML(c, i) {
    const r = c.relic;
    return '' +
      '<div class="card relic" data-idx="' + i + '" style="--accent:' + r.color + ';animation-delay:' + (i * 65) + 'ms">' +
        '<div class="card-top">' +
          '<span class="card-tag">' + r.tag + '</span>' +
          '<span class="card-key">0' + (i + 1) + '</span>' +
        '</div>' +
        '<div class="card-icon">' + skillIcon(r.id, 26) + '</div>' +
        '<div class="card-name">' + r.name + '</div>' +
        '<div class="card-desc">' + r.desc + '</div>' +
      '</div>';
  },

  cardHTML(c, i) {
    const s = c.skill;
    const lv = c.lv;
    const type = SKILL_TYPES[s.type];
    const isCapstone = (lv + 1 >= s.maxLv) && !!s.capstoneDesc;
    const isMid = !isCapstone && !!s.midLv && (lv + 1 === s.midLv) && !!s.midDesc;
    let pips = '';
    for (let k = 0; k < s.maxLv; k++) {
      const cls = k < lv ? 'on' : (k === lv ? 'new' : '');
      pips += '<i class="' + cls + '"></i>';
    }
    const isNew = lv === 0;
    const tagTxt = isCapstone
      ? 'MAX · 终极觉醒'
      : isMid
        ? 'STAGE II · 中阶质变'
        : (type.code + ' · ' + type.label + (s.dual ? ' · 双向' : (isNew ? ' · NEW' : ' · ' + (lv + 1) + '/' + s.maxLv)));
    const deltaStr = typeof previewSkillDelta === 'function' ? previewSkillDelta(s, lv + 1) : '';
    const deltaBlock = deltaStr ? '<div class="card-delta">' + deltaStr + '</div>' : '';
    const capBlock = isCapstone
      ? '<div class="card-cap">' + s.capstoneDesc + '</div>'
      : (isMid ? '<div class="card-cap mid">' + s.midDesc + '</div>' : '');
    return '' +
      '<div class="card' + (isCapstone ? ' capstone' : '') + '" data-idx="' + i + '" style="--accent:' + (isCapstone ? '#D97706' : type.color) + ';animation-delay:' + (i * 65) + 'ms">' +
        '<div class="card-top">' +
          '<span class="card-tag">' + tagTxt + '</span>' +
          '<span class="card-key">0' + (i + 1) + '</span>' +
        '</div>' +
        '<div class="card-icon">' + skillIcon(s.id, 26) + '</div>' +
        '<div class="card-name">' + s.name + '</div>' +
        '<div class="card-pips">' + pips + '</div>' +
        deltaBlock +
        '<div class="card-desc">' + s.desc(lv) + '</div>' +
        capBlock +
      '</div>';
  },

  buildChipsHTML() {
    const ids = Object.keys(Game.owned);
    const relicIds = Object.keys(Game.ownedRelics || {});
    const items = [];
    for (const rid of relicIds) {
      const r = RELIC_MAP[rid];
      if (!r) continue;
      items.push('<span class="b-chip relic" style="--accent:' + r.color + '">' +
        skillIcon(rid, 13) + '<span>' + r.name + '</span><b>遗物</b></span>');
    }
    for (const id of ids) {
      const s = SKILL_MAP[id];
      const lv = Game.owned[id];
      const maxed = lv >= s.maxLv && s.capstoneDesc;
      items.push('<span class="b-chip' + (maxed ? ' maxed' : '') + '" style="--accent:' + SKILL_TYPES[s.type].color + '">' +
        skillIcon(id, 13) + '<span>' + s.name + '</span><b>' + (maxed ? 'MAX' : 'Lv.' + lv) + '</b></span>');
    }
    return items.length ? items.join('') : '<span class="b-chip">尚未装配强化模块</span>';
  },

  showPause() {
    const build = this.buildChipsHTML();
    const d = typeof getDifficulty === 'function' ? getDifficulty() : null;
    const o = typeof getOrb === 'function' ? getOrb() : null;
    this.el.pauseStats.innerHTML = this.statHTML([
      ['存活时长', fmtTime(Game.time)],
      ['当前等级', 'Lv.' + Game.level],
      ['击杀数', Game.kills],
      ['核心 / 秒伤', (o ? o.name + ' · ' : '') + (d ? d.name + ' · ' : '') + fmt(Game.dps)],
    ]) + '<div class="st" style="grid-column:1/-1;margin-top:4px"><span>已装配模块与遗物</span></div>' +
      '<div class="build" style="grid-column:1/-1;justify-content:flex-start;margin-top:-2px">' + build + '</div>';

    this.el.screenPause.classList.remove('hidden');
  },

  hidePause() { this.el.screenPause.classList.add('hidden'); },

  showOver(win) {
    const d = typeof getDifficulty === 'function' ? getDifficulty() : null;
    const o = typeof getOrb === 'function' ? getOrb() : null;
    const diffTag = (o || d) ? ('[' + (o ? o.name : '') + (o && d ? ' · ' : '') + (d ? d.name : '') + '] ') : '';
    this.el.overTitle.textContent = win ? '突围成功' : '核心解体';
    this.el.overSub.textContent = win
      ? diffTag + '数值风暴已平息 · 几何秩序重建'
      : diffTag + (Game.time > 240 ? '距离终局仅一步之遥' : Game.time > 90 ? '善用台球对撞与精准归零突破重围' : '保持机动走位，利用技能破圈');

    const dps = Game.time > 1 ? Math.round(Game.kills / Game.time * 10) / 10 : 0;
    this.el.overStats.innerHTML = this.statHTML([
      ['存活时长', fmtTime(Game.time)],
      ['最终等级', 'Lv.' + Game.level],
      ['击杀总数', Game.kills],
      ['击杀效率', dps + ' / 秒'],
    ]);

    this.el.overBuild.innerHTML = this.buildChipsHTML();
    this.el.screenOver.classList.remove('hidden');
  },

  statHTML(pairs) {
    return pairs.map(p => '<div class="st"><b>' + p[1] + '</b><span>' + p[0] + '</span></div>').join('');
  },

  /* ───────── HUD 同步 ───────── */
  syncHud(dt, force) {
    this._hudT += dt;
    if (!force && this._hudT < 0.07) return;
    this._hudT = 0;

    const p = Game.player;
    if (!p) return;

    const hpR = clamp(p.hp / p.maxHp, 0, 1);
    this.el.hpFill.style.transform = 'scaleX(' + hpR.toFixed(3) + ')';
    this.el.hpLabel.textContent = Math.ceil(Math.max(0, p.hp)) + ' / ' + p.maxHp;

    const xpR = clamp(Game.xp / Game.xpNeed, 0, 1);
    this.el.xpFill.style.transform = 'scaleX(' + xpR.toFixed(3) + ')';
    this.el.xpLabel.textContent = Math.floor(Game.xp) + ' / ' + Game.xpNeed;
    this.el.lvLabel.textContent = 'LV.' + (Game.level < 10 ? '0' : '') + Game.level;
    if (this.el.tierBadge && typeof tierRoman === 'function' && typeof effectiveDmg === 'function') {
      const tier = p.coreTier || 1;
      this.el.tierBadge.textContent = 'CORE ' + tierRoman(tier) + ' · 单发 ' + fmt(Math.round(effectiveDmg()));
    }

    this.el.clock.textContent = fmtTime(Game.time);
    const left = Math.max(0, CFG.duration - Game.time);
    const d = typeof getDifficulty === 'function' ? getDifficulty() : null;
    this.el.threat.textContent = (d ? d.name + ' · ' : '') + '威胁等级 ' + threatAt(Game.time) + ' · 剩余 ' + fmtTime(left);

    this.el.kills.textContent = Game.kills;
    this.el.dps.textContent = fmt(Game.dps);

    // Boss 血条
    const b = Game.boss;
    if (b && !b.dead) {
      this.el.bossbar.classList.remove('hidden');
      this.el.bossName.textContent = (b.label || '秩序核心') + ' · ' + fmt(b.hp) + ' HP';
      this.el.bossFill.style.transform = 'scaleX(' + clamp(b.hp / b.maxHp, 0, 1).toFixed(3) + ')';
    } else {
      this.el.bossbar.classList.add('hidden');
    }

    // 主动技能环（支持充能矩阵多层充能）
    const orb = typeof getOrb === 'function' ? getOrb(p.orbId) : null;
    const ringCol = orb ? orb.ringColor : '#0055FF';
    const cdMax = p.beaconBuffT > 0 ? Math.min(0.25, p.stats.dashCd) : p.stats.dashCd;
    const cd = p.charges < p.maxCharges ? clamp(p.dashCd, 0, cdMax) : 0;
    const ready = p.charges > 0;
    this.el.dashArc.style.strokeDashoffset = (113.1 * (cd / Math.max(0.05, cdMax))).toFixed(1);
    this.el.dashArc.style.stroke = ready ? ringCol : 'rgba(17, 19, 21, 0.25)';
    if (this.el.dashbox) {
      this.el.dashbox.style.setProperty('--accent', ringCol);
      this.el.dashbox.classList.toggle('ready', ready);
    }
    if (this.el.dashCharges) {
      this.el.dashCharges.classList.toggle('hidden', p.maxCharges <= 1);
      this.el.dashCharges.textContent = String(p.charges);
    }

    this.syncDock();
  },

  syncDock(force) {
    const ids = Object.keys(Game.owned);
    const rids = Object.keys(Game.ownedRelics || {});
    const sig = ids.map(id => id + ':' + Game.owned[id]).join('|') + '#' + rids.join(',');
    if (!force && sig === this._dockSig) return;
    this._dockSig = sig;
    const relicChips = rids.map(rid => {
      const r = RELIC_MAP[rid];
      return r ? ('<div class="chip relic" style="--accent:' + r.color + '" title="核心遗物 · ' + r.name + '">' +
        skillIcon(rid, 18) + '<span class="n">✦</span></div>') : '';
    });
    const skillChips = ids.map(id => {
      const s = SKILL_MAP[id];
      const lv = Game.owned[id];
      const maxed = lv >= s.maxLv && s.capstoneDesc;
      const c = SKILL_TYPES[s.type].color;
      return '<div class="chip' + (maxed ? ' maxed' : '') + '" style="--accent:' + c + '" title="' + s.name + ' Lv.' + lv + '">' +
        skillIcon(id, 18) + '<span class="n">' + (maxed ? '★' : lv) + '</span></div>';
    });
    this.el.dock.innerHTML = relicChips.concat(skillChips).join('');
  },
};
