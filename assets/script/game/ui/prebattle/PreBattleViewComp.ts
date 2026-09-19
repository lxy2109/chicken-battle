import { STYLE_LABEL, inferFightStyle } from "../../domain/BattleStyle";
import { gameText, gameTextOr } from "../../domain/GameConfig";
import { Color, Label, Mask, Graphics, Tween, UIOpacity, UITransform, Vec3, tween, v3, _decorator } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { GameUIBase } from "../../shared/GameUIBase";
import { ChickenRun } from "../../run/ChickenRun";
import { combatPower } from "../../domain/EquipMath";
import { getStory } from "../../domain/Catalog";
import { FightStyle, Stats } from "../../domain/Types";
import { spawnChicken } from "../shared/ChickenBinder";
import { playGameEffect } from "../shared/GameAudio";
import { goScreen, registerScreen } from "../shared/Nav";
import { bindClick, setLabel } from "../shared/UiUtil";

const { ccclass, executionOrder } = _decorator;

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
@executionOrder(-100)
@ecs.register("PreBattleView", false)
@gui.register("PreBattleView", { layer: LayerType.UI, prefab: "gui/prebattle/prebattle" })
export class PreBattleViewComp extends GameUIBase<ChickenRun> {
    private exiting = false;
    /** 左右对比卡落点（含预制体 y），入场/震动/退场都回到这里，VS 圆洞才对得上徽章。 */
    private panelHome: Record<"Player" | "Enemy", Vec3> = {
        Player: v3(0, 25, 0),
        Enemy: v3(0, 25, 0)
    };

    async start() {
        this.nodeTreeInfoLite();
        this.fitMatchBoard();
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
        setLabel(this, "BtnLeaveLab", gameTextOr("PreBattleViewComp_019", "返回地图"));
        bindClick(this, "BtnFight", this.onFight.bind(this));
        bindClick(this, "BtnLeave", this.onLeave.bind(this));
    }

    private async onLeave() {
        if (this.exiting) return;
        this.exiting = true;
        this.ent.run.leavePrebattle();
        await goScreen(this, "map");
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

    /** 对比卡设计宽接近 720，窄屏按父节点宽度等比缩小，避免数值被裁切。 */
    private fitMatchBoard() {
        const board = this.getNode("MatchBoard");
        if (!board?.parent) return;
        const parentUt = board.parent.getComponent(UITransform);
        const boardUt = board.getComponent(UITransform);
        if (!parentUt || !boardUt || boardUt.width <= 0) return;
        const pad = 20;
        const maxW = Math.max(120, parentUt.width - pad * 2);
        const scale = Math.min(1, maxW / boardUt.width);
        board.setScale(scale, scale, 1);
    }

    private preparePanels() {
        // Partition the original composition; the circular badge is rendered only once.
        for (const side of ["Player", "Enemy"] as const) {
            const panel = this.getNode(side + "Panel")!;
            // 记住预制体落点（含 y=25）；以前写成 ( ±760, 0 ) 会把 y 抹掉，VS 洞和徽章错位。
            this.panelHome[side] = panel.position.clone();
            const art = this.getNode(side + "PanelArt")!;
            const mask = art.addComponent(Mask);
            mask.type = Mask.Type.GRAPHICS_STENCIL;
            const g = art.getComponent(Graphics)!;
            g.clear();
            const w = art.getComponent(UITransform)!.width / 2;
            const h = art.getComponent(UITransform)!.height / 2;
            // 与 VsBadge / VsArt 裁切一致：洞心相对 PanelArt 为 (-1, -36.667)。
            const cx = -1, cy = -36.667, r = 143.333;
            const edge = side === "Player" ? -w : w;
            g.moveTo(edge, h); g.lineTo(cx, h); g.lineTo(cx, cy + r);
            for (let i = 0; i <= 48; i++) {
                const angle = Math.PI / 2 + (side === "Player" ? 1 : -1) * Math.PI * i / 48;
                g.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
            }
            g.lineTo(cx, -h); g.lineTo(edge, -h); g.close(); g.fill();
            const home = this.panelHome[side];
            panel.setPosition(side === "Player" ? -760 : 760, home.y, home.z);
        }
        const vs = this.getNode("VsBadge")!;
        // 徽章对准面板圆洞：PanelArt(1.667,-24.667) + 洞心(-1,-36.667) + panel.y。
        this.alignVsBadge(vs);
        const mask = vs.addComponent(Mask);
        mask.type = Mask.Type.GRAPHICS_ELLIPSE;
        mask.segments = 64;
        vs.setScale(2.6, 2.6, 1);
        vs.addComponent(UIOpacity).opacity = 0;
    }

    /** 按当前面板落点把 VS 圆徽章摆到左右卡的圆洞中心。 */
    private alignVsBadge(vs = this.getNode("VsBadge")) {
        if (!vs) return;
        const art = this.getNode("PlayerPanelArt");
        const home = this.panelHome.Player;
        const artPos = art?.position ?? v3(1.667, -24.667, 0);
        // 洞心相对 PanelArt；与 preparePanels 遮罩参数保持一致。
        const holeLocalX = -1;
        const holeLocalY = -36.667;
        vs.setPosition(
            home.x + artPos.x + holeLocalX,
            home.y + artPos.y + holeLocalY,
            0
        );
        // VsArt 是整张对比卡，偏移使卡上 VS 圆对上徽章中心。
        const artNode = vs.getChildByName("VsArt");
        if (artNode) artNode.setPosition(-holeLocalX, -holeLocalY, 0);
    }

    private animatePanels() {
        if (!this.node.isValid) return;
        for (const side of ["Player", "Enemy"] as const) {
            const home = this.panelHome[side];
            const direction = side === "Player" ? 1 : -1;
            tween(this.getNode(side + "Panel")!)
                .delay(side === "Player" ? 0 : 0.06)
                .to(0.24, { position: v3(home.x + direction * 16, home.y, home.z) }, { easing: "quartOut" })
                .to(0.09, { position: home.clone() }, { easing: "quadOut" }).start();
        }
        const vs = this.getNode("VsBadge")!;
        this.alignVsBadge(vs);
        const home = vs.position.clone();
        vs.angle = -12;
        tween(vs.getComponent(UIOpacity)!).delay(0.44).to(0.06, { opacity: 255 }).start();
        tween(vs).delay(0.44)
            .to(0.16, { scale: v3(0.86, 0.86, 1), angle: 3 }, { easing: "quartIn" })
            .call(() => {
                playGameEffect("hit");
                // Short local impact shake; keep the camera, background and hit targets steady.
                for (const side of ["Player", "Enemy"] as const) {
                    const panel = this.getNode(side + "Panel")!;
                    const ph = this.panelHome[side];
                    tween(panel).to(0.035, { position: v3(ph.x - 7, ph.y + 3, ph.z) })
                        .to(0.045, { position: v3(ph.x + 5, ph.y - 2, ph.z) })
                        .to(0.065, { position: ph.clone() }).start();
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
        for (const side of ["Player", "Enemy"] as const) {
            const panel = this.getNode(side + "Panel")!;
            const home = this.panelHome[side];
            Tween.stopAllByTarget(panel);
            tween(panel).delay(0.08)
                .to(0.28, { position: v3(side === "Player" ? -800 : 800, home.y, home.z) }, { easing: "cubicIn" })
                .start();
        }
        for (const name of ["BtnFight", "BtnLeave"]) {
            const button = this.getNode(name);
            if (!button) continue;
            const buttonOpacity = button.getComponent(UIOpacity) || button.addComponent(UIOpacity);
            tween(buttonOpacity).to(0.16, { opacity: 0 }).start();
        }
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
