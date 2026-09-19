import { gameText } from "../domain/GameConfig";
/*
 * @Author: dgflash
 * @Date: 2021-07-03 16:13:17
 * @LastEditors: bansomin
 * @LastEditTime: 2024-03-31 01:17:02
 */
import { _decorator } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { oops } from "db://oops-framework/core/Oops";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { CCViewVM } from "db://oops-framework/module/common/CCViewVM";
import { adaptView } from "../ui/shared/adaptView";
import { CustomizeViewComp } from "../ui/customize/CustomizeViewComp";
import { openRunView } from "../ui/shared/RunGui";
import "../ui/shared/Views";
import { smc } from "../shared/SingletonModuleComp";
import { loadGameTables } from "../domain/LoadTables";
import { Initialize } from "./Initialize";

const { ccclass, executionOrder } = _decorator;

/** 游戏资源加载 */
@ccclass('LoadingViewComp')
@executionOrder(-100)
@ecs.register('LoadingView', false)
@gui.register('LoadingView', { layer: LayerType.UI, prefab: "gui/loading/loading" })
export class LoadingViewComp extends CCViewVM<Initialize> {
    /** VM 组件绑定数据 */
    data: any = {
        /** 加载资源当前进度 */
        finished: 0,
        /** 加载资源最大进度 */
        total: 0,
        /** 加载资源进度比例值 */
        progress: "0",
        /** 加载流程中提示文本 */
        prompt: ""
    };

    private progress: number = 0;

    onLoad() {
        adaptView(this.node);
        super.onLoad();
    }

    start() {
        this.enter();
    }

    enter() {
        this.loadRes();
    }

    /** 加载资源 */
    private async loadRes() {
        this.data.progress = 0;
        await this.loadCustom();
        this.loadGameRes();
    }

    /** 加载游戏本地JSON数据（自定义内容） */
    private async loadCustom() {
        this.data.prompt = "战鸡正在整装待发…";
        await loadGameTables();
    }

    /** 加载初始游戏内容资源 */
    private loadGameRes() {
        // 加载初始游戏内容资源时的提示文本
        this.data.prompt = gameText("loading_resources");
        // 首屏只加载首页与角色；战斗、商店、地图资源由对应界面按需加载。
        oops.res.loadAny("bundle", ["gui/customize/customize", "game/prefab/actor/chicken"],
            this.onProgressCallback.bind(this), this.onCompleteCallback.bind(this));
    }

    /** 加载进度事件 */
    private onProgressCallback(finished: number, total: number, item: any) {
        this.data.finished = finished;
        this.data.total = total;

        var progress = finished / total;
        if (progress > this.progress) {
            this.progress = progress;
            this.data.progress = (progress * 100).toFixed(0);
        }
    }

    /** 加载完成事件 */
    private async onCompleteCallback(error?: Error) {
        if (error) {
            this.data.prompt = gameText("loading_failed");
            console.error("[LoadingView]", error);
            return;
        }
        // 恢复本地存档并进入首页
        this.data.prompt = gameText("loading_character");
        smc.chickenRun.RunModel.load();
        try {
            await openRunView(smc.chickenRun, CustomizeViewComp);
            this.remove();
        } catch (error) {
            this.data.prompt = gameText("loading_failed");
            console.error("[LoadingView]", error);
        }
    }

    reset(): void { }
}
