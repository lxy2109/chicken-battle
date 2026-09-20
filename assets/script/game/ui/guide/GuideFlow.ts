import { Button, EditBox, Node } from "cc";
import { gameTextOr } from "../../domain/GameConfig";
import { GuideId, isGuideDone, markGuideDone, resetGuideProgress as clearStoredGuide } from "./GuideProgress";
import { GuideOverlay } from "./GuideOverlay";

export type { GuideId } from "./GuideProgress";
export { isGuideDone, markGuideDone } from "./GuideProgress";

export function resetGuideProgress() {
    hideGuide();
    clearStoredGuide();
}

const overlay = new GuideOverlay();
let chain: Promise<unknown> = Promise.resolve();
let currentId: GuideId | null = null;

/** 关掉遮罩。传入 id 时只关这些步骤，避免商店关界面时把地图头像引导一并清掉。 */
export function hideGuide(ids?: GuideId | GuideId[]) {
    if (ids != null) {
        const list = Array.isArray(ids) ? ids : [ids];
        if (!currentId || !list.includes(currentId)) return;
    }
    currentId = null;
    overlay.hide();
}

export type PlayGuideOpts = {
    /** 点挖空时是否把点击传给目标。穿脱/隐藏外观只讲解，不代点。 */
    click?: boolean;
};

/** 首次引导：挖空目标并提示。已完成或没有有效节点时立刻返回 false。 */
export function playGuide(
    id: GuideId,
    targets: Array<Node | null | undefined>,
    text: string,
    opts?: PlayGuideOpts
): Promise<boolean> {
    const job = chain.then(() => runGuide(id, targets, text, opts), () => runGuide(id, targets, text, opts));
    chain = job.then(() => undefined, () => undefined);
    return job;
}

async function runGuide(
    id: GuideId,
    targets: Array<Node | null | undefined>,
    text: string,
    opts?: PlayGuideOpts
): Promise<boolean> {
    if (isGuideDone(id)) return false;
    const nodes = targets.filter((node): node is Node => !!node?.isValid && node.activeInHierarchy);
    if (!nodes.length) return false;
    await waitFrame();
    const still = nodes.filter(node => node.isValid && node.activeInHierarchy);
    if (!still.length || isGuideDone(id)) return false;
    currentId = id;
    const hit = await overlay.show(still, text);
    if (currentId === id) currentId = null;
    if (!hit?.isValid) return false;
    markGuideDone(id);
    if (opts?.click !== false) fireGuideClick(hit);
    return true;
}

export function guideText(id: GuideId): string {
    switch (id) {
        case "customize-color":
            return gameTextOr("Guide_001", "先点部位选头、脸、翅膀或身体，再点色块染色，也可点「随机」");
        case "customize-name":
            return gameTextOr("Guide_002", "点输入框改名字，或点「随机」起个名");
        case "map-battle":
            return gameTextOr("Guide_003", "点地图上的小怪，或点底部「开始挑战」开战");
        case "battle-skill":
            return gameTextOr("Guide_004", "点底部绝招，冷却好了就能放");
        case "battle-danmaku":
            return gameTextOr("Guide_005", "点这里发送弹幕，给比赛加油");
        case "battle-tap":
            return gameTextOr("Guide_006", "点场上的「加速」圈，可以加快战斗并缩短绝招冷却");
        case "shop-buy":
            return gameTextOr("Guide_007", "点货架上的套装，先看看再买");
        case "shop-confirm":
            return gameTextOr("Guide_008", "金币够就点这里买下");
        case "shop-leave":
            return gameTextOr("Guide_009", "买好了，点这里返回地图");
        case "reward-pick":
            return gameTextOr("Guide_014", "三选一，点一张强化牌练部位");
        case "reward-confirm":
            return gameTextOr("Guide_015", "选好了，点确定带上这张强化");
        case "map-avatar":
            return gameTextOr("Guide_010", "点左上角头像，去穿脱套装");
        case "character-equip":
            return gameTextOr("Guide_011", "点套装格子可以穿上或卸下");
        case "character-hide":
            return gameTextOr("Guide_012", "点这里可以隐藏套装外观，只看自定义染色");
        case "map-next":
            return gameTextOr("Guide_013", "首图通关了，点这里前往新地图");
        case "map-skip":
            return gameTextOr("Guide_016", "热身打过了，点底部「一键跳过」直接拿强化");
        default:
            return "";
    }
}

function fireGuideClick(node: Node) {
    let cur: Node | null = node;
    while (cur) {
        const box = cur.getComponent(EditBox);
        if (box) {
            box.focus();
            return;
        }
        if (cur.getComponent(Button)) {
            cur.emit(Button.EventType.CLICK);
            return;
        }
        cur = cur.parent;
    }
}

function waitFrame() {
    return new Promise<void>(resolve => setTimeout(resolve, 80));
}
