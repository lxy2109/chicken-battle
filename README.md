# 斗鸡对战 chicken-battle

竖屏单机 Roguelite。捏一只斗鸡，沿冒险路线连打五关，靠奖励和商店装备把战力堆起来，最后挑战鸡王。

- 引擎：Cocos Creator 3.8.8
- 框架：[Oops Framework](https://gitee.com/dgflash/oops-framework)（ECS + GUI + 资源管理）
- 设计分辨率：720 x 1280

## 跑起来

clone 之后用 Cocos Creator 3.8.8 直接打开即可，编辑器插件源码已随仓库提交，不需要额外安装步骤。第一次打开会编译一会儿，之后点播放按钮预览。

只有插件的 `node_modules` 不入库，缺失时进对应目录执行 `npm install`。

## 玩法流程

```
customize ──▶ map ──▶ prebattle ──▶ battle ──▶ result ──┬──▶ shop ──▶ map
  捏鸡         地图      赛前对比      对战      结算     │      商店
                │                                        └──▶ reward ──▶ shop
                └──▶ character（查看面板，不推进流程）           选奖励
```

每关分热身赛和正式赛两场：

| | 输了 | 赢了 |
| --- | --- | --- |
| 热身赛 | 拿安慰金，照常进正式赛 | 拿奖金，进正式赛 |
| 正式赛 | 本关从热身赛重来 | 拿奖金 + 三选一奖励，进下一关 |

五关（东篱、麦场、祠堂、河滩、校场）打完解锁鸡王决战，赢了进 ending。

流程状态机在 `core/RunState.ts`，界面只负责调它的方法然后跳转，不自己判断流程走向。

## 战斗

战斗是**即时制的电脑对战**，玩家只观战，不操作。

双方各有各的出手冷却，谁的冷却先走完谁就出手，没有回合交替。冷却由速度换算：

```
出手间隔 = 1.6 / (1 + spd / 20)     下限 0.55 秒
```

所以速度在这里不是抢先手，而是实打实的输出乘数，`combatPower` 里也用同一个式子给速度计权。

`core/BattleSession.ts` 是纯逻辑内核，`tick(dt)` 按时间推进并吐出事件；出招只登记意图，伤害要等演出层真的撞上了才回调 `resolveStrike` 结算。`gui/battle/BattleViewComp.ts` 每帧取事件分发，两边的出招演出各跑各的异步链、互不等待，所以场上会出现两只鸡同时扑上去的画面。

出什么招由 `battle/BattleBrain.ts` 的行为树决定。判据本身都放在 `core/BattleAI.ts` 的 `AI_RULE` 里当单一真相源：同一组谓词，`decide` 用 if 串起来，行为树用节点串起来，组合方式不同但判据是同一份。之所以留两套组合，是因为行为树在 `db://oops-framework` 下，`core` 引用它就没法脱离编辑器跑验证了，所以 `BattleSession` 把决策器留成构造参数，游戏跑起来时注入行为树，不传就退回 `decide`。`verify-mvp` 里铺开六百多组状态逐一比对两者结论，谁改歪了都会被逮到。

出招分两层：打多少伤害只看是普攻还是技能，摆什么动作是纯演出，两者不挂钩，所以动作可以按观赏性随便编排，不影响平衡。动作一共八种（贴身啄、跳踢、飞扑、腾空下砸、扑翅冲撞、转身扫尾、连啄、假动作偷袭），按局势分成几个池子，**在池内按出手序号轮换**。轮换这一步是必需的：数值在一场里几乎不变，判据的结论也就不变，动作若只由判据决定，通场就只看得见一两个动作——改之前兜底那一支占了全部出招的四成，飞扑一种就占了 65%。现在最多的一种占两成，八种全在场。`check-pace.cjs` 盯着这个分布。

演出层有条不显眼的约束：位移必须走抛物线。用一段直线插值走过去的话，起跳抬多高都会被立刻拉平成平移，看着就是贴地飘过去，所以 `ChickenActor` 把跳跃拆成上升和下落两段，上升减速、下落加速。

有两处是为了让配表在即时制下还成立而做的换算，配表本身一个字没动：

- **单刀伤害等比缩小到三成**。配表按回合制配的，一场只够砍五到十刀，照搬过来就成了每隔几秒动一下的慢动作。缩小之后一场能打二三十刀，强弱关系不变。
- **概率进位取整**。缩放后的伤害带小数，直接四舍五入会系统性坑弱势方（1.2 恒定截成 1 白丢两成输出，而 7.8 进位成 8 几乎无损），改成按小数部分的概率进位，长期期望值和配表算出来的一致。

鸡王血厚又带回血复活，按常规节奏要打四十多秒，所以决战单独加快加重了一档，双方同步，压回三十秒出头。一场战斗的实际时长在十几到三十几秒之间，`verify-mvp` 里有回归断言盯着。

## 目录结构

```
assets/
  bundle/
    config/game/          配表 json（Player Stage Enemy Item Set Part Reward Language）
    game/prefab/          玩法内预制体（鸡、特效、卡片），由脚本生成
    game/texture/         美术素材：chicken 部位 / ui 控件 / icon / equip / map / bg
    gui/<screen>/         各界面预制体，由脚本生成
  script/game/
    core/                 纯逻辑，不引用 cc，可以直接用 node 跑
      Types.ts              数据结构与战斗事件定义
      Config.ts             配表缓存
      Catalog.ts            配表读取与资源路径
      RunState.ts           整局流程状态机
      EquipMath.ts          装备/套装/属性/战力计算
      BattleSession.ts      战斗内核，吃双方快照吐事件序列
      BattleAI.ts           行为决策
      RewardGen.ts / Rng.ts 奖励生成与固定种子随机
    battle/               战斗演出：ChickenActor 部位动画、BattleAnimator、BattleBrain 行为树
    gui/                  各界面 ViewComp，Nav.ts 管跳转，UiUtil.ts 是取节点/绑事件的封装
    chicken/              ECS 实体 ChickenRun，持有 RunState
tools/                    生成与校验脚本
extensions/               编辑器插件源码
```

`core/` 里的代码刻意不引用 `cc`，所以战斗和数值逻辑可以脱离编辑器用 node 直接验证。

## 配表

配表是 `assets/bundle/config/game/*.json`，启动时由 `core/LoadTables.ts` 灌进 `Config.ts` 的缓存，之后统一走 `Catalog.ts` 读。

| 表 | 内容 |
| --- | --- |
| `Player` | 玩家初始属性、鸡王 id、各种提示文案 |
| `Stage` | 五个关卡的敌人 id、奖金、提示 |
| `Enemy` | 敌人属性与嘲讽台词 |
| `Item` | 装备：槽位、价格、属性、所属套装、是否皮肤 |
| `Set` | 套装：件数、2/4 件效果、折扣 |
| `Part` | 部位与可选颜色 |
| `Reward` | 正式赛胜利后的三选一奖励池 |

想从 excel 出表用 `node tools/excel-kit.cjs`，直接改 json 也行。

## 界面与美术管线

本项目的界面**不在编辑器里手搓**，`assets/bundle/gui/` 和 `assets/bundle/game/prefab/` 下的预制体全部由 `tools/gen-prefabs.cjs` 生成。在编辑器里改布局，下次跑生成脚本就会被覆盖，要改界面请改脚本。

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

`run-verify.cjs` 跑的是 `tools/verify-mvp.ts` 里的 16 项断言，覆盖整局流程和战斗内核。`core/` 不引用 `cc` 就是为了它能脱离编辑器跑。

它做两件额外的事：项目不直接装 typescript，所以借插件那份来编译；行为树在 `db://oops-framework` 下，node 不认这个协议头，所以编译时靠 `tools/tsconfig.verify.json` 里的 paths 映射把它一起编进来，执行前再劫持 `require` 把 `db://` 指向编译产物。

`check-pace.cjs` 量的是只看胜负发现不了的两件事。一是招式分布：数值一场里几乎不变，招式若跟判据一一绑死，通场就只有一个动作。二是演出预算：逻辑层出招期间挂着 `busy` 不出新招，「起手到打着」这段动画一旦长过最快出手间隔 0.55 秒，演出就会顶住节奏，把速度堆上去的收益吃掉。它里面那张动画时长表是手抄 `ChickenActor` 的，**改了那边的时长要跟着改这里**。

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
