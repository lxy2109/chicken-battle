const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "../..");
const DEFAULT_SOURCE = path.join(ROOT, "excel/斗鸡配置.xlsx");
const DESTINATION = path.join(ROOT, "assets/bundle/config/game");
let busy = false;

function sourceFile(file = DEFAULT_SOURCE) {
    if (path.resolve(Editor.Project.path).toLowerCase() !== ROOT.toLowerCase()) throw new Error("当前编辑器项目与配表扩展目录不一致");
    if (typeof file !== "string" || path.extname(file).toLowerCase() !== ".xlsx") throw new Error("请选择 .xlsx 文件");
    const full = path.resolve(file);
    if (!fs.statSync(full).isFile()) throw new Error("所选路径不是 Excel 文件");
    return full;
}

function exporter() {
    try { return require(path.join(ROOT, "tools/config/config-export.cjs")); }
    catch (error) {
        if (error.code === "MODULE_NOT_FOUND") throw new Error("导表依赖未安装，请在项目 tools 目录运行 npm ci，然后重试。");
        throw error;
    }
}

function preview(tables) {
    const schema = require(path.join(ROOT, "tools/config/config-schema.json"));
    return Object.entries(schema).map(([name, fields]) => {
        const table = tables[name];
        const rows = name === "Danmaku"
            ? Object.entries(table).flatMap(([group, lines]) => lines.map((text, i) => ({ id: `${group}_${i + 1}`, group, text })))
            : Object.entries(table).map(([id, row]) => ({ id, ...row }));
        // 怪物时长置于名字旁，避免策划横向滚动后才找到核心字段。
        const keys = name === "Enemy" ? ["id", "name", "targetBattleSeconds", ...fields.map(f => f.key).filter(k => !["id", "name", "targetBattleSeconds"].includes(k))] : fields.map(f => f.key);
        return { name, count: rows.length, columns: keys.map(key => fields.find(f => f.key === key)), rows: rows.slice(0, 100) };
    });
}

async function processWorkbook(file, write) {
    if (busy) return { ok: false, message: "正在处理配表，请稍候。" };
    busy = true;
    try {
        const source = sourceFile(file);
        const api = exporter();
        // 导出时重新读取磁盘文件，不能把上一次预览的数据当成最新配置。
        const tables = await api.readXlsx(source);
        const sheets = preview(tables);
        let warning = "";
        if (write) {
            api.writeTables(tables, DESTINATION);
            try { await Editor.Message.request("asset-db", "refresh-asset", "db://assets/bundle/config/game"); }
            catch (error) { warning = `JSON 已导出，但资源刷新失败，请手动刷新资源：${error.message || error}`; }
        }
        return { ok: true, source, destination: DESTINATION, sheets, warning, exported: write,
            message: write ? `已导出 ${sheets.length} 张表${warning ? "" : "，资源已刷新"}。重新预览游戏后生效。` : `校验通过，共 ${sheets.length} 张表。尚未写入游戏配置。` };
    }
    catch (error) { return { ok: false, message: error.message || String(error) }; }
    finally { busy = false; }
}

exports.methods = {
    async loadWorkbook(file) {
        return editWorkbook(file);
    },
    async saveWorkbook(file, revision, sheets) {
        return editWorkbook(file, { revision, sheets });
    },
    openPanel() { return Editor.Panel.open("chicken-excel"); },
    getSource() { return { source: DEFAULT_SOURCE, destination: DESTINATION }; },
    async chooseSource() {
        const result = await Editor.Dialog.select({ title: "选择斗鸡配置 Excel", path: path.dirname(DEFAULT_SOURCE), filters: [{ name: "Excel 工作簿", extensions: ["xlsx"] }] });
        return result.filePaths?.[0] || null;
    },
    async openSource(file) {
        try {
            const message = await require("electron").shell.openPath(sourceFile(file));
            return message ? { ok: false, message } : { ok: true, message: "已打开 Excel。修改后请保存，再回面板校验或导出。" };
        } catch (error) { return { ok: false, message: error.message }; }
    },
    inspect(file) { return processWorkbook(file, false); },
    exportConfig(file) { return processWorkbook(file, true); }
};
exports.load = function () {};
exports.unload = function () {};

async function editWorkbook(file, draft) {
    if (busy) return { ok: false, message: "正在处理配表，请稍候。" };
    busy = true;
    try {
        const source = sourceFile(file);
        exporter();
        const editor = require(path.join(ROOT, "tools/config/config-workbook.cjs"));
        const result = draft ? await editor.save(source, draft.revision, draft.sheets) : await editor.load(source);
        return { ok: true, source, ...result, message: draft ? "Excel 已保存。点击导出并刷新资源后，重新预览游戏生效。" : "已加载全部记录，可直接编辑。" };
    } catch (error) { return { ok: false, message: error.message || String(error) }; }
    finally { busy = false; }
}
