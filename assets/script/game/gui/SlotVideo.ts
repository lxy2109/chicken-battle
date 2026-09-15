import { Asset, BufferAsset, Node, Sprite, UITransform, assetManager } from "cc";
import { GameComponent } from "db://oops-framework/module/common/GameComponent";
import GifFrameAni from "../../gif/GifFrameAni";
import { TEX, getSets } from "../core/Catalog";
import { Appearance } from "../core/Types";

const GIF_NODE = "SuitGif";

/**
 * 结算套装胜利 GIF：穿齐一套且赢得对局时在 ChickenSlot 里播对应动画。
 * 当前没有片源时返回 false，调用方继续展示立绘/拼装鸡。
 */
export async function playResultSuitVideo(view: GameComponent, slotName: string, appearance: Appearance): Promise<boolean> {
    const suit = suitForWinGif(appearance);
    if (!suit) return false;
    return playSlotGif(view, slotName, TEX.suitGif(suit.id));
}

/** 在指定 slot 内创建并播放 GIF，画面按 slot 尺寸等比铺满。 */
export async function playSlotGif(view: GameComponent, slotName: string, path: string): Promise<boolean> {
    const slot = view.getNode(slotName);
    if (!slot) return false;
    const asset = await loadGifAsset(view, path);
    if (!asset || !slot.isValid) return false;
    const ani = mountSlotGif(slot);
    const slotWidth = slot.getComponent(UITransform)?.width || 360;
    const ok = await ani.play(asset, Math.max(256, Math.floor(slotWidth)));
    if (!ok || !ani.isValid || !slot.isValid) {
        stopSlotVideo(slot);
        return false;
    }
    fitGifToSlot(ani.node, slot);
    return true;
}

export function stopSlotVideo(slot: Node | undefined | null) {
    if (!slot?.isValid) return;
    slot.getChildByName(GIF_NODE)?.destroy();
}

function suitForWinGif(appearance: Appearance) {
    const equipped = Object.values(appearance.equipment || {});
    return getSets().find(set => !set.legacy && set.pieceIds.every(id => equipped.includes(id)));
}

function mountSlotGif(slot: Node): GifFrameAni {
    stopSlotVideo(slot);
    for (const child of slot.children) child.destroy();
    slot.removeAllChildren();
    const node = new Node(GIF_NODE);
    node.layer = slot.layer;
    node.parent = slot;
    node.setPosition(0, 0, 0);
    const slotTransform = slot.getComponent(UITransform);
    const transform = node.addComponent(UITransform);
    if (slotTransform) {
        transform.setContentSize(slotTransform.contentSize);
        transform.setAnchorPoint(slotTransform.anchorPoint);
    }
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.type = Sprite.Type.SIMPLE;
    return node.addComponent(GifFrameAni);
}

function fitGifToSlot(node: Node, slot: Node) {
    const slotTransform = slot.getComponent(UITransform);
    const transform = node.getComponent(UITransform);
    const frame = node.getComponent(Sprite)?.spriteFrame;
    if (!slotTransform || !transform || !frame) return;
    const width = Math.max(frame.rect.width, 1);
    const height = Math.max(frame.rect.height, 1);
    const scale = Math.min(slotTransform.width / width, slotTransform.height / height);
    transform.setContentSize(width * scale, height * scale);
}

async function loadGifAsset(view: GameComponent, path: string): Promise<Asset | null> {
    const bundle = assetManager.getBundle("bundle");
    if (!bundle) return null;
    const resolved = resolveGifPath(bundle, path);
    if (!resolved) return null;
    try {
        const asset = await view.load("bundle", resolved, Asset);
        if (asset) return asset;
    }
    catch { /* 有的 gif 会按二进制导入 */ }
    try {
        return await view.load("bundle", resolved, BufferAsset) || null;
    }
    catch {
        return null;
    }
}

function resolveGifPath(bundle: ReturnType<typeof assetManager.getBundle>, path: string): string | null {
    if (!bundle) return null;
    if (bundle.getInfoWithPath(path)) return path;
    const infos = bundle.getDirWithPath("game/equip_win_gif") || [];
    const base = path.split("/").pop() || "";
    const hit = infos.find(info => {
        const name = (info.path || "").split("/").pop() || "";
        return name === base || name.startsWith(base);
    });
    return hit?.path || null;
}
