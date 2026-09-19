/** Creator 主进程接口模拟；文件解析与导出使用真实实现。 */
const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "../..");
const directory = path.join(root, "temp/excel-panel-test");
const api = require("../config/config-export.cjs");
const originalWrite = api.writeTables;
let writes = 0, refreshes = 0, refreshFails = false;
global.Editor = {
    Project: { path: root },
    Panel: { open(name) { assert.equal(name, "chicken-excel"); } },
    Dialog: { async select() { return { filePaths: [] }; } },
    Message: { async request(name, method, url) {
        assert.deepEqual([name, method, url], ["asset-db", "refresh-asset", "db://assets/bundle/config/game"]);
        refreshes++;
        if (refreshFails) throw new Error("测试刷新失败");
    } }
};
api.writeTables = (tables, target) => {
    assert.equal(target, path.join(root, "assets/bundle/config/game"));
    writes++;
    originalWrite(tables, directory);
};
const { methods } = require("../extensions/chicken-excel/main.js");

async function main() {
    methods.openPanel();
    assert.equal(await methods.chooseSource(), null);
    const { source } = methods.getSource();
    const reading = methods.inspect(source);
    assert.equal((await methods.exportConfig(source)).ok, false, "并发导出应被阻止");
    const preview = await reading;
    assert(preview.ok, preview.message);
    assert.equal(preview.sheets.length, Object.keys(require('../config/config-schema.json')).length);
    assert.equal(preview.sheets.find(s => s.name === "Enemy").columns[2].key, "targetBattleSeconds");
    assert.equal(preview.sheets.find(s => s.name === "Danmaku").count, 185);
    assert.equal(preview.sheets.find(s => s.name === "Danmaku").rows.length, 100);
    assert.equal(writes, 0);
    assert.equal(refreshes, 0);
    console.log("PASS 全表校验预览、怪物时长列、弹幕计数和预览上限；未写文件");
    const exported = await methods.exportConfig(source);
    assert(exported.ok && exported.exported && !exported.warning);
    assert.equal(writes, 1); assert.equal(refreshes, 1);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "Enemy.json"))).kun_boss.targetBattleSeconds, 55);
    console.log("PASS 导出使用完整数据，并请求Creator刷新正确资源目录");
    const invalid = await methods.exportConfig(path.join(directory, "missing.xlsx"));
    assert.equal(invalid.ok, false); assert.equal(writes, 1); assert.equal(refreshes, 1);
    refreshFails = true;
    const warning = await methods.exportConfig(source);
    assert(warning.ok && warning.exported && warning.warning.includes("刷新失败"));
    assert(!warning.message.includes("资源已刷新"));
    Editor.Project.path = path.dirname(root);
    const wrongProject = await methods.exportConfig(source);
    assert.equal(wrongProject.ok, false); assert(wrongProject.message.includes("项目"));
    assert.equal(writes, 2);
    console.log("PASS 缺失文件、跨项目保护、并发保护与刷新失败反馈");
}
main().finally(() => { api.writeTables = originalWrite; delete global.Editor; }).catch(error => { console.error(error); process.exitCode = 1; });
