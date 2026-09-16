import { Node, ParticleSystem } from "cc";
import { GameComponent } from "db://oops-framework/module/common/GameComponent";
import { PREFAB_PATH } from "../core/Catalog";

/**
 * 从掼蛋通用彩带预制体播一场胜利粒子。界面销毁时节点一起拆掉。
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
    for (const particle of node.getComponentsInChildren(ParticleSystem)) {
        if (!particle.enabled) continue;
        particle.playOnAwake = false;
        particle.stop();
        particle.clear();
        particle.play();
    }
    node.active = true;
}
