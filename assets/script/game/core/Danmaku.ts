import { tableOf } from "./Config";

export type DanmakuKind = "warmup" | "official" | "boss";

/** Visual randomness must not consume the battle RNG or change combat outcomes. */
export class DanmakuPool {
    private recent: string[] = [];
    constructor(readonly kind: DanmakuKind, readonly enemy: string, private random = Math.random) { }

    next(active: string[]): string | undefined {
        const data = tableOf("Danmaku") as Record<string, string[]>;
        const rule = tableOf("DanmakuRule")[this.enemy] || tableOf("DanmakuRule").common;
        const name = rule.group;
        const special = data[name] || [];
        const repeat = rule.repeat;
        const excluded = repeat ? [] : [...active, ...this.recent];
        let pool = this.kind === "warmup" || !special.length ? data.common
            : this.kind === "boss" || this.random() >= rule.commonChance ? special : data.common;
        if (this.kind === "boss" && rule.featuredText) {
            pool = this.random() < rule.featuredChance ? [rule.featuredText] : special.filter(text => text !== rule.featuredText);
        }
        const candidates = pool.filter(text => !excluded.includes(text));
        if (!candidates.length) return;
        const text = candidates[Math.floor(this.random() * candidates.length)];
        this.recent.push(text);
        this.recent = rule.recentCount > 0 ? this.recent.slice(-rule.recentCount) : [];
        return text;
    }
}
