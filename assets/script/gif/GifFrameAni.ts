import { _decorator, Asset, BufferAsset, Component, Rect, Sprite, SpriteFrame, Texture2D, isValid } from "cc";
import SuperGif from "./Vendor/libgif";

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
        if (!this._face) {
            this._face = this.getComponent(Sprite) || this.addComponent(Sprite);
        }
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

    private _objectUrl = "";
    private _refreshId = 0;
    private _player: SuperGif | null = null;
    private _texture: Texture2D | null = null;
    private _frame: SpriteFrame | null = null;
    private _maxWidth = 0;

    protected onDestroy(): void {
        this._refreshId++;
        this.teardown();
    }

    /** 运行时指定资源并等到首帧可显示。失败返回 false。 */
    async play(asset: Asset, maxWidth = 0): Promise<boolean> {
        this._asset = asset;
        this._maxWidth = Math.max(0, maxWidth | 0);
        await this.refresh();
        return this._inited && this.isValid;
    }

    async refresh() {
        const id = ++this._refreshId;
        this._inited = false;
        this.teardown();
        this.cd = 0;
        this.frameInd = 0;
        if (!this.canDecode(this._asset)) {
            console.warn("[SuitGif] 资源没有可用的 GIF 数据", this._asset);
            return;
        }
        try {
            const bytes = await this.readBytes(this._asset!);
            if (id !== this._refreshId || !this.isValid) return;
            if (!bytes || bytes.length < 14 || bytes[0] !== 0x47 || bytes[1] !== 0x49 || bytes[2] !== 0x46) {
                console.warn("[SuitGif] 不是 GIF 文件", bytes?.length);
                return;
            }
            const width = bytes[6] | (bytes[7] << 8);
            const height = bytes[8] | (bytes[9] << 8);
            const gif = document.createElement("img");
            gif.width = width;
            gif.height = height;
            const player = new SuperGif({
                gif,
                auto_play: true,
                draw_while_loading: false,
                show_progress_bar: false,
                c_w: width,
                c_h: height,
                ...(this._maxWidth > 0 ? { max_width: this._maxWidth } : {})
            });
            this._player = player;
            await player.loadRaw(bytes);
            if (id !== this._refreshId || !this.isValid) return;
            if (player.getLength() <= 0) {
                console.warn("[SuitGif] GIF 没有帧");
                return;
            }
            player.play();
            this.syncCanvas();
            this._inited = !!this._frame;
            if (this._inited) this._setFrame(0);
            else console.warn("[SuitGif] 首帧没有画出来");
        }
        catch (err) {
            console.warn("[SuitGif] 解码失败", err);
            this.teardown();
        }
    }

    canDecode(asset: Asset | null) {
        if (!asset || !isValid(asset)) return false;
        if (asset instanceof BufferAsset) return true;
        return !!(asset.nativeUrl || (asset as Asset & { _nativeAsset?: unknown })._nativeAsset);
    }

    protected _setFrame(_ind: number) {
        const face = this.face;
        if (face && this._frame) face.spriteFrame = this._frame;
    }

    protected lateUpdate(_dt: number): void {
        if (!this._inited) return;
        this.syncCanvas();
    }

    private async readBytes(asset: Asset): Promise<Uint8Array | null> {
        if (asset instanceof BufferAsset) {
            const data = asset.buffer();
            return data ? new Uint8Array(data) : null;
        }
        const native = (asset as Asset & { _nativeAsset?: unknown })._nativeAsset;
        const fromNative = toGifBytes(native);
        if (fromNative) return fromNative;
        const url = asset.nativeUrl;
        if (!url) return null;
        try {
            const res = await fetch(url);
            if (res.ok) return new Uint8Array(await res.arrayBuffer());
        }
        catch { /* 预览 nativeUrl 不一定能 fetch */ }
        return downloadGif(url);
    }

    private syncCanvas() {
        const canvas = this._player?.getCanvas() as HTMLCanvasElement | undefined;
        if (!canvas || !canvas.width || !canvas.height) return;
        if (!this._texture || this._texture.width !== canvas.width || this._texture.height !== canvas.height) {
            this._texture?.destroy();
            this._texture = new Texture2D();
            this._texture.reset({ width: canvas.width, height: canvas.height });
            this._frame?.destroy();
            this._frame = new SpriteFrame();
            this._frame.packable = false;
        }
        this._texture.uploadData(canvas);
        this._frame!.reset({
            texture: this._texture,
            rect: new Rect(0, 0, canvas.width, canvas.height)
        });
        const face = this.face;
        if (!face) return;
        if (face.sizeMode === Sprite.SizeMode.CUSTOM) face.sizeMode = Sprite.SizeMode.RAW;
        if (face.spriteFrame !== this._frame) face.spriteFrame = this._frame;
    }

    private teardown() {
        if (this._player) {
            try { this._player.pause(); } catch { /* vendor 可能尚未 init */ }
            try { this._player.destroy(); } catch { /* 节点已拆时 vendor DOM 可能不在 */ }
            this._player = null;
        }
        this.clearFrames();
        this._frame?.destroy();
        this._frame = null;
        this._texture?.destroy();
        this._texture = null;
        this.revokeUrl();
    }

    private clearFrames() {
        for (const frame of this.frameList) frame.destroy();
        this.frameList.length = 0;
        this.frameInd = 0;
    }

    private revokeUrl() {
        if (!this._objectUrl) return;
        URL.revokeObjectURL(this._objectUrl);
        this._objectUrl = "";
    }
}

function toGifBytes(native: unknown): Uint8Array | null {
    if (!native) return null;
    if (native instanceof Uint8Array) return native;
    if (native instanceof ArrayBuffer) return new Uint8Array(native);
    if (ArrayBuffer.isView(native)) {
        return new Uint8Array(native.buffer, native.byteOffset, native.byteLength);
    }
    if (typeof native === "string" && native.length >= 6) {
        const out = new Uint8Array(native.length);
        for (let i = 0; i < native.length; i++) out[i] = native.charCodeAt(i) & 0xff;
        return out;
    }
    return null;
}

function downloadGif(url: string): Promise<Uint8Array | null> {
    return new Promise(resolve => {
        const req = new XMLHttpRequest();
        req.open("GET", url, true);
        req.responseType = "arraybuffer";
        req.onload = () => {
            if (req.status === 200 || req.status === 0) resolve(new Uint8Array(req.response));
            else resolve(null);
        };
        req.onerror = () => resolve(null);
        req.send();
    });
}
