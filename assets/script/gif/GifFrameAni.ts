import { _decorator, Asset, Component, Rect, Sprite, SpriteFrame, Texture2D, isValid } from "cc";
import { GifMovie, compositeFrame, decodeGif, readGifBytes, scaleRgba, watchGif } from "./GifDecoder";

const { ccclass, property } = _decorator;

@ccclass("GifFrameAni")
export default class GifFrameAni extends Component {
    @property({ serializable: true })
    _asset: Asset | null = null;

    @property({ type: Asset })
    get asset() {
        return this._asset;
    }
    set asset(val: Asset | null) {
        if (this._asset === val) return;
        this._asset = val;
        void this.refresh();
    }

    _face: Sprite | null = null;
    @property(Sprite)
    get face() {
        if (!this._face) this._face = this.getComponent(Sprite) || this.addComponent(Sprite);
        return this._face;
    }

    @property
    interval = 0.1;
    cd = 0;
    frameList: SpriteFrame[] = [];
    frameInd = 0;
    protected _inited = false;
    get inited() {
        return this._inited;
    }

    private _refreshId = 0;
    private _cacheKey = "";
    private _maxW = 0;
    private _maxH = 0;
    private _movie: GifMovie | null = null;
    private _done = false;
    private _index = 0;
    private _acc = 0;
    private _canvas: Uint8Array | null = null;
    private _backup: Uint8Array | null = null;
    private _upload: Uint8Array | null = null;
    private _drawW = 0;
    private _drawH = 0;
    private _texture: Texture2D | null = null;
    private _frame: SpriteFrame | null = null;
    private _first: ((ok: boolean) => void) | null = null;

    protected onDestroy(): void {
        this._refreshId++;
        this._first?.(false);
        this._first = null;
        this.teardown();
    }

    /** 运行时指定资源，首帧出来就算成功，其余帧后台继续解。 */
    async play(asset: Asset, maxWidth = 0, maxHeight = 0, cacheKey = ""): Promise<boolean> {
        this._asset = asset;
        this._maxW = Math.max(0, maxWidth | 0);
        this._maxH = Math.max(0, maxHeight | 0);
        this._cacheKey = cacheKey;
        await this.refresh();
        return this._inited && this.isValid;
    }

    async refresh() {
        const id = ++this._refreshId;
        this._inited = false;
        this._done = false;
        this._movie = null;
        this._index = 0;
        this._acc = 0;
        this.cd = 0;
        this.frameInd = 0;
        if (!this._asset || !isValid(this._asset)) {
            console.warn("[SuitGif] 资源没有可用的 GIF 数据", this._asset);
            return;
        }
        try {
            const bytes = await readGifBytes(this._asset);
            if (id !== this._refreshId || !this.isValid) return;
            if (!bytes || bytes.length < 14 || bytes[0] !== 0x47 || bytes[1] !== 0x49 || bytes[2] !== 0x46) {
                console.warn("[SuitGif] 不是 GIF 文件", bytes?.length);
                return;
            }
            const first = new Promise<boolean>(ok => { this._first = ok; });
            const onFrame = (movie: GifMovie, index: number) => {
                if (id !== this._refreshId || !this.isValid) return;
                this._movie = movie;
                if (index === 0) this.showFrame(0, true);
            };
            const decoding = this._cacheKey
                ? watchGif(this._cacheKey, bytes, onFrame, () => id !== this._refreshId || !this.isValid)
                : decodeGif(bytes, onFrame, () => id !== this._refreshId || !this.isValid);
            decoding.then(movie => {
                if (id !== this._refreshId || !this.isValid) return;
                this._movie = movie;
                this._done = true;
                if (!this._inited && movie.frames.length) this.showFrame(0, true);
                this._first?.(this._inited);
                this._first = null;
            }, err => {
                console.warn("[SuitGif] 解码失败", err);
                this._first?.(this._inited);
                this._first = null;
            });
            await first;
        }
        catch (err) {
            console.warn("[SuitGif] 解码失败", err);
            this.teardown();
        }
    }

    protected lateUpdate(dt: number): void {
        if (!this._inited || !this._movie || this._movie.frames.length < 2) return;
        const frames = this._movie.frames;
        const delay = frames[this._index]?.delay || this.interval;
        this._acc += dt;
        if (this._acc < delay) return;
        const next = this._index + 1;
        if (next >= frames.length) {
            if (!this._done) return;
            this._acc = 0;
            this.showFrame(0, true);
            return;
        }
        this._acc = 0;
        this.showFrame(next, false);
    }

    private showFrame(index: number, reset: boolean) {
        const movie = this._movie;
        if (!movie || !movie.frames[index]) return;
        const gifW = movie.width;
        const gifH = movie.height;
        if (!this._canvas || this._canvas.length !== gifW * gifH * 4) this._canvas = new Uint8Array(gifW * gifH * 4);
        if (reset) {
            this._canvas.fill(0);
            this._backup = null;
            for (let i = 0; i <= index; i++) this._backup = compositeFrame(this._canvas, gifW, gifH, movie.frames, i, this._backup);
        }
        else this._backup = compositeFrame(this._canvas, gifW, gifH, movie.frames, index, this._backup);
        this._index = index;
        this.frameInd = index;
        const draw = fitSize(gifW, gifH, this._maxW, this._maxH);
        if (!this._upload || this._drawW !== draw.w || this._drawH !== draw.h) {
            this._drawW = draw.w;
            this._drawH = draw.h;
            this._upload = scaleRgba(this._canvas, gifW, gifH, draw.w, draw.h);
            this.resetTexture(draw.w, draw.h);
        }
        else scaleInto(this._canvas, gifW, gifH, this._upload, draw.w, draw.h);
        this._texture!.uploadData(this._upload);
        const face = this.face;
        if (face && this._frame && face.spriteFrame !== this._frame) face.spriteFrame = this._frame;
        this._inited = true;
        this._first?.(true);
        this._first = null;
    }

    private resetTexture(width: number, height: number) {
        this._texture?.destroy();
        this._texture = new Texture2D();
        this._texture.reset({ width, height, format: Texture2D.PixelFormat.RGBA8888 });
        this._frame?.destroy();
        this._frame = new SpriteFrame();
        this._frame.packable = false;
        this._frame.reset({ texture: this._texture, rect: new Rect(0, 0, width, height) });
        const face = this.face;
        if (!face) return;
        if (face.sizeMode === Sprite.SizeMode.CUSTOM) face.sizeMode = Sprite.SizeMode.RAW;
        face.spriteFrame = this._frame;
    }

    private teardown() {
        this._movie = null;
        this._canvas = null;
        this._backup = null;
        this._upload = null;
        this._frame?.destroy();
        this._frame = null;
        this._texture?.destroy();
        this._texture = null;
        this.frameList.length = 0;
    }
}

function fitSize(gifW: number, gifH: number, maxW: number, maxH: number) {
    const cap = 512;
    const limitW = maxW > 0 ? maxW : cap;
    const limitH = maxH > 0 ? maxH : cap;
    const scale = Math.min(limitW / gifW, limitH / gifH, cap / Math.max(gifW, gifH), 1);
    return { w: Math.max(1, Math.round(gifW * scale)), h: Math.max(1, Math.round(gifH * scale)) };
}

function scaleInto(src: Uint8Array, sw: number, sh: number, dst: Uint8Array, dw: number, dh: number) {
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
}
