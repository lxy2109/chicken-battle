/**
 * 把 Imagine 生图（temp/particle-src/gen/*.png）抠黑、居中、缩放到
 * texture/fx/common 与 stamp。不做算法画图，只做抠图与尺寸适配。
 *
 * 生图来源：会话 images → temp/particle-src/gen（先 JPG 转 PNG）
 * 用法: node tools/import-gen-fx.cjs
 */
const fs = require("fs");
const path = require("path");
const png = require('../art/png.cjs');
const uuids = require('../art/art-uuids.cjs');

const ROOT = path.resolve(__dirname, '../..');
const GEN = path.join(ROOT, "temp/particle-src/gen");
const OUT_P = path.join(ROOT, "assets/bundle/game/image/texture/common");
const STAMP = path.join(ROOT, "assets/bundle/game/image/texture/stamp");

function knockBlack(img, hard = 12, soft = 42) {
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
    // 低饱和暗灰晕也压掉
    if (sat < 10 && lum < 36) a = Math.min(a, Math.round(lum * 5));
    const oa = data[o + 3];
    if (oa < 255) a = Math.round(a * (oa / 255));
    data[o + 3] = a;
    if (a === 0) data[o] = data[o + 1] = data[o + 2] = 0;
  }
  return img;
}

/** 白/浅色剪影：亮度→alpha，RGB 填白（羽/星/光便于着色）。 */
function toWhiteSilhouette(img, floor = 8) {
  const { width: w, height: h, data } = img;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const lum = Math.round(0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]);
    let a = data[o + 3] < 255 ? Math.round(lum * data[o + 3] / 255) : lum;
    if (a < floor) a = 0;
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

function centerFit(img, tw, th, fill = 0.9) {
  const scale = Math.min(tw / img.width, th / img.height) * fill;
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

function centerOnAlpha(img, tw, th, fill = 0.9) {
  let sx = 0, sy = 0, sw = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const a = img.data[(y * img.width + x) * 4 + 3];
      if (a < 8) continue;
      sx += x * a;
      sy += y * a;
      sw += a;
    }
  }
  const cx = sw > 0 ? sx / sw : img.width / 2;
  const cy = sw > 0 ? sy / sw : img.height / 2;
  const scale = Math.min(tw / img.width, th / img.height) * fill;
  const rw = Math.max(1, Math.round(img.width * scale));
  const rh = Math.max(1, Math.round(img.height * scale));
  const resized = png.resize(img, rw, rh);
  // 质心也按 scale 映射
  const ncx = cx * scale;
  const ncy = cy * scale;
  const data = Buffer.alloc(tw * th * 4);
  const ox = Math.round(tw / 2 - ncx);
  const oy = Math.round(th / 2 - ncy);
  for (let y = 0; y < rh; y++) {
    const dy = y + oy;
    if (dy < 0 || dy >= th) continue;
    for (let x = 0; x < rw; x++) {
      const dx = x + ox;
      if (dx < 0 || dx >= tw) continue;
      const s = (y * rw + x) * 4;
      const d = (dy * tw + dx) * 4;
      data[d] = resized.data[s];
      data[d + 1] = resized.data[s + 1];
      data[d + 2] = resized.data[s + 2];
      data[d + 3] = resized.data[s + 3];
    }
  }
  return { width: tw, height: th, data };
}

function loadGen(name) {
  const file = path.join(GEN, name + ".png");
  if (!fs.existsSync(file)) throw new Error("missing gen art " + file + " — place Imagine PNG here");
  return png.decode(file);
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

function resolveUuid(outDir, name) {
  if (uuids[name]) return uuids[name];
  const metaPath = path.join(outDir, name + ".png.meta");
  if (fs.existsSync(metaPath)) {
    try {
      const m = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      if (m.uuid) return m.uuid;
    } catch (_) { /* ignore */ }
  }
  throw new Error("missing uuid " + name);
}

function write(outDir, name, img) {
  const uuid = resolveUuid(outDir, name);
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, name + ".png");
  png.encode(file, img);
  fs.writeFileSync(file + ".meta", JSON.stringify(spriteMeta(uuid, name, img.width, img.height), null, 2) + "\n");
  const solid = img.data.filter((_, i) => i % 4 === 3 && img.data[i] > 12).length;
  console.log(name, img.width + "x" + img.height, "cover%", (100 * solid / (img.width * img.height)).toFixed(1));
}

function processColor(name, tw, th, hard, soft, fill) {
  let img = loadGen(name);
  knockBlack(img, hard, soft);
  let t = png.trim(img, 3) || img;
  t = pad(t, 4);
  return centerOnAlpha(t, tw, th, fill);
}

function processSilhouette(name, tw, th, hard, soft, fill) {
  let img = loadGen(name);
  knockBlack(img, hard, soft);
  toWhiteSilhouette(img);
  let t = png.trim(img, 2) || img;
  t = pad(t, 3);
  return centerOnAlpha(t, tw, th, fill);
}

/**
 * 羽毛可染色：亮部近白（乘 startColor），深描边保留深棕。
 */
function processFeatherTintable(name, tw, th) {
  let img = loadGen(name);
  knockBlack(img, 8, 28);
  const { width: w, height: h, data } = img;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (data[o + 3] < 8) continue;
    const r = data[o], g = data[o + 1], b = data[o + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum < 90) {
      data[o] = Math.min(r, 70);
      data[o + 1] = Math.min(g, 50);
      data[o + 2] = Math.min(b, 40);
      continue;
    }
    const t = Math.min(1, (lum - 90) / 120);
    const v = Math.round(200 + 55 * t);
    data[o] = data[o + 1] = data[o + 2] = v;
  }
  let trimmed = png.trim(img, 2) || img;
  trimmed = pad(trimmed, 3);
  return centerOnAlpha(trimmed, tw, th, 0.88);
}

// ── 描边卡通风：保留棕描边与平涂，不做白剪影 ──────────────
fs.mkdirSync(OUT_P, { recursive: true });
fs.mkdirSync(STAMP, { recursive: true });

write(OUT_P, "particle_flame", processColor("particle_flame", 80, 112, 8, 28, 0.9));
write(OUT_P, "particle_ember", processColor("particle_ember", 40, 40, 8, 28, 0.82));
write(OUT_P, "particle_spark", processColor("particle_spark", 32, 32, 8, 28, 0.85));
write(OUT_P, "particle_blood", processColor("particle_blood", 36, 48, 8, 26, 0.9));
write(OUT_P, "particle_blood_splash", processColor("particle_blood_splash", 72, 72, 8, 26, 0.85));
write(OUT_P, "particle_star", processColor("particle_star", 48, 48, 8, 28, 0.88));
write(OUT_P, "particle_glow", processColor("particle_glow", 56, 56, 8, 28, 0.88));
write(OUT_P, "particle_slash", processColor("particle_slash", 128, 48, 8, 28, 0.9));
write(OUT_P, "particle_feather", processFeatherTintable("particle_feather", 48, 48));
write(OUT_P, "particle_confetti", processColor("particle_confetti", 32, 28, 8, 28, 0.88));
write(STAMP, "cartoon_blood_splash", processColor("cartoon_blood_splash", 96, 56, 8, 26, 0.9));
write(STAMP, "cartoon_feather", processFeatherTintable("particle_feather", 64, 64));

console.log("import-gen-fx done (outlined cartoon) ->", OUT_P);
