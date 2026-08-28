const fs = require("fs");
const http = require("http");

function call(method, params) {
    const body = JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params });
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: "127.0.0.1", port: Number(process.env.MCP_PORT || 3100), path: "/mcp", method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream",
                "Content-Length": Buffer.byteLength(body)
            }
        }, res => {
            let data = "";
            res.on("data", c => data += c);
            res.on("end", () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error(data.slice(0, 500))); }
            });
        });
        req.on("error", reject);
        req.write(body);
        req.end();
    });
}

async function tool(name, args) {
    return call("tools/call", { name, arguments: args });
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

(async () => {
    const action = process.argv[2];
    if (action === "tools") {
        const res = await call("tools/list", {});
        for (const t of res.result.tools) console.log(t.name);
        return;
    }
    if (action === "schema") {
        const res = await call("tools/list", {});
        const t = res.result.tools.find(v => v.name === process.argv[3]);
        console.log(t ? JSON.stringify(t.inputSchema, null, 2) : "未找到该工具");
        return;
    }
    if (action === "call") {
        // 用法: node tools/mcp-call.cjs call <工具名> '<json 参数>'
        const res = await tool(process.argv[3], JSON.parse(process.argv[4] || "{}"));
        const text = res.result && res.result.content && res.result.content[0] && res.result.content[0].text;
        console.log(text || JSON.stringify(res, null, 2));
        return;
    }
    if (action === "logs") {
        console.log(JSON.stringify(await tool("debug_debug_console", { action: "get_logs", limit: 80, filter: "error" }), null, 2));
        return;
    }
    if (action === "project") {
        console.log(JSON.stringify(await tool("project_project_manage", { action: "get_info" }), null, 2));
        return;
    }
    if (action === "run") {
        console.log(JSON.stringify(await tool("project_project_manage", { action: "run", platform: "browser" }), null, 2));
        return;
    }
    if (action === "prefabs") {
        console.log(JSON.stringify(await tool("prefab_prefab_browse", { action: "list" }), null, 2));
        return;
    }
    if (action === "attach") {
        const items = [
            ["db://assets/bundle/gui/customize/customize.prefab", "customize", "db://assets/script/game/gui/customize/CustomizeViewComp.ts"],
            ["db://assets/bundle/gui/map/map.prefab", "map", "db://assets/script/game/gui/map/MapViewComp.ts"],
            ["db://assets/bundle/gui/character/character.prefab", "character", "db://assets/script/game/gui/character/CharacterViewComp.ts"],
            ["db://assets/bundle/gui/prebattle/prebattle.prefab", "prebattle", "db://assets/script/game/gui/prebattle/PreBattleViewComp.ts"],
            ["db://assets/bundle/gui/battle/battle.prefab", "battle", "db://assets/script/game/gui/battle/BattleViewComp.ts"],
            ["db://assets/bundle/gui/result/result.prefab", "result", "db://assets/script/game/gui/result/ResultViewComp.ts"],
            ["db://assets/bundle/gui/reward/reward.prefab", "reward", "db://assets/script/game/gui/reward/RewardViewComp.ts"],
            ["db://assets/bundle/gui/shop/shop.prefab", "shop", "db://assets/script/game/gui/shop/ShopViewComp.ts"],
            ["db://assets/bundle/gui/ending/ending.prefab", "ending", "db://assets/script/game/gui/ending/EndingViewComp.ts"]
        ];
        for (const [prefabPath, rootName, scriptPath] of items) {
            // 编辑器可能还缓存着上一版预制体，直接 enter/save 会把旧内容原样写回，
            // 把 gen-prefabs 刚改的东西悄悄覆盖掉。所以逐个重新导入并等它落地。
            // 目录级 reimport 不会刷新已缓存的单个资源，必须一个个来。
            await tool("assetAdvanced_asset_operations", { action: "reimport", url: prefabPath });
            await sleep(2500);
            await tool("prefab_prefab_edit", { action: "enter", prefabPath });
            const found = await tool("node_node_query", { action: "find_by_name", name: rootName });
            const text = found.result && found.result.content && found.result.content[0] ? found.result.content[0].text : JSON.stringify(found);
            const parsed = JSON.parse(text);
            const uuid = parsed.data && parsed.data.uuid || parsed.data && parsed.data[0] && parsed.data[0].uuid;
            const att = await tool("node_node_script_management", { action: "attach", nodeUuid: uuid, scriptPath });
            await tool("prefab_prefab_edit", { action: "save", prefabPath });
            await tool("prefab_prefab_edit", { action: "exit", prefabPath });
            console.log(rootName, uuid, JSON.stringify(att).slice(0, 300));
        }
        return;
    }
    console.error("unknown action", action);
})().catch(e => {
    console.error(e);
    process.exit(1);
});
