import { revealUI } from "./UiUtil";
import { Node, SpriteFrame, view } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { oops } from "db://oops-framework/core/Oops";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { ECSCtor, ECSView } from "db://oops-framework/module/common/CCEntity";
import { ChickenRun } from "../chicken/ChickenRun";
import { mapPrefab } from "../core/Catalog";
import { applyConfiguredTexts } from "./UiUtil";

const preparedDirectories = new Map<string, Promise<void>>();

/** 打开界面：预制体缺脚本时补挂，保证动态加载预制体可跑 */
export async function openRunView<T extends ECSView>(entity: ChickenRun, ctor: ECSCtor<T>): Promise<Node> {
    const key = gui.internal.getKey(ctor);
    // Dynamic sprites are not prefab dependencies. Finish their downloads and
    // decoding while the loading/previous view is still visible.
    const directories = ["chicken", "equip", "ui"];
    if (key === "MapView") directories.push("map");
    if (key === "RewardView") directories.push("icon");
    if (key === "BattleView") directories.push("fx");
    if (key === "MapView") gui.internal.getConfig(key).prefab = mapPrefab(entity.run.currentMap().id);
    const prefab = gui.internal.getConfig(key).prefab;
    const backgrounds = key === "ShopView" ? ["shop_figma"]
        : key === "ResultView" ? ["result_figma", "result_lose_figma"] : [];
    await Promise.all([
        ...directories.map(dir => {
            let ready = preparedDirectories.get(dir);
            if (!ready) {
                ready = new Promise<void>((resolve, reject) => {
                    oops.res.loadDir("bundle", `game/texture/${dir}`, SpriteFrame, (error: Error | null) => {
                        if (error) reject(error);
                        else resolve();
                    });
                }).catch(error => {
                    preparedDirectories.delete(dir);
                    throw error;
                });
                preparedDirectories.set(dir, ready);
            }
            return ready;
        }),
        new Promise<void>((resolve, reject) => {
            oops.res.loadAny("bundle", [prefab,
                "game/prefab/chicken", "game/feather-gradient",
                ...backgrounds.map(bg => `game/texture/bg/${bg}/spriteFrame`)],
            null, (error: Error | null) => error ? reject(error) : resolve());
        })
    ]);
    const node = await oops.gui.open(key, { preload: true });
    applyConfiguredTexts(node);
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
    const entrances: Record<string, string[]> = {
        customize: ["BtnStart", "LabSaveHint"],
        map: ["BtnCharacter", "GoldCard", "BtnChallenge"],
        character: ["PowerCard", "BtnHideAppearance"],
        result: ["LabHeader", "LabGold", "BtnNext"],
        reward: ["BtnConfirm"],
        shop: ["BtnLeave"],
        ending: ["LabTitle", "GainCard", "BtnCharacter"]
    };
    const names = entrances[node.name] || [];
    const visit = (parent: Node) => {
        for (const child of parent.children) {
            const index = names.indexOf(child.name);
            if (index >= 0) revealUI(child, index * 0.07);
            else if (child.active) visit(child);
        }
    };
    visit(node);
    return node;
}
