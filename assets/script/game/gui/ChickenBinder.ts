import { Label, Node, tween, v3 } from "cc";
import { GameComponent } from "db://oops-framework/module/common/GameComponent";
import { FACE_TEXT, Appearance, PartId } from "../core/Types";
import { PART_NODE } from "../core/Catalog";
import { setSpriteColor } from "./UiUtil";

export async function spawnChicken(view: GameComponent, slotName: string, appearance: Appearance, scale = 1, flip = false): Promise<Node | null> {
    const slot = view.getNode(slotName);
    if (!slot) return null;
    slot.removeAllChildren();
    let node: Node | null = null;
    try {
        node = await view.createPrefabNode("game/prefab/chicken");
    }
    catch {
        return null;
    }
    if (!node) return null;
    node.parent = slot;
    node.setPosition(0, 0, 0);
    node.setScale(flip ? -Math.abs(scale) : scale, scale, 1);
    if (flip) {
        const face = node.getChildByName("Face");
        if (face) face.setScale(-1, 1, 1);
    }
    paintChicken(node, appearance);
    return node;
}

export function paintChicken(root: Node, appearance: Appearance) {
    for (const part in PART_NODE) {
        const name = PART_NODE[part as PartId];
        const node = root.getChildByName(name);
        if (node) setSpriteColor(node, appearance.colors[part as PartId]);
        if (part === "leg") {
            const r = root.getChildByName("LegR");
            if (r) setSpriteColor(r, appearance.colors.leg);
        }
        if (part === "body") {
            const neck = root.getChildByName("Neck");
            if (neck) setSpriteColor(neck, appearance.colors.body);
        }
    }
    const face = root.getChildByName("Face");
    if (face) {
        const lab = face.getComponent(Label);
        if (lab) lab.string = FACE_TEXT[appearance.face];
    }
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
