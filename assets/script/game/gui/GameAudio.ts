import { oops } from "db://oops-framework/core/Oops";
import { RunScreen } from "../core/Types";

/** bundle 内 AudioClip 路径，不带扩展名。 */
export const GAME_AUDIO = {
    music: { home: "game/audio/home", battle: "game/audio/battle", village: "game/audio/village" },
    effects: {
        click: "game/audio/click", close: "game/audio/close", hit: "game/audio/hit",
        peck: "game/audio/peck", wing: "game/audio/wing", skill: "game/audio/skill",
        critical: "game/audio/critical", heal: "", start: "game/audio/start",
        win: "game/audio/win", lose: "game/audio/lose"
    }
};

let musicPath = "";
let lastCombatEffect = 0;

export function playScreenMusic(screen: RunScreen) {
    const path = screen === "battle" ? GAME_AUDIO.music.battle
        : screen === "customize" ? GAME_AUDIO.music.home : GAME_AUDIO.music.village;
    if (path === musicPath) return;
    musicPath = path;
    if (path) oops.audio.playMusic(path, { bundle: "bundle", loop: true, volume: 0.35 });
    else oops.audio.music.stop();
}

export function playGameEffect(key: keyof typeof GAME_AUDIO.effects) {
    if (["hit", "peck", "wing", "skill", "critical"].includes(key)) {
        const now = Date.now();
        if (now - lastCombatEffect < 900) return;
        lastCombatEffect = now;
    }
    const path = GAME_AUDIO.effects[key];
    if (path) void oops.audio.playEffect(path, { bundle: "bundle", volume: 0.5 })
        .catch(error => console.warn("[GameAudio]", key, error));
}
