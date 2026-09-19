const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const JSZip = require("jszip");
const schema = require("./config-schema.json");
const contract = require("./config-contract.json");
const ROOT = path.resolve(__dirname, "../..");

function cellKey(cell) {
    if (cell.value == null || cell.value === "") return "";
    return String(typeof cell.value === "object" ? cell.text || "" : cell.value).trim();
}

function readHeaderKeys(ws, name) {
    const indexes = new Map();
    ws.getRow(2).eachCell((cell, col) => {
        const key = cellKey(cell);
        if (!key) return;
        if (indexes.has(key)) throw new Error(`${name}: 字段 ${key} 重复`);
        indexes.set(key, col);
    });
    return indexes;
}

function parseCell(type, raw, where) {
    const fail = () => { throw new Error(`${where}: 无效 ${type} 值 ${JSON.stringify(raw)}`); };
    if (raw && typeof raw === "object" && ("formula" in raw || "sharedFormula" in raw)) {
        if (raw.result == null) throw new Error(`${where}: 公式未计算，请在 Excel 中计算并保存`);
        raw = raw.result;
    }
    if (raw == null || raw === "") return undefined;
    if (type === "string") return typeof raw === "string" ? raw : fail();
    if (type === "bool") {
        if ([true, 1, "1", "true"].includes(raw)) return true;
        if ([false, 0, "0", "false"].includes(raw)) return false;
        return fail();
    }
    if (type === "any") {
        if (typeof raw !== "string") return fail();
        try { return JSON.parse(raw); } catch { return fail(); }
    }
    const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : NaN;
    return Number.isFinite(n) && (type !== "int" || Number.isInteger(n)) ? n : fail();
}

function validate(t) {
    const check = (test, message) => { if (!test) throw new Error(message); };
    const rows = name => Object.values(t[name]);
    const ref = (table, id, where) => check(Object.hasOwn(t[table], String(id)), `${where}: ${table} 不存在 ID ${id}`);
    for (const r of rows("Route")) {
        check(["battle", "shop", "boss"].includes(r.kind), `Route ${r.id}: kind 无效`);
        ref("Map", r.mapId, `Route ${r.id}`);
        if (r.kind !== "shop") ref("Enemy", r.enemyId, `Route ${r.id}`);
        check(r.goldWin >= 0 && r.goldLose >= 0, `Route ${r.id}: 金币不能为负`);
        if (r.encounter) check(["warmup", "official", "final"].includes(r.encounter), `Route ${r.id}: encounter 无效`);
    }
    for (const r of [...rows("Enemy"), ...rows("Player")]) check(r.maxHp > 0 && r.atk >= 0 && r.def >= 0 && r.spd >= 0 && r.crit >= 0 && r.crit <= 1, `${r.id}: 生命/攻防/速度/暴击无效`);
    for (const r of rows("Enemy")) {
        check(r.targetBattleSeconds > 0, `Enemy ${r.id}: 目标战斗时长必须大于 0`);
        ref("DanmakuRule", r.danmakuGroup, `Enemy ${r.id}`);
    }
    for (const r of rows("Item")) {
        ref("Set", r.setId, `Item ${r.id}`);
        check(r.price >= 0, `Item ${r.id}: 价格不能为负`);
        check(["comb", "head", "neck", "body", "wing", "tail", "leg", "face"].includes(r.slot), `Item ${r.id}: slot 无效`);
    }
    for (const r of rows("Set")) {
        check(Array.isArray(r.pieceIds) && r.pieceIds.length > 0, `Set ${r.id}: pieceIds 应为非空数组`);
        for (const id of r.pieceIds) { ref("Item", id, `Set ${r.id}`); check(t.Item[id].setId === r.id, `Set ${r.id}: ${id} 属于另一套装`); }
        check(r.discount > 0 && r.discount <= 1, `Set ${r.id}: discount 应在 (0,1]`);
        if (r.unlockMap != null && r.unlockMap !== 0) ref("Map", r.unlockMap, `Set ${r.id}`);
    }
    for (const r of rows("Reward")) {
        check((r.weight ?? 0) >= 0 && (r.maxLevel ?? 0) >= 0 && (r.scalePerLevel ?? 0) >= 0, `Reward ${r.id}: 权重/上限/放大不能为负`);
        check(!r.part || ["comb", "head", "neck", "body", "wing", "tail", "leg"].includes(r.part), `Reward ${r.id}: part 无效`);
    }
    for (const [id, b] of Object.entries(contract.rules)) {
        ref("GameRule", id, "规则配置");
        const n = t.GameRule[id].value;
        check(n >= b.min && (b.max == null || n <= b.max) && (!b.integer || Number.isInteger(n)), `GameRule ${id}: 数值超出允许范围`);
    }
    for (const [id, params] of Object.entries(contract.textParams)) {
        ref("Language", id, "界面文案");
        const actual = [...new Set(t.Language[id].zh.match(/\{\d+\}/g) || [])].sort();
        check(JSON.stringify(actual) === JSON.stringify(params), `Language ${id}: 占位符必须保留 ${params.join(" ")}`);
    }
    for (const id of contract.uiKeys) ref("UiText", id, "预制体文本");
    for (const r of rows("Map")) {
        check(rows("Route").some(n => n.mapId === r.id), `Map ${r.id}: 没有对应路线`);
    }
    check(Array.isArray(t.Player[1]?.randomNames) && new Set(t.Player[1].randomNames).size >= 2 && t.Player[1].randomNames.every(x => typeof x === "string" && x.trim()), "Player 1: 名称池至少填写两个不同的非空名字");
    for (const id of ["intro", "ending"]) ref("Story", id, "剧情入口");
    for (const r of rows("Story")) check(r.text.trim().length > 0, `Story ${r.id}: 剧情正文不能为空`);
    for (const r of rows("Map")) ref("Story", r.storyId, `Map ${r.id}`);
    for (const r of rows("Route")) if (r.storyId) ref("Story", r.storyId, `Route ${r.id}`);
    const tauntGroups = new Set(rows("Taunt").map(r => r.group));
    const orders = new Set();
    for (const r of rows("Taunt")) {
        check(r.group.trim() && r.text.trim() && r.order >= 0, `Taunt ${r.id}: 分组/正文/顺序无效`);
        const key = JSON.stringify([r.group, r.order]);
        check(!orders.has(key), `Taunt ${r.id}: 同组顺序重复`); orders.add(key);
    }
    for (const name of ["Player", "Enemy"]) for (const r of rows(name))
        check(tauntGroups.has(r.tauntGroup), `${name} ${r.id}: Taunt 不存在分组 ${r.tauntGroup}`);
    const groups = new Set(rows("Danmaku").map(r => r.group));
    check(groups.has("common"), "Danmaku: 缺少 common 通用弹幕");
    for (const r of rows("DanmakuRule")) check(groups.has(r.group) && r.commonChance >= 0 && r.commonChance <= 1 && r.featuredChance >= 0 && r.featuredChance <= 1 && r.recentCount >= 0, `DanmakuRule ${r.id}: 分组或概率无效`);
}

async function loadWorkbook(xlsx) {
    const wb = new ExcelJS.Workbook();
    // ExcelJS 仅识别无前缀的 SpreadsheetML 标签。将合法的 x: 命名空间
    // 等价转换为默认命名空间，只处理内存副本，不改动策划工作簿。
    const zip = await JSZip.loadAsync(fs.readFileSync(xlsx));
    for (const file of Object.values(zip.files)) {
        if (!file.name.endsWith(".xml")) continue;
        const xml = await file.async("string");
        if (xml.includes('xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"')) {
            zip.file(file.name, xml.replace(/<(\/?)x:/g, "<$1").replace(/xmlns:x="http:\/\/schemas.openxmlformats.org\/spreadsheetml\/2006\/main"/g, 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'));
        }
    }
    await wb.xlsx.load(await zip.generateAsync({ type: "nodebuffer" }));
    return wb;
}

async function readXlsx(xlsx) {
    return parseWorkbook(await loadWorkbook(xlsx));
}

function parseWorkbook(wb) {
    const out = {};
    for (const [name, columns] of Object.entries(schema)) {
        const ws = wb.getWorksheet(name);
        if (!ws) throw new Error(`Excel 缺少工作表 ${name}`);
        const indexes = readHeaderKeys(ws, name);
        for (const c of columns) if (!indexes.has(c.key) || cellKey(ws.getRow(3).getCell(indexes.get(c.key))) !== c.type) throw new Error(`${name}: 缺少字段 ${c.key} 或类型应为 ${c.type}`);
        for (const key of indexes.keys()) if (!columns.some(c => c.key === key)) throw new Error(`${name}: 未注册字段 ${key}`);
        out[name] = Object.create(null);
        ws.eachRow((row, number) => {
            if (number <= 5) return;
            const obj = {};
            for (const c of columns) {
                const cell = row.getCell(indexes.get(c.key));
                const where = `${name}!${cell.address} (${c.key})`;
                const value = parseCell(c.type, cell.value, where);
                if (value === undefined && c.required && c.type !== "string") throw new Error(`${where}: 必填值为空`);
                if (value !== undefined) obj[c.key] = value;
                else if (c.type === "string" && c.required) obj[c.key] = "";
            }
            if (obj.id == null || obj.id === "") throw new Error(`${name} 第 ${number} 行: ID 不能为空`);
            if (Object.hasOwn(out[name], obj.id)) throw new Error(`${name}: 重复 ID ${obj.id}`);
            out[name][obj.id] = obj;
        });
    }
    validate(out);
    out.Language = Object.fromEntries(Object.entries(out.Language).map(([id, { id: _, ...row }]) => [id, row]));
    const danmaku = Object.create(null);
    for (const { group, text } of Object.values(out.Danmaku)) (danmaku[group] ??= []).push(text);
    out.Danmaku = danmaku;
    return out;
}

function writeTables(tables, destination) {
    fs.mkdirSync(destination, { recursive: true });
    for (const [name, table] of Object.entries(tables)) {
        const full = path.join(destination, name + ".json");
        fs.writeFileSync(full, JSON.stringify(table, null, 4));
        if (!fs.existsSync(full + ".meta")) fs.writeFileSync(full + ".meta", JSON.stringify({ver:"2.0.1", importer:"json", imported:true, uuid:require("crypto").randomUUID(), files:[".json"], subMetas:{}, userData:{}}, null, 2));
    }
}

async function main() {
    const xlsx = path.resolve(ROOT, process.env.CHICKEN_BATTLE_XLSX || "excel/斗鸡配置.xlsx");
    const destination = path.resolve(ROOT, process.env.CHICKEN_BATTLE_JSON_DIR || "assets/bundle/config/game");
    // CLI 与 Creator 面板共用同一解析、校验和写出流程。
    const tables = await readXlsx(xlsx);
    writeTables(tables, destination);
    for (const [name, table] of Object.entries(tables)) console.log("json", name, Object.keys(table).length);
}
module.exports = { main, readXlsx, loadWorkbook, parseWorkbook, writeTables, validate, parseCell, cellKey, readHeaderKeys };
