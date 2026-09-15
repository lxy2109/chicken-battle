# 斗鸡 Excel 配表

在 Cocos Creator 的 **扩展 → 斗鸡 Excel 配表** 打开面板。

首次添加到已打开的项目时，在 **扩展 → 扩展管理器 → 项目** 中刷新列表并启用 `chicken-excel`。若列表尚未更新，重新打开项目即可。扩展使用普通 JavaScript，无需编译。

## 策划使用

1. 面板默认读取项目里的 `excel/斗鸡配置.xlsx`；也可以选择其他符合相同表结构的 `.xlsx`。
2. 点击 **打开 Excel**，编辑后保存，再回到 Creator。
3. 点击 **校验预览**，检查表数量、记录数和数据内容。默认展示 Enemy，目标时长列紧邻怪物名字；每张表最多预览100条，但导出完整数据。
4. 点击 **导出并刷新资源**，生成游戏配置并刷新资源数据库。重新预览游戏后生效。

校验预览不会写文件。导出会重新读取磁盘，不使用旧预览缓存。错误直接显示在面板，包括解析器提供的工作表、单元格或ID；校验失败不会开始写JSON。若JSON已导出但资源刷新失败，面板会单独提示手动刷新。

## 实现

- 主进程直接复用 `tools/config-export.cjs`，与命令行入口保持相同校验规则，没有启动外部命令行进程。
- ExcelJS/JSZip依赖统一位于 `tools`，首次安装项目时在该目录执行 `npm ci`。
- 输出目录固定为当前项目 `assets/bundle/config/game`。
- 面板只预览文件，修改内容仍在Excel中完成。

验证：`node tools/check-excel-panel.cjs`（主进程API模拟与真实Excel读写），`node tools/check-config.cjs`（导表回归）。模拟检查不等同于Creator内面板验收。

扩展结构依据 [Creator 3.8 扩展定义](https://docs.cocos.com/creator/3.8/manual/zh/editor/extension/define.html) 和 [文件选择接口](https://docs.cocos.com/creator/3.8/manual/zh/editor/extension/api/dialog.html)。
