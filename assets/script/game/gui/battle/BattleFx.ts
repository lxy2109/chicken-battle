import { Color, Graphics, Label, Node, Sprite, SpriteFrame, Tween, UIOpacity, UITransform, director, tween, v3 } from "cc";
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
    skills?: Partial<Record<StrikeStyle, SpriteFrame>>;
    skillBgs?: Partial<Record<StrikeStyle, SpriteFrame>>;
    rays?: SpriteFrame;
    flare?: SpriteFrame;
    banner?: SpriteFrame;
    sparks?: SpriteFrame;
}

type SplashEnter = "side" | "up" | "down" | "zoom" | "spin" | "feint" | "pulse";
type SplashMode = "full" | "half";
type EaseName = "linear" | "quadIn" | "quadOut" | "cubicIn" | "cubicOut" | "quartIn" | "quartOut"
    | "sineOut" | "sineInOut" | "expoIn" | "expoOut" | "circIn" | "circOut" | "backOut" | "elasticOut" | "bounceOut";

interface SkillLook {
    rgb: [number, number, number];
    enter: SplashEnter;
    ghosts: number;
    inTime: number;
    hold: number;
    outTime: number;
    inEase: EaseName;
    bgFrom: number;
    bgTo: number;
}

/** 每招自己的进出曲线，不能共用同一段 quadOut。 */
const SKILL_LOOK: Record<StrikeStyle, SkillLook> = {
    peck: { rgb: [255, 196, 72], enter: "zoom", ghosts: 0, inTime: 0.22, hold: 0.36, outTime: 0.16, inEase: "backOut", bgFrom: 1.02, bgTo: 1.06 },
    jump: { rgb: [255, 220, 110], enter: "up", ghosts: 1, inTime: 0.3, hold: 0.62, outTime: 0.2, inEase: "sineOut", bgFrom: 1.08, bgTo: 1 },
    dive: { rgb: [110, 190, 255], enter: "down", ghosts: 1, inTime: 0.2, hold: 0.48, outTime: 0.18, inEase: "expoIn", bgFrom: 0.96, bgTo: 1.05 },
    leap: { rgb: [255, 120, 48], enter: "down", ghosts: 1, inTime: 0.32, hold: 0.52, outTime: 0.2, inEase: "cubicIn", bgFrom: 1.12, bgTo: 1 },
    charge: { rgb: [255, 150, 60], enter: "side", ghosts: 1, inTime: 0.16, hold: 0.44, outTime: 0.16, inEase: "circIn", bgFrom: 1.04, bgTo: 1 },
    tail: { rgb: [90, 220, 170], enter: "spin", ghosts: 1, inTime: 0.28, hold: 0.5, outTime: 0.2, inEase: "cubicOut", bgFrom: 1, bgTo: 1.07 },
    combo: { rgb: [255, 230, 90], enter: "pulse", ghosts: 3, inTime: 0.42, hold: 0.38, outTime: 0.16, inEase: "quadOut", bgFrom: 1.06, bgTo: 1.02 },
    feint: { rgb: [180, 120, 255], enter: "feint", ghosts: 1, inTime: 0.24, hold: 0.46, outTime: 0.18, inEase: "expoOut", bgFrom: 1.1, bgTo: 1 }
};

/**
 * 战斗电影感：斩痕贴图、冲击波、残影、竖屏招式立绘。
 * 绝招走竖屏全屏/半屏，不再叠黑框宽银幕和暗色闪屏。
 */
export class BattleFx {
    private overlay: Node;
    private ink: Graphics;
    private fade: UIOpacity;
    private veil: Node;
    private veilInk: Graphics;
    private veilFade: UIOpacity;
    private arenaFx: Node;
    private punching = 0;
    private closed = false;
    private live = 0;
    private splash: Node | null = null;
    private cinema: Node;
    private veilHold = 0;

    constructor(private root: Node, private arena: Node, private sheet: BattleFxSheet) {
        this.overlay = this.makeLayer("BattleFxOverlay", root, 1);
        this.ink = this.overlay.addComponent(Graphics);
        this.fade = this.overlay.addComponent(UIOpacity);
        this.fade.opacity = 255;

        this.cinema = this.makeLayer("SkillCinema", root, 1);

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

    /** 按地图铺一层薄色，换图时场地立刻不像上一场。 */
    wash(rgb: [number, number, number], heavy = false) {
        if (!this.veil.isValid) return;
        this.layout();
        const { w, h } = this.size();
        const g = this.veilInk;
        g.clear();
        const [r, gch, b] = rgb;
        const band = heavy ? 150 : 110;
        g.fillColor = new Color(r, gch, b, heavy ? 90 : 48);
        g.rect(-w / 2, h / 2 - band, w, band);
        g.fill();
        g.rect(-w / 2, -h / 2, w, band);
        g.fill();
        g.fillColor = new Color(r, gch, b, heavy ? 40 : 22);
        g.rect(-w / 2, -h / 2, 56, h);
        g.fill();
        g.rect(w / 2 - 56, -h / 2, 56, h);
        g.fill();
        this.veilHold = heavy ? 200 : 140;
        this.veilFade.opacity = this.splash ? 0 : this.veilHold;
    }

    skillCharge(actor: ChickenActor | null) {
        actor?.ghost(new Color(255, 230, 180));
        const p = actor?.node.worldPosition;
        if (!p) return;
        const local = this.toArena(p.x, p.y);
        this.stamp(this.arenaFx, this.sheet.charge, local.x, local.y + 8, 90, 90, 0.28, { grow: 1.7, squash: 0.75 });
    }

    skillWindup(actor: ChickenActor | null, style: StrikeStyle, title: string, fromRight = false, mode: SplashMode = "full") {
        this.skillCharge(actor);
        this.skillSplash(style, title, fromRight, mode);
    }

    hit(worldX: number, worldY: number, direction: number, style: StrikeStyle, heavy: boolean, crit: boolean) {
        const p = this.toArena(worldX, worldY);
        this.slashAt(p.x, p.y, direction, style, heavy || crit);
        this.shockAt(p.x, p.y - 36, crit ? 1.35 : heavy ? 1.1 : 0.7);
        if (crit) {
            this.punch(0.16, 0.22);
            this.stamp(this.arenaFx, this.sheet.star, p.x, p.y + 12, 170, 170, 0.22, { grow: 1.25, angle: (Math.random() - 0.5) * 40 });
            this.stamp(this.arenaFx, this.sheet.ink, p.x + direction * 18, p.y, 140, 140, 0.2, { sx: direction, grow: 1.2 });
            this.cracksAt(p.x, p.y - 48, direction, 3);
        }
        else if (heavy) {
            this.punch(0.28, 0.09);
            this.stamp(this.arenaFx, this.sheet.star, p.x, p.y + 8, 120, 120, 0.18, { grow: 1.15, angle: (Math.random() - 0.5) * 50 });
            this.cracksAt(p.x, p.y - 48, direction, 2);
        }
        else if (style === "peck" || style === "combo") {
            this.streaksAt(p.x, p.y, direction, 3);
        }
    }

    clash(worldX: number, worldY: number) {
        this.punch(0.14, 0.14);
        const p = this.toArena(worldX, worldY);
        this.stamp(this.arenaFx, this.sheet.star, p.x, p.y + 16, 220, 220, 0.26, { grow: 1.35 });
        this.stamp(this.arenaFx, this.sheet.ink, p.x, p.y, 180, 180, 0.24, { grow: 1.3, angle: 25 });
        this.shockAt(p.x, p.y - 40, 1.6);
        this.shockAt(p.x, p.y - 40, 1.05, 0.06);
        this.cracksAt(p.x, p.y - 48, 1, 3);
        this.cracksAt(p.x, p.y - 48, -1, 3);
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
        this.punch(0.18, 0.16);
        const p = actor?.node.worldPosition;
        if (p) {
            const local = this.toArena(p.x, p.y);
            this.shockAt(local.x, local.y - 36, 1.8);
            this.stamp(this.arenaFx, this.sheet.star, local.x, local.y + 20, 200, 200, 0.28, { grow: 1.4, color: new Color(255, 90, 70) });
        }
    }

    finish(win: boolean) {
        this.punch(0.12, 0.22);
        this.layout();
        const { w, h } = this.size();
        this.ink.clear();
        this.ink.fillColor = win ? new Color(255, 236, 150, 28) : new Color(20, 8, 12, 50);
        this.ink.rect(-w / 2, -h / 2, w, h);
        this.ink.fill();
        this.stamp(this.overlay, this.sheet.focus, 0, 40, Math.min(w, h) * 1.15, Math.min(w, h) * 1.15, 0.35, {
            grow: 1.2,
            color: win ? new Color(255, 220, 120) : new Color(40, 20, 20)
        });
        this.fade.opacity = 180;
        tween(this.fade).to(0.35, { opacity: 255 }, { easing: "quadOut" }).start();
    }

    clear() {
        this.closed = true;
        this.restoreTime();
        this.root.off(Node.EventType.NODE_DESTROYED, this.clear, this);
        this.dropSplash();
        for (const n of [this.overlay, this.veil, this.arenaFx, this.cinema]) {
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
        const long = heavy ? 240 : style === "tail" ? 210 : style === "feint" ? 150 : 170;
        const thick = heavy ? 120 : style === "jump" ? 64 : 78;
        const tilt = style === "leap" || style === "dive" ? -48 : style === "tail" ? 28 : style === "charge" ? 4 : 8;
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

    /** 竖屏全屏或半屏：底板原地呼吸，主体按招式曲线单独入场。 */
    private skillSplash(style: StrikeStyle, title: string, fromRight: boolean, mode: SplashMode) {
        if (!this.overlay.isValid || this.closed) return;
        this.dropSplash();
        this.layout();
        const { w, h } = this.size();
        const look = SKILL_LOOK[style];
        const tint = new Color(look.rgb[0], look.rgb[1], look.rgb[2]);
        const dir = fromRight ? 1 : -1;
        const half = mode === "half";
        const hero = this.sheet.skills?.[style];
        const bgFrame = this.sheet.skillBgs?.[style];
        const hold = look.hold * (half ? 0.82 : 1);
        const fadeOut = look.outTime;
        const cx = half ? dir * w * 0.16 : 0;
        const artY = half ? 24 : 0;
        const bw = half ? w * 0.72 : w;
        const bh = half ? h * 0.78 : h;

        const root = new Node("SkillSplash");
        root.layer = this.cinema.layer;
        root.parent = this.cinema;
        root.addComponent(UITransform).setContentSize(w, h);
        const fade = root.addComponent(UIOpacity);
        fade.opacity = 0;
        this.splash = root;
        this.hideVeil();

        const scene = this.piece(root, bgFrame, bw, bh, cx, artY, { scale: look.bgFrom, opacity: 0 });
        if (scene) {
            tween(scene.op).to(0.14, { opacity: half ? 210 : 255 }).delay(hold).to(fadeOut, { opacity: 0 }).start();
            tween(scene.node).to(look.inTime + hold, { scale: v3(look.bgTo, look.bgTo, 1) }, { easing: "sineInOut" }).start();
        }

        const rays = this.piece(root, this.sheet.rays, half ? w * 0.8 : w * 1.35, half ? h * 0.8 : h * 1.15, cx, artY, { scale: 0.52, color: tint, opacity: 0 });
        if (rays) {
            tween(rays.op).to(0.12, { opacity: half ? 160 : 210 }).delay(hold).to(fadeOut, { opacity: 0 }).start();
            tween(rays.node).to(0.26, { scale: v3(1.18, 1.18, 1) }, { easing: "quadOut" })
                .by(hold, { angle: dir * 10 }).start();
        }

        const flare = this.piece(root, this.sheet.flare, bh * 1.45, bh * 1.45, cx, artY, { scale: 0.35, color: tint, opacity: 0 });
        if (flare) {
            tween(flare.op).to(0.1, { opacity: 230 }).delay(hold).to(fadeOut, { opacity: 0 }).start();
            tween(flare.node).to(0.18, { scale: v3(1.08, 1.08, 1) }, { easing: "quadOut" })
                .to(0.16, { scale: v3(0.9, 0.9, 1) })
                .to(0.16, { scale: v3(1.12, 1.12, 1) }).start();
        }

        const ring = this.piece(root, this.sheet.ring || this.sheet.charge, bw * 0.62, bh * 0.3, cx, artY - bh * 0.32, {
            scale: 0.35, color: tint, opacity: 0
        });
        if (ring) {
            tween(ring.op).delay(0.06).to(0.08, { opacity: 200 }).to(0.28, { opacity: 0 }).start();
            tween(ring.node).delay(0.06).to(0.36, { scale: v3(1.7, 1.15, 1) }, { easing: "quadOut" }).start();
        }

        let startX = cx, startY = artY, startScale = 0.86, startAngle = 0;
        if (look.enter === "side") startX = cx + dir * w * (half ? 0.42 : 0.64);
        else if (look.enter === "up") startY = artY - h * (half ? 0.28 : 0.38);
        else if (look.enter === "down") startY = artY + h * (half ? 0.32 : 0.42);
        else if (look.enter === "zoom") startScale = 1.38;
        else if (look.enter === "pulse") startScale = 1.22;
        else if (look.enter === "spin") {
            startX = cx + dir * w * 0.28;
            startAngle = -dir * 70;
        }
        else if (look.enter === "feint") {
            startX = cx - dir * w * (half ? 0.36 : 0.55);
            startScale = 0.78;
        }

        if (look.enter === "feint") {
            const decoy = this.piece(root, hero, bw, bh, cx + dir * w * 0.42, artY, { scale: 0.9, opacity: 0, color: tint });
            if (decoy) {
                tween(decoy.op).to(0.08, { opacity: 140 }).delay(0.08).to(0.12, { opacity: 0 }).start();
                tween(decoy.node).to(0.16, { position: v3(cx + dir * 28, artY, 0) }, { easing: "quartOut" }).start();
            }
        }

        for (let i = 0; i < look.ghosts; i++) {
            const ox = (i - (look.ghosts - 1) / 2) * 36 * dir;
            const ghost = this.piece(root, hero, bw, bh, startX + ox, startY, {
                scale: startScale * 0.92, opacity: 0, color: tint, angle: startAngle
            });
            if (!ghost) continue;
            tween(ghost.op).delay(0.03 * i).to(0.1, { opacity: 90 }).delay(0.12).to(0.18, { opacity: 0 }).start();
            tween(ghost.node).delay(0.03 * i)
                .to(look.inTime * 0.85, { position: v3(cx + ox, artY, 0), scale: v3(1.02, 1.02, 1), angle: 0 }, { easing: look.inEase }).start();
        }

        const art = this.piece(root, hero, bw, bh, startX, startY, { scale: startScale, angle: startAngle });
        if (art) this.playHeroEnter(art.node, look, cx, artY, dir, hold);

        const streakFrame = this.sheet.streak;
        for (let i = 0; i < (half ? 3 : 5); i++) {
            const oy = (i - 2) * 28;
            const streak = this.piece(root, streakFrame, 220 + i * 18, 38, cx - dir * 80, artY + oy, {
                scale: 0.6, opacity: 0, angle: (i - 2) * 6, color: tint
            });
            if (!streak) continue;
            streak.node.setScale(-dir * 0.6, 0.6, 1);
            tween(streak.op).delay(0.02 * i).to(0.06, { opacity: 210 }).to(0.16, { opacity: 0 }).start();
            tween(streak.node).delay(0.02 * i).by(0.22, { position: v3(-dir * 90, 0, 0) }, { easing: "quadOut" }).start();
        }

        const sparkFrame = this.sheet.sparks || this.sheet.star;
        const sparkSpot = [[-0.32, 0.22], [0.3, 0.18], [-0.18, -0.2], [0.26, -0.16], [0, 0.32], [0.08, -0.28]];
        for (let i = 0; i < sparkSpot.length; i++) {
            const [nx, ny] = sparkSpot[i];
            const spark = this.piece(root, sparkFrame, 90, 90, cx + nx * bw, artY + ny * bh, {
                scale: 0.2, opacity: 0, angle: i * 28, color: tint
            });
            if (!spark) continue;
            tween(spark.op).delay(0.05 + i * 0.03).to(0.06, { opacity: 255 }).delay(0.1).to(0.16, { opacity: 0 }).start();
            tween(spark.node).delay(0.05 + i * 0.03)
                .to(0.12, { scale: v3(1.15, 1.15, 1) }, { easing: "backOut" })
                .to(0.16, { scale: v3(0.4, 0.4, 1) }).start();
        }

        if (style === "charge" || style === "leap" || style === "dive") {
            const slash = this.piece(root, this.sheet.slash, bw * 0.9, bh * 0.45, cx + dir * 20, artY, {
                scale: 0.4, opacity: 0, angle: style === "leap" || style === "dive" ? -dir * 42 : dir * 8
            });
            if (slash) {
                slash.node.setScale(dir * 0.4, 0.4, 1);
                tween(slash.op).delay(look.inTime * 0.55).to(0.05, { opacity: 230 }).to(0.16, { opacity: 0 }).start();
                tween(slash.node).delay(look.inTime * 0.55).to(0.14, { scale: v3(dir * 1.1, 0.85, 1) }, { easing: "quartOut" }).start();
            }
        }
        if (style === "combo" || style === "peck") {
            const ink = this.piece(root, this.sheet.ink || this.sheet.star, 160, 160, cx + dir * 48, artY + 12, {
                scale: 0.3, opacity: 0, color: tint
            });
            if (ink) {
                tween(ink.op).delay(0.08).to(0.06, { opacity: 200 }).to(0.18, { opacity: 0 }).start();
                tween(ink.node).delay(0.08).to(0.2, { scale: v3(1.2, 1.2, 1) }, { easing: "quadOut" }).start();
            }
        }
        if (style === "leap") {
            const crack = this.piece(root, this.sheet.crack, bw * 0.7, 80, cx, artY - bh * 0.42, { scale: 0.4, opacity: 0 });
            if (crack) {
                tween(crack.op).delay(look.inTime).to(0.06, { opacity: 200 }).to(0.22, { opacity: 0 }).start();
                tween(crack.node).delay(look.inTime).to(0.16, { scale: v3(1.1, 0.9, 1) }, { easing: "bounceOut" }).start();
            }
        }

        const bannerY = half ? artY - bh * 0.36 : -h * 0.34;
        const banner = this.piece(root, this.sheet.banner, bw * 0.86, half ? 72 : 96, cx, bannerY - 30, { scale: 0.7, opacity: 0 });
        if (banner) {
            tween(banner.op).delay(0.1).to(0.1, { opacity: 255 }).delay(hold - 0.08).to(fadeOut, { opacity: 0 }).start();
            tween(banner.node).delay(0.1).to(0.14, { position: v3(cx, bannerY, 0), scale: v3(1, 1, 1) }, { easing: "backOut" }).start();
        }

        const name = new Node("Title");
        name.layer = root.layer;
        name.parent = root;
        const label = name.addComponent(Label);
        label.string = title;
        label.fontSize = half ? (title.length > 7 ? 28 : 34) : (title.length > 7 ? 40 : 50);
        label.lineHeight = half ? 42 : 60;
        label.color = new Color(255, 244, 180);
        label.enableOutline = true;
        label.outlineColor = new Color(48, 18, 8);
        label.outlineWidth = 4;
        label.updateRenderData(true);
        name.setPosition(cx, bannerY + 6, 0);
        name.setScale(1.4, 1.4, 1);
        const nameFade = name.addComponent(UIOpacity);
        nameFade.opacity = 0;
        tween(nameFade).delay(0.14).to(0.08, { opacity: 255 }).delay(hold - 0.1).to(fadeOut, { opacity: 0 }).start();
        tween(name).delay(0.14).to(0.12, { scale: v3(1, 1, 1) }, { easing: "backOut" }).start();

        tween(fade).to(0.08, { opacity: 255 }).delay(look.inTime + hold).to(fadeOut, { opacity: 0 }, { easing: "quadOut" })
            .call(() => this.dropSplash()).start();
    }

    private playHeroEnter(node: Node, look: SkillLook, destX: number, destY: number, dir: number, hold: number) {
        const motion = tween(node);
        if (look.enter === "zoom") {
            motion.to(0.08, { scale: v3(0.9, 0.9, 1) }, { easing: "quadIn" })
                .to(0.12, { scale: v3(1.12, 1.12, 1) }, { easing: "backOut" })
                .to(0.08, { scale: v3(1, 1, 1) }, { easing: "quadOut" });
        }
        else if (look.enter === "pulse") {
            motion.to(0.08, { position: v3(destX, destY, 0), scale: v3(1.2, 1.2, 1) }, { easing: "quadOut" })
                .to(0.07, { scale: v3(0.9, 0.9, 1) }, { easing: "quadIn" })
                .to(0.08, { scale: v3(1.16, 1.16, 1) }, { easing: "quadOut" })
                .to(0.07, { scale: v3(0.94, 0.94, 1) }, { easing: "quadIn" })
                .to(0.1, { scale: v3(1.04, 1.04, 1) }, { easing: "backOut" })
                .to(0.06, { scale: v3(1, 1, 1) }, { easing: "quadOut" });
        }
        else if (look.enter === "up") {
            motion.to(look.inTime, { position: v3(destX, destY + 16, 0), scale: v3(1.08, 1.08, 1) }, { easing: "sineOut" })
                .to(0.12, { position: v3(destX, destY, 0), scale: v3(1, 1, 1) }, { easing: "quadOut" })
                .by(hold, { position: v3(0, 10, 0) }, { easing: "sineInOut" });
        }
        else if (look.enter === "down") {
            const squash = look.inEase === "cubicIn" ? v3(1.22, 0.72, 1) : v3(1.16, 0.8, 1);
            motion.to(look.inTime, { position: v3(destX, destY, 0), scale: squash }, { easing: look.inEase })
                .to(0.14, { scale: v3(1, 1, 1) }, { easing: look.inEase === "cubicIn" ? "elasticOut" : "bounceOut" });
        }
        else if (look.enter === "side") {
            motion.to(look.inTime, { position: v3(destX - dir * 36, destY, 0), scale: v3(1.18, 0.88, 1) }, { easing: "circIn" })
                .to(0.14, { position: v3(destX, destY, 0), scale: v3(1, 1, 1) }, { easing: "cubicOut" });
        }
        else if (look.enter === "spin") {
            motion.to(look.inTime, { position: v3(destX, destY, 0), angle: dir * 14, scale: v3(1.06, 1.06, 1) }, { easing: "cubicOut" })
                .to(0.16, { angle: -dir * 8, scale: v3(1, 1, 1) }, { easing: "sineOut" })
                .by(hold, { angle: dir * 10 }, { easing: "sineInOut" });
        }
        else {
            motion.to(look.inTime, { position: v3(destX, destY, 0), scale: v3(1.08, 1.08, 1) }, { easing: "expoOut" })
                .to(0.1, { scale: v3(1, 1, 1) }, { easing: "quadOut" });
        }
        motion.start();
    }

    private piece(
        parent: Node,
        frame: SpriteFrame | undefined,
        w: number,
        h: number,
        x: number,
        y: number,
        opt: { angle?: number; scale?: number; color?: Color; opacity?: number } = {}
    ) {
        if (!frame || !parent.isValid) return null;
        const node = new Node("Piece");
        node.layer = parent.layer;
        node.parent = parent;
        node.setPosition(x, y, 0);
        const s = opt.scale ?? 1;
        node.setScale(s, s, 1);
        node.angle = opt.angle ?? 0;
        node.addComponent(UITransform).setContentSize(w, h);
        const sp = node.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.spriteFrame = frame;
        if (opt.color) sp.color = opt.color;
        const op = node.addComponent(UIOpacity);
        op.opacity = opt.opacity ?? 255;
        return { node, op };
    }

    private dropSplash() {
        if (!this.splash) return;
        const node = this.splash;
        this.splash = null;
        const stop = (n: Node) => {
            Tween.stopAllByTarget(n);
            const op = n.getComponent(UIOpacity);
            if (op) Tween.stopAllByTarget(op);
            for (const child of n.children) stop(child);
        };
        stop(node);
        if (node.isValid) node.destroy();
        this.showVeil();
    }

    private hideVeil() {
        if (!this.veilFade.isValid) return;
        Tween.stopAllByTarget(this.veilFade);
        this.veilFade.opacity = 0;
    }

    private showVeil() {
        if (!this.veilFade.isValid) return;
        Tween.stopAllByTarget(this.veilFade);
        this.veilFade.opacity = this.veilHold;
    }

    //#endregion

    private vignette(strength: number) {
        if (!this.veil.isValid || this.splash) return;
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
        for (const n of [this.veil, this.overlay, this.cinema]) {
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
}
