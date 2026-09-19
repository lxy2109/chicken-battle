import { Color, EffectAsset, Graphics, Material, Vec4, Label, Node, Rect, Sprite, SpriteFrame, Texture2D, UITransform, tween, v3 } from "cc";
import { GameComponent } from "db://oops-framework/module/common/GameComponent";
import { FACE_TEXT, Appearance, FaceId, PartId } from "../../domain/Types";
import { PART_NODE, TEX, showcaseSuit, itemById } from "../../domain/Catalog";
import { StrikeSheetPlayer } from "../../battle/StrikeSheetPlayer";
import { setSpriteColor } from "./UiUtil";

export async function spawnChicken(view: GameComponent, slotName: string, appearance: Appearance, scale = 1, flip = false): Promise<Node | null> {
    const slot = view.getNode(slotName);
    if (!slot) return null;
    for (const child of slot.children) child.destroy();
    slot.removeAllChildren();
    let node: Node | null = null;
    try {
        node = await view.createPrefabNode("game/prefab/actor/chicken");
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
    const illustration = appearance.illustration ? `actor/${appearance.illustration}` : suit ? `equip/set_${suit.id}` : undefined;
    if (illustration) {
        for (const child of node.children) child.active = false;
        const art = new Node("Illustration");
        art.layer = node.layer;
        art.parent = node;
        const transform = art.addComponent(UITransform);
        const sprite = art.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        await view.setSprite(sprite, `game/image/${illustration}/spriteFrame`);
        if (!art.isValid || !sprite.spriteFrame) return node.isValid ? node : null;
        const rect = sprite.spriteFrame.rect;
        const ratio = Math.min(300 / rect.width, 460 / rect.height);
        transform.setContentSize(rect.width * ratio, rect.height * ratio);
        // Original Figma chickens face left; the actor's default faces right.
        art.setScale(-1, 1, 1);
        const sheets = art.addComponent(StrikeSheetPlayer);
        sheets.sheetKey = appearance.illustration || (suit ? `set_${suit.id}` : "");
        void sheets.startIdle();
        return node;
    }
    if (flip) {
        const face = node.getChildByName("Face");
        if (face) face.setScale(-1, 1, 1);
    }
    paintChicken(node, appearance);
    const effect = await view.load("bundle", "game/effect/feather-gradient", EffectAsset);
    if (!node.isValid) return null;
    if (effect) shadeFeathers(node, appearance, effect);
    const head = node.getChildByName("Head");
    if (head) paintExpression(head, appearance.face);
    await dressChicken(view, node, appearance);
    if (!node.isValid) return null;
    const headNode = node.getChildByName("Head");
    if (headNode) {
        for (const name of ["EyeL", "EyeR"]) {
            const eye = headNode.getChildByName(name);
            if (eye) eye.setSiblingIndex(headNode.children.length - 1);
        }
    }
    return node;
}

// Figma rig local coordinates: the head sprite includes transparent space to its right.
// [attachment, x, y, maximum width, maximum height]; dimensions preserve the item's aspect ratio.
const EQUIPMENT_POSE: Record<string, [string, number, number, number, number]> = {
    rookie_head: ["Head", 0, 42, 90, 96],
    brawler_head: ["Head", 0, 40, 100, 90],
    medic_head: ["Head", 0, 38, 94, 72],
    // Align the helmet opening with the eyes, not the top of the comb.
    helicopter_head: ["Head", 0, 16, 118, 116],
    miser_head: ["Head", 0, 40, 96, 76],
    rookie_neck: ["Body", 0, 8, 130, 160],
    brawler_neck: ["Body", 0, 10, 134, 156],
    medic_neck: ["Body", 0, 8, 132, 156],
    helicopter_neck: ["Body", 0, 8, 132, 156],
    miser_neck: ["Body", 0, 8, 132, 154],
    rookie_wing: ["Wing", 0, 8, 80, 96],
    brawler_wing: ["Wing", 0, 18, 80, 160],
    medic_wing: ["Wing", 0, -4, 50, 80],
    helicopter_wing: ["Head", 0, 78, 140, 66],
    miser_wing: ["Wing", 0, 0, 90, 62],
    rookie_leg: ["Body", 8, -70, 32, 70],
    brawler_leg: ["Head", 0, -48, 50, 110],
    medic_leg: ["Body", 48, -70, 62, 70],
    helicopter_leg: ["Wing", 0, -6, 70, 70],
    miser_leg: ["Body", 48, -70, 58, 66],
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
                const texture = await view.load("bundle", `game/image/equip/${itemById(itemId).icon || itemId}/texture`, Texture2D);
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
            if (parent.name === "Head") {
                parent.getChildByName("EyeL")?.setSiblingIndex(parent.children.length - 1);
                parent.getChildByName("EyeR")?.setSiblingIndex(parent.children.length - 1);
            }
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
        if (node) setSpriteColor(node, appearance.colors[id]);
        if (id === "leg") {
            const r = root.getChildByName("LegR");
            if (r) setSpriteColor(r, appearance.colors.leg);
        }
        if (id === "wing") {
            const back = root.getChildByName("WingBack");
            if (back) setSpriteColor(back, appearance.colors.wing);
        }
    }
    growParts(root, scale);
    const face = root.getChildByName("Face");
    if (face) {
        const lab = face.getComponent(Label);
        if (lab) lab.string = FACE_TEXT[appearance.face];
    }
}

function partOf(root: Node, name: string) {
    return root.getChildByName(name);
}

function visualSize(node: Node) {
    const ui = node.getComponent(UITransform);
    return {
        w: (ui?.width ?? 0) * Math.abs(node.scale.x),
        h: (ui?.height ?? 0) * Math.abs(node.scale.y)
    };
}

/**
 * 绕关节撑大。ax/ay 是相对视觉中心的比例，-0.5 是底边，0.5 是顶边。
 * 预制体里部位缩放不一定是 1（右腿、翅膀是 -1 翻过来的），所以只能乘，不能赋值。
 */
function sizeAround(node: Node, k: number, ax: number, ay: number) {
    if (!k || k === 1) return;
    const { w, h } = visualSize(node);
    const p = node.position;
    const s = node.scale;
    node.setScale(s.x * k, s.y * k, s.z);
    node.setPosition(p.x + ax * w * (1 - k), p.y + ay * h * (1 - k), p.z);
}

/**
 * 从脚往上把强化后的部位重新叠好：脚钉在地上，髋、胸、颈窝对上，翅膀跟肩走。
 * 各自绕中心放大的话，脖子会从脑袋里穿出来，看起来像尸块。
 */
function growParts(root: Node, scale: Partial<Record<PartId, number>>) {
    const kOf = (id: PartId) => scale[id] || 1;
    const kLeg = kOf("leg");
    const kBody = kOf("body");
    const kNeck = kOf("neck");
    const kHead = kOf("head");
    const kWing = kOf("wing");
    if (kLeg === 1 && kBody === 1 && kNeck === 1 && kHead === 1 && kWing === 1) return;

    const legs = [partOf(root, "LegL"), partOf(root, "LegR")].filter((n): n is Node => !!n);
    const body = partOf(root, "Body");
    const neck = partOf(root, "Neck");
    const head = partOf(root, "Head");
    const wings = [partOf(root, "Wing"), partOf(root, "WingBack")].filter((n): n is Node => !!n);
    const restBody = body ? { x: body.position.x, y: body.position.y, h: visualSize(body).h } : { x: 0, y: 0, h: 0 };
    const restNeck = neck ? { y: neck.position.y, h: visualSize(neck).h } : { y: 0, h: 0 };
    const restHead = head ? { y: head.position.y, h: visualSize(head).h } : { y: 0, h: 0 };
    const restWings = wings.map(n => ({ n, x: n.position.x, y: n.position.y }));
    const restComb = partOf(root, "Comb")?.position.clone();
    const restTail = partOf(root, "Tail")?.position.clone();
    const restLegH = legs[0] ? visualSize(legs[0]).h : 0;

    for (const n of legs) sizeAround(n, kLeg, 0, -0.5);
    const hipRise = restLegH * (kLeg - 1);
    const chestRise = restBody.h * (kBody - 1);
    const napeRise = restNeck.h * (kNeck - 1);

    if (body) {
        sizeAround(body, kBody, 0, -0.5);
        body.setPosition(body.position.x, body.position.y + hipRise, 0);
    }
    if (neck) {
        sizeAround(neck, kNeck, 0, -0.5);
        neck.setPosition(neck.position.x, neck.position.y + hipRise + chestRise, 0);
    }
    if (head) {
        sizeAround(head, kHead, 0, -0.5);
        head.setPosition(head.position.x, head.position.y + hipRise + chestRise + napeRise, 0);
    }

    const bodyNow = body ? body.position : v3(restBody.x, restBody.y + hipRise);
    for (const rest of restWings) {
        rest.n.setPosition(
            bodyNow.x + (rest.x - restBody.x) * kBody,
            bodyNow.y + (rest.y - restBody.y) * kBody,
            0
        );
        sizeAround(rest.n, kWing, rest.x >= 0 ? -0.32 : 0.32, 0.38);
    }

    const comb = partOf(root, "Comb");
    if (comb && restComb) {
        comb.setPosition(restComb.x, restComb.y + hipRise + chestRise + napeRise + restHead.h * (kHead - 1), 0);
    }
    const tail = partOf(root, "Tail");
    if (tail && restTail) {
        tail.setPosition(
            bodyNow.x + (restTail.x - restBody.x) * kBody,
            bodyNow.y + (restTail.y - restBody.y) * kBody,
            0
        );
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

const FACE_INK = new Color(42, 30, 24, 255);
const FACE_PUPIL = new Color(28, 20, 16, 255);
const FACE_WHITE = new Color(255, 252, 248, 255);

function paintExpression(head: Node, faceId: FaceId) {
    const face = head.getChildByName("Face");
    if (face) face.active = false;
    const old = head.getChildByName("Expression");
    if (old) old.active = false;
    const left = head.getChildByName("EyeL");
    const right = head.getChildByName("EyeR");
    if (!left || !right) return;
    paintEyeInner(left, faceId, "L");
    paintEyeInner(right, faceId, "R");
}

/** Look 画布锚在眼睛左下角，中心是 (w/2, h/2)，跟着预制体里对齐好的 Eye 节点走。 */
function eyeGraphics(eye: Node): { g: Graphics; cx: number; cy: number; r: number } {
    const box = eye.getComponent(UITransform)!;
    const w = box.width;
    const h = box.height;
    let look = eye.getChildByName("Look");
    if (!look) {
        look = new Node("Look");
        look.layer = eye.layer;
        look.parent = eye;
        const ui = look.addComponent(UITransform);
        ui.setContentSize(w, h);
        ui.setAnchorPoint(0, 0);
        look.addComponent(Graphics);
    }
    look.getComponent(UITransform)!.setContentSize(w, h);
    look.getComponent(UITransform)!.setAnchorPoint(0, 0);
    look.setPosition(-w / 2, -h / 2, 0);
    look.setSiblingIndex(eye.children.length - 1);
    const g = look.getComponent(Graphics)!;
    g.clear();
    return { g, cx: w / 2, cy: h / 2, r: Math.min(w, h) * 0.38 };
}

function paintEyeInner(eye: Node, faceId: FaceId, side: "L" | "R") {
    const sprite = eye.getComponent(Sprite);
    if (sprite) sprite.enabled = true;
    const { g, cx, cy, r } = eyeGraphics(eye);
    const inner = side === "L" ? 1 : -1;
    // 白眼圈始终用预制体。只画图标里那块深色：瞳孔 / 横线 / 尖括号。
    if (faceId === "wink" && side === "R") {
        g.strokeColor = FACE_PUPIL;
        g.lineWidth = Math.max(3, r * 0.42);
        g.lineCap = Graphics.LineCap.ROUND;
        g.lineJoin = Graphics.LineJoin.ROUND;
        g.moveTo(cx - r * 0.25, cy + r * 0.48);
        g.lineTo(cx + r * 0.42, cy);
        g.lineTo(cx - r * 0.25, cy - r * 0.48);
        g.stroke();
        return;
    }
    if (faceId === "proud") {
        fillOval(g, cx, cy, r * 0.58, r * 0.14);
        return;
    }
    if (faceId === "dumb") {
        fillOval(g, cx + r * 0.12, cy, r * 0.34, r * 0.38);
        return;
    }
    if (faceId === "cute") {
        // 图标：横着的 C，开口朝下。
        g.strokeColor = FACE_PUPIL;
        g.lineWidth = Math.max(2.8, r * 0.42);
        g.lineCap = Graphics.LineCap.ROUND;
        const w = r * 0.52;
        const h = r * 0.48;
        g.moveTo(cx - w, cy - h * 0.15);
        g.bezierCurveTo(cx - w, cy + h, cx + w, cy + h, cx + w, cy - h * 0.15);
        g.stroke();
        return;
    }
    if (faceId === "sad") {
        fillOval(g, cx + r * 0.04, cy - r * 0.16, r * 0.32, r * 0.38);
        drawBrow(g, cx, cy + r + 5, r, inner, -1);
        return;
    }
    fillOval(g, cx + r * 0.08, cy - r * 0.04, r * 0.30, r * 0.36);
    drawBrow(g, cx, cy + r + 5, r, inner, 1);
}

function fillOval(g: Graphics, x: number, y: number, rx: number, ry: number) {
    g.fillColor = FACE_PUPIL;
    g.moveTo(x + rx, y);
    g.bezierCurveTo(x + rx, y + ry * 0.55, x + rx * 0.55, y + ry, x, y + ry);
    g.bezierCurveTo(x - rx * 0.55, y + ry, x - rx, y + ry * 0.55, x - rx, y);
    g.bezierCurveTo(x - rx, y - ry * 0.55, x - rx * 0.55, y - ry, x, y - ry);
    g.bezierCurveTo(x + rx * 0.55, y - ry, x + rx, y - ry * 0.55, x + rx, y);
    g.close();
    g.fill();
}

function drawBrow(g: Graphics, x: number, y: number, r: number, inner: number, tilt: number) {
    g.strokeColor = FACE_INK;
    g.lineWidth = Math.max(7, r * 0.72);
    g.lineCap = Graphics.LineCap.ROUND;
    g.moveTo(x - r * 1.15 * inner, y + 5 * tilt);
    g.lineTo(x + r * 1.15 * inner, y - 6 * tilt);
    g.stroke();
}

/** 纯黑乘到贴图上会糊成剪影，染色保底后再交给 shader 做正片叠底。 */
function liftDark(c: Color) {
    const luma = (c.r * 0.299 + c.g * 0.587 + c.b * 0.114) / 255;
    if (luma >= 0.2) return c;
    const t = 0.2 / Math.max(luma, 0.001);
    return new Color(Math.min(255, c.r * t), Math.min(255, c.g * t), Math.min(255, c.b * t), c.a);
}

/** 相邻部位使用相同的边缘色，保留中部原色与独立墨线。 */
function shadeFeathers(root: Node, appearance: Appearance, effect: EffectAsset) {
    const color = (id: PartId) => liftDark(Color.fromHEX(new Color(), appearance.colors[id]));
    const edge = (a: PartId, b: PartId) => Color.lerp(new Color(), color(a), color(b), 0.5);
    const parts: Array<[string, PartId, Color, Color]> = [
        ["Head", "head", color("head"), edge("head", "neck")],
        ["Neck", "neck", edge("head", "neck"), edge("neck", "body")],
        ["Body", "body", edge("neck", "body"), edge("body", "leg")],
        ["LegL", "leg", edge("body", "leg"), color("leg")],
        ["LegR", "leg", edge("body", "leg"), color("leg")],
        ["Wing", "wing", edge("body", "wing"), color("wing")],
        ["WingBack", "wing", edge("body", "wing"), color("wing")],
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

/** 结算时用真翅膀小幅扇动，并轻轻跳两下，不再另画一对外飞的假翅。 */
export function celebrateChicken(root: Node | null, _appearance?: Appearance) {
    if (!root) return;
    const restOf = (n: Node) => n.angle;
    for (const name of ["Wing", "WingBack"]) {
        const wing = root.getChildByName(name);
        if (!wing) continue;
        const rest = restOf(wing);
        tween(wing).stop();
        tween(wing)
            .repeatForever(tween().to(0.16, { angle: rest + 18 }).to(0.16, { angle: rest - 10 }))
            .start();
    }
    const base = root.scale.clone();
    tween(root)
        .repeatForever(
            tween()
                .to(0.14, { scale: v3(base.x * 1.08, base.y * 1.12, 1) })
                .to(0.18, { scale: base }, { easing: "backOut" })
                .delay(0.2)
        )
        .start();
}

/** 失败结算：翅膀耷拉，身子微微蹲下去，和胜利的弹跳反过来。 */
export function mournChicken(root: Node | null) {
    if (!root) return;
    for (const name of ["Wing", "WingBack"]) {
        const wing = root.getChildByName(name);
        if (!wing) continue;
        const rest = wing.angle;
        tween(wing).stop();
        tween(wing).to(0.4, { angle: rest - 16 }, { easing: "quadOut" }).start();
    }
    const base = root.scale.clone();
    tween(root)
        .to(0.35, { scale: v3(base.x * 1.03, base.y * 0.9, 1) }, { easing: "quadOut" })
        .start();
}
