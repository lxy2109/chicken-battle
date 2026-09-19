import { Canvas, Component, Node, Size, UITransform, Vec3, _decorator, screen, view } from "cc";

const { ccclass, property } = _decorator;

/**
 * 背景等比 Cover 适配：按最终逻辑画布放大，铺满屏幕，超出部分裁切。
 * 只改本节点 scale，不改 UITransform 尺寸，也不缩放兄弟 UI。
 */
@ccclass("UIBgAdaptation")
export class UIBgAdaptation extends Component {
    @property({ type: UITransform, tooltip: "裁切视口；留空时使用最近 Canvas 的 UITransform。" })
    public viewportTransform: UITransform | null = null;

    private authoredSize: Size | null = null;
    private authoredScale: Vec3 | null = null;
    private boundViewportNode: Node | null = null;

    protected onLoad(): void {
        this.captureAuthoredBaseline();
    }

    protected onEnable(): void {
        this.bindScreenEvents();
        this.bindViewportSizeListener();
        this.refresh();
        this.scheduleOnce(this.refreshNextFrame, 0);
    }

    protected onDisable(): void {
        this.unschedule(this.refreshNextFrame);
        this.unbindScreenEvents();
        this.unbindViewportSizeListener();
        this.restoreAuthoredScale();
    }

    protected onDestroy(): void {
        this.unschedule(this.refreshNextFrame);
        this.unbindScreenEvents();
        this.unbindViewportSizeListener();
    }

    public refresh(): void {
        if (!this.authoredSize || !this.authoredScale) {
            this.captureAuthoredBaseline();
        }
        if (!this.authoredSize || !this.authoredScale) {
            return;
        }

        this.bindViewportSizeListener();
        const viewportSize = this.resolveViewportSize();
        if (!viewportSize || viewportSize.width <= 0 || viewportSize.height <= 0
            || this.authoredSize.width <= 0 || this.authoredSize.height <= 0) {
            return;
        }

        const authoredWidth = this.authoredSize.width * Math.max(Math.abs(this.authoredScale.x), Number.EPSILON);
        const authoredHeight = this.authoredSize.height * Math.max(Math.abs(this.authoredScale.y), Number.EPSILON);
        const parentWorld = this.node.parent?.worldScale;
        const parentX = Math.max(Math.abs(parentWorld?.x ?? 1), Number.EPSILON);
        const parentY = Math.max(Math.abs(parentWorld?.y ?? 1), Number.EPSILON);
        const scale = Math.max(
            viewportSize.width / (authoredWidth * parentX),
            viewportSize.height / (authoredHeight * parentY),
        );
        this.node.setScale(
            this.authoredScale.x * scale,
            this.authoredScale.y * scale,
            this.authoredScale.z,
        );
    }

    private captureAuthoredBaseline(): void {
        const transform = this.getComponent(UITransform);
        if (!transform || transform.contentSize.width <= 0 || transform.contentSize.height <= 0) {
            return;
        }
        if (!this.authoredSize) {
            this.authoredSize = new Size(transform.contentSize.width, transform.contentSize.height);
        }
        if (!this.authoredScale) {
            this.authoredScale = this.node.scale.clone();
        }
    }

    private handleViewportChanged = (): void => {
        this.bindViewportSizeListener();
        this.refresh();
    };

    private refreshNextFrame = (): void => {
        if (this.enabled && this.node.isValid) {
            this.refresh();
        }
    };

    private bindScreenEvents(): void {
        screen.on("window-resize", this.handleViewportChanged, this);
        screen.on("orientation-change", this.handleViewportChanged, this);
        screen.on("fullscreen-change", this.handleViewportChanged, this);
    }

    private unbindScreenEvents(): void {
        screen.off("window-resize", this.handleViewportChanged, this);
        screen.off("orientation-change", this.handleViewportChanged, this);
        screen.off("fullscreen-change", this.handleViewportChanged, this);
    }

    private restoreAuthoredScale(): void {
        if (this.authoredScale && this.node.isValid) {
            this.node.setScale(this.authoredScale);
        }
    }

    private bindViewportSizeListener(): void {
        const viewportTransform = this.resolveViewportTransform();
        const nextNode = viewportTransform?.node ?? null;
        if (nextNode === this.boundViewportNode) {
            return;
        }
        this.unbindViewportSizeListener();
        this.boundViewportNode = nextNode;
        this.boundViewportNode?.on(Node.EventType.SIZE_CHANGED, this.handleViewportChanged, this);
    }

    private unbindViewportSizeListener(): void {
        this.boundViewportNode?.off(Node.EventType.SIZE_CHANGED, this.handleViewportChanged, this);
        this.boundViewportNode = null;
    }

    private resolveViewportTransform(): UITransform | null {
        if (this.viewportTransform?.isValid) {
            return this.viewportTransform;
        }
        let current: Node | null = this.node;
        while (current) {
            if (current.getComponent(Canvas)) {
                return current.getComponent(UITransform);
            }
            current = current.parent;
        }
        return this.node.parent?.getComponent(UITransform) ?? null;
    }

    private resolveViewportSize(): Size | null {
        const transform = this.resolveViewportTransform();
        if (transform && transform.contentSize.width > 0 && transform.contentSize.height > 0) {
            return transform.contentSize;
        }
        const visibleSize = view.getVisibleSize();
        if (visibleSize.width <= 0 || visibleSize.height <= 0) {
            return null;
        }
        return new Size(visibleSize.width, visibleSize.height);
    }
}
