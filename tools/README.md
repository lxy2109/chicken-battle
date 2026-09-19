# tools/

实现按职责分子目录；根目录保留同名入口（shim），旧命令 `node tools/xxx.cjs` 仍可用。

| 目录 | 内容 |
|------|------|
| `check/` | 类型、预制体、流程、节奏、Web 脚本、verify |
| `config/` | Excel 导入导出、schema、contract |
| `gen/` | 生成贴图 / 预制体 / 序列帧 |
| `import/` | 外部美术与特效导入 |
| `art/` | 优化、切图、UUID、Figma 清单 |
| `prefab/` | prefab-spec.json |
| `misc/` | MCP 调用等 |

依赖：`cd tools && npm ci`
