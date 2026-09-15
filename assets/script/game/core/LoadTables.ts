import { JsonUtil } from "db://oops-framework/core/utils/JsonUtil";
import { bindTables } from "../core/Config";

const TABLE_NAMES = ["Player", "Stage", "Route", "Enemy", "Item", "Set", "Part", "Reward", "Danmaku", "DanmakuRule", "Map", "GameRule", "Language", "UiText"];

export async function loadGameTables() {
    await JsonUtil.loadDir();
    const all: Record<string, Record<string, any>> = {};
    for (const name of TABLE_NAMES) {
        const table = JsonUtil.get(name);
        if (!table) throw new Error(`缺少配置表 ${name}，请先执行 node tools/excel-kit.cjs`);
        all[name] = table;
    }
    bindTables(all);
}
