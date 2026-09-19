import { BlockInputEvents, Node, Tween, UIOpacity, UITransform, Widget, tween, v3 } from "cc";

/** 全屏界面切入方向：旧界面朝该方向滑出，新界面从对侧滑入。 */
export type SlideDir = "left" | "right" | "up" | "down";

const DURATION = 0.48;

function slideDelta(node: Node, dir: SlideDir) {
    const box = node.getComponent(UITransform);
    const w = Math.max(720, box?.width ?? 720) * Math.abs(node.scale.x || 1);
    const h = Math.max(1280, box?.height ?? 1280) * Math.abs(node.scale.y || 1);
    switch (dir) {
        case "left": return v3(-w, 0, 0);
        case "right": return v3(w, 0, 0);
        case "up": return v3(0, h, 0);
        case "down": return v3(0, -h, 0);
    }
}

function tweenMove(node: Node, to: { x: number; y: number; z: number }, duration: number) {
    return new Promise<void>(resolve => {
        Tween.stopAllByTarget(node);
        tween(node)
            .to(duration, { position: v3(to.x, to.y, to.z) }, { easing: "cubicInOut" })
            .call(() => resolve())
            .start();
    });
}

function ensureBlock(node: Node) {
    if (node.isValid && !node.getComponent(BlockInputEvents)) {
        node.addComponent(BlockInputEvents);
    }
}

function ensureOpacity(node: Node) {
    return node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
}

/** 全屏 Widget 会每帧把节点拽回贴边，滑动前必须关掉。 */
function freezeWidget(node: Node): () => void {
    const widget = node.getComponent(Widget);
    if (!widget || !widget.enabled) return () => undefined;
    widget.enabled = false;
    return () => {
        if (!node.isValid) return;
        const w = node.getComponent(Widget);
        if (!w) return;
        w.enabled = true;
        w.updateAlignment();
    };
}

function preparePair(oldNode: Node, newNode: Node) {
    ensureBlock(oldNode);
    ensureBlock(newNode);
    const thawOld = freezeWidget(oldNode);
    const thawNew = freezeWidget(newNode);
    newNode.setSiblingIndex(newNode.parent ? newNode.parent.children.length - 1 : 0);
    return () => {
        thawOld();
        thawNew();
    };
}

/**
 * 两界面左右/上下对切。旧界面朝 dir 滑出，新界面从对侧滑入到旧界面原位。
 * 调用方负责在结束后销毁旧界面。
 */
export async function playSlideCut(oldNode: Node, newNode: Node, dir: SlideDir, duration = DURATION) {
    if (!oldNode?.isValid || !newNode?.isValid) return;
    const home = oldNode.position.clone();
    const out = slideDelta(oldNode, dir);
    const thaw = preparePair(oldNode, newNode);
    try {
        newNode.setPosition(home.x - out.x, home.y - out.y, home.z);
        await Promise.all([
            tweenMove(oldNode, { x: home.x + out.x, y: home.y + out.y, z: home.z }, duration),
            tweenMove(newNode, { x: home.x, y: home.y, z: home.z }, duration)
        ]);
    } finally {
        thaw();
    }
}

/**
 * 对战 → 结算：战场略压暗缩小，结算页由大到正位砸入（结果牌感）。
 */
export async function playBattleToResult(oldNode: Node, newNode: Node) {
    if (!oldNode?.isValid || !newNode?.isValid) return;
    const home = oldNode.position.clone();
    const oldScale = oldNode.scale.clone();
    const newScale = newNode.scale.clone();
    const thaw = preparePair(oldNode, newNode);
    const oldFade = ensureOpacity(oldNode);
    const newFade = ensureOpacity(newNode);
    Tween.stopAllByTarget(oldNode);
    Tween.stopAllByTarget(newNode);
    Tween.stopAllByTarget(oldFade);
    Tween.stopAllByTarget(newFade);
    newNode.setPosition(home);
    newNode.setScale(newScale.x * 1.18, newScale.y * 1.18, newScale.z);
    newFade.opacity = 0;
    try {
        await Promise.all([
            new Promise<void>(resolve => {
                tween(oldNode)
                    .to(0.36, { scale: v3(oldScale.x * 0.92, oldScale.y * 0.92, oldScale.z) }, { easing: "quadIn" })
                    .call(() => resolve())
                    .start();
                tween(oldFade).to(0.36, { opacity: 0 }, { easing: "quadIn" }).start();
            }),
            new Promise<void>(resolve => {
                tween(newFade).to(0.22, { opacity: 255 }, { easing: "quadOut" }).start();
                tween(newNode)
                    .to(0.34, { scale: v3(newScale.x * 0.97, newScale.y * 0.97, newScale.z) }, { easing: "quadOut" })
                    .to(0.12, { scale: newScale }, { easing: "backOut" })
                    .call(() => resolve())
                    .start();
            })
        ]);
    } finally {
        if (newNode.isValid) {
            newNode.setScale(newScale);
            ensureOpacity(newNode).opacity = 255;
        }
        thaw();
    }
}

/**
 * 结算 → 地图：结算下沉淡出，地图自下托起落位（收束回行程）。
 */
export async function playResultToMap(oldNode: Node, newNode: Node) {
    if (!oldNode?.isValid || !newNode?.isValid) return;
    const home = oldNode.position.clone();
    const lift = Math.max(160, (oldNode.getComponent(UITransform)?.height ?? 1280) * 0.12);
    const thaw = preparePair(oldNode, newNode);
    const oldFade = ensureOpacity(oldNode);
    const newFade = ensureOpacity(newNode);
    Tween.stopAllByTarget(oldNode);
    Tween.stopAllByTarget(newNode);
    Tween.stopAllByTarget(oldFade);
    Tween.stopAllByTarget(newFade);
    newNode.setPosition(home.x, home.y - lift, home.z);
    newFade.opacity = 0;
    try {
        await Promise.all([
            new Promise<void>(resolve => {
                tween(oldNode)
                    .to(0.42, { position: v3(home.x, home.y - lift * 0.55, home.z) }, { easing: "cubicIn" })
                    .call(() => resolve())
                    .start();
                tween(oldFade).to(0.36, { opacity: 0 }, { easing: "quadIn" }).start();
            }),
            new Promise<void>(resolve => {
                tween(newFade).delay(0.06).to(0.34, { opacity: 255 }, { easing: "quadOut" }).start();
                tween(newNode)
                    .delay(0.04)
                    .to(0.44, { position: home }, { easing: "cubicOut" })
                    .call(() => resolve())
                    .start();
            })
        ]);
    } finally {
        if (newNode.isValid) {
            newNode.setPosition(home);
            ensureOpacity(newNode).opacity = 255;
        }
        thaw();
    }
}

/** 按来源/目标挑选切屏动画；无特殊对时走默认左右滑。 */
export async function playScreenTransition(
    oldNode: Node,
    newNode: Node,
    from?: string,
    to?: string
) {
    if (from === "battle" && to === "result") {
        await playBattleToResult(oldNode, newNode);
        return;
    }
    if (from === "result" && to === "map") {
        await playResultToMap(oldNode, newNode);
        return;
    }
    await playSlideCut(oldNode, newNode, screenSlideDir(from, to));
}

/** 前进到下一张地图：统一向左切（新图从右侧进入）。 */
export function mapTravelDir(_fromMapId?: number): SlideDir {
    return "left";
}

/** 局内界面切换默认方向（可按来源-目标微调）。 */
export function screenSlideDir(from?: string, to?: string): SlideDir {
    if (from === "map" && (to === "shop" || to === "character")) return "up";
    if ((from === "shop" || from === "character") && to === "map") return "down";
    if (from === "map" && (to === "prebattle" || to === "battle")) return "left";
    if ((from === "prebattle" || from === "reward") && to === "map") return "right";
    if (from === "prebattle" && to === "battle") return "left";
    if (from === "result" && to === "reward") return "up";
    if (from === "reward" && (to === "shop" || to === "map")) return "down";
    return "left";
}
