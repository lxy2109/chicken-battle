import { STYLE_LABEL, inferFightStyle } from "../../core/BattleStyle";
import { gameText, gameTextOr } from "../../core/GameConfig";
import { Color, Tween, Label, Mask, Graphics, UIOpacity, UITransform, tween, v3, _decorator } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { CCView } from "db://oops-framework/module/common/CCView";
import { ChickenRun } from "../../chicken/ChickenRun";
import { combatPower } from "../../core/EquipMath";
import { getStory } from "../../core/Catalog";
import { FightStyle, Stats } from "../../core/Types";
import { spawnChicken } from "../ChickenBinder";
import { playGameEffect } from "../GameAudio";
import { goScreen, registerScreen } from "../Nav";
import { bindClick, setLabel } from "../UiUtil";

const { ccclass } = _decorator;

const ROWS: Array<{ name: string; suffix: string; value: (stats: Stats) => number }> = [
    { get name() { return gameText("PreBattleViewComp_001"); }, suffix: "Hp", value: stats => stats.maxHp },
    { get name() { return gameText("PreBattleViewComp_002"); }, suffix: "Atk", value: stats => stats.atk },
    { get name() { return gameText("PreBattleViewComp_003"); }, suffix: "Spd", value: stats => stats.spd },
    { get name() { return gameText("PreBattleViewComp_004"); }, suffix: "Combo", value: stats => Math.round(stats.combo ?? stats.spd * 10) },
    { get name() { return gameText("PreBattleViewComp_005"); }, suffix: "Crit", value: stats => Math.round(stats.crit * 100) }
];

/** 特殊能力摘要，没有的项不占位。路数放在最前，让玩家开战前就知道这只鸡怎么打。 */
function extraText(s: Stats, style?: FightStyle): string {
    const label = STYLE_LABEL[style || inferFightStyle(s)];
    const parts = [
        gameTextOr("PreBattleViewComp_018", "路数 {0}", label),
        gameText("PreBattleViewComp_006", Math.round(s.crit * 100))
    ];
    if (s.healPerTurn > 0) parts.push(gameText("PreBattleViewComp_007", s.healPerTurn));
    if (s.revive > 0) parts.push(gameText("PreBattleViewComp_008", s.revive));
    if (s.lockHp) parts.push(gameText("PreBattleViewComp_009"));
    return parts.join("   ");
}

@ccclass("PreBattleViewComp")
@ecs.register("PreBattleView", false)
@gui.register("PreBattleView", { layer: LayerType.UI, prefab: "gui/prebattle/prebattle" })
export class PreBattleViewComp extends CCView<ChickenRun> {
    private exiting = false;
    async start() {
        this.nodeTreeInfoLite();
        this.preparePanels();
        const run = this.ent.run;
        const me = run.playerFighter();
        const foe = run.enemyFighter();

        setLabel(this, "LabTitle", run.currentRoute().name);
        setLabel(this, "LabStory", getStory(run.currentRoute().storyId || run.currentMap().storyId));
        setLabel(this, "LabPlayerName", me.name);
        setLabel(this, "LabEnemyName", foe.name);
        setLabel(this, "LabPlayerPower", `${combatPower(me.stats)}`);
        setLabel(this, "LabEnemyPower", `${combatPower(foe.stats)}`);
        setLabel(this, "LabExtra", extraText(me.stats, me.fightStyle));
        setLabel(this, "LabEnemyExtra", extraText(foe.stats, foe.fightStyle));
        setLabel(this, "LabDiff", "VS");
        this.fillDiff(me.stats, foe.stats);

        await spawnChicken(this, "PlayerSlot", me.appearance, 0.24);
        await spawnChicken(this, "EnemySlot", foe.appearance, 0.24, true);
        this.animatePanels();
        bindClick(this, "BtnFight", this.onFight.bind(this));
    }

    private fillDiff(a: Stats, b: Stats) {
        this.emphasize("LabPlayerPower", combatPower(a) > combatPower(b));
        for (const row of ROWS) {
            const delta = row.value(a) - row.value(b);
            const suffix = row.suffix;
            const unit = row.suffix === "Crit" ? "%" : "";
            setLabel(this, `LabDiff${suffix}`, `${row.suffix === "Atk" ? gameText("PreBattleViewComp_010") : row.name} ${delta >= 0 ? "+" : ""}${delta}${unit}`);
            setLabel(this, `LabPlayer${suffix}`, `${row.value(a)}${unit}`);
            setLabel(this, `LabEnemy${suffix}`, `${row.value(b)}${unit}`);
            this.emphasize(`LabPlayer${suffix}`, delta > 0);
        }
    }

    private emphasize(name: string, stronger: boolean) {
        const label = this.getNode(name)?.getComponent(Label);
        if (!label) return;
        label.color = stronger ? new Color(255, 224, 82) : new Color(255, 249, 225);
        label.fontSize = stronger ? 32 : 25;
        label.isBold = stronger;
    }

    private preparePanels() {
        // Partition the original composition; the circular badge is rendered only once.
        for (const side of ["Player", "Enemy"]) {
            const art = this.getNode(side + "PanelArt")!;
            const mask = art.addComponent(Mask);
            mask.type = Mask.Type.GRAPHICS_STENCIL;
            const g = art.getComponent(Graphics)!;
            g.clear();
            const w = art.getComponent(UITransform)!.width / 2;
            const h = art.getComponent(UITransform)!.height / 2;
            const cx = -1, cy = -36.667, r = 143.333;
            const edge = side === "Player" ? -w : w;
            g.moveTo(edge, h); g.lineTo(cx, h); g.lineTo(cx, cy + r);
            for (let i = 0; i <= 48; i++) {
                const angle = Math.PI / 2 + (side === "Player" ? 1 : -1) * Math.PI * i / 48;
                g.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
            }
            g.lineTo(cx, -h); g.lineTo(edge, -h); g.close(); g.fill();
            this.getNode(side + "Panel")!.setPosition(side === "Player" ? -760 : 760, 0);
        }
        const vs = this.getNode("VsBadge")!;
        const mask = vs.addComponent(Mask);
        mask.type = Mask.Type.GRAPHICS_ELLIPSE;
        mask.segments = 64;
        vs.setScale(2.6, 2.6, 1);
        vs.addComponent(UIOpacity).opacity = 0;
    }

    private animatePanels() {
        if (!this.node.isValid) return;
        for (const side of ["Player", "Enemy"]) {
            const direction = side === "Player" ? 1 : -1;
            tween(this.getNode(side + "Panel")!)
                .delay(side === "Player" ? 0 : 0.06)
                .to(0.24, { position: v3(direction * 16, 0) }, { easing: "quartOut" })
                .to(0.09, { position: v3() }, { easing: "quadOut" }).start();
        }
        const vs = this.getNode("VsBadge")!;
        const home = vs.position.clone();
        vs.angle = -12;
        tween(vs.getComponent(UIOpacity)!).delay(0.44).to(0.06, { opacity: 255 }).start();
        tween(vs).delay(0.44)
            .to(0.16, { scale: v3(0.86, 0.86, 1), angle: 3 }, { easing: "quartIn" })
            .call(() => {
                playGameEffect("hit");
                // Short local impact shake; keep the camera, background and hit targets steady.
                for (const side of ["Player", "Enemy"]) {
                    const panel = this.getNode(side + "Panel")!;
                    tween(panel).to(0.035, { position: v3(-7, 3) })
                        .to(0.045, { position: v3(5, -2) }).to(0.065, { position: v3() }).start();
                }
            })
            .to(0.09, { scale: v3(1.1, 1.1, 1), angle: -2 })
            .to(0.13, { scale: v3(1, 1, 1), angle: 0, position: home }).start();
    }

    private onFight() {
        if (this.exiting) return;
        this.exiting = true;
        const vs = this.getNode("VsBadge")!;
        Tween.stopAllByTarget(vs);
        const opacity = vs.getComponent(UIOpacity)!;
        Tween.stopAllByTarget(opacity);
        tween(vs).to(0.1, { scale: v3(1.15, 1.15, 1) })
            .to(0.2, { scale: v3(2.4, 2.4, 1) }, { easing: "quadIn" }).start();
        tween(opacity).delay(0.1).to(0.2, { opacity: 0 }).start();
        for (const side of ["Player", "Enemy"]) {
            const panel = this.getNode(side + "Panel")!;
            Tween.stopAllByTarget(panel);
            tween(panel).delay(0.08).to(0.28, { position: v3(side === "Player" ? -800 : 800, 0) }, { easing: "cubicIn" }).start();
        }
        const button = this.getNode("BtnFight")!;
        const buttonOpacity = button.getComponent(UIOpacity) || button.addComponent(UIOpacity);
        tween(buttonOpacity).to(0.16, { opacity: 0 }).start();
        // Node-bound completion is cancelled if the view is closed during the transition.
        tween(this.node).delay(0.38).call(() => {
            this.ent.run.startBattle();
            if (this.ent.run.screen === "battle") void goScreen(this);
        }).start();
    }

    reset() {
        this.node.destroy();
    }
}

registerScreen("prebattle", PreBattleViewComp);
