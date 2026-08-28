import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { RunState } from "../../core/RunState";

@ecs.register("RunModel")
export class RunModelComp extends ecs.Comp {
    data: RunState = new RunState();

    reset() {
        this.data = new RunState();
    }
}
