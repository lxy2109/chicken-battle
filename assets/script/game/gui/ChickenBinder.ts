import { Color, EffectAsset, Graphics, Material, Vec4, Label, Node, Rect, Sprite, SpriteFrame, Texture2D, UITransform, tween, v3 } from "cc";
import { GameComponent } from "db://oops-framework/module/common/GameComponent";
import { FACE_TEXT, Appearance, PartId } from "../core/Types";
import { PART_NODE, TEX, showcaseSuit, itemById } from "../core/Catalog";
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
    const suit = showcaseSuit(appearance);
    const illustration = appearance.illustration ? `chicken/${appearance.illustration}` : suit ? `equip/set_${suit.id}` : undefined;
    if (illustration) {
        for (const child of node.children) child.active = false;
        const art = new Node("Illustration");
        art.layer = node.layer;
        art.parent = node;
        const transform = art.addComponent(UITransform);
        const sprite = art.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        await view.setSprite(sprite, `game/texture/${illustration}/spriteFrame`);
        if (!art.isValid || !sprite.spriteFrame) return node.isValid ? node : null;
        const rect = sprite.spriteFrame.rect;
        const ratio = Math.min(300 / rect.width, 460 / rect.height);
        transform.setContentSize(rect.width * ratio, rect.height * ratio);
        // Original Figma chickens face left; the actor's default faces right.
        art.setScale(-1, 1, 1);
        return node;
    }
    if (flip) {
        const face = node.getChildByName("Face");
        if (face) face.setScale(-1, 1, 1);
    }
    paintChicken(node, appearance);
    const effect = await view.load("bundle", "game/feather-gradient", EffectAsset);
    if (!node.isValid) return null;
    if (effect) shadeFeathers(node, appearance, effect);
    const eyes = node.getChildByName("Head")?.getChildByName("Face")?.getComponent(Sprite);
    if (eyes) await view.setSprite(eyes, `game/texture/chicken/figma_face_${appearance.face}/spriteFrame`);
    await dressChicken(view, node, appearance);
    if (!node.isValid) return null;
    return node;
}

// Figma rig local coordinates: the head sprite includes transparent space to its right.
// [attachment, x, y, maximum width, maximum height]; dimensions preserve the item's aspect ratio.
const EQUIPMENT_POSE: Record<string, [string, number, number, number, number]> = {
    rookie_head: ["Head", -53, 53, 98, 105],
    brawler_head: ["Head", -51, 51, 110, 98],
    medic_head: ["Head", -54, 48, 103, 79],
    // Align the helmet opening with the eyes, not the top of the comb.
    helicopter_head: ["Head", -44, 18, 130, 128],
    miser_head: ["Head", -51, 52, 106, 84],
    rookie_neck: ["Body", 9, 0, 142, 174],
    brawler_neck: ["Body", 12, 7, 146, 170],
    medic_neck: ["Body", 12, 0, 144, 170],
    helicopter_neck: ["Body", 10, 0, 144, 170],
    miser_neck: ["Body", 12, 0, 145, 168],
    rookie_wing: ["Wing", -103, 7, 94, 108],
    brawler_wing: ["Wing", -110, 25, 92, 225],
    medic_wing: ["Wing", -96, -7, 55, 88],
    helicopter_wing: ["Head", -53, 116, 154, 72],
    miser_wing: ["Wing", -100, -4, 104, 69],
    rookie_leg: ["Body", -22, -30, 35, 77],
    brawler_leg: ["Head", -54, -56, 55, 121],
    medic_leg: ["Body", 63, -40, 68, 78],
    helicopter_leg: ["Wing", -99, -9, 78, 78],
    miser_leg: ["Body", 62, -39, 64, 72],
};

/** 装备挂在对应部位下，随强化缩放和战斗动作一起运动。 */
async function dressChicken(view: GameComponent, root: Node, appearance: Appearance) {
    for (const slot of Object.keys(appearance.equipment || {}) as Array<PartId | "face">) {
        const itemId = appearance.equipment![slot]!;
        const pose = EQUIPMENT_POSE[itemId];
        const parents = pose ? [pose[0]] : slot === "leg" ? ["LegL", "LegR"] : [slot === "face" ? "Head" : PART_NODE[slot]];
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
            if (slot === "leg" && !pose) {
                // 现有脚部图是一双鞋，分别显示左右半张，避免每条腿上出现两只鞋。
                const texture = await view.load("bundle", `game/texture/equip/${itemById(itemId).icon || itemId}/texture`, Texture2D);
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
            const width = pose ? pose[3] : slot === "comb" ? 60 : slot === "face" ? 85 : slot === "leg" ? 52 : slot === "head" ? 100 : slot === "body" ? 142 : base.width;
            const height = pose ? pose[4] : slot === "comb" ? 50 : slot === "face" ? 75 : slot === "leg" ? 65 : slot === "head" ? 90 : slot === "body" ? 170 : base.height;
            const ratio = Math.min(width / frame.rect.width, height / frame.rect.height);
            transform.setContentSize(frame.rect.width * ratio, frame.rect.height * ratio);
            equipment.setPosition(pose ? pose[1] : slot === "head" || slot === "face" ? -53 : 0,
                pose ? pose[2] : slot === "head" ? 53 : slot === "face" ? -8 : slot === "leg" ? -12 : 0, 0);
            // Keep facial features visible above headwear; attachments must not cover the eyes.
            if (parent.name === "Head") parent.getChildByName("Face")?.setSiblingIndex(parent.children.length - 1);
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

/** 相邻部位使用相同的边缘色，保留中部原色与独立墨线。 */
function shadeFeathers(root: Node, appearance: Appearance, effect: EffectAsset) {
    const color = (id: PartId) => Color.fromHEX(new Color(), appearance.colors[id]);
    const edge = (a: PartId, b: PartId) => Color.lerp(new Color(), color(a), color(b), 0.5);
    const parts: Array<[string, PartId, Color, Color]> = [
        ["Head", "head", color("head"), edge("head", "neck")],
        ["Neck", "neck", edge("head", "neck"), edge("neck", "body")],
        ["Body", "body", edge("neck", "body"), edge("body", "leg")],
        ["LegL", "leg", edge("body", "leg"), color("leg")],
        ["LegR", "leg", edge("body", "leg"), color("leg")],
        ["Wing", "wing", edge("body", "wing"), color("wing")],
    ];
    for (const [name, id, top, bottom] of parts) {
        const sprite = root.getChildByName(name)?.getComponent(Sprite);
        if (!sprite) continue;
        const material = new Material();
        material.initialize({ effectAsset: effect, defines: { USE_TEXTURE: true } });
        const uniform = (c: Color) => new Vec4(c.r / 255, c.g / 255, c.b / 255, 1);
        material.setProperty("topTint", uniform(top));
        material.setProperty("middleTint", uniform(color(id)));
        material.setProperty("bottomTint", uniform(bottom));
        sprite.color = Color.WHITE;
        sprite.customMaterial = material;
        sprite.node.once(Node.EventType.NODE_DESTROYED, () => material.destroy());
    }
}

/** 结算双翅从肩部展开，保持展翅姿态并缓慢扇动。 */
export function celebrateChicken(root: Node | null, appearance: Appearance) {
    if (!root) return;
    // The resting wing also covers a cutout in the body texture; retain it as the shoulder base.
    for (const side of [-1, 1]) {
        const wing = new Node(side < 0 ? "VictoryWingL" : "VictoryWingR");
        wing.layer = root.layer;
        wing.parent = root;
        wing.setSiblingIndex(1);
        wing.setPosition(side * 38, -35);
        wing.setScale(side, 1, 1);
        const g = wing.addComponent(Graphics);
        g.lineWidth = 3;
        g.strokeColor = new Color(48, 36, 27);
        const base = Color.fromHEX(new Color(), appearance.colors.wing);
        // Overlapping tapered feathers form a broad fan rather than rotating the cropped resting wing.
        for (let i = 6; i >= 0; i--) {
            const angle = (-25 + i * 13) * Math.PI / 180;
            const length = 122 + Math.sin(i / 6 * Math.PI) * 40;
            const x = Math.cos(angle) * length;
            const y = Math.sin(angle) * length;
            const nx = -Math.sin(angle) * 14, ny = Math.cos(angle) * 14;
            g.fillColor = Color.lerp(new Color(), base, Color.WHITE, 0.08 + i * 0.035);
            g.moveTo(0, 0);
            g.bezierCurveTo(x * 0.45 + nx, y * 0.45 + ny, x + nx, y + ny, x, y);
            g.bezierCurveTo(x - nx, y - ny, x * 0.45 - nx, y * 0.45 - ny, 0, 0);
            g.close(); g.fill(); g.stroke();
        }
        wing.angle = -side * 55;
        tween(wing).to(0.55, { angle: side * 8 }, { easing: "backOut" })
            .repeatForever(tween().to(0.85, { angle: side * 16 }).to(0.85, { angle: side * 8 })).start();
    }
}
