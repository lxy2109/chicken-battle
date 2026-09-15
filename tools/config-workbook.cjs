const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const api = require("./config-export.cjs");
const schema = require("./config-schema.json");

const revision = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const display = cell => cell.value == null ? "" : cell.text;
function model(wb) {
    return Object.entries(schema).map(([name, fields]) => {
        const ws = wb.getWorksheet(name);
        if (!ws) throw new Error(`Excel 缺少工作表 ${name}`);
        const indexes = {};
        ws.getRow(2).eachCell((cell, col) => { indexes[String(cell.value)] = col; });
        if (Object.keys(indexes).length !== fields.length || fields.some(f => !indexes[f.key] || ws.getCell(3, indexes[f.key]).value !== f.type))
            throw new Error(`${name}: 表头与配置结构不一致，请在 Excel 中修复前五行`);
        const columns = name === "Enemy"
            ? ["id", "name", "targetBattleSeconds", ...fields.map(f => f.key).filter(k => !["id", "name", "targetBattleSeconds"].includes(k))].map(k => fields.find(f => f.key === k))
            : fields;
        const rows = [];
        ws.eachRow((row, number) => {
            if (number <= 5) return;
            rows.push({ origin: number,
                values: Object.fromEntries(fields.map(f => [f.key, display(row.getCell(indexes[f.key]))])),
                formulas: fields.filter(f => row.getCell(indexes[f.key]).type === 6).map(f => f.key) });
        });
        return { name, columns, rows, count: rows.length };
    });
}
async function load(file) {
    const token = revision(file);
    const wb = await api.loadWorkbook(file);
    if (revision(file) !== token) throw new Error("Excel 在读取期间发生变化，请重试");
    let warning = "";
    try { api.parseWorkbook(wb); } catch (error) { warning = error.message; }
    return { revision: token, sheets: model(wb), warning };
}
async function save(file, token, sheets) {
    const conflict = () => { if (revision(file) !== token) throw new Error("Excel 已被外部修改，未覆盖文件。请先复制保留面板修改，再重新加载。"); };
    conflict();
    const wb = await api.loadWorkbook(file);
    const original = model(wb);
    if (!Array.isArray(sheets) || sheets.length !== original.length || new Set(sheets.map(s => s.name)).size !== original.length)
        throw new Error("工作表集合不完整");
    for (const sheet of original) {
        const draft = sheets.find(s => s.name === sheet.name);
        if (!draft || !Array.isArray(draft.rows)) throw new Error(`缺少工作表 ${sheet.name}`);
        const ws = wb.getWorksheet(sheet.name), indexes = {};
        ws.getRow(2).eachCell((cell, col) => { indexes[String(cell.value)] = col; });
        const remaining = new Map(sheet.rows.map(r => [r.origin, r]));
        let nextRow = ws.rowCount + 1;
        for (const row of draft.rows) {
            const old = row.origin == null ? null : remaining.get(row.origin);
            if (row.origin != null && !old) throw new Error(`${sheet.name}: 无效或重复的原始行`);
            if (!row.values || Object.keys(row.values).length !== sheet.columns.length) throw new Error(`${sheet.name}: 字段不完整`);
            const number = old ? row.origin : nextRow++;
            for (const field of sheet.columns) {
                const raw = row.values[field.key];
                if (typeof raw !== "string") throw new Error(`${sheet.name}: ${field.key} 必须是单元格文本`);
                if (old && raw === old.values[field.key]) continue;
                if (old?.formulas.includes(field.key)) throw new Error(`${sheet.name}: 公式单元格请在 Excel 中修改`);
                const cell = ws.getCell(number, indexes[field.key]);
                if (!old && sheet.rows.length) cell.style = JSON.parse(JSON.stringify(ws.getCell(sheet.rows[0].origin, indexes[field.key]).style));
                const parsed = api.parseCell(field.type, raw, `${sheet.name}!${cell.address} (${field.key})`);
                cell.value = parsed === undefined ? null : field.type === "any" ? raw : parsed;
            }
            if (old) remaining.delete(row.origin);
        }
        // 留空删除行，避免移动其他行而破坏公式的原始坐标。
        for (const row of remaining.values()) {
            if (row.formulas.length) throw new Error(`${sheet.name} 第 ${row.origin} 行包含公式，请在 Excel 中删除`);
            ws.getRow(row.origin).eachCell(cell => { cell.value = null; });
        }
    }
    api.parseWorkbook(wb);
    const temp = path.join(path.dirname(file), `.${path.basename(file)}.${crypto.randomUUID()}.tmp.xlsx`);
    try {
        await wb.xlsx.writeFile(temp);
        await api.readXlsx(temp);
        const result = await load(temp);
        conflict();
        fs.renameSync(temp, file);
        return result;
    } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
module.exports = { load, save };
