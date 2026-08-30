/**
 * 最小 PNG 编解码，只支持 8bit 非隔行。
 * 这台开发机没有 Python/PIL，图片处理统一走 Node。
 */
const fs = require("fs");
const zlib = require("zlib");

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
        c ^= buf[i];
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    return (c ^ 0xffffffff) >>> 0;
}

function paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
}

function unfilter(raw, width, height, bpp) {
    const stride = width * bpp;
    const out = Buffer.alloc(stride * height);
    let pos = 0;
    for (let y = 0; y < height; y++) {
        const type = raw[pos++];
        const cur = pos;
        pos += stride;
        const dst = y * stride;
        const up = dst - stride;
        for (let x = 0; x < stride; x++) {
            const v = raw[cur + x];
            const a = x >= bpp ? out[dst + x - bpp] : 0;
            const b = y > 0 ? out[up + x] : 0;
            const c = (x >= bpp && y > 0) ? out[up + x - bpp] : 0;
            let r;
            switch (type) {
                case 0: r = v; break;
                case 1: r = v + a; break;
                case 2: r = v + b; break;
                case 3: r = v + ((a + b) >> 1); break;
                case 4: r = v + paeth(a, b, c); break;
                default: throw new Error(`不支持的行过滤类型 ${type}`);
            }
            out[dst + x] = r & 255;
        }
    }
    return out;
}

/** 读 PNG，统一返回 { width, height, data } data 为 RGBA。 */
function decode(file) {
    const buf = fs.readFileSync(file);
    if (!buf.subarray(0, 8).equals(SIG)) throw new Error(`${file} 不是 PNG`);
    let pos = 8;
    let width = 0;
    let height = 0;
    let colorType = 6;
    let palette = null;
    let alpha = null;
    const idat = [];
    while (pos < buf.length) {
        const len = buf.readUInt32BE(pos);
        const type = buf.toString("ascii", pos + 4, pos + 8);
        const data = buf.subarray(pos + 8, pos + 8 + len);
        pos += 12 + len;
        if (type === "IHDR") {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            if (data[8] !== 8) throw new Error(`${file} 位深 ${data[8]} 不支持`);
            colorType = data[9];
            if (data[12] !== 0) throw new Error(`${file} 隔行 PNG 不支持`);
        }
        else if (type === "PLTE") palette = Buffer.from(data);
        else if (type === "tRNS") alpha = Buffer.from(data);
        else if (type === "IDAT") idat.push(Buffer.from(data));
        else if (type === "IEND") break;
    }
    const ch = CHANNELS[colorType];
    if (!ch) throw new Error(`${file} 颜色类型 ${colorType} 不支持`);
    const flat = unfilter(zlib.inflateSync(Buffer.concat(idat)), width, height, ch);
    const out = Buffer.alloc(width * height * 4);
    for (let i = 0, n = width * height; i < n; i++) {
        const s = i * ch;
        const d = i * 4;
        if (colorType === 6) {
            flat.copy(out, d, s, s + 4);
        }
        else if (colorType === 2) {
            out[d] = flat[s]; out[d + 1] = flat[s + 1]; out[d + 2] = flat[s + 2]; out[d + 3] = 255;
        }
        else if (colorType === 0) {
            out[d] = out[d + 1] = out[d + 2] = flat[s]; out[d + 3] = 255;
        }
        else if (colorType === 4) {
            out[d] = out[d + 1] = out[d + 2] = flat[s]; out[d + 3] = flat[s + 1];
        }
        else {
            const p = flat[s] * 3;
            out[d] = palette[p]; out[d + 1] = palette[p + 1]; out[d + 2] = palette[p + 2];
            out[d + 3] = alpha && flat[s] < alpha.length ? alpha[flat[s]] : 255;
        }
    }
    return { width, height, data: out };
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
}

/** 写 RGBA 为 PNG。 */
function encode(file, img) {
    const { width, height, data } = img;
    const stride = width * 4;
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (stride + 1)] = 0;
        data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    fs.writeFileSync(file, Buffer.concat([
        SIG,
        chunk("IHDR", ihdr),
        chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
        chunk("IEND", Buffer.alloc(0))
    ]));
}

function crop(img, x, y, w, h) {
    const out = Buffer.alloc(w * h * 4);
    for (let row = 0; row < h; row++) {
        const s = ((y + row) * img.width + x) * 4;
        img.data.copy(out, row * w * 4, s, s + w * 4);
    }
    return { width: w, height: h, data: out };
}

/** 裁掉四周全透明的边，返回新图；整张透明时返回 null。 */
function trim(img, padding = 0) {
    let x0 = img.width;
    let y0 = img.height;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
            if (img.data[(y * img.width + x) * 4 + 3] < 8) continue;
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
        }
    }
    if (x1 < 0) return null;
    x0 = Math.max(0, x0 - padding);
    y0 = Math.max(0, y0 - padding);
    x1 = Math.min(img.width - 1, x1 + padding);
    y1 = Math.min(img.height - 1, y1 + padding);
    return crop(img, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
}

/**
 * 双线性缩放。生图工具只能按固定宽高比出图，落到 UI 上的尺寸都是定死的，
 * 所以导入前统一在这里缩到位。
 */
function resize(img, w, h) {
    const out = Buffer.alloc(w * h * 4);
    const rx = img.width / w;
    const ry = img.height / h;
    for (let y = 0; y < h; y++) {
        const fy = Math.min(img.height - 1, Math.max(0, (y + 0.5) * ry - 0.5));
        const y0 = Math.floor(fy);
        const y1 = Math.min(img.height - 1, y0 + 1);
        const wy = fy - y0;
        for (let x = 0; x < w; x++) {
            const fx = Math.min(img.width - 1, Math.max(0, (x + 0.5) * rx - 0.5));
            const x0 = Math.floor(fx);
            const x1 = Math.min(img.width - 1, x0 + 1);
            const wx = fx - x0;
            const o = (y * w + x) * 4;
            const i00 = (y0 * img.width + x0) * 4;
            const i10 = (y0 * img.width + x1) * 4;
            const i01 = (y1 * img.width + x0) * 4;
            const i11 = (y1 * img.width + x1) * 4;
            for (let c = 0; c < 4; c++) {
                const top = img.data[i00 + c] + (img.data[i10 + c] - img.data[i00 + c]) * wx;
                const bot = img.data[i01 + c] + (img.data[i11 + c] - img.data[i01 + c]) * wx;
                out[o + c] = Math.round(top + (bot - top) * wy);
            }
        }
    }
    return { width: w, height: h, data: out };
}

/** 按目标宽高比居中裁一刀再缩放，避免直接拉伸把画面挤变形。 */
function fitCrop(img, w, h) {
    const want = w / h;
    const have = img.width / img.height;
    let cw = img.width;
    let ch = img.height;
    if (have > want) cw = Math.round(img.height * want);
    else ch = Math.round(img.width / want);
    const x = Math.floor((img.width - cw) / 2);
    const y = Math.floor((img.height - ch) / 2);
    return resize(crop(img, x, y, cw, ch), w, h);
}

module.exports = { decode, encode, crop, trim, resize, fitCrop };
