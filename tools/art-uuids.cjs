/**
 * 贴图 uuid，供 import-art 与 gen-prefabs 共用。改文件名时两边一起改。
 *
 * 分组号即 uuid 第二段，同组内按数组下标 16 进制递增，所以只能往数组尾部追加，
 * 中间插入会让后面所有资源换 uuid，编辑器里已有引用会全部丢失。
 */
function alloc(group, names) {
    const out = {};
    names.forEach((name, i) => {
        out[name] = "a1b2c3d4-" + group + "-4000-8000-" + (i + 1).toString(16).padStart(12, "0");
    });
    return out;
}

/** Original placeholder rig retired; Figma parts are recorded in figma-assets.json. */
const CHICKEN = [];

/** 九宫格拉伸的容器类素材。 */
const UI_SLICED = [
    "btn_green",
    "btn_orange",
    "btn_red",
    "btn_yellow",
    "panel_white",
    "panel_cream",
    "panel_green",
    "slot_frame",
    "bar_track",
    "bubble",
    "bubble_taunt",
    "banner_red",
    "banner_wood",
    "tag_yellow",
    "tag_gold"
];

/** 原尺寸贴图类素材。 */
const UI_PLAIN = ["badge_vs", "burst_win", "burst_lose", "confetti"];

const ICONS = [
    "icon_power",
    "icon_atk",
    "icon_def",
    "icon_spd",
    "icon_hp",
    "icon_coin",
    "icon_up",
    "icon_down",
    "icon_dice",
    "icon_star",
    "icon_feather"
];

const NODES = ["node_stage", "node_lock", "node_shop", "node_chest", "node_boss", "node_dot"];

const EQUIPS = [
    "eq_iron_comb",
    "eq_iron_head",
    "eq_iron_body",
    "eq_iron_wing",
    "eq_stone_comb",
    "eq_stone_head",
    "eq_stone_body",
    "eq_stone_leg",
    "eq_gale_wing",
    "eq_gale_tail",
    "eq_gale_leg",
    "eq_gale_body",
    "eq_kun_comb",
    "eq_kun_face",
    "eq_kun_body",
    "eq_kun_tail"
];

const BGS = ["bg_home", "bg_map", "bg_arena", "bg_prebattle",
    "bg_start_figma", "bg_village_figma", "bg_arena_figma", "bg_shop_figma", "bg_map_figma"];

const FX = [
    "comic_slash",
    "comic_star",
    "shock_ring",
    "speed_line",
    "focus_burst",
    "ground_crack",
    "ink_burst",
    "charge_ring",
    "skill_peck",
    "skill_jump",
    "skill_dive",
    "skill_leap",
    "skill_charge",
    "skill_tail",
    "skill_combo",
    "skill_feint",
    "skill_layer_rays",
    "skill_layer_flare",
    "skill_layer_banner",
    "skill_layer_sparks",
    "skill_bg_peck",
    "skill_bg_jump",
    "skill_bg_dive",
    "skill_bg_leap",
    "skill_bg_charge",
    "skill_bg_tail",
    "skill_bg_combo",
    "skill_bg_feint"
];

const uuids = Object.assign(
    {},
    alloc("1001", CHICKEN),
    alloc("2002", UI_SLICED.concat(UI_PLAIN)),
    alloc("2003", ICONS),
    alloc("2004", NODES),
    alloc("2005", EQUIPS),
    alloc("3002", BGS),
    alloc("4004", FX)
);

module.exports = uuids;

module.exports.groups = { CHICKEN, UI_SLICED, UI_PLAIN, ICONS, NODES, EQUIPS, BGS, FX };

module.exports.frame = function frame(uuid) {
    return uuid + "@f9941";
};
