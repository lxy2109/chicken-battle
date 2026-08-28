import { decide } from "./BattleAI";
import { Rng } from "./Rng";
import { BattleEvent, BattleSide, FighterSnapshot, Stats, StrikeStyle, cloneStats } from "./Types";

interface LiveFighter {
    name: string;
    stats: Stats;
    healCd: number;
    skillCd: number;
    lockUsed: boolean;
}

interface PendingStrike {
    from: BattleSide;
    to: BattleSide;
    skill: boolean;
}

function toLive(snap: FighterSnapshot): LiveFighter {
    return {
        name: snap.name,
        stats: cloneStats(snap.stats),
        healCd: 0,
        skillCd: 0,
        lockUsed: false
    };
}

function dmgOf(atk: number, def: number, skill: boolean, crit: boolean): number {
    const raw = Math.max(1, atk - def);
    const mul = (skill ? 1.7 : 1) * (crit ? 1.5 : 1);
    return Math.max(1, Math.round(raw * mul));
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
 * 自动战斗会话：先出招，接触命中后才结算伤害。
 */
export class BattleSession {
    readonly events: BattleEvent[] = [];
    private player: LiveFighter;
    private enemy: LiveFighter;
    private rng: Rng;
    private started = false;
    private finished = false;
    private nextSide: BattleSide;
    private pending: PendingStrike | null = null;

    constructor(player: FighterSnapshot, enemy: FighterSnapshot, seed: number, _boss: boolean) {
        this.player = toLive(player);
        this.enemy = toLive(enemy);
        this.rng = new Rng(seed);
        this.nextSide = this.player.stats.spd >= this.enemy.stats.spd ? "player" : "enemy";
        this.events.push({ type: "taunt", side: "player", text: this.rng.pick(player.taunts.length ? player.taunts : ["上啊！"]) });
        this.events.push({ type: "taunt", side: "enemy", text: this.rng.pick(enemy.taunts.length ? enemy.taunts : ["咯咯！"]) });
        this.events.push({ type: "start" });
    }

    get win(): boolean {
        return this.finished && this.player.stats.hp > 0;
    }

    get done(): boolean {
        return this.finished;
    }

    get hasPending(): boolean {
        return this.pending != null;
    }

    hp(side: BattleSide): number {
        return this.live(side).stats.hp;
    }

    maxHp(side: BattleSide): number {
        return this.live(side).stats.maxHp;
    }

    context(side: BattleSide) {
        const self = this.live(side);
        const foe = this.live(side === "player" ? "enemy" : "player");
        return { self: this.toAi(self), foe: this.toAi(foe) };
    }

    /** 推进一次行动。攻击只登记待结算，须 landHit / whiff。 */
    step(): BattleEvent[] {
        const batch: BattleEvent[] = [];
        if (this.finished || this.pending) return batch;
        if (!this.started) {
            this.started = true;
            return this.events.filter(e => e.type === "taunt" || e.type === "start");
        }

        const from = this.nextSide;
        const to: BattleSide = from === "player" ? "enemy" : "player";
        const actor = this.live(from);
        actor.healCd = Math.max(0, actor.healCd - 1);
        actor.skillCd = Math.max(0, actor.skillCd - 1);

        const d = decide(this.toAi(actor), this.toAi(this.live(to)));
        const style: StrikeStyle = d.style;
        batch.push({ type: "action", side: from, kind: d.kind, style });

        if (d.kind === "heal") {
            const amount = actor.stats.healPerTurn;
            actor.stats.hp = Math.min(actor.stats.maxHp, actor.stats.hp + amount);
            actor.healCd = 2;
            batch.push({ type: "heal", side: from, amount, remain: actor.stats.hp });
            this.nextSide = to;
        }
        else {
            if (d.kind === "skill") actor.skillCd = 3;
            this.pending = { from, to, skill: d.kind === "skill" };
        }

        this.events.push(...batch);
        return batch;
    }

    /** 碰撞成立后结算伤害 */
    landHit(): BattleEvent[] {
        const p = this.pending;
        if (!p || this.finished) return [];
        this.pending = null;
        const actor = this.live(p.from);
        const victim = this.live(p.to);
        const crit = this.rng.chance(actor.stats.crit);
        const dmg = dmgOf(actor.stats.atk, victim.stats.def, p.skill, crit);
        const result = applyDamage(victim, dmg);
        const batch: BattleEvent[] = [];
        if (result.locked) batch.push({ type: "lock", side: p.to });
        batch.push({
            type: "hit",
            from: p.from,
            to: p.to,
            dmg: result.locked ? 0 : result.dmg,
            crit,
            remain: victim.stats.hp
        });
        if (result.revived) batch.push({ type: "revive", side: p.to, remain: victim.stats.hp });
        this.afterStrike(batch, p.to);
        return batch;
    }

    /** 没撞上，本拍空挥 */
    whiff(): BattleEvent[] {
        const p = this.pending;
        if (!p || this.finished) return [];
        this.pending = null;
        const batch: BattleEvent[] = [{ type: "miss", side: p.from }];
        this.afterStrike(batch, p.to);
        return batch;
    }

    /** 立刻打完（无界面验证视为每次都撞上） */
    resolveAll(): boolean {
        while (!this.finished) {
            this.step();
            if (this.pending) this.landHit();
        }
        return this.win;
    }

    private afterStrike(batch: BattleEvent[], next: BattleSide) {
        if (this.player.stats.hp <= 0 || this.enemy.stats.hp <= 0) {
            this.finished = true;
            batch.push({ type: "end", win: this.player.stats.hp > 0 });
        }
        else {
            this.nextSide = next;
        }
        this.events.push(...batch);
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
            skillCd: f.skillCd
        };
    }

    private live(side: BattleSide): LiveFighter {
        return side === "player" ? this.player : this.enemy;
    }
}
