import { _decorator } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { CCView } from "db://oops-framework/module/common/CCView";
import { ChickenRun } from "../../chicken/ChickenRun";
import { combatPower } from "../../core/EquipMath";
import { getPlayer } from "../../core/Catalog";
import { Stats } from "../../core/Types";
import { spawnChicken } from "../ChickenBinder";
import { goScreen, registerScreen } from "../Nav";
import { bindClick, setLabel } from "../UiUtil";

const { ccclass } = _decorator;

const ROWS: Array<{ name: string; value: (stats: Stats) => number }> = [
    { name: "生命", value: stats => stats.maxHp },
    { name: "攻击伤害", value: stats => stats.atk },
    { name: "敏捷", value: stats => stats.spd },
    { name: "连击", value: stats => Math.round(stats.combo ?? stats.spd * 10) },
    { name: "暴击", value: stats => Math.round(stats.crit * 100) }
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

        setLabel(this, "LabTitle", run.currentRoute().name);
        setLabel(this, "LabStory", run.currentRoute().encounter === "final" ? getPlayer().hintBoss : getPlayer()[`story${run.currentMap().id}`]);
        setLabel(this, "LabPlayerName", me.name);
        setLabel(this, "LabEnemyName", foe.name);
        setLabel(this, "LabPlayerPower", `${combatPower(me.stats)}`);
        setLabel(this, "LabEnemyPower", `${combatPower(foe.stats)}`);
        setLabel(this, "LabExtra", extraText(me.stats));
        setLabel(this, "LabEnemyExtra", extraText(foe.stats));
        setLabel(this, "LabDiff", "VS");
        this.fillDiff(me.stats, foe.stats);

        await spawnChicken(this, "PlayerSlot", me.appearance, 0.24);
        await spawnChicken(this, "EnemySlot", foe.appearance, 0.24, true);
        bindClick(this, "BtnFight", this.onFight.bind(this));
    }

    private fillDiff(a: Stats, b: Stats) {
        for (const row of ROWS) {
            const delta = row.value(a) - row.value(b);
            const suffix = row.name === "攻击伤害" ? "Atk" : row.name === "生命" ? "Hp" : row.name === "敏捷" ? "Spd" : row.name === "连击" ? "Combo" : "Crit";
            const unit = row.name === "暴击" ? "%" : "";
            setLabel(this, `LabDiff${suffix}`, `${row.name === "攻击伤害" ? "攻击" : row.name} ${delta >= 0 ? "+" : ""}${delta}${unit}`);
            setLabel(this, `LabPlayer${suffix}`, `${row.value(a)}${unit}`);
            setLabel(this, `LabEnemy${suffix}`, `${row.value(b)}${unit}`);
        }
    }

    private async onFight() {
        this.ent.run.startBattle();
        if (this.ent.run.screen === "battle") await goScreen(this);
    }

    reset() {
        this.node.destroy();
    }
}

registerScreen("prebattle", PreBattleViewComp);
