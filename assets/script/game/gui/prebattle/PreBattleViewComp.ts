import { Label, Sprite, _decorator } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { CCView } from "db://oops-framework/module/common/CCView";
import { ChickenRun } from "../../chicken/ChickenRun";
import { PREFAB_PATH, TEX } from "../../core/Catalog";
import { combatPower } from "../../core/EquipMath";
import { Stats } from "../../core/Types";
import { spawnChicken } from "../ChickenBinder";
import { goScreen, registerScreen } from "../Nav";
import { bindClick, clearChildren, setLabel } from "../UiUtil";

const { ccclass } = _decorator;

const ROWS: Array<{ key: keyof Stats; name: string; icon: string }> = [
    { key: "maxHp", name: "生命", icon: "hp" },
    { key: "atk", name: "攻击", icon: "atk" },
    { key: "def", name: "防御", icon: "def" },
    { key: "spd", name: "速度", icon: "spd" }
];

/** 特殊能力摘要，没有的项不占位。 */
function extraText(s: Stats): string {
    const parts = [`暴击 ${Math.round(s.crit * 100)}%`];
    if (s.healPerTurn > 0) parts.push(`回血 ${s.healPerTurn}`);
    if (s.revive > 0) parts.push(`复活 ${s.revive}`);
    if (s.lockHp) parts.push("锁血");
    return parts.join("   ");
}

@ccclass("PreBattleViewComp")
@ecs.register("PreBattleView", false)
@gui.register("PreBattleView", { layer: LayerType.UI, prefab: "gui/prebattle/prebattle" })
export class PreBattleViewComp extends CCView<ChickenRun> {
    async start() {
        this.nodeTreeInfoLite();
        const run = this.ent.run;
        const me = run.playerFighter();
        const foe = run.enemyFighter();

        setLabel(this, "LabTitle", run.fightTitle());
        setLabel(this, "LabPlayerName", me.name);
        setLabel(this, "LabEnemyName", foe.name);
        setLabel(this, "LabPlayerPower", `${combatPower(me.stats)}`);
        setLabel(this, "LabEnemyPower", `${combatPower(foe.stats)}`);
        setLabel(this, "LabExtra", extraText(me.stats));
        setLabel(this, "LabEnemyExtra", extraText(foe.stats));

        await spawnChicken(this, "PlayerSlot", me.appearance, 0.62);
        await spawnChicken(this, "EnemySlot", foe.appearance, 0.62, true);
        await this.fillStats(me.stats, foe.stats);
        bindClick(this, "BtnFight", this.onFight.bind(this));
    }

    private async fillStats(a: Stats, b: Stats) {
        const slot = this.getNode("StatSlot");
        clearChildren(slot);
        if (!slot) return;
        for (const row of ROWS) {
            const node = await this.createPrefabNode(PREFAB_PATH.statRow);
            node.parent = slot;

            const av = Number(a[row.key]);
            const bv = Number(b[row.key]);
            const name = node.getChildByName("LabName")?.getComponent(Label);
            const pv = node.getChildByName("LabPlayer")?.getComponent(Label);
            const ev = node.getChildByName("LabEnemy")?.getComponent(Label);
            if (name) name.string = row.name;
            if (pv) pv.string = `${av}`;
            if (ev) ev.string = `${bv}`;

            const icon = node.getChildByName("Icon")?.getComponent(Sprite);
            if (icon) await this.setSprite(icon, TEX.icon(row.icon));

            const arrow = node.getChildByName("Arrow");
            if (arrow) {
                arrow.active = av !== bv;
                const sp = arrow.getComponent(Sprite);
                if (sp && av !== bv) await this.setSprite(sp, TEX.icon(av > bv ? "up" : "down"));
            }
        }
    }

    private async onFight() {
        this.ent.run.startBattle();
        await goScreen(this, "battle");
    }

    reset() {
        this.node.destroy();
    }
}

registerScreen("prebattle", PreBattleViewComp);
