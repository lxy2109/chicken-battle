import { gameNumber } from "../core/GameConfig";
import { oops } from "db://oops-framework/core/Oops";
import { RunScreen } from "../core/Types";

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
    }
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

export function playGameEffect(key: keyof typeof GAME_AUDIO.effects) {
    const path = GAME_AUDIO.effects[key];
    if (path) void oops.audio.playEffect(path, { bundle: "bundle", volume: gameNumber("audio_effectVolume") })
        .catch(error => console.warn("[GameAudio]", key, error));
}
