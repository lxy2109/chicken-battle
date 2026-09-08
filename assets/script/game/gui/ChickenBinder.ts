import { Label, Node, Rect, Sprite, SpriteFrame, Texture2D, UITransform, tween, v3 } from "cc";
import { GameComponent } from "db://oops-framework/module/common/GameComponent";
import { FACE_TEXT, Appearance, PartId } from "../core/Types";
import { PART_NODE, TEX } from "../core/Catalog";
import { setSpriteColor } from "./UiUtil";

export async function spawnChicken(view: GameComponent, slotName: string, appearance: Appearance, scale = 1, flip = false): Promise<Node | null> {
    const slot = view.getNode(slotName);
    if (!slot) return null;
    for (const child of slot.children) child.destroy();
    slot.removeAllChildren();
    let node: Node | null = null;
    try {
        node = await view.createPrefabNode("game/prefab/chicken");
    }
    catch {
        return null;
    }
    if (!node) return null;
    if (!slot.isValid) { node.destroy(); return null; }
    node.parent = slot;
    node.setPosition(0, 0, 0);
    node.setScale(flip ? -Math.abs(scale) : scale, scale, 1);
    if (flip) {
        const face = node.getChildByName("Face");
        if (face) face.setScale(-1, 1, 1);
    }
    paintChicken(node, appearance);
    await dressChicken(view, node, appearance);
    if (!node.isValid) return null;
    return node;
}

/** 装备挂在对应部位下，随强化缩放和战斗动作一起运动。 */
async function dressChicken(view: GameComponent, root: Node, appearance: Appearance) {
    for (const slot of Object.keys(appearance.equipment || {}) as Array<PartId | "face">) {
        const itemId = appearance.equipment![slot]!;
        const parents = slot === "leg" ? ["LegL", "LegR"] : [slot === "face" ? "Head" : PART_NODE[slot]];
        for (let i = 0; i < parents.length; i++) {
            if (!root.isValid) return;
            const parent = root.getChildByName(parents[i]);
            if (!parent) continue;
            const equipment = new Node("Equipment");
            equipment.layer = parent.layer;
            equipment.parent = parent;
            const transform = equipment.addComponent(UITransform);
            const sprite = equipment.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            if (slot === "leg") {
                // 现有脚部图是一双鞋，分别显示左右半张，避免每条腿上出现两只鞋。
                const texture = await view.load("bundle", `game/texture/equip/${itemId}/texture`, Texture2D);
                if (!texture || !equipment.isValid) return;
                const frame = new SpriteFrame();
                frame.reset({ texture, rect: new Rect(i * texture.width / 2, 0, texture.width / 2, texture.height) });
                frame.packable = false;
                sprite.spriteFrame = frame;
                equipment.once(Node.EventType.NODE_DESTROYED, () => frame.destroy());
                equipment.setScale(i === 1 ? -1 : 1, 1, 1);
            }
            else {
                await view.setSprite(sprite, TEX.equip(itemId));
            }
            if (!equipment.isValid) return;
            const base = parent.getComponent(UITransform)!;
            const frame = sprite.spriteFrame;
            if (!frame) continue;
            const width = slot === "comb" ? 82 : slot === "face" ? 108 : slot === "leg" ? 52 : base.width * 1.12;
            const height = slot === "comb" ? 76 : slot === "face" ? 94 : slot === "leg" ? 86 : base.height * 1.12;
            const ratio = Math.min(width / frame.rect.width, height / frame.rect.height);
            transform.setContentSize(frame.rect.width * ratio, frame.rect.height * ratio);
            equipment.setPosition(0, slot === "face" ? 48 : slot === "leg" ? -12 : 0, 0);
        }
    }
}

/**
 * 给刚建出来的鸡上色，并按强化等级把练过的部位撑大。
 *
 * 只能对新节点调一次：撑大是在预制体原有缩放上乘出来的，同一个节点调两次就会越乘越大。
 */
function paintChicken(root: Node, appearance: Appearance) {
    const scale = appearance.partScale || {};
    for (const part in PART_NODE) {
        const id = part as PartId;
        const node = root.getChildByName(PART_NODE[id]);
        if (node) {
            setSpriteColor(node, appearance.colors[id]);
            sizePart(node, scale[id]);
        }
        // 两条腿是分开的节点，配色和体型都得跟着腿走。
        if (id === "leg") {
            const r = root.getChildByName("LegR");
            if (r) {
                setSpriteColor(r, appearance.colors.leg);
                sizePart(r, scale.leg);
            }
        }
    }
    const face = root.getChildByName("Face");
    if (face) {
        const lab = face.getComponent(Label);
        if (lab) lab.string = FACE_TEXT[appearance.face];
    }
}

/**
 * 按强化等级把部位撑大。
 *
 * 预制体里部位本身的缩放不一定是 1（比如右腿是 -1 翻过来的），所以要乘上去而不是
 * 直接赋值，不然一强化就把原本的朝向和比例抹平了。
 *
 * 撑大之后还得把底边钉回原处。节点是绕自身中心放大的，不补这一下，腿会往下伸出
 * 影子外面像陷进地里，身子也会往下坠；钉住底边之后长大只往上和两侧扩，才像长壮了。
 */
function sizePart(node: Node, k?: number) {
    if (!k || k === 1) return;
    const s = node.scale;
    node.setScale(s.x * k, s.y * k, s.z);
    const h = node.getComponent(UITransform)?.height ?? 0;
    const p = node.position;
    node.setPosition(p.x, p.y + h * (k - 1) / 2, p.z);
}

export function punch(node: Node | null, dir: number) {
    if (!node) return;
    tween(node)
        .by(0.08, { position: v3(0, 22 * dir, 0) })
        .by(0.08, { position: v3(0, -22 * dir, 0) })
        .start();
}

export function bounce(node: Node | null) {
    if (!node) return;
    tween(node)
        .to(0.08, { scale: v3(1.15, 1.15, 1) })
        .to(0.08, { scale: v3(1, 1, 1) })
        .start();
}
