import { Node, Sprite, UITransform, Widget } from "cc";
import { UIBgAdaptation } from "./UIBgAdaptation";

const ADAPTED = "__screenAdapted";

/**
 * 只处理背景 Cover。四角 / 顶底按钮的贴边全部写在预制体 Widget 上，
 * 运行时不再改这些节点的尺寸、父节点或 Widget。
 */
export function adaptView(root: Node): void {
    if (!root?.isValid || (root as any)[ADAPTED]) return;
    (root as any)[ADAPTED] = true;

    const sx = root.scale.x;
    const sy = root.scale.y;
    const needsContentScale = Math.abs(sx - 1) > 0.01 || Math.abs(sy - 1) > 0.01;

    ensureCoverBackground(root);

    if (needsContentScale) {
        const content = root.getChildByName("content") ?? new Node("content");
        content.layer = root.layer;
        const rootUt = root.getComponent(UITransform);
        const contentUt = content.getComponent(UITransform) || content.addComponent(UITransform);
        if (rootUt) contentUt.setContentSize(rootUt.contentSize);
        content.setScale(sx, sy, root.scale.z);
        const rootBg = findCoverBg(root);
        const kids = root.children.filter(child => child !== rootBg && child !== content);
        for (const child of kids) child.setParent(content, false);
        if (!content.parent) root.addChild(content);
        root.setScale(1, 1, 1);
    }

    const widget = root.getComponent(Widget) || root.addComponent(Widget);
    widget.isAlignTop = widget.isAlignBottom = widget.isAlignLeft = widget.isAlignRight = true;
    widget.isAlignHorizontalCenter = false;
    widget.isAlignVerticalCenter = false;
    widget.left = widget.right = widget.top = widget.bottom = 0;
    widget.alignMode = Widget.AlignMode.ALWAYS;
    widget.enabled = true;
    widget.updateAlignment();

    // 让 720 设计区随画布变高：子节点上的 Widget 才能吃到长屏多出来的中间空间。
    const content = root.getChildByName("content");
    const rootUt = root.getComponent(UITransform);
    if (content && rootUt && needsContentScale) {
        const contentUt = content.getComponent(UITransform);
        const scale = Math.max(Math.abs(sx), 0.01);
        contentUt?.setContentSize(rootUt.width / scale, rootUt.height / scale);
        content.setPosition(0, 0, 0);
    }

    const startPanel = findNode(root, "StartPanel");
    if (startPanel) ensureCoverBackground(startPanel);
}

function coverBgName(host: Node): string {
    return `${host.name}_adaptBg`;
}

function findCoverBg(host: Node): Node | null {
    return host.getChildByName(coverBgName(host)) || host.getChildByName("bg");
}

function ensureCoverBackground(host: Node): Node | null {
    if (!host?.isValid) return null;
    let bg = findCoverBg(host);
    const hostSprite = host.getComponent(Sprite);
    if (!bg && hostSprite?.spriteFrame) {
        const hostUt = host.getComponent(UITransform);
        if (hostUt && (hostUt.width < 600 || hostUt.height < 1000)) return null;
        bg = new Node(coverBgName(host));
        bg.layer = host.layer;
        const bgUt = bg.addComponent(UITransform);
        if (hostUt) {
            bgUt.setContentSize(hostUt.contentSize);
            bgUt.setAnchorPoint(hostUt.anchorPoint);
        }
        const bgSprite = bg.addComponent(Sprite);
        bgSprite.spriteFrame = hostSprite.spriteFrame;
        bgSprite.sizeMode = hostSprite.sizeMode;
        bgSprite.type = hostSprite.type;
        bgSprite.color = hostSprite.color;
        hostSprite.destroy();
        host.insertChild(bg, 0);
    }
    if (!bg?.isValid) return null;

    const bgWidget = bg.getComponent(Widget);
    if (bgWidget) {
        bgWidget.enabled = false;
        bgWidget.destroy();
    }
    if (!bg.getComponent(UIBgAdaptation)) bg.addComponent(UIBgAdaptation);
    bg.setSiblingIndex(0);
    return bg;
}

function findNode(root: Node, name: string): Node | null {
    if (root.name === name) return root;
    for (const child of root.children) {
        const found = findNode(child, name);
        if (found) return found;
    }
    return null;
}
