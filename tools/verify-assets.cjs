/**
 * 核对磁盘上的贴图 uuid 与编辑器资源库里的是否一致。
 *
 * 素材的 .meta 是脚本写死的，预制体里也按同一份 uuid 硬引用。一旦编辑器因为
 * uuid 冲突或导入失败自己重新分配，游戏里就是一片白块，而编辑器不会报错。
 * 需要 Cocos 开着并启用 MCP 插件。
 *
 * 用法: node tools/verify-assets.cjs
 */
const http = require("http");
const { FILES } = require("./import-art.cjs");
const art = require("./art-uuids.cjs");
const CHECK_FILES = FILES.concat(["start_figma", "village_figma", "arena_figma", "shop_figma", "map_figma"]
    .map(name => [null, `assets/bundle/game/texture/bg/${name}.png`, art[`bg_${name}`]]));

const PORT = Number(process.env.MCP_PORT || 3100);

function call(name, args) {
    const body = JSON.stringify({
        jsonrpc: "2.0", id: Date.now(), method: "tools/call",
        params: { name, arguments: args }
    });
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: "127.0.0.1", port: PORT, path: "/mcp", method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream",
                "Content-Length": Buffer.byteLength(body)
            }
        }, res => {
            let data = "";
            res.on("data", c => data += c);
            res.on("end", () => {
                try {
                    const j = JSON.parse(data);
                    resolve(JSON.parse(j.result.content[0].text));
                }
                catch (e) { reject(new Error(data.slice(0, 300))); }
            });
        });
        req.on("error", reject);
        req.write(body);
        req.end();
    });
}

(async () => {
    const bad = [];
    for (const [, rel, uuid] of CHECK_FILES) {
        const url = "db://" + rel.replace(/^assets\//, "assets/");
        let got = null;
        try {
            const res = await call("assetAdvanced_asset_query", { action: "query_uuid", url });
            got = res && res.data && (res.data.uuid || res.data);
        }
        catch (e) {
            bad.push(`${rel}: 查询失败 ${e.message}`);
            continue;
        }
        if (typeof got !== "string") {
            bad.push(`${rel}: 编辑器里找不到`);
        }
        else if (got !== uuid) {
            bad.push(`${rel}: uuid 不一致\n    期望 ${uuid}\n    实际 ${got}`);
        }
    }

    if (bad.length === 0) {
        console.log(`贴图 uuid 全部一致，共 ${CHECK_FILES.length} 张`);
        process.exit(0);
    }
    for (const b of bad) console.log(b);
    console.log(`\n共 ${bad.length} 张有问题`);
    process.exit(1);
})().catch(e => {
    console.error("连不上 MCP，确认 Cocos 已开启且插件端口为", PORT, "\n", e.message);
    process.exit(2);
});
