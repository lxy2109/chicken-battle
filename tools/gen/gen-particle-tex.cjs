/**
 * 火焰粒子贴图：改为走 Imagine 生图导入（import-gen-fx）。
 * 保留此入口以兼容旧命令。
 * 用法: node tools/gen-particle-tex.cjs
 */
require("child_process").execSync("node \"" + require("path").join(__dirname, "../import/import-gen-fx.cjs") + "\"", {
  stdio: "inherit",
  cwd: require("path").resolve(__dirname, "../..")
});
