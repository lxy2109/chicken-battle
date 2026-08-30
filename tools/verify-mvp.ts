import fs from "fs";
import path from "path";
import { BattleBrain } from "../assets/script/game/battle/BattleBrain";
import { AiFighter, decideAction, decide } from "../assets/script/game/core/BattleAI";
import { BattleSession } from "../assets/script/game/core/BattleSession";
import { getItems, getSets } from "../assets/script/game/core/Catalog";
import { bindTables } from "../assets/script/game/core/Config";
import { buildStats, combatPower, setPrice } from "../assets/script/game/core/EquipMath";
import { RunState } from "../assets/script/game/core/RunState";
import { Appearance, StagePhase, defaultAppearance } from "../assets/script/game/core/Types";

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
        // 标注成 StagePhase，直接写字面量会让 TS 把 run.phase 窄化，
        // 后面断言它变回 warmup 就成了"永远不成立"的比较。
        run.phase = "official" as StagePhase;
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
        run.phase = "official" as StagePhase;
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
        // 实测铁喙套能打穿第五关而纯疾风套打不动，战力排序不能反过来误导玩家。
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
        // 能走到鸡王的玩家必然凑齐了套装，拿裸装去打只会被秒，测不出节奏。
        run.phase = "boss";
        run.ownedIds = ["iron_comb", "iron_head", "iron_body", "iron_wing", "stone_comb", "stone_head", "stone_body", "stone_leg"];
        const boss = seconds(run.playerFighter(), run.enemyFighter(), true);
        assert(boss > 10 && boss < 50, `鸡王战 ${boss.toFixed(1)}s 超出预期`);
    });

    if (fail.length) {
        console.log("\nFAILED", fail.length);
        process.exit(1);
    }
    console.log("\nALL PASS", 16);
}

run();
