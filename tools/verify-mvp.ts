import fs from "fs";
import path from "path";
import { BattleBrain } from "../assets/script/game/battle/BattleBrain";
import { AiFighter, decideAction, decide } from "../assets/script/game/core/BattleAI";
import { BattleSession } from "../assets/script/game/core/BattleSession";
import { getItems, getRoute, getSets } from "../assets/script/game/core/Catalog";
import { bindTables } from "../assets/script/game/core/Config";
import { buildStats, combatPower, setPrice } from "../assets/script/game/core/EquipMath";
import { upgradeOf } from "../assets/script/game/core/PartUpgrade";
import { rollUpgrades } from "../assets/script/game/core/RewardGen";
import { RunState } from "../assets/script/game/core/RunState";
import { decodeRun, encodeRun, RUN_SAVE_KEY, RunSaveStore } from "../assets/script/game/core/RunSave";
import { Appearance, defaultAppearance } from "../assets/script/game/core/Types";

/** 直接跑源码时在脚本旁边，编译到 temp 再跑时只能从工作目录找。 */
function tableDir(): string {
    const tries = [
        path.resolve(__dirname, "../assets/bundle/config/game"),
        path.resolve(process.cwd(), "assets/bundle/config/game")
    ];
    const hit = tries.find(p => fs.existsSync(p));
    if (!hit) throw new Error("找不到配表目录 assets/bundle/config/game");
    return hit;
}

function loadTables() {
    const dir = tableDir();
    const names = ["Player", "Stage", "Route", "Enemy", "Item", "Set", "Part", "Reward"];
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
        assert(getRoute().length === 30, "五张地图应有30个独立节点");
        for (let mapId = 1; mapId <= 5; mapId++) {
            assert(getRoute().filter(n => n.mapId === mapId).map(n => n.kind).join(",") === "battle,battle,shop,battle,shop,boss", "每图应是三战两店一王");
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
        const prefab = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "assets/bundle/gui/map/map.prefab"), "utf8"));
        const shops = prefab.filter((obj: any) => obj.__type__ === "cc.Node" && /^BtnShop/.test(obj._name));
        assert(shops.length === 1 && shops[0]._name === "BtnShop", "地图仅有统一商店入口");
    });

    ok("旧商店节点存档恢复下一战斗关，并保留货架和待弹出事件", () => {
        for (const shop of getRoute().filter(node => node.kind === "shop")) {
            const run = new RunState(45);
            run.routeNode = shop.id + 1; run.phase = getRoute().find(node => node.id === run.routeNode)!.kind;
            run.gold = 500; run.openShop(); run.buyItem(run.shopItems[0].id);
            const stock = run.shopItems.map(item => item.id).join(",");
            const old = JSON.parse(encodeRun(run));
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
        run.pickReward(run.upgrades[0].id);
        assert(run.routeNode === 2 && run.phase === "battle", "节点1胜利进入节点2");
        run.settle(true);
        assert(run.routeNode === 4 && run.phase === "battle" && run.shopPending, "第二战结算即开放第三战并记录弹出");
        run.afterResult();
        run.pickReward(run.upgrades[0].id);
        assert(run.routeNode === 4 && run.phase === "battle", "弹出商店不占用关卡进度");
        assert(run.screen === "shop" && !run.shopPending, "商店自动弹出一次");
        run.leaveShop();
        run.enterFight();
        assert(String(run.screen) === "prebattle" && run.routeNode === 4, "无需购买便可挑战第三战");
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
        run.buySet("iron_beak");
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
        run.gold = 1000; run.buySet("iron_beak"); run.buySet("stone_crown");
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
        run.gold = 1000; run.buySet("kunkun");
        const base = run.playerFighter().appearance;
        let saved = "";
        run.onChanged = () => { saved = encodeRun(run); };
        run.equipSet("kunkun");
        const restored = decodeRun(saved);
        assert(restored.playerFighter().appearance.colors.body === "#1D1D1D" && restored.playerFighter().stats.lockHp, "穿戴外观和特殊属性随存档恢复");
        restored.routeNode = 6; restored.phase = "boss"; restored.screen = "battle";
        assert(!restored.equipItem("kun_body"), "战斗快照期间不能换装");
        restored.settle(false);
        assert(restored.equippedIds.length === 4 && restored.routeNode === 1, "BOSS失败不丢穿戴状态");
        restored.equipSet("kunkun");
        assert(JSON.stringify(restored.playerFighter().appearance) === JSON.stringify(base), "卸下恢复自定义配色且去掉装备图");
        assert(decodeRun(encodeRun(restored)).equippedIds.length === 0, "空穿戴不能被读档自动穿回");
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

    ok("决战前商店弹出时鸡王已开放，返回不额外推进", () => {
        const run = new RunState(4);
        run.confirmAppearance(defaultAppearance());
        run.routeNode = 4;
        run.settle(true);
        assert(run.routeNode === 6 && run.phase === "boss", "第三战胜利即开放BOSS");
        run.afterResult();
        run.pickReward(run.upgrades[0].id);
        assert(run.screen === "shop", "决战前仍弹出商店");
        run.leaveShop();
        assert(run.routeNode === 6 && run.phase === "boss", "第二个商店后应是鸡王");
        assert(run.enemyFighter().name.indexOf("坤坤") >= 0, "对手应是坤坤");
        run.settle(true);
        run.afterResult();
        assert(run.screen === "map" && run.routeNode === 7, "首图鸡王胜利后进入第二图");
        assert(run.rewards.length === 0 && run.upgrades.length === 0, "赢了鸡王直接通关，不该再发牌");
    });

    ok("五图逐图推进且保留养成，最终BOSS才结局", () => {
        const run = new RunState(24);
        run.confirmAppearance(defaultAppearance());
        run.gold = 100;
        run.ownedIds = ["iron_head"];
        run.levelUp("head");
        let guard = 0;
        while (run.screen !== "ending" && guard++ < 40) {
            const map = run.currentMap().id;
            assert(run.route().length === 4 && run.route().every(n => n.mapId === map && n.kind !== "shop"), "地图只显示本图四个战斗关卡");
            if (run.screen === "shop") {
                run.leaveShop();
            } else {
                run.settle(true);
                run.afterResult();
                if (run.screen === "reward") run.pickReward(run.upgrades[0].id);
            }
        }
        assert(run.screen === "ending" && run.routeNode === 30, "只有第30节点结束后才总通关");
        assert(run.ownedIds.includes("iron_head") && (run.partLevels.head || 0) >= 1 && run.gold > 100, "换图保留装备强化金币");
        const retry = new RunState(25);
        retry.routeNode = 12;
        retry.phase = "boss";
        retry.screen = "battle";
        retry.settle(false);
        retry.afterResult();
        retry.pickReward(retry.upgrades[0].id);
        assert(retry.routeNode === 7 && String(retry.screen) === "map", "第二图BOSS失败从第二图第一小关重来");
    });

    ok("未结算时关闭游戏不算打过，小关与BOSS均从战前重打", () => {
        for (const id of [1, 4, 6, 12, 30]) {
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
        for (const id of [1, 2, 4]) {
            const run = new RunState(37);
            run.routeNode = id; run.stage = id; run.screen = "battle";
            let saved = "";
            run.onChanged = () => { saved = encodeRun(run); };
            run.settle(true);
            const restored = decodeRun(saved);
            const next = getRoute().find(node => node.id > id && node.kind !== "shop")!.id;
            assert(restored.routeNode === next && restored.stage === next, "胜利回调已保存下一战斗关");
            assert(restored.screen === "result" && restored.upgrades.length === 3 && restored.claimedGoldNodes.includes(id), "结算结果与待选强化一并保留");
            restored.afterResult();
            restored.pickReward(restored.upgrades[0].id);
            assert(restored.routeNode === next, "确认强化不能再次推进");
            assert(String(restored.screen) === (id === 1 ? "map" : "shop"), "恢复待选强化后保留商店弹出");
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

    ok("BOSS失败立即保存回退但永久养成和首通记录不变", () => {
        const run = new RunState(33);
        run.gold = 1000;
        run.buySet("iron_beak");
        run.levelUp("head");
        run.completedMaps = [1];
        run.claimedGoldNodes = [1, 2, 4, 6, 7, 8, 10];
        run.routeNode = 12;
        run.phase = "boss";
        run.screen = "battle";
        const before = JSON.stringify(JSON.parse(encodeRun(run)).permanent);
        let saved = "";
        run.onChanged = () => { saved = encodeRun(run); };
        run.settle(false);
        const restored = decodeRun(saved);
        assert(restored.routeNode === 7 && restored.stage === 7 && restored.phase === "battle", "结算时已回退第二图起点");
        assert(JSON.stringify(JSON.parse(saved).permanent) === before, "失败不清永久养成和首通账本");
        restored.afterResult();
        if (restored.upgrades.length) restored.pickReward(restored.upgrades[0].id);
        restored.enterFight();
        restored.settle(true);
        assert(restored.lastGoldGain === 0, "重打第二图已首通小关不能再刷金币");
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

    ok("BOSS胜利自动保存通关锁定和下一图，不依赖按钮", () => {
        const run = new RunState(35);
        run.routeNode = 6;
        run.phase = "boss";
        run.screen = "battle";
        let saved = "";
        run.onChanged = () => { saved = encodeRun(run); };
        run.settle(true);
        const restored = decodeRun(saved);
        assert(restored.completedMaps.includes(1), "结算页关闭也已经保存大关通关");
        assert(restored.routeNode === 7 && restored.phase === "battle", "结算回调中已推进并保存下图首关");
        restored.enterFight();
        assert(restored.screen === "result", "通关后不能重复挑战BOSS");
        restored.afterResult();
        assert(restored.routeNode === 7 && restored.screen === "map", "恢复胜利结算后进入下一大关");
        restored.afterResult();
        assert(restored.routeNode === 7, "重复继续不能跳过下图第一关");
        restored.routeNode = 30; restored.phase = "boss"; restored.screen = "battle";
        restored.settle(true);
        const finalResult = decodeRun(encodeRun(restored));
        assert(finalResult.completedMaps.includes(5) && finalResult.screen === "result", "最终关不点按钮也已保存通关");
        restored.afterResult();
        const final = decodeRun(encodeRun(restored));
        assert(final.screen === "ending" && final.completedMaps.includes(5), "最终图通关永久保留结局");
    });

    ok("旧版等待按钮推进的胜利存档在读档时修正且不重复推进", () => {
        for (const id of [1, 2, 6, 24, 30]) {
            const run = new RunState(38);
            run.routeNode = id; run.phase = getRoute().find(n => n.id === id)!.kind; run.screen = "battle";
            run.settle(true);
            const old = JSON.parse(encodeRun(run));
            old.progress.routeNode = id;
            const restored = decodeRun(JSON.stringify(old));
            const next = getRoute().find(node => node.id > id && node.kind !== "shop")?.id ?? id;
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

    ok("强化不足三项展示剩余，全满不再发牌", () => {
        const run = new RunState(36);
        for (const part of ["head", "neck", "body", "wing"] as const) run.partLevels[part] = upgradeOf(part)!.maxLevel;
        assert(rollUpgrades(1, 36, run.partLevels).length === 1, "仅剩脚部时只有一张");
        run.partLevels.leg = upgradeOf("leg")!.maxLevel;
        run.confirmAppearance(defaultAppearance());
        run.settle(true); run.afterResult();
        assert(run.upgrades.length === 0 && run.routeNode === 2 && run.screen === "map", "全满后不能卡在空强化页");
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

    ok("强化只加一份属性并撑大部位", () => {
        const run = new RunState(12);
        run.confirmAppearance(defaultAppearance());
        const before = run.playerFighter();
        const step = upgradeOf("head")!.stats.atk!;
        run.levelUp("head");
        const after = run.playerFighter();
        // 等级和 bonus 各加一次就会变成双倍，这条断言专门盯这个。
        assert(after.stats.atk === before.stats.atk + step, "练一级只该加一份攻击");
        assert((after.appearance.partScale?.head ?? 1) > 1, "练过的部位要变大");
        assert((after.appearance.partScale?.wing ?? 1) === 1, "没练的部位不该变大");
        assert(combatPower(after.stats) > combatPower(before.stats), "强化应体现在战力上");

        const comboBefore = run.playerFighter().stats.combo ?? 0;
        const comboStep = upgradeOf("wing")!.stats.combo!;
        run.levelUp("wing");
        assert((run.playerFighter().stats.combo ?? 0) === comboBefore + comboStep, "翅膀强化应增加连击");
    });

    ok("部位练满后不再发牌", () => {
        const run = new RunState(13);
        const def = upgradeOf("head")!;
        for (let i = 0; i < def.maxLevel + 3; i++) run.levelUp("head");
        assert(run.partLevels.head === def.maxLevel, "等级不该超过配表上限");
        const cards = rollUpgrades(1, 99, run.partLevels);
        assert(cards.every(c => c.part !== "head"), "练满的部位不该再出现");
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
        run.routeNode = 6;
        run.ownedIds = ["iron_comb", "iron_head", "iron_body", "iron_wing", "stone_comb", "stone_head", "stone_body", "stone_leg"];
        run.equipSet("stone_crown");
        run.equipItem("iron_wing");
        const boss = seconds(run.playerFighter(), run.enemyFighter(), true);
        assert(boss > 10 && boss < 50, `鸡王战 ${boss.toFixed(1)}s 超出预期`);
    });

    if (fail.length) {
        console.log("\nFAILED", fail.length);
        process.exit(1);
    }
    console.log("\nALL PASS", total);
}

run();
