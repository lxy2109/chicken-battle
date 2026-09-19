/**
 * 战斗粒子贴图：改为 Imagine 生图导入（import-gen-fx）。
 * 氛围仍走 gen-ambient-fx；旧 web 抠图路径已弃用。
 * 用法: node tools/import-particle-web.cjs
 */
require("child_process").execSync("node \"" + require("path").join(__dirname, "import-gen-fx.cjs") + "\"", {
  stdio: "inherit",
  cwd: require("path").resolve(__dirname, "../..")
});
console.log("unique ambient: node tools/gen-ambient-fx.cjs");
