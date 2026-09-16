import { Button, Color, EditBox, Label, Node, Sprite, SpriteFrame, UIOpacity, UITransform, isValid, tween, v3 } from "cc";
import { tableOf } from "../core/Config";
import { GameComponent } from "db://oops-framework/module/common/GameComponent";
import { oops } from "db://oops-framework/core/Oops";
import { backgroundSpritesOf, coverBackgroundOf } from "./adaptView";
import { playGameEffect } from "./GameAudio";

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

/** 打开预制体时绑定静态文案；动态名字和数值随后由各界面刷新。 */
export function applyConfiguredTexts(root: Node) {
    const texts = tableOf("UiText");
    const visit = (node: Node, path: string) => {
        const label = node.getComponent(Label);
        if (label && texts[path]) label.string = texts[path].text;
        const input = node.getComponent(EditBox);
        if (input && texts[path + "#placeholder"]) input.placeholder = texts[path + "#placeholder"].text;
        for (const child of node.children) visit(child, path + "/" + child.name);
    };
    visit(root, root.name);
}

export function setSpriteColor(node: Node | undefined, hex: string) {
    if (!node) return;
    const sp = node.getComponent(Sprite);
    if (sp) sp.color = hexColor(hex);
}

/** 换贴图。走框架的 setSprite 是为了让它接管引用计数，界面销毁时能正常释放。 */
export async function setNodeSprite(view: GameComponent, name: string, path: string) {
    const node = view.getNode(name)
        ?? (view.node.name === name ? coverBackgroundOf(view.node) : undefined);
    const sp = node?.getComponent(Sprite);
    if (sp) await view.setSprite(sp, path, "bundle");
}

/** 给当前界面真正在画的全屏底图换贴图（Cover 适配后的 *_adaptBg）。 */
export async function setCoverSprite(view: GameComponent, path: string) {
    const sprites = backgroundSpritesOf(view.node).filter(sp => isValid(sp));
    if (sprites.length === 0) return;
    await Promise.all(sprites.map(sp => view.setSprite(sp, path, "bundle")));
}

export function setNodeActive(view: GameComponent, name: string, active: boolean) {
    const node = view.getNode(name);
    if (node) node.active = active;
}

export function bindNodeClick(node: Node | undefined, cb: () => void, host: any) {
    if (!node) return;
    let btn = node.getComponent(Button);
    if (!btn) btn = node.addComponent(Button);
    btn.transition = Button.Transition.SCALE;
    btn.zoomScale = 0.94;
    node.off(Button.EventType.CLICK);
    node.on(Button.EventType.CLICK, () => {
        playGameEffect(/Back|Leave|Cancel|Home/.test(node.name) ? "close" : "click");
        void playSparkles(node);
        cb.call(host);
    }, host);
}

/** Reuses the Guandan star texture with a small, UI-only animation. */
let sparkleFrame: Promise<SpriteFrame> | undefined;
export async function playSparkles(origin: Node, count = 4) {
    // Shared for the game lifetime: a click can destroy its view while loading.
    sparkleFrame ??= oops.res.load("bundle", "game/texture/ui/click_star/spriteFrame", SpriteFrame);
    const frame = await sparkleFrame;
    if (!origin.isValid) return;
    const layer = new Node("ClickSparkles");
    layer.layer = origin.layer;
    layer.parent = origin;
    for (let i = 0; i < count; i++) {
        if (!layer.isValid) return;
        const star = new Node("Star");
        star.layer = layer.layer;
        star.parent = layer;
        star.addComponent(UITransform).setContentSize(20, 20);
        const sprite = star.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = frame;
        const angle = i / count * Math.PI * 2;
        const distance = count > 4 ? 180 : 42;
        tween(star).to(0.4, { position: v3(Math.cos(angle) * distance, Math.sin(angle) * distance, 0), scale: v3(0.2, 0.2, 1) }).start();
        tween(star.addComponent(UIOpacity)).to(0.4, { opacity: 0 }).call(() => {
            if (i === count - 1 && layer.isValid) layer.destroy();
        }).start();
    }
}

export function bindClick(view: GameComponent, name: string, cb: () => void) {
    bindNodeClick(view.getNode(name), cb, view);
}

export function clearChildren(node: Node | undefined) {
    if (!node) return;
    node.removeAllChildren();
}

/** Brief content entrance; animate position/opacity so button press scaling stays independent. */
export function revealUI(node: Node | null | undefined, delay = 0) {
    if (!node || !node.active) return;
    const home = node.position.clone();
    const opacity = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
    opacity.opacity = 0;
    node.setPosition(home.x, home.y - 18, home.z);
    tween(opacity).delay(delay).to(0.2, { opacity: 255 }).start();
    tween(node).delay(delay).to(0.26, { position: home }, { easing: "cubicOut" }).start();
}
