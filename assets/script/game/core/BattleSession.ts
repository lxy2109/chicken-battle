import { dodgeChance, inferFightStyle, STYLE_OPENING, styleDamageMul, stylePierce, styleStagger } from "./BattleStyle";
import { gameNumber, gameText } from "./GameConfig";
import { AiFighter, BattleDecision, decide } from "./BattleAI";
import { Rng } from "./Rng";
import {
    BattleEvent, BattleSide, FightStyle, FighterSnapshot, SignatureId, Stats, StrikeStyle, cloneStats
} from "./Types";

/** 战斗规则来自 GameRule，单怪目标时长由 Enemy 快照传入。 */

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
    streak: number;
    fightStyle: FightStyle;
    signature: SignatureId;
    raged: boolean;
    enraged: boolean;
    counterReady: boolean;
    nextWhiff: boolean;
    guard: boolean;
}

interface PendingStrike {
    to: BattleSide;
    skill: boolean;
    style: StrikeStyle;
}

function toLive(snap: FighterSnapshot, pace: number): LiveFighter {
    const stats = cloneStats(snap.stats);
    return {
        name: snap.name,
        stats,
        atkCd: stats.firstStrike ? 0 : intervalOf(stats.spd) * pace * 0.5,
        healCd: 0,
        skillCd: gameNumber("battle_skillCooldown") * 0.5,
        lockUsed: false,
        busy: false,
        beats: 0,
        streak: 0,
        fightStyle: snap.fightStyle || inferFightStyle(stats),
        signature: snap.signature || "none",
        raged: false,
        enraged: false,
        counterReady: false,
        nextWhiff: false,
        guard: false
    };
}

/** 速度直接换算成出手间隔，这是 spd 在即时制里的唯一作用。 */
function intervalOf(spd: number): number {
    return Math.max(gameNumber("battle_minInterval"), gameNumber("battle_baseInterval") / (1 + Math.max(0, spd) / gameNumber("battle_speedReference")));
}

function hpRatio(f: LiveFighter) {
    return f.stats.maxHp <= 0 ? 0 : f.stats.hp / f.stats.maxHp;
}

/**
 * 缩放后的伤害往往带小数，直接四舍五入会系统性地坑弱势方：
 * 打得动的一方 7.8 进位成 8 几乎无损，打不动的一方 1.2 恒定截成 1，白丢两成输出。
 * 这里按小数部分的概率进位，长期期望值和配表算出来的一致。
 */
function dmgOf(atk: number, def: number, skill: boolean, crit: boolean, scale: number, rng: Rng, pierce = 0): number {
    const raw = Math.max(1, atk - def * (1 - Math.max(0, Math.min(0.8, pierce))));
    const exact = raw * (skill ? gameNumber("battle_skillMultiplier") : 1) * (crit ? gameNumber("battle_critMultiplier") : 1) * scale;
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
        target.stats.hp = Math.max(1, Math.floor(target.stats.maxHp * gameNumber("battle_reviveRatio")));
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
    private durationScale: number;
    private decider: Decider;
    private boss: boolean;

    /**
     * decider 留成口子是为了让 battle 层的行为树接管出招决策：
     * 行为树在 db://oops-framework 下，core 直接引用它就没法脱离编辑器跑验证了。
     * 不传就用 BattleAI 的默认实现，两者判据同源，结论一致。
     */
    constructor(player: FighterSnapshot, enemy: FighterSnapshot, seed: number, boss: boolean, decider?: Decider) {
        this.decider = decider || decide;
        this.boss = boss;
        const reference = gameNumber("battle_referenceSeconds");
        this.durationScale = (enemy.targetBattleSeconds ?? reference) / reference;
        if (!Number.isFinite(this.durationScale) || this.durationScale <= 0) throw new Error("Invalid targetBattleSeconds");
        this.pace = boss ? gameNumber("battle_bossPace") : 1;
        this.dmgScale = gameNumber("battle_damageScale") * (boss ? gameNumber("battle_bossDamage") : 1);
        this.player = toLive(player, this.pace);
        this.enemy = toLive(enemy, this.pace);
        this.rng = new Rng(seed);
        this.events.push({ type: "taunt", side: "player", text: this.rng.pick(player.taunts.length ? player.taunts : [gameText("BattleSession_001")]) });
        this.events.push({ type: "taunt", side: "enemy", text: this.rng.pick(enemy.taunts.length ? enemy.taunts : [gameText("BattleSession_002")]) });
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
        dt /= this.durationScale;

        for (const side of SIDES) {
            const actor = this.live(side);
            actor.healCd = Math.max(0, actor.healCd - dt);
            actor.skillCd = Math.max(0, actor.skillCd - dt);
            if (actor.busy) continue;

            actor.atkCd -= dt;
            if (actor.atkCd > 0) continue;

            const foe: BattleSide = side === "player" ? "enemy" : "player";
            const d = actor.counterReady
                ? { kind: "skill" as const, style: pickCounterStyle(actor) }
                : this.decider(this.toAi(actor), this.toAi(this.live(foe)));
            actor.counterReady = false;
            const style: StrikeStyle = actor.beats === 0 && d.kind !== "heal"
                ? STYLE_OPENING[actor.fightStyle] : d.style;
            actor.beats += 1;
            out.push({ type: "action", side, kind: d.kind, style });

            if (d.kind === "heal") {
                const amount = Math.min(actor.stats.maxHp - actor.stats.hp,
                    Math.round(actor.stats.healPerTurn * (1 + (actor.stats.healBonus || 0))));
                actor.stats.hp = Math.min(actor.stats.maxHp, actor.stats.hp + amount);
                actor.healCd = gameNumber("battle_healCooldown");
                actor.atkCd = this.interval(actor);
                out.push({ type: "heal", side, amount, remain: actor.stats.hp });
            }
            else {
                if (d.kind === "skill") {
                    actor.skillCd = gameNumber("battle_skillCooldown") * (actor.enraged ? 0.55 : 1);
                    if (actor.fightStyle === "tank") actor.guard = true;
                }
                actor.busy = true;
                this.pending[side] = { to: foe, skill: d.kind === "skill", style };
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

        if (hit && actor.signature === "clumsy" && this.rng.chance(0.1)) hit = false;
        if (hit && actor.nextWhiff) {
            actor.nextWhiff = false;
            if (this.rng.chance(0.55)) hit = false;
        }

        if (!hit) {
            actor.streak = 0;
            const miss: BattleEvent[] = [{ type: "miss", side }];
            this.events.push(...miss);
            return miss;
        }

        const foe = p.to;
        if (this.pending[foe]) return this.resolveClash(side, p);

        const victim = this.live(foe);
        if (this.rng.chance(dodgeChance(actor.stats.spd, victim.stats.spd, victim.fightStyle, victim.signature, p.style))) {
            actor.streak = 0;
            const dodge: BattleEvent[] = [{ type: "dodge", side: foe }];
            this.events.push(...dodge);
            return dodge;
        }

        return this.landHit(side, p, 1);
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

    private resolveClash(side: BattleSide, first: PendingStrike): BattleEvent[] {
        const other: BattleSide = side === "player" ? "enemy" : "player";
        const second = this.pending[other];
        const a = this.live(side);
        const b = this.live(other);
        if (second) {
            this.pending[other] = null;
            b.busy = false;
            b.atkCd = this.interval(b);
        }
        const winner: BattleSide = a.stats.atk + a.stats.spd * 0.5 >= b.stats.atk + b.stats.spd * 0.5 ? side : other;
        const batch: BattleEvent[] = [{ type: "clash", winner }];
        this.events.push(batch[0]);
        batch.push(...this.landHit(side, first, 0.8, winner !== side));
        if (this.phase !== "over" && second) batch.push(...this.landHit(other, second, 0.8, winner !== other));
        return batch;
    }

    /**
     * 结算一次命中。clashMul < 1 表示对撞折伤。
     */
    private landHit(side: BattleSide, p: PendingStrike, clashMul: number, clashLose = false): BattleEvent[] {
        const actor = this.live(side);
        const victim = this.live(p.to);
        const crit = this.rng.chance(actor.stats.crit + (p.style === "feint" ? 0.06 : 0));
        let scale = this.dmgScale
            * (1 + Math.min(gameNumber("battle_streakCap"), actor.streak) * (actor.stats.streakBonus || 0))
            * clashMul
            * styleDamageMul(p.style, p.skill, actor.signature);
        if (actor.raged) scale *= actor.fightStyle === "berserker" ? 1.22 : 1.12;
        if (actor.enraged) scale *= 1.18;
        if (p.style === "tail" && this.pending[p.to]) scale *= 1.16;
        if (victim.fightStyle === "tank") scale *= 0.96;
        if (victim.guard) {
            scale *= 0.8;
            victim.guard = false;
        }
        const dmg = dmgOf(actor.stats.atk, victim.stats.def, p.skill, crit, scale, this.rng, stylePierce(p.style));
        actor.streak += 1;
        const result = applyDamage(victim, dmg);
        const stagger = gameNumber("battle_hitStagger") * this.pace
            * styleStagger(p.style, p.skill)
            * (clashLose ? 1.8 : 1);
        victim.atkCd += stagger;
        if (p.style === "feint") victim.nextWhiff = true;
        if (victim.signature === "counter") victim.counterReady = true;

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
        if (!result.locked && result.dmg > 0 && actor.signature === "stitch") {
            const sip = Math.max(1, Math.round(result.dmg * 0.22));
            actor.stats.hp = Math.min(actor.stats.maxHp, actor.stats.hp + sip);
            batch.push({ type: "heal", side, amount: sip, remain: actor.stats.hp });
        }
        if (result.revived) batch.push({ type: "revive", side: p.to, remain: victim.stats.hp });
        this.pushStatus(actor, side, batch);
        this.pushStatus(victim, p.to, batch);
        if (this.player.stats.hp <= 0 || this.enemy.stats.hp <= 0) {
            this.phase = "over";
            batch.push({ type: "end", win: this.player.stats.hp > 0 });
        }
        this.events.push(...batch);
        return batch;
    }

    private pushStatus(f: LiveFighter, side: BattleSide, batch: BattleEvent[]) {
        if (!f.raged && hpRatio(f) <= 0.32 && f.stats.hp > 0) {
            f.raged = true;
            batch.push({ type: "rage", side });
        }
        if (this.boss && side === "enemy" && !f.enraged && hpRatio(f) <= 0.5 && f.stats.hp > 0) {
            f.enraged = true;
            batch.push({ type: "enrage", side });
            if (f.signature === "idol") {
                const amount = Math.max(1, Math.round(f.stats.maxHp * 0.15));
                f.stats.hp = Math.min(f.stats.maxHp, f.stats.hp + amount);
                batch.push({ type: "heal", side, amount, remain: f.stats.hp });
            }
        }
    }

    private interval(f: LiveFighter): number {
        let t = intervalOf(f.stats.spd) * this.pace;
        if (f.raged) t *= f.fightStyle === "berserker" ? 0.72 : 0.84;
        if (f.enraged) t *= 0.8;
        return Math.max(gameNumber("battle_minInterval") * 0.85, t);
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
            beat: f.beats,
            style: f.fightStyle,
            signature: f.signature
        };
    }

    private live(side: BattleSide): LiveFighter {
        return side === "player" ? this.player : this.enemy;
    }
}

function pickCounterStyle(actor: LiveFighter): StrikeStyle {
    const pool = actor.fightStyle === "tank" ? ["tail", "charge", "leap"] as StrikeStyle[]
        : ["charge", "combo", "leap"] as StrikeStyle[];
    return pool[actor.beats % pool.length];
}
