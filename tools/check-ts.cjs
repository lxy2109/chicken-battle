/**
 * 只看 assets/script 的类型错误。
 *
 * tsconfig.json 由 Cocos 生成，没有 include 字段，tsc 会把 extensions 下几个插件的
 * 源码和它们各自的 node_modules 类型一起编译，报出几十条与本项目无关的冲突。
 * 这里按路径前缀过滤，只留游戏代码自己的问题。
 *
 * 用法: node tools/check-ts.cjs
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

/** 项目不直接依赖 typescript，借插件装好的那份。 */
const CANDIDATES = [
    "node_modules/typescript/bin/tsc",
    "extensions/oops-plugin-framework/node_modules/typescript/bin/tsc",
    "extensions/cocos-mcp-server/node_modules/typescript/bin/tsc"
];

const tsc = CANDIDATES.map(p => path.join(ROOT, p)).find(fs.existsSync);
if (!tsc) {
    console.error("找不到 tsc，先在任一扩展目录跑 npm install");
    process.exit(2);
}

const res = spawnSync(process.execPath, [tsc, "--noEmit", "-p", "tsconfig.json"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024
});

const lines = (res.stdout || "").split(/\r?\n/);
// 报错块的后续行是缩进的说明文字，跟着上一条的归属走。
const mine = [];
let keep = false;
for (const line of lines) {
    if (/^\s/.test(line)) {
        if (keep && line.trim()) mine.push(line);
        continue;
    }
    if (!line.trim()) continue;
    keep = line.startsWith("assets/script") || line.startsWith("assets\\script");
    if (keep) mine.push(line);
}

if (mine.length === 0) {
    console.log("assets/script 类型检查通过");
    process.exit(0);
}
console.log(mine.join("\n"));
console.log(`\n共 ${mine.filter(l => !/^\s/.test(l)).length} 条错误`);
process.exit(1);
