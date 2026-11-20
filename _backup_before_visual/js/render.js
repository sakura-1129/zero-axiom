'use strict';

const Render = {
  sprites: new Map(),

  /** 预渲染瑞士风哑光几何球体（2x 超采样缓存，零霓虹光晕） */
  ball(r, color, stroke) {
    r = Math.max(3, Math.round(r));
    const sc = stroke || shade(color, -0.22);
    const key = r + '|' + color + '|' + sc;
    let s = this.sprites.get(key);
    if (s) return s;

    const scale = 2;
    const pad = 6;
    const size = (r + pad) * 2;
    const cv = document.createElement('canvas');
    cv.width = size * scale;
    cv.height = size * scale;
    const c = cv.getContext('2d');
    c.scale(scale, scale);
    const cx = size / 2;
    const cy = size / 2;

    // 柔和地面投影（建筑纸面悬浮感）
    c.save();
    c.beginPath();
    c.arc(cx, cy + Math.max(1.2, r * 0.09), r, 0, TAU);
    c.fillStyle = 'rgba(17, 19, 21, 0.10)';
    c.fill();
    c.restore();

    // 哑光微渐变球体
    const body = c.createRadialGradient(
      cx - r * 0.3, cy - r * 0.34, r * 0.05,
      cx, cy, r * 1.05
    );
    body.addColorStop(0, shade(color, 0.16));
    body.addColorStop(0.58, color);
    body.addColorStop(1, shade(color, -0.10));
    c.beginPath();
    c.arc(cx, cy, r, 0, TAU);
    c.fillStyle = body;
    c.fill();

    // 利落的几何描边
    const lw = Math.max(1, Math.min(2.2, r * 0.08));
    c.lineWidth = lw;
    c.strokeStyle = sc;
    c.beginPath();
    c.arc(cx, cy, r - lw * 0.5, 0, TAU);
    c.stroke();

    // 极简高光弧（微弱哑光质感，非塑料反光）
    if (r >= 10) {
      c.beginPath();
      c.arc(cx, cy, r - lw * 1.6, -Math.PI * 0.82, -Math.PI * 0.38);
      c.strokeStyle = 'rgba(255, 255, 255, 0.28)';
      c.lineWidth = Math.max(1, r * 0.06);
      c.lineCap = 'round';
      c.stroke();
    }

    s = { cv, size };
    this.sprites.set(key, s);
    return s;
  },

  drawBall(ctx, x, y, r, color, stroke) {
    const s = this.ball(r, color, stroke);
    ctx.drawImage(s.cv, x - s.size / 2, y - s.size / 2, s.size, s.size);
  },

  /** 利落现代无衬线数字 */
  text(ctx, str, x, y, size, fill, stroke, weight) {
    size = Math.round(size * 2) / 2;
    ctx.font = (weight || 700) + ' ' + size + 'px "Inter", "Helvetica Neue", ui-sans-serif, system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (stroke) {
      ctx.lineWidth = Math.max(1.5, size * 0.18);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = stroke;
      ctx.strokeText(str, x, y + size * 0.04);
    }
    ctx.fillStyle = fill || '#111315';
    ctx.fillText(str, x, y + size * 0.04);
  },

  /** 敌球上的血量数字 */
  hpNumber(ctx, e) {
    const str = fmt(e.hp);
    let size = Math.min(e.r * 1.15, 42);
    const len = str.length;
    if (len >= 3) size *= 0.85;
    if (len >= 4) size *= 0.84;
    if (len >= 5) size *= 0.82;
    size = Math.max(8.5, size);
    this.text(ctx, str, e.x, e.y, size, '#ffffff', 'rgba(17,19,21,0.22)', 800);
  },

  /** 血量比例环（精密仪表盘式） */
  hpRing(ctx, e) {
    if (e.hp >= e.maxHp) return;
    const ratio = clamp(e.hp / e.maxHp, 0, 1);
    const r = e.r + 4.5;

    ctx.beginPath();
    ctx.arc(e.x, e.y, r, 0, TAU);
    ctx.strokeStyle = 'rgba(17, 19, 21, 0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(e.x, e.y, r, -Math.PI / 2, -Math.PI / 2 + TAU * ratio);
    ctx.strokeStyle = ratio > 0.45 ? '#111315' : '#E63312';
    ctx.lineWidth = 2.2;
    ctx.stroke();
  },

  /** 瑞士建筑制图纸网格背景（屏幕空间） */
  background(ctx, cam, W, H) {
    const g = ctx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.85);
    g.addColorStop(0, '#F7F6F2');
    g.addColorStop(1, '#ECEAE2');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const CELL = 64;
    const ox = ((-cam.x % CELL) + CELL) % CELL;
    const oy = ((-cam.y % CELL) + CELL) % CELL;

    ctx.beginPath();
    for (let x = ox; x < W; x += CELL) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = oy; y < H; y += CELL) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.strokeStyle = 'rgba(17, 19, 21, 0.048)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const BIG = CELL * 5;
    const bx = ((-cam.x % BIG) + BIG) % BIG;
    const by = ((-cam.y % BIG) + BIG) % BIG;
    ctx.beginPath();
    for (let x = bx; x < W; x += BIG) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = by; y < H; y += BIG) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.strokeStyle = 'rgba(17, 19, 21, 0.105)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 大网格交点十字定位标记 (+)
    ctx.beginPath();
    for (let x = bx; x < W; x += BIG) {
      for (let y = by; y < H; y += BIG) {
        ctx.moveTo(x - 5, y);
        ctx.lineTo(x + 5, y);
        ctx.moveTo(x, y - 5);
        ctx.lineTo(x, y + 5);
      }
    }
    ctx.strokeStyle = 'rgba(17, 19, 21, 0.28)';
    ctx.lineWidth = 1.25;
    ctx.stroke();
  },
};
