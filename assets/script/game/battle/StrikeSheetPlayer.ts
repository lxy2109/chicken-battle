import { Animation, AnimationClip, Component, Rect, Size, Sprite, SpriteFrame, Texture2D, Tween, UITransform, _decorator, tween } from "cc";
import { oops } from "db://oops-framework/core/Oops";
import { isMinionAnim, TEX } from "../domain/Catalog";
import { StrikeStyle } from "../domain/Types";

const { ccclass } = _decorator;

/** 与 import-strike-gen.cjs 一致：整张 1024×1024，4×4 格，每格 256。 */
export const STRIKE_SHEET = { width: 1024, height: 1024, frames: 16, cell: 256, cols: 4, sample: 24 };
const IDLE_SAMPLE = 10;
const IDLE = "idle";

const STYLES: StrikeStyle[] = ["peck", "jump", "dive", "leap", "charge", "tail", "combo", "feint"];

/**
 * 接触帧（与 gen-strike-sheets ACTIONS 关键帧对齐）。
 * 蓄力播到这一帧前停住/缓行，命中瞬间再砸接触段，招式才跟位移同拍。
 */
const CONTACT_FRAME: Record<StrikeStyle, number> = {
    peck: 7,
    jump: 9,
    dive: 8,
    leap: 10,
    charge: 6,
    tail: 9,
    combo: 6,
    feint: 12
};

/** 命中后把接触帧播完再回 idle 的时长。 */
const RECOVER_SEC: Record<StrikeStyle, number> = {
    peck: 0.22,
    jump: 0.2,
    dive: 0.18,
    leap: 0.24,
    charge: 0.26,
    tail: 0.36,
    combo: 0.38,
    feint: 0.24
};

/** 起手段默认时长；真正接近时间更长时会在接触帧前一格顿住。 */
const WINDUP_SEC: Record<StrikeStyle, number> = {
    peck: 0.12,
    jump: 0.16,
    dive: 0.14,
    leap: 0.2,
    charge: 0.1,
    tail: 0.14,
    combo: 0.1,
    feint: 0.16
};

const frameCache = new Map<string, SpriteFrame[]>();
const clipCache = new Map<string, AnimationClip>();

type Phase = "idle" | "windup" | "hold" | "impact" | "recover" | "off";

/**
 * 立绘鸡的序列帧。从 1024×1024 的 4×4 动作表切 16 帧。
 *
 * 出招分三段，避免「身体已经撞上、画面还在蓄力」：
 * 1) windup：播到接触帧前
 * 2) hold：接近还没碰到时停在蓄力末帧
 * 3) impact → recover：contact() 时砸接触段，收招回 idle
 *
 * 小怪包只有 peck 图，用不同播放速率/顿帧表现其它招式节奏。
 */
@ccclass("StrikeSheetPlayer")
export class StrikeSheetPlayer extends Component {
    sheetKey = "";
    private still: SpriteFrame | null = null;
    private stillSize: Size | null = null;
    private anim: Animation | null = null;
    private _busy = false;
    private _idleOn = false;
    private gen = 0;
    private phase: Phase = "off";
    private style: StrikeStyle = "peck";
    private frames: SpriteFrame[] | null = null;
    private frameIdx = 0;
    private holdCarrier: { t: number } | null = null;
    /** scrub / wait 被 unschedule 时要放行，否则 await 会挂死。 */
    private waits: Array<() => void> = [];
    /** 贴图还在加载时就已经碰到，等 frames 就绪再砸接触帧。 */
    private pendingImpact = false;

    get busy() {
        return this._busy;
    }

    get idlePlaying() {
        return this._idleOn && !this._busy;
    }

    /** 当前是否停在蓄力末、等命中砸帧。 */
    get holding() {
        return this.phase === "hold";
    }

    async warmup() {
        if (!this.sheetKey) return;
        const styles = isMinionAnim(this.sheetKey) ? ["peck" as StrikeStyle] : STYLES;
        await Promise.all([this.framesOf(IDLE), ...styles.map(style => this.framesOf(style))]);
        if (!this._busy) await this.startIdle();
    }

    /** 循环播待机。出招占用时不会抢。 */
    async startIdle(speed = 1) {
        const ticket = ++this.gen;
        if (!this.sheetKey || this._busy || !this.node?.isValid) return;
        this.clearDrive();
        const sprite = this.getComponent(Sprite);
        if (!sprite) return;
        this.captureStill(sprite);
        const frames = await this.framesOf(IDLE);
        if (ticket !== this.gen || !frames || this._busy || !this.node?.isValid) {
            if (!frames && this.node?.isValid && ticket === this.gen) this.restoreStill();
            return;
        }
        const clip = this.clipOf(IDLE, frames, true);
        const anim = this.ensureAnim();
        if (!anim || this._busy || ticket !== this.gen || !this.node?.isValid) return;
        anim.off(Animation.EventType.FINISHED);
        anim.stop();
        this.applyCellSize();
        if (!anim.getState(IDLE)) anim.addClip(clip, IDLE);
        this._idleOn = true;
        this.phase = "idle";
        anim.play(IDLE);
        const state = anim.getState(IDLE);
        if (state) state.speed = Math.max(0.55, Math.min(1.45, speed));
    }

    /**
     * 开始出招蓄力。leadSec 是期望「起手到接触」的时长，用来把 windup 节奏压到招式上。
     * 命中时务必再调 impact()，否则会一直停在 hold。
     */
    play(style: StrikeStyle, leadSec?: number) {
        this._busy = true;
        this._idleOn = false;
        this.pendingImpact = false;
        this.style = style;
        const ticket = ++this.gen;
        void this.runStrike(style, leadSec, ticket);
    }

    /**
     * 身体真正碰到的那一帧调用：从接触帧砸到收招，再回 idle。
     * 若还在 windup，直接跳到接触帧，避免「已经打中画面还在拉弓」。
     */
    impact() {
        if (!this._busy || !this.node?.isValid) return;
        if (!this.frames) {
            // 贴图尚未切完，先记一笔，加载完直接砸。
            this.pendingImpact = true;
            return;
        }
        if (this.phase !== "windup" && this.phase !== "hold") return;
        // 同步占住 phase，避免 windup 的 scrub 被掐后仍走进 hold。
        this.phase = "impact";
        const ticket = this.gen;
        void this.runImpact(ticket);
    }

    /** 没碰到 / 被打断：从当前帧收回到站姿再 idle，不要瞬切。 */
    abort() {
        this.pendingImpact = false;
        if (!this._busy) {
            void this.startIdle();
            return;
        }
        const ticket = ++this.gen;
        void this.runAbort(ticket);
    }

    halt() {
        this.gen += 1;
        this.pendingImpact = false;
        this.clearDrive();
        if (this.anim) {
            this.anim.off(Animation.EventType.FINISHED);
            this.anim.stop();
        }
        this._busy = false;
        this._idleOn = false;
        this.phase = "off";
        this.frames = null;
        void this.startIdle();
    }

    /** 待机节奏随路数微调，避免双方同一拍点头。 */
    setIdlePace(speed: number) {
        if (!this._idleOn || this._busy || !this.anim) return;
        const state = this.anim.getState(IDLE);
        if (state) state.speed = Math.max(0.55, Math.min(1.45, speed));
    }

    private async runStrike(style: StrikeStyle, leadSec: number | undefined, ticket: number) {
        const sprite = this.getComponent(Sprite);
        if (!sprite || !this.sheetKey || !this.node?.isValid) {
            this._busy = false;
            return;
        }
        this.captureStill(sprite);
        const clipStyle = this.actionStyle(style);
        const frames = await this.framesOf(clipStyle);
        if (ticket !== this.gen || !frames || !this.node?.isValid) {
            if (ticket === this.gen && !frames) {
                this._busy = false;
                void this.startIdle();
            }
            return;
        }
        this.frames = frames;
        this.applyCellSize();
        this.stopAnimOnly();

        const contact = Math.min(this.contactOf(clipStyle), frames.length - 1);
        const windEnd = Math.max(0, contact - 1);
        // 小怪共用 peck 图：用 lead 长短拉开「这一下」的节奏差。
        const pace = isMinionAnim(this.sheetKey) ? this.minionPace(style) : 1;
        const windSec = Math.max(0.06, (leadSec != null
            ? Math.min(leadSec * 0.85, this.windupOf(clipStyle) * 1.6)
            : this.windupOf(clipStyle)) * pace);

        this.phase = "windup";
        if (this.pendingImpact) {
            this.pendingImpact = false;
            await this.runImpact(ticket);
            return;
        }
        await this.scrub(frames, 0, windEnd, windSec, ticket);
        if (ticket !== this.gen || !this.node?.isValid) return;
        // impact() 可能已在 scrub 中途同步占住 phase。
        if (this.phase !== "windup") return;
        if (this.pendingImpact) {
            this.pendingImpact = false;
            this.phase = "impact";
            await this.runImpact(ticket);
            return;
        }

        // 接近还没碰到：停在蓄力末帧，轻微呼吸感，等 impact。
        this.phase = "hold";
        this.showFrame(frames, windEnd);
        this.pulseHold(frames, windEnd, ticket);
        if (this.pendingImpact) {
            this.pendingImpact = false;
            this.phase = "impact";
            await this.runImpact(ticket);
        }
    }

    private async runImpact(ticket: number) {
        const frames = this.frames;
        if (!frames || ticket !== this.gen || !this.node?.isValid) return;
        // 掐掉 windup scrub，但不要 ++gen，本段 impact 还要用同一个 ticket。
        this.kickWaits();
        this.clearHoldOnly();
        const clipStyle = this.actionStyle(this.style);
        const contact = Math.min(this.contactOf(clipStyle), frames.length - 1);
        const last = frames.length - 1;
        const pace = isMinionAnim(this.sheetKey) ? this.minionPace(this.style) : 1;
        const snap = 0.05 * pace;
        const recover = this.recoverOf(clipStyle) * pace;

        this.phase = "impact";
        // 接触帧钉死一拍，打击感比匀速扫过去清楚。
        this.showFrame(frames, contact);
        await this.wait(snap, ticket);
        if (ticket !== this.gen || !this.node?.isValid) return;

        this.phase = "recover";
        await this.scrub(frames, Math.min(contact + 1, last), last, recover, ticket);
        if (ticket !== this.gen || !this.node?.isValid) return;

        this._busy = false;
        this.frames = null;
        this.phase = "off";
        void this.startIdle(this.idleSpeedFor(this.style));
    }

    private async runAbort(ticket: number) {
        const frames = this.frames;
        this.clearHoldOnly();
        if (!frames || !this.node?.isValid) {
            this._busy = false;
            this.phase = "off";
            void this.startIdle();
            return;
        }
        this.phase = "recover";
        const last = frames.length - 1;
        const from = Math.min(this.frameIdx, last);
        // 从当前帧快进到站姿末帧，比直接切 idle 自然。
        await this.scrub(frames, from, last, 0.12, ticket);
        if (ticket !== this.gen) return;
        this._busy = false;
        this.frames = null;
        this.phase = "off";
        void this.startIdle();
    }

    /** 按时间在 [from, to] 帧间推进；单帧则只展示。 */
    private scrub(frames: SpriteFrame[], from: number, to: number, sec: number, ticket: number): Promise<void> {
        const a = Math.max(0, Math.min(from, frames.length - 1));
        const b = Math.max(0, Math.min(to, frames.length - 1));
        if (a === b || sec <= 0.001) {
            this.showFrame(frames, b);
            return Promise.resolve();
        }
        const steps = Math.abs(b - a);
        const dir = b >= a ? 1 : -1;
        const dt = sec / steps;
        return new Promise((resolve) => {
            let done = false;
            const fin = () => {
                if (done) return;
                done = true;
                resolve();
            };
            this.waits.push(fin);
            let i = 0;
            const tick = () => {
                if (ticket !== this.gen || !this.node?.isValid) {
                    fin();
                    return;
                }
                this.showFrame(frames, a + dir * i);
                i += 1;
                if (i > steps) {
                    fin();
                    return;
                }
                this.scheduleOnce(tick, dt);
            };
            tick();
        });
    }

    private pulseHold(frames: SpriteFrame[], idx: number, ticket: number) {
        this.clearHoldOnly();
        // 蓄力停住时用极小的帧邻域抖一下，避免「冻住的 PNG」。
        const lo = Math.max(0, idx - 1);
        const hi = Math.min(frames.length - 1, idx);
        const carrier = { t: 0 };
        this.holdCarrier = carrier;
        tween(carrier)
            .repeatForever(
                tween()
                    .to(0.11, { t: 1 }, {
                        onUpdate: () => {
                            if (ticket !== this.gen) return;
                            this.showFrame(frames, carrier.t < 0.5 ? lo : hi);
                        }
                    })
                    .to(0.11, { t: 0 }, {
                        onUpdate: () => {
                            if (ticket !== this.gen) return;
                            this.showFrame(frames, carrier.t < 0.5 ? hi : lo);
                        }
                    })
            )
            .start();
    }

    private showFrame(frames: SpriteFrame[], idx: number) {
        const sprite = this.getComponent(Sprite);
        if (!sprite || !frames.length) return;
        const i = Math.max(0, Math.min(idx, frames.length - 1));
        this.frameIdx = i;
        sprite.spriteFrame = frames[i];
    }

    private wait(sec: number, ticket: number): Promise<void> {
        return new Promise((resolve) => {
            let done = false;
            const fin = () => {
                if (done) return;
                done = true;
                resolve();
            };
            this.waits.push(fin);
            this.scheduleOnce(() => {
                if (ticket === this.gen) fin();
                else fin();
            }, sec);
        });
    }

    private contactOf(style: StrikeStyle) {
        return CONTACT_FRAME[style] ?? 8;
    }

    private windupOf(style: StrikeStyle) {
        return WINDUP_SEC[style] ?? 0.12;
    }

    private recoverOf(style: StrikeStyle) {
        return RECOVER_SEC[style] ?? 0.24;
    }

    private minionPace(style: StrikeStyle) {
        switch (style) {
            case "leap": return 1.25;
            case "dive": return 1.15;
            case "charge": return 0.85;
            case "combo": return 0.9;
            case "feint": return 1.2;
            case "tail": return 1.1;
            case "jump": return 1.05;
            default: return 1;
        }
    }

    private idleSpeedFor(style: StrikeStyle) {
        switch (style) {
            case "charge": case "combo": return 1.15;
            case "leap": case "dive": return 0.9;
            case "feint": return 1.2;
            default: return 1;
        }
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

    /** 小怪包里只有 peck，其它招式都播这一张，靠速率区分。 */
    private actionStyle(style: StrikeStyle): StrikeStyle {
        return isMinionAnim(this.sheetKey) ? "peck" : style;
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
            const square = tex.width === tex.height;
            const cols = square ? STRIKE_SHEET.cols : STRIKE_SHEET.frames;
            const cell = square ? Math.floor(tex.width / STRIKE_SHEET.cols) : tex.height;
            for (let i = 0; i < STRIKE_SHEET.frames; i++) {
                const frame = new SpriteFrame();
                frame.packable = false;
                const col = i % cols;
                const row = Math.floor(i / cols);
                frame.reset({
                    texture: tex,
                    rect: new Rect(col * cell, row * cell, cell, cell)
                });
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

    private stopAnimOnly() {
        if (!this.anim) return;
        this.anim.off(Animation.EventType.FINISHED);
        this.anim.stop();
    }

    private clearHoldOnly() {
        if (this.holdCarrier) {
            Tween.stopAllByTarget(this.holdCarrier);
            this.holdCarrier = null;
        }
    }

    private kickWaits() {
        this.unscheduleAllCallbacks();
        const list = this.waits;
        this.waits = [];
        for (const fn of list) fn();
    }

    private clearDrive() {
        this.clearHoldOnly();
        this.kickWaits();
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
        this.gen += 1;
        this.clearDrive();
        this.anim?.stop();
        this._busy = false;
        this._idleOn = false;
        this.phase = "off";
    }
}
