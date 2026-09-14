# Web 资源优化

2026-09-14 实测：原 ZIP 66,202,256 bytes，优化 ZIP 9,638,668 bytes（63.14 → 9.19 MiB，减少 85.4%）。优化包解压后 12,679,976 bytes。

- 超大贴图按现有 `tools/optimize-textures.py` 的尺寸上限缩放，背景最大 720×1280，保持比例、路径和 UUID；同步 SpriteFrame 尺寸与九宫格边距。原图和报告保存在本机忽略目录 `outputs/texture-optimization/`。
- `settings/v2/packages/builder.json` 的 `chicken-web` 预设在 Web 构建时使用 WebP，质量 85。游戏贴图、自动图集和加载页贴图已指定该预设。PNG 源文件仍保留透明通道；Android 使用 ASTC 6×6（medium）和 WebP 85 回退；其他原生平台没有新增压缩配置。
- `openRunView` 在旧界面/加载页仍显示时准备动态贴图，复用已有资源缓存。地图只额外准备当前地图背景，商店准备两页背景，结算准备胜负背景。失败不移除旧界面，允许重新点击；切换中重复点击不会重复打开界面。

后续构建保持“压缩纹理”开启（`skipCompressTexture=false`），并启用自动图集（`packAutoAtlas=true`）。新导入大图可运行 `python tools/optimize-textures.py`；新图及图集需在 Creator 的纹理压缩设置中选择 `Chicken Web + Android (ASTC 6x6 / WebP 85)`。

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

## Android 原生包

沿用 `chicken-web` 预设 ID，已有贴图和图集无需重新绑定。Android 分组只输出 ASTC 6×6 与 WebP 85：前者用于支持 ASTC 的 GPU，后者作为兼容回退并保留透明通道。不加入 PVR、ETC 或额外 PNG 副本。GPU 压缩与 WebP 回退会同时占用安装包空间，因此不能将 Web ZIP 的 9.19 MiB 当作 APK 大小。

Creator 重新打开项目后，在项目设置的纹理压缩页确认此预设的 Android 分组包含上述两项；构建目标选 Android（不是 Web Mobile），保持 `skipCompressTexture=false` 和 `packAutoAtlas=true`。APK 还需要 Android SDK/NDK/JDK 与签名配置；最终大小和显示效果以 APK 构建及真机测试为准。

配置校验已通过：189 个贴图/图集仍绑定同一预设，Web 配置保持不变。Android 构建尝试在参数校验阶段停止：尚未设置必填的 Android packageName，因此本次没有生成 APK，也未完成真机验证。
