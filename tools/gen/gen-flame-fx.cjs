/**
 * 生图小贴图导入：边条 flame_edge + 角块 flame_corner + 噪声 flame_noise。
 * 输入 temp/flame-gen：7.png 边条、6.png 角、3.png 噪声。
 */
const fs = require("fs");
const path = require("path");
const png = require("../art/png.cjs");
const uuids = require("../art/art-uuids.cjs");

const ROOT = path.resolve(__dirname, "../..");
const SRC = path.join(ROOT, "temp/flame-gen");
const OUT = path.join(ROOT, "assets/bundle/game/image/texture/common");

function knockBlack(img, hard = 18, soft = 44) {
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
    if (sat < 10 && lum < 36) a = Math.min(a, Math.round(lum * 5));
    data[o + 3] = a;
    if (a === 0) data[o] = data[o + 1] = data[o + 2] = 0;
  }
  return img;
}

function toGrayNoise(img) {
  const { width: w, height: h, data } = img;
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const lum = Math.round(0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]);
    out[o] = out[o + 1] = out[o + 2] = lum;
    out[o + 3] = 255;
  }
  return { width: w, height: h, data: out };
}

/** 水平无缝：左右 12% 交叉淡入，平铺时不露黑缝。 */
function makeSeamlessX(img, blend = 0.12) {
  const { width: w, height: h, data } = img;
  const bw = Math.max(4, Math.round(w * blend));
  const out = Buffer.from(data);
  for (let y = 0; y < h; y++) {
    for (let i = 0; i < bw; i++) {
      const t = i / bw;
      const xL = i;
      const xR = w - bw + i;
      const oL = (y * w + xL) * 4;
      const oR = (y * w + xR) * 4;
      // 左缘混入右缘，右缘混入左缘
      for (const [oA, oB, k] of [[oL, oR, t], [oR, oL, 1 - t]]) {
        for (let c = 0; c < 4; c++) {
          out[oA + c] = Math.round(data[oA + c] * (1 - k * 0.5) + data[oB + c] * (k * 0.5));
        }
      }
    }
  }
  return { width: w, height: h, data: out };
}

/** 底边实火基：最下几行补满暖色，矩形外缘不断开。 */
function solidBase(img, rows = 6) {
  const { width: w, height: h, data } = img;
  const out = Buffer.from(data);
  for (let y = h - rows; y < h; y++) {
    const fall = (y - (h - rows) + 1) / rows;
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const a = out[o + 3];
      const want = Math.round(210 + 45 * fall);
      if (a < want) {
        // 取邻行有色像素作色
        let sr = 255, sg = 120, sb = 30, sa = 0;
        for (let dy = 1; dy < 12 && y - dy >= 0; dy++) {
          const p = ((y - dy) * w + x) * 4;
          if (data[p + 3] > 40) {
            sr = data[p]; sg = data[p + 1]; sb = data[p + 2]; sa = data[p + 3];
            break;
          }
        }
        if (sa < 40) { sr = 255; sg = 140; sb = 40; }
        out[o] = sr; out[o + 1] = sg; out[o + 2] = sb;
        out[o + 3] = want;
      }
    }
  }
  return { width: w, height: h, data: out };
}

/** 边条：火在底部、尖朝上；左右无缝 + 底边实线。 */
function processEdge(file, tw, th) {
  let img = png.decode(file);
  knockBlack(img);
  const { width: w, height: h, data } = img;
  let y0 = h, y1 = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 20) {
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (y1 < y0) throw new Error("edge empty");
  y0 = Math.max(0, y0 - 4);
  y1 = Math.min(h - 1, y1 + 2);
  img = png.crop(img, 0, y0, w, y1 - y0 + 1);
  img = png.resize(img, tw, th);
  img = makeSeamlessX(img, 0.14);
  img = solidBase(img, 8);
  return img;
}

/**
 * 角块：L 在左下。外缘（左、下）贴实画布边，避免四角露缝。
 */
function processCorner(file, size) {
  let img = png.decode(file);
  knockBlack(img);
  const t = png.trim(img, 2);
  if (!t) throw new Error("corner empty");
  // 略放大再裁，让 L 更贴边
  const scaled = png.resize(t, size + 4, size + 4);
  // 找有色包围，推到左下
  let minx = scaled.width, maxx = 0, miny = scaled.height, maxy = 0;
  for (let y = 0; y < scaled.height; y++) {
    for (let x = 0; x < scaled.width; x++) {
      if (scaled.data[(y * scaled.width + x) * 4 + 3] > 24) {
        if (x < minx) minx = x;
        if (x > maxx) maxx = x;
        if (y < miny) miny = y;
        if (y > maxy) maxy = y;
      }
    }
  }
  const bw = Math.max(1, maxx - minx + 1);
  const bh = Math.max(1, maxy - miny + 1);
  const cropped = png.crop(scaled, minx, miny, bw, bh);
  const fitted = png.resize(cropped, size, size);
  const out = Buffer.alloc(size * size * 4);
  for (let i = 0; i < out.length; i++) out[i] = fitted.data[i];

  // 外缘实线：左 3 列 + 底 3 行，把半透明补实
  const fillEdge = (x, y) => {
    const o = (y * size + x) * 4;
    if (out[o + 3] >= 200) return;
    let sr = 255, sg = 110, sb = 30, best = 0;
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
        const p = (yy * size + xx) * 4;
        if (out[p + 3] > best) {
          best = out[p + 3];
          sr = out[p]; sg = out[p + 1]; sb = out[p + 2];
        }
      }
    }
    out[o] = sr; out[o + 1] = sg; out[o + 2] = sb;
    out[o + 3] = Math.max(out[o + 3], 220);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < 3; x++) fillEdge(x, y);
  }
  for (let y = size - 3; y < size; y++) {
    for (let x = 0; x < size; x++) fillEdge(x, y);
  }
  // 左下角 1/2 扇区保证 L 不断
  for (let y = Math.floor(size * 0.45); y < size; y++) {
    for (let x = 0; x < Math.floor(size * 0.45); x++) {
      const o = (y * size + x) * 4;
      if (out[o + 3] < 30) continue;
      if (out[o + 3] < 120) out[o + 3] = Math.min(255, out[o + 3] + 80);
    }
  }
  return { width: size, height: size, data: out };
}

function spriteMeta(uuid, name, w, h, wrapS, wrapT) {
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
          wrapModeS: wrapS,
          wrapModeT: wrapT,
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

function write(name, img, wrapS, wrapT) {
  const uuid = uuids[name];
  if (!uuid) throw new Error("missing uuid " + name);
  const file = path.join(OUT, name + ".png");
  png.encode(file, img);
  fs.writeFileSync(file + ".meta", JSON.stringify(spriteMeta(uuid, name, img.width, img.height, wrapS, wrapT), null, 2) + "\n");
  const solid = img.data.filter((_, i) => i % 4 === 3 && img.data[i] > 12).length;
  console.log(name, img.width + "x" + img.height, "cover%", (100 * solid / (img.width * img.height)).toFixed(1), uuid);
}

fs.mkdirSync(OUT, { recursive: true });

const edgeSrc = fs.existsSync(path.join(SRC, "7.png")) ? "7.png" : "2.png";
write("flame_edge", processEdge(path.join(SRC, edgeSrc), 256, 96), "repeat", "clamp-to-edge");
write("flame_corner", processCorner(path.join(SRC, "6.png"), 128), "clamp-to-edge", "clamp-to-edge");

let noise = toGrayNoise(png.decode(path.join(SRC, "3.png")));
noise = png.resize(noise, 128, 128);
write("flame_noise", noise, "repeat", "repeat");

console.log("small flame tiles imported from", edgeSrc);
