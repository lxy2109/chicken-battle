# oops-game-kit

### 介绍
基于 Oops Framework 提供的游戏项目开发模板，项目中提供了最新版本 Cocos Creator 3.x 插件与游戏资源初始化通用逻辑。

### 使用Oops Framework创建游戏模板项目
1. 下载模板项目
```
git clone https://gitee.com/dgflash/oops-game-kit.git
```

2. 框架插件

`extensions/` 下的三个插件源码已随本仓库提交，clone 下来即可直接用，无需再执行安装脚本。

只有插件目录意外丢失、或需要重装依赖时，才执行对应脚本（windows 用 `.bat`，mac 用 `.sh`）：

- `update-oops-plugin-framework` 框架插件
- `update-oops-plugin-hot-update` 热更新插件
- `update-oops-plugin-excel-to-json` Excel 转 Json 插件

要升级插件版本，先手动删掉 `extensions/` 下对应目录，再执行脚本重新克隆。

### 为什么插件源码要入库

游戏脚本全部通过 `db://oops-framework/...` 引用框架代码，这个路径来自框架插件 `package.json` 里声明的 asset-db 挂载点（挂的是 `extensions/oops-plugin-framework/assets`）。

插件缺失时，编辑器会对每一个引用报 `资产数据库 oops-framework 未挂载`，26 个脚本全线飘红，场景和预览都起不来。模板原本的 `.gitignore` 会忽略这些插件目录，换台机器 clone 就必然踩到，所以改成源码入库。

不入库的只有各插件的 `node_modules` 和框架的离线文档 `docs`：前者由 `npm install` 生成，后者有 9MB 且只是 API 文档，都不影响编译与运行。

### 模板项目目录结构
```
res                         - 预制引用的静态资源
resources                   - 动态加载引用的资源
    audio                       - 音乐资源
    common                      - 公共资源
    config                      - 配置资源
        game                        - 游戏自定义内容配置数据表
        config.json                 - 框架默认配置资源（可扩展内容）
    content                     - 自定义动态加载内容资源
    game                        - 核心玩法内容资源
    gui                         - 界面资源
        loading                     - 游戏初次加载界面
    language                    - 多语言资源
script                      - 游戏脚本
    game                        - 游戏业务模块
        common                      - 游戏公共模块
            config                      - 游戏配置
                GameEvent.ts                - 全局事件配置
                GameUIConfig.ts             - 界面窗口配置（提供oops.gui模块使用的配置数据）
            table                       - 游戏配置表对象(可通过oops-plugin-excel-to-json自动生成)
        initialize                  - 游戏初始化模块
        SingletonModuleComp.ts      - 游戏单例业务模块
    Main.ts                     - 游戏入口脚本
```

根据上面的目录结构，在开发游戏时，可将资源存放到对应的文件夹中管理。这套模板项目自带以下游戏必备功能。
- 屏幕自适应
- 游戏本地配置数据获取
- 游戏地址查询参数获取
- 游戏初始化业务流程
    - 初始可自定义资源加载提示界面
- 加载与现实第一个游戏自定义界面

### 屏幕自适应
Cocos Creator 菜单->项目->项目设置
#### 横屏自适应
![](https://oops-1255342636.cos.ap-shanghai.myqcloud.com/img/kit/1.jpg)

#### 竖屏自适应
![](https://oops-1255342636.cos.ap-shanghai.myqcloud.com/img/kit/2.jpg)

设置好后，其它的交给框架自动处理即可。

### 游戏初始化模块
#### 游戏启动时加载的必备资源
initialize/bll/InitRes.ts

这个脚本管理游戏启动时加载的必备资源，此处要注意的是，这里配置的资源尽量小一些，避免无提示加载阶段黑屏时间过长，导致游戏体验下降。
- 加载公共资源
- 加载多语言包（可选）
- 加载自定义资源（可选）

initialize/view/LoadingViewComp.ts

这个脚本是游戏内容资源加载界面的控制脚本，游戏内容资源一般较大，会有加载进度条提示来提高游戏体验。所有资源加载完后，会通过执行以下脚本来显示游戏第一个自定义界面。
```
oops.gui.open(UIID.Demo);
```

### QQ群
- 798575969（1群 - 满）
- 621415300（2群 - 满）
- 628575875（3群 - 满）
- 226524184（4群-推荐）
- 741197640（5群-推荐）

### QQ频道：q366856bf5

### [点击了解作者其它产品](https://store.cocos.com/app/search?name=oops)