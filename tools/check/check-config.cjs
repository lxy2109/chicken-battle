/** Excel → JSON → 战斗/文案回归。先执行 node tools/run-verify.cjs。 */
const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");
const { spawnSync } = require("child_process");
const { readXlsx } = require("../config/config-export.cjs");
const schema = require("../config/config-schema.json");
const root = path.resolve(__dirname, "../..");
const scratch = path.join(root, "temp/config-test");
const source = path.join(root, "excel/斗鸡配置.xlsx");
const compiled = path.join(root, "temp/verify/assets/script/game/domain");
const { bindTables } = require(path.join(compiled, "Config.js"));
const { BattleSession } = require(path.join(compiled, "BattleSession.js"));
const { RunState } = require(path.join(compiled, "RunState.js"));
const { gameText } = require(path.join(compiled, "GameConfig.js"));
const { getMaps } = require(path.join(compiled, "Catalog.js"));

function column(key, sheet) {
    let index = schema[sheet].findIndex(c => c.key === key) + 1, out = "";
    assert(index > 0);
    while (index) { index--; out = String.fromCharCode(65 + index % 26) + out; index = Math.floor(index / 26); }
    return out;
}

async function fixture(sheet, key, value, row = 6) {
    const zip = await JSZip.loadAsync(fs.readFileSync(source));
    const book = await zip.file("xl/workbook.xml").async("string");
    const tag = book.match(new RegExp(`<[^>]*sheet\\b[^>]*name="${sheet}"[^>]*>`))[0];
    const rid = tag.match(/r:id="([^"]+)"/)[1];
    const rels = await zip.file("xl/_rels/workbook.xml.rels").async("string");
    const rel = rels.match(new RegExp(`<[^>]*Relationship\\b[^>]*Id="${rid}"[^>]*>`))[0];
    const target = rel.match(/Target="([^"]+)"/)[1];
    const file = target.startsWith("/") ? target.slice(1) : path.posix.normalize("xl/" + target);
    let xml = await zip.file(file).async("string");
    const address = column(key, sheet) + row;
    const regex = new RegExp(`<x:c\\b(?=[^>]*\\br="${address}")[^>]*?(?:/>|>[\\s\\S]*?</x:c>)`);
    assert(regex.test(xml), `Missing ${sheet}!${address}`);
    const escaped = String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const cell = typeof value === "number" ? `<x:c r="${address}"><x:v>${value}</x:v></x:c>`
        : `<x:c r="${address}" t="inlineStr"><x:is><x:t>${escaped}</x:t></x:is></x:c>`;
    zip.file(file, xml.replace(regex, cell));
    const dest = path.join(scratch, "fixture.xlsx");
    fs.writeFileSync(dest, await zip.generateAsync({ type: "nodebuffer" }));
    return dest;
}

function combat(seconds) {
    const run = new RunState(11);
    const enemy = run.enemyFighter();
    enemy.targetBattleSeconds = seconds;
    const session = new BattleSession(run.playerFighter(), enemy, 11, false);
    session.beginCombat();
    let elapsed = 0;
    while (!session.done && elapsed < 300) {
        session.tick(0.01);
        for (const side of ["player", "enemy"]) if (session.striking(side)) session.resolveStrike(side, true);
        elapsed += 0.01;
    }
    assert(session.done, "必须通过血量归零结束");
    return { elapsed, win: session.win, hits: session.events.filter(e => e.type === "hit").length };
}

async function main() {
    fs.mkdirSync(scratch, { recursive: true });
    const tables = await readXlsx(source);
    for (const [name, table] of Object.entries(tables)) assert.deepEqual(JSON.parse(JSON.stringify(table)), JSON.parse(fs.readFileSync(path.join(root, "assets/bundle/config/game", name + ".json"))), name + " round trip");
    console.log(`PASS 全部${Object.keys(tables).length}张数据表 Excel/JSON 一致`);
    bindTables(tables);
    const normal = combat(25), long = combat(50);
    assert.equal(normal.win, long.win);
    assert.equal(normal.hits, long.hits);
    assert(Math.abs(long.elapsed / normal.elapsed - 2) < 0.03);
    console.log(`PASS 单怪25→50：${normal.elapsed.toFixed(2)}→${long.elapsed.toFixed(2)}秒，胜负和命中次数不变`);
    const changed = await readXlsx(await fixture("Enemy", "targetBattleSeconds", 52));
    bindTables(changed);
    // First row isn't the first Route enemy: check the exact edited row.
    const { enemyToFighter } = require(path.join(compiled, "Catalog.js"));
    assert.equal(enemyToFighter(Object.keys(changed.Enemy)[0]).targetBattleSeconds, 52);
    console.log("PASS 修改Excel单怪时长传到战斗快照");
    bindTables(await readXlsx(await fixture("Language", "zh", "配表修改已生效")));
    assert.equal(gameText("role_level_up"), "配表修改已生效");
    bindTables(await readXlsx(await fixture("Map", "name", "测试地图")));
    assert.equal(getMaps()[0].name, "测试地图");
    console.log("PASS 修改Excel文案和地图名运行时生效");
    const catalog = require(path.join(compiled, "Catalog.js"));
    bindTables(await readXlsx(await fixture("Story", "text", "独立剧情修改")));
    assert.equal(catalog.getStory("intro"), "独立剧情修改");
    bindTables(await readXlsx(await fixture("Taunt", "text", "独立台词修改")));
    assert.equal(catalog.playerTaunts()[0], "独立台词修改");
    assert(!Object.keys(tables.Player[1]).some(key => /^story|^taunt[123]$|^boss|^hintBoss$/.test(key)));
    await assert.rejects(readXlsx(await fixture("Map", "storyId", "missing_story")), /Story 不存在/);
    await assert.rejects(readXlsx(await fixture("Route", "storyId", "missing_story")), /Story 不存在/);
    await assert.rejects(readXlsx(await fixture("Enemy", "tauntGroup", "missing_group")), /Taunt 不存在/);
    await assert.rejects(readXlsx(await fixture("Taunt", "order", 1, 7)), /同组顺序重复/);
    console.log("PASS 独立剧情/台词读取、字段归属与缺失引用/重复顺序校验");
    for (const value of [0, -1, "不是数字"]) await assert.rejects(readXlsx(await fixture("Enemy", "targetBattleSeconds", value)));
    await assert.rejects(readXlsx(await fixture("Enemy", "id", "s1_warmup", 7)), /重复 ID/);
    await assert.rejects(readXlsx(await fixture("Route", "enemyId", "missing_enemy")), /不存在 ID/);
    const invalid = await fixture("Enemy", "targetBattleSeconds", -1);
    const output = path.join(scratch, "invalid-output");
    fs.mkdirSync(output, { recursive: true });
    const before = fs.readdirSync(output);
    const result = spawnSync(process.execPath, [path.join(root, "tools/excel-kit.cjs")], { env: { ...process.env, CHICKEN_BATTLE_XLSX: invalid, CHICKEN_BATTLE_JSON_DIR: output }, encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.deepEqual(fs.readdirSync(output), before);
    console.log("PASS 非法时长、错误数值、重复ID、缺失引用被拦截，导出失败未写JSON");
    bindTables(tables);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
