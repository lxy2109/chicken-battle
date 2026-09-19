/**
 * Imagine 假透明棋盘格 / 纯白底 → 真 Alpha。
 * - 边缘洪水（白底 + 双灰棋盘）
 * - 闭合图形内部中性灰洞
 * - 去飞点、软边缘、残边 choke
 *
 * 用法: node tools/art/key-checkerboard.cjs [--trim 8] <png...>
 * 或:   node tools/art/key-checkerboard.cjs --dir temp/particle-src/gen
 */
const fs = require("fs");
const path = require("path");
const png = require("./png.cjs");

const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1]
];

/** 中性浅灰/白底，排除暖奶油（羽毛/米环内填）。 */
function isNeutralGray(r, g, b, avgLo = 185, avgHi = 255) {
  const avg = (r + g + b) / 3;
  if (avg < avgLo || avg > avgHi) return false;
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  if (sat > 16) return false;
  if (r - b > 14) return false;
  if (Math.abs(r - g) > 12 || Math.abs(g - b) > 12) return false;
  return true;
}

/**
 * 0 = 前景，1 = 棋盘/白底。
 * 棋盘常见 ~228 / ~246；也有纯白底板。
 */
function bgScore(r, g, b) {
  const avg = (r + g + b) / 3;
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  const warm = Math.max(0, r - b);
  if (sat > 30 || warm > 24) return 0;
  if (avg < 170) return 0;
  if (avg >= 248 && sat <= 12 && warm <= 10) return 1;
  const nearA = 1 - Math.min(1, Math.abs(avg - 228) / 42);
  const nearB = 1 - Math.min(1, Math.abs(avg - 246) / 28);
  const nearW = avg >= 250 ? 1 : avg >= 242 ? 0.85 : 0;
  const gray = Math.max(nearA, nearB, nearW);
  const satPen = sat <= 6 ? 1 : sat <= 12 ? 0.85 : sat <= 18 ? 0.45 : sat <= 24 ? 0.2 : 0;
  const warmPen = warm <= 5 ? 1 : warm <= 10 ? 0.65 : warm <= 16 ? 0.3 : 0;
  return gray * satPen * warmPen;
}

function keyCheckerboard(img, opts = {}) {
  const { width: w, height: h, data } = img;
  const n = w * h;
  const mark = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  const hard = opts.hard != null ? opts.hard : 0.42;
  const loose = opts.loose != null ? opts.loose : 0.25;
  const holeMin = opts.holeMin != null ? opts.holeMin : 48;
  const keepTop = opts.keepTop != null ? opts.keepTop : 2;
  const dustFloor = opts.dustFloor != null ? opts.dustFloor : 120;

  function tryPush(x, y, looseMode) {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (mark[i]) return;
    const d = i * 4;
    const sc = bgScore(data[d], data[d + 1], data[d + 2]);
    if (sc >= (looseMode ? loose : hard)) {
      mark[i] = 1;
      queue[tail++] = i;
    }
  }

  const band = Math.max(6, Math.floor(Math.min(w, h) * 0.03));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= band && y >= band && x < w - band && y < h - band) continue;
      tryPush(x, y, false);
    }
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % w;
    const y = (i - x) / w;
    for (const [dx, dy] of DIRS) tryPush(x + dx, y + dy, true);
  }

  // 环/星内部中性灰洞（不吃暖色奶油填色）
  if (opts.interior !== false) {
    const seen = new Uint8Array(n);
    function floodHole(sx, sy) {
      const start = sy * w + sx;
      if (seen[start] || mark[start]) return;
      const d0 = start * 4;
      if (!isNeutralGray(data[d0], data[d0 + 1], data[d0 + 2], 200, 255)) return;
      let hd = 0;
      let tl = 0;
      const q = new Int32Array(n);
      q[tl++] = start;
      seen[start] = 1;
      const cells = [];
      while (hd < tl) {
        const i = q[hd++];
        cells.push(i);
        const x = i % w;
        const y = (i - x) / w;
        for (const [dx, dy] of DIRS) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (seen[ni] || mark[ni]) continue;
          const d = ni * 4;
          if (isNeutralGray(data[d], data[d + 1], data[d + 2], 198, 255)) {
            seen[ni] = 1;
            q[tl++] = ni;
          }
        }
      }
      if (cells.length >= holeMin) {
        for (const i of cells) mark[i] = 1;
      }
    }
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) floodHole(x, y);
    }
  }

  let cleared = 0;
  for (let i = 0; i < n; i++) {
    if (!mark[i]) continue;
    data.fill(0, i * 4, i * 4 + 4);
    cleared += 1;
  }

  // 软边缘：贴透明的灰底像素降 alpha
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const d = i * 4;
      if (data[d + 3] === 0) continue;
      let nextClear = false;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || data[(ny * w + nx) * 4 + 3] === 0) {
          nextClear = true;
          break;
        }
      }
      if (!nextClear) continue;
      const sc = bgScore(data[d], data[d + 1], data[d + 2]);
      if (sc < 0.18) continue;
      const a = Math.round(255 * (1 - Math.min(1, sc * 1.2)));
      if (a < 20) {
        data.fill(0, d, d + 4);
        cleared += 1;
      } else {
        data[d + 3] = Math.min(data[d + 3], a);
      }
    }
  }

  // 去飞点
  const seen2 = new Uint8Array(n);
  const components = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const start = y * w + x;
      if (seen2[start] || data[start * 4 + 3] < 8) continue;
      let hd = 0;
      let tl = 0;
      const q = new Int32Array(n);
      q[tl++] = start;
      seen2[start] = 1;
      const cells = [];
      while (hd < tl) {
        const i = q[hd++];
        cells.push(i);
        const cx = i % w;
        const cy = (i - cx) / w;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (seen2[ni] || data[ni * 4 + 3] < 8) continue;
          seen2[ni] = 1;
          q[tl++] = ni;
        }
      }
      components.push(cells);
    }
  }
  components.sort((a, b) => b.length - a.length);
  const keepThresh = Math.max(dustFloor, Math.floor(n * 0.0005));
  for (let ci = 0; ci < components.length; ci++) {
    if (ci < keepTop) continue;
    if (components[ci].length >= keepThresh) continue;
    for (const i of components[ci]) {
      data.fill(0, i * 4, i * 4 + 4);
      cleared += 1;
    }
  }

  // 残边 choke
  const chokePasses = opts.choke != null ? opts.choke : 3;
  const chokeScore = opts.chokeScore != null ? opts.chokeScore : 0.32;
  for (let pass = 0; pass < chokePasses; pass++) {
    const kill = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const d = i * 4;
        if (data[d + 3] === 0) continue;
        if (bgScore(data[d], data[d + 1], data[d + 2]) < chokeScore) continue;
        let next0 = false;
        for (const [dx, dy] of DIRS) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || data[(ny * w + nx) * 4 + 3] === 0) {
            next0 = true;
            break;
          }
        }
        if (next0) kill.push(i);
      }
    }
    for (const i of kill) {
      data.fill(0, i * 4, i * 4 + 4);
      cleared += 1;
    }
  }

  return cleared;
}

/** 烟雾/灰体：只抠边缘连通白/棋盘，不做内部灰洞、更保守 choke。 */
function optsForName(name) {
  const n = name.toLowerCase();
  if (n.includes("smoke") || n.includes("mist") || n.includes("ash")) {
    return { interior: false, hard: 0.5, loose: 0.34, choke: 2, chokeScore: 0.45, keepTop: 3, dustFloor: 200 };
  }
  if (n.includes("feather")) {
    // 羽毛米黄本体，内部洞关紧，choke 温和
    return { interior: false, hard: 0.4, loose: 0.24, choke: 2, chokeScore: 0.4, keepTop: 1, dustFloor: 150 };
  }
  if (n.includes("glow") || n.includes("charge_ring") || n.includes("focus")) {
    // 发光环/球常带奶油填色，内部洞只清冷灰
    return { interior: true, holeMin: 200, hard: 0.4, loose: 0.24, choke: 2, chokeScore: 0.38 };
  }
  if (n.includes("star") || n.includes("ring") || n.includes("slash")) {
    return { interior: true, holeMin: 40, hard: 0.4, loose: 0.24, choke: 3, chokeScore: 0.3 };
  }
  return {};
}

function main() {
  const args = process.argv.slice(2);
  let trimPad = 8;
  let dir = "";
  const files = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--trim") trimPad = Number(args[++i] || 8);
    else if (a.startsWith("--trim=")) trimPad = Number(a.slice(7));
    else if (a === "--dir") dir = args[++i] || "";
    else if (a.startsWith("--dir=")) dir = a.slice(6);
    else files.push(a);
  }
  if (dir) {
    for (const f of fs.readdirSync(dir)) {
      if (f.toLowerCase().endsWith(".png")) files.push(path.join(dir, f));
    }
  }
  if (!files.length) {
    console.error("用法: node tools/art/key-checkerboard.cjs [--trim 8] [--dir folder] <png...>");
    process.exit(1);
  }
  for (const file of files) {
    let img = png.decode(file);
    const total = img.width * img.height;
    const base = path.basename(file, path.extname(file));
    const cleared = keyCheckerboard(img, optsForName(base));
    if (trimPad > 0) {
      const t = png.trim(img, trimPad);
      if (t) img = t;
    }
    png.encode(file, img);
    let a0 = 0;
    const n = img.width * img.height;
    for (let i = 0; i < n; i++) if (img.data[i * 4 + 3] === 0) a0 += 1;
    console.log(
      `${path.basename(file)}\t清除 ${cleared}/${total} (${(100 * cleared / total).toFixed(1)}%)` +
      `\ta0 ${(100 * a0 / n).toFixed(1)}%\t→ ${img.width}x${img.height}`
    );
  }
}

module.exports = { keyCheckerboard, bgScore, isNeutralGray, optsForName };

if (require.main === module) main();
