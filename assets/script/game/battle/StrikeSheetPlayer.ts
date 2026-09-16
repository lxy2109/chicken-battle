import { Animation, AnimationClip, Component, Rect, Size, Sprite, SpriteFrame, Texture2D, UITransform, _decorator } from "cc";
import { oops } from "db://oops-framework/core/Oops";
import { TEX } from "../core/Catalog";
import { StrikeStyle } from "../core/Types";

const { ccclass } = _decorator;

/** 与 gen-strike-sheets.cjs 保持一致：整张 1024×64，横切 16 格。 */
export const STRIKE_SHEET = { width: 1024, height: 64, frames: 16, cell: 64, sample: 24 };
const IDLE_SAMPLE = 10;
const IDLE = "idle";

const STYLES: StrikeStyle[] = ["peck", "jump", "dive", "leap", "charge", "tail", "combo", "feint"];

const frameCache = new Map<string, SpriteFrame[]>();
const clipCache = new Map<string, AnimationClip>();

/**
 * 立绘鸡的序列帧。从 1024×64 的动作条切 16 帧，交给 cc.Animation 的 clip 播。
 * 待机循环 idle 条，出招播对应 clip，结束后回到 idle。
 */
@ccclass("StrikeSheetPlayer")
export class StrikeSheetPlayer extends Component {
    sheetKey = "";
    private still: SpriteFrame | null = null;
    private stillSize: Size | null = null;
    private anim: Animation | null = null;
    private _busy = false;
    private _idleOn = false;

    get busy() {
        return this._busy;
    }

    get idlePlaying() {
        return this._idleOn && !this._busy;
    }

    async warmup() {
        if (!this.sheetKey) return;
        await Promise.all([this.framesOf(IDLE), ...STYLES.map(style => this.framesOf(style))]);
        if (!this._busy) await this.startIdle();
    }

    /** 循环播待机。出招占用时不会抢。 */
    async startIdle() {
        if (!this.sheetKey || this._busy || !this.node.isValid) return;
        const sprite = this.getComponent(Sprite);
        if (!sprite) return;
        this.captureStill(sprite);
        const frames = await this.framesOf(IDLE);
        if (!frames || this._busy || !this.node.isValid) {
            if (!frames) this.restoreStill();
            return;
        }
        const clip = this.clipOf(IDLE, frames, true);
        const anim = this.ensureAnim();
        if (!anim || this._busy) return;
        anim.off(Animation.EventType.FINISHED);
        anim.stop();
        this.applyCellSize();
        if (!anim.getState(IDLE)) anim.addClip(clip, IDLE);
        this._idleOn = true;
        anim.play(IDLE);
    }

    play(style: StrikeStyle) {
        this._busy = true;
        this._idleOn = false;
        void this.playClip(style);
    }

    halt() {
        if (this.anim) {
            this.anim.off(Animation.EventType.FINISHED);
            this.anim.stop();
        }
        this._busy = false;
        this._idleOn = false;
        void this.startIdle();
    }

    private async playClip(style: StrikeStyle) {
        const sprite = this.getComponent(Sprite);
        if (!sprite || !this.sheetKey || !this.node.isValid) {
            this._busy = false;
            return;
        }
        this.captureStill(sprite);
        const frames = await this.framesOf(style);
        if (!frames || !this.node.isValid || !this._busy) {
            if (!frames) {
                this._busy = false;
                void this.startIdle();
            }
            return;
        }
        const clip = this.clipOf(style, frames, false);
        const anim = this.ensureAnim();
        if (!anim) {
            this._busy = false;
            return;
        }
        anim.off(Animation.EventType.FINISHED);
        anim.stop();
        anim.once(Animation.EventType.FINISHED, () => {
            this._busy = false;
            this._idleOn = false;
            void this.startIdle();
        });
        this.applyCellSize();
        if (!anim.getState(style)) anim.addClip(clip, style);
        anim.play(style);
    }

    private clipOf(name: string, frames: SpriteFrame[], loop: boolean) {
        const key = `${this.sheetKey}/${name}`;
        let clip = clipCache.get(key);
        if (clip) return clip;
        clip = AnimationClip.createWithSpriteFrames(frames, loop ? IDLE_SAMPLE : STRIKE_SHEET.sample);
        clip.name = name;
        clip.wrapMode = loop ? AnimationClip.WrapMode.Loop : AnimationClip.WrapMode.Normal;
        clipCache.set(key, clip);
        return clip;
    }

    private async framesOf(style: string) {
        const key = `${this.sheetKey}/${style}`;
        const hit = frameCache.get(key);
        if (hit) return hit;
        try {
            const sheet = await oops.res.load("bundle", TEX.strikeAnim(this.sheetKey, style), SpriteFrame);
            if (!sheet?.texture) return null;
            const tex = sheet.texture as Texture2D;
            const frames: SpriteFrame[] = [];
            for (let i = 0; i < STRIKE_SHEET.frames; i++) {
                const frame = new SpriteFrame();
                frame.packable = false;
                frame.reset({ texture: tex, rect: new Rect(i * STRIKE_SHEET.cell, 0, STRIKE_SHEET.cell, STRIKE_SHEET.cell) });
                frames.push(frame);
            }
            frameCache.set(key, frames);
            return frames;
        }
        catch {
            return null;
        }
    }

    private ensureAnim() {
        const anim = this.anim ?? this.getComponent(Animation) ?? this.addComponent(Animation);
        this.anim = anim;
        return anim;
    }

    private captureStill(sprite: Sprite) {
        if (!this.still) this.still = sprite.spriteFrame;
        const ui = this.getComponent(UITransform);
        if (ui && !this.stillSize) this.stillSize = ui.contentSize.clone();
    }

    private applyCellSize() {
        const ui = this.getComponent(UITransform);
        if (ui && this.stillSize) ui.setContentSize(this.stillSize.height, this.stillSize.height);
    }

    private restoreStill() {
        const sprite = this.getComponent(Sprite);
        if (sprite && this.still) sprite.spriteFrame = this.still;
        const ui = this.getComponent(UITransform);
        if (ui && this.stillSize) ui.setContentSize(this.stillSize);
        this._idleOn = false;
    }

    onDestroy() {
        this.anim?.stop();
        this._busy = false;
        this._idleOn = false;
    }
}
