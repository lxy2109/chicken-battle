import {
    Color, Graphics, Label, Node, ParticleSystem2D, Prefab, Sprite, SpriteFrame,
    Tween, UIOpacity, UITransform, Vec2, Widget, director, instantiate, tween, v3
} from "cc";
import { ChickenActor } from "../../battle/ChickenActor";
import { ArenaFlourish } from "../../domain/BattleStyle";
import { StrikeStyle } from "../../domain/Types";
import { playSkillAnnounce } from "../shared/GameAudio";
import { UIBgAdaptation } from "../shared/UIBgAdaptation";

/** 全屏氛围：可叠加，替代旧的色块黄框。 */
export type AmbientKind = ArenaFlourish | "rain" | "ash" | "mist";

interface AmbientSpec {
    kind: AmbientKind;
    /** 0..1 强度，多层可叠。 */
    weight: number;
}

interface ParticleSlot {
    name: string;
    node: Node;
    ps: ParticleSystem2D;
    baseRate: number;
}

export interface BattleFxSheet {
    slash?: SpriteFrame;
    star?: SpriteFrame;
    ring?: SpriteFrame;
    streak?: SpriteFrame;
    focus?: SpriteFrame;
    crack?: SpriteFrame;
    ink?: SpriteFrame;
    charge?: SpriteFrame;
    /** 全屏氛围粒子预制体（每种一个）。 */
    ambientPrefabs?: Partial<Record<AmbientKind, Prefab>>;
    skillPrefabs?: Partial<Record<StrikeStyle, Prefab>>;
    skillMiniPrefabs?: Partial<Record<StrikeStyle, Prefab>>;
}

type SplashEnter = "side" | "up" | "down" | "zoom" | "spin" | "feint" | "pulse";
type SplashMode = "full" | "half";
type EaseName = "linear" | "quadIn" | "quadOut" | "cubicIn" | "cubicOut" | "quartIn" | "quartOut"
    | "sineOut" | "sineInOut" | "expoIn" | "expoOut" | "circIn" | "circOut" | "backOut" | "elasticOut" | "bounceOut";

interface SkillLook {
    rgb: [number, number, number];
    enter: SplashEnter;
    inTime: number;
    hold: number;
    outTime: number;
    inEase: EaseName;
    bgFrom: number;
    bgTo: number;
}

/** 每招主色与进出曲线；场地绝招特效 / 飘字都跟这套色。 */
const SKILL_LOOK: Record<StrikeStyle, SkillLook> = {
    peck: { rgb: [255, 196, 72], enter: "zoom", inTime: 0.22, hold: 0.36, outTime: 0.16, inEase: "backOut", bgFrom: 1.02, bgTo: 1.06 },
    jump: { rgb: [255, 220, 110], enter: "up", inTime: 0.3, hold: 0.62, outTime: 0.2, inEase: "sineOut", bgFrom: 1.08, bgTo: 1 },
    dive: { rgb: [110, 190, 255], enter: "down", inTime: 0.2, hold: 0.48, outTime: 0.18, inEase: "expoIn", bgFrom: 0.96, bgTo: 1.05 },
    leap: { rgb: [255, 120, 48], enter: "down", inTime: 0.32, hold: 0.52, outTime: 0.2, inEase: "cubicIn", bgFrom: 1.12, bgTo: 1 },
    charge: { rgb: [255, 150, 60], enter: "side", inTime: 0.16, hold: 0.44, outTime: 0.16, inEase: "circIn", bgFrom: 1.04, bgTo: 1 },
    tail: { rgb: [90, 220, 170], enter: "spin", inTime: 0.28, hold: 0.5, outTime: 0.2, inEase: "cubicOut", bgFrom: 1, bgTo: 1.07 },
    combo: { rgb: [255, 230, 90], enter: "pulse", inTime: 0.42, hold: 0.38, outTime: 0.16, inEase: "quadOut", bgFrom: 1.06, bgTo: 1.02 },
    feint: { rgb: [180, 120, 255], enter: "feint", inTime: 0.24, hold: 0.46, outTime: 0.18, inEase: "expoOut", bgFrom: 1.1, bgTo: 1 }
};

/** 招式主色，给飘字 / 命中染色。 */
export function strikeFxColor(style: StrikeStyle): Color {
    const [r, g, b] = SKILL_LOOK[style].rgb;
    return new Color(r, g, b, 255);
}

/**
 * 战斗电影感：斩痕、冲击波、残影、绝招场上爆发。
 * 绝招不再播全屏/半屏立绘，反馈压在鸡与场地粒子上；招名由界面飘字 + 喊招音效承担。
 */
/** 同时在场的粒子爆发上限。 */
const BURST_CAP = 28;

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
    private liveSplash: Partial<Record<SplashMode, Node>> = {};
    private cinema: Node;
    private veilHold = 0;
    private dust: [number, number, number] = [255, 220, 140];
    private ambients: AmbientSpec[] = [];
    private ambientSlots: Array<ParticleSlot & { kind: AmbientKind; weight: number }> = [];

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

    /** 这一关的扬尘色，普攻斩痕和落地点跟着换。 */
    paint(dust: [number, number, number]) {
        this.dust = dust;
    }

    /**
     * 普攻起手：一小圈蓄力、一两道速度线、一层残影。
     * 绝招走 skillCharge / skillLaunch，这里只交代普攻方向和颜色。
     */
    basicWindup(actor: ChickenActor | null, style: StrikeStyle, fromRight = false) {
        const look = SKILL_LOOK[style];
        const tint = new Color(look.rgb[0], look.rgb[1], look.rgb[2]);
        actor?.ghost(tint);
        if (style === "charge" || style === "leap" || style === "feint") {
            actor?.ghost(new Color(this.dust[0], this.dust[1], this.dust[2]));
        }
        const p = actor?.node.worldPosition;
        if (!p) return;
        const local = this.toArena(p.x, p.y);
        const dir = fromRight ? 1 : -1;
        this.stamp(this.arenaFx, this.sheet.charge, local.x, local.y - 6, 72, 72, 0.18, {
            grow: 1.5, squash: 0.78, color: tint
        });
        if (style === "jump" || style === "leap" || style === "dive") {
            this.dustAt(local.x, local.y - 30, 0.7);
        }
        if (style === "charge" || style === "combo" || style === "peck" || style === "tail") {
            this.streaksAt(local.x, local.y, -dir, style === "charge" ? 4 : 2);
        }
    }

    /**
     * 全屏氛围层：下雨 / 落叶 / 扬尘等可叠加。
     * 每种氛围走独立 ParticleSystem2D 预制体。
     */
    ambience(layers: Array<AmbientKind | AmbientSpec>) {
        this.ambients = layers.map(l => typeof l === "string" ? { kind: l, weight: 1 } : {
            kind: l.kind,
            weight: Math.max(0, l.weight ?? 1)
        }).filter(l => l.weight > 0.01);
        this.clearAmbientSlots();
        this.layout();
        if (!this.veil.isValid) return;
        const g = this.veilInk;
        g.clear();
        const { w, h } = this.size();
        const heavy = this.ambients.some(a => a.kind === "rain" || a.kind === "ember" || a.kind === "ash");
        if (heavy) {
            g.fillColor = new Color(12, 18, 28, 28);
            g.rect(-w / 2, -h / 2, w, h);
            g.fill();
        }
        this.veilHold = this.ambients.length ? (heavy ? 255 : 200) : 0;
        this.veilFade.opacity = this.veilHold;
        this.mountAmbientPrefabs();
        this.layoutAmbientEmitters();
    }

    /** @deprecated 旧色块边框已废弃，改走 ambience。 */
    wash(_rgb: [number, number, number], heavy = false) {
        this.ambience(heavy ? ["rain", "mist"] : ["mist"]);
    }

    /** 氛围由 ParticleSystem2D 自模拟。 */
    tickAmbient(_dt: number) {
        if (!this.veil.isValid || !this.ambientSlots.length) return;
        for (const slot of this.ambientSlots) {
            if (!slot.ps.isValid) continue;
            slot.ps.emissionRate = slot.baseRate * slot.weight;
        }
    }

    /**
     * 绝招起手：招式色蓄力圈 + 双残影 + 焦点，全部贴在鸡身上，场地全程可见。
     */
    skillCharge(actor: ChickenActor | null, style: StrikeStyle = "peck") {
        const look = SKILL_LOOK[style];
        const tint = new Color(look.rgb[0], look.rgb[1], look.rgb[2]);
        const hot = new Color(
            Math.min(255, look.rgb[0] + 40),
            Math.min(255, look.rgb[1] + 28),
            Math.min(255, look.rgb[2] + 18)
        );
        actor?.ghost(hot);
        actor?.ghost(tint);
        const p = actor?.node.worldPosition;
        if (!p) return;
        const local = this.toArena(p.x, p.y);
        this.stamp(this.arenaFx, this.sheet.charge, local.x, local.y + 8, 110, 110, 0.32, {
            grow: 1.9, squash: 0.7, color: tint
        });
        this.stamp(this.arenaFx, this.sheet.focus, local.x, local.y + 14, 190, 190, 0.3, {
            grow: 1.45, color: new Color(look.rgb[0], look.rgb[1], look.rgb[2], 230)
        });
        this.stamp(this.arenaFx, this.sheet.star, local.x, local.y + 22, 100, 100, 0.22, {
            grow: 1.4, color: tint, angle: (Math.random() - 0.5) * 36
        });
        // 脚底扬尘代替冲击环，避免场上飘半透明圆圈
        this.dustAt(local.x, local.y - 28, 0.95);
        this.dustAt(local.x, local.y - 22, 0.7, 0.1);
        this.stamp(this.arenaFx, this.sheet.charge, local.x, local.y + 4, 72, 72, 0.2, {
            grow: 2.2, squash: 0.75, color: hot, delay: 0.1
        });
    }

    /**
     * 冲刺出手瞬间：速度线 + 焦点从鸡身上甩出去，和随后的命中连成一条线。
     */
    skillLaunch(actor: ChickenActor | null, style: StrikeStyle, fromRight = false) {
        const look = SKILL_LOOK[style];
        const tint = new Color(look.rgb[0], look.rgb[1], look.rgb[2]);
        actor?.ghost(tint);
        actor?.ghost(new Color(255, 245, 220));
        const p = actor?.node.worldPosition;
        if (!p) return;
        const local = this.toArena(p.x, p.y);
        const dir = fromRight ? 1 : -1;
        const rush = style === "charge" || style === "leap" || style === "dive";
        this.streaksAt(local.x, local.y + 8, -dir, rush ? 7 : 5);
        this.stamp(this.arenaFx, this.sheet.focus, local.x, local.y + 10, 150, 150, 0.18, {
            grow: 1.55, color: tint
        });
        this.stamp(this.arenaFx, this.sheet.charge, local.x - dir * 14, local.y, 78, 78, 0.16, {
            grow: 1.65, color: tint
        });
        if (style === "leap" || style === "dive" || style === "jump") {
            this.dustAt(local.x, local.y - 32, 0.9);
        }
        if (style === "combo" || style === "peck") {
            this.streaksAt(local.x + dir * 8, local.y + 18, -dir, 3);
        }
    }

    /**
     * @deprecated 场上一体演出不再等立绘；保留 0 兼容旧调用。
     */
    skillCoverSec(_style: StrikeStyle, _mode: SplashMode = "full") {
        return 0;
    }

    /**
     * @deprecated 立绘盖屏已废弃；若仍传入会尝试播预制体，缺资源则静默。
     * 正常路径请用 skillCharge → skillLaunch，喊招音效由界面直接 playSkillAnnounce。
     */
    skillAnnounce(style: StrikeStyle, title: string, fromRight = false, mode: SplashMode = "full") {
        try {
            this.skillSplash(style, title, fromRight, mode);
        }
        catch {
            /* 预制体没进包时不能把绝招整段吃掉 */
        }
    }

    /**
     * @deprecated 拆成 skillCharge → prepareSkill → skillLaunch。
     */
    skillWindup(actor: ChickenActor | null, style: StrikeStyle, title: string, fromRight = false, _mode: SplashMode = "full") {
        this.skillCharge(actor, style);
        playSkillAnnounce(style);
        this.skillLaunch(actor, style, fromRight);
    }

    hit(worldX: number, worldY: number, direction: number, style: StrikeStyle, heavy: boolean, crit: boolean, skill = false) {
        const p = this.toArena(worldX, worldY);
        const look = SKILL_LOOK[style];
        const tint = new Color(look.rgb[0], look.rgb[1], look.rgb[2]);
        this.slashAt(p.x, p.y, direction, style, heavy || crit || skill);
        // 脚底扬尘（不用 shock_ring，避免场上飘一堆半透明圆圈）
        this.dustAt(p.x, p.y - 42, crit || skill ? 1.15 : heavy ? 0.9 : 0.55);
        if (crit) {
            this.punch(0.1, 0.28);
            this.stamp(this.arenaFx, this.sheet.star, p.x, p.y + 12, 180, 180, 0.24, { grow: 1.3, angle: (Math.random() - 0.5) * 40 });
            this.stamp(this.arenaFx, this.sheet.ink, p.x + direction * 18, p.y, 150, 150, 0.22, { sx: direction, grow: 1.25 });
            this.cracksAt(p.x, p.y - 48, direction, 3);
            if (skill) this.streaksAt(p.x, p.y + 6, direction, 4);
        }
        else if (skill) {
            // 绝招命中是主反馈：更长顿帧、星芒焦点，不再叠冲击环。
            this.punch(0.08, 0.26);
            this.stamp(this.arenaFx, this.sheet.star, p.x, p.y + 12, 170, 170, 0.26, {
                grow: 1.38, angle: (Math.random() - 0.5) * 50, color: tint
            });
            this.stamp(this.arenaFx, this.sheet.ink, p.x + direction * 16, p.y, 140, 140, 0.22, {
                sx: direction, grow: 1.22, color: tint
            });
            this.stamp(this.arenaFx, this.sheet.focus, p.x, p.y + 8, 230, 230, 0.24, {
                grow: 1.3, color: tint
            });
            this.cracksAt(p.x, p.y - 48, direction, 4);
            this.dustAt(p.x, p.y - 36, 1.2, 0.04);
            this.streaksAt(p.x - direction * 10, p.y + 4, direction, 5);
        }
        else if (heavy) {
            this.punch(0.28, 0.09);
            this.stamp(this.arenaFx, this.sheet.star, p.x, p.y + 8, 120, 120, 0.18, { grow: 1.15, angle: (Math.random() - 0.5) * 50 });
            this.cracksAt(p.x, p.y - 48, direction, 2);
        }
        else {
            this.streaksAt(p.x, p.y, direction, style === "peck" || style === "combo" ? 3 : 2);
        }
    }

    clash(worldX: number, worldY: number) {
        this.punch(0.14, 0.14);
        const p = this.toArena(worldX, worldY);
        this.stamp(this.arenaFx, this.sheet.star, p.x, p.y + 16, 220, 220, 0.26, { grow: 1.35 });
        this.stamp(this.arenaFx, this.sheet.ink, p.x, p.y, 180, 180, 0.24, { grow: 1.3, angle: 25 });
        this.dustAt(p.x, p.y - 40, 1.35);
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
        this.punch(0.3, 0.1);
    }

    enrage(actor: ChickenActor | null) {
        actor?.flash(new Color(255, 60, 40), 0.28);
        this.punch(0.18, 0.16);
        const p = actor?.node.worldPosition;
        if (p) {
            const local = this.toArena(p.x, p.y);
            this.dustAt(local.x, local.y - 36, 1.4);
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
        this.clearAmbientSlots();
        for (const n of [this.overlay, this.veil, this.arenaFx, this.cinema]) {
            if (n?.isValid) {
                Tween.stopAllByTarget(n);
                const op = n.getComponent(UIOpacity);
                if (op) Tween.stopAllByTarget(op);
                n.destroy();
            }
        }
    }

    //#region 场地粒子爆发（替代 Sprite 贴图戳）

    private slashAt(x: number, y: number, direction: number, style: StrikeStyle, heavy: boolean) {
        const dir = direction >= 0 ? 1 : -1;
        const long = heavy ? 240 : style === "tail" ? 210 : style === "feint" ? 150 : 170;
        const thick = heavy ? 120 : style === "jump" ? 64 : 78;
        const tilt = style === "leap" || style === "dive" ? -48 : style === "tail" ? 28 : style === "charge" ? 4 : 8;
        const [dr, dg, db] = this.dust;
        this.burst(this.arenaFx, this.sheet.slash, x, y + 16, long, thick, 0.22, {
            count: heavy ? 5 : 3,
            angle: dir >= 0 ? tilt : 180 - tilt,
            angleVar: heavy ? 22 : 14,
            speed: heavy ? 42 : 26,
            grow: 1.25,
            color: new Color(
                Math.round(255 * 0.4 + dr * 0.6),
                Math.round(248 * 0.4 + dg * 0.6),
                Math.round(220 * 0.4 + db * 0.6)
            )
        });
    }

    /** 脚底短扬尘：用 ink/尘色小粒子，不再播 shock_ring 半透明圆圈。 */
    private dustAt(x: number, y: number, power: number, delay = 0) {
        const frame = this.sheet.ink || this.sheet.star;
        if (!frame) return;
        const s = 48 + 36 * power;
        this.burst(this.arenaFx, frame, x, y, s, s * 0.55, 0.2 * Math.max(0.7, power), {
            delay,
            count: power > 1 ? 4 : 2,
            angle: 90,
            angleVar: 70,
            speed: 18 + power * 22,
            grow: 1.35,
            gravityY: -10,
            color: new Color(this.dust[0], this.dust[1], this.dust[2], 200)
        });
    }

    private cracksAt(x: number, y: number, direction: number, n: number) {
        const dir = direction >= 0 ? 1 : -1;
        for (let i = 0; i < n; i++) {
            const ox = dir * (20 + i * 36 + Math.random() * 24);
            const oy = (Math.random() - 0.5) * 28;
            this.burst(this.arenaFx, this.sheet.crack, x + ox, y + oy, 160 + Math.random() * 80, 70, 0.45, {
                count: 1,
                angle: dir >= 0 ? (Math.random() - 0.5) * 24 : 180 + (Math.random() - 0.5) * 24,
                angleVar: 8,
                speed: 12,
                grow: 1.1,
                delay: i * 0.03,
                color: new Color(210, 190, 160, 230)
            });
        }
    }

    private streaksAt(x: number, y: number, direction: number, count: number) {
        const dir = direction >= 0 ? 1 : -1;
        const shoot = dir >= 0 ? 0 : 180;
        for (let i = 0; i < count; i++) {
            const oy = (i - (count - 1) / 2) * 18 + (Math.random() - 0.5) * 8;
            const w = 140 + Math.random() * 80;
            this.burst(this.arenaFx, this.sheet.streak, x - dir * 20, y + oy, w, 36, 0.16, {
                count: 1,
                angle: shoot + (Math.random() - 0.5) * 10,
                angleVar: 4,
                speed: 90 + Math.random() * 40,
                grow: 1.15,
                delay: i * 0.012,
                gravityY: 0,
                color: new Color(255, 245, 220, 240)
            });
        }
    }

    /**
     * 一次性 ParticleSystem2D 爆发。斩痕/星芒/冲击环等都走这里。
     */
    private burst(
        parent: Node,
        frame: SpriteFrame | undefined,
        x: number,
        y: number,
        w: number,
        h: number,
        life: number,
        opt: {
            angle?: number; angleVar?: number; count?: number; grow?: number;
            delay?: number; speed?: number; gravityY?: number; color?: Color;
        } = {}
    ) {
        if (!frame || !parent.isValid || this.closed || this.live >= BURST_CAP) return;
        const node = new Node("FxBurst");
        node.layer = parent.layer;
        node.parent = parent;
        node.setPosition(x, y, 0);
        const size = Math.max(48, Math.max(w, h) * 0.55);
        node.addComponent(UITransform).setContentSize(size, size);

        const ps = node.addComponent(ParticleSystem2D);
        (ps as ParticleSystem2D & { custom: boolean }).custom = true;
        ps.playOnLoad = false;
        ps.autoRemoveOnFinish = false;
        ps.spriteFrame = frame;
        // 单张 stamp 贴图 × 多粒子，漫画爆发感
        const count = Math.max(1, Math.min(14, opt.count ?? 3));
        ps.totalParticles = count + 4;
        ps.duration = 0.06;
        ps.emissionRate = count / 0.06;
        ps.life = Math.max(0.08, life * 0.85);
        ps.lifeVar = life * 0.18;
        const start = Math.max(16, Math.min(w, h) * 0.48);
        const grow = opt.grow ?? 1.2;
        ps.startSize = start;
        ps.startSizeVar = start * 0.22;
        ps.endSize = start * grow;
        ps.endSizeVar = start * 0.14;
        ps.angle = opt.angle ?? 90;
        ps.angleVar = opt.angleVar ?? 16;
        ps.speed = opt.speed ?? 28;
        ps.speedVar = (opt.speed ?? 28) * 0.4;
        ps.gravity = new Vec2(0, opt.gravityY ?? -20);
        ps.posVar = new Vec2(Math.min(22, w * 0.1), Math.min(16, h * 0.1));
        ps.startSpin = 0;
        ps.startSpinVar = 22;
        ps.endSpin = 0;
        ps.endSpinVar = 36;
        const tint = opt.color || new Color(255, 255, 255, 255);
        ps.startColor = new Color(tint.r, tint.g, tint.b, tint.a);
        ps.startColorVar = new Color(18, 18, 18, 20);
        ps.endColor = new Color(tint.r, tint.g, tint.b, 0);
        ps.endColorVar = new Color(0, 0, 0, 0);

        this.live += 1;
        const delay = opt.delay ?? 0;
        const ttl = delay + life + 0.12;
        const arm = () => {
            if (!node.isValid || !ps.isValid || this.closed) {
                this.live = Math.max(0, this.live - 1);
                if (node.isValid) node.destroy();
                return;
            }
            ps.resetSystem();
        };
        if (delay > 0.001) tween(node).delay(delay).call(arm).start();
        else arm();
        tween(node).delay(ttl).call(() => {
            this.live = Math.max(0, this.live - 1);
            if (ps.isValid) ps.stopSystem();
            if (node.isValid) node.destroy();
        }).start();
    }

    /** 兼容旧 stamp 调用：映射到粒子爆发。 */
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
        const sx = opt.sx ?? 1;
        const face = sx < 0 ? 180 : 0;
        this.burst(parent, frame, x, y, w, h, life, {
            angle: (opt.angle ?? 0) + face,
            angleVar: Math.abs(opt.drift || 0) > 1 ? 6 : 14,
            count: Math.abs(opt.drift || 0) > 1 ? 3 : Math.max(2, Math.round((opt.grow ?? 1.1) > 1.3 ? 5 : 3)),
            grow: opt.grow ?? 1.2,
            delay: opt.delay,
            speed: Math.abs(opt.drift || 0) > 1 ? Math.abs(opt.drift!) * 1.6 : 24,
            color: opt.color
        });
    }

    /**
     * 竖屏全屏立绘 / 敌人半屏贴纸，都走预制体。
     * 标题位置做在 prefab 里，这里只负责进出场。
     */
    private skillSplash(style: StrikeStyle, title: string, fromRight: boolean, mode: SplashMode) {
        const prefab = mode === "half" ? this.sheet.skillMiniPrefabs?.[style] : this.sheet.skillPrefabs?.[style];
        if (!prefab || !this.cinema.isValid || this.closed) return;
        if (mode === "full") this.dropSplash("half");
        else if (this.liveSplash.full) return;
        // 全屏盖半屏时只喊自己的招；半屏单独亮相才出敌人那句。
        playSkillAnnounce(style);
        this.layout();
        const { w, h } = this.size();
        const look = SKILL_LOOK[style];
        const dir = fromRight ? 1 : -1;
        const root = instantiate(prefab);
        root.layer = this.cinema.layer;
        root.parent = this.cinema;
        const fade = root.getComponent(UIOpacity) || root.addComponent(UIOpacity);
        fade.opacity = 0;
        this.dropSplash(mode);
        this.liveSplash[mode] = root;
        if (mode === "full") this.hideVeil();

        this.applySplashTitle(root, title);
        if (mode === "full") this.fitFullSplash(root, w, h);
        else {
            root.getComponent(Widget)?.updateAlignment();
            root.getComponent(UITransform)?.setContentSize(w, h);
            root.setPosition(0, 0, 0);
        }
        const board = this.child(root, mode === "half" ? "Board" : "Scene") || root;
        if (mode === "half" && !fromRight) board.setPosition(-Math.abs(board.position.x), board.position.y, 0);

        const rest = board.position.clone();
        const spanX = w * (mode === "full" ? 0.64 : 0.2);
        const spanY = h * (mode === "full" ? 0.38 : 0.12);
        const start = this.enterStart(look, rest.x, rest.y, dir, spanX, spanY, mode === "full" ? 0.42 : 1);
        board.setPosition(start.x, start.y, 0);
        board.angle = start.angle;
        if (mode === "half") board.setScale(start.scale, start.scale, 1);
        tween(board).to(look.inTime, {
            position: v3(rest.x, rest.y, 0),
            angle: 0,
            scale: v3(1, 1, 1)
        }, { easing: look.inEase }).start();
        const bg = this.child(root, "CoverBg");
        if (bg && mode !== "full") {
            const cover = Math.abs(bg.scale.x) || 1;
            bg.setScale(cover * start.scale * look.bgFrom, cover * start.scale * look.bgFrom, 1);
            tween(bg).to(look.inTime + look.hold, { scale: v3(cover * look.bgTo, cover * look.bgTo, 1) }, { easing: "sineInOut" }).start();
        }

        const hero = this.child(root, "Hero");
        if (hero) {
            const hx = hero.position.x, hy = hero.position.y;
            const fill = Math.abs(hero.scale.x) || 1;
            this.poseHeroStart(hero, look, hx, hy, dir, w, h, fill);
            this.playHeroEnter(hero, look, hx, hy, dir, look.hold, fill);
        }

        const titleNode = this.child(root, "Title");
        if (titleNode) {
            titleNode.setScale(1.28, 1.28, 1);
            tween(titleNode).delay(look.inTime * 0.35)
                .to(0.14, { scale: v3(1, 1, 1) }, { easing: "backOut" }).start();
        }
        const rays = this.child(root, "Rays");
        if (rays) tween(rays).by(look.inTime + look.hold, { angle: dir * 8 }).start();
        const flare = this.child(root, "Flare");
        if (flare) {
            tween(flare).to(0.18, { scale: v3(1.08, 1.08, 1) }, { easing: "quadOut" })
                .to(0.16, { scale: v3(0.94, 0.94, 1) })
                .to(0.16, { scale: v3(1.04, 1.04, 1) }).start();
        }
        const ring = this.child(root, "Ring");
        if (ring) {
            const ringOp = ring.getComponent(UIOpacity) || ring.addComponent(UIOpacity);
            ringOp.opacity = 0;
            tween(ringOp).delay(0.06).to(0.08, { opacity: 180 }).to(0.28, { opacity: 0 }).start();
            tween(ring).delay(0.06).to(0.36, { scale: v3(1.35, 1.08, 1) }, { easing: "quadOut" }).start();
        }

        const extra = mode === "full" ? 0.12 : 0.1;
        tween(fade).to(0.08, { opacity: 255 })
            .delay(look.inTime + look.hold + extra)
            .to(look.outTime, { opacity: 0 }, { easing: "quadOut" })
            .call(() => this.dropSplash(mode)).start();
    }

    /** 根节点和 Scene 拉满画布；背景走 UIBgAdaptation Cover，立绘按 Cover 放大，多出来的边由 Mask 裁掉。 */
    private fitFullSplash(root: Node, w: number, h: number) {
        const widget = root.getComponent(Widget);
        if (widget) widget.updateAlignment();
        const rootUt = root.getComponent(UITransform);
        if (rootUt) rootUt.setContentSize(w, h);
        root.setScale(1, 1, 1);
        root.setPosition(0, 0, 0);
        const scene = this.child(root, "Scene");
        scene?.getComponent(UITransform)?.setContentSize(w, h);
        this.bindCoverBg(this.child(root, "CoverBg"));
        this.coverFit(this.child(root, "Hero"), w, h);
    }

    /** 背景用和界面一样的 Cover 适配，视口对准 SkillCinema。 */
    private bindCoverBg(bg: Node | null) {
        if (!bg) return;
        const adapt = bg.getComponent(UIBgAdaptation) || bg.addComponent(UIBgAdaptation);
        const viewport = this.cinema.getComponent(UITransform);
        if (viewport) adapt.viewportTransform = viewport;
        adapt.refresh();
    }

    /** 720×1280 竖屏立绘按 Cover 放大，缺贴图时也按这套设计尺寸算，避免缩在画布中间。 */
    private coverFit(node: Node | null, w: number, h: number) {
        if (!node) return 1;
        const ut = node.getComponent(UITransform);
        const sp = node.getComponent(Sprite);
        const native = sp?.spriteFrame?.originalSize;
        const artW = native && native.width > 0 ? native.width : 720;
        const artH = native && native.height > 0 ? native.height : 1280;
        const fill = Math.max(w / artW, h / artH);
        ut?.setContentSize(artW, artH);
        node.setScale(fill, fill, 1);
        return fill;
    }

    private applySplashTitle(root: Node, title: string) {
        let name = title.replace(/\s+/g, "");
        const cut = name.indexOf("·");
        if (cut >= 0) name = name.slice(cut + 1);
        const lab = this.child(root, "TitleName")?.getComponent(Label);
        if (lab && name) lab.string = name;
    }

    private poseHeroStart(hero: Node, look: SkillLook, destX: number, destY: number, dir: number, w: number, h: number, fill: number) {
        let x = destX, y = destY, scale = fill * 0.92, angle = 0;
        if (look.enter === "side") x = destX + dir * w * 0.35;
        else if (look.enter === "up") y = destY - h * 0.16;
        else if (look.enter === "down") y = destY + h * 0.18;
        else if (look.enter === "zoom") scale = fill * 1.22;
        else if (look.enter === "pulse") scale = fill * 1.12;
        else if (look.enter === "spin") {
            x = destX + dir * w * 0.16;
            angle = -dir * 50;
        }
        else if (look.enter === "feint") {
            x = destX - dir * w * 0.22;
            scale = fill * 0.84;
        }
        hero.setPosition(x, y, 0);
        hero.setScale(scale, scale, 1);
        hero.angle = angle;
    }

    private child(root: Node, name: string): Node | null {
        if (root.name === name) return root;
        for (const node of root.children) {
            const hit = this.child(node, name);
            if (hit) return hit;
        }
        return null;
    }

    private playHeroEnter(node: Node, look: SkillLook, destX: number, destY: number, dir: number, hold: number, fill = 1) {
        const motion = tween(node);
        const s = (n: number) => v3(fill * n, fill * n, 1);
        if (look.enter === "zoom") {
            motion.to(0.08, { scale: s(0.9) }, { easing: "quadIn" })
                .to(0.12, { scale: s(1.12) }, { easing: "backOut" })
                .to(0.08, { scale: s(1) }, { easing: "quadOut" });
        }
        else if (look.enter === "pulse") {
            motion.to(0.08, { position: v3(destX, destY, 0), scale: s(1.2) }, { easing: "quadOut" })
                .to(0.07, { scale: s(0.9) }, { easing: "quadIn" })
                .to(0.08, { scale: s(1.16) }, { easing: "quadOut" })
                .to(0.07, { scale: s(0.94) }, { easing: "quadIn" })
                .to(0.1, { scale: s(1.04) }, { easing: "backOut" })
                .to(0.06, { scale: s(1) }, { easing: "quadOut" });
        }
        else if (look.enter === "up") {
            motion.to(look.inTime, { position: v3(destX, destY + 16, 0), scale: s(1.08) }, { easing: "sineOut" })
                .to(0.12, { position: v3(destX, destY, 0), scale: s(1) }, { easing: "quadOut" })
                .by(hold, { position: v3(0, 10, 0) }, { easing: "sineInOut" });
        }
        else if (look.enter === "down") {
            const squash = look.inEase === "cubicIn" ? v3(fill * 1.22, fill * 0.72, 1) : v3(fill * 1.16, fill * 0.8, 1);
            motion.to(look.inTime, { position: v3(destX, destY, 0), scale: squash }, { easing: look.inEase })
                .to(0.14, { scale: s(1) }, { easing: look.inEase === "cubicIn" ? "elasticOut" : "bounceOut" });
        }
        else if (look.enter === "side") {
            motion.to(look.inTime, { position: v3(destX - dir * 36, destY, 0), scale: v3(fill * 1.18, fill * 0.88, 1) }, { easing: "circIn" })
                .to(0.14, { position: v3(destX, destY, 0), scale: s(1) }, { easing: "cubicOut" });
        }
        else if (look.enter === "spin") {
            motion.to(look.inTime, { position: v3(destX, destY, 0), angle: dir * 14, scale: s(1.06) }, { easing: "cubicOut" })
                .to(0.16, { angle: -dir * 8, scale: s(1) }, { easing: "sineOut" })
                .by(hold, { angle: dir * 10 }, { easing: "sineInOut" });
        }
        else {
            motion.to(look.inTime, { position: v3(destX, destY, 0), scale: s(1.08) }, { easing: "expoOut" })
                .to(0.1, { scale: s(1) }, { easing: "quadOut" });
        }
        motion.start();
    }

    /** 入场起点：amount=1 是主体行程，底板用更小的量跟着走。 */
    private enterStart(look: SkillLook, cx: number, y: number, dir: number, spanX: number, spanY: number, amount: number) {
        let x = cx, py = y, scale = 1, angle = 0;
        if (look.enter === "side") x = cx + dir * spanX * amount;
        else if (look.enter === "up") py = y - spanY * amount;
        else if (look.enter === "down") py = y + spanY * amount * 1.1;
        else if (look.enter === "zoom") scale = 1 + 0.38 * amount;
        else if (look.enter === "pulse") scale = 1 + 0.22 * amount;
        else if (look.enter === "spin") {
            x = cx + dir * spanX * 0.45 * amount;
            angle = -dir * 70 * amount;
        }
        else if (look.enter === "feint") {
            x = cx - dir * spanX * 0.86 * amount;
            scale = 1 - 0.22 * amount;
        }
        return { x, y: py, scale, angle };
    }

    private dropSplash(mode?: SplashMode) {
        const modes: SplashMode[] = mode ? [mode] : ["full", "half"];
        const stop = (n: Node) => {
            Tween.stopAllByTarget(n);
            const op = n.getComponent(UIOpacity);
            if (op) Tween.stopAllByTarget(op);
            for (const child of n.children) stop(child);
        };
        for (const m of modes) {
            const node = this.liveSplash[m];
            if (!node) continue;
            delete this.liveSplash[m];
            stop(node);
            if (node.isValid) node.destroy();
        }
        if (!this.liveSplash.full) this.showVeil();
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

    private mountAmbientPrefabs() {
        if (!this.veil.isValid) return;
        const map = this.sheet.ambientPrefabs || {};
        for (const spec of this.ambients) {
            const prefab = map[spec.kind];
            if (!prefab) continue;
            const node = instantiate(prefab);
            node.layer = this.veil.layer;
            node.parent = this.veil;
            node.setPosition(0, 0, 0);
            const systems = node.getComponentsInChildren(ParticleSystem2D);
            for (const ps of systems) {
                ps.playOnLoad = false;
                const base = Math.max(1, ps.emissionRate);
                ps.emissionRate = base * spec.weight;
                ps.resetSystem();
                this.ambientSlots.push({
                    name: node.name,
                    node,
                    ps,
                    baseRate: base,
                    kind: spec.kind,
                    weight: spec.weight
                });
            }
            if (!systems.length && node.isValid) node.destroy();
        }
    }

    private layoutAmbientEmitters() {
        const { w, h } = this.size();
        const halfW = w * 0.5;
        const halfH = h * 0.5;
        for (const slot of this.ambientSlots) {
            if (!slot.node.isValid || !slot.ps.isValid) continue;
            slot.node.getComponent(UITransform)?.setContentSize(w, h);
            const emit = slot.node.getChildByName("Emitter") || slot.node;
            switch (slot.kind) {
                case "rain":
                    emit.setPosition(0, halfH + 20, 0);
                    slot.ps.posVar = new Vec2(halfW + 40, 36);
                    break;
                case "incense":
                    emit.setPosition(0, -halfH * 0.35, 0);
                    slot.ps.posVar = new Vec2(halfW * 0.7, 60);
                    break;
                case "ember":
                case "ash":
                    emit.setPosition(0, -halfH + 30, 0);
                    slot.ps.posVar = new Vec2(halfW * 0.95, 50);
                    break;
                case "mist":
                    emit.setPosition(-halfW * 0.2, -halfH * 0.25, 0);
                    slot.ps.posVar = new Vec2(halfW * 0.35, halfH * 0.35);
                    break;
                default:
                    emit.setPosition(0, 0, 0);
                    slot.ps.posVar = new Vec2(halfW * 0.95, halfH * 0.9);
                    break;
            }
        }
    }

    private clearAmbientSlots() {
        const seen = new Set<Node>();
        for (const slot of this.ambientSlots) {
            if (slot.ps.isValid) slot.ps.stopSystem();
            if (slot.node.isValid && !seen.has(slot.node)) {
                seen.add(slot.node);
                slot.node.destroy();
            }
        }
        this.ambientSlots.length = 0;
    }

    //#endregion

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
        this.layoutAmbientEmitters();
    }

    private size() {
        const box = this.root.getComponent(UITransform);
        return { w: box?.width || 720, h: box?.height || 1280 };
    }

    private toArena(worldX: number, worldY: number) {
        return this.arena.getComponent(UITransform)!.convertToNodeSpaceAR(v3(worldX, worldY, 0));
    }
}
