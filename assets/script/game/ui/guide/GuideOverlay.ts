import {
    BlockInputEvents, Button, Color, EditBox, EventTouch, Graphics, Label, Node, Rect, Sprite,
    Tween, UIOpacity, UITransform, Vec2, Widget, tween, v3, view
} from "cc";
import { oops } from "db://oops-framework/core/Oops";
import { hexColor } from "../shared/UiUtil";

interface Hole {
    nodes: Node[];
    x: number;
    y: number;
    w: number;
    h: number;
    r: number;
}

interface Band {
    x: number;
    y: number;
    w: number;
    h: number;
}

const PAD = 12;
const MIN = 64;
const MERGE = 32;
/** 非引导区蒙黑；挖空处不画任何东西，底层完全透出。 */
const DIM = new Color(0, 0, 0, 216);
const GOLD = new Color(255, 214, 72, 255);
const GOLD_SOFT = new Color(255, 236, 150, 220);
const TIP_BG = new Color(255, 248, 230, 255);
const GAP = 20;
const SCREEN_PAD = 18;
const TIP_FONT = 42;
const TIP_LINE = 56;
const TIP_MAX_W = 520;

/**
 * 全屏蒙黑挖空：只有引导区域透出并描金边，文案贴在高亮框旁边。
 */
export class GuideOverlay {
    private root: Node | null = null;
    private dim: Graphics | null = null;
    private ring: Graphics | null = null;
    private tipNode: Node | null = null;
    private tipLab: Label | null = null;
    private holes: Hole[] = [];
    private targets: Node[] = [];
    private tipText = "";
    private waiting: ((hit: Node | null) => void) | null = null;
    private trackTimer: ReturnType<typeof setTimeout> | null = null;
    private trackSince = 0;
    private ringPulsing = false;
    private veil: UIOpacity | null = null;

    get active(): boolean {
        return !!this.root?.isValid && !!this.waiting;
    }

    async show(targets: Node[], text: string): Promise<Node | null> {
        this.hide();
        const nodes = targets.filter(node => node?.isValid && node.activeInHierarchy);
        if (!nodes.length) return null;
        const host = this.ensureRoot();
        if (!host) return null;
        // 必须保持节点激活，Widget / worldMatrix 才能跟上切屏；先隐身不挡操作。
        host.active = true;
        if (host.parent) host.setSiblingIndex(host.parent.children.length - 1);
        this.arm(false);
        this.targets = nodes;
        this.tipText = text;
        this.ringPulsing = false;
        const shown = new Promise<Node | null>(resolve => {
            this.waiting = resolve;
        });
        // 切屏滑动时目标还在屏外，首帧挖空会被滤掉；跟到进屏再亮，不要直接放弃。
        this.trackSince = Date.now();
        this.track();
        return shown;
    }

    hide() {
        this.clearTrack();
        const pending = this.waiting;
        this.waiting = null;
        this.holes = [];
        this.targets = [];
        this.tipText = "";
        this.ringPulsing = false;
        if (this.ring?.node) Tween.stopAllByTarget(this.ring.node);
        if (this.tipNode?.isValid) this.tipNode.active = false;
        this.arm(false);
        if (this.root?.isValid) this.root.active = false;
        pending?.(null);
    }

    private ensureRoot(): Node | null {
        const layer = oops.gui?.guide;
        if (!layer?.isValid) return this.root?.isValid ? this.root : null;
        if (this.root?.isValid && this.root.parent === layer) {
            this.veil = this.root.getComponent(UIOpacity) || this.root.addComponent(UIOpacity);
            return this.root;
        }

        const root = new Node("GuideMask");
        root.layer = layer.layer;
        layer.addChild(root);
        const ut = root.addComponent(UITransform);
        ut.setAnchorPoint(0.5, 0.5);
        const widget = root.addComponent(Widget);
        widget.isAlignLeft = widget.isAlignRight = widget.isAlignTop = widget.isAlignBottom = true;
        widget.left = widget.right = widget.top = widget.bottom = 0;
        widget.alignMode = Widget.AlignMode.ALWAYS;
        widget.enabled = true;
        const block = root.addComponent(BlockInputEvents);
        block.enabled = false;
        this.veil = root.addComponent(UIOpacity);
        this.veil.opacity = 0;
        root.on(Node.EventType.TOUCH_END, this.onTouch, this);
        root.on(Node.EventType.TOUCH_START, this.swallow, this);
        root.on(Node.EventType.SIZE_CHANGED, this.onResize, this);

        const dimNode = new Node("Dim");
        dimNode.layer = root.layer;
        root.addChild(dimNode);
        dimNode.addComponent(UITransform).setAnchorPoint(0.5, 0.5);
        this.dim = dimNode.addComponent(Graphics);

        const ringNode = new Node("Ring");
        ringNode.layer = root.layer;
        root.addChild(ringNode);
        ringNode.addComponent(UITransform).setAnchorPoint(0.5, 0.5);
        this.ring = ringNode.addComponent(Graphics);

        this.tipNode = this.makeTip(root);
        this.tipNode.active = false;
        this.root = root;
        this.syncSize(root);
        return root;
    }

    private onResize() {
        if (!this.waiting || !this.root?.isValid) return;
        this.layout();
    }

    private armed(): boolean {
        return this.holes.length > 0 && (this.veil?.opacity ?? 0) > 200;
    }

    private arm(on: boolean) {
        if (this.veil) this.veil.opacity = on ? 255 : 0;
        const block = this.root?.getComponent(BlockInputEvents);
        if (block) block.enabled = on;
    }

    /** 目标进屏前每 50ms 对一次挖空；一直对不上才放弃，避免卡住后续引导。 */
    private track() {
        this.clearTrack();
        const tick = () => {
            this.trackTimer = null;
            if (!this.waiting || !this.root?.isValid) return;
            this.layout();
            if (this.holes.length) this.arm(true);
            else if (Date.now() - this.trackSince > 2500) {
                const done = this.waiting;
                this.waiting = null;
                this.hide();
                done?.(null);
                return;
            }
            this.trackTimer = setTimeout(tick, 50);
        };
        tick();
    }

    private clearTrack() {
        if (this.trackTimer == null) return;
        clearTimeout(this.trackTimer);
        this.trackTimer = null;
    }

    private layout() {
        const root = this.root;
        if (!root?.isValid) return;
        this.syncSize(root);
        void root.worldPosition;
        const ut = root.getComponent(UITransform)!;
        const vis = view.getVisibleSize();
        const screenW = Math.max(ut.width, vis.width, 720);
        const screenH = Math.max(ut.height, vis.height, 1280);
        const hw = ut.width / 2;
        const hh = ut.height / 2;
        this.holes = this.mergeHoles(
            this.targets
                .filter(node => node?.isValid && node.activeInHierarchy)
                .map(node => this.holeOf(node, root))
                .filter(hole => hole.w > 0 && hole.h > 0)
                .filter(hole => hole.w < screenW * 0.92 || hole.h < screenH * 0.72)
                .filter(hole => hole.x < hw && hole.x + hole.w > -hw && hole.y < hh && hole.y + hole.h > -hh)
        );
        if (!this.holes.length) return;
        this.paint();
        this.placeTip(this.tipText);
    }

    private syncSize(root: Node) {
        const ut = root.getComponent(UITransform)!;
        root.getComponent(Widget)?.updateAlignment();
        const parentUt = root.parent?.getComponent(UITransform);
        const w = parentUt?.width || ut.width || view.getVisibleSize().width || 720;
        const h = parentUt?.height || ut.height || view.getVisibleSize().height || 1280;
        if (Math.abs(ut.width - w) > 1 || Math.abs(ut.height - h) > 1) ut.setContentSize(w, h);
        this.dim?.node.getComponent(UITransform)?.setContentSize(ut.width, ut.height);
        this.ring?.node.getComponent(UITransform)?.setContentSize(ut.width, ut.height);
        this.dim?.node.setPosition(0, 0, 0);
        this.ring?.node.setPosition(0, 0, 0);
    }

    private swallow(ev: EventTouch) {
        if (!this.armed()) return;
        ev.propagationStopped = true;
    }

    private onTouch(ev: EventTouch) {
        if (!this.armed()) return;
        ev.propagationStopped = true;
        if (!this.waiting) return;
        const loc = ev.getUILocation();
        const hole = this.holes.find(item => this.contains(item, loc));
        if (!hole) return;
        const hit = hole.nodes.map(node => this.deepHit(node, loc)).find(node => !!node)
            || hole.nodes[0];
        const done = this.waiting;
        this.waiting = null;
        this.hide();
        done(hit);
    }

    private contains(hole: Hole, loc: Vec2) {
        const ut = this.root?.getComponent(UITransform);
        if (!ut) return false;
        const local = ut.convertToNodeSpaceAR(v3(loc.x, loc.y, 0));
        return local.x >= hole.x && local.x <= hole.x + hole.w
            && local.y >= hole.y && local.y <= hole.y + hole.h;
    }

    private deepHit(root: Node, loc: Vec2): Node | null {
        if (!root?.isValid || !root.activeInHierarchy) return null;
        for (let i = root.children.length - 1; i >= 0; i--) {
            const child = this.deepHit(root.children[i], loc);
            if (child) return child;
        }
        const ut = root.getComponent(UITransform);
        if (!ut) return null;
        const box = ut.getBoundingBoxToWorld();
        if (!box.contains(loc)) return null;
        return root;
    }

    private holeOf(node: Node, host: Node): Hole {
        void node.worldPosition;
        void host.worldPosition;
        const hostUt = host.getComponent(UITransform)!;
        const world = this.tightWorldBox(node);
        const p0 = hostUt.convertToNodeSpaceAR(v3(world.x, world.y, 0));
        const p1 = hostUt.convertToNodeSpaceAR(v3(world.x + world.width, world.y, 0));
        const p2 = hostUt.convertToNodeSpaceAR(v3(world.x, world.y + world.height, 0));
        const p3 = hostUt.convertToNodeSpaceAR(v3(world.x + world.width, world.y + world.height, 0));
        const x0 = Math.min(p0.x, p1.x, p2.x, p3.x) - PAD;
        const y0 = Math.min(p0.y, p1.y, p2.y, p3.y) - PAD;
        const x1 = Math.max(p0.x, p1.x, p2.x, p3.x) + PAD;
        const y1 = Math.max(p0.y, p1.y, p2.y, p3.y) + PAD;
        const w = Math.max(MIN, x1 - x0);
        const h = Math.max(MIN, y1 - y0);
        const cx = (x0 + x1) / 2;
        const cy = (y0 + y1) / 2;
        return { nodes: [node], x: cx - w / 2, y: cy - h / 2, w, h, r: Math.min(16, Math.min(w, h) * 0.2) };
    }

    /**
     * 预制体里很多容器 UITransform 是整屏 720×1280，真正可点的是里面的按钮。
     * 根节点即使挂了 Button，只要盒子过大仍改用子节点，避免挖空整屏。
     */
    private tightWorldBox(node: Node): Rect {
        const vis = view.getVisibleSize();
        const huge = (box: Rect) => box.width > vis.width * 0.5 && box.height > vis.height * 0.35;
        const own = this.ownWorldBox(node);
        if (this.isInteractive(node) && own && !huge(own)) return own;
        const hits: Rect[] = [];
        this.collectInteractive(node, hits);
        const smallHits = hits.filter(box => !huge(box));
        if (smallHits.length) return this.unionRects(smallHits);
        const visuals: Rect[] = [];
        this.collectVisual(node, visuals);
        if (visuals.length) return this.unionRects(visuals);
        if (own && !huge(own)) return own;
        return own || new Rect(node.worldPosition.x - 40, node.worldPosition.y - 40, 80, 80);
    }

    private isInteractive(node: Node) {
        return !!(node.getComponent(Button) || node.getComponent(EditBox));
    }

    private ownWorldBox(node: Node): Rect | null {
        const ut = node.getComponent(UITransform);
        if (!ut) return null;
        const w = ut.width;
        const h = ut.height;
        if (w < 2 || h < 2) return null;
        void node.worldPosition;
        const ax = ut.anchorPoint.x;
        const ay = ut.anchorPoint.y;
        const corners = [
            ut.convertToWorldSpaceAR(v3(-w * ax, -h * ay, 0)),
            ut.convertToWorldSpaceAR(v3(w * (1 - ax), -h * ay, 0)),
            ut.convertToWorldSpaceAR(v3(-w * ax, h * (1 - ay), 0)),
            ut.convertToWorldSpaceAR(v3(w * (1 - ax), h * (1 - ay), 0))
        ];
        const x0 = Math.min(corners[0].x, corners[1].x, corners[2].x, corners[3].x);
        const y0 = Math.min(corners[0].y, corners[1].y, corners[2].y, corners[3].y);
        const x1 = Math.max(corners[0].x, corners[1].x, corners[2].x, corners[3].x);
        const y1 = Math.max(corners[0].y, corners[1].y, corners[2].y, corners[3].y);
        if (x1 - x0 < 2 || y1 - y0 < 2) return null;
        return new Rect(x0, y0, x1 - x0, y1 - y0);
    }

    private collectInteractive(node: Node, out: Rect[]) {
        if (!node.activeInHierarchy) return;
        if (this.isInteractive(node)) {
            const box = this.ownWorldBox(node);
            if (box) out.push(box);
            return;
        }
        for (const child of node.children) this.collectInteractive(child, out);
    }

    private collectVisual(node: Node, out: Rect[]) {
        if (!node.activeInHierarchy) return;
        const visual = node.getComponent(Sprite) || node.getComponent(Label) || node.getComponent(Graphics);
        const box = visual ? this.ownWorldBox(node) : null;
        if (box && box.width < 680 && box.height < 720) out.push(box);
        for (const child of node.children) this.collectVisual(child, out);
    }

    private unionRects(rects: Rect[]): Rect {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const rect of rects) {
            x0 = Math.min(x0, rect.x);
            y0 = Math.min(y0, rect.y);
            x1 = Math.max(x1, rect.x + rect.width);
            y1 = Math.max(y1, rect.y + rect.height);
        }
        return new Rect(x0, y0, Math.max(2, x1 - x0), Math.max(2, y1 - y0));
    }

    private mergeHoles(holes: Hole[]): Hole[] {
        const items = holes.map(hole => ({ ...hole, nodes: hole.nodes.slice() }));
        let changed = true;
        while (changed) {
            changed = false;
            outer: for (let i = 0; i < items.length; i++) {
                for (let j = i + 1; j < items.length; j++) {
                    if (!this.nearHoles(items[i], items[j])) continue;
                    items[i] = this.combineHoles(items[i], items[j]);
                    items.splice(j, 1);
                    changed = true;
                    break outer;
                }
            }
        }
        return items;
    }

    private nearHoles(a: Hole, b: Hole) {
        const ax2 = a.x + a.w + MERGE;
        const ay2 = a.y + a.h + MERGE;
        const bx2 = b.x + b.w + MERGE;
        const by2 = b.y + b.h + MERGE;
        return a.x - MERGE < bx2 && ax2 > b.x - MERGE && a.y - MERGE < by2 && ay2 > b.y - MERGE;
    }

    private combineHoles(a: Hole, b: Hole): Hole {
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const w = Math.max(a.x + a.w, b.x + b.w) - x;
        const h = Math.max(a.y + a.h, b.y + b.h) - y;
        return {
            nodes: a.nodes.concat(b.nodes),
            x, y, w, h,
            r: Math.min(16, Math.min(w, h) * 0.2)
        };
    }

    private paint() {
        const root = this.root;
        const dim = this.dim;
        const ring = this.ring;
        if (!root?.isValid || !dim || !ring) return;
        this.syncSize(root);
        const ut = root.getComponent(UITransform)!;
        const hw = ut.width / 2;
        const hh = ut.height / 2;

        dim.clear();
        dim.lineWidth = 0;
        dim.fillColor = DIM;
        const leftover = this.punch([{ x: -hw, y: -hh, w: hw * 2, h: hh * 2 }], this.holes);
        for (const band of leftover) {
            if (band.w < 0.5 || band.h < 0.5) continue;
            dim.rect(band.x, band.y, band.w, band.h);
            dim.fill();
        }

        ring.clear();
        for (const hole of this.holes) {
            ring.strokeColor = new Color(40, 18, 6, 255);
            ring.lineWidth = 8;
            this.pathHole(ring, hole);
            ring.stroke();
            ring.strokeColor = GOLD;
            ring.lineWidth = 5;
            this.pathHole(ring, hole);
            ring.stroke();
            ring.strokeColor = GOLD_SOFT;
            ring.lineWidth = 2;
            this.pathHole(ring, {
                ...hole,
                x: hole.x - 5,
                y: hole.y - 5,
                w: hole.w + 10,
                h: hole.h + 10,
                r: hole.r + 4
            });
            ring.stroke();
        }
        this.pulseRing(ring.node);
    }

    /** 从全屏矩形里抠掉所有引导框，剩余区域填黑。不依赖 Mask / even-odd。 */
    private punch(bands: Band[], holes: Hole[]): Band[] {
        let cur = bands;
        for (const hole of holes) {
            const next: Band[] = [];
            for (const band of cur) next.push(...this.subtract(band, hole));
            cur = next;
        }
        return cur;
    }

    private subtract(a: Band, b: Hole): Band[] {
        const ax2 = a.x + a.w;
        const ay2 = a.y + a.h;
        const bx2 = b.x + b.w;
        const by2 = b.y + b.h;
        const ix = Math.max(a.x, b.x);
        const iy = Math.max(a.y, b.y);
        const ix2 = Math.min(ax2, bx2);
        const iy2 = Math.min(ay2, by2);
        if (ix >= ix2 || iy >= iy2) return [a];
        const out: Band[] = [];
        if (ay2 > iy2) out.push({ x: a.x, y: iy2, w: a.w, h: ay2 - iy2 });
        if (iy > a.y) out.push({ x: a.x, y: a.y, w: a.w, h: iy - a.y });
        if (ix > a.x) out.push({ x: a.x, y: iy, w: ix - a.x, h: iy2 - iy });
        if (ax2 > ix2) out.push({ x: ix2, y: iy, w: ax2 - ix2, h: iy2 - iy });
        return out.filter(item => item.w > 0.5 && item.h > 0.5);
    }

    private pathHole(g: Graphics, hole: Hole) {
        g.roundRect(hole.x, hole.y, hole.w, hole.h, hole.r);
    }

    private pulseRing(node: Node) {
        if (this.ringPulsing) return;
        this.ringPulsing = true;
        Tween.stopAllByTarget(node);
        node.setScale(1, 1, 1);
        const op = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
        op.opacity = 255;
        tween(op)
            .repeatForever(
                tween(op)
                    .to(0.55, { opacity: 170 }, { easing: "sineInOut" })
                    .to(0.55, { opacity: 255 }, { easing: "sineInOut" })
            )
            .start();
    }

    private makeTip(parent: Node): Node {
        const node = new Node("Tip");
        node.layer = parent.layer;
        parent.addChild(node);
        node.addComponent(UITransform).setContentSize(520, 160);
        node.addComponent(Graphics);
        const labNode = new Node("Lab");
        labNode.layer = node.layer;
        node.addChild(labNode);
        labNode.addComponent(UITransform).setContentSize(TIP_MAX_W, 140);
        const lab = labNode.addComponent(Label);
        lab.string = "";
        lab.fontSize = TIP_FONT;
        lab.lineHeight = TIP_LINE;
        lab.isBold = true;
        lab.overflow = Label.Overflow.RESIZE_HEIGHT;
        lab.enableWrapText = true;
        lab.horizontalAlign = Label.HorizontalAlign.CENTER;
        lab.verticalAlign = Label.VerticalAlign.CENTER;
        lab.color = hexColor("#3A220C");
        lab.enableOutline = true;
        lab.outlineColor = hexColor("#FFF8E8");
        lab.outlineWidth = 4;
        lab.useSystemFont = true;
        this.tipLab = lab;
        return node;
    }

    private placeTip(text: string) {
        const node = this.tipNode;
        const lab = this.tipLab;
        const root = this.root;
        if (!node?.isValid || !lab || !root) return;
        lab.string = text || "";
        if (!text) {
            node.active = false;
            return;
        }
        const hostH = root.getComponent(UITransform)?.height || 1280;
        const font = Math.round(Math.max(40, Math.min(62, hostH / 22)));
        lab.fontSize = font;
        lab.lineHeight = Math.round(font * 1.32);
        lab.outlineWidth = 4;
        const labUt = lab.node.getComponent(UITransform)!;
        const maxW = Math.min(TIP_MAX_W, Math.max(280, (root.getComponent(UITransform)?.width || 720) - 64));
        labUt.setContentSize(maxW, 400);
        lab.updateRenderData(true);
        const textW = Math.min(maxW, Math.max(240, labUt.contentSize.width));
        const textH = Math.max(lab.lineHeight, labUt.contentSize.height);
        labUt.setContentSize(textW, textH);
        const boxW = textW + 48;
        const boxH = textH + 36;
        node.getComponent(UITransform)!.setContentSize(boxW, boxH);

        const hostUt = root.getComponent(UITransform)!;
        const hole = this.anchorHole();
        const place = this.tipPlace(hole, boxW, boxH, hostUt.width, hostUt.height);
        node.setPosition(place.x, place.y, 0);
        this.drawTip(node.getComponent(Graphics)!, boxW, boxH, place.side);
        const first = !node.active;
        node.active = true;
        const op = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
        if (first) {
            Tween.stopAllByTarget(node);
            op.opacity = 0;
            tween(op).to(0.16, { opacity: 255 }).start();
        }
        else op.opacity = 255;
    }

    /** 文案贴在「主高亮框」旁；多目标时用第一块，避免贴到跨屏大包围盒上。 */
    private anchorHole(): Hole {
        return this.holes[0];
    }

    /** 优先贴在高亮框右侧，空间不够再试上 / 左 / 下，始终挨着框且尽量不挡住挖空。 */
    private tipPlace(hole: Hole, boxW: number, boxH: number, screenW: number, screenH: number) {
        const hw = screenW / 2;
        const hh = screenH / 2;
        const cx = hole.x + hole.w / 2;
        const cy = hole.y + hole.h / 2;
        const fits = (x: number, y: number) =>
            x - boxW / 2 >= -hw + SCREEN_PAD && x + boxW / 2 <= hw - SCREEN_PAD
            && y - boxH / 2 >= -hh + SCREEN_PAD && y + boxH / 2 <= hh - SCREEN_PAD;
        const overlapsHole = (x: number, y: number) => this.holes.some(item =>
            x + boxW / 2 > item.x + 4 && x - boxW / 2 < item.x + item.w - 4
            && y + boxH / 2 > item.y + 4 && y - boxH / 2 < item.y + item.h - 4
        );
        const right = { x: hole.x + hole.w + GAP + boxW / 2, y: cy, side: "right" as const };
        const up = { x: cx, y: hole.y + hole.h + GAP + boxH / 2, side: "up" as const };
        const left = { x: hole.x - GAP - boxW / 2, y: cy, side: "left" as const };
        const down = { x: cx, y: hole.y - GAP - boxH / 2, side: "down" as const };
        const wide = hole.w > screenW * 0.55;
        const candidates = wide ? [up, down, left, right] : [right, up, left, down];
        const clamp = (x: number, y: number) => ({
            x: Math.max(-hw + boxW / 2 + SCREEN_PAD, Math.min(hw - boxW / 2 - SCREEN_PAD, x)),
            y: Math.max(-hh + boxH / 2 + SCREEN_PAD, Math.min(hh - boxH / 2 - SCREEN_PAD, y))
        });
        let best = candidates[0];
        let bestScore = Number.POSITIVE_INFINITY;
        for (const item of candidates) {
            const pos = clamp(item.x, item.y);
            let score = 0;
            if (!fits(item.x, item.y)) score += 80;
            if (overlapsHole(pos.x, pos.y)) score += 400;
            if (item.side === "up") score += 1;
            if (item.side === "left") score += 2;
            if (item.side === "down") score += 3;
            if (score < bestScore) {
                bestScore = score;
                best = { ...item, x: pos.x, y: pos.y };
            }
        }
        const side = this.sideToward(best.x, best.y, hole);
        return { x: best.x, y: best.y, side };
    }

    private sideToward(x: number, y: number, hole: Hole): "right" | "up" | "left" | "down" {
        const cx = hole.x + hole.w / 2;
        const cy = hole.y + hole.h / 2;
        const dx = x - cx;
        const dy = y - cy;
        if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
        return dy >= 0 ? "up" : "down";
    }

    private drawTip(g: Graphics, boxW: number, boxH: number, side: "right" | "up" | "left" | "down") {
        g.clear();
        g.fillColor = TIP_BG;
        g.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, 16);
        g.fill();
        g.strokeColor = GOLD;
        g.lineWidth = 3;
        g.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, 16);
        g.stroke();

        const tail = 14;
        g.fillColor = TIP_BG;
        g.strokeColor = GOLD;
        g.lineWidth = 3;
        if (side === "right") {
            g.moveTo(-boxW / 2 + 1, 10);
            g.lineTo(-boxW / 2 - tail, 0);
            g.lineTo(-boxW / 2 + 1, -10);
        }
        else if (side === "left") {
            g.moveTo(boxW / 2 - 1, 10);
            g.lineTo(boxW / 2 + tail, 0);
            g.lineTo(boxW / 2 - 1, -10);
        }
        else if (side === "up") {
            g.moveTo(-10, -boxH / 2 + 1);
            g.lineTo(0, -boxH / 2 - tail);
            g.lineTo(10, -boxH / 2 + 1);
        }
        else {
            g.moveTo(-10, boxH / 2 - 1);
            g.lineTo(0, boxH / 2 + tail);
            g.lineTo(10, boxH / 2 - 1);
        }
        g.close();
        g.fill();
        g.stroke();
    }
}
