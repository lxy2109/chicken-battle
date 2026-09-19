# 斗鸡对战 chicken-battle

竖屏单机 Roguelite。无名鸡来到鸡鸣村，参加五张地图的争霸赛。热身赛按 2、2、3、3、5 递增，每图一场 BOSS 正式赛，最后单独挑战鸡王坤坤，共 21 场。

- 引擎：Cocos Creator 3.8.8
- 框架：[Oops Framework](https://gitee.com/dgflash/oops-framework)（ECS + GUI + 资源管理）
- 设计分辨率：720 x 1280

## 跑起来

clone 之后用 Cocos Creator 3.8.8 直接打开即可，编辑器插件源码已随仓库提交，不需要额外安装步骤。第一次打开会编译一会儿，之后点播放按钮预览。

只有插件的 `node_modules` 不入库，缺失时进对应目录执行 `npm install`。

## 玩法流程

```
customize ──▶ map ──▶ prebattle ──▶ battle ──▶ result ──▶ reward ──▶ map
  捏鸡         路线       赛前对比      自动战斗    只结算金币   部位三选一
                │             │
                └─ character  └─ 失败强化后回到当前节点

每图路线：热身（第1图2场、第2图2场、第3图3场、第4图3场、第5图5场）→ 正式赛 BOSS
五图完成 → 坤坤最终挑战
商店弹出：第2场热身、以及该图最后一场热身胜利后的强化完成时（两场重合则只弹一次）；地图另有常驻入口
```

热身胜利推进、失败在强化后留在当前节点。正式赛失败重置本图进度和部位成长，诸葛亮四件套随机保留一个部位的等级；金币、装备和首通记录保留。最终坤坤失败重新准备后直接重试。战斗结束直接发金币，`result` 只展示本局金币；点击“获得强化”后从头、脖、身、翼、腿五个部位中随机三张选一，先点卡片再用底部“选择强化”确认。鸡王胜利后直接进入 ending，不再发牌。

商店弹出不占关卡进度：战斗结算时已开放下一战斗关，逛店、购买或返回都不会推进或阻塞关卡。地图按当前图热身数量显示节点和正式赛 BOSS，末图正式赛通过后开放坤坤最终战；保留“鸡友杂货铺”入口。Route.shopAfter 决定战后商店弹出。

流程状态机在 `core/RunState.ts`，界面只负责调它的方法然后跳转，不自己判断流程走向。挑完之后去商店还是回地图由它决定，`RewardViewComp` 只看 `run.screen` 还是不是 `reward` 来决定就地换牌还是走人。

## 部位强化

三选一每次给三张不同部位的牌。练哪个部位加哪个属性、每级把部位撑大多少、外形最多撑几级，**全在 `Reward` 配表里，代码一条都没写死**，`weight` 设 0 就是暂时不出现。属性加成按选中次数一直叠加，`maxLevel` 只限制对应部位的外形放大。

当前只启用部位强化池；金币已经在结算时发放，不会占掉三选一名额。

| 部位 | 属性 | 表里的名字 |
| --- | --- | --- |
| 头部 | 攻击 | 锐喙 |
| 脖子 | 暴击 | 灵颈 |
| 躯干 | 生命 | 壮体 |
| 翅膀 | 连击展示 | 硬羽 |
| 腿脚 | 敏捷 | 疾步 |

练过的部位会明显大一圈，这是玩家唯一能一眼看出自己练了什么的地方，所以体型倍数挂在 `Appearance.partScale` 上跟着战斗快照走，战斗、备战、结算所有画鸡的界面都自动生效。角色面板的槽位上也标着 `Lv`。

`core/PartUpgrade.ts` 里等级是唯一的真相源，属性加成和体型倍数都从它现算，不另存一份。这一点是有代价才定下来的：要是选中时既升级又把属性 merge 进 `bonus`，同一份加成就会被算两次。`verify-mvp.ts` 里"强化只加一份属性并撑大部位"这条断言专门盯着它。

角色面板分为头、脖子、身体、脚、套装五个页签，超过八件时翻页。新增装备分头饰、颈饰、翼饰、足具四槽。商店整套出售四件套，购买进入背包后可整套穿戴或卸下，同槽位自动替换。只有当前穿戴装备提供属性，穿齐整套触发套装加成；穿戴状态随本地存档保留。角色、备战、战斗和结算共用装备部位显示。

## 战斗

战斗是**即时制的电脑对战**，玩家只观战，不操作。

双方各有各的出手冷却，谁的冷却先走完谁就出手，没有回合交替。冷却由速度换算：

```
出手间隔 = 1.6 / (1 + spd / 20)     下限 0.55 秒
```

所以速度在这里不是抢先手，而是实打实的输出乘数，`combatPower` 里也用同一个式子给速度计权。

`core/BattleSession.ts` 是纯逻辑内核，`tick(dt)` 按时间推进并吐出事件；出招只登记意图，伤害要等演出层真的撞上了才回调 `resolveStrike` 结算。`gui/battle/BattleViewComp.ts` 每帧取事件分发，两边的出招演出各跑各的异步链、互不等待，所以场上会出现两只鸡同时扑上去的画面。

出什么招由 `battle/BattleBrain.ts` 的行为树决定。判据本身都放在 `core/BattleAI.ts` 的 `AI_RULE` 里当单一真相源：同一组谓词，`decide` 用 if 串起来，行为树用节点串起来，组合方式不同但判据是同一份。之所以留两套组合，是因为行为树在 `db://oops-framework` 下，`core` 引用它就没法脱离编辑器跑验证了，所以 `BattleSession` 把决策器留成构造参数，游戏跑起来时注入行为树，不传就退回 `decide`。`verify-mvp` 里铺开六百多组状态逐一比对两者结论，谁改歪了都会被逮到。

出招分两层：打多少伤害只看是普攻还是技能，摆什么动作是纯演出，两者不挂钩，所以动作可以按观赏性随便编排，不影响平衡。动作一共八种（鸡啄米、金鸡独立、乌鸦坐飞鸡、天外飞鸡、铁头功、神龙摆尾、连珠神啄、金蝉脱壳），按局势分成几个池子，**在池内按出手序号轮换**。轮换这一步是必需的：数值在一场里几乎不变，判据的结论也就不变，动作若只由判据决定，通场就只看得见一两个动作——改之前兜底那一支占了全部出招的四成，飞扑一种就占了 65%。现在最多的一种占两成，八种全在场。`check-pace.cjs` 盯着这个分布。

演出层有条不显眼的约束：位移必须走抛物线。用一段直线插值走过去的话，起跳抬多高都会被立刻拉平成平移，看着就是贴地飘过去，所以 `ChickenActor` 把跳跃拆成上升和下落两段，上升减速、下落加速。

有两处是为了让配表在即时制下还成立而做的换算，配表本身一个字没动：

- **单刀伤害等比缩小到三成**。配表按回合制配的，一场只够砍五到十刀，照搬过来就成了每隔几秒动一下的慢动作。缩小之后一场能打二三十刀，强弱关系不变。
- **概率进位取整**。缩放后的伤害带小数，直接四舍五入会系统性坑弱势方（1.2 恒定截成 1 白丢两成输出，而 7.8 进位成 8 几乎无损），改成按小数部分的概率进位，长期期望值和配表算出来的一致。

战斗倍率与冷却现由 GameRule 配置；每只怪通过 Enemy.targetBattleSeconds 设置目标节奏（默认普通怪25、正式赛Boss35、最终鸡王45）。这是相对参考时长，实际耗时取决于双方属性与演出，仍以血量归零结束。

## 目录结构

更完整的约定见 [docs/architecture/directory-structure.md](docs/architecture/directory-structure.md)。

```
assets/
  bundle/                         # 唯一业务 Asset Bundle（包名 bundle）
    common/                       # 框架弹窗皮肤（路径勿改）
    config/game/                  # 配表 JSON
    gui/<screen>/                 # 界面预制体
    game/
      prefab/actor|ui|fx|skill/   # 鸡、UI 卡片、特效、绝招
      image/                      # 所有位图父目录
        actor|anim|bg|ui|icon|map|equip/  # 普通贴图
        texture/common|stamp|skill/       # 仅特效贴图
      media/video|suit_gif/       # 结局视频、套装 GIF
      effect/                     # feather-gradient 等
      audio/ font/ animator/
  script/
    Main.ts
    gif/                          # GIF 工具
    game/
      domain/                     # 纯逻辑（原 core），可 node 验证
      battle/                     # 战斗演出运行时
      ui/                         # 界面（shared/ + 各屏）
      run/                        # 一局 ECS 实体
      bootstrap/                  # 启动与加载
      shared/                     # smc、GameUIBase、Alert 配置
tools/
  check|config|gen|import|art|prefab|misc/
  *.cjs                           # 根目录兼容入口
extensions/                       # 编辑器插件
```

`domain/` 里的代码刻意不引用 `cc`，所以战斗和数值逻辑可以脱离编辑器用 node 直接验证。

## 配表

配表是 `assets/bundle/config/game/*.json`，启动时由 `domain/LoadTables.ts` 灌进 `Config.ts` 的缓存，之后统一走 `Catalog.ts` 读。

| 表 | 内容 |
| --- | --- |
| `Player` | 玩家初始属性、鸡王 id、各种提示文案 |
| `Stage` | 旧版关卡配置（Route 为当前流程真相） |
| `Route` | 五张地图按 2/2/3/3/5 热身加正式赛与最终挑战共 21 个节点，mapId 区分地图，配置敌人、胜负金币 |
| `Enemy` | 敌人属性与嘲讽台词 |
| `Item` | 装备：槽位、价格、属性、所属套装、是否皮肤 |
| `Set` | 套装：件数、2/4 件效果、折扣 |
| `Part` | 捏鸡时可选的颜色与表情 |
| `Reward` | 三选一池：部位对应属性、每级撑大多少、外形放大上限、权重 |

配置源统一为 `excel/斗鸡配置.xlsx`。在 Creator 的 **扩展 → 斗鸡 Excel 配表** 中直接搜索、增删和编辑记录，点击 **保存 Excel** 后再点击 **导出并刷新资源**。首次在扩展管理器的项目页刷新并启用 `chicken-excel`。命令行 `node tools/excel-kit.cjs` 仍可使用，请勿直接修改生成的JSON。新增 Map、GameRule、UiText、Danmaku、DanmakuRule 表，动态文本使用 Language 表；剧情独立在 Story 表，Map.storyId 指定地图剧情，Route.storyId 可覆盖。角色台词独立在 Taunt 表，Player/Enemy.tauntGroup 引用，按 order 排序。最终敌人及奖励统一由 Route 管理。详见 [配表说明](excel/配表说明.md)。

## 界面与美术管线

本项目多数界面由 `tools/gen-prefabs.cjs` 生成。五张地图例外：运行时使用 `gui/map/map_1` 到 `map_5`，背景和关卡/商店落点在编辑器里手调，不要用生成脚本覆盖。

界面布局以策划原型的 `1080 × 1920` 竖屏标注为准，生成器按 `2/3` 等比换算到项目现有的 `720 × 1280` 设计画布；标题栏、安全边距、区域卡片、四列商店和底部主按钮都按 `LAYOUT-SPEC.md` 对齐。原型目录当前提供 SVG/PNG 标注，没有独立 HTML 文件。

运行时靠 `GameComponent.getNode(name)` 按名字取节点，所以**单个预制体内节点名必须唯一**。

美术素材从生图到进项目分三步：

```
node tools/slice-sheet.cjs <整图> <行> <列> temp/art <名字1,名字2,...>   # 切图集，顺带抠白底
node tools/import-art.cjs temp/art                                       # 拷进 bundle 并写 .meta
node tools/gen-prefabs.cjs                                               # 重新生成预制体
```

预制体上的脚本组件由 `node tools/mcp-call.cjs attach` 挂（要开编辑器）。运行时其实有兜底，`openRunView` 发现节点没脚本会自己 `addComponent`，所以漏跑这步游戏照样能跑，只是编辑器里看不到组件。

这一步有个坑：编辑器缓存着预制体，直接 enter/save 会把缓存里的旧内容原样写回，把 `gen-prefabs` 刚生成的改动悄悄盖掉，而且**目录级 reimport 刷不掉单个资源的缓存**。所以 attach 内部会对每个预制体单独 reimport 再等两秒半，慢是慢，但不这样做改动会丢。

还有一条容易踩的：所有 Label 的 `overflow` 必须是 SHRINK，不能用 NONE。NONE 会让节点尺寸跟着文字内容走，左对齐的金币数字从 `8` 变成 `128` 时会左右横跳，空文本更是直接把节点宽度塌成 0。

需要靠 `_color` 染色的方块和特效底，贴的是编辑器内置纯白图 `7d8f9b89-…d7ca@f9941`。别写成 `56a0bfc3-…ae06`——那是框架模板里 `common/texture/btn_ok.png` 的 uuid，用它当白底的话，所有染色块都会顶着一张确定按钮的图，而且因为图能正常加载，编辑器一声不响。

框架模板自带的通用皮肤（`common/texture/` 的弹窗底、按钮、提示条、等待转圈，以及 `gui/loading/texture/` 的加载图）由 `node tools/replace-tex.cjs` 换成本项目风格。这些图被 `common/prefab/` 下的弹窗引用，而框架是按路径硬编码找那几个预制体的（`GuiEnum` 里的 Toast / Wait / Mask），所以不能改名也不能挪地方，脚本的做法是原地覆盖像素、沿用 `.meta` 里原有的 uuid，引用一个都不用动；尺寸变了会同步重算 spriteFrame 的顶点和 uv。其中提示条和进度条这类极端细长的纯几何件由 `tools/draw-ui.cjs` 用距离场直接画出来，圆角和描边比生图可控。**换完要逐个 reimport 贴图**，同样是因为编辑器缓存的关系。

`tools/art-uuids.cjs` 按数组下标给每张图算固定 uuid，预制体里直接硬引用这些 uuid。**这些数组只能往尾部追加**：中间插入或删除会让后面所有素材换 uuid，而编辑器资源库里还留着旧 uuid 的记录，冲突时它会静默地重新分配一个随机 uuid，游戏里就是一片白块，且编辑器不报任何错。真要删除条目，得先把那几张图连同 `.meta` 删掉、刷新资源库，再重新导入。

## 校验脚本

改完记得跑：

| 脚本 | 查什么 | 要开编辑器 |
| --- | --- | --- |
| `node tools/check-prefabs.cjs` | 节点重名、超出 720x1280 设计区、引用了不存在的贴图、两段文字互相压着 | 否 |
| `node tools/check-ts.cjs` | `assets/script` 的类型错误（过滤掉插件源码的噪音） | 否 |
| `node tools/verify-assets.cjs` | 磁盘上的贴图 uuid 与编辑器资源库是否一致 | 是 |
| `node tools/run-verify.cjs` | 流程状态机、装备套装数值、决策、战斗胜负与节奏，全程不碰引擎 | 否 |
| `node tools/check-pace.cjs` | 招式分布、演出预算、一场实际打多久（需先跑过 `run-verify`） | 否 |

`run-verify.cjs` 跑的是 `tools/verify-mvp.ts` 里的流程断言，覆盖固定路线、商店货架、部位强化和战斗内核。`core/` 不引用 `cc` 就是为了它能脱离编辑器跑。

它做两件额外的事：项目不直接装 typescript，所以借插件那份来编译；行为树在 `db://oops-framework` 下，node 不认这个协议头，所以编译时靠 `tools/check/tsconfig.verify.json` 里的 paths 映射把它一起编进来，执行前再劫持 `require` 把 `db://` 指向编译产物。

`check-pace.cjs` 量的是只看胜负发现不了的两件事。一是招式分布：数值一场里几乎不变，招式若跟判据一一绑死，通场就只有一个动作。二是演出预算：逻辑层出招期间挂着 `busy` 不出新招，「起手到打着」这段动画一旦长过最快出手间隔 0.55 秒，演出就会顶住节奏，把速度堆上去的收益吃掉。它里面那张动画时长表是手抄 `ChickenActor` 的，**改了那边的时长要跟着改这里**。

它量时长时会照真实玩法一路把强化挑掉，这条不能省：不吃强化的鸡王战要打 37 秒，而一路练上去约 27 秒，正好落在能看清来回的区间。跳过强化去量等于量了个没人会经历的局。

`tools/mcp-call.cjs` 是编辑器 MCP 服务的命令行入口，`call` 可以调任意工具：

```
node tools/mcp-call.cjs tools                              # 列出所有工具
node tools/mcp-call.cjs schema <工具名>                     # 看参数
node tools/mcp-call.cjs call <工具名> '<json 参数>'
node tools/mcp-call.cjs logs                               # 编辑器错误日志
```

## 编辑器插件

`extensions/` 下的插件源码随仓库提交，clone 下来即可直接用。

| 插件 | 作用 | 来源 |
| --- | --- | --- |
| `oops-plugin-framework` | 框架本体，提供 `db://oops-framework` | gitee dgflash |
| `oops-plugin-hot-update` | 热更新 | gitee dgflash |
| `cocos-mcp-server` | 编辑器 MCP 服务，供 AI 直接操作场景与预制体 | github DaxianLee |

### 为什么插件源码要入库

游戏脚本全部通过 `db://oops-framework/...` 引用框架代码，这个路径来自框架插件 `package.json` 里声明的 asset-db 挂载点（挂的是 `extensions/oops-plugin-framework/assets`）。

插件缺失时，编辑器会对每一个引用报 `资产数据库 oops-framework 未挂载`，全部脚本飘红，场景和预览都起不来。上游模板的 `.gitignore` 会忽略这些插件目录，换台机器 clone 就必然踩到，所以改成源码入库。

不入库的只有各插件的 `node_modules` 和框架的离线文档 `docs`：前者由 `npm install` 生成，后者有 9MB 且只是 API 文档，都不影响编译与运行。

### 插件重装

前两个插件执行对应脚本重装（windows 用 `.bat`，mac 用 `.sh`），升级版本要先手动删掉目录再执行：

- `update-oops-plugin-framework`
- `update-oops-plugin-hot-update`

`cocos-mcp-server` 没有安装脚本：

```
git clone --depth 1 https://github.com/DaxianLee/cocos-mcp-server.git extensions/cocos-mcp-server
rmdir /s /q extensions\cocos-mcp-server\.git
cd extensions\cocos-mcp-server && npm install
```

装完在编辑器里启用插件并重启，然后从 `扩展 > Cocos MCP Server` 打开面板启动服务。插件默认端口是 3000，而 `.cursor/mcp.json` 与 `tools/mcp-call.cjs` 用的是 3100，两边要对齐。

## 2026-09-14 策划补充接入

- 13 个音频：3 首场景音乐、开战/胜负、5 种战斗反馈，以及从 cocos_guandan 复用的正向/关闭按钮音。连续战斗音统一限频 0.9 秒，避免音轨堆叠。恢复音效没有对应交付文件，仍为空。
- 185 条弹幕在 Danmaku.json。热身用万能池，BOSS 正式赛用专属池；坤坤专属中“鸡你太美”占80%。普通关卡类型保留70%/30%混合能力。半血切换密度和速度，去重不影响战斗随机数。
- 套装名称与造型按用户最新确认以 Figma 为准：诸葛亮、关羽、医疗鸡、直升鸡、铁公鸡共5套20件；保留鸡王中王通关奖励。旧钢鸡混凝土与更早装备只供旧存档兼容，不再售卖。商店整套出售，套装加成按穿齐整套生效。
- 新增效果初值：连续命中每层8%、最多5层；治疗+30%；金币+20%；额外购物85折。文档未给具体数值，这些是可调初值。商店按未拥有部件计整套价。
- 新存档version为3，保留原存储键。Figma 道袍/配饰调整到身体/脖子槽，旧版本先按旧槽校验，再按新槽保留最后穿戴的一件，已购装备不会丢失。旧装备仍可穿戴，旧商店进度迁移到后续战斗节点，旧结局开放新增坤坤挑战；不清除用户存档。
- 剧情配置在独立 Story 表，通过角色创建、赛前和结局显示。最终战奖励只发放一次，结局可进入角色面板穿戴，配有复用 Guandan 星光贴图的加冕效果。

资源导入命令：

```powershell
node tools/import-supplements.cjs "../鸡王争霸赛" "../cocos_guandan"
node tools/gen-prefabs.cjs
```

导入脚本会重新生成补充配置中的初始数值；手工调平衡后不要直接重跑覆盖。当前补充数据已回填至总表，后续统一从Excel导出。音乐与弹幕来源为本次提供目录和 Markdown，按钮正向/关闭音及星光贴图来自 cocos_guandan。

验证：45条逻辑回归与游戏脚本类型检查通过，包含新增的装备槽迁移。Creator 内已实际走通地图、战前、自动战斗、胜利结算和强化页；听感及不同设备比例尚需验收。


## Figma 原稿资源与界面

设计来源：https://www.figma.com/design/Ifh4rQEVTW9JvYppgyf1kX/Untitled?node-id=0-1

- 原文件以 PNG、SVG 各导出133个顶层图层。导入器按原 SVG 元素组合背景、按钮、竹简、头像框、结算台；实时姓名、数值、关卡状态由脚本绘制。地图使用同稿中提供的空道路版本，避免烘焙示例数据重叠。
- `tools/figma-assets.json` 记录来源、原稿坐标与稳定 UUID。UI 内部仍为720×1280战斗坐标，打开界面时按项目1080×1920设计画布等比缩放；保留现有战斗位移代码。
- 五张地图、11种敌人造型、五套完整装备及单件已接入。玩家原画拆分为头、颈、身、翼、左右腿的颜色层和线稿层；成套服装和敌人采用完整插画，随整体战斗动作移动。
- 删除10张已无引用的旧鸡拆件及配套meta。旧装备贴图仍供已有存档使用。

重新导入（Python需要Pillow，Node渲染器固定为@resvg/resvg-js 2.6.2）：

```powershell
npm install --prefix temp/figma-renderer --no-audit --no-fund @resvg/resvg-js@2.6.2
python tools/import-figma.py temp/figma-2026-09-14 temp/figma-renderer/node_modules/@resvg/resvg-js
node tools/gen-prefabs.cjs
node tools/check-prefabs.cjs
node tools/check-ts.cjs
node tools/run-verify.cjs
node tools/verify-assets.cjs
```

导出目录须包含原命名的`png/`与`svg/`子目录，下载包保留在本机 Downloads。若重新运行策划导入器，应再运行 Figma 导入器以应用已确认的套装命名和部位映射；两个导入器都不应在手工调整配置后直接覆盖。界面变更应修改预制体生成器，避免下次生成回退。
