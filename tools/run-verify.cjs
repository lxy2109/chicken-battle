/**
 * 跑无界面验证。
 *
 * 分两步：先按 tools/tsconfig.verify.json 把 TS 编成 CommonJS，那份配置里映射了
 * db://oops-framework 的路径，行为树才能跟着一起编译进产物；再劫持 require，
 * 把 db:// 开头的请求指到编译产物里，然后执行。
 *
 * 项目不直接依赖 typescript，借插件装好的那份。
 *
 * 用法: node tools/run-verify.cjs
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const Module = require("module");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "temp/verify");
const PREFIX = "db://oops-framework/";

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

const res = spawnSync(process.execPath, [tsc, "-p", path.join(__dirname, "tsconfig.verify.json")], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024
});

const entry = path.join(OUT, "tools/verify-mvp.js");
if (!fs.existsSync(entry)) {
    console.error(res.stdout || res.stderr);
    console.error("编译没产出可执行文件");
    process.exit(2);
}

// 项目没装 @types/node，fs/path/process 会报一串找不到类型声明的错。
// 那不影响产物能不能跑，只把游戏代码自己的类型问题显出来，其余交给 check-ts。
const noise = /Cannot find (module '(fs|path)'|name '(__dirname|process|require)')/;
const real = (res.stdout || "").split(/\r?\n/).filter(l => l.trim() && !noise.test(l));
if (real.length) console.log(real.join("\n") + "\n");

const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
    if (typeof request === "string" && request.startsWith(PREFIX)) {
        request = path.join(OUT, "extensions/oops-plugin-framework/assets", request.slice(PREFIX.length));
    }
    return resolve.call(this, request, ...rest);
};

require(entry);
