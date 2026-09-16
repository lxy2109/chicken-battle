/*
 * @Author: dgflash
 * @Date: 2021-07-03 16:13:17
 * @LastEditors: dgflash
 * @LastEditTime: 2022-08-05 18:25:56
 */
import { _decorator, ResolutionPolicy, screen, view } from 'cc';
import { oops } from '../../extensions/oops-plugin-framework/assets/core/Oops';
import { Root } from '../../extensions/oops-plugin-framework/assets/core/Root';
import { ecs } from '../../extensions/oops-plugin-framework/assets/libs/ecs/ECS';
import { ChickenRun } from './game/chicken/ChickenRun';
import { smc } from './game/common/SingletonModuleComp';
import { UIConfigData } from './game/common/config/GameUIConfig';
import { Initialize } from './game/initialize/Initialize';

const { ccclass } = _decorator;

const DESIGN_W = 1080;
const DESIGN_H = 1920;

@ccclass('Main')
export class Main extends Root {

    protected run() {
        smc.initialize = ecs.getEntity<Initialize>(Initialize);
        smc.chickenRun = ecs.getEntity<ChickenRun>(ChickenRun);
    }

    protected initGui() {
        oops.res.memoryCacheBundles.add(oops.res.defaultBundleName);
        oops.gui.init(UIConfigData);
        this.applyResolutionPolicy();
        screen.on("window-resize", this.applyResolutionPolicy, this);
        screen.on("orientation-change", this.applyResolutionPolicy, this);
    }

    /** 竖屏固定宽度、横屏固定高度，避免 UNKNOWN 在编辑器设备预览里按中心裁切把底栏切掉。 */
    private applyResolutionPolicy = () => {
        const ws = screen.windowSize;
        if (ws.width <= 0 || ws.height <= 0) return;
        const windowAspect = ws.width / ws.height;
        const designAspect = DESIGN_W / DESIGN_H;
        if (windowAspect > designAspect) {
            const height = DESIGN_H;
            const width = height * windowAspect;
            view.setDesignResolutionSize(width, height, ResolutionPolicy.FIXED_HEIGHT);
        } else {
            const width = DESIGN_W;
            const height = width / windowAspect;
            view.setDesignResolutionSize(width, height, ResolutionPolicy.FIXED_WIDTH);
        }
    };
}
