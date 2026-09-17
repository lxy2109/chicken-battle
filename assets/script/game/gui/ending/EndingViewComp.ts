import { gameTextOr } from "../../core/GameConfig";
import {
    _decorator, BlockInputEvents, Color, Graphics, Label, Node, Sprite, UITransform,
    VideoClip, VideoPlayer, Widget, isValid
} from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { GameUIBase } from "../../common/GameUIBase";
import { ChickenRun } from "../../chicken/ChickenRun";
import { TEX } from "../../core/Catalog";
import { goScreen, registerScreen } from "../Nav";
import { UIBgAdaptation } from "../UIBgAdaptation";
import { bindNodeClick, hexColor } from "../UiUtil";

const { ccclass, executionOrder } = _decorator;

const VIDEO_NODE = "EndingVideo";
const CHAMPION_NODE = "ChampionPanel";
const TITLE_NODE = "LabChampion";
const HOME_BTN = "BtnHome";
const HOME_LAB = "BtnHomeLab";
/** 结局片源像素尺寸，Cover 适配按这个基线放大铺满视口。 */
const VIDEO_SIZE = { width: 406, height: 720 };
/** 播完后停在最后一帧的秒数，再切黑屏领奖。 */
const LAST_FRAME_HOLD = 2;

@ccclass("EndingViewComp")
@executionOrder(-100)
@ecs.register("EndingView", false)
@gui.register("EndingView", { layer: LayerType.UI, prefab: "gui/ending/ending" })
export class EndingViewComp extends GameUIBase<ChickenRun> {
    private videoNode: Node | null = null;
    private videoDone: (() => void) | null = null;
    private finished = false;

    onLoad() {
        super.onLoad();
        this.hideLegacy();
    }

    async start() {
        this.nodeTreeInfoLite();
        const panel = await this.mountChampionPanel();
        await this.playEndingVideo();
        if (this.node?.isValid) this.showChampion(panel);
    }

    private hideLegacy() {
        const bg = this.node.children.find(child => child.name.endsWith("_adaptBg") || child.name === "bg");
        const sp = bg?.getComponent(Sprite);
        if (sp) sp.color = Color.BLACK;
        const content = this.node.getChildByName("content");
        for (const child of (content || this.node).children) {
            if (child === bg) continue;
            if (child.name === CHAMPION_NODE || child.name === VIDEO_NODE) continue;
            child.active = false;
        }
    }

    private async playEndingVideo() {
        if (!this.node?.isValid) return;
        let clip: VideoClip | null = null;
        try {
            clip = await this.load("bundle", TEX.endingVideo, VideoClip);
        } catch (error) {
            console.warn("[Ending] 结局视频加载失败，直接进入领奖页", error);
            return;
        }
        if (!clip || !this.node?.isValid || this.finished) return;

        const node = new Node(VIDEO_NODE);
        node.layer = this.node.layer;
        this.node.addChild(node);
        const ut = node.addComponent(UITransform);
        ut.setContentSize(VIDEO_SIZE.width, VIDEO_SIZE.height);
        ut.setAnchorPoint(0.5, 0.5);
        node.setPosition(0, 0, 0);
        node.addComponent(BlockInputEvents);

        // 与全屏背景一致：按片源尺寸 Cover 放大，多出来的边裁掉，不再用 Widget 拉伸或 keepAspect 留黑边。
        const adapt = node.addComponent(UIBgAdaptation);
        const viewport = this.node.getComponent(UITransform);
        if (viewport) adapt.viewportTransform = viewport;

        const player = node.addComponent(VideoPlayer);
        player.resourceType = VideoPlayer.ResourceType.LOCAL;
        player.playOnAwake = false;
        player.loop = false;
        player.keepAspectRatio = false;
        player.fullScreenOnAwake = false;
        player.stayOnBottom = false;
        player.volume = 1;
        player.clip = clip;
        this.videoNode = node;
        adapt.refresh();

        await new Promise<void>(resolve => {
            let settled = false;
            let holding = false;
            // 每个 scheduleOnce 必须用不同函数引用。引擎对同一回调只会保留第一次调度，
            // 先前把 90s 兜底和 2s 停留都绑在 finish 上，结果会空等到 90s 才进黑屏。
            const finish = () => {
                if (settled) return;
                settled = true;
                this.unschedule(onHoldTimeout);
                this.unschedule(onSafetyTimeout);
                this.unschedule(onDurationHold);
                resolve();
            };
            const onHoldTimeout = () => finish();
            const onSafetyTimeout = () => finish();
            const holdLastFrame = () => {
                if (settled || holding) return;
                holding = true;
                this.unschedule(onDurationHold);
                this.unschedule(onSafetyTimeout);
                freezeLastFrame(player);
                this.scheduleOnce(onHoldTimeout, LAST_FRAME_HOLD);
            };
            const onDurationHold = () => holdLastFrame();
            this.videoDone = finish;
            node.on(VideoPlayer.EventType.COMPLETED, holdLastFrame, this);
            node.on(VideoPlayer.EventType.ERROR, finish, this);
            node.on(VideoPlayer.EventType.META_LOADED, () => {
                adapt.refresh();
                const duration = player.duration;
                if (duration > 0 && Number.isFinite(duration)) {
                    this.scheduleOnce(onDurationHold, duration);
                }
            }, this);
            player.play();
            this.scheduleOnce(() => {
                if (!isValid(player) || player.isPlaying) return;
                player.play();
            }, 1);
            this.scheduleOnce(() => adapt.refresh(), 0);
            this.scheduleOnce(onSafetyTimeout, 90);
        });
        this.stopEndingVideo();
    }

    private async mountChampionPanel() {
        const host = this.node.getChildByName("content") || this.node;
        let panel = host.getChildByName(CHAMPION_NODE);
        if (!panel) {
            panel = new Node(CHAMPION_NODE);
            panel.layer = host.layer;
            panel.active = false;
            host.addChild(panel);
        }
        fillWidget(panel);
        panel.addComponent(BlockInputEvents);
        paintBlack(panel);

        const title = panel.getChildByName(TITLE_NODE) || new Node(TITLE_NODE);
        title.layer = panel.layer;
        if (!title.parent) panel.addChild(title);
        const titleUt = title.getComponent(UITransform) || title.addComponent(UITransform);
        titleUt.setContentSize(640, 220);
        title.setPosition(0, 80, 0);
        const titleLab = title.getComponent(Label) || title.addComponent(Label);
        titleLab.string = gameTextOr("EndingViewComp_002", "冠军请领奖！！！");
        titleLab.fontSize = 80;
        titleLab.lineHeight = 96;
        titleLab.isBold = true;
        titleLab.overflow = Label.Overflow.SHRINK;
        titleLab.enableWrapText = true;
        titleLab.horizontalAlign = Label.HorizontalAlign.CENTER;
        titleLab.verticalAlign = Label.VerticalAlign.CENTER;
        titleLab.color = Color.WHITE;
        titleLab.useSystemFont = true;

        const btn = panel.getChildByName(HOME_BTN) || new Node(HOME_BTN);
        btn.layer = panel.layer;
        if (!btn.parent) panel.addChild(btn);
        const btnUt = btn.getComponent(UITransform) || btn.addComponent(UITransform);
        btnUt.setContentSize(400, 88);
        btn.setPosition(0, -200, 0);
        const btnSprite = btn.getComponent(Sprite) || btn.addComponent(Sprite);
        btnSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        btnSprite.type = Sprite.Type.SLICED;
        try {
            await this.setSprite(btnSprite, TEX.ui("figma_button_yellow"), "bundle");
        } catch (error) {
            console.warn("[Ending] 领奖按钮贴图加载失败", error);
        }

        const labNode = btn.getChildByName(HOME_LAB) || new Node(HOME_LAB);
        labNode.layer = btn.layer;
        if (!labNode.parent) btn.addChild(labNode);
        const labUt = labNode.getComponent(UITransform) || labNode.addComponent(UITransform);
        labUt.setContentSize(360, 68);
        labNode.setPosition(0, 0, 0);
        const lab = labNode.getComponent(Label) || labNode.addComponent(Label);
        lab.string = gameTextOr("EndingViewComp_003", "回到首页");
        lab.fontSize = 34;
        lab.lineHeight = 40;
        lab.isBold = true;
        lab.overflow = Label.Overflow.SHRINK;
        lab.enableWrapText = false;
        lab.horizontalAlign = Label.HorizontalAlign.CENTER;
        lab.verticalAlign = Label.VerticalAlign.CENTER;
        lab.color = hexColor("#fffAEC");
        lab.enableOutline = true;
        lab.outlineColor = hexColor("#3a220c");
        lab.outlineWidth = 3;
        lab.useSystemFont = true;

        bindNodeClick(btn, () => { void this.onHome(); }, this);
        return panel;
    }

    private showChampion(panel: Node) {
        if (!this.node?.isValid || this.finished) return;
        this.finished = true;
        this.stopEndingVideo();
        if (panel.isValid) panel.active = true;
    }

    private async onHome() {
        await goScreen(this, "customize");
    }

    private stopEndingVideo() {
        const done = this.videoDone;
        this.videoDone = null;
        done?.();
        const node = this.videoNode;
        this.videoNode = null;
        if (!node?.isValid) return;
        const player = node.getComponent(VideoPlayer);
        try { player?.stop(); } catch { /* 部分平台 stop 时节点已失效 */ }
        node.destroy();
    }

    reset() {
        this.finished = true;
        this.stopEndingVideo();
        this.node.destroy();
    }
}

function freezeLastFrame(player: VideoPlayer) {
    if (!isValid(player)) return;
    const duration = player.duration;
    const tail = duration > 0 && Number.isFinite(duration) ? Math.max(0, duration - 0.04) : player.currentTime;
    try { player.pause(); } catch { /* 部分平台 ended 后 pause 会抛 */ }
    try { player.currentTime = tail; } catch { /* 部分平台不允许回拨 */ }
    const video = player.nativeVideo;
    if (video) {
        try { video.pause(); } catch { /* ignore */ }
        if (video.duration > 0) {
            try { video.currentTime = Math.max(0, video.duration - 0.04); } catch { /* ignore */ }
        }
    }
}

function fillWidget(node: Node) {
    const ut = node.getComponent(UITransform) || node.addComponent(UITransform);
    const widget = node.getComponent(Widget) || node.addComponent(Widget);
    widget.isAlignTop = widget.isAlignBottom = widget.isAlignLeft = widget.isAlignRight = true;
    widget.isAlignHorizontalCenter = false;
    widget.isAlignVerticalCenter = false;
    widget.left = widget.right = widget.top = widget.bottom = 0;
    widget.alignMode = Widget.AlignMode.ALWAYS;
    widget.enabled = true;
    widget.updateAlignment();
    return ut;
}

function paintBlack(node: Node) {
    const g = node.getComponent(Graphics) || node.addComponent(Graphics);
    g.clear();
    g.fillColor = Color.BLACK;
    g.rect(-1000, -1600, 2000, 3200);
    g.fill();
}

registerScreen("ending", EndingViewComp);
