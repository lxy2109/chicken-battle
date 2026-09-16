import { gameNumber } from "../core/GameConfig";
import { oops } from "db://oops-framework/core/Oops";
import { RunScreen, StrikeStyle } from "../core/Types";

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
    /** 绝招立绘同步播的招式名，按动作映射，不跟界面文案走。 */
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

export function musicFor(screen: RunScreen, enemyId?: string) {
    if (screen === "battle") return (enemyId && GAME_AUDIO.boss[enemyId]) || GAME_AUDIO.music.battle;
    if (screen === "customize") return GAME_AUDIO.music.home;
    return GAME_AUDIO.music.village;
}

export function playScreenMusic(screen: RunScreen, enemyId?: string) {
    const path = musicFor(screen, enemyId);
    if (path === musicPath) return;
    musicPath = path;
    if (path) oops.audio.playMusic(path, { bundle: "bundle", loop: true, volume: gameNumber("audio_musicVolume") });
    else oops.audio.music.stop();
}

function playClip(path: string, key: string) {
    if (!path) return;
    void oops.audio.playEffect(path, { bundle: "bundle", volume: gameNumber("audio_effectVolume") })
        .catch(error => console.warn("[GameAudio]", key, error));
}

export function playGameEffect(key: keyof typeof GAME_AUDIO.effects) {
    playClip(GAME_AUDIO.effects[key], key);
}

/** 绝招立绘开播时喊招式名。叠在一起时只留自己这一句。 */
export function playSkillAnnounce(style: StrikeStyle) {
    playClip(GAME_AUDIO.skillAnnounce[style], style);
}
