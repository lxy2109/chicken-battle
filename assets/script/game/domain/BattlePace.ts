/**
 * 局内点击加速共用的时间倍率。
 * 逻辑 tick 与演出时长都读这里，保证加速时流程一起变快。
 */
let pace = 1;

export function battlePace(): number {
    return pace;
}

export function setBattlePace(value: number) {
    if (!Number.isFinite(value) || value <= 0) {
        pace = 1;
        return;
    }
    pace = Math.max(1, Math.min(3, value));
}

export function resetBattlePace() {
    pace = 1;
}
