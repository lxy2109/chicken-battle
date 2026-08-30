import { enemyToFighter, getPlayer, getStage, itemById, maxStage, playerTaunts, setById } from "./Catalog";
import { applySkinAppearance, buildStats, healFull, setPrice, shopStock } from "./EquipMath";
import { PartLevels, canUpgrade, partScale, upgradeBonus } from "./PartUpgrade";
import { rollBuffs, rollUpgrades } from "./RewardGen";
import { Rng } from "./Rng";
import {
    Appearance, EquipItem, FighterSnapshot, PartId, RewardOption, RunScreen, StagePhase, Stats,
    addPartial, defaultAppearance
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
    /** 各部位练到几级。属性加成和体型都从它现算，不另存一份。 */
    partLevels: PartLevels = {};
    /** 已经发过几次三选一，只用来错开摇牌的种子，免得每场摇出同样三张。 */
    rewardRolls = 0;
    /** 战后奖励与 buff 的三张牌，先发这一组。 */
    rewards: RewardOption[] = [];
    /** 部位强化的三张牌，奖励挑完再发这一组。 */
    upgrades: RewardOption[] = [];
    shopItems: EquipItem[] = [];
    seed: number;
    constructor(seed?: number) {
        this.seed = seed ?? (Date.now() % 100000);
    }
    playerFighter(): FighterSnapshot {
        const p = getPlayer();
        const look = applySkinAppearance(this.appearance, this.ownedIds);
        look.partScale = partScale(this.partLevels);
        return {
            name: p.name,
            appearance: look,
            stats: healFull(buildStats(this.ownedIds, addPartial(this.bonus, upgradeBonus(this.partLevels)))),
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
        }
        else if (win) {
            this.lastGoldGain = this.phase === "boss" ? getPlayer().bossGoldWin : getStage(this.stage).officialGoldWin;
            this.gold += this.lastGoldGain;
        }
        // 每场打完都发牌，输了也给，重来时手里好歹多点东西。
        // 只有打赢鸡王例外：那一场之后直接通关，发牌没有意义。
        if (!(this.phase === "boss" && win)) {
            // 两组牌各用一个种子，否则同一场里奖励和强化会摇出同样的顺序。
            const base = this.seed + this.rewardRolls * 131 + this.stage * 17;
            this.rewards = rollBuffs(this.stage, base);
            this.upgrades = rollUpgrades(this.stage, base + 7717, this.partLevels);
            this.rewardRolls += 1;
        }
        this.screen = "result";
    }
    afterResult() {
        if (this.phase === "boss" && this.lastWin) {
            this.screen = "ending";
            return;
        }
        this.stepReward();
    }
    /** 两组牌都发完了才离开三选一，中途留在原界面换下一组。 */
    private stepReward() {
        if (this.rewards.length > 0 || this.upgrades.length > 0) {
            this.screen = "reward";
            return;
        }
        this.afterReward();
    }
    /** 三选一之后去哪：赢了逛商店，输了回地图重来。 */
    afterReward() {
        if (this.phase === "warmup") {
            this.openShop();
            return;
        }
        if (this.phase === "official") {
            if (this.lastWin) {
                this.shopPending = true;
                this.openShop();
                return;
            }
            this.phase = "warmup";
            this.shopPending = false;
            this.screen = "map";
            return;
        }
        // 鸡王没打过，回地图再攒一攒
        this.screen = "map";
    }
    pickReward(id: string) {
        const fromBuff = this.rewards.find(v => v.id === id);
        const opt = fromBuff ?? this.upgrades.find(v => v.id === id);
        if (opt) {
            this.gold += opt.gold;
            // 部位强化只记等级，属性由等级现算；这里再 merge 一遍就成了双倍。
            if (opt.part) this.levelUp(opt.part);
            else this.mergeBonus(opt.stats);
        }
        this.dropCards(!!fromBuff);
    }
    skipReward() {
        this.dropCards(this.rewards.length > 0);
    }
    /** 收掉刚才那一组牌，再看还有没有下一组。 */
    private dropCards(buff: boolean) {
        if (buff) this.rewards = [];
        else this.upgrades = [];
        this.stepReward();
    }
    levelUp(part: PartId) {
        if (!canUpgrade(this.partLevels, part)) return;
        this.partLevels[part] = (this.partLevels[part] ?? 0) + 1;
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
        this.bonus = addPartial(this.bonus, extra);
    }
}
