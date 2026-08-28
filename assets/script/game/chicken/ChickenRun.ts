import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { CCEntity } from "db://oops-framework/module/common/CCEntity";
import { RunModelComp } from "./model/RunModelComp";

@ecs.register("ChickenRun")
export class ChickenRun extends CCEntity {
    RunModel!: RunModelComp;

    protected init() {
        this.addComponents<ecs.Comp>(RunModelComp);
    }

    get run() {
        return this.RunModel.data;
    }
}
