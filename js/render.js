'use strict';

const INK = '#1B1D23';

const Render = {
  sprites: new Map(),
  _grain: null,
  _vignette: null,
  _vigKey: '',

  /**
   * 让主画布的 fillStyle / strokeStyle 自动走显示调色板。
   * 游戏逻辑仍使用原始色值，只在落笔时映射，保证数据与测试不受影响。
   */
  install(ctx) {
    if (!ctx || ctx.__palInstalled) return;
    const proto = Object.getPrototypeOf(ctx);
    const fd = proto && Object.getOwnPropertyDescriptor(proto, 'fillStyle');
    const sd = proto && Object.getOwnPropertyDescriptor(proto, 'strokeStyle');
    if (!fd || !fd.set || !sd || !sd.set) return;
    Object.defineProperty(ctx, 'fillStyle', {
      configurable: true,
      get() { return fd.get.call(this); },
      set(v) { fd.set.call(this, typeof v === 'string' ? palCol(v) : v); },
    });
    Object.defineProperty(ctx, 'strokeStyle', {
      configurable: true,
      get() { return sd.get.call(this); },
      set(v) { sd.set.call(this, typeof v === 'string' ? palCol(v) : v); },
    });
    ctx.__palInstalled = true;
  },

  /** 预渲染哑光几何球体：柔和投影 + 体积渐变 + 底部反光 + 软高光（2x 超采样缓存） */
  ball(r, color, stroke) {
    r = Math.max(3, Math.round(r));
    color = palCol(color);
    const sc = stroke ? palCol(stroke) : shade(color, -0.26);
    const key = r + '|' + color + '|' + sc;
    let s = this.sprites.get(key);
    if (s) return s;

    const scale = 2;
    const pad = 6 + Math.ceil(r * 0.22);
    const size = (r + pad) * 2;
    const cv = document.createElement('canvas');
    cv.width = size * scale;
    cv.height = size * scale;
    const c = cv.getContext('2d');
    c.scale(scale, scale);
    const cx = size / 2;
    const cy = size / 2;

    // 柔和接触投影（偏右下，纸面悬浮感）
    const offY = Math.max(1.6, r * 0.16);
    const offX = Math.max(0.6, r * 0.05);
    const sh = c.createRadialGradient(cx + offX, cy + offY, r * 0.55, cx + offX, cy + offY, r * 1.16);
    sh.addColorStop(0, 'rgba(27, 29, 35, 0.20)');
    sh.addColorStop(1, 'rgba(27, 29, 35, 0)');
    c.beginPath();
    c.arc(cx + offX, cy + offY, r * 1.16, 0, TAU);
    c.fillStyle = sh;
    c.fill();

    // 体积渐变（左上受光）
    const body = c.createRadialGradient(
      cx - r * 0.34, cy - r * 0.38, r * 0.04,
      cx, cy, r * 1.02
    );
    body.addColorStop(0, shade(color, 0.22));
    body.addColorStop(0.5, color);
    body.addColorStop(1, shade(color, -0.16));
    c.beginPath();
    c.arc(cx, cy, r, 0, TAU);
    c.fillStyle = body;
    c.fill();

    if (r >= 7) {
      // 底部环境反光（让球体从纸面"立"起来）
      c.beginPath();
      c.arc(cx, cy, r * 0.8, Math.PI * 0.18, Math.PI * 0.82);
      c.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      c.lineWidth = Math.max(1, r * 0.1);
      c.lineCap = 'round';
      c.stroke();
    }

    // 利落的几何描边
    const lw = Math.max(1, Math.min(2.4, r * 0.085));
    c.lineWidth = lw;
    c.strokeStyle = sc;
    c.beginPath();
    c.arc(cx, cy, r - lw * 0.5, 0, TAU);
    c.stroke();

    // 柔焦高光点（哑光釉面，而非塑料反光）
    if (r >= 6) {
      const hx = cx - r * 0.36;
      const hy = cy - r * 0.42;
      const hr = r * 0.42;
      const hl = c.createRadialGradient(hx, hy, 0, hx, hy, hr);
      hl.addColorStop(0, 'rgba(255, 255, 255, 0.42)');
      hl.addColorStop(1, 'rgba(255, 255, 255, 0)');
      c.beginPath();
      c.arc(hx, hy, hr, 0, TAU);
      c.fillStyle = hl;
      c.fill();
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
    ctx.fillStyle = fill || INK;
    ctx.fillText(str, x, y + size * 0.04);
  },

  /** 敌球上的血量数字（白字 + 下沉投影，提升在彩色球面上的可读性） */
  hpNumber(ctx, e) {
    const str = fmt(e.hp);
    let size = Math.min(e.r * 1.15, 42);
    const len = str.length;
    if (len >= 3) size *= 0.85;
    if (len >= 4) size *= 0.84;
    if (len >= 5) size *= 0.82;
    size = Math.max(8.5, size);
    this.text(ctx, str, e.x, e.y + Math.max(0.8, size * 0.07), size, 'rgba(27, 29, 35, 0.30)', null, 800);
    this.text(ctx, str, e.x, e.y, size, '#ffffff', null, 800);
  },

  /** 血量比例环（精密仪表盘式） */
  hpRing(ctx, e) {
    if (e.hp >= e.maxHp) return;
    const ratio = clamp(e.hp / e.maxHp, 0, 1);
    const r = e.r + 4.5;

    ctx.beginPath();
    ctx.arc(e.x, e.y, r, 0, TAU);
    ctx.strokeStyle = 'rgba(27, 29, 35, 0.10)';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(e.x, e.y, r, -Math.PI / 2, -Math.PI / 2 + TAU * ratio);
    ctx.strokeStyle = ratio > 0.45 ? INK : '#E63312';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineCap = 'butt';
  },

  /** 纸张颗粒纹理（一次生成，平铺复用） */
  grain() {
    if (this._grain !== null) return this._grain;
    this._grain = false;
    try {
      const n = 160;
      const cv = document.createElement('canvas');
      cv.width = n;
      cv.height = n;
      const c = cv.getContext('2d');
      if (!c.createImageData) return this._grain;
      const img = c.createImageData(n, n);
      const d = img.data;
      let seed = 20261117;
      for (let i = 0; i < d.length; i += 4) {
        seed = (seed * 1103515245 + 12345) >>> 0; // 独立随机源，不扰动游戏 Math.random
        const v = seed / 4294967296;
        const dark = v < 0.5;
        d[i] = d[i + 1] = d[i + 2] = dark ? 40 : 255;
        d[i + 3] = Math.floor(Math.abs(v - 0.5) * 2 * 9);
      }
      c.putImageData(img, 0, 0);
      this._grain = cv;
    } catch (err) { this._grain = false; }
    return this._grain;
  },

  /** 瑞士建筑制图纸网格背景（屏幕空间） */
  background(ctx, cam, W, H) {
    const g = ctx.createRadialGradient(W * 0.5, H * 0.46, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.8);
    g.addColorStop(0, '#F7F5EF');
    g.addColorStop(0.65, '#F0EDE4');
    g.addColorStop(1, '#E6E2D7');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 纸张颗粒（随相机滚动，保持世界锚定）
    const gr = this.grain();
    if (gr && ctx.createPattern) {
      const pat = ctx.createPattern(gr, 'repeat');
      if (pat) {
        const gx = ((-cam.x % 160) + 160) % 160;
        const gy = ((-cam.y % 160) + 160) % 160;
        ctx.save();
        ctx.translate(gx - 160, gy - 160);
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, W + 160, H + 160);
        ctx.restore();
      }
    }

    const CELL = 64;
    const ox = ((-cam.x % CELL) + CELL) % CELL;
    const oy = ((-cam.y % CELL) + CELL) % CELL;

    ctx.beginPath();
    for (let x = ox; x < W; x += CELL) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, H); }
    for (let y = oy; y < H; y += CELL) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(W, Math.round(y) + 0.5); }
    ctx.strokeStyle = 'rgba(60, 52, 40, 0.055)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const BIG = CELL * 5;
    const bx = ((-cam.x % BIG) + BIG) % BIG;
    const by = ((-cam.y % BIG) + BIG) % BIG;
    ctx.beginPath();
    for (let x = bx; x < W; x += BIG) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, H); }
    for (let y = by; y < H; y += BIG) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(W, Math.round(y) + 0.5); }
    ctx.strokeStyle = 'rgba(60, 52, 40, 0.11)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 大网格交点十字定位标记 (+) 与制图坐标
    ctx.beginPath();
    for (let x = bx; x < W; x += BIG) {
      for (let y = by; y < H; y += BIG) {
        const px = Math.round(x) + 0.5;
        const py = Math.round(y) + 0.5;
        ctx.moveTo(px - 6, py);
        ctx.lineTo(px + 6, py);
        ctx.moveTo(px, py - 6);
        ctx.lineTo(px, py + 6);
      }
    }
    ctx.strokeStyle = 'rgba(27, 29, 35, 0.30)';
    ctx.lineWidth = 1.25;
    ctx.stroke();

    if (ctx.fillText) {
      ctx.font = '600 9px "Inter", "Helvetica Neue", ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(27, 29, 35, 0.26)';
      for (let x = bx; x < W; x += BIG) {
        for (let y = by; y < H; y += BIG) {
          const gxI = Math.round((x + cam.x - W / 2) / BIG);
          const gyI = Math.round((y + cam.y - H / 2) / BIG);
          ctx.fillText(gxI + '.' + gyI, Math.round(x) + 5, Math.round(y) + 5);
        }
      }
    }
  },

  /** 屏幕暗角（叠加在世界之上、HUD 之下，聚焦视线） */
  vignette(ctx, W, H) {
    const key = W + 'x' + H;
    if (this._vigKey !== key) {
      this._vigKey = key;
      const g = ctx.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.42, W * 0.5, H * 0.5, Math.max(W, H) * 0.78);
      g.addColorStop(0, 'rgba(70, 58, 40, 0)');
      g.addColorStop(1, 'rgba(70, 58, 40, 0.12)');
      this._vignette = g;
    }
    ctx.fillStyle = this._vignette;
    ctx.fillRect(0, 0, W, H);
  },
};
