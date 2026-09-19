import { instantiate, isValid, Label, Node, Tween, tween, UIOpacity, UITransform, v3 } from "cc";
import { oops } from "db://oops-framework/core/Oops";
import { ViewUtil } from "db://oops-framework/core/utils/ViewUtil";
import { PREFAB_PATH, setById } from "../../domain/Catalog";
import { gameTextOr } from "../../domain/GameConfig";

/** 同时最多几条 tips，超出回收最早的。 */
const MAX_VISIBLE = 3;
/** 池里预留条数（含在飞 + 空闲），避免尖峰再 instantiate。 */
const POOL_SIZE = MAX_VISIBLE + 1;
/** 多条 tips 错开弹出间隔。 */
const STAGGER_MS = 420;
/** 单条停留时间（秒）。 */
const HOLD_SEC = 1.55;
/** 屏幕上方基准 y（设计分辨率坐标，约 1080×1920）。 */
const BASE_Y = 420;
const STACK_GAP = 88;

let host: Node | null = null;
let itemTemplate: Node | null = null;
let ready: Promise<boolean> | null = null;
let queue: Promise<void> = Promise.resolve();

/** 空闲节点；活着的挂在 host.children 上。 */
const free: Node[] = [];
/** 每次取出/回收递增，用来作废已停掉的 tween 回调。 */
const genOf = new WeakMap<Node, number>();

/**
 * 通用飘字 tips。
 * 业务侧只调 showTip / showTips / tipBoughtSet 等，不要直接碰预制体。
 */
export function showTip(message: string): void {
    const text = (message || "").trim();
    if (!text) return;
    queue = queue.then(() => present(text)).catch(err => {
        console.warn("[GameTip]", text, err);
    });
}

/** 连续多条 tips，自动错开，避免叠成一团。 */
export function showTips(messages: readonly string[]): void {
    const list = messages.map(m => (m || "").trim()).filter(Boolean);
    list.forEach((msg, i) => {
        queue = queue
            .then(async () => {
                if (i > 0) await wait(STAGGER_MS);
                await present(msg);
            })
            .catch(err => {
                console.warn("[GameTip]", msg, err);
            });
    });
}

/** 购买整套并自动穿上后的提示（成功 + 套装加成）。 */
export function tipBoughtSet(setId: string): void {
    const set = setById(setId);
    const tips = [gameTextOr("GameTip_001", "购买成功，已穿上{0}", set.name)];
    for (const effect of setEffects(set)) tips.push(effect);
    showTips(tips);
}

/**
 * 穿上 / 卸下套装。
 * @param equipped true = 刚穿上；false = 刚卸下
 */
export function tipEquipSet(setId: string, equipped: boolean): void {
    const set = setById(setId);
    if (!equipped) {
        showTip(gameTextOr("GameTip_004", "已卸下{0}", set.name));
        return;
    }
    const tips = [gameTextOr("GameTip_005", "已穿上{0}", set.name)];
    for (const effect of setEffects(set)) tips.push(effect);
    showTips(tips);
}

/** 整套效果文案（不再区分两件/四件档）。 */
function setEffects(set: { desc2: string; desc4: string }): string[] {
    const tips: string[] = [];
    if (set.desc2) tips.push(gameTextOr("GameTip_002", "套装加成：{0}", set.desc2));
    if (set.desc4) tips.push(gameTextOr("GameTip_003", "套装加成：{0}", set.desc4));
    return tips;
}

/** 获得强化 / 其他加成。 */
export function tipGain(title: string, detail?: string): void {
    const tips = [gameTextOr("GameTip_006", "获得：{0}", title)];
    if (detail?.trim()) tips.push(detail.trim());
    showTips(tips);
}

/** 缝纫鸡胜利赠送鸡王中王套并自动穿上。 */
export function tipChampionReward(): void {
    const set = setById("champion");
    const tips = [
        gameTextOr("GameTip_007", "获得{0}，已自动穿上", set.name),
        gameTextOr("GameTip_008", "可穿戴挑战最终BOSS坤坤")
    ];
    for (const effect of setEffects(set)) tips.push(effect);
    showTips(tips);
}

function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function ensureTemplate(): Promise<boolean> {
    if (itemTemplate && isValid(itemTemplate) && host && isValid(host)) return true;
    // 加载中复用同一 Promise，避免并发重复 instantiate。
    if (ready) return ready;
    clearPool();
    itemTemplate = null;
    host = null;
    ready = (async () => {
        try {
            if (!oops?.gui?.root) return false;
            const root = await ViewUtil.createPrefabNodeAsync(PREFAB_PATH.gameTip);
            if (!root) return false;
            const item = root.getChildByName("item");
            if (!item) {
                root.destroy();
                return false;
            }
            item.parent = null;
            item.active = false;
            itemTemplate = item;
            // 根节点当 tips 挂点，挂到 Notify 层，盖在所有界面之上。
            root.removeAllChildren();
            const layer = oops.gui.root.getChildByName("LayerNotify") || oops.gui.root;
            root.parent = layer;
            root.setPosition(0, 0, 0);
            host = root;
            warmPool();
            return true;
        } catch (err) {
            console.warn("[GameTip] 预制体加载失败", err);
            return false;
        } finally {
            // 失败可重试
            if (!itemTemplate) ready = null;
        }
    })();
    return ready;
}

/** host / 模板失效时丢掉池里节点，下次 ensure 再预热。 */
function clearPool() {
    for (const node of free) {
        if (isValid(node)) node.destroy();
    }
    free.length = 0;
}

/** 启动时预创建，之后只从池里借还。 */
function warmPool() {
    if (!itemTemplate || !isValid(itemTemplate)) return;
    while (free.length < POOL_SIZE) {
        const node = instantiate(itemTemplate);
        node.active = false;
        genOf.set(node, 0);
        free.push(node);
    }
}

function acquire(): Node | null {
    if (!itemTemplate || !isValid(itemTemplate)) return null;
    // 池节点若被场景卸载弄脏，丢掉再造。
    while (free.length) {
        const node = free.pop()!;
        if (isValid(node)) {
            genOf.set(node, (genOf.get(node) || 0) + 1);
            node.active = true;
            return node;
        }
    }
    const node = instantiate(itemTemplate);
    genOf.set(node, 1);
    node.active = true;
    return node;
}

/** 停动画、摘树、回池；不 destroy。 */
function recycle(node: Node | null | undefined) {
    if (!node || !isValid(node)) return;
    genOf.set(node, (genOf.get(node) || 0) + 1);
    Tween.stopAllByTarget(node);
    const opacity = node.getComponent(UIOpacity);
    if (opacity) {
        Tween.stopAllByTarget(opacity);
        opacity.opacity = 255;
    }
    node.removeFromParent();
    node.setScale(1, 1, 1);
    node.active = false;
    if (free.indexOf(node) >= 0) return;
    // 池已满则销毁多余实例，正常路径不会走到。
    if (free.length >= POOL_SIZE) {
        node.destroy();
        return;
    }
    free.push(node);
}

async function present(text: string): Promise<void> {
    if (!(await ensureTemplate()) || !itemTemplate || !host || !isValid(host)) {
        // 无 GUI（单测 / 启动前）时降级到日志，不抛错。
        console.log("[tip]", text);
        return;
    }
    // 超出可见上限时回收最早一条（立刻摘树，避免 destroy 延后卡死）。
    while (host.children.length >= MAX_VISIBLE) {
        recycle(host.children[0]);
    }
    const node = acquire();
    if (!node) return;
    const ticket = genOf.get(node) || 0;

    const lab = node.getChildByName("LabContent")?.getComponent(Label);
    if (lab) {
        lab.string = text;
        // 长文案按行数撑高木牌，避免裁切。
        lab.overflow = Label.Overflow.RESIZE_HEIGHT;
        lab.enableWrapText = true;
        const labUt = lab.node.getComponent(UITransform);
        if (labUt) labUt.setContentSize(500, 36);
        // 粗估行高：约每 16 字一行。
        const lines = Math.max(1, Math.ceil(text.length / 16));
        const textH = Math.max(36, lines * Math.round(lab.fontSize * 1.25));
        if (labUt) labUt.setContentSize(500, textH);
        node.getComponent(UITransform)?.setContentSize(560, Math.max(72, textH + 28));
    }

    const index = host.children.length;
    node.parent = host;
    node.setPosition(0, BASE_Y - index * STACK_GAP, 0);
    let opacity = node.getComponent(UIOpacity);
    if (!opacity) opacity = node.addComponent(UIOpacity);
    opacity.opacity = 0;
    const rise = 28;
    const homeY = BASE_Y - index * STACK_GAP;
    tween(opacity).to(0.18, { opacity: 255 }).delay(HOLD_SEC).to(0.32, { opacity: 0 }).call(() => {
        if (genOf.get(node) !== ticket) return;
        recycle(node);
    }).start();
    tween(node)
        .to(0.18, { position: v3(0, homeY + rise, 0) }, { easing: "quadOut" })
        .delay(HOLD_SEC)
        .by(0.32, { position: v3(0, 36, 0) })
        .start();
}
