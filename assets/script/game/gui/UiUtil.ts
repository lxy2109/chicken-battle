import { Button, Color, Label, Node, Sprite } from "cc";
import { GameComponent } from "db://oops-framework/module/common/GameComponent";

export function hexColor(hex: string): Color {
    const h = hex.replace("#", "");
    const n = parseInt(h, 16);
    if (h.length === 6) {
        return new Color((n >> 16) & 255, (n >> 8) & 255, n & 255, 255);
    }
    return new Color(255, 255, 255, 255);
}

export function setLabel(view: GameComponent, name: string, text: string) {
    const node = view.getNode(name);
    if (!node) return;
    const lab = node.getComponent(Label);
    if (lab) lab.string = text;
}

export function setSpriteColor(node: Node | undefined, hex: string) {
    if (!node) return;
    const sp = node.getComponent(Sprite);
    if (sp) sp.color = hexColor(hex);
}

/** 换贴图。走框架的 setSprite 是为了让它接管引用计数，界面销毁时能正常释放。 */
export async function setNodeSprite(view: GameComponent, name: string, path: string) {
    const sp = view.getNode(name)?.getComponent(Sprite);
    if (sp) await view.setSprite(sp, path);
}

export function setNodeActive(view: GameComponent, name: string, active: boolean) {
    const node = view.getNode(name);
    if (node) node.active = active;
}

export function bindNodeClick(node: Node | undefined, cb: () => void, host: any) {
    if (!node) return;
    let btn = node.getComponent(Button);
    if (!btn) btn = node.addComponent(Button);
    node.off(Button.EventType.CLICK);
    node.on(Button.EventType.CLICK, cb, host);
}

export function bindClick(view: GameComponent, name: string, cb: () => void) {
    bindNodeClick(view.getNode(name), cb, view);
}

export function clearChildren(node: Node | undefined) {
    if (!node) return;
    node.removeAllChildren();
}
