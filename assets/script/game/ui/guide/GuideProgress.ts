/** 新手引导进度。跟当前存档走：清档或新开一局会重来，不另存全局键。 */

export const GUIDE_SAVE_KEY = "chicken_battle_guide_v1";

export type GuideId =
    | "customize-color"
    | "customize-name"
    | "map-battle"
    | "battle-skill"
    | "battle-danmaku"
    | "battle-tap"
    | "shop-buy"
    | "shop-confirm"
    | "shop-leave"
    | "reward-pick"
    | "reward-confirm"
    | "map-avatar"
    | "character-equip"
    | "character-hide"
    | "map-next"
    | "map-skip";

export interface GuideHost {
    guideDone: string[];
    onChanged?: () => void;
}

let host: GuideHost | null = null;

export function bindGuideRun(state: GuideHost | null) {
    host = state;
}

export function isGuideDone(id: GuideId): boolean {
    return !!host?.guideDone.includes(id);
}

export function markGuideDone(id: GuideId) {
    if (!host || host.guideDone.includes(id)) return;
    host.guideDone.push(id);
    host.onChanged?.();
}

export function resetGuideProgress() {
    if (!host) return;
    host.guideDone = [];
    host.onChanged?.();
}
