import {
    Button, Color, Graphics, Label, Node, UIOpacity, UITransform, tween, v3
} from "cc";
import { setBattlePace } from "../../domain/BattlePace";
import { playGameEffect } from "../shared/GameAudio";
import { hexColor } from "../shared/UiUtil";

/** 内圈半径（可点判定圆）。 */
const HIT_R = 52;
/** 外环起始倍率：从 HIT_R * START 收缩到 HIT_R。 */
const START = 2.35;
/** 外环收缩时长（秒）。 */
const APPROACH = 0.72;
/** 判定窗口：相对完美点的进度误差。 */
const GOOD = 0.32;
const GREAT = 0.14;
/** 同时场上最多几个圈。 */
const MAX_LIVE = 2;
/** 生成间隔（秒）。 */
const SPAWN_MIN = 0.85;
const SPAWN_MAX = 1.55;
/** 单次命中叠加的加速时长 / 倍率。 */
const BOOST_GREAT = 2.4;
const BOOST_GOOD = 1.5;
const BOOST_MUL = 2;
const BOOST_CAP = 5.2;
/** 命中额外削减玩家绝招剩余冷却。普通 20%，完美 40%。 */
const CD_CUT_GOOD = 0.2;
const CD_CUT_GREAT = 0.4;
/**
 * 生成范围（相对宿主本地坐标）。
 * 避开顶栏名牌与底部绝招条，落在对战场地一带。
 */
const AREA = { x0: -210, x1: 210, y0: -10, y1: 150 };

interface TapCircle {
    node: Node;
    ink: Graphics;
    title: Label;
    age: number;
    life: number;
    done: boolean;
}

/**
 * 音游式点击圈：在场地范围内生成，外环收进内圈时点中可加速战斗，
 * 并按判定等级削减玩家绝招剩余冷却。
 */
export class BattleTapBoost {
    private layer: Node | null = null;
    private circles: TapCircle[] = [];
    private spawnIn = 0.55;
    private boostLeft = 0;
    private closed = false;
    private active = false;
    private holdSpawn = false;
    private paceLab: Label | null = null;

    constructor(private host: Node, private onCdCut?: (ratio: number) => void) {}

    /** 开战时挂层；结束 / 关界面时 clear。 */
    mount() {
        if (this.closed) return;
        const parent = this.host.getChildByName("content") || this.host;
        let layer = parent.getChildByName("TapBoostLayer");
        if (!layer) {
            layer = new Node("TapBoostLayer");
            layer.layer = parent.layer;
            parent.addChild(layer);
            const ut = layer.addComponent(UITransform);
            const box = parent.getComponent(UITransform);
            ut.setContentSize(box?.width || 720, box?.height || 1280);
            ut.setAnchorPoint(0.5, 0.5);
        }
        this.layer = layer;
        layer.active = true;
        this.ensurePaceHud(layer);
        this.active = true;
        this.spawnIn = 0.4 + Math.random() * 0.5;
        this.boostLeft = 0;
        setBattlePace(1);
        this.refreshPaceHud();
        // 绝招条要压在点击圈之上，避免挡技能。
        const bar = parent.getChildByName("SkillBar");
        if (bar) bar.setSiblingIndex(parent.children.length - 1);
    }

    /** 返回当前战斗时间倍率（未加速为 1）。 */
    speedMul(): number {
        return this.boostLeft > 0 ? BOOST_MUL : 1;
    }

    tick(dt: number) {
        if (this.closed || !this.active || !this.layer?.isValid) return;
        if (this.boostLeft > 0) {
            this.boostLeft = Math.max(0, this.boostLeft - dt);
            if (this.boostLeft <= 0) setBattlePace(1);
            this.refreshPaceHud();
        }

        for (const c of this.circles) {
            if (c.done || !c.node.isValid) continue;
            c.age += dt;
            this.paint(c);
            // 过了判定窗仍未点：淡出销毁。
            if (c.age > c.life + GOOD * c.life) this.miss(c);
        }
        this.circles = this.circles.filter(c => !c.done && c.node.isValid);

        this.spawnIn -= dt;
        if (!this.holdSpawn && this.spawnIn <= 0 && this.circles.length < MAX_LIVE) {
            this.spawn();
            this.spawnIn = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
        }
    }

    /** 引导期间先别刷新圈，只保留手动生成的那一个。 */
    holdAutoSpawn(hold: boolean) {
        this.holdSpawn = hold;
    }

    /** 在固定位置生成一个已进入判定窗的加速圈，方便引导点击。 */
    spawnGuideAt(x: number, y: number): Node | null {
        return this.spawn(x, y, true);
    }

    clear() {
        this.closed = true;
        this.active = false;
        this.boostLeft = 0;
        setBattlePace(1);
        for (const c of this.circles) {
            if (c.node.isValid) c.node.destroy();
        }
        this.circles = [];
        if (this.layer?.isValid) {
            this.layer.destroy();
        }
        this.layer = null;
        this.paceLab = null;
    }

    private spawn(x?: number, y?: number, guide = false): Node | null {
        const layer = this.layer;
        if (!layer?.isValid) return null;
        const node = new Node("TapCircle");
        node.layer = layer.layer;
        layer.addChild(node);
        const px = x ?? (AREA.x0 + Math.random() * (AREA.x1 - AREA.x0));
        const py = y ?? (AREA.y0 + Math.random() * (AREA.y1 - AREA.y0));
        node.setPosition(px, py, 0);
        const size = HIT_R * START * 2 + 16;
        (node.addComponent(UITransform)).setContentSize(size, size);
        const ink = node.addComponent(Graphics);
        const op = node.addComponent(UIOpacity);
        op.opacity = 0;
        tween(op).to(0.14, { opacity: 255 }).start();

        // 固定文案压在圈心，战场再花也能认出是加速点。
        const titleNode = new Node("TapTitle");
        titleNode.layer = node.layer;
        node.addChild(titleNode);
        titleNode.setPosition(0, -2, 0);
        (titleNode.addComponent(UITransform)).setContentSize(96, 36);
        const title = titleNode.addComponent(Label);
        title.string = "加速";
        title.fontSize = 26;
        title.lineHeight = 30;
        title.isBold = true;
        title.horizontalAlign = Label.HorizontalAlign.CENTER;
        title.verticalAlign = Label.VerticalAlign.CENTER;
        title.color = hexColor("#FFF6D0");
        title.enableOutline = true;
        title.outlineColor = hexColor("#2A1408");
        title.outlineWidth = 4;
        title.useSystemFont = true;
        title.fontFamily = "Arial";

        const life = APPROACH * (0.92 + Math.random() * 0.16);
        const circle: TapCircle = {
            node,
            ink,
            title,
            age: guide ? life : 0,
            life,
            done: false
        };
        // 透明可点区域，不走缩放过渡以免干扰画环。
        const btn = node.addComponent(Button);
        btn.transition = Button.Transition.NONE;
        node.on(Button.EventType.CLICK, () => this.onTap(circle), this);
        this.paint(circle);
        this.circles.push(circle);
        return node;
    }

    private onTap(c: TapCircle) {
        if (this.closed || c.done || !c.node.isValid) return;
        const err = Math.abs(c.age / c.life - 1);
        if (c.age / c.life < 1 - GOOD) {
            // 太早：轻抖提示，圈还保留。
            tween(c.node)
                .to(0.05, { scale: v3(1.08, 1.08, 1) })
                .to(0.08, { scale: v3(1, 1, 1) })
                .start();
            return;
        }
        if (err > GOOD) {
            this.miss(c);
            return;
        }
        const great = err <= GREAT;
        this.hit(c, great);
    }

    private hit(c: TapCircle, great: boolean) {
        c.done = true;
        const add = great ? BOOST_GREAT : BOOST_GOOD;
        const cut = great ? CD_CUT_GREAT : CD_CUT_GOOD;
        this.boostLeft = Math.min(BOOST_CAP, this.boostLeft + add);
        setBattlePace(BOOST_MUL);
        this.onCdCut?.(cut);
        this.refreshPaceHud();
        playGameEffect(great ? "critical" : "click");

        // 命中爆开。
        const g = c.ink;
        g.clear();
        g.fillColor = great
            ? new Color(255, 214, 48, 230)
            : new Color(64, 200, 255, 220);
        g.circle(0, 0, HIT_R * (great ? 1.2 : 1.05));
        g.fill();
        g.strokeColor = new Color(40, 18, 6, 255);
        g.lineWidth = 10;
        g.circle(0, 0, HIT_R * 1.4);
        g.stroke();
        g.strokeColor = new Color(255, 252, 230, 255);
        g.lineWidth = 5;
        g.circle(0, 0, HIT_R * 1.4);
        g.stroke();

        const lab = this.floatWord(c.node, `${great ? "完美" : "好"} -${Math.round(cut * 100)}%CD`, great);
        const op = c.node.getComponent(UIOpacity) || c.node.addComponent(UIOpacity);
        tween(c.node).to(0.22, { scale: v3(1.35, 1.35, 1) }, { easing: "quadOut" }).start();
        tween(op).delay(0.06).to(0.2, { opacity: 0 }).call(() => {
            if (lab?.isValid) lab.destroy();
            if (c.node.isValid) c.node.destroy();
        }).start();
    }

    private miss(c: TapCircle) {
        if (c.done) return;
        c.done = true;
        const op = c.node.getComponent(UIOpacity) || c.node.addComponent(UIOpacity);
        tween(op).to(0.18, { opacity: 0 }).call(() => {
            if (c.node.isValid) c.node.destroy();
        }).start();
    }

    private paint(c: TapCircle) {
        const g = c.ink;
        g.clear();
        const t = Math.min(1.25, c.age / c.life);
        const outer = HIT_R * (START + (1 - START) * Math.min(1, t));
        const inWindow = Math.abs(t - 1) <= GOOD;
        const great = Math.abs(t - 1) <= GREAT;

        // 外圈光晕：先垫一层半透明色，战场再花也容易扫到。
        g.fillColor = inWindow
            ? (great ? new Color(255, 200, 40, 90) : new Color(48, 180, 255, 80))
            : new Color(255, 196, 64, 55);
        g.circle(0, 0, HIT_R + 14);
        g.fill();

        // 内圈实心底板（高不透明，压住鸡/特效）
        g.fillColor = inWindow
            ? (great ? new Color(255, 196, 32, 210) : new Color(36, 168, 255, 200))
            : new Color(28, 18, 10, 175);
        g.circle(0, 0, HIT_R);
        g.fill();

        // 内圈亮芯，中间更醒目
        g.fillColor = inWindow
            ? (great ? new Color(255, 240, 140, 160) : new Color(160, 230, 255, 140))
            : new Color(255, 220, 120, 70);
        g.circle(0, 0, HIT_R * 0.55);
        g.fill();

        // 内圈双描边：深色外框 + 亮色内线，对比拉满
        const rim = inWindow
            ? (great ? new Color(255, 236, 72, 255) : new Color(120, 230, 255, 255))
            : new Color(255, 214, 72, 255);
        g.strokeColor = new Color(28, 12, 4, 240);
        g.lineWidth = 10;
        g.circle(0, 0, HIT_R);
        g.stroke();
        g.strokeColor = rim;
        g.lineWidth = inWindow ? 7 : 5.5;
        g.circle(0, 0, HIT_R);
        g.stroke();

        // 外环（音游接近圈）：同样双描边，线更粗
        if (t <= 1.05) {
            const r = Math.max(HIT_R, outer);
            const alpha = Math.floor(255 - Math.min(1, t) * 50);
            g.strokeColor = new Color(24, 10, 4, alpha);
            g.lineWidth = 12;
            g.circle(0, 0, r);
            g.stroke();
            g.strokeColor = new Color(255, 248, 210, alpha);
            g.lineWidth = 6;
            g.circle(0, 0, r);
            g.stroke();
            // 接近判定时再加一圈高亮
            if (inWindow) {
                g.strokeColor = great
                    ? new Color(255, 230, 64, 220)
                    : new Color(100, 220, 255, 200);
                g.lineWidth = 3;
                g.circle(0, 0, r + 4);
                g.stroke();
            }
        }

        // 标题字色随判定窗变亮
        if (c.title?.isValid) {
            c.title.color = great
                ? hexColor("#FFF36A")
                : inWindow ? hexColor("#E8FBFF") : hexColor("#FFF6D0");
            c.title.fontSize = inWindow ? 28 : 26;
        }
    }

    private floatWord(parent: Node, text: string, great: boolean): Node | null {
        if (!parent.isValid) return null;
        const node = new Node("TapWord");
        node.layer = parent.layer;
        parent.addChild(node);
        node.setPosition(0, HIT_R + 18, 0);
        (node.addComponent(UITransform)).setContentSize(168, 36);
        const lab = node.addComponent(Label);
        lab.string = text;
        lab.fontSize = great ? 28 : 24;
        lab.lineHeight = 32;
        lab.isBold = true;
        lab.horizontalAlign = Label.HorizontalAlign.CENTER;
        lab.verticalAlign = Label.VerticalAlign.CENTER;
        lab.color = great ? hexColor("#FFE24A") : hexColor("#9EE8FF");
        lab.enableOutline = true;
        lab.outlineColor = hexColor("#3A220C");
        lab.outlineWidth = 3;
        lab.useSystemFont = true;
        lab.fontFamily = "Arial";
        tween(node).by(0.28, { position: v3(0, 28, 0) }).start();
        return node;
    }

    private ensurePaceHud(layer: Node) {
        let hud = layer.getChildByName("PaceHud");
        if (!hud) {
            hud = new Node("PaceHud");
            hud.layer = layer.layer;
            layer.addChild(hud);
            hud.setPosition(0, 268, 0);
            (hud.addComponent(UITransform)).setContentSize(160, 36);
            const lab = hud.addComponent(Label);
            lab.string = "";
            lab.fontSize = 26;
            lab.lineHeight = 30;
            lab.isBold = true;
            lab.horizontalAlign = Label.HorizontalAlign.CENTER;
            lab.verticalAlign = Label.VerticalAlign.CENTER;
            lab.color = hexColor("#FFE24A");
            lab.enableOutline = true;
            lab.outlineColor = hexColor("#3A220C");
            lab.outlineWidth = 3;
            lab.useSystemFont = true;
            lab.fontFamily = "Arial";
            hud.addComponent(UIOpacity).opacity = 0;
            this.paceLab = lab;
        }
        else {
            this.paceLab = hud.getComponent(Label);
        }
    }

    private refreshPaceHud() {
        const lab = this.paceLab;
        const node = lab?.node;
        if (!lab?.isValid || !node?.isValid) return;
        const op = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
        if (this.boostLeft > 0) {
            lab.string = `加速 x${BOOST_MUL}  ${this.boostLeft.toFixed(1)}s`;
            op.opacity = 255;
        }
        else {
            lab.string = "";
            op.opacity = 0;
        }
    }
}
