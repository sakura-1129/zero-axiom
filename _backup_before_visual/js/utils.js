'use strict';

/* ══════════════ 数学 ══════════════ */
const TAU = Math.PI * 2;

function rand(a, b) {
  if (b === undefined) { b = a; a = 0; }
  return a + Math.random() * (b - a);
}

function randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }

function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

function lerp(a, b, t) { return a + (b - a) * t; }

function distSq(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}

/* ══════════════ 数字格式 ══════════════ */
function fmt(n) {
  if (!isFinite(n)) return '0';
  n = Math.max(0, n);
  if (n < 1000) {
    if (n < 10 && Math.abs(n - Math.round(n)) > 0.05) return n.toFixed(1);
    return String(Math.round(n));
  }
  if (n < 1e6) {
    const v = n / 1000;
    return (v < 10 ? v.toFixed(1) : String(Math.round(v))) + 'k';
  }
  if (n < 1e9) {
    const v = n / 1e6;
    return (v < 10 ? v.toFixed(1) : String(Math.round(v))) + 'M';
  }
  return (n / 1e9).toFixed(1) + 'B';
}

function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

/* ══════════════ 颜色 ══════════════ */
const _rgbCache = new Map();

function hexToRgb(hex) {
  let c = _rgbCache.get(hex);
  if (c) return c;
  if (hex.charCodeAt(0) === 114) { // 'r' → 已经是 rgb(...) 形式
    const m = hex.match(/-?\d+/g) || [0, 0, 0];
    c = [parseInt(m[0], 10), parseInt(m[1], 10), parseInt(m[2], 10)];
  } else {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const num = parseInt(h, 16);
    c = [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }
  _rgbCache.set(hex, c);
  return c;
}

function rgba(hex, a) {
  const c = hexToRgb(hex);
  return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
}

/** amt > 0 变亮，amt < 0 变暗（-1 ~ 1） */
function shade(hex, amt) {
  const c = hexToRgb(hex);
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  const r = Math.round((t - c[0]) * p + c[0]);
  const g = Math.round((t - c[1]) * p + c[1]);
  const b = Math.round((t - c[2]) * p + c[2]);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

/* ══════════════ 随机权重 ══════════════ */
function weightedPick(list, weightOf) {
  let total = 0;
  for (const it of list) total += Math.max(0, weightOf(it));
  if (total <= 0) return list[0];
  let r = Math.random() * total;
  for (const it of list) {
    r -= Math.max(0, weightOf(it));
    if (r <= 0) return it;
  }
  return list[list.length - 1];
}

/* ══════════════ 数组原地压缩 ══════════════ */
function compact(arr) {
  let w = 0;
  for (let i = 0; i < arr.length; i++) {
    if (!arr[i].dead) arr[w++] = arr[i];
  }
  arr.length = w;
}
