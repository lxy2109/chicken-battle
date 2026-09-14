import { Camera, Color, Graphics, Node, Tween, UIOpacity, UITransform, Vec3, tween, view } from "cc";

/** 战斗专用镜头与屏幕冲击；只持有本次动画，退出时还原共用的 UI 摄像机。 */
export class BattleScreenEffects {
    private motion?: Tween<{ progress: number }>;
    private fade?: Tween<UIOpacity>;
    private home?: Vec3;
    private height = 0;
    private strength = 0;
    private phase = { progress: 1 };
    private overlay: Node;
    private graphics: Graphics;
    private opacity: UIOpacity;

    constructor(private root: Node, private camera: Camera) {
        this.overlay = new Node("BattleScreenImpact");
        this.overlay.layer = root.layer;
        this.overlay.parent = root;
        this.overlay.addComponent(UITransform);
        this.graphics = this.overlay.addComponent(Graphics);
        this.opacity = this.overlay.addComponent(UIOpacity);
        this.opacity.opacity = 0;
        root.once(Node.EventType.NODE_DESTROYED, this.clear, this);
        view.on("canvas-resize", this.onResize, this);
        view.on("design-resolution-changed", this.onResize, this);
    }

    play(power: number, heavy = false, critical = false, direction = 1) {
        if (!this.root.isValid || !this.overlay.isValid || !this.camera?.isValid) return;
        // 连续命中沿用剩余震幅，轻击不会突然截断重击。
        const strength = Math.max(Math.min(power * 0.65, 20), this.strength * (1 - this.phase.progress));
        this.restoreCamera();
        this.home = this.camera.node.position.clone();
        this.height = this.camera.orthoHeight;
        this.strength = strength;
        this.phase = { progress: 0 };
        const bounds = this.root.getComponent(UITransform)!;
        const width = bounds.width, height = bounds.height;
        // 推近留出震动余量，避免摄像机横移时露出背景外沿。
        const zoom = (strength * 2 + 8) / Math.max(1, Math.min(width, height));
        const apply = () => {
            if (!this.camera.isValid || !this.home) return;
            const p = this.phase.progress;
            const decay = (1 - p) * (1 - p);
            this.camera.node.setPosition(
                this.home.x + Math.cos(p * Math.PI * 7) * strength * decay * direction,
                this.home.y + Math.sin(p * Math.PI * 9) * strength * decay * 0.45,
                this.home.z);
            this.camera.orthoHeight = this.height / (1 + zoom * decay);
        };
        apply();
        this.motion = tween(this.phase)
            .to(critical ? 0.3 : heavy ? 0.24 : 0.18, { progress: 1 }, { onUpdate: apply })
            .call(() => this.restoreCamera()).start();

        if (!heavy && !critical) return;
        this.fade?.stop();
        this.overlay.setSiblingIndex(this.root.children.length - 1);
        this.overlay.getComponent(UITransform)!.setContentSize(width, height);
        this.overlay.setPosition((0.5 - bounds.anchorX) * width, (0.5 - bounds.anchorY) * height, 0);
        const g = this.graphics;
        g.clear();
        const tint = critical ? new Color(255, 203, 88, 42) : new Color(255, 242, 209, 25);
        g.fillColor = tint;
        // 外扩覆盖震动范围；中间仅保留淡色闪光，角色和血条仍可见。
        g.rect(-width / 2 - 48, -height / 2 - 48, width + 96, height + 96);
        g.fill();
        g.fillColor = critical ? new Color(255, 207, 93, 180) : new Color(255, 249, 224, 125);
        const count = critical ? 24 : 16;
        for (let i = 0; i < count; i++) {
            const angle = (i + 0.35) * Math.PI * 2 / count;
            const x = Math.cos(angle), y = Math.sin(angle);
            const edge = Math.min(width / 2 / Math.max(0.001, Math.abs(x)), height / 2 / Math.max(0.001, Math.abs(y)));
            const length = edge * (i % 3 === 0 ? 0.3 : 0.18);
            const spread = critical ? 9 : 6;
            g.moveTo(x * (edge + 32) - y * spread, y * (edge + 32) + x * spread);
            g.lineTo(x * (edge - length), y * (edge - length));
            g.lineTo(x * (edge + 32) + y * spread, y * (edge + 32) - x * spread);
            g.close();
            g.fill();
        }
        this.opacity.opacity = 255;
        this.fade = tween(this.opacity).to(critical ? 0.24 : 0.16, { opacity: 0 }, { easing: "quadOut" }).start();
    }

    private restoreCamera() {
        this.motion?.stop();
        this.motion = undefined;
        if (this.home && this.camera.isValid) {
            this.camera.node.setPosition(this.home);
            this.camera.orthoHeight = this.height;
        }
        this.home = undefined;
    }

    private onResize() {
        // Canvas 先完成摄像机适配；丢弃旧基准，不能把新分辨率还原回去。
        this.home = undefined;
        this.restoreCamera();
        this.phase.progress = 1;
        this.fade?.stop();
        this.opacity.opacity = 0;
    }

    clear() {
        this.restoreCamera();
        this.fade?.stop();
        this.root.off(Node.EventType.NODE_DESTROYED, this.clear, this);
        view.off("canvas-resize", this.onResize, this);
        view.off("design-resolution-changed", this.onResize, this);
        if (this.overlay.isValid) this.overlay.destroy();
    }
}
