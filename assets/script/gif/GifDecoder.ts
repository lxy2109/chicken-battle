import { Asset, BufferAsset, assetManager } from "cc";

export interface GifPatch {
    delay: number;
    disposal: number;
    left: number;
    top: number;
    width: number;
    height: number;
    transparent: number;
    palette: number[][];
    pixels: Uint8Array;
}

export interface GifMovie {
    width: number;
    height: number;
    frames: GifPatch[];
}

type GifJob = {
    promise: Promise<GifMovie>;
    movie: GifMovie | null;
    listeners: Array<(movie: GifMovie, index: number) => void>;
};

const jobs = new Map<string, GifJob>();
const byteJobs = new Map<string, Promise<Uint8Array | null>>();

export function isGifBytes(bytes: Uint8Array | null | undefined): bytes is Uint8Array {
    return !!bytes && bytes.length >= 14 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46;
}

/**
 * 按二进制读套装 GIF。不要走 assetManager.load：引擎把 .gif 当图片解，
 * 安卓原生上 5～12MB 动图经常解失败或极慢，结算就只剩立绘。
 */
export function loadGifBytes(bundleName: string, path: string): Promise<Uint8Array | null> {
    const key = `${bundleName}:${path.replace(/\.gif$/i, "")}`;
    const hit = byteJobs.get(key);
    if (hit) return hit;
    const job = readGifFromBundle(bundleName, path).then(bytes => {
        if (!isGifBytes(bytes)) {
            byteJobs.delete(key);
            return null;
        }
        return bytes;
    }, err => {
        console.warn("[SuitGif] 读取失败", path, err);
        byteJobs.delete(key);
        return null;
    });
    byteJobs.set(key, job);
    return job;
}

/** 同一份 GIF 只解一次；多个界面可以同时听首帧。 */
export function watchGif(
    key: string,
    bytes: Uint8Array,
    onFrame: (movie: GifMovie, index: number) => void,
    cancelled?: () => boolean
): Promise<GifMovie> {
    const hit = jobs.get(key);
    if (hit) {
        if (hit.movie?.frames.length) onFrame(hit.movie, 0);
        hit.listeners.push(onFrame);
        return hit.promise;
    }
    const job: GifJob = { promise: undefined as unknown as Promise<GifMovie>, movie: null, listeners: [onFrame] };
    job.promise = decodeGif(bytes, (movie, index) => {
        job.movie = movie;
        for (const listener of job.listeners) {
            if (listener === onFrame && cancelled?.()) continue;
            listener(movie, index);
        }
    });
    jobs.set(key, job);
    job.promise.then(() => { /* 解完留在缓存里 */ }, () => jobs.delete(key));
    return job.promise;
}

export async function readGifBytes(asset: Asset): Promise<Uint8Array | null> {
    if (asset instanceof BufferAsset) {
        const data = asset.buffer();
        return data ? new Uint8Array(data) : null;
    }
    const native = (asset as Asset & { _nativeAsset?: unknown })._nativeAsset;
    const fromNative = toBytes(native);
    if (fromNative) return fromNative;
    const url = asset.nativeUrl;
    if (!url) return null;
    const fromFile = readLocalBytes(url);
    if (fromFile) return fromFile;
    try {
        if (typeof fetch === "function") {
            const res = await fetch(url);
            if (res.ok) return new Uint8Array(await res.arrayBuffer());
        }
    }
    catch { /* 原生包 nativeUrl 不一定能 fetch */ }
    return downloadBytes(url);
}

export function decodeGif(bytes: Uint8Array, onFrame?: (movie: GifMovie, index: number) => void, cancelled?: () => boolean): Promise<GifMovie> {
    return new Promise((resolve, reject) => {
        try {
            parseGif(bytes, onFrame, cancelled, resolve, reject);
        }
        catch (err) {
            reject(err);
        }
    });
}

function parseGif(
    bytes: Uint8Array,
    onFrame: ((movie: GifMovie, index: number) => void) | undefined,
    cancelled: (() => boolean) | undefined,
    resolve: (movie: GifMovie) => void,
    reject: (err: unknown) => void
) {
    const st = new ByteStream(bytes);
    const sig = st.readString(3);
    const ver = st.readString(3);
    if (sig !== "GIF" || (ver !== "87a" && ver !== "89a")) {
        reject(new Error("Not a GIF file"));
        return;
    }
    const movie: GifMovie = { width: st.readUnsigned(), height: st.readUnsigned(), frames: [] };
    const packed = st.readByte();
    const gctFlag = packed & 0x80;
    const gctSize = packed & 0x07;
    st.readByte();
    st.readByte();
    const gct = gctFlag ? st.readPalette(1 << (gctSize + 1)) : [];
    let delay = 0.1;
    let disposal = 0;
    let transparent = -1;

    const step = () => {
        if (cancelled?.()) return;
        try {
            const sentinel = st.readByte();
            if (sentinel === 0x3b) {
                resolve(movie);
                return;
            }
            if (sentinel === 0x21) {
                readExtension(st, (gce) => {
                    delay = Math.max(0.02, (gce.delayTime || 10) / 100);
                    disposal = gce.disposal;
                    transparent = gce.transparent;
                });
                setTimeout(step, 0);
                return;
            }
            if (sentinel !== 0x2c) throw new Error(`Unknown GIF block 0x${sentinel.toString(16)}`);
            const left = st.readUnsigned();
            const top = st.readUnsigned();
            const width = st.readUnsigned();
            const height = st.readUnsigned();
            const ipacked = st.readByte();
            const lctFlag = ipacked & 0x80;
            const interlaced = !!(ipacked & 0x40);
            const lctSize = ipacked & 0x07;
            const lct = lctFlag ? st.readPalette(1 << (lctSize + 1)) : null;
            const minCode = st.readByte();
            const lzw = st.readSubBlocks();
            let pixels = lzwDecode(minCode, lzw, width * height);
            if (interlaced) pixels = deinterlace(pixels, width, height);
            movie.frames.push({
                delay, disposal, left, top, width, height, transparent,
                palette: lct || gct,
                pixels
            });
            onFrame?.(movie, movie.frames.length - 1);
            delay = 0.1;
            disposal = 0;
            transparent = -1;
            setTimeout(step, 0);
        }
        catch (err) {
            if (movie.frames.length) resolve(movie);
            else reject(err);
        }
    };
    setTimeout(step, 0);
}

function readExtension(st: ByteStream, onGce: (gce: { delayTime: number; disposal: number; transparent: number }) => void) {
    const label = st.readByte();
    if (label === 0xf9) {
        st.readByte();
        const packed = st.readByte();
        const delayTime = st.readUnsigned();
        const transparentIndex = st.readByte();
        st.readByte();
        onGce({
            delayTime,
            disposal: (packed >> 2) & 7,
            transparent: packed & 1 ? transparentIndex : -1
        });
        return;
    }
    if (label === 0xff) {
        const len = st.readByte();
        st.pos += len;
        st.readSubBlocks();
        return;
    }
    st.readSubBlocks();
}

class ByteStream {
    pos = 0;
    constructor(private data: Uint8Array) {}

    readByte() {
        if (this.pos >= this.data.length) throw new Error("GIF truncated");
        return this.data[this.pos++];
    }

    readUnsigned() {
        return this.readByte() | (this.readByte() << 8);
    }

    readString(n: number) {
        let s = "";
        for (let i = 0; i < n; i++) s += String.fromCharCode(this.readByte());
        return s;
    }

    readPalette(count: number) {
        const palette: number[][] = [];
        for (let i = 0; i < count; i++) palette.push([this.readByte(), this.readByte(), this.readByte()]);
        return palette;
    }

    readSubBlocks() {
        const parts: Uint8Array[] = [];
        let total = 0;
        for (;;) {
            const size = this.readByte();
            if (!size) break;
            parts.push(this.data.subarray(this.pos, this.pos + size));
            this.pos += size;
            total += size;
        }
        const out = new Uint8Array(total);
        let offset = 0;
        for (const part of parts) {
            out.set(part, offset);
            offset += part.length;
        }
        return out;
    }
}

function lzwDecode(minCodeSize: number, data: Uint8Array, expected: number) {
    const out = new Uint8Array(Math.max(expected, 1));
    let outPos = 0;
    let bitPos = 0;
    const readCode = (size: number) => {
        let code = 0;
        for (let i = 0; i < size; i++) {
            if (data[bitPos >> 3] & (1 << (bitPos & 7))) code |= 1 << i;
            bitPos++;
        }
        return code;
    };
    const clearCode = 1 << minCodeSize;
    const eoiCode = clearCode + 1;
    let codeSize = minCodeSize + 1;
    const dict: Uint8Array[] = [];
    const clear = () => {
        dict.length = 0;
        codeSize = minCodeSize + 1;
        for (let i = 0; i < clearCode; i++) dict[i] = Uint8Array.of(i);
        dict[clearCode] = new Uint8Array(0);
        dict[eoiCode] = new Uint8Array(0);
    };
    clear();
    let last = -1;
    const write = (bytes: Uint8Array) => {
        if (outPos + bytes.length > out.length) return;
        out.set(bytes, outPos);
        outPos += bytes.length;
    };
    while (bitPos >> 3 < data.length) {
        const code = readCode(codeSize);
        if (code === clearCode) {
            clear();
            last = -1;
            continue;
        }
        if (code === eoiCode) break;
        let entry: Uint8Array;
        if (code < dict.length) {
            entry = dict[code];
            if (last >= 0 && last !== clearCode) {
                const prev = dict[last];
                const next = new Uint8Array(prev.length + 1);
                next.set(prev);
                next[prev.length] = entry[0];
                dict.push(next);
            }
        }
        else {
            if (code !== dict.length || last < 0) break;
            const prev = dict[last];
            entry = new Uint8Array(prev.length + 1);
            entry.set(prev);
            entry[prev.length] = prev[0];
            dict.push(entry);
        }
        write(entry);
        last = code;
        if (dict.length === (1 << codeSize) && codeSize < 12) codeSize++;
    }
    return out;
}

function deinterlace(pixels: Uint8Array, width: number, height: number) {
    const next = new Uint8Array(pixels.length);
    const offsets = [0, 4, 2, 1];
    const steps = [8, 8, 4, 2];
    let fromRow = 0;
    for (let pass = 0; pass < 4; pass++) {
        for (let toRow = offsets[pass]; toRow < height; toRow += steps[pass]) {
            next.set(pixels.subarray(fromRow * width, (fromRow + 1) * width), toRow * width);
            fromRow++;
        }
    }
    return next;
}

export function compositeFrame(
    canvas: Uint8Array,
    gifW: number,
    gifH: number,
    frames: GifPatch[],
    index: number,
    backup: Uint8Array | null
) {
    const frame = frames[index];
    if (index > 0) {
        const prev = frames[index - 1];
        if (prev.disposal === 2) clearRect(canvas, gifW, prev.left, prev.top, prev.width, prev.height);
        else if (prev.disposal === 3 && backup) canvas.set(backup);
    }
    if (frame.disposal === 3) {
        if (!backup || backup.length !== canvas.length) backup = new Uint8Array(canvas.length);
        backup.set(canvas);
    }
    const palette = frame.palette;
    const trans = frame.transparent;
    for (let y = 0; y < frame.height; y++) {
        const gy = frame.top + y;
        if (gy < 0 || gy >= gifH) continue;
        for (let x = 0; x < frame.width; x++) {
            const gx = frame.left + x;
            if (gx < 0 || gx >= gifW) continue;
            const color = frame.pixels[y * frame.width + x];
            if (color === trans || !palette[color]) continue;
            const rgb = palette[color];
            const o = (gy * gifW + gx) * 4;
            canvas[o] = rgb[0];
            canvas[o + 1] = rgb[1];
            canvas[o + 2] = rgb[2];
            canvas[o + 3] = 255;
        }
    }
    return backup;
}

export function scaleRgba(src: Uint8Array, sw: number, sh: number, dw: number, dh: number) {
    const dst = new Uint8Array(dw * dh * 4);
    for (let y = 0; y < dh; y++) {
        const sy = Math.min(sh - 1, (y * sh / dh) | 0);
        for (let x = 0; x < dw; x++) {
            const sx = Math.min(sw - 1, (x * sw / dw) | 0);
            const so = (sy * sw + sx) * 4;
            const doff = (y * dw + x) * 4;
            dst[doff] = src[so];
            dst[doff + 1] = src[so + 1];
            dst[doff + 2] = src[so + 2];
            dst[doff + 3] = src[so + 3];
        }
    }
    return dst;
}

function clearRect(canvas: Uint8Array, gifW: number, left: number, top: number, width: number, height: number) {
    for (let y = 0; y < height; y++) {
        const gy = top + y;
        if (gy < 0) continue;
        const row = (gy * gifW + left) * 4;
        canvas.fill(0, row, row + width * 4);
    }
}

function toBytes(native: unknown): Uint8Array | null {
    if (!native) return null;
    if (native instanceof Uint8Array) return native;
    if (native instanceof ArrayBuffer) return new Uint8Array(native);
    if (ArrayBuffer.isView(native)) return new Uint8Array(native.buffer, native.byteOffset, native.byteLength);
    return null;
}

type FileUtilsLike = {
    getDataFromFile?: (path: string) => ArrayBuffer | Uint8Array | null;
    isFileExist?: (path: string) => boolean;
    fullPathForFilename?: (path: string) => string;
};

async function readGifFromBundle(bundleName: string, path: string): Promise<Uint8Array | null> {
    const url = gifNativeUrl(bundleName, path);
    if (url) {
        const fromUrl = await readBytesFromUrl(url);
        if (isGifBytes(fromUrl)) return fromUrl;
    }
    console.warn("[SuitGif] 找不到二进制", path, url);
    return null;
}

function gifNativeUrl(bundleName: string, path: string): string | null {
    const bundle = assetManager.getBundle(bundleName);
    if (!bundle) return null;
    const clean = path.replace(/\.gif$/i, "");
    const base = clean.split("/").pop() || "";
    const info = bundle.getInfoWithPath(clean)
        || bundle.getInfoWithPath(path)
        || (bundle.getDirWithPath("game/equip_win_gif") || []).find(item => {
            const name = (item.path || "").split("/").pop() || "";
            return name === base || name.startsWith(`${base}.`);
        });
    if (!info?.uuid) return null;
    const utils = (assetManager as unknown as { utils?: { getUrlWithUuid?: (uuid: string, options: { isNative: boolean; nativeExt: string }) => string } }).utils;
    return utils?.getUrlWithUuid?.(info.uuid, { isNative: true, nativeExt: ".gif" }) || null;
}

function readBytesFromUrl(url: string): Promise<Uint8Array | null> {
    const local = readLocalBytes(url);
    if (isGifBytes(local)) return Promise.resolve(local);
    return downloadArrayBuffer(url);
}

function readLocalBytes(url: string): Uint8Array | null {
    const fileUtils = (globalThis as { jsb?: { fileUtils?: FileUtilsLike } }).jsb?.fileUtils;
    if (!fileUtils?.getDataFromFile) return null;
    const candidates = [url];
    if (url.startsWith("file://")) candidates.push(url.slice(7));
    const noQuery = url.split("?")[0];
    if (noQuery !== url) candidates.push(noQuery);
    for (const candidate of candidates) {
        try {
            const full = fileUtils.fullPathForFilename?.(candidate) || candidate;
            const data = fileUtils.getDataFromFile(full) || (full !== candidate ? fileUtils.getDataFromFile(candidate) : null);
            const bytes = toBytes(data);
            if (isGifBytes(bytes)) return bytes;
        }
        catch { /* 下一条路径 */ }
    }
    return null;
}

function downloadArrayBuffer(url: string): Promise<Uint8Array | null> {
    const downloader = assetManager.downloader as unknown as {
        _downloadArrayBuffer?: (url: string, options: Record<string, unknown>, onComplete: (err: Error | null, data?: ArrayBuffer) => void) => void;
    };
    if (typeof downloader._downloadArrayBuffer === "function") {
        return new Promise(resolve => {
            downloader._downloadArrayBuffer!(url, {}, (err, data) => {
                const bytes = toBytes(data);
                if (!err && isGifBytes(bytes)) resolve(bytes);
                else downloadBytes(url).then(resolve);
            });
        });
    }
    return downloadBytes(url);
}

function downloadBytes(url: string): Promise<Uint8Array | null> {
    return new Promise(resolve => {
        if (typeof XMLHttpRequest === "undefined") {
            resolve(null);
            return;
        }
        const req = new XMLHttpRequest();
        req.open("GET", url, true);
        req.responseType = "arraybuffer";
        req.timeout = 30000;
        req.onload = () => {
            if (req.status === 200 || req.status === 0) resolve(toBytes(req.response));
            else resolve(null);
        };
        req.onerror = () => resolve(null);
        req.ontimeout = () => resolve(null);
        req.send();
    });
}
