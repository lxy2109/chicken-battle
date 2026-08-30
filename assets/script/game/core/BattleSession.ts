import { AiFighter, BattleDecision, decide } from "./BattleAI";
import { Rng } from "./Rng";
import { BattleEvent, BattleSide, FighterSnapshot, Stats, StrikeStyle, cloneStats } from "./Types";

/**
 * 即时战斗的节奏常量。
 *
 * 配表是按回合制配的，一场只够砍五到十刀。这套数值直接搬进即时制，会变成双方
 * 每隔三四秒才动一下的慢动作，所以这里把单刀伤害等比缩小、出手频率提上来，
 * 让一场打满二三十刀。等比缩放不改变谁强谁弱，配表一个字都不用动。
 */
const BASE_INTERVAL = 1.6;
const SPD_REF = 20;
const MIN_INTERVAL = 0.55;
const DMG_SCALE = 0.3;
const HEAL_CD = 6;
const SKILL_CD = 4.5;
/** 挨打会打断节奏，下一刀稍微延后，避免双方永远整齐地对拍。 */
const HIT_STAGGER = 0.12;
/**
 * 鸡王血厚、带回血和复活，按常规节奏要打四十多秒。决战可以久一点但不该拖沓，
 * 双方同步加快加重，强弱关系不变，只是把这一场压回三十秒出头。
 */
const BOSS_PACE = 0.92;
const BOSS_DMG_BOOST = 1.25;

/** 出招决策的来源，默认是 BattleAI.decide，运行时换成行为树。 */
export type Decider = (self: AiFighter, foe: AiFighter) => BattleDecision;

const SIDES: BattleSide[] = ["player", "enemy"];

type Phase = "intro" | "combat" | "over";

interface LiveFighter {
    name: string;
    stats: Stats;
    /** 距离下次出手的秒数 */
    atkCd: number;
    healCd: number;
    skillCd: number;
    lockUsed: boolean;
    /** 演出层正在播这一方的动作，期间不再出新招 */
    busy: boolean;
    /** 已经出了几次手，交给决策去轮换招式动作 */
    beats: number;
}

interface PendingStrike {
    to: BattleSide;
    skill: boolean;
}

function toLive(snap: FighterSnapshot, pace: number): LiveFighter {
    const stats = cloneStats(snap.stats);
    return {
        name: snap.name,
        stats,
        atkCd: intervalOf(stats.spd) * pace * 0.5,
        healCd: 0,
        skillCd: 0,
        lockUsed: false,
        busy: false,
        beats: 0
    };
}

/** 速度直接换算成出手间隔，这是 spd 在即时制里的唯一作用。 */
function intervalOf(spd: number): number {
    return Math.max(MIN_INTERVAL, BASE_INTERVAL / (1 + Math.max(0, spd) / SPD_REF));
}

/**
 * 缩放后的伤害往往带小数，直接四舍五入会系统性地坑弱势方：
 * 打得动的一方 7.8 进位成 8 几乎无损，打不动的一方 1.2 恒定截成 1，白丢两成输出。
 * 这里按小数部分的概率进位，长期期望值和配表算出来的一致。
 */
function dmgOf(atk: number, def: number, skill: boolean, crit: boolean, scale: number, rng: Rng): number {
    const raw = Math.max(1, atk - def);
    const exact = raw * (skill ? 1.7 : 1) * (crit ? 1.5 : 1) * scale;
    const base = Math.floor(exact);
    return Math.max(1, base + (rng.chance(exact - base) ? 1 : 0));
}

function applyDamage(target: LiveFighter, dmg: number): { dmg: number; locked: boolean; revived: boolean } {
    if (target.stats.lockHp && !target.lockUsed && target.stats.hp - dmg <= 0) {
        target.stats.hp = 1;
        target.lockUsed = true;
        return { dmg: 0, locked: true, revived: false };
    }
    target.stats.hp = Math.max(0, target.stats.hp - dmg);
    if (target.stats.hp <= 0 && target.stats.revive > 0) {
        target.stats.revive -= 1;
        target.stats.hp = Math.max(1, Math.floor(target.stats.maxHp * 0.4));
        return { dmg, locked: false, revived: true };
    }
    return { dmg, locked: false, revived: false };
}

/**
 * 即时自动战斗会话。
 *
 * 双方各有各的出手冷却，`tick` 按时间推进，谁的冷却先走完谁就先出招，没有回合交替。
 * 出招只登记意图，伤害要等演出层真的撞上了再调 `resolveStrike` 结算。
 */
export class BattleSession {
    readonly events: BattleEvent[] = [];
    private player: LiveFighter;
    private enemy: LiveFighter;
    private rng: Rng;
    private phase: Phase = "intro";
    private introSent = false;
    private pending: Record<BattleSide, PendingStrike | null> = { player: null, enemy: null };
    private pace: number;
    private dmgScale: number;
    private decider: Decider;

    /**
     * decider 留成口子是为了让 battle 层的行为树接管出招决策：
     * 行为树在 db://oops-framework 下，core 直接引用它就没法脱离编辑器跑验证了。
     * 不传就用 BattleAI 的默认实现，两者判据同源，结论一致。
     */
    constructor(player: FighterSnapshot, enemy: FighterSnapshot, seed: number, boss: boolean, decider?: Decider) {
        this.decider = decider || decide;
        this.pace = boss ? BOSS_PACE : 1;
        this.dmgScale = DMG_SCALE * (boss ? BOSS_DMG_BOOST : 1);
        this.player = toLive(player, this.pace);
        this.enemy = toLive(enemy, this.pace);
        this.rng = new Rng(seed);
        this.events.push({ type: "taunt", side: "player", text: this.rng.pick(player.taunts.length ? player.taunts : ["上啊！"]) });
        this.events.push({ type: "taunt", side: "enemy", text: this.rng.pick(enemy.taunts.length ? enemy.taunts : ["咯咯！"]) });
        this.events.push({ type: "start" });
    }

    get win(): boolean {
        return this.phase === "over" && this.player.stats.hp > 0;
    }

    get done(): boolean {
        return this.phase === "over";
    }

    /** 开场嘲讽的事件，演出层播完这些再调 beginCombat。 */
    intro(): BattleEvent[] {
        this.introSent = true;
        return this.events.slice(0, 3);
    }

    beginCombat() {
        if (this.phase === "intro") this.phase = "combat";
    }

    hp(side: BattleSide): number {
        return this.live(side).stats.hp;
    }

    maxHp(side: BattleSide): number {
        return this.live(side).stats.maxHp;
    }

    /** 该方是否有招式待结算，演出层用来防止重复触发。 */
    striking(side: BattleSide): boolean {
        return this.pending[side] != null;
    }

    context(side: BattleSide) {
        const self = this.live(side);
        const foe = this.live(side === "player" ? "enemy" : "player");
        return { self: this.toAi(self), foe: this.toAi(foe) };
    }

    /**
     * 按时间推进，返回这一帧新产生的事件。
     * 攻击类只产出 action，等演出层回调 resolveStrike 才结算伤害。
     */
    tick(dt: number): BattleEvent[] {
        const out: BattleEvent[] = [];
        if (this.phase !== "combat" || dt <= 0) return out;

        for (const side of SIDES) {
            const actor = this.live(side);
            actor.healCd = Math.max(0, actor.healCd - dt);
            actor.skillCd = Math.max(0, actor.skillCd - dt);
            if (actor.busy) continue;

            actor.atkCd -= dt;
            if (actor.atkCd > 0) continue;

            const foe: BattleSide = side === "player" ? "enemy" : "player";
            const d = this.decider(this.toAi(actor), this.toAi(this.live(foe)));
            const style: StrikeStyle = d.style;
            actor.beats += 1;
            out.push({ type: "action", side, kind: d.kind, style });

            if (d.kind === "heal") {
                const amount = actor.stats.healPerTurn;
                actor.stats.hp = Math.min(actor.stats.maxHp, actor.stats.hp + amount);
                actor.healCd = HEAL_CD;
                actor.atkCd = this.interval(actor);
                out.push({ type: "heal", side, amount, remain: actor.stats.hp });
            }
            else {
                if (d.kind === "skill") actor.skillCd = SKILL_CD;
                actor.busy = true;
                this.pending[side] = { to: foe, skill: d.kind === "skill" };
            }
        }

        this.events.push(...out);
        return out;
    }

    /**
     * 演出层播完一次出招后回调：hit 为 true 表示真的撞上了，结算伤害；false 是空挥。
     * 无论命中与否都会解除 busy 并重置该方的出手冷却。
     */
    resolveStrike(side: BattleSide, hit: boolean): BattleEvent[] {
        const p = this.pending[side];
        const actor = this.live(side);
        actor.busy = false;
        if (!p) return [];
        this.pending[side] = null;
        actor.atkCd = this.interval(actor);
        if (this.phase === "over") return [];

        if (!hit) {
            const miss: BattleEvent[] = [{ type: "miss", side }];
            this.events.push(...miss);
            return miss;
        }

        const victim = this.live(p.to);
        const crit = this.rng.chance(actor.stats.crit);
        const dmg = dmgOf(actor.stats.atk, victim.stats.def, p.skill, crit, this.dmgScale, this.rng);
        const result = applyDamage(victim, dmg);
        victim.atkCd += HIT_STAGGER * this.pace;

        const batch: BattleEvent[] = [];
        if (result.locked) batch.push({ type: "lock", side: p.to });
        batch.push({
            type: "hit",
            from: side,
            to: p.to,
            dmg: result.locked ? 0 : result.dmg,
            crit,
            remain: victim.stats.hp
        });
        if (result.revived) batch.push({ type: "revive", side: p.to, remain: victim.stats.hp });
        if (this.player.stats.hp <= 0 || this.enemy.stats.hp <= 0) {
            this.phase = "over";
            batch.push({ type: "end", win: this.player.stats.hp > 0 });
        }
        this.events.push(...batch);
        return batch;
    }

    /** 无界面验证用：按固定步长快进，视为每一刀都撞上。 */
    resolveAll(): boolean {
        if (!this.introSent) this.intro();
        this.beginCombat();
        let guard = 0;
        while (this.phase !== "over" && guard < 100000) {
            this.tick(0.05);
            for (const side of SIDES) {
                if (this.pending[side]) this.resolveStrike(side, true);
            }
            guard += 1;
        }
        return this.win;
    }

    private interval(f: LiveFighter): number {
        return intervalOf(f.stats.spd) * this.pace;
    }

    private toAi(f: LiveFighter) {
        return {
            hp: f.stats.hp,
            maxHp: f.stats.maxHp,
            atk: f.stats.atk,
            def: f.stats.def,
            spd: f.stats.spd,
            crit: f.stats.crit,
            healPerTurn: f.stats.healPerTurn,
            healCd: f.healCd,
            skillCd: f.skillCd,
            beat: f.beats
        };
    }

    private live(side: BattleSide): LiveFighter {
        return side === "player" ? this.player : this.enemy;
    }
}
