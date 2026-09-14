import { MAPS, enemyToFighter, getPlayer, getRoute, itemById, playerTaunts, routeNode, setById } from "./Catalog";
import { applySkinAppearance, buildStats, healFull, setPrice, shopStock } from "./EquipMath";
import { PartLevels, canUpgrade, partScale, upgradeBonus } from "./PartUpgrade";
import { rollUpgrades } from "./RewardGen";
import { Rng } from "./Rng";
import {
    Appearance, EquipItem, FighterSnapshot, PartId, RewardOption, RouteNode, RunScreen, StagePhase,
    Stats, addPartial, defaultAppearance
} from "./Types";

/**
 * 一局的唯一流程状态。
 *
 * 每图五轮热身与一场正式赛，五图后挑战坤坤；商店只触发弹出，不占关卡进度。
 * 战斗结束即更新并保存进度；结算页展示金币，之后选择强化（BOSS 胜利除外）。
 * 商店货架由 EquipMath 固定生成，不存在刷新或随机换货。
 */
export class RunState {
    gold = 0;
    /** 首通领取记录和大关通关记录不参与正式赛战败回退。 */
    claimedGoldNodes: number[] = [];
    completedMaps: number[] = [];
    lastBattleNode = 1;
    lastFirstClear = false;
    /** 由本地存档适配层订阅；逻辑测试不依赖引擎或浏览器。 */
    onChanged?: () => void;
    /** 全局路线节点 id。`stage` 保留为旧界面/存档的兼容别名。 */
    routeNode = 1;
    stage = 1;
    phase: StagePhase = "battle";
    shopPending = false;
    lastWin = false;
    lastGoldGain = 0;
    screen: RunScreen = "customize";
    appearance: Appearance = defaultAppearance();
    /** 自定义页的名称只属于本局，不修改 Player 配表。 */
    playerName = "无名鸡";
    ownedIds: string[] = [];
    /** 背包与穿戴分开；同一装备槽最多一件。 */
    equippedIds: string[] = [];
    bonus: Partial<Stats> = {};
    partLevels: PartLevels = {};
    rewardRolls = 0;
    /** 原型没有独立的战后 buff 池；保留字段以兼容旧预制体/存档，但新流程为空。 */
    rewards: RewardOption[] = [];
    upgrades: RewardOption[] = [];
    shopItems: EquipItem[] = [];
    shopLoadedAt = 0;
    seed: number;

    constructor(seed?: number) {
        this.seed = seed ?? (Date.now() % 100000);
    }

    playerFighter(): FighterSnapshot {
        const look = applySkinAppearance(this.appearance, this.equippedIds);
        look.partScale = partScale(this.partLevels);
        return {
            name: this.playerName || getPlayer().name,
            appearance: look,
            stats: healFull(buildStats(this.equippedIds, addPartial(this.bonus, upgradeBonus(this.partLevels)))),
            taunts: this.taunts()
        };
    }

    enemyFighter(): FighterSnapshot {
        const node = this.currentRoute();
        const id = node.enemyId || getPlayer().bossEnemyId;
        return enemyToFighter(id);
    }

    currentRoute(): RouteNode {
        return routeNode(this.routeNode);
    }

    route(): RouteNode[] {
        return getRoute().filter(node => (node.mapId || 1) === this.currentMap().id && node.kind !== "shop");
    }

    currentMap() {
        return MAPS.find(map => map.id === (this.currentRoute().mapId || 1))!;
    }

    get nextMap() {
        const map = this.currentMap();
        return this.currentRoute().kind === "boss" && this.completedMaps.includes(map.id)
            ? MAPS.find(next => next.id === map.id + 1) : undefined;
    }

    enterNextMap() {
        if (this.screen !== "map" || !this.nextMap) return false;
        this.advanceRoute();
        this.shopPending = false;
        this.onChanged?.();
        return true;
    }

    confirmAppearance(appearance: Appearance) {
        this.appearance = { face: appearance.face, colors: { ...appearance.colors } };
        this.screen = "map";
        this.onChanged?.();
    }

    setPlayerName(name: string) {
        const clean = name.trim().slice(0, 12);
        if (clean) this.playerName = clean;
        this.onChanged?.();
    }

    enterFight() {
        if (this.screen === "result" || this.screen === "reward") return;
        if ((this.completedMaps.includes(this.currentMap().id) && this.currentRoute().encounter !== "final") || this.upgrades.length > 0) return;
        if (this.currentRoute().encounter === "final" && this.claimedGoldNodes.includes(this.routeNode)) return;
        this.shopPending = false;
        if (this.phase === "battle" || this.phase === "boss") this.screen = "prebattle";
        this.onChanged?.();
    }

    startBattle() {
        if (this.screen === "result" || this.screen === "reward") return;
        if ((this.completedMaps.includes(this.currentMap().id) && this.currentRoute().encounter !== "final") || this.upgrades.length > 0) return;
        if (this.currentRoute().encounter === "final" && this.claimedGoldNodes.includes(this.routeNode)) return;
        if (this.phase === "battle" || this.phase === "boss") this.screen = "battle";
        this.onChanged?.();
    }

    settle(win: boolean) {
        // 结算回调重复到达时，金币和强化牌都只能产生一次。
        if (this.screen === "result" || this.screen === "reward"
            || (this.completedMaps.includes(this.currentMap().id) && this.currentRoute().encounter !== "final")
            || (this.currentRoute().encounter === "final" && this.claimedGoldNodes.includes(this.routeNode))) return;
        this.lastWin = win;
        const node = this.currentRoute();
        this.lastBattleNode = node.id;
        this.lastFirstClear = win && !this.claimedGoldNodes.includes(node.id);
        const equippedStats = buildStats(this.equippedIds);
        this.lastGoldGain = this.lastFirstClear ? Math.floor((node.goldWin || 0) * (1 + (equippedStats.goldBonus || 0))) : 0;
        if (this.lastFirstClear) this.claimedGoldNodes.push(node.id);
        this.gold += this.lastGoldGain;
        this.shopPending = false;
        // 结算只显示金币；强化牌在点击“获得强化”后才进入下一屏。
        this.rewards = [];
        if (!win && node.kind === "boss") {
            const grown = Object.keys(this.partLevels) as PartId[];
            const keep = equippedStats.retainGrowth && grown.length ? this.rng().pick(grown) : undefined;
            this.partLevels = keep ? { [keep]: this.partLevels[keep] } : {};
            this.bonus = {};
        }
        if (!(this.phase === "boss" && win)) {
            this.upgrades = rollUpgrades(this.routeNode, this.seed + this.rewardRolls * 131, this.partLevels);
            this.rewardRolls += 1;
        }
        else {
            this.upgrades = [];
        }
        if (node.kind === "boss") {
            if (win) {
                if (!this.completedMaps.includes(this.currentMap().id)) this.completedMaps.push(this.currentMap().id);
                if (node.encounter === "final") {
                    for (const id of setById("champion").pieceIds) if (!this.ownedIds.includes(id)) this.ownedIds.push(id);
                }
            }
            else if (node.encounter !== "final") {
                const first = this.route()[0];
                this.routeNode = first.id;
                this.stage = first.id;
                this.phase = first.kind;
                this.shopLoadedAt = 0;
                this.shopItems = [];
            }
        }
        // 进度与首通金币一起落盘，不依赖结算或强化页按钮。
        if (win && !this.nextMap) this.advanceRoute();
        this.screen = "result";
        this.onChanged?.();
    }

    afterResult() {
        if (this.screen !== "result") return;
        if (routeNode(this.lastBattleNode).kind === "boss" && this.lastWin) {
            this.screen = routeNode(this.lastBattleNode).encounter === "final" ? "ending" : "map";
            this.onChanged?.();
            return;
        }
        this.stepReward();
        this.onChanged?.();
    }

    private stepReward() {
        if (this.rewards.length > 0 || this.upgrades.length > 0) {
            this.screen = "reward";
            return;
        }
        this.afterReward();
    }

    /** 进度已在结算时更新，强化完成后只打开对应界面。 */
    private afterReward() {
        if (this.shopPending) this.openShop();
        else this.screen = "map";
    }

    private advanceRoute() {
        const following = getRoute().filter(node => node.id > this.routeNode);
        const next = following.find(node => node.kind !== "shop");
        if (!next) return;
        this.shopPending = !!this.currentRoute().shopAfter || following.some(node => node.id < next.id && node.kind === "shop");
        this.routeNode = next.id;
        this.stage = this.routeNode;
        this.phase = next.kind;
    }

    pickReward(id: string) {
        if (this.screen !== "reward") return false;
        const fromBuff = this.rewards.find(v => v.id === id);
        const opt = fromBuff ?? this.upgrades.find(v => v.id === id);
        if (!opt) return false;
        if (this.lastFirstClear) this.gold += opt.gold;
        if (opt.part) this.levelUp(opt.part);
        else this.mergeBonus(opt.stats);
        this.dropCards(!!fromBuff);
        this.onChanged?.();
        return true;
    }

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
        this.shopPending = false;
        // 同一节点重复打开也不能重新摇货；买掉的条目只会从固定货架上移除。
        if (this.shopLoadedAt !== this.routeNode) {
            this.shopItems = shopStock(this.routeNode, this.ownedIds);
            this.shopLoadedAt = this.routeNode;
        }
        this.screen = "shop";
        this.onChanged?.();
    }

    buyItem(id: string): boolean {
        const item = itemById(id);
        const set = setById(item.setId);
        const price = this.itemPrice(id);
        if (set.rewardOnly || set.legacy || set.unlockMap > this.currentMap().id
            || this.ownedIds.indexOf(id) >= 0 || this.gold < price) return false;
        this.gold -= price;
        this.ownedIds.push(id);
        this.shopItems = this.shopItems.filter(shopItem => shopItem.id !== id);
        this.onChanged?.();
        return true;
    }

    buySet(setId: string): boolean {
        const def = setById(setId);
        const missing = def.pieceIds.filter(id => this.ownedIds.indexOf(id) < 0);
        const price = this.setPrice(setId);
        if (def.rewardOnly || def.legacy || def.unlockMap > this.currentMap().id || missing.length === 0 || this.gold < price) return false;
        this.gold -= price;
        for (const id of missing) this.ownedIds.push(id);
        const bought = new Set(missing);
        this.shopItems = this.shopItems.filter(shopItem => !bought.has(shopItem.id));
        this.onChanged?.();
        return true;
    }

    itemPrice(id: string): number {
        return Math.floor(itemById(id).price * (1 - (buildStats(this.equippedIds).shopDiscount || 0)));
    }

    setPrice(id: string): number {
        return setPrice(id, this.ownedIds, buildStats(this.equippedIds).shopDiscount || 0);
    }

    equipItem(id: string): boolean {
        if (!this.ownedIds.includes(id) || this.screen === "battle") return false;
        const equipped = this.equippedIds.includes(id);
        const slot = itemById(id).slot;
        this.equippedIds = this.equippedIds.filter(other => itemById(other).slot !== slot);
        if (!equipped) this.equippedIds.push(id);
        this.onChanged?.();
        return true;
    }

    equipSet(setId: string): boolean {
        const pieces = setById(setId).pieceIds;
        if (this.screen === "battle" || !pieces.every(id => this.ownedIds.includes(id))) return false;
        const equipped = pieces.every(id => this.equippedIds.includes(id));
        const slots = pieces.map(id => itemById(id).slot);
        this.equippedIds = this.equippedIds.filter(id => !slots.includes(itemById(id).slot));
        if (!equipped) this.equippedIds.push(...pieces);
        this.onChanged?.();
        return true;
    }

    leaveShop() {
        if (this.screen !== "shop") return;
        this.shopPending = false;
        this.screen = "map";
        this.onChanged?.();
    }

    mapHint(): string {
        if (this.nextMap) return `本地图已通关，点击下方前往${this.nextMap.name}`;
        const node = this.currentRoute();
        if (node.kind === "boss") return node.encounter === "final" ? "全村注视着你：挑战鸡王坤坤！" : "赢下正式赛，继续争霸之路";
        return this.claimedGoldNodes.includes(node.id) ? "本关首通金币已领取" : `首通奖励 ${node.goldWin || 0} 金币`;
    }

    fightTitle(): string {
        const node = this.currentRoute();
        return node.kind === "boss" ? "鸡王挑战" : `节点 ${node.id} · ${node.name}`;
    }

    rng(): Rng {
        return new Rng(this.seed + this.routeNode * 100 + (this.phase === "boss" ? 3 : 1));
    }

    private taunts(): string[] {
        return playerTaunts();
    }

    private mergeBonus(extra: Partial<Stats>) {
        this.bonus = addPartial(this.bonus, extra);
    }
}
