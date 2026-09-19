/**
 * 把 Imagine 生图（temp/particle-src/gen/*.png，已抠真 Alpha）
 * 居中缩放到 texture/fx/common 与 stamp。
 *
 * 前置：node tools/art/knock-alpha.cjs --via-magenta --trim 8 temp/particle-src/gen/*.png
 * 用法: node tools/import/import-gen-fx.cjs
 */
const fs = require("fs");
const path = require("path");
const png = require("../art/png.cjs");
const uuids = require("../art/art-uuids.cjs");

const ROOT = path.resolve(__dirname, "../..");
const GEN = path.join(ROOT, "temp/particle-src/gen");
const OUT_P = path.join(ROOT, "assets/bundle/game/image/texture/common");
const STAMP = path.join(ROOT, "assets/bundle/game/image/texture/stamp");

function pad(img, px) {
  const w = img.width + px * 2, h = img.height + px * 2;
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < img.height; y++) {
    img.data.copy(data, ((y + px) * w + px) * 4, y * img.width * 4, (y + 1) * img.width * 4);
  }
  return { width: w, height: h, data };
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
  const img = png.decode(file);
  const n = img.width * img.height;
  let a0 = 0;
  for (let i = 0; i < n; i++) if (img.data[i * 4 + 3] === 0) a0++;
  if (a0 / n < 0.05) {
    throw new Error(name + " looks opaque (a0=" + (100 * a0 / n).toFixed(1) + "%). Run knock-alpha --via-magenta first.");
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

/** 缩放到小尺寸后清掉半透明灰边与孤立噪点。 */
function cleanScaled(img) {
  const { width: w, height: h, data } = img;
  const D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // 贴透明的近白/近灰像素直接清掉
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (data[o + 3] < 8) continue;
      const r = data[o], g = data[o + 1], b = data[o + 2];
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      const avg = (r + g + b) / 3;
      const coolGray = sat <= 18 && avg >= 190 && (r - b) <= 12;
      if (!coolGray && data[o + 3] >= 40) continue;
      let next0 = false;
      for (const [dx, dy] of D) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || data[(ny * w + nx) * 4 + 3] < 8) {
          next0 = true;
          break;
        }
      }
      if (!next0) continue;
      if (coolGray || data[o + 3] < 48) data.fill(0, o, o + 4);
    }
  }
  // 去掉极小连通块
  const seen = new Uint8Array(w * h);
  const comps = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = y * w + x;
      if (seen[s] || data[s * 4 + 3] < 8) continue;
      const cells = [];
      const q = [s];
      seen[s] = 1;
      while (q.length) {
        const i = q.pop();
        cells.push(i);
        const cx = i % w, cy = (i - cx) / w;
        for (const [dx, dy] of D) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (seen[ni] || data[ni * 4 + 3] < 8) continue;
          seen[ni] = 1;
          q.push(ni);
        }
      }
      comps.push(cells);
    }
  }
  comps.sort((a, b) => b.length - a.length);
  const floor = Math.max(6, Math.floor(w * h * 0.002));
  for (let i = 0; i < comps.length; i++) {
    if (i < 2) continue;
    if (comps[i].length >= floor) continue;
    for (const p of comps[i]) data.fill(0, p * 4, p * 4 + 4);
  }
  return img;
}

/** 已抠 Alpha 的描边卡通风：只裁切居中，不敲黑（保留棕/黑描边）。 */
function processKeyed(name, tw, th, fill = 0.9) {
  let img = loadGen(name);
  let t = png.trim(img, 3) || img;
  t = pad(t, 4);
  return cleanScaled(centerOnAlpha(t, tw, th, fill));
}

/**
 * 羽毛可染色底板：深描边压实，羽面近白灰阶便于 × 鸡翅膀色。
 * 高分辨率输出，不做 cleanScaled（会啃掉羽脉/缺口）。
 */
function processFeatherTintable(srcName, tw, th) {
  let img = loadGen(srcName);
  const { width: w, height: h, data } = img;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const a = data[o + 3];
    if (a < 10) {
      data.fill(0, o, o + 4);
      continue;
    }
    const r = data[o], g = data[o + 1], b = data[o + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const sat = mx - mn;
    // 描边 / 羽轴：偏深棕，乘色后轮廓仍清楚
    const outline = lum < 100 || (r > g + 8 && r > b + 8 && lum < 155 && sat > 12);
    if (outline) {
      const k = Math.max(0.45, Math.min(1, lum / 110));
      data[o] = Math.round(48 * k);
      data[o + 1] = Math.round(32 * k);
      data[o + 2] = Math.round(20 * k);
      data[o + 3] = Math.max(a, 230);
      continue;
    }
    // 羽面灰阶：暗脉 ~170、亮面 ~252，染色后仍有体积感
    const shade = Math.max(0, Math.min(1, (lum - 95) / 140));
    const v = Math.round(170 + shade * 82);
    data[o] = v;
    data[o + 1] = v;
    data[o + 2] = Math.min(255, v - 1);
    data[o + 3] = a < 28 ? 0 : Math.max(a, 210);
  }
  let trimmed = png.trim(img, 2) || img;
  trimmed = pad(trimmed, 8);
  return centerOnAlpha(trimmed, tw, th, 0.94);
}

fs.mkdirSync(OUT_P, { recursive: true });
fs.mkdirSync(STAMP, { recursive: true });

// ── common 粒子单图（ParticleSystem2D 大量发射） ──────────────
write(OUT_P, "particle_flame", processKeyed("particle_flame", 80, 112, 0.9));
write(OUT_P, "particle_ember", processKeyed("particle_ember", 40, 40, 0.82));
write(OUT_P, "particle_spark", processKeyed("particle_spark", 32, 32, 0.85));
write(OUT_P, "particle_blood", processKeyed("particle_blood", 36, 48, 0.9));
write(OUT_P, "particle_blood_splash", processKeyed("particle_blood_splash", 72, 72, 0.85));
write(OUT_P, "particle_star", processKeyed("particle_star", 48, 48, 0.88));
write(OUT_P, "particle_glow", processKeyed("particle_glow", 56, 56, 0.88));
write(OUT_P, "particle_slash", processKeyed("particle_slash", 128, 96, 0.92));
// 羽毛单独抬分辨率：粒子 128、落地 stamp 160，羽脉在局内才不糊
write(OUT_P, "particle_feather", processFeatherTintable("particle_feather", 128, 128));
write(OUT_P, "particle_confetti", processKeyed("particle_confetti", 32, 28, 0.88));
write(OUT_P, "particle_heal", processKeyed("particle_heal", 40, 40, 0.88));
write(OUT_P, "particle_smoke", processKeyed("particle_smoke", 48, 48, 0.86));

// ── stamp：场地爆发 / 绝招场上用 ─────────────────────────────
write(STAMP, "comic_slash", processKeyed("comic_slash", 128, 128, 0.9));
write(STAMP, "comic_star", processKeyed("comic_star", 128, 128, 0.88));
write(STAMP, "shock_ring", processKeyed("shock_ring", 128, 128, 0.9));
write(STAMP, "speed_line", processKeyed("speed_line", 128, 48, 0.92));
write(STAMP, "focus_burst", processKeyed("focus_burst", 128, 128, 0.88));
write(STAMP, "ground_crack", processKeyed("ground_crack", 128, 128, 0.9));
write(STAMP, "ink_burst", processKeyed("ink_burst", 128, 128, 0.88));
write(STAMP, "charge_ring", processKeyed("charge_ring", 128, 128, 0.9));
write(STAMP, "cartoon_blood_splash", processKeyed("cartoon_blood_splash", 96, 56, 0.9));
write(STAMP, "cartoon_feather", processFeatherTintable("particle_feather", 160, 160));

console.log("import-gen-fx done (keyed cartoon) ->", OUT_P, STAMP);
