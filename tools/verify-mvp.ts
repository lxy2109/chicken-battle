import fs from "fs";
import path from "path";
import { decideAction, decide } from "../assets/script/game/core/BattleAI";
import { BattleSession } from "../assets/script/game/core/BattleSession";
import { getItems, getSets } from "../assets/script/game/core/Catalog";
import { bindTables } from "../assets/script/game/core/Config";
import { buildStats, setPrice } from "../assets/script/game/core/EquipMath";
import { RunState } from "../assets/script/game/core/RunState";
import { Appearance, defaultAppearance } from "../assets/script/game/core/Types";

function loadTables() {
    const dir = path.resolve(__dirname, "../assets/bundle/config/game");
    const names = ["Player", "Stage", "Enemy", "Item", "Set", "Part", "Reward"];
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
    const ok = (name: string, fn: () => void) => {
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
    });
    ok("自定义外观", () => {
        const run = new RunState(1);
        const a: Appearance = defaultAppearance();
        a.face = "cute";
        a.colors.body = "#2A9D8F";
        run.confirmAppearance(a);
        assert(run.screen === "map", "应进入村口");
        assert(run.playerFighter().appearance.face === "cute", "表情应保存");
    });

    ok("热身可败仍进正式赛", () => {
        const run = new RunState(2);
        run.confirmAppearance(defaultAppearance());
        run.enterFight();
        run.settle(false);
        run.afterResult();
        assert(run.screen === "shop", "热身后应进商店");
        run.leaveShop();
        assert(run.phase === "official", "应进入正式赛");
        assert(run.gold > 0, "热身失败也应给少量金币");
    });

    ok("正式赛失败整局重来", () => {
        const run = new RunState(3);
        run.confirmAppearance(defaultAppearance());
        run.phase = "official";
        run.stage = 2;
        run.settle(false);
        run.afterResult();
        assert(run.phase === "warmup", "应回到热身");
        assert(run.stage === 2, "局数不变");
        assert(run.screen === "map", "回到村口");
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

    ok("五局后打鸡王", () => {
        const run = new RunState(4);
        run.confirmAppearance(defaultAppearance());
        run.stage = 5;
        run.phase = "official";
        run.settle(true);
        run.afterResult();
        run.skipReward();
        run.leaveShop();
        assert(run.phase === "boss", "第五局后应是鸡王");
        assert(run.enemyFighter().name.indexOf("坤坤") >= 0, "对手应是坤坤");
        run.settle(true);
        run.afterResult();
        assert(run.screen === "ending", "打败鸡王应胜利");
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
        session.step();
        while (!session.done && !session.hasPending) session.step();
        if (session.hasPending) session.whiff();
        assert(session.events.some(e => e.type === "miss"), "没撞上不应结算伤害");
    });

    if (fail.length) {
        console.log("\nFAILED", fail.length);
        process.exit(1);
    }
    console.log("\nALL PASS", 10);
}

run();
