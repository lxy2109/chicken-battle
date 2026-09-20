import fs from "fs";
import path from "path";
import { BattleBrain } from "../../assets/script/game/battle/BattleBrain";
import { AiFighter, decideAction, decide } from "../../assets/script/game/domain/BattleAI";
import { BattleSession, enemySkillsForEncounter } from "../../assets/script/game/domain/BattleSession";
import { DanmakuPool } from "../../assets/script/game/domain/Danmaku";
import { Rng } from "../../assets/script/game/domain/Rng";
import { enemyCombatProfile, PLAYER_SKILLS, SKILL_UNLOCK_MAP, skillAttackValue, skillCooldownOf, skillsUnlockedAt, skillsUnlockedOnMap, stageMood, STYLE_OPENING } from "../../assets/script/game/domain/BattleStyle";
import { getItems, getRoute, getSets } from "../../assets/script/game/domain/Catalog";
import { bindTables } from "../../assets/script/game/domain/Config";
import { gameNumber } from "../../assets/script/game/domain/GameConfig";
import { buildStats, combatPower, setPrice } from "../../assets/script/game/domain/EquipMath";
import { upgradeOf } from "../../assets/script/game/domain/PartUpgrade";
import { rollUpgrades } from "../../assets/script/game/domain/RewardGen";
import { RunState } from "../../assets/script/game/domain/RunState";
import { decodeRun, encodeRun, RUN_SAVE_KEY, RunSaveStore } from "../../assets/script/game/domain/RunSave";
import { Appearance, defaultAppearance, StrikeStyle } from "../../assets/script/game/domain/Types";
import { bindGuideRun, isGuideDone, markGuideDone, resetGuideProgress } from "../../assets/script/game/ui/guide/GuideProgress";

/** 直接跑源码时在脚本旁边，编译到 temp 再跑时只能从工作目录找。 */
function tableDir(): string {
    const tries = [
        path.resolve(__dirname, "../../assets/bundle/config/game"),
        path.resolve(process.cwd(), "assets/bundle/config/game")
    ];
    const hit = tries.find(p => fs.existsSync(p));
    if (!hit) throw new Error("找不到配表目录 assets/bundle/config/game");
    return hit;
}

function loadTables() {
    const dir = tableDir();
    const names = ["Story", "Taunt", "Player", "Stage", "Route", "Enemy", "Item", "Set", "Part", "Reward", "Danmaku", "DanmakuRule", "Map", "GameRule", "Language", "UiText"];
    const all: Record<string, any> = {};
    for (const name of names) {
        const full = path.join(dir, name + ".json");
        all[name] = JSON.parse(fs.readFileSync(full, "utf8"));
    }
    bindTables(all);
}

function assert(cond: boolean, msg: string) {
    if (!cond) throw new Error(msg);
}

function run() {
    loadTables();
    const fail: string[] = [];
    let total = 0;
    const WARMUPS = [1, 2, 3, 3, 5];
    const nodeBy = (pred: (n: ReturnType<typeof getRoute>[number]) => boolean) => {
        const node = getRoute().find(pred);
        if (!node) throw new Error("找不到路线节点");
        return node;
    };
    const mapStart = (map: number) => nodeBy(n => n.mapId === map && n.encounter !== "final").id;
    const mapBoss = (map: number) => nodeBy(n => n.mapId === map && n.encounter === "official").id;
    const kunId = () => nodeBy(n => n.encounter === "final").id;
    const mapKinds = (map: number) => Array(WARMUPS[map - 1]).fill("battle").concat("boss").join(",");
    const mapLength = (map: number) => WARMUPS[map - 1] + 1 + (map === 5 ? 1 : 0);
    const ok = (name: string, fn: () => void) => {
        total += 1;
        try {
            fn();
            console.log("PASS", name);
        }
        catch (e: any) {
            fail.push(name + ": " + e.message);
            console.log("FAIL", name, e.message);
        }
    };

    ok("配置表可读", () => {
        assert(getItems().length >= 16, "应有散件");
        assert(getSets().length >= 4, "应有套装");
        assert(getRoute().length === 20, "五图按 1/2/3/3/5 热身加正式赛和最终挑战，共20场");
        for (let mapId = 1; mapId <= 5; mapId++) {
            assert(getRoute().filter(n => n.mapId === mapId && n.encounter !== "final").map(n => n.kind).join(",") === mapKinds(mapId), `第${mapId}图应为${WARMUPS[mapId - 1]}轮热身加正式赛`);
        }
    });
    ok("自定义外观", () => {
        const run = new RunState(1);
        const a: Appearance = defaultAppearance();
        a.face = "cute";
        a.colors.body = "#2A9D8F";
        run.confirmAppearance(a);
        assert(run.screen === "map", "应进入村口");
        assert(run.playerFighter().appearance.face === "cute", "表情应保存");
        run.setPlayerName("  呆头王鸡  ");
        assert(run.playerFighter().name === "呆头王鸡", "自定义名称应进入战斗快照");
    });

    ok("线性路线失败留在当前节点", () => {
        const run = new RunState(2);
        run.confirmAppearance(defaultAppearance());
        run.enterFight();
        run.settle(false);
        run.afterResult();
        assert(run.screen === "reward", "战斗结束先进入强化");
        run.pickReward(run.upgrades[0].id);
        assert(run.routeNode === 1 && run.phase === "battle", "失败不能跳过当前节点");
        assert(run.screen === "map", "失败强化后回到路线");
    });

    ok("商店货架固定不补货", () => {
        const run = new RunState(5);
        run.confirmAppearance(defaultAppearance());
        run.routeNode = 4;
        run.gold = 1000;
        run.openShop();
        const first = run.shopItems.map(item => item.id);
        assert(first.length === 4, "商店应有四个固定部位入口");
        assert(run.buyItem(first[0]), "第一件应可购买");
        run.openShop();
        assert(!run.shopItems.some(item => item.id === first[0]), "买掉的货品不应被另一件补位");
    });

    ok("统一商店入口随时可用，反复开关和重开不改变关卡", () => {
        for (const node of getRoute().filter(node => node.kind !== "shop")) {
            let run = new RunState(44);
            run.routeNode = node.id; run.stage = node.id; run.phase = node.kind; run.screen = "map";
            for (let i = 0; i < 2; i++) {
                run.openShop();
                run = decodeRun(encodeRun(run));
                assert(run.routeNode === node.id && run.phase === node.kind && run.screen === "shop", "商店读档不锁关或跳关");
                run.leaveShop(); run.leaveShop();
                assert(run.routeNode === node.id && String(run.screen) === "map" && !run.shopPending, "关闭只返回地图");
            }
            run.enterFight();
            assert(run.screen === "prebattle" && run.claimedGoldNodes.length === 0, "逛店不影响当前关卡挑战资格或首通账本");
        }
        const warmups = [1, 2, 3, 3, 5];
        for (let id = 1; id <= 5; id++) {
            const prefab = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), `assets/bundle/gui/map/map_${id}.prefab`), "utf8"));
            // 根节点名是 map_1…map_5，兼容旧名 map。
            const root = prefab.find((obj: any) => obj.__type__ === "cc.Node" && obj._parent === null
                && (obj._name === "map" || obj._name === `map_${id}`));
            assert(!!root?._children, `地图${id}预制体应有根节点`);
            const child = (ref: any) => prefab[ref.__id__]._name;
            const names = root._children.map(child);
            const shops = names.filter((name: string) => /^BtnShop/.test(name));
            const stages = names.filter((name: string) => /^BtnStage\d+$/.test(name));
            assert(shops.length === 1 && shops[0] === "BtnShop", `地图${id}仅有统一商店入口`);
            assert(stages.length === warmups[id - 1] && names.includes("BtnBoss"), `地图${id}热身节点应为 ${warmups[id - 1]} 个`);
        }
    });

    ok("旧商店节点存档恢复下一战斗关，并保留货架和待弹出事件", () => {
        for (const shop of getRoute().filter(n => n.id < kunId() && [3, 5].includes((n.id - 1) % 6 + 1))) {
            const run = new RunState(45);
            run.routeNode = shop.id + 1; run.phase = getRoute().find(node => node.id === run.routeNode)!.kind;
            run.gold = 500; run.openShop(); run.buyItem(run.shopItems[0].id);
            const stock = run.shopItems.map(item => item.id).join(",");
            const old = JSON.parse(encodeRun(run));
            old.version = 1;
            old.progress.routeNode = shop.id; old.progress.shopLoadedAt = shop.id;
            delete old.progress.shopPending;
            const restored = decodeRun(JSON.stringify(old));
            assert(restored.routeNode === shop.id + 1 && restored.currentRoute().kind !== "shop", "旧进度迁移到下一战斗关");
            restored.leaveShop(); restored.openShop();
            assert(restored.shopItems.map(item => item.id).join(",") === stock, "迁移后不补货");
            assert(restored.gold === run.gold && restored.ownedIds.join(",") === run.ownedIds.join(","), "购买与金币不变");
            old.progress.screen = "result";
            const pending = decodeRun(JSON.stringify(old));
            assert(pending.shopPending, "旧结算后的未弹出事件保留");
            pending.afterResult();
            assert(pending.screen === "shop" && !pending.shopPending && pending.routeNode === shop.id + 1, "商店只弹出一次且关卡已开放");
        }
    });

    ok("胜利先开放下一关，强化后弹出商店", () => {
        const run = new RunState(3);
        run.confirmAppearance(defaultAppearance());
        run.settle(true);
        run.afterResult();
        assert(run.screen === "reward", "战斗胜利先进入强化");
        assert(run.routeNode === mapBoss(1) && run.phase === "boss" && run.shopPending, "首图唯一小怪胜利即开放正式赛并记录弹出");
        assert(run.gold === 168, "首通金币应刚好等于首图套装折后价");
        run.pickReward(run.upgrades[0].id);
        assert(run.routeNode === mapBoss(1) && run.phase === "boss", "弹出商店不占用关卡进度");
        assert(run.screen === "shop" && !run.shopPending, "商店自动弹出一次");
        assert(run.setPrice("rookie") === run.gold && run.buySet("rookie"), "战后金币刚好够买一套诸葛亮套");
        assert(run.gold === 0 && run.ownedIds.length === 4, "买完套装金币清零且四件入库");
        run.leaveShop();
        run.enterFight();
        assert(String(run.screen) === "prebattle" && run.routeNode === mapBoss(1), "无需购买便可挑战正式赛");
    });

    ok("商店套装折扣与2/4件加成", () => {
        const set = getSets().find(s => s.id === "iron_beak")!;
        const items = getItems();
        const raw = set.pieceIds.reduce((s, id) => s + items.find(i => i.id === id)!.price, 0);
        const disc = setPrice("iron_beak");
        assert(disc < raw, "整套应有折扣");
        const two = buildStats(["iron_comb", "iron_head"]);
        const four = buildStats(set.pieceIds);
        assert(four.atk > two.atk, "4件加成应高于2件");
    });

    ok("外观特殊属性进入数值", () => {
        const s = buildStats(["kun_face", "kun_comb", "kun_body"]);
        assert(s.healPerTurn >= 8, "应有局内回血");
        assert(s.revive >= 1, "应有复活");
        assert(s.lockHp === true, "应有锁血");
    });

    ok("买入只进背包，穿戴后才显示装备并提供属性", () => {
        const run = new RunState(40);
        const base = run.playerFighter();
        run.gold = 1000;
        run.ownedIds.push(...getSets().find(s => s.id === "iron_beak")!.pieceIds);
        assert(JSON.stringify(run.playerFighter().stats) === JSON.stringify(base.stats), "未穿戴不加属性");
        assert(Object.keys(run.playerFighter().appearance.equipment!).length === 0, "购买不自动改变外观");
        assert(run.equipSet("iron_beak"), "已购整套可以穿戴");
        const pieces = getSets().find(set => set.id === "iron_beak")!.pieceIds;
        assert(JSON.stringify(run.playerFighter().stats) === JSON.stringify(buildStats(pieces)), "只计算穿戴件及套装加成");
        assert(run.playerFighter().appearance.equipment?.body === "iron_body", "普通装备也传入角色渲染");
        run.equipSet("iron_beak");
        assert(run.equippedIds.length === 0 && pieces.every(id => run.ownedIds.includes(id)), "再次点击卸下但不删除购买记录");
        assert(JSON.stringify(run.playerFighter().stats) === JSON.stringify(base.stats), "卸下取消属性和套装加成");
    });

    ok("同槽装备替换、未拥有不能穿戴，套装按穿戴件数触发", () => {
        const run = new RunState(41);
        assert(!run.equipItem("iron_head") && !run.equipSet("iron_beak"), "未购买不能装备");
        run.gold = 1000; run.ownedIds.push(...getSets().find(s => s.id === "iron_beak")!.pieceIds); run.ownedIds.push(...getSets().find(s => s.id === "stone_crown")!.pieceIds);
        run.equipItem("iron_head"); run.equipItem("iron_comb");
        assert(JSON.stringify(run.playerFighter().stats) === JSON.stringify(buildStats(["iron_head", "iron_comb"])), "背包有整套但只触发两件加成");
        run.equipItem("stone_head");
        assert(!run.equippedIds.includes("iron_head") && run.equippedIds.includes("stone_head"), "同槽自动替换");
        assert(JSON.stringify(run.playerFighter().stats) === JSON.stringify(buildStats(["iron_comb", "stone_head"])), "两套各一件不触发套装加成");
        run.equipSet("iron_beak"); run.equipSet("stone_crown");
        const slots = run.equippedIds.map(id => getItems().find(item => item.id === id)!.slot);
        assert(new Set(slots).size === slots.length && !run.equippedIds.includes("iron_body"), "切整套也遵守槽位互斥");
    });

    ok("穿戴实时存档，战败保留装备，卸下可恢复原外观", () => {
        const run = new RunState(42);
        run.gold = 1000; run.ownedIds.push(...getSets().find(s => s.id === "kunkun")!.pieceIds);
        const base = run.playerFighter().appearance;
        let saved = "";
        run.onChanged = () => { saved = encodeRun(run); };
        run.equipSet("kunkun");
        const restored = decodeRun(saved);
        assert(restored.playerFighter().appearance.colors.body === "#1D1D1D" && restored.playerFighter().stats.lockHp, "穿戴外观和特殊属性随存档恢复");
        restored.routeNode = mapBoss(1); restored.phase = "boss"; restored.screen = "battle";
        assert(!restored.equipItem("kun_body"), "战斗快照期间不能换装");
        restored.settle(false);
        assert(restored.equippedIds.length === 4 && restored.routeNode === mapStart(1), "BOSS失败不丢穿戴状态");
        restored.equipSet("kunkun");
        assert(JSON.stringify(restored.playerFighter().appearance) === JSON.stringify(base), "卸下恢复自定义配色且去掉装备图");
        assert(decodeRun(encodeRun(restored)).equippedIds.length === 0, "空穿戴不能被读档自动穿回");
    });

    ok("穿上隐藏保留套装效果并显示原始染色", () => {
        const run = new RunState(46);
        const pieces = getSets().find(s => s.id === "rookie")!.pieceIds;
        run.ownedIds.push(...pieces);
        const dyed = run.playerFighter().appearance;
        assert(!run.toggleHideAppearance(), "未穿戴不能隐藏");
        assert(run.equipSet("rookie"), "已购套装可穿戴");
        const worn = run.playerFighter();
        assert(worn.appearance.equipment?.head === "rookie_head", "默认显示套装外观");
        assert(run.toggleHideAppearance() && run.hideEquippedAppearance, "可隐藏已穿外观");
        const hidden = run.playerFighter();
        assert(!hidden.appearance.equipment?.head && JSON.stringify(hidden.appearance.colors) === JSON.stringify(dyed.colors), "隐藏后仍是自定义染色");
        assert(JSON.stringify(hidden.stats) === JSON.stringify(worn.stats), "隐藏不取消套装属性");
        const restored = decodeRun(encodeRun(run));
        assert(restored.hideEquippedAppearance && JSON.stringify(restored.playerFighter().stats) === JSON.stringify(worn.stats), "隐藏状态随存档恢复");
        assert(restored.equipSet("rookie") && !restored.hideEquippedAppearance, "卸下后取消隐藏");
    });

    ok("旧存档迁移每槽一件，非法穿戴存档不静默采用", () => {
        const run = new RunState(43);
        run.ownedIds = ["iron_head", "stone_head", "iron_body"];
        const old = JSON.parse(encodeRun(run));
        delete old.permanent.equippedIds;
        assert(decodeRun(JSON.stringify(old)).equippedIds.join(",") === "stone_head,iron_body", "旧已购列表迁移为每槽最后一件");
        for (const ids of [["kun_body"], ["iron_head", "stone_head"]]) {
            old.permanent.equippedIds = ids;
            let rejected = false;
            try { decodeRun(JSON.stringify(old)); } catch { rejected = true; }
            assert(rejected, "拒绝未拥有装备和同槽多件");
        }
    });

    ok("Figma装备部位迁移保留旧持有物并消除新槽冲突", () => {
        const run = new RunState(43);
        run.ownedIds = ["iron_body", "rookie_neck", "rookie_head"];
        run.equippedIds = run.ownedIds.slice();
        const old = JSON.parse(encodeRun(run));
        old.version = 2;
        const restored = decodeRun(JSON.stringify(old));
        assert(restored.ownedIds.length === 3, "改部位不丢失持有装备");
        assert(restored.equippedIds.join(",") === "rookie_neck,rookie_head", "新身体槽保留最后穿戴的道袍");
        assert(JSON.parse(encodeRun(restored)).version === 3, "保存升级后的版本");
    });

    ok("决战前商店弹出时鸡王已开放，返回不额外推进", () => {
        const run = new RunState(4);
        run.confirmAppearance(defaultAppearance());
        run.routeNode = getRoute().filter(n => n.mapId === 1 && n.encounter === "warmup").slice(-1)[0].id;
        run.settle(true);
        assert(run.routeNode === mapBoss(1) && run.phase === "boss", "末轮热身胜利即开放正式赛");
        run.afterResult();
        run.pickReward(run.upgrades[0].id);
        assert(run.screen === "shop", "决战前仍弹出商店");
        run.leaveShop();
        assert(run.routeNode === mapBoss(1) && run.phase === "boss", "商店后应是本图正式赛");
        assert(run.enemyFighter().name === "菜鸡", "第一图正式赛对手应是菜鸡");
        run.settle(true);
        run.afterResult();
        assert(run.screen === "map" && run.routeNode === mapBoss(1) && run.nextMap?.id === 2, "首图正式赛胜利后留在原图等待点击");
        assert(run.enterNextMap() && run.routeNode === mapStart(2), "点击前往新地图后进入第二图");
        assert(run.rewards.length === 0 && run.upgrades.length === 0, "赢了鸡王直接通关，不该再发牌");
    });

    ok("五图逐图推进且保留养成，最终BOSS才结局", () => {
        const run = new RunState(24);
        run.confirmAppearance(defaultAppearance());
        run.gold = 100;
        run.ownedIds = ["iron_head"];
        run.levelUp("head");
        let guard = 0;
        while (run.screen !== "ending" && guard++ < 60) {
            const map = run.currentMap().id;
            assert(run.route().length === mapLength(map) && run.route().every(n => n.mapId === map && n.kind !== "shop"), "每图按 1/2/3/3/5 热身加正式赛，末图额外开放最终挑战");
            if (run.screen === "shop") {
                run.leaveShop();
            } else if (run.nextMap) {
                assert(run.enterNextMap(), "通关后由按钮推进新地图");
            } else {
                run.settle(true);
                run.afterResult();
                if (run.screen === "reward") run.pickReward(run.upgrades[0].id);
            }
        }
        assert(run.screen === "ending" && run.routeNode === kunId(), "只有最终坤坤挑战胜利才总通关");
        assert(run.ownedIds.includes("iron_head") && (run.partLevels.head || 0) >= 1 && run.gold > 100, "换图保留装备强化金币");
        const retry = new RunState(25);
        retry.routeNode = mapBoss(2);
        retry.phase = "boss";
        retry.screen = "battle";
        retry.settle(false);
        retry.afterResult();
        retry.pickReward(retry.upgrades[0].id);
        assert(retry.routeNode === mapStart(2) && String(retry.screen) === "map", "第二图BOSS失败从第二图第一小关重来");
    });

    ok("未结算时关闭游戏不算打过，小关与BOSS均从战前重打", () => {
        for (const id of [1, mapStart(2), mapBoss(1), mapBoss(2), mapBoss(5)]) {
            const run = new RunState(31);
            run.routeNode = id;
            run.stage = id;
            run.phase = getRoute().find(n => n.id === id)!.kind;
            run.gold = 100;
            run.ownedIds = ["iron_head"];
            run.partLevels.head = 2;
            run.screen = "battle";
            const permanent = JSON.stringify(JSON.parse(encodeRun(run)).permanent);
            const restored = decodeRun(encodeRun(run));
            assert(restored.routeNode === id && restored.screen === "prebattle", `节点${id}退出不能丢失`);
            assert(restored.phase === run.phase, "恢复节点类型");
            assert(JSON.stringify(JSON.parse(encodeRun(restored)).permanent) === permanent, "未结束的对局不发奖励、不改养成或通关记录");
            restored.startBattle();
            assert(String(restored.screen) === "battle" && restored.routeNode === id, "重开仍挑战同一关");
        }
    });

    ok("小关结束自动保存下一节点与待选强化，无需点击结算按钮", () => {
        // 3=二图热身无店，1=首图唯一热身带店，4=二图末热身带店
        for (const id of [3, 1, 4]) {
            const run = new RunState(37);
            run.routeNode = id; run.stage = id; run.screen = "battle";
            let saved = "";
            run.onChanged = () => { saved = encodeRun(run); };
            run.settle(true);
            const restored = decodeRun(saved);
            const node = getRoute().find(n => n.id === id)!;
            const next = getRoute().find(n => n.id > id && n.kind !== "shop")!.id;
            assert(restored.routeNode === next && restored.stage === next, "胜利回调已保存下一战斗关");
            assert(restored.screen === "result" && restored.upgrades.length === 3 && restored.claimedGoldNodes.includes(id), "结算结果与待选强化一并保留");
            restored.afterResult();
            restored.pickReward(restored.upgrades[0].id);
            assert(restored.routeNode === next, "确认强化不能再次推进");
            assert(String(restored.screen) === (node.shopAfter ? "shop" : "map"), "恢复待选强化后保留商店弹出");
        }
    });

    ok("未选择强化不能继续，退出恢复原三张，只生效一次", () => {
        const run = new RunState(32);
        run.confirmAppearance(defaultAppearance());
        run.settle(true);
        run.afterResult();
        const rawCards = JSON.stringify(run.upgrades);
        assert(run.upgrades.length === 3, "应有三个不同选项");
        assert(!run.pickReward("") && run.screen === "reward", "未点选不推进");
        const restored = decodeRun(encodeRun(run));
        assert(JSON.stringify(restored.upgrades) === rawCards && restored.screen === "reward", "重开不重抽");
        const selected = restored.upgrades[1];
        assert(restored.pickReward(selected.id), "玩家可选第二张");
        const once = encodeRun(restored);
        assert(!restored.pickReward(selected.id) && encodeRun(restored) === once, "重复确认不能重复强化或跳关");
        assert(restored.partLevels[selected.part!] === 1, "仅选中的部位加一级");
    });

    ok("正式赛失败回退关卡，但强化养成装备金币和首通记录不变", () => {
        const run = new RunState(33);
        run.gold = 1000;
        run.ownedIds.push(...getSets().find(s => s.id === "iron_beak")!.pieceIds);
        run.levelUp("head");
        run.bonus = { atk: 3 };
        run.completedMaps = [1];
        run.claimedGoldNodes = [1, 2, 3, 4, 5];
        run.routeNode = mapBoss(2);
        run.phase = "boss";
        run.screen = "battle";
        const before = JSON.stringify(JSON.parse(encodeRun(run)).permanent);
        let saved = "";
        run.onChanged = () => { saved = encodeRun(run); };
        run.settle(false);
        const restored = decodeRun(saved);
        assert(restored.routeNode === mapStart(2) && restored.stage === mapStart(2) && restored.phase === "battle", "结算时已回退第二图起点");
        const prior = JSON.parse(before);
        const after = JSON.parse(saved).permanent;
        assert(after.partLevels.head === 1 && after.bonus.atk === 3, "正式赛失败保留部位强化与额外养成");
        assert(JSON.stringify(after) === JSON.stringify(prior), "金币装备强化养成与首通账本保留");
        restored.afterResult();
        if (restored.upgrades.length) restored.pickReward(restored.upgrades[0].id);
        restored.enterFight();
        restored.settle(true);
        assert(restored.lastGoldGain === 0, "重打第二图已首通小关不能再刷金币");
    });

    ok("正式赛失败后可跳过已通关对战并保留强化", () => {
        const map2Battles = getRoute().filter(n => n.mapId === 2 && n.kind === "battle");
        const run = new RunState(90);
        run.confirmAppearance(defaultAppearance());
        run.gold = 500;
        run.claimedGoldNodes = map2Battles.map(n => n.id);
        run.routeNode = mapBoss(2);
        run.phase = "boss";
        run.screen = "battle";
        assert(!run.canSkipClearedBattles() && !run.skipClearedBattles(), "正式赛进行中不能跳过");
        run.settle(false);
        run.afterResult();
        if (run.upgrades.length) run.pickReward(run.upgrades[0].id);
        assert(run.routeNode === mapStart(2) && String(run.screen) === "map", "失败回到本图起点");
        assert(run.canSkipClearedBattles(), "已通关热身应可跳过对战");
        assert(run.mapHint().includes("跳过"), "地图提示可跳过对战");
        const gold = run.gold;
        const claimed = run.claimedGoldNodes.slice();
        let saved = "";
        run.onChanged = () => { saved = encodeRun(run); };
        assert(run.skipClearedBattles(), "一键跳过应成功");
        assert(run.lastWin && run.upgrades.length === 3 && String(run.screen) === "result", "跳过对战后仍进入结算并发强化牌");
        assert(run.routeNode === map2Battles[1].id, "每关只跳过当前对战");
        assert(run.lastGoldGain === 0 && run.gold === gold && JSON.stringify(run.claimedGoldNodes) === JSON.stringify(claimed), "已首通不重复发金币、不改账本");
        const restored = decodeRun(saved);
        assert(restored.screen === "result" && restored.upgrades.length === 3 && restored.routeNode === map2Battles[1].id, "跳过结算与强化牌随存档恢复");
        restored.afterResult();
        const picked = restored.upgrades[0];
        const before = picked.part ? (restored.partLevels[picked.part] || 0) : 0;
        assert(restored.pickReward(picked.id), "跳过后仍可选择强化");
        if (picked.part) assert((restored.partLevels[picked.part] || 0) === before + 1, "强化生效");
        if (String(restored.screen) === "shop") restored.leaveShop();
        while (restored.canSkipClearedBattles()) {
            assert(restored.skipClearedBattles() && restored.upgrades.length === 3, "后续已通关热身同样跳过对战并留强化");
            restored.afterResult();
            if (restored.upgrades.length) restored.pickReward(restored.upgrades[0].id);
            if (String(restored.screen) === "shop") restored.leaveShop();
        }
        assert(restored.routeNode === mapBoss(2) && restored.phase === "boss" && String(restored.screen) === "map", "热身全部跳过后到达正式赛");
        assert(!restored.canSkipClearedBattles(), "正式赛不能跳过");
        restored.enterFight();
        assert(String(restored.screen) === "prebattle", "正式赛仍需实际对战");

        const fresh = new RunState(91);
        fresh.confirmAppearance(defaultAppearance());
        assert(!fresh.canSkipClearedBattles(), "未打过的热身不能跳过");

        const partial = new RunState(92);
        partial.screen = "map";
        partial.routeNode = mapStart(2);
        partial.stage = mapStart(2);
        partial.phase = "battle";
        partial.claimedGoldNodes = [mapStart(2)];
        assert(partial.skipClearedBattles() && partial.upgrades.length === 3, "已通关的当前关可跳过对战并留强化");
        partial.afterResult();
        partial.pickReward(partial.upgrades[0].id);
        if (String(partial.screen) === "shop") partial.leaveShop();
        assert(partial.routeNode === map2Battles[1].id && !partial.canSkipClearedBattles(), "停在未打过的热身，不能继续跳");

        const finalFail = new RunState(93);
        finalFail.routeNode = kunId();
        finalFail.phase = "boss";
        finalFail.screen = "map";
        finalFail.claimedGoldNodes = getRoute().filter(n => n.kind === "battle").map(n => n.id);
        assert(!finalFail.canSkipClearedBattles(), "最终挑战不能靠跳过热身进入");
    });

    ok("首通金币和结算幂等，未首通的新节点仍给奖励", () => {
        const run = new RunState(34);
        run.confirmAppearance(defaultAppearance());
        run.settle(true);
        const first = run.gold;
        const cards = JSON.stringify(run.upgrades);
        run.settle(true);
        assert(run.gold === first && JSON.stringify(run.upgrades) === cards, "重复结算不发金币不抽新牌");
        run.afterResult();
        run.pickReward(run.upgrades[0].id);
        run.settle(true);
        assert(run.gold > first && run.lastFirstClear, "下一新小关正常首通发奖");
    });

    ok("BOSS胜利保存通关但停在原图，读档和重复点击不会自动跳图", () => {
        const run = new RunState(35);
        run.routeNode = mapBoss(1);
        run.phase = "boss";
        run.screen = "battle";
        let saved = "";
        run.onChanged = () => { saved = encodeRun(run); };
        run.settle(true);
        const restored = decodeRun(saved);
        assert(restored.completedMaps.includes(1), "结算页关闭也已经保存大关通关");
        assert(restored.routeNode === mapBoss(1) && restored.phase === "boss", "结算和读档均留在原图BOSS");
        assert(!restored.enterNextMap(), "结算页不能直接跳图");
        restored.enterFight();
        assert(restored.screen === "result", "通关后不能重复挑战BOSS");
        restored.afterResult();
        assert(restored.routeNode === mapBoss(1) && restored.screen === "map" && restored.nextMap?.id === 2, "恢复胜利结算后等待前往新地图");
        restored.afterResult();
        assert(restored.routeNode === mapBoss(1), "重复结算按钮不会自动切图");
        const waiting = decodeRun(encodeRun(restored));
        assert(waiting.nextMap?.id === 2 && waiting.routeNode === mapBoss(1), "地图页重进仍保留待切图状态");
        restored.enterFight();
        assert(restored.screen === "map", "已通关BOSS不能再次挑战");
        assert(restored.enterNextMap() && !restored.enterNextMap(), "前往新地图只生效一次");
        assert(restored.routeNode === mapStart(2), "重复继续不能跳过下图第一关");
        restored.routeNode = kunId(); restored.phase = "boss"; restored.screen = "battle";
        restored.settle(true);
        const finalResult = decodeRun(encodeRun(restored));
        assert(finalResult.completedMaps.includes(5) && finalResult.screen === "result", "最终关不点按钮也已保存通关");
        restored.afterResult();
        const final = decodeRun(encodeRun(restored));
        assert(final.screen === "ending" && final.completedMaps.includes(5), "最终图通关永久保留结局");
    });

    ok("旧版等待按钮推进的胜利存档在读档时修正且不重复推进", () => {
        for (const id of [1, 2, mapBoss(1), mapBoss(4), mapBoss(5)]) {
            const run = new RunState(38);
            run.routeNode = id; run.phase = getRoute().find(n => n.id === id)!.kind; run.screen = "battle";
            run.settle(true);
            const old = JSON.parse(encodeRun(run));
            old.progress.routeNode = id;
            const restored = decodeRun(JSON.stringify(old));
            const node = getRoute().find(n => n.id === id)!;
            const stay = node.kind === "boss" && node.encounter === "official" && (node.mapId || 1) < 5;
            const next = stay ? id : getRoute().find(n => n.id > id && n.kind !== "shop")?.id ?? id;
            assert(restored.routeNode === next, "读档即修正旧结算进度");
            assert(decodeRun(encodeRun(restored)).routeNode === restored.routeNode, "重复读档不跳关");
        }
    });

    ok("购买存档不会补货，清档只删除本游戏的键", () => {
        const memory = new Map<string, string>([["other_game", "keep"]]);
        const store = new RunSaveStore({getItem: key => memory.get(key) ?? null,
            setItem: (key, value) => { memory.set(key, value); }, removeItem: key => { memory.delete(key); }});
        const run = store.load();
        run.onChanged = () => store.save(run);
        run.gold = 500; run.routeNode = 4;
        run.openShop();
        const bought = run.shopItems[0].id;
        run.buyItem(bought);
        const stock = run.shopItems.map(item => item.id).join(",");
        const restored = store.load();
        restored.openShop();
        assert(restored.ownedIds.includes(bought) && restored.gold === run.gold, "购买立即落盘");
        assert(restored.shopItems.map(item => item.id).join(",") === stock, "退出商店不会补充固定货架");
        store.clear();
        assert(!memory.has(RUN_SAVE_KEY) && memory.get("other_game") === "keep", "不使用 localStorage.clear");
        const fresh = store.load();
        assert(fresh.routeNode === 1 && fresh.gold === 0 && fresh.ownedIds.length === 0 && fresh.completedMaps.length === 0, "清档后全部重新开始");
    });

    ok("外形满级后仍能发满三张强化", () => {
        const run = new RunState(36);
        for (const part of ["head", "neck", "body", "wing", "leg"] as const) run.partLevels[part] = upgradeOf(part)!.maxLevel;
        assert(rollUpgrades(1, 36, run.partLevels).length === 3, "外形满级后仍有三张");
        run.confirmAppearance(defaultAppearance());
        run.settle(true); run.afterResult();
        assert(run.upgrades.length === 3 && run.screen === "reward", "外形满级后仍进入三选一");
    });

    ok("损坏存档或未知版本读档失败时不删除原内容", () => {
        for (const raw of ["not json", "{}", JSON.stringify({version: 99})]) {
            let stored = raw;
            const store = new RunSaveStore({getItem: () => stored, setItem: (_key, value) => { stored = value; }, removeItem: () => { stored = ""; }});
            let rejected = false;
            try { store.load(); } catch { rejected = true; }
            assert(rejected && stored === raw, "读取失败不自动重置用户存档");
        }
    });

    ok("金币照给且不占强化的名额", () => {
        const run = new RunState(11);
        run.confirmAppearance(defaultAppearance());
        run.enterFight();
        run.settle(true);
        // 战后奖励就是结算这笔金币，不用挑；三选一是另一件事，只抽部位强化。
        assert(run.lastGoldGain > 0, "打完该给金币");
        assert(run.gold === run.lastGoldGain, "金币该进账");
        assert(run.rewards.length === 0, "金币不该占掉三选一的名额");
        run.afterResult();
        assert(run.screen === "reward", "战斗胜利后要发强化牌");
        assert(run.upgrades.length === 3, "应摇出三张");
        assert(run.upgrades.every(r => !!r.part), "三张都该是部位强化");
        assert(new Set(run.upgrades.map(r => r.part)).size === 3, "三张不能落在同一部位");
    });

    ok("挑完强化即离开三选一", () => {
        const run = new RunState(14);
        run.confirmAppearance(defaultAppearance());
        run.enterFight();
        run.settle(true);
        run.afterResult();
        const up = run.upgrades[0];
        run.pickReward(up.id);
        assert(run.partLevels[up.part!] === 1, "强化应记上等级");
        assert(run.screen !== "reward", "挑完就该走");
    });

    ok("强化牌上的等级跟着部位已选次数走", () => {
        const run = new RunState(61);
        run.confirmAppearance(defaultAppearance());
        run.enterFight();
        run.startBattle();
        run.settle(true);
        run.afterResult();
        const first = run.upgrades[0];
        assert(first.nextLevel === 1, "没练过的部位应显示 Lv1");
        run.pickReward(first.id);
        assert(run.partLevels[first.part!] === 1, "确认后该部位记一级");

        run.partLevels = { head: 4, body: 2, leg: 1 };
        const cards = rollUpgrades(1, 77, run.partLevels);
        assert(cards.length === 3, "应仍发三张");
        for (const card of cards) {
            const expect = (run.partLevels[card.part!] ?? 0) + 1;
            assert(card.nextLevel === expect, `${card.part} 已练 ${expect - 1} 级，牌面应是 Lv${expect}，实际 Lv${card.nextLevel}`);
        }
        run.upgrades = cards;
        run.screen = "reward";
        const restored = decodeRun(encodeRun(run));
        assert(restored.partLevels.head === 4 && restored.partLevels.body === 2, "存档应保留部位等级");
        for (const card of restored.upgrades) {
            const expect = (restored.partLevels[card.part!] ?? 0) + 1;
            assert(card.nextLevel === expect, "读档后牌面等级应按当前部位重算");
        }
    });

    ok("强化只加一份属性并撑大部位", () => {
        const run = new RunState(12);
        run.confirmAppearance(defaultAppearance());
        const before = run.playerFighter();
        const step = upgradeOf("head")!.stats.atk!;
        run.levelUp("head");
        const after = run.playerFighter();
        // 等级和 bonus 各加一次就会变成双倍，这条断言专门盯这个。
        assert(after.stats.atk === before.stats.atk + step, "练一级只该加一份攻击");
        assert((after.appearance.partScale?.head ?? 1) === 1 + upgradeOf("head")!.scalePerLevel, "练一级按配表放大");
        assert((after.appearance.partScale?.wing ?? 1) === 1, "没练的部位不该变大");
        assert(combatPower(after.stats) > combatPower(before.stats), "强化应体现在战力上");

        const comboBefore = run.playerFighter().stats.combo ?? 0;
        const comboStep = upgradeOf("wing")!.stats.combo!;
        run.levelUp("wing");
        assert((run.playerFighter().stats.combo ?? 0) === comboBefore + comboStep, "翅膀强化应增加连击");
    });

    ok("加成不设上限，外形放大封顶", () => {
        const run = new RunState(13);
        run.confirmAppearance(defaultAppearance());
        const def = upgradeOf("head")!;
        const before = run.playerFighter().stats.atk;
        for (let i = 0; i < def.maxLevel + 3; i++) run.levelUp("head");
        assert(run.partLevels.head === def.maxLevel + 3, "等级应能超过外形上限");
        assert(run.playerFighter().stats.atk === before + def.stats.atk! * (def.maxLevel + 3), "加成应继续叠加");
        assert(run.playerFighter().appearance.partScale?.head === 1 + def.scalePerLevel * def.maxLevel, "外形放大封顶");
        const extra = run.playerFighter().stats.atk;
        run.levelUp("head");
        assert(run.playerFighter().stats.atk === extra + def.stats.atk!, "封顶后加成仍增加");
        assert(run.playerFighter().appearance.partScale?.head === 1 + def.scalePerLevel * def.maxLevel, "封顶后外形不再变大");
        const cards = rollUpgrades(1, 99, run.partLevels);
        assert(cards.some(c => c.part === "head"), "外形满后仍可抽到该部位");
    });

    ok("自动战斗可分出胜负", () => {
        const run = new RunState(7);
        run.confirmAppearance(defaultAppearance());
        const session = new BattleSession(run.playerFighter(), run.enemyFighter(), 7, false);
        const win = session.resolveAll();
        assert(typeof win === "boolean", "应有胜负");
        const kinds = session.events.map(e => e.type);
        assert(kinds.indexOf("taunt") >= 0, "应有垃圾话");
        assert(kinds.indexOf("start") >= 0, "应有开战");
        assert(kinds.indexOf("end") >= 0, "应有结算");
    });

    ok("残血优先回血策略", () => {
        const a = decideAction({ hp: 20, maxHp: 100, healPerTurn: 8, healCd: 0, skillCd: 0 });
        assert(a === "heal", "残血应回血");
        const b = decideAction({ hp: 100, maxHp: 100, healPerTurn: 0, healCd: 0, skillCd: 0 });
        assert(b === "skill", "满血应放技能");
    });

    ok("按数值选招不随机", () => {
        const fast = decide(
            { hp: 80, maxHp: 100, atk: 12, def: 8, spd: 20, healPerTurn: 0, healCd: 1, skillCd: 1 },
            { hp: 80, maxHp: 100, atk: 12, def: 8, spd: 8, healPerTurn: 0, healCd: 1, skillCd: 1 }
        );
        assert(fast.kind === "attack" && fast.style === "jump", "更快应跳踢");
        const crush = decide(
            { hp: 80, maxHp: 100, atk: 30, def: 8, spd: 8, healPerTurn: 0, healCd: 1, skillCd: 1 },
            { hp: 80, maxHp: 100, atk: 10, def: 6, spd: 8, healPerTurn: 0, healCd: 1, skillCd: 1 }
        );
        assert(crush.kind === "attack" && crush.style === "peck", "打得过应贴身啄");
        const run = new RunState(8);
        run.confirmAppearance(defaultAppearance());
        const session = new BattleSession(run.playerFighter(), run.enemyFighter(), 8, false);
        session.intro();
        session.beginCombat();
        let guard = 0;
        while (!session.done && !session.striking("player") && guard++ < 1000) session.tick(0.05);
        session.resolveStrike("player", false);
        assert(session.events.some(e => e.type === "miss"), "没撞上不应结算伤害");
    });

    ok("即时战斗按速度决定出手频率", () => {
        const run = new RunState(9);
        run.confirmAppearance(defaultAppearance());
        const slow = run.enemyFighter();
        const fast = run.enemyFighter();
        fast.stats = { ...fast.stats, spd: slow.stats.spd + 30 };
        const session = new BattleSession(fast, slow, 9, false);
        session.intro();
        session.beginCombat();
        const count = { player: 0, enemy: 0 };
        let guard = 0;
        while (!session.done && guard++ < 4000) {
            for (const ev of session.tick(0.05)) {
                if (ev.type === "action") count[ev.side] += 1;
            }
            for (const side of ["player", "enemy"] as const) {
                if (session.striking(side)) session.resolveStrike(side, true);
            }
        }
        assert(count.player > count.enemy, "速度高的一方出手次数应更多");
        assert(count.player + count.enemy > 20, "即时制一场应打满几十刀，不是几回合");
    });

    ok("行为树与默认决策结论一致", () => {
        // 游戏里出招由行为树定，无界面验证跑的是 decide。两边判据同源但组合方式不同，
        // 这里把状态空间铺开对一遍，谁改歪了都会在这里露出来。
        const brain = new BattleBrain();
        let n = 0;
        for (const myHp of [0.1, 0.34, 0.36, 0.6, 1]) {
            for (const foeHp of [0.2, 0.31, 0.9]) {
                for (const healPerTurn of [0, 6]) {
                    for (const healCd of [0, 2]) {
                        for (const skillCd of [0, 3]) {
                            for (const spd of [8, 15]) {
                                for (const atk of [10, 19, 26]) {
                                    const self: AiFighter = {
                                        hp: 100 * myHp, maxHp: 100, atk, def: 8, spd, crit: 0.1,
                                        healPerTurn, healCd, skillCd,
                                        // 招式按出手序号在动作池里轮换，这里让序号跟着样本走，
                                        // 行为树要是没照 core 那套规则轮，就会在这里跟 decide 对不上。
                                        beat: n
                                    };
                                    const foe: AiFighter = {
                                        hp: 100 * foeHp, maxHp: 100, atk: 18, def: 14, spd: 12, crit: 0.1,
                                        healPerTurn: 0, healCd: 1, skillCd: 1
                                    };
                                    const want = decide(self, foe);
                                    const got = brain.think(self, foe);
                                    assert(
                                        want.kind === got.kind && want.style === got.style,
                                        `血${myHp} 敌血${foeHp} 技能cd${skillCd} 速${spd} 攻${atk}: `
                                        + `期望 ${want.kind}/${want.style}，行为树给了 ${got.kind}/${got.style}`
                                    );
                                    n += 1;
                                }
                            }
                        }
                    }
                }
            }
        }
        assert(n >= 500, `样本只有 ${n} 组，覆盖不够`);
    });

    ok("局势不变时招式仍轮换", () => {
        // 数值一场里几乎不动，判据的结论也就不动。招式若跟判据一一绑死，
        // 一整场就只看得见一个动作，这条断言守的就是这件事。
        const foe: AiFighter = {
            hp: 80, maxHp: 100, atk: 12, def: 8, spd: 8, healPerTurn: 0, healCd: 1, skillCd: 1
        };
        const styles = new Set<string>();
        for (let beat = 0; beat < 4; beat++) {
            const self: AiFighter = {
                hp: 80, maxHp: 100, atk: 12, def: 8, spd: 20,
                healPerTurn: 0, healCd: 1, skillCd: 1, beat
            };
            const d = decide(self, foe);
            assert(d.kind === "attack", "局势没变，出招类型就该一直是普攻");
            styles.add(d.style);
        }
        assert(styles.size >= 3, `同一局势连着出手应换着动作打，实际只有 ${styles.size} 种`);
    });

    ok("一场战斗的动作足够杂", () => {
        const run = new RunState(7);
        run.confirmAppearance(defaultAppearance());
        const session = new BattleSession(run.playerFighter(), run.enemyFighter(), 7, false);
        session.resolveAll();
        const tally: Record<string, number> = {};
        let total = 0;
        for (const ev of session.events) {
            if (ev.type !== "action") continue;
            tally[ev.style] = (tally[ev.style] || 0) + 1;
            total += 1;
        }
        const kinds = Object.keys(tally);
        assert(kinds.length >= 4, `一场里应看到至少四种动作，实际 ${kinds.length} 种`);
        const top = Math.max(...kinds.map(k => tally[k]));
        assert(top / total < 0.5, `有一种动作占了 ${(100 * top / total).toFixed(0)}%，太单一`);
    });

    ok("战力排序与实际强弱一致", () => {
        const bare = buildStats([], {});
        const gale = buildStats(["gale_wing", "gale_tail", "gale_leg", "gale_body"], {});
        const iron = buildStats(["iron_comb", "iron_head", "iron_body", "iron_wing"], {});
        assert(combatPower(gale) > combatPower(bare), "疾风套加速度，战力应高于裸装");
        // 实测铁喙套的输出高于纯疾风套，战力排序不能反过来误导玩家。
        assert(combatPower(iron) > combatPower(gale), "铁喙套更能打，战力应更高");
    });

    ok("战斗时长落在可观赏区间", () => {
        const seconds = (player: any, enemy: any, boss: boolean) => {
            const s = new BattleSession(player, enemy, 11, boss);
            s.intro();
            s.beginCombat();
            let t = 0;
            let guard = 0;
            while (!s.done && guard++ < 20000) {
                s.tick(0.05);
                for (const side of ["player", "enemy"] as const) {
                    if (s.striking(side)) s.resolveStrike(side, true);
                }
                t += 0.05;
            }
            return t;
        };
        const run = new RunState(11);
        run.confirmAppearance(defaultAppearance());
        const first = seconds(run.playerFighter(), run.enemyFighter(), false);
        assert(first > 8 && first < 40, `首战 ${first.toFixed(1)}s 不该这么${first <= 8 ? "快" : "慢"}`);
        // 使用石冠套装加铁喙翅；同槽互斥，不能把背包两套属性叠加。
        run.phase = "boss";
        run.routeNode = mapBoss(1);
        run.ownedIds = ["iron_comb", "iron_head", "iron_body", "iron_wing", "stone_comb", "stone_head", "stone_body", "stone_leg"];
        run.equipSet("stone_crown");
        run.equipItem("iron_wing");
        const boss = seconds(run.playerFighter(), run.enemyFighter(), true);
        assert(boss > 10 && boss < 50, `鸡王战 ${boss.toFixed(1)}s 超出预期`);
    });

    ok("新装备购买解锁、缺件价格和铁公鸡优惠一致", () => {
        const run = new RunState(80);
        run.gold = 3000;
        assert(!run.buySet("champion") && !run.buyItem("champion_head"), "奖励不能免费购买");
        assert(!run.buySet("miser"), "未到解锁地图不能绕过UI购买");
        assert(run.buySet("rookie"), "新手套可购买");
        assert(getSets().find(s => s.id === "rookie")!.pieceIds.every(id => run.equippedIds.includes(id)), "买完自动穿上");
        assert(run.playerFighter().stats.retainGrowth === 1, "四件保留成长生效");
        run.routeNode = mapStart(3);
        assert(run.buySet("miser"), "第三图铁公鸡解锁");
        assert(getSets().find(s => s.id === "miser")!.pieceIds.every(id => run.equippedIds.includes(id)), "买铁公鸡自动穿上");
        const gold = run.gold, price = run.itemPrice("medic_head");
        assert(run.buyItem("medic_head") && gold - run.gold === price, "显示价和实扣一致");
        const missingPrice = run.setPrice("medic");
        assert(missingPrice < setPrice("medic"), "补齐不收费已拥有部件且享装备折扣");
        const before = run.gold;
        assert(run.buySet("medic") && before - run.gold === missingPrice, "整套确认按缺件折扣收费");
        // 买 medic 会自动换上；这里改回铁公鸡以验证金币加成。
        assert(run.equipSet("miser"), "可切回铁公鸡");
        run.screen = "battle";
        const reward = getRoute().find(n => n.id === mapStart(3))!.goldWin!;
        run.settle(true);
        assert(run.lastGoldGain === Math.floor(reward * 1.2), "两件金币加成按首通发放");
        const once = run.gold; run.settle(true);
        assert(run.gold === once, "金币加成仍幂等");
    });

    ok("热身与正式赛失败都保留强化养成，正式赛只回退本图起点", () => {
        const run = new RunState(81);
        run.ownedIds = getSets().find(s => s.id === "rookie")!.pieceIds.slice();
        run.equipSet("rookie");
        run.partLevels = { head: 2, leg: 3 };
        run.bonus = { def: 2 };
        run.screen = "battle";
        run.settle(false);
        assert(run.partLevels.head === 2 && run.partLevels.leg === 3 && run.bonus.def === 2, "热身失败不清成长");
        run.routeNode = mapBoss(1); run.phase = "boss"; run.screen = "battle";
        run.settle(false);
        assert(run.partLevels.head === 2 && run.partLevels.leg === 3 && run.bonus.def === 2, "正式赛失败也不清强化养成");
        assert(decodeRun(encodeRun(run)).routeNode === mapStart(1), "正式赛失败回到本图起点");
    });

    ok("最终挑战在五图完成后仍可进入，奖励唯一且旧结局可迁移", () => {
        const run = new RunState(82);
        run.routeNode = kunId(); run.phase = "boss"; run.screen = "map"; run.completedMaps = [1, 2, 3, 4, 5];
        run.enterFight(); run.startBattle();
        assert(String(run.screen) === "battle", "地图完成记录不阻挡坤坤");
        run.settle(false);
        assert(run.routeNode === kunId(), "最终失败可重新准备直接重试");
        run.afterResult(); if (run.upgrades.length) run.pickReward(run.upgrades[0].id);
        run.enterFight(); run.startBattle(); run.settle(true);
        assert(run.ownedIds.length === 4 && run.ownedIds.every(id => id.startsWith("champion_")), "发放四件奖励");
        run.afterResult();
        assert(String(run.screen) === "ending", "最终胜利进入结局");
        const saved = encodeRun(run); run.settle(true);
        assert(encodeRun(run) === saved, "重复最终结算不重复奖励");
        const old = JSON.parse(saved); old.version = 1; old.progress.routeNode = mapBoss(5);
        old.progress.lastBattleNode = mapBoss(5); old.permanent.claimedGoldNodes = [mapBoss(5)]; old.permanent.ownedIds = [];
        const migrated = decodeRun(JSON.stringify(old));
        assert(migrated.routeNode === kunId() && migrated.screen === "map", "旧结局开放新增坤坤挑战");
    });

    ok("挖掘鸡与鸡来按地图解锁，鸡王中王在缝纫鸡后发放", () => {
        const run = new RunState(86);
        run.gold = 8000;
        const champion = getSets().find(s => s.id === "champion")!.pieceIds;
        assert(!!getSets().find(s => s.id === "digger") && !!getSets().find(s => s.id === "coming"), "新套装已入表");
        assert(!run.buySet("digger") && !run.buySet("coming"), "未到地图不能买新套装");
        run.routeNode = mapStart(4);
        assert(run.buySet("digger") && !run.buySet("coming"), "第四图只解锁挖掘鸡");
        assert(run.playerFighter().stats.lockHp === true, "买挖掘鸡自动穿上且四件锁血");
        run.routeNode = mapStart(5);
        assert(run.buySet("coming"), "第五图解锁鸡来套装");
        assert(getSets().find(s => s.id === "coming")!.pieceIds.every(id => run.equippedIds.includes(id)), "买鸡来自动穿上");
        assert(!run.buySet("champion"), "鸡王中王仍不能购买");
        run.routeNode = mapBoss(4); run.phase = "boss"; run.screen = "battle";
        run.settle(true);
        assert(champion.every(id => !run.ownedIds.includes(id)), "第四图正式赛不发鸡王中王");
        run.routeNode = mapBoss(5); run.phase = "boss"; run.screen = "battle";
        run.settle(true);
        assert(champion.every(id => run.ownedIds.includes(id)), "击败缝纫鸡发放鸡王中王");
        assert(champion.every(id => run.equippedIds.includes(id)), "缝纫鸡胜利后自动穿上鸡王中王");
        const crowned = run.playerFighter().stats;
        assert(crowned.maxHp >= 200 && crowned.atk >= 50 && crowned.def >= 14 && crowned.spd >= 20, "鸡王中王提供终局属性");
        assert(crowned.lockHp && crowned.revive >= 1 && (crowned.firstStrike ?? 0) >= 1, "鸡王中王提供锁血、复活、先手");
        assert((crowned.streakBonus ?? 0) >= 0.1 && crowned.healPerTurn >= 14, "鸡王中王提供连击增伤和回血");
        const owned = run.ownedIds.slice();
        run.routeNode = kunId(); run.phase = "boss"; run.screen = "battle";
        run.settle(true);
        assert(run.ownedIds.join(",") === owned.join(","), "最终战不重复发放部件");
    });

    ok("鸡王中王套装数值强于其他现役套装", () => {
        const wear = (id: string) => {
            const run = new RunState(11);
            run.ownedIds = getSets().find(s => s.id === id)!.pieceIds.slice();
            assert(run.equipSet(id), `可穿上${id}`);
            return run.playerFighter().stats;
        };
        const champ = wear("champion");
        const coming = wear("coming");
        const digger = wear("digger");
        assert(combatPower(champ) > combatPower(coming) && combatPower(champ) > combatPower(digger), "鸡王中王战力应高于鸡来和挖掘鸡");
        assert(champ.atk > coming.atk && champ.maxHp > coming.maxHp, "鸡王中王攻血应高于鸡来");
        assert(champ.lockHp && champ.revive >= 1 && (champ.firstStrike ?? 0) >= 1, "终局套应同时具备锁血、复活、先手");
    });

    ok("不同派系同一局势出招不同", () => {
        const foe: AiFighter = {
            hp: 80, maxHp: 100, atk: 12, def: 8, spd: 8, healPerTurn: 0, healCd: 1, skillCd: 1
        };
        const base = {
            hp: 80, maxHp: 100, atk: 12, def: 8, spd: 20,
            healPerTurn: 0, healCd: 1, skillCd: 1, beat: 0
        };
        const generic = decide(base, foe);
        const swift = decide({ ...base, style: "swift" }, foe);
        const tank = decide({ ...base, style: "tank" }, foe);
        assert(generic.style === "jump", "无派系的速度优势仍是跳踢");
        assert(swift.style === "jump", "疾步型速度池仍以跳踢起手");
        assert(tank.style === "tail", "铁壁型速度池改扫尾");
        assert(swift.style !== tank.style, "疾步和铁壁不该打出同一招");
        const aerial = decide({ ...base, style: "aerial", skillCd: 0, spd: 8 }, foe);
        const trick = decide({ ...base, style: "trickster", skillCd: 0, spd: 8 }, foe);
        const brawler = decide({ ...base, style: "brawler", spd: 8 }, foe);
        assert(aerial.kind === "skill" && aerial.style === "dive", "飞扑型冷却好了就下砸");
        assert(trick.kind === "skill" && trick.style === "feint", "诡道型冷却好了就假动作");
        assert(brawler.style === "charge" || brawler.style === "peck", "莽撞型贴身撞");
        assert(aerial.style !== trick.style && trick.style !== tank.style, "飞扑/诡道/铁壁开场招应能一眼分开");
        const map1 = ["peck", "combo"] as const;
        const limited = decide({ ...base, style: "brawler", skillCd: 0, spd: 8, skills: map1 }, foe);
        assert(limited.kind === "skill" && limited.style === "combo", "技能池缩小后莽撞型应直接放连珠神啄");
        assert(limited.style !== "leap" && limited.style !== "charge", "禁用招不该再被降级成别的绝招");
        const aerialLimited = decide({ ...base, style: "aerial", skillCd: 0, spd: 8, skills: map1 }, foe);
        assert(aerialLimited.kind === "skill" && map1.includes(aerialLimited.style as typeof map1[number]), "路数池与本图无交集时直接改用本图技能池");
    });

    ok("相邻场次路数不同，开场招跟路数走", () => {
        const styles = getRoute().filter(n => n.enemyId).map(n => enemyCombatProfile(n.enemyId!, "").style);
        const unique = new Set(styles);
        assert(unique.size >= 5, `整条路线路数太少，只有 ${[...unique].join(",")}`);
        let same = 0;
        for (let i = 1; i < styles.length; i++) if (styles[i] === styles[i - 1]) same += 1;
        assert(same <= 2, `相邻场次路数重复 ${same} 次，连看会腻`);

        const run = new RunState(3);
        run.confirmAppearance(defaultAppearance());
        const me = run.playerFighter();
        const foe = run.enemyFighter();
        const battle = new BattleSession(me, foe, 3, false);
        battle.intro();
        battle.beginCombat();
        const first: Partial<Record<"player" | "enemy", string>> = {};
        let guard = 0;
        while ((first.player == null || first.enemy == null) && !battle.done && guard++ < 400) {
            for (const ev of battle.tick(0.05)) {
                if (ev.type === "action" && first[ev.side] == null) first[ev.side] = ev.style;
            }
            for (const side of ["player", "enemy"] as const) {
                if (battle.striking(side)) battle.resolveStrike(side, true);
            }
        }
        assert(first.player === STYLE_OPENING[me.fightStyle || "brawler"], `玩家开场应是 ${STYLE_OPENING[me.fightStyle || "brawler"]}，实际 ${first.player}`);
        assert(first.enemy === STYLE_OPENING[foe.fightStyle || "brawler"], `敌人开场应是 ${STYLE_OPENING[foe.fightStyle || "brawler"]}，实际 ${first.enemy}`);
        assert(first.player !== first.enemy, "首场双方开场招相同，看起来会像镜像互啄");
    });

    ok("五张地图普攻演出有差分，正式赛和鸡王再加一层", () => {
        const moods = [1, 2, 3, 4, 5].map(id => stageMood(id, "warmup"));
        const hops = new Set(moods.map(m => m.hop));
        const flourishes = new Set(moods.map(m => m.flourish));
        const tints = new Set(moods.map(m => m.tint));
        assert(hops.size === 5, "五张图弹跳不该一样");
        assert(flourishes.size === 5, "五张图花活不该一样");
        assert(tints.size === 5, "五张图场地染色不该一样");
        assert(moods[1].hop > moods[0].hop, "青竹溪该比鸡鸣村跳得高");
        assert(moods[3].spin > moods[0].spin, "古祠镇该比鸡鸣村转得多");
        assert(moods[4].squash > moods[1].squash, "鸡王山砸地该比青竹溪重");
        const official = stageMood(1, "official");
        const finale = stageMood(5, "final");
        assert(official.squash > moods[0].squash, "正式赛压扁要比热身重");
        assert(finale.flourish === "ember" && finale.dust[0] > finale.dust[1], "鸡王场改火气");
    });

    ok("绝招错开，不跟对面叠特效", () => {
        const run = new RunState(44);
        const p = run.playerFighter(), e = run.enemyFighter();
        p.stats = { ...p.stats, atk: 20, def: 0, spd: 12, crit: 0, hp: 800, maxHp: 800, firstStrike: 1 };
        e.stats = { ...e.stats, atk: 20, def: 0, spd: 12, crit: 0, hp: 800, maxHp: 800, firstStrike: 1 };
        p.fightStyle = "brawler";
        e.fightStyle = "brawler";
        const battle = new BattleSession(p, e, 44, false, () => ({ kind: "skill", style: "leap" }), {
            enemySkills: PLAYER_SKILLS
        });
        battle.beginCombat();
        const last: Record<"player" | "enemy", number> = { player: -99, enemy: -99 };
        const skills: Record<"player" | "enemy", number> = { player: 0, enemy: 0 };
        let overlap = 0;
        let t = 0;
        let guard = 0;
        while (!battle.done && guard++ < 8000) {
            for (const ev of battle.tick(0.05)) {
                if (ev.type !== "action" || ev.kind !== "skill") continue;
                skills[ev.side] += 1;
                const other = ev.side === "player" ? "enemy" : "player";
                if (t - last[other] < 1.2) overlap += 1;
                last[ev.side] = t;
            }
            for (const side of ["player", "enemy"] as const) {
                if (battle.striking(side)) battle.resolveStrike(side, true);
            }
            t += 0.05;
        }
        assert(skills.player >= 3 && skills.enemy >= 3, `双方都应能放绝招，实际 玩家${skills.player} 敌人${skills.enemy}`);
        assert(overlap === 0, `绝招立绘叠了 ${overlap} 次`);
        assert(Math.abs(last.player - last.enemy) >= 1.2 || last.player < 0 || last.enemy < 0,
            "最后一次绝招也不该贴在一起");
    });

    ok("对撞折伤、闪避与红眼", () => {
        const run = new RunState(91);
        const p = run.playerFighter(), e = run.enemyFighter();
        p.stats = { ...p.stats, atk: 40, def: 0, spd: 8, crit: 0, hp: 400, maxHp: 400 };
        e.stats = { ...e.stats, atk: 40, def: 0, spd: 8, crit: 0, hp: 400, maxHp: 400 };
        p.fightStyle = "brawler";
        e.fightStyle = "brawler";
        const clash = new BattleSession(p, e, 91, false, () => ({ kind: "attack", style: "peck" }));
        clash.beginCombat();
        clash.tick(2);
        assert(clash.striking("player") && clash.striking("enemy"), "双方同时出手才能对撞");
        const evs = clash.resolveStrike("player", true);
        assert(evs.some(ev => ev.type === "clash"), "同时接触应打出对撞");
        const hits = evs.filter(ev => ev.type === "hit");
        assert(hits.length === 2, "对撞双方都挨一下");
        assert(!clash.striking("enemy"), "对撞清掉对方待结算");

        const agile = run.playerFighter(), dummy = run.enemyFighter();
        agile.stats = { ...agile.stats, atk: 30, def: 0, spd: 8, crit: 0, hp: 500, maxHp: 500 };
        dummy.stats = { ...dummy.stats, atk: 8, def: 0, spd: 24, crit: 0, hp: 500, maxHp: 500 };
        dummy.fightStyle = "swift";
        dummy.signature = "slip";
        const duck = new BattleSession(agile, dummy, 7, false, () => ({ kind: "attack", style: "peck" }));
        duck.beginCombat();
        let dodged = 0;
        for (let i = 0; i < 40 && !duck.done; i++) {
            if (duck.striking("enemy")) duck.resolveStrike("enemy", false);
            if (!duck.striking("player")) duck.tick(2);
            if (duck.striking("enemy")) duck.resolveStrike("enemy", false);
            const batch = duck.resolveStrike("player", true);
            if (batch.some(ev => ev.type === "dodge")) dodged += 1;
        }
        assert(dodged >= 3, `疾步型应能躲开几下，实际 ${dodged}`);

        const low = run.playerFighter(), fodder = run.enemyFighter();
        low.stats = { ...low.stats, atk: 80, def: 0, spd: 10, crit: 0, hp: 30, maxHp: 100, firstStrike: 1 };
        fodder.stats = { ...fodder.stats, atk: 1, def: 0, spd: 4, crit: 0, hp: 500, maxHp: 500 };
        low.fightStyle = "berserker";
        const fury = new BattleSession(low, fodder, 12, false, () => ({ kind: "attack", style: "peck" }));
        fury.beginCombat();
        fury.tick(0.01);
        const rageHit = fury.resolveStrike("player", true);
        assert(rageHit.some(ev => ev.type === "rage"), "残血出手应红眼");
    });

    ok("先手、连续命中增伤及落空重置", () => {
        const run = new RunState(83);
        const p = run.playerFighter(), e = run.enemyFighter();
        p.stats = { ...p.stats, atk: 100, crit: 0, firstStrike: 1, streakBonus: 0.08 };
        e.stats = { ...e.stats, hp: 10000, maxHp: 10000, def: 0 };
        p.fightStyle = "brawler";
        e.fightStyle = "brawler";
        const battle = new BattleSession(p, e, 83, false, () => ({ kind: "attack", style: "peck" }));
        battle.beginCombat();
        const first = battle.tick(0.01).filter(ev => ev.type === "action");
        assert(first.length === 1 && first[0].type === "action" && first[0].side === "player", "先手立即行动且敌方尚未行动");
        const damages: number[] = [];
        for (const hit of [true, true, true, false, true]) {
            if (battle.striking("enemy")) battle.resolveStrike("enemy", false);
            if (!battle.striking("player")) battle.tick(2);
            if (battle.striking("enemy")) battle.resolveStrike("enemy", false);
            const event = battle.resolveStrike("player", hit).find(ev => ev.type === "hit");
            if (event?.type === "hit") damages.push(event.dmg);
        }
        assert(damages[2] > damages[1] && damages[1] > damages[0], "连续命中伤害逐渐增加");
        assert(damages[3] === damages[0], "落空清空增伤");
    });

    ok("医学奇鸡治疗增幅、复活和钢鸡锁血", () => {
        const run = new RunState(84);
        const p = run.playerFighter(), e = run.enemyFighter();
        p.stats = buildStats(getSets().find(s => s.id === "medic")!.pieceIds);
        p.stats.hp = 1;
        const healing = new BattleSession(p, e, 84, false);
        healing.beginCombat();
        const heal = healing.tick(1).find(ev => ev.type === "heal" && ev.side === "player");
        assert(heal?.type === "heal" && heal.amount === 10, "8点基础治疗乘1.3后取整10");
        for (const set of ["medic", "concrete"]) {
            const player = run.playerFighter(), foe = run.enemyFighter();
            player.stats = buildStats(getSets().find(s => s.id === set)!.pieceIds);
            player.stats.hp = 1;
            foe.stats.atk = 10000;
            const battle = new BattleSession(player, foe, 84, false, () => ({ kind: "attack", style: "peck" }));
            battle.beginCombat(); battle.tick(2);
            const result = battle.resolveStrike("enemy", true);
            assert(result.some(ev => ev.type === (set === "medic" ? "revive" : "lock")), "首次致命伤触发对应保命效果");
            battle.tick(2); battle.resolveStrike("enemy", true);
            assert(battle.done && !battle.win, "每场仅能触发一次");
        }
    });

    ok("弹幕去重、普通混合概率与坤坤80%", () => {
        const rng = new Rng(85);
        const common = JSON.parse(fs.readFileSync(path.join(tableDir(), "Danmaku.json"), "utf8")).common as string[];
        const pool = new DanmakuPool("official", "菜鸡", () => rng.next());
        const last: string[] = []; let universal = 0;
        for (let i = 0; i < 5000; i++) {
            const text = pool.next(last.slice(-3))!;
            assert(!!text && !last.slice(-8).includes(text), "在屏与最近8条不能重复");
            if (common.includes(text)) universal++;
            last.push(text);
        }
        assert(universal / 5000 > 0.66 && universal / 5000 < 0.74, "普通70%万能池");
        const boss = new DanmakuPool("boss", "鸡王坤坤", () => rng.next());
        let meme = 0;
        for (let i = 0; i < 5000; i++) {
            const text = boss.next(["鸡你太美"])!;
            assert(!common.includes(text), "Boss只使用专属池");
            if (text === "鸡你太美") meme++;
        }
        assert(meme / 5000 > 0.77 && meme / 5000 < 0.83, "坤坤80%主题弹幕，允许重复");
    });

    ok("玩家主动招式按地图解锁，最终八招，冷却独立且不会自动放", () => {
        assert(PLAYER_SKILLS.length === 8, "总共应有八个特效绝招");
        assert(skillsUnlockedAt(1).length === 2 && skillsUnlockedAt(1).includes("peck") && skillsUnlockedAt(1).includes("combo"), "第一图解锁鸡啄米与连珠神啄");
        assert(skillsUnlockedOnMap(2).includes("jump") && skillsUnlockedOnMap(2).includes("feint"), "第二图解锁金鸡独立与金蝉脱壳");
        assert(skillsUnlockedAt(5).length === 8, "第五图应凑齐全部八招");
        for (const style of PLAYER_SKILLS) {
            assert(SKILL_UNLOCK_MAP[style] >= 1 && SKILL_UNLOCK_MAP[style] <= 5, `${style} 应在 1-5 图解锁`);
        }

        const run = new RunState(21);
        run.confirmAppearance(defaultAppearance());
        assert(run.unlockedSkills().length === 2, "开局只应有两招");
        const firstNotice = run.takeSkillUnlockNotice();
        assert(firstNotice.length === 2 && firstNotice.includes("peck"), "第一图应弹出起始绝招");
        assert(run.takeSkillUnlockNotice().length === 0, "同图不应重复弹解锁");

        const p = run.playerFighter(), e = run.enemyFighter();
        p.stats = { ...p.stats, atk: 20, def: 0, spd: 8, crit: 0, hp: 900, maxHp: 900 };
        e.stats = { ...e.stats, atk: 8, def: 0, spd: 4, crit: 0, hp: 900, maxHp: 900 };
        const early = new BattleSession(p, e, 21, false, () => ({ kind: "attack", style: "peck" }), {
            playerManualSkills: true, playerSkills: run.unlockedSkills()
        });
        early.beginCombat();
        assert(early.requestSkill("peck").some(ev => ev.type === "action" && ev.style === "peck"), "已解锁的鸡啄米应能点");
        assert(early.requestSkill("leap").length === 0, "未解锁的天外飞鸡不能放");

        const battle = new BattleSession(p, e, 21, false, () => ({ kind: "attack", style: "peck" }), {
            playerManualSkills: true, playerSkills: PLAYER_SKILLS
        });
        battle.beginCombat();
        for (const style of PLAYER_SKILLS) {
            assert(skillCooldownOf(style) > 0 && battle.previewSkillAtk(style) > 0, `${style} 应有独立冷却和攻击`);
        }
        assert(battle.previewSkillAtk("leap") > battle.previewSkillAtk("combo"), "天外飞鸡攻击数值应高于连珠神啄");
        assert(skillCooldownOf("leap") > skillCooldownOf("combo"), "天外飞鸡冷却应更长");
        assert(skillAttackValue(20, "leap") === 44, "20 攻的天外飞鸡应标 44");

        let playerSkills = 0;
        const drain = () => {
            if (battle.striking("player")) battle.resolveStrike("player", true);
            if (battle.striking("enemy")) battle.resolveStrike("enemy", true);
        };
        for (let i = 0; i < 80 && !battle.done; i++) {
            for (const ev of battle.tick(0.05)) {
                if (ev.type === "action" && ev.side === "player" && ev.kind === "skill") playerSkills += 1;
            }
            drain();
        }
        assert(playerSkills === 0, `没点按钮不该放绝招，实际 ${playerSkills}`);
        assert(battle.requestSkill("peck").some(ev => ev.type === "action" && ev.style === "peck"), "鸡啄米也应能点");
        drain();
        assert(battle.requestSkill("feint").some(ev => ev.type === "action" && ev.style === "feint"), "金蝉脱壳也应能点");
        drain();

        const combo = battle.requestSkill("combo");
        assert(combo.some(ev => ev.type === "action" && ev.kind === "skill" && ev.style === "combo"), "点连珠神啄应立刻放");
        drain();
        assert(battle.requestSkill("combo").length === 0, "刚放完应在冷却");
        assert(battle.skillRemain("combo") > 4.5, "连珠神啄冷却应接近满值");

        const leap = battle.requestSkill("leap");
        assert(leap.some(ev => ev.type === "action" && ev.style === "leap"), "另一招冷却独立，天外飞鸡应能放");
        drain();
        assert(battle.skillRemain("leap") > battle.skillRemain("combo"), "天外飞鸡剩余冷却应更长");

        let t = 0;
        while (battle.skillRemain("combo") > 0 && t < 8 && !battle.done) {
            battle.tick(0.05);
            drain();
            t += 0.05;
        }
        assert(battle.skillRemain("combo") <= 0, "连珠神啄短冷却应先转好");
        assert(battle.skillRemain("leap") > 0, "天外飞鸡此时还应在冷却");
        const again = battle.requestSkill("combo");
        assert(again.some(ev => ev.type === "action" && ev.style === "combo"), "短冷却转好后应能再放");
    });

    ok("点击圈普通减20%技能冷却，完美减40%", () => {
        const run = new RunState(22);
        run.confirmAppearance(defaultAppearance());
        const p = run.playerFighter(), e = run.enemyFighter();
        p.stats = { ...p.stats, atk: 20, def: 0, spd: 8, crit: 0, hp: 900, maxHp: 900 };
        e.stats = { ...e.stats, atk: 8, def: 0, spd: 4, crit: 0, hp: 900, maxHp: 900 };
        const battle = new BattleSession(p, e, 22, false, () => ({ kind: "attack", style: "peck" }), {
            playerManualSkills: true, playerSkills: PLAYER_SKILLS
        });
        battle.beginCombat();
        const drain = () => {
            if (battle.striking("player")) battle.resolveStrike("player", true);
            if (battle.striking("enemy")) battle.resolveStrike("enemy", true);
        };
        assert(battle.requestSkill("combo").some(ev => ev.type === "action" && ev.style === "combo"), "先放一招进入冷却");
        drain();
        assert(battle.requestSkill("leap").some(ev => ev.type === "action" && ev.style === "leap"), "再放一招进入冷却");
        drain();
        const comboFull = battle.skillRemain("combo");
        const leapFull = battle.skillRemain("leap");
        assert(comboFull > 0 && leapFull > 0, "两招都应在冷却");
        battle.shaveSkillCds(0);
        assert(battle.skillRemain("combo") === comboFull, "0 比例不应改冷却");
        battle.shaveSkillCds(0.2);
        assert(Math.abs(battle.skillRemain("combo") - comboFull * 0.8) < 1e-6, "普通点击应减 20% 剩余冷却");
        assert(Math.abs(battle.skillRemain("leap") - leapFull * 0.8) < 1e-6, "普通点击应对所有绝招生效");
        assert(battle.skillRemain("peck") === 0, "已转好的招不应被点出冷却");
        const comboAfterGood = battle.skillRemain("combo");
        battle.shaveSkillCds(0.2);
        assert(Math.abs(battle.skillRemain("combo") - comboAfterGood * 0.8) < 1e-6, "再次普通点击应继续叠乘");
        battle.shaveSkillCds(0.4);
        assert(Math.abs(battle.skillRemain("combo") - comboAfterGood * 0.8 * 0.6) < 1e-6, "完美点击应再叠 40%");
        for (let i = 0; i < 8; i++) battle.shaveSkillCds(0.4);
        const comboFloor = battle.skillRemain("combo");
        assert(comboFloor > 0, "叠加后仍应有冷却");
        assert(Math.abs(comboFloor - comboFull * 0.2) < 1e-6, "点击最多减到满冷却的 20%");
        battle.shaveSkillCds(0.4);
        assert(battle.skillRemain("combo") === comboFloor, "触及下限后不应再减");
        assert(battle.skillRemain("peck") === 0, "下限不能把已转好的招重新锁上");
    });

    ok("小怪不能放绝招，Boss 与玩家共用本图技能池且不降级禁用招", () => {
        const run = new RunState(31);
        run.confirmAppearance(defaultAppearance());
        const kit = run.unlockedSkills();
        assert(kit.includes("peck") && kit.includes("combo") && !kit.includes("leap"), "开局应只有第一图两招");
        assert(gameNumber("battle_bossSkillMapLimit") === 1, "Boss 应跟玩家本图解锁走");
        assert(gameNumber("battle_bossSkillCooldown") < gameNumber("battle_skillCooldown"), "Boss 绝招冷却应短于通用技能冷却");
        assert(enemySkillsForEncounter(false, kit).length === 0, "小怪技能池应为空");
        assert(enemySkillsForEncounter(true, kit).join() === kit.join(), "Boss 技能池应直接等于本图已解锁");
        assert(!enemySkillsForEncounter(true, kit).includes("leap"), "第一图 Boss 技能池不应含天外飞鸡");

        const p = run.playerFighter(), e = run.enemyFighter();
        p.stats = { ...p.stats, atk: 20, def: 0, spd: 12, crit: 0, hp: 900, maxHp: 900, firstStrike: 1 };
        e.stats = { ...e.stats, atk: 20, def: 0, spd: 12, crit: 0, hp: 900, maxHp: 900, firstStrike: 1 };
        p.fightStyle = "brawler";
        e.fightStyle = "brawler";

        const countSkills = (session: BattleSession, side: "player" | "enemy") => {
            const styles: StrikeStyle[] = [];
            session.beginCombat();
            let guard = 0;
            while (!session.done && guard++ < 8000) {
                for (const ev of session.tick(0.05)) {
                    if (ev.type === "action" && ev.kind === "skill" && ev.side === side) styles.push(ev.style);
                }
                for (const who of ["player", "enemy"] as const) {
                    if (session.striking(who)) session.resolveStrike(who, true);
                }
            }
            return styles;
        };

        const minion = new BattleSession(p, e, 31, false, () => ({ kind: "skill", style: "leap" }), {
            playerManualSkills: true, playerSkills: kit, enemySkills: []
        });
        assert(countSkills(minion, "enemy").length === 0, "热身小怪即使决策要放绝招也不能放");

        const silent = new BattleSession(p, e, 32, false);
        assert(countSkills(silent, "enemy").length === 0, "不传技能池的小怪默认不能放绝招");

        const natural = new BattleSession(p, e, 33, true, undefined, {
            playerManualSkills: true, playerSkills: kit
        });
        const naturalStyles = countSkills(natural, "enemy");
        assert(naturalStyles.length >= 2, `Boss 应从缩小后的本图技能池放绝招，实际 ${naturalStyles.length}`);
        assert(naturalStyles.every(style => kit.includes(style)), `Boss 绝招应落在 ${kit.join("/")}，实际 ${[...new Set(naturalStyles)].join("/")}`);
        assert(!naturalStyles.includes("leap"), "第一图 Boss 不该放出天外飞鸡");

        const forced = new BattleSession(p, e, 34, true, () => ({ kind: "skill", style: "leap" }), {
            playerManualSkills: true, playerSkills: kit, enemySkills: kit
        });
        assert(countSkills(forced, "enemy").length === 0, "未允许的招不能降级成别的绝招");
    });

    ok("哈鸡米、新一鸡、坤坤有专属对战曲", () => {
        const audio = path.resolve(process.cwd(), "assets/bundle/game/audio/boss_battle");
        const named: Record<string, string> = { s3_official: "hajimi.mp3", s4_official: "xinyi.mp3", kun_boss: "kun.mp3" };
        for (const [id, file] of Object.entries(named)) {
            assert(!!getRoute().find(n => n.enemyId === id && n.kind === "boss"), `${id} 应是 boss 节点`);
            assert(fs.existsSync(path.join(audio, file)), `缺少 ${file}`);
        }
    });

    ok("引导进度跟存档走，清档后重来", () => {
        const run = new RunState(1);
        bindGuideRun(run);
        resetGuideProgress();
        assert(!isGuideDone("map-battle") && !isGuideDone("shop-buy") && !isGuideDone("reward-pick") && !isGuideDone("map-skip"), "新进度未完成");
        markGuideDone("map-battle");
        markGuideDone("map-battle");
        assert(isGuideDone("map-battle") && !isGuideDone("shop-buy"), "只标记点过的步骤");
        const restored = decodeRun(encodeRun(run));
        bindGuideRun(restored);
        assert(isGuideDone("map-battle") && !isGuideDone("reward-pick"), "读档后仍是本局已看过");
        const raw = JSON.parse(encodeRun(new RunState(2)));
        delete raw.permanent.guideDone;
        bindGuideRun(decodeRun(JSON.stringify(raw)));
        assert(!isGuideDone("map-battle") && !isGuideDone("reward-pick"), "旧档没有引导字段则本局视为未看过");
        bindGuideRun(new RunState(3));
        assert(!isGuideDone("map-battle"), "另一局存档不继承引导");
        resetGuideProgress();
        bindGuideRun(null);
    });

    if (fail.length) {
        console.log("\nFAILED", fail.length);
        process.exit(1);
    }
    console.log("\nALL PASS", total);
}

run();
