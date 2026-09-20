import {
    BlockInputEvents, Button, Color, Graphics, Label, Layout, Node, Sprite, Tween, UIOpacity, UITransform, Widget, tween, v3
} from "cc";
import { GameComponent } from "db://oops-framework/module/common/GameComponent";
import { BattleSession } from "../../domain/BattleSession";
import { SKILL_ICON, skillCooldownOf } from "../../domain/BattleStyle";
import { TEX } from "../../domain/Catalog";
import { gameText } from "../../domain/GameConfig";
import { StrikeStyle } from "../../domain/Types";
import { bindNodeClick, hexColor } from "../shared/UiUtil";

const BAR = "SkillBar";
const GRID = "SkillGrid";
const SIZE = 100;
const COLS = 4;
const GAP_X = 18;
const GAP_Y = 16;
const BAR_H = 248;
const BAR_BOTTOM = 16;
const RGB: Record<StrikeStyle, [number, number, number]> = {
    peck: [255, 196, 72],
    jump: [255, 220, 110],
    dive: [110, 190, 255],
    leap: [255, 120, 48],
    charge: [255, 150, 60],
    tail: [90, 220, 170],
    combo: [255, 230, 90],
    feint: [180, 120, 255]
};

interface Slot {
    style: StrikeStyle;
    node: Node;
    icon: Sprite;
    cdInk: Graphics;
    cdLab: Label;
    atkLab: Label;
    ready: boolean;
}

/**
 * 对战页底部已解锁的主动绝招。
 * 宿主 SkillBar 写在 battle.prefab 上，Widget 居中钉底；
 * 图标按实际数量逐行居中排布，并刷新冷却与攻击数值。
 */
export class BattleSkillBar {
    private bar: Node | null = null;
    private slots: Slot[] = [];
    private closed = false;

    constructor(private view: GameComponent, private root: Node) {}

    async mount(skills: readonly StrikeStyle[], onCast: (style: StrikeStyle) => void) {
        const bar = this.ensureBar();
        const grid = bar.getChildByName(GRID) || bar;
        this.slots = [];
        // 清掉旧档/上一场留下的未解锁按钮，避免残留可点。
        for (const child of [...grid.children]) {
            if (child.name.startsWith("SkillBtn_") && !skills.some(style => child.name === `SkillBtn_${style}`)) {
                child.destroy();
            }
        }
        if (!skills.length) {
            bar.active = false;
            this.raise();
            return;
        }
        bar.active = true;
        // 预制体 Layout 按满 4 列左起排；实际解锁不足时会偏左。关掉 Layout，按行居中手排。
        const layout = grid.getComponent(Layout);
        if (layout) layout.enabled = false;
        const cols = Math.min(COLS, Math.max(1, skills.length));
        const rows = Math.ceil(skills.length / cols);
        const totalH = rows * SIZE + (rows - 1) * GAP_Y;
        const originY = totalH / 2 - SIZE / 2;
        for (let i = 0; i < skills.length; i++) {
            const row = Math.floor(i / cols);
            const indexInRow = i % cols;
            const rowStart = row * cols;
            const rowCount = Math.min(cols, skills.length - rowStart);
            const rowW = rowCount * SIZE + (rowCount - 1) * GAP_X;
            const originX = -rowW / 2 + SIZE / 2;
            const x = originX + indexInRow * (SIZE + GAP_X);
            const y = originY - row * (SIZE + GAP_Y);
            this.slots.push(await this.makeSlot(grid, skills[i], x, y, onCast));
        }
        this.raise();
    }

    tick(session: BattleSession) {
        if (this.closed || !this.bar?.isValid) return;
        for (const slot of this.slots) {
            if (!slot.node.isValid) continue;
            const remain = session.skillRemain(slot.style);
            const ready = session.skillReady(slot.style);
            const max = skillCooldownOf(slot.style);
            slot.atkLab.string = `攻 ${session.previewSkillAtk(slot.style)}`;
            this.paintCd(slot, remain, max, ready);
            if (ready && !slot.ready) this.pulse(slot.node);
            slot.ready = ready;
        }
    }

    raise() {
        const bar = this.bar;
        if (!bar?.parent) return;
        bar.setSiblingIndex(bar.parent.children.length - 1);
    }

    barNode(): Node | null {
        return this.bar?.isValid ? this.bar : null;
    }

    slotNodes(): Node[] {
        return this.slots.map(slot => slot.node).filter(node => node?.isValid);
    }

    clear() {
        this.closed = true;
        this.slots = [];
        this.bar = null;
    }

    private ensureBar(): Node {
        const content = this.root.getChildByName("content");
        let bar = this.view.getNode(BAR) || content?.getChildByName(BAR) || this.root.getChildByName(BAR);
        if (!bar) {
            const host = content || this.root;
            bar = new Node(BAR);
            bar.layer = host.layer;
            host.addChild(bar);
            const ut = bar.addComponent(UITransform);
            ut.setContentSize(720, BAR_H);
            const widget = bar.addComponent(Widget);
            widget.isAlignBottom = true;
            widget.isAlignHorizontalCenter = true;
            widget.isAlignTop = false;
            widget.isAlignLeft = false;
            widget.isAlignRight = false;
            widget.isAlignVerticalCenter = false;
            widget.bottom = BAR_BOTTOM;
            widget.alignMode = Widget.AlignMode.ALWAYS;
            widget.enabled = true;
            widget.updateAlignment();
        }
        this.bar = bar;
        if (!bar.getComponent(BlockInputEvents)) bar.addComponent(BlockInputEvents);
        this.paintPlate(bar);
        return bar;
    }

    private paintPlate(bar: Node) {
        const ut = bar.getComponent(UITransform);
        const w = ut?.width || 720;
        const h = ut?.height || BAR_H;
        const g = bar.getComponent(Graphics) || bar.addComponent(Graphics);
        g.clear();
        g.fillColor = new Color(28, 18, 10, 150);
        g.roundRect(-w / 2 + 12, -h / 2 + 8, w - 24, h - 16, 22);
        g.fill();
        g.strokeColor = new Color(255, 206, 74, 90);
        g.lineWidth = 2;
        g.roundRect(-w / 2 + 12, -h / 2 + 8, w - 24, h - 16, 22);
        g.stroke();
    }

    private async makeSlot(
        parent: Node,
        style: StrikeStyle,
        x: number,
        y: number,
        onCast: (style: StrikeStyle) => void
    ): Promise<Slot> {
        const name = `SkillBtn_${style}`;
        let node = parent.getChildByName(name);
        if (!node) {
            node = new Node(name);
            node.layer = parent.layer;
            parent.addChild(node);
        }
        node.setPosition(x, y, 0);
        (node.getComponent(UITransform) || node.addComponent(UITransform)).setContentSize(SIZE, SIZE);
        const rgb = RGB[style];

        const disc = node.getChildByName("Disc") || new Node("Disc");
        disc.layer = node.layer;
        if (!disc.parent) node.addChild(disc);
        disc.setPosition(0, 0, 0);
        (disc.getComponent(UITransform) || disc.addComponent(UITransform)).setContentSize(SIZE, SIZE);
        const ring = disc.getComponent(Graphics) || disc.addComponent(Graphics);
        ring.clear();
        ring.fillColor = new Color(20, 12, 8, 220);
        ring.circle(0, 0, SIZE / 2 - 1);
        ring.fill();
        ring.strokeColor = new Color(rgb[0], rgb[1], rgb[2], 255);
        ring.lineWidth = 4;
        ring.circle(0, 0, SIZE / 2 - 2);
        ring.stroke();

        const iconNode = disc.getChildByName("Icon") || new Node("Icon");
        iconNode.layer = disc.layer;
        if (!iconNode.parent) disc.addChild(iconNode);
        iconNode.setPosition(0, 6, 0);
        (iconNode.getComponent(UITransform) || iconNode.addComponent(UITransform)).setContentSize(SIZE - 28, SIZE - 28);
        const icon = iconNode.getComponent(Sprite) || iconNode.addComponent(Sprite);
        icon.sizeMode = Sprite.SizeMode.CUSTOM;
        icon.color = Color.WHITE;
        try {
            await this.view.setSprite(icon, TEX.icon(SKILL_ICON[style]), "bundle");
        }
        catch {
            icon.color = new Color(rgb[0], rgb[1], rgb[2], 255);
        }

        const cdNode = disc.getChildByName("CdMask") || new Node("CdMask");
        cdNode.layer = disc.layer;
        if (!cdNode.parent) disc.addChild(cdNode);
        cdNode.setPosition(0, 0, 0);
        (cdNode.getComponent(UITransform) || cdNode.addComponent(UITransform)).setContentSize(SIZE, SIZE);
        const cdInk = cdNode.getComponent(Graphics) || cdNode.addComponent(Graphics);

        const cdLab = this.label(disc, "LabCd", "", 0, 4, 72, 36, 26, hexColor("#FFFAEC"), true);
        const badge = disc.getChildByName("AtkBadge") || new Node("AtkBadge");
        badge.layer = disc.layer;
        if (!badge.parent) disc.addChild(badge);
        badge.setPosition(0, -SIZE / 2 + 18, 0);
        (badge.getComponent(UITransform) || badge.addComponent(UITransform)).setContentSize(78, 22);
        const badgeInk = badge.getComponent(Graphics) || badge.addComponent(Graphics);
        badgeInk.clear();
        badgeInk.fillColor = new Color(120, 28, 16, 230);
        badgeInk.roundRect(-38, -11, 76, 22, 8);
        badgeInk.fill();
        const atkLab = this.label(badge, "LabAtk", "攻 0", 0, 0, 74, 20, 14, hexColor("#FFE07A"), true);
        this.label(node, "LabName", STYLE_NAME[style](), 0, SIZE / 2 - 12, 96, 20, 13, hexColor("#FFFAEC"), true);

        bindNodeClick(node, () => onCast(style), this.view);
        const btn = node.getComponent(Button)!;
        btn.zoomScale = 0.92;
        return { style, node, icon, cdInk, cdLab, atkLab, ready: false };
    }

    private paintCd(slot: Slot, remain: number, max: number, ready: boolean) {
        const g = slot.cdInk;
        g.clear();
        const r = SIZE / 2 - 4;
        if (!ready && remain > 0) {
            const ratio = Math.max(0, Math.min(1, remain / Math.max(0.01, max)));
            g.fillColor = new Color(8, 6, 4, 168);
            g.moveTo(0, 0);
            g.arc(0, 0, r, Math.PI / 2, Math.PI / 2 - ratio * Math.PI * 2, false);
            g.close();
            g.fill();
            slot.cdLab.string = remain >= 1 ? String(Math.ceil(remain)) : remain.toFixed(1);
            slot.icon.color = new Color(160, 160, 160, 255);
        }
        else {
            slot.cdLab.string = "";
            slot.icon.color = Color.WHITE;
            if (ready) {
                g.strokeColor = new Color(255, 230, 120, 220);
                g.lineWidth = 4;
                g.circle(0, 0, r - 1);
                g.stroke();
            }
        }
    }

    private pulse(node: Node) {
        if (!node.isValid) return;
        Tween.stopAllByTarget(node);
        node.setScale(1, 1, 1);
        tween(node)
            .to(0.12, { scale: v3(1.08, 1.08, 1) }, { easing: "quadOut" })
            .to(0.16, { scale: v3(1, 1, 1) }, { easing: "quadIn" })
            .start();
    }

    private label(parent: Node, name: string, text: string, x: number, y: number, w: number, h: number, font: number, color: Color, outline: boolean) {
        const node = parent.getChildByName(name) || new Node(name);
        node.layer = parent.layer;
        if (!node.parent) parent.addChild(node);
        node.setPosition(x, y, 0);
        (node.getComponent(UITransform) || node.addComponent(UITransform)).setContentSize(w, h);
        const lab = node.getComponent(Label) || node.addComponent(Label);
        lab.string = text;
        lab.fontSize = font;
        lab.lineHeight = Math.round(font * 1.15);
        lab.isBold = true;
        lab.overflow = Label.Overflow.SHRINK;
        lab.enableWrapText = false;
        lab.horizontalAlign = Label.HorizontalAlign.CENTER;
        lab.verticalAlign = Label.VerticalAlign.CENTER;
        lab.color = color;
        lab.useSystemFont = true;
        lab.fontFamily = "Arial";
        lab.enableOutline = outline;
        if (outline) {
            lab.outlineColor = hexColor("#3A220C");
            lab.outlineWidth = 2;
        }
        if (!node.getComponent(UIOpacity)) node.addComponent(UIOpacity);
        return lab;
    }
}

const STYLE_NAME: Record<StrikeStyle, () => string> = {
    peck: () => gameText("BattleViewComp_001"),
    jump: () => gameText("BattleViewComp_002"),
    dive: () => gameText("BattleViewComp_003"),
    leap: () => gameText("BattleViewComp_004"),
    charge: () => gameText("BattleViewComp_005"),
    tail: () => gameText("BattleViewComp_006"),
    combo: () => gameText("BattleViewComp_007"),
    feint: () => gameText("BattleViewComp_008")
};
