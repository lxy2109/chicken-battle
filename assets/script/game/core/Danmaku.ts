import { tableOf } from "./Config";

export type DanmakuKind = "warmup" | "official" | "boss";

/** Visual randomness must not consume the battle RNG or change combat outcomes. */
export class DanmakuPool {
    private recent: string[] = [];
    constructor(readonly kind: DanmakuKind, readonly enemy: string, private random = Math.random) { }

    next(active: string[]): string | undefined {
        const data = tableOf("Danmaku") as Record<string, string[]>;
        const name = this.enemy === "鸡王坤坤" ? "坤坤鸡" : this.enemy;
        const special = data[name] || [];
        const repeat = ["缝纫鸡", "哈鸡米", "坤坤鸡"].includes(name);
        const excluded = repeat ? [] : [...active, ...this.recent];
        let pool = this.kind === "warmup" || !special.length ? data.common
            : this.kind === "boss" || this.random() >= 0.7 ? special : data.common;
        if (this.kind === "boss" && name === "坤坤鸡") {
            pool = this.random() < 0.8 ? ["鸡你太美"] : special.filter(text => text !== "鸡你太美");
        }
        const candidates = pool.filter(text => !excluded.includes(text));
        if (!candidates.length) return;
        const text = candidates[Math.floor(this.random() * candidates.length)];
        this.recent.push(text);
        this.recent = this.recent.slice(-8);
        return text;
    }
}
