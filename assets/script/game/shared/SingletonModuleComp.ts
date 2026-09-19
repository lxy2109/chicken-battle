/*
 * @Author: dgflash
 * @Date: 2021-11-18 14:20:46
 * @LastEditors: dgflash
 * @LastEditTime: 2022-08-08 12:04:30
 */

import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { ChickenRun } from "../run/ChickenRun";
import { Initialize } from "../bootstrap/Initialize";

/** 游戏单例业务模块 */
@ecs.register('SingletonModule')
export class SingletonModuleComp extends ecs.Comp {
    /** 游戏初始化模块 */
    initialize: Initialize = null!;
    /** 斗鸡局内流程 */
    chickenRun: ChickenRun = null!;

    reset() { }
}

export var smc: SingletonModuleComp = ecs.getSingleton(SingletonModuleComp);
