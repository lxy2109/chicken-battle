import { enemyToFighter, getPlayer, getStage, maxStage, playerTaunts } from "./Catalog";
import { applySkinAppearance, buildStats, healFull, itemById, setById, setPrice, shopStock } from "./EquipMath";
import { rollRewards } from "./RewardGen";
import { Rng } from "./Rng";
import {
    Appearance, EquipItem, FighterSnapshot, RewardOption, RunScreen, StagePhase, Stats,
    defaultAppearance
} from "./Types";

export class RunState {
    gold = 0;
    stage = 1;
    phase: StagePhase = "warmup";
    shopPending = false;
    lastWin = false;
    lastGoldGain = 0;
    screen: RunScreen = "customize";
    appearance: Appearance = defaultAppearance();
    ownedIds: string[] = [];
    bonus: Partial<Stats> = {};
    rewards: RewardOption[] = [];
    shopItems: EquipItem[] = [];
    seed: number;
    constructor(seed?: number) {
        this.seed = seed ?? (Date.now() % 100000);
    }
    playerFighter(): FighterSnapshot {
        const p = getPlayer();
        return {
            name: p.name,
            appearance: applySkinAppearance(this.appearance, this.ownedIds),
            stats: healFull(buildStats(this.ownedIds, this.bonus)),
            taunts: playerTaunts()
        };
    }
    enemyFighter(): FighterSnapshot {
        if (this.phase === "boss") {
            return enemyToFighter(getPlayer().bossEnemyId);
        }
        const row = getStage(this.stage);
        const id = this.phase === "warmup" ? row.warmupEnemyId : row.officialEnemyId;
        return enemyToFighter(id);
    }
    confirmAppearance(appearance: Appearance) {
        this.appearance = appearance;
        this.screen = "map";
    }
    enterFight() {
        this.screen = "prebattle";
    }
    startBattle() {
        this.screen = "battle";
    }
    settle(win: boolean) {
        this.lastWin = win;
        this.lastGoldGain = 0;
        const stage = this.phase === "boss" ? null : getStage(this.stage);
        if (this.phase === "warmup" && stage) {
            this.lastGoldGain = win ? stage.warmupGoldWin : stage.warmupGoldLose;
            this.gold += this.lastGoldGain;
            this.shopPending = true;
            this.screen = "result";
            return;
        }
        if (!win) {
            this.screen = "result";
            return;
        }
        this.lastGoldGain = this.phase === "boss" ? getPlayer().bossGoldWin : getStage(this.stage).officialGoldWin;
        this.gold += this.lastGoldGain;
        if (this.phase !== "boss") {
            this.rewards = rollRewards(this.stage, this.seed + this.stage * 17);
        }
        this.screen = "result";
    }
    afterResult() {
        if (this.phase === "warmup") {
            this.openShop();
            return;
        }
        if (this.phase === "boss") {
            this.screen = this.lastWin ? "ending" : "map";
            return;
        }
        if (!this.lastWin) {
            this.phase = "warmup";
            this.shopPending = false;
            this.screen = "map";
            return;
        }
        this.screen = "reward";
    }
    pickReward(id: string) {
        const opt = this.rewards.find(v => v.id === id);
        if (opt) {
            this.gold += opt.gold;
            this.mergeBonus(opt.stats);
        }
        this.shopPending = true;
        this.openShop();
    }
    skipReward() {
        this.shopPending = true;
        this.openShop();
    }
    openShop() {
        this.shopItems = shopStock(this.stage, this.ownedIds);
        this.screen = "shop";
    }
    buyItem(id: string): boolean {
        const item = itemById(id);
        if (this.ownedIds.indexOf(id) >= 0) return false;
        if (this.gold < item.price) return false;
        this.gold -= item.price;
        this.ownedIds.push(id);
        this.shopItems = shopStock(this.stage, this.ownedIds);
        return true;
    }
    buySet(setId: string): boolean {
        const def = setById(setId);
        const missing = def.pieceIds.filter(id => this.ownedIds.indexOf(id) < 0);
        const price = setPrice(setId);
        if (missing.length === 0) return false;
        if (this.gold < price) return false;
        this.gold -= price;
        for (const id of missing) this.ownedIds.push(id);
        this.shopItems = shopStock(this.stage, this.ownedIds);
        return true;
    }
    leaveShop() {
        this.shopPending = false;
        if (this.phase === "warmup") {
            this.phase = "official";
            this.screen = "map";
            return;
        }
        if (this.phase === "official") {
            if (this.stage >= maxStage()) {
                this.phase = "boss";
            }
            else {
                this.stage += 1;
                this.phase = "warmup";
            }
            this.screen = "map";
            return;
        }
        this.screen = "map";
    }
    mapHint(): string {
        const p = getPlayer();
        if (this.phase === "boss") return p.hintBoss;
        const row = getStage(this.stage);
        if (this.phase === "warmup") return row.hintWarmup;
        return row.hintOfficial;
    }
    fightTitle(): string {
        if (this.phase === "boss") return "鸡王挑战";
        if (this.phase === "warmup") return `第${this.stage}局 · 热身赛`;
        return `第${this.stage}局 · 正式赛`;
    }
    rng(): Rng {
        return new Rng(this.seed + this.stage * 100 + (this.phase === "warmup" ? 1 : this.phase === "official" ? 2 : 3));
    }
    private mergeBonus(extra: Partial<Stats>) {
        this.bonus = {
            maxHp: (this.bonus.maxHp ?? 0) + (extra.maxHp ?? extra.hp ?? 0),
            atk: (this.bonus.atk ?? 0) + (extra.atk ?? 0),
            def: (this.bonus.def ?? 0) + (extra.def ?? 0),
            spd: (this.bonus.spd ?? 0) + (extra.spd ?? 0),
            crit: (this.bonus.crit ?? 0) + (extra.crit ?? 0),
            revive: (this.bonus.revive ?? 0) + (extra.revive ?? 0),
            healPerTurn: (this.bonus.healPerTurn ?? 0) + (extra.healPerTurn ?? 0),
            lockHp: !!(this.bonus.lockHp || extra.lockHp),
            hp: 0
        };
    }
}
