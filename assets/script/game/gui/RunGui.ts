import { Node, view } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { oops } from "db://oops-framework/core/Oops";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { CCEntity, ECSCtor, ECSView } from "db://oops-framework/module/common/CCEntity";

/** 打开界面：预制体缺脚本时补挂，保证动态加载预制体可跑 */
export async function openRunView<T extends ECSView>(entity: CCEntity, ctor: ECSCtor<T>): Promise<Node> {
    const key = gui.internal.getKey(ctor);
    const node = await oops.gui.open(key, { preload: true });
    // LayerGame resets prefab scale on open. Keep the game's 720x1280 local
    // coordinates proportional to the project's current design canvas.
    const scale = view.getDesignResolutionSize().height / 1280;
    node.setScale(scale, scale, 1);
    let comp = node.getComponent(ctor as any) as unknown as ecs.Comp;
    if (!comp) {
        comp = node.addComponent(ctor as any) as unknown as ecs.Comp;
    }
    entity.add(comp);
    oops.gui.show(key);
    return node;
}
