import { assetManager, Node, UITransform, VideoClip, VideoPlayer, Widget } from "cc";
import { GameComponent } from "db://oops-framework/module/common/GameComponent";
import { TEX, showcaseSuit } from "../core/Catalog";
import { Appearance } from "../core/Types";

const VIDEO_NODE = "SuitVideo";

/** 在现有 slot 内播视频。播放器尺寸始终跟 slot 的 UITransform 走。 */
export interface SlotVideoPlayOptions {
    /** bundle 内 VideoClip 路径，不含扩展名，例如 game/video/set_rookie。 */
    clipPath?: string;
    /** 远程地址；有本地 clip 时优先本地。 */
    remoteURL?: string;
    loop?: boolean;
    mute?: boolean;
}

/**
 * 结算套装视频入口：穿齐一套时在 ChickenSlot 里播对应视频。
 * 当前没有片源时返回 false，调用方继续展示立绘/拼装鸡。
 */
export async function playResultSuitVideo(view: GameComponent, slotName: string, appearance: Appearance): Promise<boolean> {
    const suit = showcaseSuit(appearance);
    if (!suit) return false;
    return playSlotVideo(view, slotName, {
        clipPath: TEX.suitVideo(suit.id),
        loop: true,
        mute: true
    });
}

/** 在指定 slot 内创建并播放视频，画面铺满当前 slot 大小。 */
export async function playSlotVideo(view: GameComponent, slotName: string, options: SlotVideoPlayOptions): Promise<boolean> {
    const slot = view.getNode(slotName);
    if (!slot) return false;
    const clip = options.clipPath ? await loadLocalClip(view, options.clipPath) : null;
    if (!clip && !options.remoteURL) return false;
    if (!slot.isValid) return false;
    const player = mountSlotVideo(slot);
    player.playOnAwake = false;
    player.fullScreenOnAwake = false;
    player.stayOnBottom = false;
    player.keepAspectRatio = true;
    player.loop = options.loop !== false;
    player.mute = options.mute !== false;
    if (clip) {
        player.resourceType = VideoPlayer.ResourceType.LOCAL;
        player.clip = clip;
    }
    else {
        player.resourceType = VideoPlayer.ResourceType.REMOTE;
        player.remoteURL = options.remoteURL!;
    }
    const play = () => { if (player.isValid) player.play(); };
    player.node.once(VideoPlayer.EventType.READY_TO_PLAY, play);
    play();
    return true;
}

export function stopSlotVideo(slot: Node | undefined | null) {
    if (!slot?.isValid) return;
    const video = slot.getChildByName(VIDEO_NODE);
    const player = video?.getComponent(VideoPlayer);
    if (player?.isValid) player.stop();
    video?.destroy();
}

function mountSlotVideo(slot: Node): VideoPlayer {
    stopSlotVideo(slot);
    for (const child of slot.children) child.destroy();
    slot.removeAllChildren();
    const video = new Node(VIDEO_NODE);
    video.layer = slot.layer;
    video.parent = slot;
    video.setPosition(0, 0, 0);
    const slotTransform = slot.getComponent(UITransform);
    const transform = video.addComponent(UITransform);
    if (slotTransform) {
        transform.setContentSize(slotTransform.contentSize);
        transform.setAnchorPoint(slotTransform.anchorPoint);
    }
    const widget = video.addComponent(Widget);
    widget.isAlignTop = widget.isAlignBottom = widget.isAlignLeft = widget.isAlignRight = true;
    widget.top = widget.bottom = widget.left = widget.right = 0;
    widget.alignMode = Widget.AlignMode.ALWAYS;
    widget.updateAlignment();
    const player = video.addComponent(VideoPlayer);
    player.playOnAwake = false;
    player.fullScreenOnAwake = false;
    video.once(Node.EventType.NODE_DESTROYED, () => {
        if (player.isValid) player.stop();
    });
    return player;
}

async function loadLocalClip(view: GameComponent, path: string): Promise<VideoClip | null> {
    const bundle = assetManager.getBundle("bundle");
    if (!bundle?.getInfoWithPath(path)) return null;
    try {
        const clip = await view.load("bundle", path, VideoClip);
        return clip || null;
    }
    catch {
        return null;
    }
}
