import { oops } from "db://oops-framework/core/Oops";
import { RunScreen } from "../core/Types";

/** 填入 bundle 内 AudioClip 路径（不带扩展名）。当前无音频素材，空路径保持静音。 */
export const GAME_AUDIO = {
    music: { home: "", battle: "" },
    effects: { click: "", hit: "", critical: "", heal: "", win: "", lose: "" }
};

let musicPath = "";

export function playScreenMusic(screen: RunScreen) {
    const path = screen === "battle" ? GAME_AUDIO.music.battle : GAME_AUDIO.music.home;
    if (path === musicPath) return;
    musicPath = path;
    if (path) oops.audio.playMusic(path, { bundle: "bundle", loop: true, volume: 0.35 });
    else oops.audio.music.stop();
}

export function playGameEffect(key: keyof typeof GAME_AUDIO.effects) {
    const path = GAME_AUDIO.effects[key];
    if (path) void oops.audio.playEffect(path, { bundle: "bundle", volume: 0.65 });
}
