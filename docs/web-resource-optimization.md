# Web 资源优化

2026-09-14 实测：原 ZIP 66,202,256 bytes，优化 ZIP 9,638,668 bytes（63.14 → 9.19 MiB，减少 85.4%）。优化包解压后 12,679,976 bytes。

- 超大贴图按现有 `tools/optimize-textures.py` 的尺寸上限缩放，背景最大 720×1280，保持比例、路径和 UUID；同步 SpriteFrame 尺寸与九宫格边距。原图和报告保存在本机忽略目录 `outputs/texture-optimization/`。
- `settings/v2/packages/builder.json` 的 `chicken-web` 预设在 Web 构建时使用 WebP，质量 85。游戏贴图、自动图集和加载页贴图已指定该预设。PNG 源文件仍保留透明通道；非 Web 平台没有新增压缩配置。
- `openRunView` 在旧界面/加载页仍显示时准备动态贴图，复用已有资源缓存。地图只额外准备当前地图背景，商店准备两页背景，结算准备胜负背景。失败不移除旧界面，允许重新点击；切换中重复点击不会重复打开界面。

后续构建保持“压缩纹理”开启（`skipCompressTexture=false`），并启用自动图集（`packAutoAtlas=true`）。新导入大图可运行 `python tools/optimize-textures.py`；新图及图集需在 Creator 的纹理压缩设置中选择 `Chicken Web (WebP 85)`。

本次构建位于 `build/web-mobile-optimized/`，可上传包为 `build/web-mobile-optimized.zip`，原 `build/web-mobile.zip` 保留。

验证：

```powershell
node tools/check-ts.cjs
node tools/check-prefabs.cjs
node tools/check-resource-cache.cjs
node tools/check-view-resources.cjs
node tools/check-web-scripts.cjs build/web-mobile-optimized
git diff --check
```

已通过 Creator 3.8.8 实际构建及本地浏览器首页、捏鸡、地图冒烟验证；加载等待、失败重试和缓存复用有模拟下载测试。尚未验证线上 CDN/弱网及手机真机，不以本地效果推断生产加载时间。
