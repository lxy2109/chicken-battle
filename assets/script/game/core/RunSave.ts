import { getRoute, itemById, setById } from "./Catalog";
import { shopStock } from "./EquipMath";
import { RunState } from "./RunState";

export const RUN_SAVE_KEY = "chicken_battle_save_v1";

export interface RunSaveData {
    version: 1 | 2 | 3;
    permanent: Pick<RunState, "gold" | "claimedGoldNodes" | "completedMaps" | "appearance" | "playerName" | "ownedIds" | "bonus" | "partLevels"> & { equippedIds?: string[]; hideEquippedAppearance?: boolean };
    progress: Pick<RunState, "routeNode" | "screen" | "lastWin" | "lastGoldGain" | "lastBattleNode" | "lastFirstClear" | "upgrades" | "rewards" | "rewardRolls" | "seed" | "shopLoadedAt"> & { shopItemIds: string[]; shopPending?: boolean };
}

/** 一个 JSON 同时写入养成与进度，避免金币已发放、首通标记尚未保存的半份存档。 */
export function encodeRun(run: RunState): string {
    const data: RunSaveData = {
        version: 3,
        permanent: {
            gold: run.gold, claimedGoldNodes: run.claimedGoldNodes, completedMaps: run.completedMaps,
            appearance: run.appearance, playerName: run.playerName, ownedIds: run.ownedIds,
            equippedIds: run.equippedIds, hideEquippedAppearance: run.hideEquippedAppearance,
            bonus: run.bonus, partLevels: run.partLevels
        },
        progress: {
            routeNode: run.routeNode, screen: run.screen, lastWin: run.lastWin, lastGoldGain: run.lastGoldGain,
            lastBattleNode: run.lastBattleNode, lastFirstClear: run.lastFirstClear,
            upgrades: run.upgrades, rewards: run.rewards, rewardRolls: run.rewardRolls, seed: run.seed,
            shopLoadedAt: run.shopLoadedAt, shopItemIds: run.shopItems.map(item => item.id), shopPending: run.shopPending
        }
    };
    return JSON.stringify(data);
}

/** 战斗不保存瞬时血量；退出后从同一节点的战前准备继续，包含 BOSS。 */
export function decodeRun(raw: string): RunState {
    const data: RunSaveData = JSON.parse(raw);
    const p = data?.permanent, q = data?.progress;
    let node = q && getRoute().find(n => n.id === q.routeNode);
    if (![1, 2, 3].includes(data?.version) || !p || !q || !node || !Number.isFinite(p.gold) || p.gold < 0
        || !Array.isArray(p.ownedIds) || !Array.isArray(p.claimedGoldNodes) || !Array.isArray(p.completedMaps)
        || !p.appearance?.colors || !p.partLevels || !p.bonus || typeof p.playerName !== "string"
        || !Array.isArray(q.upgrades) || !Array.isArray(q.rewards) || !Array.isArray(q.shopItemIds)
        || !getRoute().some(n => n.id === q.lastBattleNode) || !Number.isFinite(q.seed) || !Number.isFinite(q.rewardRolls)
        || !["customize", "map", "prebattle", "battle", "result", "reward", "shop", "ending"].includes(q.screen)) {
        throw new Error("本地存档格式无效或版本不兼容");
    }
    // 兼容旧版仍停在胜利节点、等待按钮推进的结算/强化存档。
    if (q.lastWin && (q.screen === "result" || q.screen === "reward") && node.id === q.lastBattleNode) {
        const next = getRoute().find(n => n.id === node!.id + 1);
        // 跨地图的 BOSS 胜利停在原图，等待玩家点击“前往新地图”。
        if (next && (next.mapId || 1) === (node.mapId || 1)) node = next;
    }
    // 旧商店节点迁移到已开放的下一战斗关；保留未展示的商店弹出与原货架。
    const oldShopId = data.version === 1 && [3, 5].includes((node.id - 1) % 6 + 1) ? node.id : 0;
    if (oldShopId) node = getRoute().find(n => n.id > oldShopId && n.kind !== "shop")!;
    // A completed old run still has the newly added final challenge available.
    if (data.version === 1 && p.completedMaps.includes(5)) {
        node = getRoute().find(n => n.encounter === "final")!;
        q.screen = "map";
        q.upgrades = [];
        q.rewards = [];
    }
    const run = new RunState(q.seed);
    run.gold = p.gold;
    run.claimedGoldNodes = p.claimedGoldNodes;
    run.completedMaps = p.completedMaps;
    run.appearance = p.appearance;
    run.playerName = p.playerName;
    run.ownedIds = p.ownedIds;
    // 确认装备仍存在于当前配置；损坏数据交给调用层提示并保留原存档。
    run.ownedIds.forEach(itemById);
    const savedSlot = (id: string) => {
        const item = itemById(id);
        return data.version < 3 && ["rookie", "helicopter", "brawler", "medic", "miser"].includes(item.setId)
            ? id.slice(id.lastIndexOf("_") + 1) : item.slot;
    };
    if (p.equippedIds !== undefined && (!Array.isArray(p.equippedIds)
        || p.equippedIds.some(id => !run.ownedIds.includes(id))
        || new Set(p.equippedIds.map(savedSlot)).size !== p.equippedIds.length)) {
        throw new Error("本地存档穿戴数据无效");
    }
    // 旧存档没有穿戴字段：每槽保留最后购买的一件；已手动卸下的空列表保持为空。
    run.equippedIds = p.equippedIds ?? run.ownedIds.filter((id, index, ids) =>
        !ids.slice(index + 1).some(other => itemById(other).slot === itemById(id).slot));
    run.hideEquippedAppearance = p.hideEquippedAppearance === true && run.equippedIds.length > 0;
    if (data.version < 3) {
        // Figma robes/accessories moved to body/neck. Keep ownership and the
        // last equipped item when two formerly different slots now coincide.
        run.equippedIds = run.equippedIds.filter((id, index, ids) =>
            !ids.slice(index + 1).some(other => itemById(other).slot === itemById(id).slot));
    }
    run.bonus = p.bonus;
    run.partLevels = p.partLevels;
    for (const opt of q.upgrades) {
        if (opt.part) opt.nextLevel = (run.partLevels[opt.part] ?? 0) + 1;
    }
    run.routeNode = node.id;
    run.stage = node.id;
    run.phase = node.kind;
    run.screen = q.screen === "battle" ? "prebattle" : q.screen;
    run.lastWin = q.lastWin;
    run.lastGoldGain = q.lastGoldGain;
    run.lastBattleNode = q.lastBattleNode;
    run.lastFirstClear = q.lastFirstClear;
    run.upgrades = q.upgrades;
    run.rewards = q.rewards;
    run.rewardRolls = q.rewardRolls;
    run.shopLoadedAt = oldShopId && q.shopLoadedAt === oldShopId ? node.id : q.shopLoadedAt;
    run.shopItems = q.shopItemIds.map(itemById).filter(item => !run.ownedIds.includes(item.id));
    if (data.version === 1 && run.shopItems.some(item => setById(item.setId).legacy)) {
        run.shopItems = shopStock(run.routeNode, run.ownedIds);
    }
    if (data.version === 2) run.shopItems = run.shopItems.filter(item => !setById(item.setId).legacy);
    run.shopPending = oldShopId ? q.screen === "result" || q.screen === "reward" : (q.shopPending ?? false);
    return run;
}

export interface SaveStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export class RunSaveStore {
    constructor(private storage: SaveStorage) { }

    load(): RunState {
        const raw = this.storage.getItem(RUN_SAVE_KEY);
        return raw ? decodeRun(raw) : new RunState();
    }

    save(run: RunState) {
        this.storage.setItem(RUN_SAVE_KEY, encodeRun(run));
    }

    clear() {
        this.storage.removeItem(RUN_SAVE_KEY);
    }
}
