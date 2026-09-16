import { Asset, BufferAsset, Node, Sprite, UITransform, assetManager } from "cc";
import { GameComponent } from "db://oops-framework/module/common/GameComponent";
import GifFrameAni from "../../gif/GifFrameAni";
import { readGifBytes, watchGif } from "../../gif/GifDecoder";
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
    const path = TEX.suitGif(suit.id);
    const ok = await Promise.race([
        playSlotGif(view, slotName, path).catch(() => false),
        new Promise<boolean>(resolve => setTimeout(() => resolve(false), 2000))
    ]);
    if (!ok) console.warn("[SuitGif] 套装 GIF 播放失败", suit.id);
    return ok;
}

/** 在指定 slot 内创建并播放 GIF，按原比例放入 slot，不拉伸。 */
export async function playSlotGif(view: GameComponent, slotName: string, path: string): Promise<boolean> {
    const slot = view.getNode(slotName);
    if (!slot) return false;
    const asset = await loadGifAsset(view, path);
    if (!asset) return false;
    if (!slot.isValid) return false;
    const ani = mountSlotGif(slot);
    const box = slot.getComponent(UITransform);
    const ok = await ani.play(asset, box?.width || 360, box?.height || 490, path);
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

/** 战斗结算演出时就开始解当前套装 GIF，进结果页时尽量只等首帧。 */
export function preloadResultSuitGif(view: GameComponent, appearance: Appearance) {
    const suit = suitForWinGif(appearance);
    if (!suit) return;
    const path = TEX.suitGif(suit.id);
    void loadGifAsset(view, path).then(async asset => {
        if (!asset) return;
        const bytes = await readGifBytes(asset);
        if (bytes) watchGif(path, bytes, () => { /* 只要把解码跑起来 */ });
    }).catch(err => console.warn("[SuitGif] 预加载失败", path, err));
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
    if (slotTransform) transform.setAnchorPoint(slotTransform.anchorPoint);
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.RAW;
    sprite.type = Sprite.Type.SIMPLE;
    sprite.trim = false;
    return node.addComponent(GifFrameAni);
}

function fitGifToSlot(node: Node, slot: Node) {
    const slotTransform = slot.getComponent(UITransform);
    const frame = node.getComponent(Sprite)?.spriteFrame;
    if (!slotTransform || !frame) return;
    const width = Math.max(frame.rect.width, 1);
    const height = Math.max(frame.rect.height, 1);
    const scale = Math.min(slotTransform.width / width, slotTransform.height / height);
    node.setScale(scale, scale, 1);
}

async function loadGifAsset(view: GameComponent, path: string): Promise<Asset | null> {
    for (const candidate of gifPathCandidates(path)) {
        const asset = await view.load("bundle", candidate, Asset);
        if (asset) return asset;
        const buffer = await view.load("bundle", candidate, BufferAsset);
        if (buffer) return buffer;
    }
    const bundle = assetManager.getBundle("bundle");
    const infos = bundle?.getDirWithPath("game/equip_win_gif") || [];
    const base = path.split("/").pop() || "";
    const hit = infos.find(info => {
        const name = (info.path || "").split("/").pop() || "";
        return name === base || name.startsWith(base) || name.startsWith(`${base}.`);
    });
    if (hit?.path) {
        const asset = await view.load("bundle", hit.path, Asset);
        if (asset) return asset;
        const buffer = await view.load("bundle", hit.path, BufferAsset);
        if (buffer) return buffer;
    }
    console.warn("[SuitGif] 找不到资源", path);
    return null;
}

function gifPathCandidates(path: string): string[] {
    const withExt = path.endsWith(".gif") ? path : `${path}.gif`;
    const noExt = withExt.slice(0, -4);
    return [withExt, noExt];
}
