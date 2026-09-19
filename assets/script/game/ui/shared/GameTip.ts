import { instantiate, isValid, Label, Node, tween, UIOpacity, UITransform, v3 } from "cc";
import { oops } from "db://oops-framework/core/Oops";
import { ViewUtil } from "db://oops-framework/core/utils/ViewUtil";
import { PREFAB_PATH, setById } from "../../domain/Catalog";
import { gameTextOr } from "../../domain/GameConfig";

/** 同时最多几条 tips，超出丢弃最早的。 */
const MAX_VISIBLE = 3;
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

function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function ensureTemplate(): Promise<boolean> {
    if (itemTemplate && isValid(itemTemplate) && host && isValid(host)) return true;
    // 加载中复用同一 Promise，避免并发重复 instantiate。
    if (ready) return ready;
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
            itemTemplate = item;
            // 根节点当 tips 挂点，挂到 Notify 层，盖在所有界面之上。
            root.removeAllChildren();
            const layer = oops.gui.root.getChildByName("LayerNotify") || oops.gui.root;
            root.parent = layer;
            root.setPosition(0, 0, 0);
            host = root;
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

async function present(text: string): Promise<void> {
    if (!(await ensureTemplate()) || !itemTemplate || !host || !isValid(host)) {
        // 无 GUI（单测 / 启动前）时降级到日志，不抛错。
        console.log("[tip]", text);
        return;
    }
    while (host.children.length >= MAX_VISIBLE) {
        const oldest = host.children[0];
        oldest.destroy();
    }
    const node = instantiate(itemTemplate);
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
    tween(opacity).to(0.18, { opacity: 255 }).delay(HOLD_SEC).to(0.32, { opacity: 0 }).call(() => {
        if (isValid(node)) node.destroy();
    }).start();
    tween(node)
        .to(0.18, { position: v3(0, BASE_Y - index * STACK_GAP + rise, 0) }, { easing: "quadOut" })
        .delay(HOLD_SEC)
        .by(0.32, { position: v3(0, 36, 0) })
        .start();
}
