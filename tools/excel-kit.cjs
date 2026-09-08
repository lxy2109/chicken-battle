/**
 * 斗鸡配表：按 oops 五列表头写/读 Excel，导出 JsonUtil 用的 json。
 * 用法：node tools/excel-kit.cjs
 */
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");

const ROOT = path.resolve(__dirname, "..");
const XLSX = process.env.CHICKEN_BATTLE_XLSX
    ? path.resolve(ROOT, process.env.CHICKEN_BATTLE_XLSX)
    : path.join(ROOT, "excel", "斗鸡配置.xlsx");
const JSON_DIR = process.env.CHICKEN_BATTLE_JSON_DIR
    ? path.resolve(ROOT, process.env.CHICKEN_BATTLE_JSON_DIR)
    : path.join(ROOT, "assets/bundle/config/game");

const PAL = ["#E23B3B", "#F4D35E", "#EE964B", "#7B4B2A", "#2A9D8F", "#264653", "#E76F51", "#FFFFFF", "#8E44AD", "#3498DB"];
const FACES = ["fierce", "dumb", "proud", "cute"];
const FACE_NAME = { fierce: "凶", dumb: "呆", proud: "傲", cute: "萌" };
const STAGE_NAMES = ["东篱", "麦场", "祠堂", "河滩", "校场"];

function enemyStats(stage, warmup, boss) {
    const n = boss ? 6 : stage;
    const mul = warmup ? 0.72 : 1;
    return {
        maxHp: Math.round((90 + n * 28) * mul),
        atk: Math.round((14 + n * 4) * mul),
        def: Math.round((4 + n * 2) * mul),
        spd: Math.round((8 + n) * mul),
        crit: Math.round((0.08 + n * 0.015) * 1000) / 1000,
        revive: boss ? 1 : 0,
        healPerTurn: boss ? 5 : 0,
        lockHp: 0
    };
}

function enemyLook(stage, boss) {
    if (boss) {
        return { face: "proud", comb: "#FF4D6D", head: "#222222", body: "#111111", wing: "#444444", tail: "#FFD60A", leg: "#E09F3E" };
    }
    return {
        face: FACES[stage % FACES.length],
        comb: PAL[(stage + 1) % PAL.length],
        head: PAL[(stage + 3) % PAL.length],
        body: PAL[stage % PAL.length],
        wing: "#EE964B",
        tail: "#7B4B2A",
        leg: "#E09F3E"
    };
}

const COLS = {
    Player: [
        ["编号", "id", "int"],
        ["玩家名", "name", "string"],
        ["生命", "maxHp", "int"],
        ["攻击", "atk", "int"],
        ["防御", "def", "int"],
        ["速度", "spd", "int"],
        ["暴击", "crit", "float"],
        ["鸡王敌人id", "bossEnemyId", "string"],
        ["击败鸡王金币", "bossGoldWin", "int"],
        ["鸡王提示", "hintBoss", "string"],
        ["垃圾话1", "taunt1", "string"],
        ["垃圾话2", "taunt2", "string"],
        ["垃圾话3", "taunt3", "string"]
    ],
    Stage: [
        ["编号【关卡】", "id", "int"],
        ["关卡名", "name", "string"],
        ["热身敌人id", "warmupEnemyId", "string"],
        ["正式敌人id", "officialEnemyId", "string"],
        ["热身胜金币", "warmupGoldWin", "int"],
        ["热身败金币", "warmupGoldLose", "int"],
        ["正式胜金币", "officialGoldWin", "int"],
        ["热身提示", "hintWarmup", "string"],
        ["正式提示", "hintOfficial", "string"]
    ],
    Route: [
        ["节点编号", "id", "int"],
        ["地图编号", "mapId", "int"],
        ["节点类型 battle/shop/boss", "kind", "string"],
        ["节点名", "name", "string"],
        ["敌人id", "enemyId", "string"],
        ["胜利金币", "goldWin", "int"],
        ["失败金币", "goldLose", "int"]
    ],
    Enemy: [
        ["编号", "id", "string"],
        ["名字", "name", "string"],
        ["生命", "maxHp", "int"],
        ["攻击", "atk", "int"],
        ["防御", "def", "int"],
        ["速度", "spd", "int"],
        ["暴击", "crit", "float"],
        ["复活", "revive", "int"],
        ["每回合回血", "healPerTurn", "int"],
        ["锁血", "lockHp", "int"],
        ["表情", "face", "string"],
        ["鸡冠色", "comb", "string"],
        ["头色", "head", "string"],
        ["身色", "body", "string"],
        ["翅色", "wing", "string"],
        ["尾色", "tail", "string"],
        ["腿色", "leg", "string"],
        ["垃圾话1", "taunt1", "string"],
        ["垃圾话2", "taunt2", "string"],
        ["垃圾话3", "taunt3", "string"]
    ],
    Item: [
        ["编号", "id", "string"],
        ["名字", "name", "string"],
        ["描述", "desc", "string"],
        ["部位", "slot", "string"],
        ["套装id", "setId", "string"],
        ["价格", "price", "int"],
        ["外观件", "isSkin", "int"],
        ["特殊", "special", "string"],
        ["生命", "maxHp", "int"],
        ["攻击", "atk", "int"],
        ["防御", "def", "int"],
        ["速度", "spd", "int"],
        ["暴击", "crit", "float"],
        ["复活", "revive", "int"],
        ["回血", "healPerTurn", "int"],
        ["锁血", "lockHp", "int"],
        ["改表情", "skinFace", "string"],
        ["改颜色", "skinColor", "string"]
    ],
    Set: [
        ["编号", "id", "string"],
        ["套装名", "name", "string"],
        ["散件id列表", "pieceIds", "any"],
        ["折扣", "discount", "float"],
        ["2件生命", "b2maxHp", "int"],
        ["2件攻击", "b2atk", "int"],
        ["2件防御", "b2def", "int"],
        ["2件速度", "b2spd", "int"],
        ["2件暴击", "b2crit", "float"],
        ["2件回血", "b2healPerTurn", "int"],
        ["4件生命", "b4maxHp", "int"],
        ["4件攻击", "b4atk", "int"],
        ["4件防御", "b4def", "int"],
        ["4件速度", "b4spd", "int"],
        ["4件暴击", "b4crit", "float"],
        ["4件回血", "b4healPerTurn", "int"],
        ["4件复活", "b4revive", "int"],
        ["4件锁血", "b4lockHp", "int"]
    ],
    Part: [
        ["编号", "id", "string"],
        ["类型 color/face", "type", "string"],
        ["显示名", "name", "string"],
        ["值 色值或表情id", "value", "string"],
        ["排序", "order", "int"]
    ],
    Reward: [
        ["编号", "id", "string"],
        ["标题", "title", "string"],
        ["描述", "desc", "string"],
        ["强化部位", "part", "string"],
        ["每节点金币", "goldPerStage", "int"],
        ["生命", "maxHp", "int"],
        ["攻击", "atk", "int"],
        ["防御", "def", "int"],
        ["速度", "spd", "int"],
        ["连击", "combo", "int"],
        ["暴击", "crit", "float"],
        ["复活", "revive", "int"],
        ["回血", "healPerTurn", "int"],
        ["锁血", "lockHp", "int"],
        ["部位上限", "maxLevel", "int"],
        ["每级放大", "scalePerLevel", "float"],
        ["出现权重", "weight", "int"]
    ],
    Language: [
        ["编号【KEY】", "id", "string"],
        ["简体中文", "zh", "string"],
        ["英文", "en", "string"]
    ]
};

function seed() {
    const enemyRows = [];
    const enemyTaunt = ["咯咯咯，你也配上擂台？", "羽毛挺花，打人不行。", "回去喝汤吧。"];
    const bossTaunt = ["你们这群村口的，也配叫斗鸡？", "唱、跳、Rap、篮球……再加一脚蹬！", "坤坤在此，谁敢争锋！"];
    const stageRows = [];
    for (let s = 1; s <= 5; s++) {
        const lookW = enemyLook(s, false);
        const lookO = enemyLook(s, false);
        const w = enemyStats(s, true, false);
        const o = enemyStats(s, false, false);
        const wid = `s${s}_warmup`;
        const oid = `s${s}_official`;
        enemyRows.push(Object.assign({ id: wid, name: `散鸡·${STAGE_NAMES[s - 1]}` }, w, lookW, {
            taunt1: enemyTaunt[0], taunt2: enemyTaunt[1], taunt3: enemyTaunt[2]
        }));
        enemyRows.push(Object.assign({ id: oid, name: `村鸡·${STAGE_NAMES[s - 1]}` }, o, lookO, {
            taunt1: enemyTaunt[0], taunt2: enemyTaunt[1], taunt3: enemyTaunt[2]
        }));
        stageRows.push({
            id: s,
            name: STAGE_NAMES[s - 1],
            warmupEnemyId: wid,
            officialEnemyId: oid,
            warmupGoldWin: 20 * s,
            warmupGoldLose: 8 * s,
            officialGoldWin: 50 * s,
            hintWarmup: `第${s}局热身赛：可败，败了仍可进正式赛。`,
            hintOfficial: `第${s}局正式赛：失败则本局重来。`
        });
    }
    const b = enemyStats(0, false, true);
    const lookB = enemyLook(0, true);
    enemyRows.push(Object.assign({ id: "kun_boss", name: "鸡王·坤坤" }, b, lookB, {
        taunt1: bossTaunt[0], taunt2: bossTaunt[1], taunt3: bossTaunt[2]
    }));

    return {
        Player: [{
            id: 1, name: "村口鸡", maxHp: 120, atk: 18, def: 6, spd: 10, crit: 0.12,
            bossEnemyId: "kun_boss", bossGoldWin: 200, hintBoss: "五局已毕，鸡王坤坤在村口等你。",
            taunt1: "今儿个让你见识村口一霸！", taunt2: "你这只鸡，看着就嫩。", taunt3: "热身都站不稳？正式赛更别来。"
        }],
        Stage: stageRows,
        Route: ["东篱村", "青竹溪", "金穗田", "古祠镇", "鸡王山"].flatMap((mapName, mapIndex) => [
            { id: 1, kind: "battle", name: "东篱小怪", enemyId: "s1_official", goldWin: 50, goldLose: 0 },
            { id: 2, kind: "battle", name: "麦场小怪", enemyId: "s2_official", goldWin: 80, goldLose: 0 },
            { id: 3, kind: "shop", name: "鸡市 · 中场", enemyId: "", goldWin: 0, goldLose: 0 },
            { id: 4, kind: "battle", name: "祠堂小怪", enemyId: "s3_official", goldWin: 120, goldLose: 0 },
            { id: 5, kind: "shop", name: "鸡市 · 决战前", enemyId: "", goldWin: 0, goldLose: 0 },
            { id: 6, kind: "boss", name: "鸡王", enemyId: "kun_boss", goldWin: 200, goldLose: 0 }
        ].map(row => ({ ...row, id: mapIndex * 6 + row.id, mapId: mapIndex + 1,
            name: row.kind === "shop" ? "鸡友杂货铺" : `${mapName} · ${row.name}` }))),
        Enemy: enemyRows,
        Item: [
            { id: "iron_comb", name: "铁喙冠", desc: "攻击+3", slot: "comb", setId: "iron_beak", price: 40, isSkin: 0, special: "none", maxHp: 0, atk: 3, def: 0, spd: 0, crit: 0, revive: 0, healPerTurn: 0, lockHp: 0, skinFace: "", skinColor: "" },
            { id: "iron_head", name: "铁喙头", desc: "攻击+4", slot: "head", setId: "iron_beak", price: 50, isSkin: 0, special: "none", maxHp: 0, atk: 4, def: 0, spd: 0, crit: 0, revive: 0, healPerTurn: 0, lockHp: 0, skinFace: "", skinColor: "" },
            { id: "iron_body", name: "铁喙甲", desc: "攻击+3 生命+10", slot: "body", setId: "iron_beak", price: 55, isSkin: 0, special: "none", maxHp: 10, atk: 3, def: 0, spd: 0, crit: 0, revive: 0, healPerTurn: 0, lockHp: 0, skinFace: "", skinColor: "" },
            { id: "iron_wing", name: "铁喙翅", desc: "攻击+2 暴击+4%", slot: "wing", setId: "iron_beak", price: 45, isSkin: 0, special: "none", maxHp: 0, atk: 2, def: 0, spd: 0, crit: 0.04, revive: 0, healPerTurn: 0, lockHp: 0, skinFace: "", skinColor: "" },
            { id: "stone_comb", name: "石冠", desc: "防御+2", slot: "comb", setId: "stone_crown", price: 40, isSkin: 0, special: "none", maxHp: 0, atk: 0, def: 2, spd: 0, crit: 0, revive: 0, healPerTurn: 0, lockHp: 0, skinFace: "", skinColor: "" },
            { id: "stone_head", name: "岩盔", desc: "防御+3 生命+15", slot: "head", setId: "stone_crown", price: 55, isSkin: 0, special: "none", maxHp: 15, atk: 0, def: 3, spd: 0, crit: 0, revive: 0, healPerTurn: 0, lockHp: 0, skinFace: "", skinColor: "" },
            { id: "stone_body", name: "岩甲", desc: "生命+30", slot: "body", setId: "stone_crown", price: 60, isSkin: 0, special: "none", maxHp: 30, atk: 0, def: 0, spd: 0, crit: 0, revive: 0, healPerTurn: 0, lockHp: 0, skinFace: "", skinColor: "" },
            { id: "stone_leg", name: "岩爪", desc: "防御+2 生命+10", slot: "leg", setId: "stone_crown", price: 45, isSkin: 0, special: "none", maxHp: 10, atk: 0, def: 2, spd: 0, crit: 0, revive: 0, healPerTurn: 0, lockHp: 0, skinFace: "", skinColor: "" },
            { id: "gale_wing", name: "疾风翅", desc: "速度+4", slot: "wing", setId: "gale", price: 50, isSkin: 0, special: "none", maxHp: 0, atk: 0, def: 0, spd: 4, crit: 0, revive: 0, healPerTurn: 0, lockHp: 0, skinFace: "", skinColor: "" },
            { id: "gale_tail", name: "疾风尾", desc: "速度+3 暴击+5%", slot: "tail", setId: "gale", price: 50, isSkin: 0, special: "none", maxHp: 0, atk: 0, def: 0, spd: 3, crit: 0.05, revive: 0, healPerTurn: 0, lockHp: 0, skinFace: "", skinColor: "" },
            { id: "gale_leg", name: "疾风爪", desc: "速度+3", slot: "leg", setId: "gale", price: 40, isSkin: 0, special: "none", maxHp: 0, atk: 0, def: 0, spd: 3, crit: 0, revive: 0, healPerTurn: 0, lockHp: 0, skinFace: "", skinColor: "" },
            { id: "gale_body", name: "疾风羽", desc: "速度+2 生命+10", slot: "body", setId: "gale", price: 45, isSkin: 0, special: "none", maxHp: 10, atk: 0, def: 0, spd: 2, crit: 0, revive: 0, healPerTurn: 0, lockHp: 0, skinFace: "", skinColor: "" },
            { id: "kun_face", name: "坤坤脸", desc: "局内回血+8", slot: "face", setId: "kunkun", price: 80, isSkin: 1, special: "heal", maxHp: 0, atk: 0, def: 0, spd: 0, crit: 0, revive: 0, healPerTurn: 8, lockHp: 0, skinFace: "proud", skinColor: "" },
            { id: "kun_comb", name: "鸡王冠", desc: "复活+1", slot: "comb", setId: "kunkun", price: 90, isSkin: 1, special: "revive", maxHp: 0, atk: 0, def: 0, spd: 0, crit: 0, revive: 1, healPerTurn: 0, lockHp: 0, skinFace: "", skinColor: "#FF4D6D" },
            { id: "kun_body", name: "鸡王甲", desc: "锁血，濒死可挡一次致命", slot: "body", setId: "kunkun", price: 100, isSkin: 1, special: "lockHp", maxHp: 20, atk: 0, def: 0, spd: 0, crit: 0, revive: 0, healPerTurn: 0, lockHp: 1, skinFace: "", skinColor: "#1D1D1D" },
            { id: "kun_tail", name: "鸡王尾", desc: "回血+4 生命+15", slot: "tail", setId: "kunkun", price: 70, isSkin: 1, special: "heal", maxHp: 15, atk: 0, def: 0, spd: 0, crit: 0, revive: 0, healPerTurn: 4, lockHp: 0, skinFace: "", skinColor: "#FFD60A" }
        ],
        Set: [
            { id: "iron_beak", name: "铁喙套", pieceIds: '["iron_comb","iron_head","iron_body","iron_wing"]', discount: 0.8, b2maxHp: 0, b2atk: 4, b2def: 0, b2spd: 0, b2crit: 0, b2healPerTurn: 0, b4maxHp: 0, b4atk: 8, b4def: 0, b4spd: 0, b4crit: 0.08, b4healPerTurn: 0, b4revive: 0, b4lockHp: 0 },
            { id: "stone_crown", name: "石冠套", pieceIds: '["stone_comb","stone_head","stone_body","stone_leg"]', discount: 0.8, b2maxHp: 20, b2atk: 0, b2def: 3, b2spd: 0, b2crit: 0, b2healPerTurn: 0, b4maxHp: 40, b4atk: 0, b4def: 6, b4spd: 0, b4crit: 0, b4healPerTurn: 0, b4revive: 0, b4lockHp: 0 },
            { id: "gale", name: "疾风套", pieceIds: '["gale_wing","gale_tail","gale_leg","gale_body"]', discount: 0.8, b2maxHp: 0, b2atk: 0, b2def: 0, b2spd: 4, b2crit: 0, b2healPerTurn: 0, b4maxHp: 0, b4atk: 0, b4def: 0, b4spd: 8, b4crit: 0.1, b4healPerTurn: 0, b4revive: 0, b4lockHp: 0 },
            { id: "kunkun", name: "鸡王外观", pieceIds: '["kun_face","kun_comb","kun_body","kun_tail"]', discount: 0.75, b2maxHp: 0, b2atk: 0, b2def: 0, b2spd: 0, b2crit: 0, b2healPerTurn: 6, b4maxHp: 0, b4atk: 0, b4def: 0, b4spd: 0, b4crit: 0, b4healPerTurn: 10, b4revive: 1, b4lockHp: 1 }
        ],
        Part: PAL.map((hex, i) => ({ id: "color_" + i, type: "color", name: "色" + (i + 1), value: hex, order: i })).concat(
            FACES.map((f, i) => ({ id: "face_" + f, type: "face", name: FACE_NAME[f], value: f, order: i }))
        ),
        Reward: [
            { id: "up_head", title: "锐喙", desc: "喙磨得更尖，啄下去更狠", part: "head", goldPerStage: 0, maxHp: 0, atk: 3, def: 0, spd: 0, combo: 0, crit: 0, revive: 0, healPerTurn: 0, lockHp: 0, maxLevel: 5, scalePerLevel: 0.06, weight: 10 },
            { id: "up_neck", title: "灵颈", desc: "脖子甩得更狠，容易一击致命", part: "neck", goldPerStage: 0, maxHp: 0, atk: 0, def: 0, spd: 0, combo: 0, crit: 0.06, revive: 0, healPerTurn: 0, lockHp: 0, maxLevel: 5, scalePerLevel: 0.06, weight: 10 },
            { id: "up_body", title: "壮体", desc: "躯干壮实，血更厚", part: "body", goldPerStage: 0, maxHp: 20, atk: 0, def: 0, spd: 0, combo: 0, crit: 0, revive: 0, healPerTurn: 0, lockHp: 0, maxLevel: 5, scalePerLevel: 0.06, weight: 10 },
            { id: "up_wing", title: "硬羽", desc: "翅羽变厚，连击更顺", part: "wing", goldPerStage: 0, maxHp: 0, atk: 0, def: 2, spd: 0, combo: 12, crit: 0, revive: 0, healPerTurn: 0, lockHp: 0, maxLevel: 5, scalePerLevel: 0.06, weight: 10 },
            { id: "up_leg", title: "疾步", desc: "腿脚更有劲，出手更勤", part: "leg", goldPerStage: 0, maxHp: 0, atk: 0, def: 0, spd: 2, combo: 0, crit: 0, revive: 0, healPerTurn: 0, lockHp: 0, maxLevel: 5, scalePerLevel: 0.06, weight: 10 }
        ],
        Language: [
            { id: "role_level_up", zh: "升级", en: "Upgrade" },
            { id: "role_attack", zh: "攻击", en: "Attack" }
        ]
    };
}

function styleHeader(ws) {
    for (let r = 1; r <= 5; r++) {
        ws.getRow(r).font = { bold: r <= 2 };
        ws.getRow(r).fill = { type: "pattern", pattern: "solid", fgColor: { argb: r === 1 ? "FFFFE08A" : "FFE8F0FE" } };
    }
    ws.views = [{ state: "frozen", ySplit: 5 }];
}

async function writeXlsx(data) {
    const wb = new ExcelJS.Workbook();
    for (const sheet of Object.keys(COLS)) {
        const ws = wb.addWorksheet(sheet);
        const cols = COLS[sheet];
        ws.addRow(cols.map(c => c[0]));
        ws.addRow(cols.map(c => c[1]));
        ws.addRow(cols.map(c => c[2]));
        ws.addRow(cols.map(() => "server_no"));
        ws.addRow(cols.map(() => "client"));
        for (const row of data[sheet]) {
            ws.addRow(cols.map(c => row[c[1]] ?? ""));
        }
        cols.forEach((c, i) => { ws.getColumn(i + 1).width = Math.max(12, String(c[0]).length + 4); });
        styleHeader(ws);
    }
    fs.mkdirSync(path.dirname(XLSX), { recursive: true });
    await wb.xlsx.writeFile(XLSX);
}

function parseCell(type, raw) {
    if (raw == null || raw === "") {
        if (type === "string") return "";
        if (type === "any") return [];
        return 0;
    }
    if (type === "string") return String(raw);
    if (type === "int") return parseInt(raw, 10) || 0;
    if (type === "float" || type === "number") return Number(raw) || 0;
    if (type === "any") {
        if (typeof raw === "object") return raw;
        const s = String(raw).trim();
        if (!s) return [];
        try { return JSON.parse(s); } catch { return s; }
    }
    return raw;
}

function migrateLegacyRewards(table) {
    const idMap = { gold: "buff_gold", atk: "up_head", hp: "up_body", def: "up_wing", spd: "up_leg", crit: "up_neck" };
    const defaults = Object.fromEntries(seed().Reward.map(row => [row.id, row]));
    const numericKeys = ["goldPerStage", "maxHp", "atk", "def", "spd", "crit"];
    const out = {};
    Object.entries(table).forEach(([oldId, row]) => {
        const id = idMap[oldId] || oldId;
        const base = defaults[id];
        if (!base) {
            // 自定义旧奖励没有办法从 randomPart 推断固定部位，保留但默认关闭，
            // 避免导出后被误当成可用的部位强化。
            out[id] = Object.assign({}, row, {
                id,
                part: String(row.part || "").trim(),
                combo: Number(row.combo) || 0,
                revive: Number(row.revive) || 0,
                healPerTurn: Number(row.healPerTurn) || 0,
                lockHp: Number(row.lockHp) || 0,
                maxLevel: Number(row.maxLevel) || 0,
                scalePerLevel: Number(row.scalePerLevel) || 0,
                weight: 0
            });
            delete out[id].randomPart;
            return;
        }
        const migrated = Object.assign({}, base, { id });
        if (row.title) migrated.title = String(row.title);
        const desc = String(row.desc || "").trim();
        if (desc && !desc.includes("随机部位")) migrated.desc = desc;
        numericKeys.forEach(key => {
            if (Object.prototype.hasOwnProperty.call(row, key)) migrated[key] = row[key];
        });
        out[id] = migrated;
    });
    return out;
}

async function readXlsx() {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(XLSX);
    const out = {};
    for (const sheet of Object.keys(COLS)) {
        const ws = wb.getWorksheet(sheet);
        if (!ws) {
            if (sheet === "Route") {
                out.Route = seed().Route.reduce((table, row) => {
                    table[String(row.id)] = row;
                    return table;
                }, {});
                continue;
            }
            throw new Error("Excel 缺少工作表 " + sheet);
        }
        const keys = [];
        const types = [];
        ws.getRow(2).eachCell((cell, col) => { keys[col] = String(cell.value || "").trim(); });
        ws.getRow(3).eachCell((cell, col) => { types[col] = String(cell.value || "string").trim(); });
        const table = {};
        ws.eachRow((row, rowNum) => {
            if (rowNum <= 5) return;
            const obj = {};
            keys.forEach((key, col) => {
                if (!key) return;
                const type = types[col] || "string";
                const raw = row.getCell(col).value;
                // Keep optional numeric fields absent when the source row was
                // absent, while preserving explicit empty string fields such
                // as Reward.part for pure buffs.
                if ((sheet === "Route" || sheet === "Reward")
                    && (raw == null || raw === "")
                    && (sheet === "Route" || type !== "string")) return;
                obj[key] = parseCell(type, raw);
            });
            if (obj.id === "" || obj.id == null) return;
            table[String(obj.id)] = obj;
        });
        // 兼容 v6 Excel 中 Reward 的 randomPart 列，导出时迁移到当前的
        // 部位等级配置，避免一次运行 excel-kit 就把强化池写成不可用的旧格式。
        if (sheet === "Reward" && keys.indexOf("randomPart") >= 0) {
            out[sheet] = migrateLegacyRewards(table);
            continue;
        }
        if (sheet === "Language") {
            // Language.json is keyed by the first-column key and historically
            // stores only the locale fields inside each value object.
            out[sheet] = Object.fromEntries(Object.entries(table).map(([id, row]) => {
                const { id: _rowId, ...locale } = row;
                return [id, locale];
            }));
            continue;
        }
        out[sheet] = table;
    }
    return out;
}

function writeMeta(jsonPath) {
    const meta = jsonPath + ".meta";
    if (fs.existsSync(meta)) return;
    const id = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, ch => {
        const n = Math.random() * 16 | 0;
        const v = ch === "x" ? n : (n & 0x3 | 0x8);
        return v.toString(16);
    });
    fs.writeFileSync(meta, JSON.stringify({
        ver: "2.0.1",
        importer: "json",
        imported: true,
        uuid: id,
        files: [".json"],
        subMetas: {},
        userData: {}
    }, null, 2));
}

async function main() {
    fs.mkdirSync(JSON_DIR, { recursive: true });
    if (!fs.existsSync(XLSX)) {
        await writeXlsx(seed());
        console.log("created", XLSX);
    }
    const tables = await readXlsx();
    for (const name of Object.keys(tables)) {
        const full = path.join(JSON_DIR, name + ".json");
        fs.writeFileSync(full, JSON.stringify(tables[name], null, 4));
        writeMeta(full);
        console.log("json", name, Object.keys(tables[name]).length);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
