import { Label, _decorator } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { CCView } from "db://oops-framework/module/common/CCView";
import { ChickenRun } from "../../chicken/ChickenRun";
import { PREFAB_PATH } from "../../core/Catalog";
import { Stats } from "../../core/Types";
import { spawnChicken } from "../ChickenBinder";
import { goScreen, registerScreen } from "../Nav";
import { bindClick, clearChildren, setLabel } from "../UiUtil";

const { ccclass } = _decorator;

const ROWS: Array<{ key: keyof Stats; name: string }> = [
    { key: "maxHp", name: "生命" },
    { key: "atk", name: "攻击" },
    { key: "def", name: "防御" },
    { key: "spd", name: "速度" }
];

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
        await spawnChicken(this, "PlayerSlot", me.appearance, 0.9);
        await spawnChicken(this, "EnemySlot", foe.appearance, 0.9);
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
            const name = node.getChildByName("LabName")?.getComponent(Label);
            const pv = node.getChildByName("LabPlayer")?.getComponent(Label);
            const ev = node.getChildByName("LabEnemy")?.getComponent(Label);
            if (name) name.string = row.name;
            const av = Number(a[row.key]);
            const bv = Number(b[row.key]);
            if (pv) pv.string = String(av);
            if (ev) ev.string = String(bv);
        }
        const extra = this.getNode("LabExtra");
        if (extra) {
            const lab = extra.getComponent(Label);
            if (lab) {
                lab.string = `暴击 ${Math.round(a.crit * 100)}% vs ${Math.round(b.crit * 100)}%\n回血 ${a.healPerTurn} vs ${b.healPerTurn}  复活 ${a.revive} vs ${b.revive}`;
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
