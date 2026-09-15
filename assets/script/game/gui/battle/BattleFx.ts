import { Color, Graphics, Node, Sprite, SpriteFrame, Tween, UIOpacity, UITransform, director, tween, v3 } from "cc";
import { ChickenActor } from "../../battle/ChickenActor";
import { StrikeStyle } from "../../core/Types";

export interface BattleFxSheet {
    slash?: SpriteFrame;
    star?: SpriteFrame;
    ring?: SpriteFrame;
    streak?: SpriteFrame;
    focus?: SpriteFrame;
    crack?: SpriteFrame;
    ink?: SpriteFrame;
    charge?: SpriteFrame;
}

/**
 * 战斗电影感：定格、冲击帧、斩痕贴图、冲击波、残影、宽银幕。
 * 招式落点用墨线贴图，全屏闪白/黑边才走 Graphics。
 */
export class BattleFx {
    private overlay: Node;
    private ink: Graphics;
    private fade: UIOpacity;
    private bars: Node;
    private topBar: UITransform;
    private botBar: UITransform;
    private veil: Node;
    private veilInk: Graphics;
    private veilFade: UIOpacity;
    private arenaFx: Node;
    private punching = 0;
    private letter = 0;
    private closed = false;
    private live = 0;

    constructor(private root: Node, private arena: Node, private sheet: BattleFxSheet) {
        this.overlay = this.makeLayer("BattleFxOverlay", root, 1);
        this.ink = this.overlay.addComponent(Graphics);
        this.fade = this.overlay.addComponent(UIOpacity);
        this.fade.opacity = 0;

        this.bars = this.makeLayer("Letterbox", root, 1);
        this.topBar = this.bar(1);
        this.botBar = this.bar(-1);
        this.bars.addComponent(UIOpacity).opacity = 0;

        this.veil = this.makeLayer("RageVeil", root, 1);
        this.veilInk = this.veil.addComponent(Graphics);
        this.veilFade = this.veil.addComponent(UIOpacity);
        this.veilFade.opacity = 0;

        this.arenaFx = new Node("ArenaCinematics");
        this.arenaFx.layer = arena.layer;
        this.arenaFx.parent = arena;
        this.arenaFx.addComponent(UITransform).setContentSize(arena.getComponent(UITransform)!.contentSize);
        this.layout();
        root.once(Node.EventType.NODE_DESTROYED, this.clear, this);
    }

    skillWindup(actor: ChickenActor | null) {
        this.letterbox(true);
        actor?.flash(new Color(255, 248, 220), 0.12);
        actor?.ghost(new Color(255, 230, 180));
        const p = actor?.node.worldPosition;
        if (p) {
            const local = this.toArena(p.x, p.y);
            this.stamp(this.arenaFx, this.sheet.charge, local.x, local.y + 8, 90, 90, 0.28, { grow: 1.7, squash: 0.75 });
        }
    }

    skillDone() {
        this.letterbox(false);
    }

    hit(worldX: number, worldY: number, direction: number, style: StrikeStyle, heavy: boolean, crit: boolean) {
        const p = this.toArena(worldX, worldY);
        this.slashAt(p.x, p.y, direction, style, heavy || crit);
        this.shockAt(p.x, p.y - 36, crit ? 1.35 : heavy ? 1.1 : 0.7);
        if (crit) {
            this.punch(0.16, 0.22);
            this.impactFrame(worldX, worldY, "crit");
            this.stamp(this.arenaFx, this.sheet.star, p.x, p.y + 12, 170, 170, 0.22, { grow: 1.25, angle: (Math.random() - 0.5) * 40 });
            this.stamp(this.arenaFx, this.sheet.ink, p.x + direction * 18, p.y, 140, 140, 0.2, { sx: direction, grow: 1.2 });
            this.cracksAt(p.x, p.y - 48, direction, 3);
        }
        else if (heavy) {
            this.punch(0.28, 0.09);
            this.impactFrame(worldX, worldY, "heavy");
            this.stamp(this.arenaFx, this.sheet.star, p.x, p.y + 8, 120, 120, 0.18, { grow: 1.15, angle: (Math.random() - 0.5) * 50 });
            this.cracksAt(p.x, p.y - 48, direction, 2);
        }
        else if (style === "peck" || style === "combo") {
            this.streaksAt(p.x, p.y, direction, 3);
        }
    }

    clash(worldX: number, worldY: number) {
        this.punch(0.14, 0.14);
        this.impactFrame(worldX, worldY, "clash");
        const p = this.toArena(worldX, worldY);
        this.stamp(this.arenaFx, this.sheet.star, p.x, p.y + 16, 220, 220, 0.26, { grow: 1.35 });
        this.stamp(this.arenaFx, this.sheet.ink, p.x, p.y, 180, 180, 0.24, { grow: 1.3, angle: 25 });
        this.shockAt(p.x, p.y - 40, 1.6);
        this.shockAt(p.x, p.y - 40, 1.05, 0.06);
        this.cracksAt(p.x, p.y - 48, 1, 3);
        this.cracksAt(p.x, p.y - 48, -1, 3);
        this.letterbox(true);
        this.delay(0.28, () => this.letterbox(false));
    }

    dodge(actor: ChickenActor | null, direction: number) {
        actor?.ghost(new Color(70, 90, 140));
        actor?.ghost(new Color(40, 50, 90));
        const p = actor?.node.worldPosition;
        if (p) {
            const local = this.toArena(p.x, p.y);
            this.streaksAt(local.x, local.y, -direction, 5);
        }
    }

    rage(actor: ChickenActor | null) {
        actor?.flash(new Color(220, 40, 30), 0.2);
        this.vignette(90);
        this.punch(0.3, 0.1);
    }

    enrage(actor: ChickenActor | null) {
        actor?.flash(new Color(255, 60, 40), 0.28);
        this.vignette(140);
        this.letterbox(true);
        this.punch(0.18, 0.16);
        const p = actor?.node.worldPosition;
        if (p) {
            this.impactFrame(p.x, p.y, "enrage");
            const local = this.toArena(p.x, p.y);
            this.shockAt(local.x, local.y - 36, 1.8);
            this.stamp(this.arenaFx, this.sheet.star, local.x, local.y + 20, 200, 200, 0.28, { grow: 1.4, color: new Color(255, 90, 70) });
        }
        this.delay(0.45, () => this.letterbox(false));
    }

    finish(win: boolean) {
        this.letterbox(true);
        this.punch(0.12, 0.22);
        this.layout();
        const { w, h } = this.size();
        this.ink.clear();
        this.ink.fillColor = win ? new Color(255, 236, 150, 40) : new Color(20, 8, 12, 70);
        this.ink.rect(-w / 2, -h / 2, w, h);
        this.ink.fill();
        this.stamp(this.overlay, this.sheet.focus, 0, 40, Math.min(w, h) * 1.15, Math.min(w, h) * 1.15, 0.35, {
            grow: 1.2,
            color: win ? new Color(255, 220, 120) : new Color(40, 20, 20)
        });
        this.fade.opacity = 255;
        tween(this.fade).to(0.35, { opacity: 0 }, { easing: "quadOut" }).start();
    }

    clear() {
        this.closed = true;
        this.restoreTime();
        this.root.off(Node.EventType.NODE_DESTROYED, this.clear, this);
        for (const n of [this.overlay, this.bars, this.veil, this.arenaFx]) {
            if (n?.isValid) {
                Tween.stopAllByTarget(n);
                const op = n.getComponent(UIOpacity);
                if (op) Tween.stopAllByTarget(op);
                n.destroy();
            }
        }
    }

    //#region 贴图

    private slashAt(x: number, y: number, direction: number, style: StrikeStyle, heavy: boolean) {
        const dir = direction >= 0 ? 1 : -1;
        const long = heavy ? 240 : style === "tail" ? 210 : 170;
        const thick = heavy ? 120 : 78;
        const tilt = style === "leap" || style === "dive" ? -28 : style === "tail" ? 22 : 8;
        this.stamp(this.arenaFx, this.sheet.slash, x, y + 16, long, thick, 0.2, {
            sx: dir,
            angle: dir * tilt,
            grow: 1.18,
            squash: 0.72
        });
    }

    private shockAt(x: number, y: number, power: number, delay = 0) {
        const s = 90 * power;
        this.stamp(this.arenaFx, this.sheet.ring, x, y, s, s * 0.38, 0.22 * power, {
            delay,
            grow: 1.85,
            squash: 0.55
        });
    }

    private cracksAt(x: number, y: number, direction: number, n: number) {
        const dir = direction >= 0 ? 1 : -1;
        for (let i = 0; i < n; i++) {
            const ox = dir * (20 + i * 36 + Math.random() * 24);
            const oy = (Math.random() - 0.5) * 28;
            this.stamp(this.arenaFx, this.sheet.crack, x + ox, y + oy, 160 + Math.random() * 80, 70, 0.42, {
                sx: dir,
                angle: (Math.random() - 0.5) * 24,
                delay: i * 0.03
            });
        }
    }

    private streaksAt(x: number, y: number, direction: number, count: number) {
        const dir = direction >= 0 ? 1 : -1;
        for (let i = 0; i < count; i++) {
            const oy = (i - (count - 1) / 2) * 18 + (Math.random() - 0.5) * 8;
            const w = 140 + Math.random() * 80;
            this.stamp(this.arenaFx, this.sheet.streak, x - dir * 20, y + oy, w, 36, 0.14, {
                sx: -dir,
                drift: -dir * 48,
                delay: i * 0.012
            });
        }
    }

    private stamp(
        parent: Node,
        frame: SpriteFrame | undefined,
        x: number,
        y: number,
        w: number,
        h: number,
        life: number,
        opt: {
            angle?: number; sx?: number; grow?: number; squash?: number;
            delay?: number; drift?: number; color?: Color;
        } = {}
    ) {
        if (!frame || !parent.isValid || this.closed || this.live >= 18) return;
        const node = new Node("FxStamp");
        node.layer = parent.layer;
        node.parent = parent;
        node.setPosition(x, y, 0);
        const sx = opt.sx ?? 1;
        node.setScale(sx * 0.55, 0.55, 1);
        node.angle = opt.angle ?? 0;
        const ui = node.addComponent(UITransform);
        ui.setContentSize(w, h);
        const sp = node.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.spriteFrame = frame;
        if (opt.color) sp.color = opt.color;
        const op = node.addComponent(UIOpacity);
        op.opacity = 0;
        this.live += 1;
        const grow = opt.grow ?? 1.12;
        const squash = opt.squash ?? 1;
        const delay = opt.delay ?? 0;
        const drift = opt.drift ?? 0;
        tween(op).delay(delay).to(0.04, { opacity: 255 })
            .delay(life * 0.35).to(life * 0.6, { opacity: 0 }).start();
        const motion = tween(node).delay(delay)
            .to(life * 0.35, { scale: v3(sx * grow, grow * squash, 1) }, { easing: "quadOut" });
        if (drift) motion.by(life * 0.65, { position: v3(drift, 0, 0) }, { easing: "quadOut" });
        else motion.to(life * 0.65, { scale: v3(sx * grow * 1.08, grow * squash * 0.85, 1) });
        motion.call(() => {
            this.live = Math.max(0, this.live - 1);
            if (node.isValid) node.destroy();
        }).start();
    }

    private impactFrame(worldX: number, worldY: number, kind: "crit" | "heavy" | "clash" | "enrage") {
        if (!this.overlay.isValid) return;
        this.layout();
        const { w, h } = this.size();
        const local = this.toOverlay(worldX, worldY);
        const g = this.ink;
        g.clear();
        if (kind === "clash") {
            g.fillColor = new Color(255, 255, 255, 255);
            g.rect(-w / 2 - 40, -h / 2 - 40, w + 80, h + 80);
            g.fill();
            this.fade.opacity = 255;
            tween(this.fade).to(0.04, { opacity: 0 }).call(() => {
                if (this.closed || !g.isValid) return;
                g.clear();
                g.fillColor = new Color(0, 0, 0, 180);
                g.rect(-w / 2 - 40, -h / 2 - 40, w + 80, h + 80);
                g.fill();
                this.stamp(this.overlay, this.sheet.focus, local.x, local.y, Math.min(w, h) * 1.2, Math.min(w, h) * 1.2, 0.16, { grow: 1.15 });
                this.fade.opacity = 255;
                tween(this.fade).delay(0.045).to(0.12, { opacity: 0 }, { easing: "quadOut" }).start();
            }).start();
            return;
        }
        const wash = kind === "enrage" ? new Color(90, 8, 8, 80)
            : kind === "crit" ? new Color(255, 220, 90, 42)
                : new Color(255, 250, 230, 24);
        g.fillColor = wash;
        g.rect(-w / 2 - 40, -h / 2 - 40, w + 80, h + 80);
        g.fill();
        const size = kind === "crit" ? Math.min(w, h) * 1.1 : Math.min(w, h) * 0.85;
        this.stamp(this.overlay, this.sheet.focus, local.x, local.y, size, size, kind === "crit" ? 0.22 : 0.16, {
            grow: 1.18,
            color: kind === "enrage" ? new Color(180, 40, 30) : new Color(40, 20, 16)
        });
        this.fade.opacity = 255;
        tween(this.fade).to(kind === "crit" ? 0.22 : 0.16, { opacity: 0 }, { easing: "quadOut" }).start();
    }

    //#endregion

    private letterbox(on: boolean) {
        if (!this.bars.isValid) return;
        const op = this.bars.getComponent(UIOpacity)!;
        const h = on ? 92 : 0;
        Tween.stopAllByTarget(op);
        tween(op).to(on ? 0.12 : 0.2, { opacity: on ? 255 : 0 }).start();
        tween(this.topBar.node).to(0.14, { position: v3(0, this.size().h / 2 - h / 2, 0) }).start();
        tween(this.botBar.node).to(0.14, { position: v3(0, -this.size().h / 2 + h / 2, 0) }).start();
        this.topBar.setContentSize(this.size().w + 40, Math.max(h, 4));
        this.botBar.setContentSize(this.size().w + 40, Math.max(h, 4));
        this.letter = on ? this.letter + 1 : Math.max(0, this.letter - 1);
    }

    private vignette(strength: number) {
        if (!this.veil.isValid) return;
        this.layout();
        const { w, h } = this.size();
        const g = this.veilInk;
        g.clear();
        const band = 120;
        g.fillColor = new Color(90, 0, 0, 160);
        g.rect(-w / 2, h / 2 - band, w, band);
        g.fill();
        g.rect(-w / 2, -h / 2, w, band);
        g.fill();
        g.fillColor = new Color(50, 0, 0, 90);
        g.rect(-w / 2, -h / 2, 70, h);
        g.fill();
        g.rect(w / 2 - 70, -h / 2, 70, h);
        g.fill();
        Tween.stopAllByTarget(this.veilFade);
        this.veilFade.opacity = 0;
        tween(this.veilFade)
            .to(0.12, { opacity: strength })
            .to(0.18, { opacity: strength * 0.55 })
            .to(0.18, { opacity: strength })
            .to(0.18, { opacity: strength * 0.6 })
            .start();
    }

    private punch(scale: number, realSec: number) {
        this.punching += 1;
        director.getScheduler().setTimeScale(scale);
        const hold = Math.max(40, Math.round(realSec * 1000));
        setTimeout(() => {
            this.punching = Math.max(0, this.punching - 1);
            if (this.punching === 0) this.restoreTime();
        }, hold);
    }

    private restoreTime() {
        this.punching = 0;
        try {
            director.getScheduler().setTimeScale(1);
        }
        catch {
            /* 退出时调度器可能已拆 */
        }
    }

    private bar(sign: number) {
        const n = new Node(sign > 0 ? "BarTop" : "BarBot");
        n.layer = this.bars.layer;
        n.parent = this.bars;
        const ui = n.addComponent(UITransform);
        ui.setContentSize(800, 4);
        const g = n.addComponent(Graphics);
        g.fillColor = new Color(0, 0, 0, 255);
        g.rect(-1000, -80, 2000, 160);
        g.fill();
        const { h } = this.size();
        n.setPosition(0, sign * (h / 2 - 2), 0);
        return ui;
    }

    private makeLayer(name: string, parent: Node, z: number) {
        const n = new Node(name);
        n.layer = parent.layer;
        n.parent = parent;
        n.setSiblingIndex(Math.max(0, parent.children.length - 1));
        n.addComponent(UITransform);
        n.setPosition(0, 0, z);
        return n;
    }

    private layout() {
        const box = this.root.getComponent(UITransform);
        if (!box) return;
        const w = box.width, h = box.height;
        const x = (0.5 - box.anchorX) * w;
        const y = (0.5 - box.anchorY) * h;
        for (const n of [this.overlay, this.bars, this.veil]) {
            if (!n.isValid) continue;
            n.getComponent(UITransform)!.setContentSize(w, h);
            n.setPosition(x, y, n.position.z);
            n.setSiblingIndex(Math.max(0, this.root.children.length - 1));
        }
    }

    private size() {
        const box = this.root.getComponent(UITransform);
        return { w: box?.width ?? 720, h: box?.height ?? 1280 };
    }

    private toArena(worldX: number, worldY: number) {
        return this.arena.getComponent(UITransform)!.convertToNodeSpaceAR(v3(worldX, worldY, 0));
    }

    private toOverlay(worldX: number, worldY: number) {
        return this.overlay.getComponent(UITransform)!.convertToNodeSpaceAR(v3(worldX, worldY, 0));
    }

    private delay(sec: number, fn: () => void) {
        tween(this.overlay).delay(sec).call(() => { if (!this.closed) fn(); }).start();
    }
}
