import { AudioClip, AudioSource, Node } from "cc";
import { gameNumber } from "../../domain/GameConfig";
import { oops } from "db://oops-framework/core/Oops";
import { RunScreen, StrikeStyle } from "../../domain/Types";

/** bundle 内 AudioClip 路径，不带扩展名。 */
export const GAME_AUDIO = {
    music: { home: "game/audio/home", battle: "game/audio/battle", village: "game/audio/village" },
    /** 有专属曲的 boss，没有就走默认 battle。 */
    boss: {
        s3_official: "game/audio/boss_battle/hajimi",
        s4_official: "game/audio/boss_battle/xinyi",
        kun_boss: "game/audio/boss_battle/kun"
    } as Record<string, string>,
    effects: {
        click: "game/audio/click", close: "game/audio/close", hit: "game/audio/hit",
        peck: "game/audio/peck", wing: "game/audio/wing", skill: "game/audio/skill",
        critical: "game/audio/critical", heal: "", start: "game/audio/start",
        win: "game/audio/win", lose: "game/audio/lose"
    },
    /** 绝招起手喊招式名，按动作映射，不跟界面文案走。 */
    skillAnnounce: {
        peck: "game/audio/skill_effect/鸡啄米",
        jump: "game/audio/skill_effect/金鸡独立",
        dive: "game/audio/skill_effect/乌鸦坐飞机",
        leap: "game/audio/skill_effect/天外飞鸡",
        charge: "game/audio/skill_effect/铁头功",
        tail: "game/audio/skill_effect/神龙摆尾",
        combo: "game/audio/skill_effect/连珠神啄",
        feint: "game/audio/skill_effect/金蝉脱壳"
    } as Record<StrikeStyle, string>
};

let musicPath = "";
/** 短音效专用源：playOneShot，避免每条音效新建 AudioSource 在安卓上挤掉 BGM。 */
let sfxNode: Node | null = null;
let sfxSource: AudioSource | null = null;

export function musicFor(screen: RunScreen, enemyId?: string) {
    if (screen === "battle") return (enemyId && GAME_AUDIO.boss[enemyId]) || GAME_AUDIO.music.battle;
    if (screen === "customize") return GAME_AUDIO.music.home;
    if (screen === "ending") return "";
    return GAME_AUDIO.music.village;
}

export function playScreenMusic(screen: RunScreen, enemyId?: string) {
    const path = musicFor(screen, enemyId);
    if (path === musicPath) return;
    musicPath = path;
    if (path) oops.audio.playMusic(path, { bundle: "bundle", loop: true, volume: gameNumber("audio_musicVolume") });
    else oops.audio.music.stop();
}

/**
 * 局内 BGM 守护：安卓上连放技能/音效时，引擎可能把循环 BGM 静默停掉。
 * 仍处在该界面且路径未变时，发现没在播就续上。
 */
export function ensureScreenMusic(screen: RunScreen, enemyId?: string) {
    const path = musicFor(screen, enemyId);
    if (!path) return;
    if (!oops.audio?.music?.getSwitch?.()) return;

    const src = musicAudioSource();
    if (path === musicPath && src?.clip?.isValid) {
        if (!src.playing) {
            src.loop = true;
            src.volume = gameNumber("audio_musicVolume");
            src.play();
        }
        return;
    }
    // 路径应对上但缓存丢了 / 从未播成功：强制重进 playScreenMusic。
    musicPath = "";
    playScreenMusic(screen, enemyId);
}

function musicAudioSource(): AudioSource | null {
    const node = oops.audio?.music;
    if (!node?.isValid) return null;
    return node.getComponent(AudioSource);
}

function effectEnabled(): boolean {
    try {
        return !!oops.audio.effect.getSwitch();
    }
    catch {
        return true;
    }
}

function ensureSfxSource(): AudioSource | null {
    const parent = oops.audio?.node;
    if (!parent?.isValid) return null;
    if (sfxSource?.isValid && sfxNode?.isValid) return sfxSource;
    sfxNode = new Node("GameSfxOneShot");
    sfxNode.layer = parent.layer;
    parent.addChild(sfxNode);
    sfxSource = sfxNode.addComponent(AudioSource);
    sfxSource.playOnAwake = false;
    sfxSource.loop = false;
    sfxSource.volume = 1;
    return sfxSource;
}

function playClip(path: string, key: string) {
    if (!path || !effectEnabled()) return;
    const volume = gameNumber("audio_effectVolume");
    const src = ensureSfxSource();
    if (!src) {
        // 音频管理器尚未就绪时退回框架接口。
        void oops.audio.playEffect(path, { bundle: "bundle", volume })
            .catch(error => console.warn("[GameAudio]", key, error));
        return;
    }
    void (async () => {
        try {
            let clip = oops.res.get(path, AudioClip, "bundle");
            if (!clip) clip = await oops.res.load("bundle", path, AudioClip);
            if (!clip?.isValid || !src.isValid) return;
            // playOneShot 不占独立 AudioSource 槽，安卓并发音效时不易顶掉 BGM。
            src.playOneShot(clip, volume);
        }
        catch (error) {
            console.warn("[GameAudio]", key, error);
        }
    })();
}

export function playGameEffect(key: keyof typeof GAME_AUDIO.effects) {
    playClip(GAME_AUDIO.effects[key], key);
}

/** 绝招起手喊招式名（场上一体演出时与蓄力同步）。 */
export function playSkillAnnounce(style: StrikeStyle) {
    playClip(GAME_AUDIO.skillAnnounce[style], style);
}
