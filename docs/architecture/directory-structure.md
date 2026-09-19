# 目录结构约定

本文是 chicken-battle 的目录规范。移动资源或脚本时 **必须带着配对 `.meta`（保留 UUID）**，禁止复制新文件再删旧文件；不要改 `@ccclass` / `@ecs.register` / `@gui.register` 字符串。

## 总览

```
assets/
  bundle/                 # 唯一业务 Asset Bundle（包名 bundle）
    common/               # 框架级弹窗/遮罩（路径勿改名：Oops 硬编码）
    config/game/          # 配表 JSON（由 excel 导出）
    language/             # 多语言
    gui/<screen>/         # 界面预制体，一屏一目录
    game/                 # 玩法资源（贴图/预制体/音频/媒体）
  script/
    Main.ts
    gif/                  # GIF 解码播放
    game/
      bootstrap/          # 启动与加载
      run/                # 一局 ECS 实体
      domain/             # 纯逻辑（禁止引用 ui）
      battle/             # 战斗演出运行时
      ui/                 # 界面（与 bundle/gui 对齐）
        shared/           # Nav、RunGui、ChickenBinder…
        <screen>/         # 各屏 ViewComp
      shared/             # smc、GameUIBase、GameUIConfig
  resources/              # 引擎 resources 包（仅必要启动配置）
tools/
  check/ | config/ | gen/ | import/ | art/ | prefab/ | misc/
  *.cjs                   # 根目录薄入口，转发到子目录（兼容旧命令）
docs/architecture/        # 架构约定（本文件）
excel/                    # 配表源 xlsx
```

## 脚本分层

| 目录 | 职责 | 可依赖 |
|------|------|--------|
| `domain` | 类型、配表、Run 状态、BattleSession/AI、Catalog 路径 | 自身 + 少量 oops 工具（JsonUtil） |
| `battle` | 动画、Actor、行为树包装、出招序列帧播放 | domain、oops animator/BT |
| `ui` | 各屏 ViewComp、绑定鸡、音频、导航 | domain、battle、run、shared、gif |
| `run` | 一局实体 + RunModel | domain |
| `bootstrap` | 启动队列、Loading | domain、ui、shared |
| `shared` | smc、UI 基类、Alert 配置 | run、bootstrap、ui/shared（adaptView） |

运行时资源路径 **只写在** `domain/Catalog.ts` 的 `PREFAB_PATH` / `TEX` / `FX_TEX`。界面预加载目录在 `ui/shared/RunGui.ts`。

`bootstrap` 加载公共资源使用显式包名：

```ts
oops.res.loadDir("bundle", "common", next);
```

`common` 是 **bundle 包内目录**，不是独立 Asset Bundle。

## Bundle 内资源

| 路径 | 内容 |
|------|------|
| `gui/<screen>/` | 仅该屏预制体 |
| `game/prefab/actor/` | 鸡预制体 |
| `game/prefab/ui/` | 商店条目、奖励卡、气泡等 |
| `game/prefab/fx/` | combat / ambient / ribbon |
| `game/image/` | **所有位图的父目录**（标识「这是图片」） |
| `game/image/actor/` | 鸡部位与立绘（head/neck/body/…） |
| `game/image/anim/` | 出招序列帧 `key/style` |
| `game/image/bg/` `ui/` `icon/` `map/` `equip/` | 普通贴图（按用途） |
| `game/image/texture/` | **仅特效贴图**：`common` / `stamp` / `skill` |
| `game/media/video` / `game/media/suit_gif` | 结局视频、套装 GIF |
| `game/effect/` | 自定义 effect（如 feather-gradient） |
| `game/audio/` | 音效 BGM |
| `common/` | 弹窗皮肤（**不可挪路径**） |

**约定：**

1. 所有 png/jpg 位图放在 `game/image/` 下，不要散落在 `game/` 根。  
2. `texture` 专指特效纹理；UI/角色/背景不要进 `game/image/texture/`。

### 鸡部位文件名

| 英文 | 含义 |
|------|------|
| head | 头 |
| neck | 脖子 |
| body | 身体 |
| wing_front / wing_back | 前/后翅膀 |
| leg_front / leg_back | 前/后腿 |

## 工具目录

| 子目录 | 用途 |
|--------|------|
| `check/` | 类型、预制体、流程、节奏、Web 脚本校验、`run-verify` |
| `config/` | Excel 导入导出与 schema |
| `gen/` | 生成贴图/预制体/序列帧 |
| `import/` | 外部美术导入 |
| `art/` | 优化、切图、UUID、Figma 清单 |
| `prefab/` | prefab-spec |
| `misc/` | MCP 等杂项 |

根目录保留 `node tools/<name>.cjs` 入口，内部 `require` 子目录实现。

## 移动检查清单

1. 文件与 `.meta` 一起移动，确认 UUID 未变  
2. 更新 `Catalog` / `RunGui` / 工具硬编码路径  
3. `node tools/check-ts.cjs`、`node tools/check-prefabs.cjs`  
4. Creator 打开 main 场景与各 `gui` 预制体，确认无丢脚本  
5. 预览：捏鸡 → 地图 → 战斗 → 结算 → 商店  

## 明确禁止

- 在 View 里散落硬编码贴图路径（应走 `Catalog` 的 `TEX` / `FX_TEX`）  
- 把位图直接放在 `game/` 根下（应统一进 `game/image/`）  
- 把非特效图放进 `game/image/texture/`（应放 `game/image/ui`、`actor`、`bg` 等）  
- 把 `library/`、`temp/`、`outputs/`、`art-src/` 当源目录提交  
- 改 `common/prefab` 与 `common/texture` 的路径名（框架按路径查找）  
- 无 meta 的「另存为」式资源替换  
