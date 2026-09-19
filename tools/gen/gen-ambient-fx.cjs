/**
 * 氛围粒子贴图：优先从 temp/particle-src 网上素材导入（抠色/裁切），
 * 缺源时才回退程序生成。
 *
 * 只写「独有」氛围贴图到 texture/fx/common/（与粒子共用目录，不重复存图）。
 * dust/incense/mist/ember 直接复用 particle_glow / particle_ember，本脚本不生成。
 *
 * 用法: node tools/gen-ambient-fx.cjs
 */
const fs = require("fs");
const path = require("path");
const png = require("../art/png.cjs");
const uuids = require("../art/art-uuids.cjs");

const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "assets/bundle/game/image/texture/common");
const A = path.join(ROOT, "temp/particle-src/ambient");
const W = path.join(ROOT, "temp/particle-src/web");
const FIRE = path.join(ROOT, "temp/particle-src/firespritesheet/fireb");

function tryDecode(...cands) {
  for (const p of cands) {
    if (!p || !fs.existsSync(p)) continue;
    try {
      return { img: png.decode(p), src: p };
    } catch {
      /* skip bad png */
    }
  }
  return null;
}

function knockBlack(img, hard = 12, soft = 44) {
  const { width: w, height: h, data } = img;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const r = data[o], g = data[o + 1], b = data[o + 2];
    const mx = Math.max(r, g, b);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const sat = mx - Math.min(r, g, b);
    let a;
    if (mx <= hard && lum <= hard) a = 0;
    else if (mx < soft) a = Math.round(255 * (mx - hard) / (soft - hard));
    else a = 255;
    if (sat < 12 && lum < 40) a = Math.min(a, Math.round(lum * 4));
    const oa = data[o + 3];
    if (oa < 255) a = Math.round(a * (oa / 255));
    data[o + 3] = a;
    if (a === 0) data[o] = data[o + 1] = data[o + 2] = 0;
  }
  return img;
}

/** 按四角采样背景色做色度键（leaf1 橄榄绿底）。 */
function knockBgChroma(img, hard = 22, soft = 40) {
  const { width: w, height: h, data } = img;
  const sample = (x0, y0, x1, y1) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const o = (y * w + x) * 4;
        if (data[o + 3] < 8) continue;
        r += data[o]; g += data[o + 1]; b += data[o + 2]; n++;
      }
    }
    return n ? [r / n, g / n, b / n] : [0, 0, 0];
  };
  const s = Math.max(4, Math.floor(Math.min(w, h) * 0.12));
  const c1 = sample(0, 0, s, s);
  const c2 = sample(w - s, 0, w, s);
  const c3 = sample(0, h - s, s, h);
  const c4 = sample(w - s, h - s, w, h);
  const bg = [
    (c1[0] + c2[0] + c3[0] + c4[0]) / 4,
    (c1[1] + c2[1] + c3[1] + c4[1]) / 4,
    (c1[2] + c2[2] + c3[2] + c4[2]) / 4
  ];
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const r = data[o], g = data[o + 1], b = data[o + 2];
    const dist = Math.sqrt((r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (b - bg[2]) ** 2);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const score = dist + Math.max(0, lum - 55) * 1.2;
    let a = data[o + 3];
    if (score < hard) a = 0;
    else if (score < soft) a = Math.round(a * (score - hard) / (soft - hard));
    data[o + 3] = a;
    if (a === 0) data[o] = data[o + 1] = data[o + 2] = 0;
  }
  return img;
}

/** 亮度 → alpha，RGB 填白（便于粒子染色）。 */
function toWhiteSilhouette(img) {
  const { width: w, height: h, data } = img;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const lum = Math.round(0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]);
    const a = data[o + 3] < 255 ? Math.round(lum * data[o + 3] / 255) : lum;
    data[o] = data[o + 1] = data[o + 2] = 255;
    data[o + 3] = a;
  }
  return img;
}

function pad(img, px) {
  const w = img.width + px * 2, h = img.height + px * 2;
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < img.height; y++) {
    img.data.copy(data, ((y + px) * w + px) * 4, y * img.width * 4, (y + 1) * img.width * 4);
  }
  return { width: w, height: h, data };
}

function centerFit(img, tw, th) {
  const scale = Math.min(tw / img.width, th / img.height);
  const rw = Math.max(1, Math.round(img.width * scale));
  const rh = Math.max(1, Math.round(img.height * scale));
  const resized = png.resize(img, rw, rh);
  const data = Buffer.alloc(tw * th * 4);
  const ox = Math.floor((tw - rw) / 2);
  const oy = Math.floor((th - rh) / 2);
  for (let y = 0; y < rh; y++) {
    resized.data.copy(data, ((y + oy) * tw + ox) * 4, y * rw * 4, (y + 1) * rw * 4);
  }
  return { width: tw, height: th, data };
}

function radialFall(img, power = 1.4) {
  const { width: w, height: h, data } = img;
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  const rMax = Math.min(cx, cy) || 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / rMax;
      const fall = d >= 1 ? 0 : Math.pow(1 - d, power);
      data[o + 3] = Math.round(data[o + 3] * fall);
      if (data[o + 3] < 4) data[o] = data[o + 1] = data[o + 2] = data[o + 3] = 0;
    }
  }
  return img;
}

function spriteMeta(uuid, name, w, h) {
  const hw = w / 2, hh = h / 2;
  return {
    ver: "1.0.27",
    importer: "image",
    imported: true,
    uuid,
    files: [".json", ".png"],
    subMetas: {
      "6c48a": {
        importer: "texture",
        uuid: uuid + "@6c48a",
        displayName: name,
        id: "6c48a",
        name: "texture",
        ver: "1.0.22",
        imported: true,
        files: [".json"],
        subMetas: {},
        userData: {
          wrapModeS: "clamp-to-edge",
          wrapModeT: "clamp-to-edge",
          minfilter: "linear",
          magfilter: "linear",
          mipfilter: "none",
          premultiplyAlpha: false,
          anisotropy: 1,
          isUuid: true,
          imageUuidOrDatabaseUri: uuid,
          visible: false
        }
      },
      f9941: {
        importer: "sprite-frame",
        uuid: uuid + "@f9941",
        displayName: name,
        id: "f9941",
        name: "spriteFrame",
        ver: "1.0.12",
        imported: true,
        files: [".json"],
        subMetas: {},
        userData: {
          trimType: "none",
          trimThreshold: 1,
          rotated: false,
          offsetX: 0,
          offsetY: 0,
          trimX: 0,
          trimY: 0,
          width: w,
          height: h,
          rawWidth: w,
          rawHeight: h,
          borderTop: 0,
          borderBottom: 0,
          borderLeft: 0,
          borderRight: 0,
          isUuid: true,
          imageUuidOrDatabaseUri: uuid + "@6c48a",
          atlasUuid: "",
          packable: false,
          pixelsToUnit: 100,
          pivotX: 0.5,
          pivotY: 0.5,
          meshType: 0,
          vertices: {
            rawPosition: [-hw, -hh, 0, hw, -hh, 0, -hw, hh, 0, hw, hh, 0],
            indexes: [0, 1, 2, 2, 1, 3],
            uv: [0, h, w, h, 0, 0, w, 0],
            nuv: [0, 0, 1, 0, 0, 1, 1, 1],
            minPos: [-hw, -hh, 0],
            maxPos: [hw, hh, 0]
          }
        }
      }
    },
    userData: {
      type: "sprite-frame",
      redirect: uuid + "@6c48a",
      hasAlpha: true,
      fixAlphaTransparencyArtifacts: false
    }
  };
}

function write(name, img, note) {
  const uuid = uuids[name];
  if (!uuid) throw new Error("missing uuid " + name);
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, name + ".png");
  png.encode(file, img);
  fs.writeFileSync(file + ".meta", JSON.stringify(spriteMeta(uuid, name, img.width, img.height), null, 2) + "\n");
  const solid = img.data.filter((_, i) => i % 4 === 3 && img.data[i] > 12).length;
  console.log(name, img.width + "x" + img.height, "cover%", (100 * solid / (img.width * img.height)).toFixed(1), note || "");
}

// ─── makers ─────────────────────────────────────────────────

/** 雨丝：软圆拉长成斜滴，白剪影。 */
function makeRain() {
  const hit = tryDecode(path.join(A, "blue.png"), path.join(A, "soft_circle.png"), path.join(W, "circle_particle.png"));
  if (hit) {
    let img = hit.img;
    knockBlack(img, 6, 40);
    toWhiteSilhouette(img);
    let t = png.trim(img, 2) || img;
    // 竖长雨滴
    t = png.resize(t, 18, 48);
    // 尖头：上半 alpha 再压
    for (let y = 0; y < t.height; y++) {
      const tip = y < t.height * 0.35 ? y / (t.height * 0.35) : 1;
      const tail = y > t.height * 0.75 ? (1 - (y - t.height * 0.75) / (t.height * 0.25)) : 1;
      const mul = Math.min(1, tip * 0.5 + 0.5) * Math.max(0.2, tail);
      for (let x = 0; x < t.width; x++) {
        const o = (y * t.width + x) * 4;
        t.data[o + 3] = Math.round(t.data[o + 3] * mul);
      }
    }
    return { img: centerFit(pad(t, 4), 32, 64), note: "from " + path.basename(hit.src) };
  }
  // fallback
  const img = { width: 32, height: 64, data: Buffer.alloc(32 * 64 * 4) };
  for (let y = 4; y < 60; y++) {
    const t = (y - 4) / 56;
    const half = 1.2 + (1 - t) * 2.2;
    const a = Math.round(230 * (t < 0.15 ? t / 0.15 : t > 0.85 ? (1 - t) / 0.15 : 1));
    for (let x = 0; x < 32; x++) {
      const d = Math.abs(x - 16) / half;
      if (d > 1) continue;
      const o = (y * 32 + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = Math.round(a * (1 - d));
    }
  }
  return { img, note: "procedural" };
}

/** 落叶：Phaser leaf1 色度键抠底。 */
function makeLeaf() {
  const hit = tryDecode(path.join(A, "leaf1.png"), path.join(A, "leaf_final.png"));
  if (hit) {
    let img = hit.img;
    knockBgChroma(img, 22, 40);
    let t = png.trim(img, 4) || img;
    return { img: centerFit(pad(t, 4), 64, 64), note: "from " + path.basename(hit.src) };
  }
  return null;
}

/** 扬尘：软烟白剪影。 */
function makeDust() {
  const hit = tryDecode(
    path.join(A, "white_smoke.png"),
    path.join(A, "soft_circle.png"),
    path.join(W, "confetti.png"),
    path.join(W, "circle_particle.png")
  );
  if (hit) {
    let img = hit.img;
    knockBlack(img, 8, 36);
    toWhiteSilhouette(img);
    let t = png.trim(img, 2) || img;
    t = centerFit(pad(t, 2), 48, 48);
    radialFall(t, 1.5);
    return { img: t, note: "from " + path.basename(hit.src) };
  }
  return null;
}

/** 谷粒：玻璃碎屑白剪影。 */
function makeGrain() {
  const hit = tryDecode(path.join(A, "glass.png"), path.join(A, "soft_circle.png"));
  if (hit) {
    let img = hit.img;
    knockBlack(img, 10, 40);
    toWhiteSilhouette(img);
    let t = png.trim(img, 1) || img;
    return { img: centerFit(pad(t, 2), 32, 32), note: "from " + path.basename(hit.src) };
  }
  return null;
}

/** 香烟：大软烟。 */
function makeIncense() {
  const hit = tryDecode(
    path.join(A, "white_smoke.png"),
    path.join(A, "fog_puff.png"),
    path.join(W, "confetti.png")
  );
  if (hit) {
    let img = hit.img;
    knockBlack(img, 6, 32);
    toWhiteSilhouette(img);
    let t = png.trim(img, 2) || img;
    t = centerFit(pad(t, 4), 64, 64);
    radialFall(t, 1.2);
    return { img: t, note: "from " + path.basename(hit.src) };
  }
  return null;
}

/** 余烬：写实火帧亮核。 */
function makeEmber() {
  const hit = tryDecode(path.join(FIRE, "fireB0020.png"), path.join(FIRE, "fireB0015.png"));
  if (hit) {
    let img = hit.img;
    knockBlack(img, 14, 48);
    let t = png.trim(img, 1) || img;
    const side = Math.min(t.width, t.height);
    t = png.crop(t, Math.floor((t.width - side) / 2), Math.floor((t.height - side) / 2), side, side);
    t = png.resize(t, 40, 40);
    radialFall(t, 1.35);
    return { img: t, note: "from " + path.basename(hit.src) };
  }
  // 复用 particle_ember 若已生成
  const pe = path.join(OUT, "particle_ember.png");
  if (fs.existsSync(pe)) {
    return { img: png.decode(pe), note: "copy particle_ember" };
  }
  return null;
}

/** 灰烬：雪花白剪影缩小。 */
function makeAsh() {
  const hit = tryDecode(path.join(A, "snow.png"), path.join(A, "soft_circle.png"));
  if (hit) {
    let img = hit.img;
    knockBlack(img, 8, 36);
    toWhiteSilhouette(img);
    let t = png.trim(img, 1) || img;
    return { img: centerFit(pad(t, 2), 32, 32), note: "from " + path.basename(hit.src) };
  }
  return null;
}

/** 雾：大软烟白剪影（不用 3D 地板 fog 图）。 */
function makeMist() {
  const hit = tryDecode(
    path.join(A, "white_smoke.png"),
    path.join(A, "soft_circle.png"),
    path.join(W, "confetti.png"),
    path.join(W, "circle_particle.png")
  );
  if (hit) {
    let img = hit.img;
    knockBlack(img, 6, 36);
    toWhiteSilhouette(img);
    let t = png.trim(img, 2) || img;
    t = centerFit(pad(t, 8), 96, 96);
    radialFall(t, 1.1);
    return { img: t, note: "from " + path.basename(hit.src) };
  }
  return null;
}

function blank(w, h) {
  return { width: w, height: h, data: Buffer.alloc(w * h * 4) };
}
function softDisk(img, cx, cy, rx, ry, a0) {
  for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(img.height - 1, Math.ceil(cy + ry)); y++) {
    for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(img.width - 1, Math.ceil(cx + rx)); x++) {
      const nx = (x - cx) / Math.max(0.001, rx);
      const ny = (y - cy) / Math.max(0.001, ry);
      const d = Math.sqrt(nx * nx + ny * ny);
      if (d > 1) continue;
      const o = (y * img.width + x) * 4;
      const a = Math.round(a0 * Math.pow(1 - d, 1.5));
      if (a <= img.data[o + 3]) continue;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = a;
    }
  }
}

function fallback(name) {
  if (name === "ambient_leaf") {
    const img = blank(48, 48);
    softDisk(img, 24, 24, 18, 10, 230);
    return img;
  }
  if (name === "ambient_dust" || name === "ambient_ember") {
    const img = blank(32, 32);
    softDisk(img, 16, 16, 12, 12, 200);
    softDisk(img, 16, 16, 5, 5, 255);
    return img;
  }
  if (name === "ambient_grain" || name === "ambient_ash") {
    const img = blank(24, 24);
    softDisk(img, 12, 12, 8, 8, 220);
    return img;
  }
  if (name === "ambient_incense" || name === "ambient_mist") {
    const img = blank(64, 64);
    softDisk(img, 32, 32, 28, 22, 120);
    return img;
  }
  return blank(32, 32);
}

// 只生成独有形状；软光/余烬走 common 里已有的 particle_glow / particle_ember
const JOBS = [
  ["ambient_rain", makeRain],
  ["ambient_leaf", makeLeaf],
  ["ambient_grain", makeGrain],
  ["ambient_ash", makeAsh]
];

for (const [name, fn] of JOBS) {
  let result = fn();
  if (!result || !result.img) {
    write(name, fallback(name), "fallback procedural");
  } else {
    write(name, result.img, result.note);
  }
}
console.log("unique ambient textures ->", OUT);
console.log("shared: dust/incense/mist -> particle_glow, ember -> particle_ember");
