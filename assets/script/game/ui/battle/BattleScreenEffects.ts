import { Camera, Node, Tween, UITransform, Vec3, tween, view } from "cc";

/** 战斗专用镜头；只持有本次动画，退出时还原共用的 UI 摄像机。命中只震屏，不再铺边框闪屏。 */
export class BattleScreenEffects {
    private motion?: Tween<{ progress: number }>;
    private home?: Vec3;
    private height = 0;
    private strength = 0;
    private phase = { progress: 1 };

    constructor(private root: Node, private camera: Camera) {
        root.once(Node.EventType.NODE_DESTROYED, this.clear, this);
        view.on("canvas-resize", this.onResize, this);
        view.on("design-resolution-changed", this.onResize, this);
    }

    play(power: number, heavy = false, critical = false, direction = 1) {
        if (!this.root.isValid || !this.camera?.isValid) return;
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
    }

    /**
     * 绝招盖屏前的镜头：贴着鸡推近再回弹。
     * 时长卡在蓄力姿态窗口里，立绘一出来镜头已经还完，避免推镜发生在全黑/全立绘后面。
     */
    skillCast(direction = 1, full = true) {
        if (!this.root.isValid || !this.camera?.isValid) return;
        const strength = full ? 10 : 6;
        this.restoreCamera();
        this.home = this.camera.node.position.clone();
        this.height = this.camera.orthoHeight;
        this.strength = strength;
        this.phase = { progress: 0 };
        const bounds = this.root.getComponent(UITransform)!;
        const width = bounds.width, height = bounds.height;
        const zoom = (full ? 28 : 16) / Math.max(1, Math.min(width, height));
        const apply = () => {
            if (!this.camera.isValid || !this.home) return;
            const p = this.phase.progress;
            // 前半段推近，后半段带着微震退回，读招窗口更清楚。
            const pull = p < 0.4 ? p / 0.4 : 1 - (p - 0.4) / 0.6;
            const decay = pull * pull;
            this.camera.node.setPosition(
                this.home.x + Math.cos(p * Math.PI * 3) * strength * 0.35 * decay * direction,
                this.home.y + Math.sin(p * Math.PI * 4) * strength * 0.2 * decay,
                this.home.z);
            this.camera.orthoHeight = this.height / (1 + zoom * decay);
        };
        apply();
        this.motion = tween(this.phase)
            .to(full ? 0.34 : 0.26, { progress: 1 }, { onUpdate: apply })
            .call(() => this.restoreCamera()).start();
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
    }

    clear() {
        this.restoreCamera();
        this.root.off(Node.EventType.NODE_DESTROYED, this.clear, this);
        view.off("canvas-resize", this.onResize, this);
        view.off("design-resolution-changed", this.onResize, this);
    }
}
