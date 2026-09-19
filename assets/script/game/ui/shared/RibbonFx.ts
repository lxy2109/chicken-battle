import { Node, ParticleSystem2D } from "cc";
import { GameComponent } from "db://oops-framework/module/common/GameComponent";
import { PREFAB_PATH } from "../../domain/Catalog";

/**
 * 胜利彩带：ParticleSystem2D 预制体。界面销毁时节点一起拆掉。
 */
export async function playWinRibbon(view: GameComponent): Promise<void> {
    const parent = view.node;
    if (!parent?.isValid) return;
    let node: Node | null = null;
    try {
        node = await view.createPrefabNode(PREFAB_PATH.fxRibbon);
    }
    catch {
        return;
    }
    if (!node || !parent.isValid) {
        node?.destroy();
        return;
    }
    node.layer = parent.layer;
    node.parent = parent;
    node.setPosition(0, 0, 0);
    for (const particle of node.getComponentsInChildren(ParticleSystem2D)) {
        if (!particle.enabled) continue;
        particle.playOnLoad = false;
        particle.stopSystem();
        particle.resetSystem();
    }
    node.active = true;
}
