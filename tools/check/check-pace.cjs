/**
 * 量战斗的观赏性：招式够不够杂、演出会不会反过来拖住节奏、一场到底打多久。
 *
 * 两件事是别处测不到的：
 * 一是招式分布。数值在一场里几乎不变，招式若跟判据一一绑死，通场就只有一个动作
 * ——改之前飞扑一种占了全部出招的 65%，只看胜负的断言完全发现不了。
 * 二是演出预算。逻辑层出招期间挂着 busy 不出新招，所以「起手到打着」这段动画
 * 一旦长过最快出手间隔，演出就会顶住节奏，把速度堆上去的收益白白吃掉。
 *
 * 用法: node tools/check-pace.cjs（需先跑过 run-verify 产出编译结果）
 */
const fs = require("fs");
const path = require("path");

const G = path.resolve(__dirname, "../../temp/verify/assets/script/game");
if (!fs.existsSync(G)) {
    console.error("缺少编译产物，先跑 node tools/run-verify.cjs");
    process.exit(2);
}

const { BattleSession } = require(path.join(G, "core/BattleSession.js"));
const { RunState } = require(path.join(G, "core/RunState.js"));
const { bindTables } = require(path.join(G, "core/Config.js"));
const { defaultAppearance } = require(path.join(G, "core/Types.js"));

const dir = path.resolve(__dirname, "../../assets/bundle/config/game");
const tables = {};
for (const n of ["Story", "Taunt", "Player", "Stage", "Route", "Enemy", "Item", "Set", "Part", "Reward", "GameRule", "Map", "Language", "DanmakuRule"]) {
    tables[n] = JSON.parse(fs.readFileSync(path.join(dir, n + ".json"), "utf8"));
}
bindTables(tables);

/** BattleSession 里的 MIN_INTERVAL：出手间隔再快也不会低于这个数。 */
const MIN_INTERVAL = tables.GameRule.battle_minInterval.value;
/** 双方站位相距 377，躯干包围盒相交就算打着，所以真正要挪的大约是这么多。 */
const GAP = 267;
const DT = 1 / 60;

/** 以 step 为步幅挪完 GAP 要几步，advance 一步一次 tween，只能取整。 */
function steps(step) {
    return Math.max(1, Math.ceil(GAP / step));
}

/**
 * 各招式从起手到打着为止的秒数，逐项对着 ChickenActor 里的动画时长算。
 * **改了那边的时长，这张表要跟着改**，否则这里量出来的节奏是假的。
 */
const LEAD = {
    // peck/jump/leap 起手前多了极短的蓄力顿，和 ChickenActor 对齐
    peck: 0.04 + steps(130) * 0.09,
    jump: 0.04 + steps(168) * 0.18,
    dive: 0.14 + steps(220) * 0.12,
    // 腾空下砸直接砸到对手头上，不走 advance
    leap: 0.05 + 0.2 + 0.13 + 0.15,
    charge: steps(250) * 0.08,
    tail: steps(150) * 0.09,
    combo: steps(160) * 0.08,
    // 绕到背后时落点离对手只剩 96，基本贴上了，补一步就够
    feint: 0.09 + 0.06 + 0.24 + 0.08
};

function fresh(seed) {
    const run = new RunState(seed);
    run.confirmAppearance(defaultAppearance());
    return run;
}

/** anim 为假时接触即结算，用来对照演出到底拖了多少。 */
function play(player, enemy, boss, anim) {
    const s = new BattleSession(player, enemy, 11, boss);
    s.intro();
    s.beginCombat();
    const due = { player: -1, enemy: -1 };
    // 无演出比较保持相同逻辑步长，避免不同取整误差改变同帧出手顺序。
    const reference = tables.GameRule.battle_referenceSeconds.value;
    const step = anim ? DT : DT * (enemy.targetBattleSeconds ?? reference) / reference;
    let t = 0;
    let guard = 0;
    while (!s.done && guard++ < 60000) {
        for (const ev of s.tick(step)) {
            if (ev.type === "action" && ev.kind !== "heal") {
                due[ev.side] = t + (anim ? LEAD[ev.style] : 0);
            }
        }
        for (const side of ["player", "enemy"]) {
            if (due[side] >= 0 && t >= due[side]) {
                due[side] = -1;
                if (s.striking(side)) s.resolveStrike(side, true);
            }
        }
        t += step;
    }
    return t;
}

/** 跑整局线性路线，统计战斗节点的出招构成。 */
function tally(seed, out) {
    const run = fresh(seed);
    let guard = 0;
    while (run.phase !== "boss" && guard++ < 20) {
        if (run.screen === "shop") {
            run.leaveShop();
            continue;
        }
        const s = new BattleSession(run.playerFighter(), run.enemyFighter(), seed + run.routeNode, false);
        s.resolveAll();
        for (const ev of s.events) {
            if (ev.type !== "action") continue;
            out[ev.style] = (out[ev.style] || 0) + 1;
        }
        advance(run);
        if (run.screen === "ending") break;
    }
    if (run.phase === "boss") {
        const s = new BattleSession(run.playerFighter(), run.enemyFighter(), seed + 99, true);
        s.resolveAll();
        for (const ev of s.events) if (ev.type === "action") out[ev.style] = (out[ev.style] || 0) + 1;
    }
}

/**
 * 打赢一个战斗节点并挑掉部位强化，走到下一个路线节点。
 * 关闭商店弹出不推进关卡，也不会重新生成货架。
 */
function advance(run) {
    if (run.screen === "shop") {
        run.leaveShop();
        return;
    }
    run.settle(true);
    run.afterResult();
    let guard = 0;
    while (run.screen === "reward" && guard++ < 4) {
        const cards = run.upgrades;
        run.pickReward(cards[0].id);
    }
    if (run.screen === "shop") run.leaveShop();
}

/** 一路打赢并且每次都挑强化，拿到刚走到鸡王时的真实状态。 */
function growToBoss(seed) {
    const run = fresh(seed);
    let guard = 0;
    while (run.currentRoute().encounter !== "final" && guard++ < 60) advance(run);
    return run;
}

const bad = [];

const spread = {};
for (const seed of [3, 7, 11, 19, 23, 31, 42, 57]) tally(seed, spread);
const total = Object.keys(spread).reduce((a, k) => a + spread[k], 0);
console.log("招式分布（八局合计 " + total + " 次出招）");
const ranked = Object.keys(spread).sort((a, b) => spread[b] - spread[a]);
for (const k of ranked) {
    const pct = 100 * spread[k] / total;
    console.log("  " + k.padEnd(8) + String(spread[k]).padStart(5) + "  " + pct.toFixed(1).padStart(5) + "%  " + "#".repeat(Math.round(pct / 2)));
}
if (ranked.length < 6) bad.push(`只用到 ${ranked.length} 种招式，太单一`);
const top = 100 * spread[ranked[0]] / total;
if (top > 30) bad.push(`${ranked[0]} 占了 ${top.toFixed(0)}%，一种招式压场`);

console.log("\n接触前耗时（须短于最快出手间隔 " + MIN_INTERVAL + "s）");
for (const k of Object.keys(LEAD).sort((a, b) => LEAD[b] - LEAD[a])) {
    const over = LEAD[k] >= MIN_INTERVAL;
    console.log("  " + k.padEnd(8) + LEAD[k].toFixed(2) + "s" + (over ? "   偏长，会顶住节奏" : ""));
    if (over) bad.push(`${k} 起手到打着要 ${LEAD[k].toFixed(2)}s，超过出手间隔`);
}

console.log("\n一场打多久");
const cases = [];
{
    const run = fresh(11);
    cases.push(["首战", run.playerFighter(), run.enemyFighter(), false, 15, 40]);

    const swift = fresh(11);
    const fast = swift.playerFighter();
    fast.stats = Object.assign({}, fast.stats, { spd: 45 });
    cases.push(["堆满速度", fast, swift.enemyFighter(), false, 8, 28]);

    const GEAR = ["iron_comb", "iron_head", "iron_body", "iron_wing", "stone_comb", "stone_head", "stone_body", "stone_leg"];

    const kun = fresh(11);
    kun.phase = "boss";
    kun.routeNode = Object.values(tables.Route).find(n => n.encounter === "final").id;
    kun.ownedIds = GEAR;
    kun.equipSet("stone_crown");
    kun.equipItem("iron_wing");
    cases.push(["鸡王战", kun.playerFighter(), kun.enemyFighter(), true, 20, 45]);

    // 真实走到鸡王的玩家吃过三次三选一，比上面那只强不少。
    // 强化把这一场压得太短的话，通关就没有紧张感了，所以单独盯一遍。
    const grown = growToBoss(11);
    grown.ownedIds = GEAR;
    grown.equipSet("stone_crown");
    grown.equipItem("iron_wing");
    cases.push(["鸡王战·练过", grown.playerFighter(), grown.enemyFighter(), true, 18, 45]);
}
for (const [label, p, e, boss, lo, hi] of cases) {
    const bare = play(p, e, boss, false);
    const full = play(p, e, boss, true);
    console.log("  " + label.padEnd(10)
        + ("不含演出 " + bare.toFixed(1) + "s").padEnd(18)
        + ("含演出 " + full.toFixed(1) + "s").padEnd(16)
        + "演出拖了 " + (full - bare).toFixed(1) + "s");
    const reference = tables.GameRule.battle_referenceSeconds.value;
    const ratio = (e.targetBattleSeconds ?? reference) / reference;
    if (ratio === 1) {
        if (full < lo || full > hi) bad.push(`${label} ${full.toFixed(1)}s 不在 ${lo}~${hi}s 区间`);
    }
    else {
        // 单怪时长可配以后，不再用固定的45秒上限约束Boss。
        // 与同一属性、同一随机种子的参考节奏比较，检查逻辑缩放和演出趋势。
        const baseEnemy = { ...e, targetBattleSeconds: reference };
        const baseBare = play(p, baseEnemy, boss, false);
        const baseFull = play(p, baseEnemy, boss, true);
        if (Math.abs(bare / baseBare - ratio) > 0.1) bad.push(`${label} 逻辑时长未按单怪配置缩放`);
        if (ratio > 1 && full < baseFull || ratio < 1 && full > baseFull) bad.push(`${label} 演出后时长变化方向错误`);
    }
}

if (bad.length) {
    console.log("\n不合格 " + bad.length + " 项");
    for (const b of bad) console.log("  - " + b);
    process.exit(1);
}
console.log("\n战斗节奏与招式分布合格");
