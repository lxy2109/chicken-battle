/**
 * 出招序列帧生图提示词。
 *
 * 序列帧必须走参考图生图（refs + 本提示词），不要用 gen-strike-sheets 程序化扭立绘。
 * 本脚本解决两件事：
 *  1) 帧间连贯：按 16 格写清动作相位，强调「相邻格只差一小步」
 *  2) 好抠图：纯黑底、禁脚下绿影/棋盘/白底、主体别贴格边
 *
 * 用法:
 *   node tools/gen/gen-strike-prompts.cjs              # 写满 temp/strike-gen/prompts + jobs.json
 *   node tools/gen/gen-strike-prompts.cjs set_rookie   # 只刷一个角色
 *   node tools/gen/gen-strike-prompts.cjs set_rookie peck
 *
 * 生图流程见 docs/strike-anim-pipeline.md
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const REF_DIR = path.join(ROOT, "temp/strike-gen/refs");
const OUT_DIR = path.join(ROOT, "temp/strike-gen/prompts");
const RAW_DIR = path.join(ROOT, "temp/strike-gen/raw");
const JOBS = path.join(ROOT, "temp/strike-gen/jobs.json");

const FULL_STYLES = ["idle", "peck", "jump", "dive", "leap", "charge", "tail", "combo", "feint"];
const MINION_STYLES = ["idle", "peck"];

function isMinionKey(key) {
    return key.startsWith("warmup_") || /^s\d+_warmup$/.test(key);
}

function stylesFor(key) {
    return isMinionKey(key) ? MINION_STYLES : FULL_STYLES;
}

/** 外貌锁死文案：跟 refs 立绘对齐，生图时务必带参考图。 */
const LOOK = {
    set_rookie:
        "red-skinned cartoon chicken sage, tall spiral teal-and-gold scholar hat (zhuge-liang style), white robe with teal/gold trim, teal sash, round jade coin pendant on chest, brown wing folded at side, white feather fan with gold ring and red tassel held in front wing, bare chicken feet, large round eyes, short orange beak",
    set_brawler:
        "red-skinned cartoon chicken general, tall green guan-yu helmet with gold trim, long dark brown beard and mustache, green robe with gold dragon shoulder armor and gold belt, holds long green-and-gold guandao polearm with crescent blade, fierce wide eyes, bare chicken feet",
    set_medic:
        "red-skinned cartoon chicken nurse, white headscarf with red polka dots, floral red-green-pink padded jacket with cream fur trim and frog buttons, brown sling bag labeled Chinese text 鸡汤药包, holds white thermos bottle with green sleeve labeled 保温杯, bare chicken feet, gentle big eyes",
    set_helicopter:
        "red-skinned cartoon chicken pilot, brown leather aviator cap with goggles on forehead, small spinning propeller beanie on top, teal-blue flight jacket with brown straps and fur collar, holds round wooden steering wheel, bare chicken feet",
    set_digger:
        "red-skinned cartoon chicken construction worker, yellow excavator-bucket hat, blue work robe with yellow trim and arm patches, holds black handheld sign and small yellow excavator toy, bare chicken feet",
    set_miser:
        "red-skinned cartoon chicken miser accountant, silver metal bowl hat, red knit sweater with large gold Chinese 坎 character, holds wooden abacus, brown crossbody coupon bag with red tags, bare chicken feet",
    set_champion:
        "red-skinned cartoon chicken king of sausages, tall red crown with gold 王中王 text and sausage tips, red robe with gold trim and lightning motifs, sausage cluster backpack labeled 肉很多, holds red sausage scepter, gold medallion, bare chicken feet",
    set_coming:
        "tan/yellow cartoon chicken-bull hybrid, small bull horns, red comb, yellow hoodie with white fur trim, holds white signboard with Chinese text and blue-white milk carton, yellow sneakers, playful big eyes",
    kun_boss:
        "yellow cartoon chicken idol (Ikun style), silver-white swept hair, black turtleneck, white overalls with black straps, silver dog-tag necklace, black shoes, holds orange basketball under one wing, half-lidded cool expression, pink cheek circles",
    s1_official:
        "bright green cartoon cabbage-chicken hybrid, long green neck, whole body is layered cabbage leaves, pale beak, huge googly eyes, bare tan feet, no clothes other than cabbage body",
    s1_warmup:
        "simple mottled barnyard cartoon chicken, warm orange-brown feathers, small red comb, plain look, big eyes, bare feet - keep rustic and simple",
    s2_official:
        "yellow crispy fried-chicken mascot, textured breaded feather body, red-and-white striped bucket torso labeled FRIED CHICKEN, red-and-white sneakers, huge round eyes, beige beak",
    s2_warmup:
        "simple mottled barnyard cartoon chicken variant 2, darker brown/greenish feathers, small comb, bare feet, big eyes",
    s3_official:
        "pale yellow anthropomorphic chicken-cat hybrid, blonde fluffy hair, cat ears, cream-and-yellow varsity cardigan, cream sweatpants, fish pendant necklace, cream paw slippers, long cream tail with yellow spots, big round eyes, orange beak",
    s3_warmup:
        "simple mottled barnyard cartoon chicken variant 3, soft warm feathers, cute face, bare feet",
    s4_official:
        "yellow cartoon detective chicken, brown messy hair tuft, blue school blazer, white shirt, green necktie, grey pants, red-white sneakers, holds orange basketball, pink cheek circles, large determined eyes",
    s4_warmup:
        "simple mottled barnyard cartoon chicken variant 4, cooler grey-white tones, fierce face, bare feet",
    s5_official:
        "yellow cartoon pop-star chicken, silver-white hair, white suit jacket and white pants, black shirt, silver chain, holds handheld microphone, white sneakers, confident pose language",
    s5_warmup:
        "simple mottled barnyard cartoon chicken variant 5, purple-tinged accents, bare feet, big eyes",
    warmup_1: "rustic gold-neck barnyard cartoon chicken, warm golden neck feathers, simple comb, bare feet, big eyes",
    warmup_2: "slim-neck mottled barnyard cartoon chicken, thin long neck, brown mottled body, bare feet",
    warmup_4: "red-comb teal barnyard cartoon chicken, green-blue body feathers, red comb, bare feet",
    warmup_5: "dark black-feather barnyard cartoon chicken, dark plumage, pale accents, bare feet",
    warmup_6: "deep green barnyard cartoon chicken, dark green feathers, bare feet",
    warmup_7: "black-and-gold barnyard cartoon chicken, dark body with gold sheen, bare feet",
    warmup_8: "spotted barnyard cartoon chicken, speckled feathers, bare feet",
    warmup_9: "long-neck fighting barnyard cartoon chicken, extended neck, compact body, bare feet",
    warmup_10: "red-neck barnyard cartoon chicken, reddish neck feathers, bare feet",
    warmup_11: "pale mottled barnyard cartoon chicken, light cream-brown feathers, bare feet",
    warmup_12: "fluffy-tail yellow barnyard cartoon chicken, bushy tail, warm yellow body, bare feet"
};

/**
 * 按 16 帧写「大关键帧 + 中间帧」。
 * 禁止微动数值（+2px / +3%）：模型会生成几乎静止的 16 张立绘。
 * 要的是：一眼能分出预备 / 最高点 / 回收；邻帧轮廓差要大。
 */
const ACTION = {
    idle: {
        title: "IDLE — BIG cartoon bounce loop (NOT a frozen statue)",
        beats: [
            "Treat idle like Cuphead / classic rubber-hose cycle: LOUD breathing + body bounce + prop swing. If the sheet looks like 16 copies of one standing pose, it FAILS.",
            "ROW1 F1–F4 INHALE UP: F1 neutral standing LEFT. F2 body lifts, chest balloons, knees straighten. F3 higher — head up, whole body taller (~15% taller than F1). F4 PEAK STRETCH — tallest frame, chest max puffed, prop/wing swung UP-BACK ~25°, far heel off ground. F1 vs F4 must look obviously different at thumbnail size.",
            "ROW2 F5–F8 EXHALE DOWN: F5 starts drop. F6 chest empties, body sinks. F7 LOWEST SQUASH — body ~15% shorter than F1, knees bent deep, prop swung DOWN-FORWARD opposite of F4. F8 starts rising from squash. F4 vs F7 = opposite extremes (tall stretch vs short squash).",
            "ROW3 F9–F12 WEIGHT ROCK: F9 lean LEFT ~20° whole body. F10 max LEFT lean + hip out + prop counters RIGHT. F11 pass through center. F12 max RIGHT lean ~20° mirror. Silhouette tilt must be obvious — not a 2° micro-sway.",
            "ROW4 F13–F16 LOOP HOME: F13 half-right lean + small inhale. F14 near neutral. F15 small bounce up (like F2). F16 = F1 for seamless loop."
        ],
        intensity:
            "MINIMUM readable motion: tallest vs shortest body differs by ~15% height; left vs right lean ~20°. Prop/wing sweeps a wide arc. NO attack, NO weapon swing at enemy, NO costume change. Still MUCH bigger than a shiver."
    },
    peck: {
        title: "PECK — EXPLOSIVE rubber-hose headbutt (contact F8)",
        beats: [
            "ROW1 F1–F4 WIND-UP (go BIG backward): F1 neutral. F2 lean back. F3 lean back hard, neck coils S-shape, free wing/prop hauled way behind. F4 MAX COIL — torso almost 50° BACK, body squashed short, spring-loaded. Silhouette = coiled spring.",
            "ROW2 F5–F8 STRIKE: F5 release — neck whips forward. F6 body stretches long toward LEFT. F7 almost full stretch. F8 CONTACT — body nearly HORIZONTAL rubber-hose line, beak furthest LEFT, max stretch (opposite of F4). Optional tiny impact star at beak only.",
            "ROW3 F9–F12 RECOIL: F9 overshoot past target. F10 neck/body whip back upright. F11 wobble. F12 land squash.",
            "ROW4 F13–F16 RECOVER to neutral in big steps (not 4 identical stands)."
        ],
        intensity:
            "F4 and F8 must be OPPOSITE cartoon extremes (coiled back vs fully stretched forward). Thumbnail test: anyone can point to wind-up vs hit. Tex Avery squash-and-stretch. Inbetweens connect the extremes — do NOT keep all frames near neutral."
    },
    jump: {
        title: "JUMP — high cartoon arc (apex F6–F7)",
        beats: [
            "F1 neutral. F2–F3 DEEP crouch squash to ~65% height. F4 launch stretch. F5 rising high, feet OFF ground.",
            "F6–F7 APEX — character near TOP of cell, legs tucked, max air. F8–F10 dive-strike tilt falling. F11–F12 heavy land squash. F13–F16 recover stand."
        ],
        intensity:
            "F3 crouch vs F6 apex must fill different vertical thirds of the cell. Huge vertical travel. Same X center."
    },
    dive: {
        title: "DIVE — meteor spear (contact F8–F9)",
        beats: [
            "F1–F4 hop UP then arch way back aiming down-LEFT. F5–F7 body becomes a STEEP diagonal spear (50–70°), wings pinned. F8–F9 SMASH into ground + compress. F10–F16 skid and stand up in large steps."
        ],
        intensity:
            "Upright vs diagonal-spear silhouettes must be totally different shapes."
    },
    leap: {
        title: "LEAP — long pounce through air",
        beats: [
            "F1–F3 deep rear coil. F4–F5 takeoff stretch LEFT. F6–F8 FULL AIR — clear empty gap under both feet, legs cycle tuck→extend, wings spread wide, body long. F9–F12 landing lunge + brake. F13–F16 idle recover."
        ],
        intensity:
            "Air frames must show real flight (feet off ground). Big horizontal stretch."
    },
    charge: {
        title: "CHARGE — full shoulder rush",
        beats: [
            "F1–F3 load lean BACK 20–30°, dig in. F4–F7 SPRINT lean FORWARD 40–55°, body stretched long, feet cycle, optional trailing smear on ONE edge. F8 impact compress. F9–F12 skid brake lean back. F13–F16 recover."
        ],
        intensity:
            "Load vs sprint = opposite lean directions. Huge forward lean on run frames."
    },
    tail: {
        title: "TAIL / spin — full turn readable",
        beats: [
            "F1–F3 wind-up opposite spin, prop/tail far back. F4–F11 spin: one major angle per frame in order 0°→45°→90°→135°→180°→225°→270°→315° (or wide whip arcs that still CHANGE every cell). F12–F13 stop wobble. F14–F16 settle."
        ],
        intensity:
            "Every spin cell is a NEW angle. Thumbnail must show rotation, not 8 copies of one pose."
    },
    combo: {
        title: "COMBO — 3 BIG hits",
        beats: [
            "F1–F2 wind. F3 HIT A (clear contact silhouette). F4 reset. F5–F6 different-angle wind. F7 HIT B. F8–F9 gather. F10 finisher wind. F11 HIT C largest stretch of sheet. F12–F16 victory recover — stepped, not frozen."
        ],
        intensity:
            "Three hits = three different silhouettes. No filler stills."
    },
    feint: {
        title: "FEINT — huge fake then real hit",
        beats: [
            "F1–F3 giant peck-style wind-up back. F4–F6 FAKE — body snaps OTHER way / slip (big direction change). F7–F9 re-coil. F10–F12 REAL strike as big as peck contact. F13–F16 recover."
        ],
        intensity:
            "Fake and real both large. Direction change must be obvious."
    }
};

const LAYOUT = `SPRITE SHEET LAYOUT (mandatory):
- Exactly ONE 4x4 grid = 16 equal square cells.
- Reading order = animation order: left→right, top→bottom (F1 = top-left, F16 = bottom-right).
- Prefer NO divider lines. If dividers exist: hairline only. NO thick white frames, NO cell numbers, NO labels.
- Same camera, same character design scale band, same ground line.
- Full body in every cell; 8–12% padding from edges; never clip hat/limbs/weapon.
- Faces LEFT (battle facing) except during intentional spin frames.`;

const CONTINUITY = `EXAGGERATED ANIMATION (most important block — read twice):
- Goal: a FIGHTING-GAME / classic cartoon anim strip. NOT a photo contact sheet. NOT 16 slight variants of one T-pose stand.
- HARD FAIL examples: all 16 cells nearly identical; one row of 4 looks the same; motion only in the eyes; "breathing" so small you need to blink-compare.
- GO BIG: extreme KEY poses first (wind-up / apex / contact / land), then draw honest INBETWEENS between those extremes. Prefer fewer tiny steps and clearer extremes over 16 micro-tweaks.
- Neighbor frames must still connect (ordered motion, no random shuffle, no teleport to unrelated dance), but the PATH of motion is LARGE — rubber-hose squash & stretch, big leans, clear air time, wide prop arcs.
- Thumbnail test: shrink the whole sheet to 256px wide — you should STILL see different poses across the grid.
- Identity lock: same face, outfit, colors, props, proportions all 16 cells. No redesign mid-sheet.
- Feet X mostly stable (±8%) except hop/leap/charge steps. Idle loops (F16≈F1). Attacks start & end near neutral.`;

const MATTING = `BACKGROUND & MATTING (critical — automated chroma-key will process this):
- Flat PURE MAGENTA / hot-pink chroma background ONLY in every cell: #FF00FF (rgb 255,0,255). Solid fill, no gradients, no vignette.
- Why magenta: characters often wear black (turtleneck, shoes, dark feathers). Black plate would punch holes in black clothes; magenta does not.
- NO black / white / gray studio backdrop. NO green / mint / grey / brown oval ground shadow under feet. NO floor disc. NO drop-shadow plate. Feet stand on pure magenta void.
- NO checkerboard fake-transparency, NO paper texture.
- NO watermark, NO captions, NO logos outside the character design itself.
- Clean hard cartoon outline. Character blacks / whites / pink cheek circles stay as character paint — never paint the BACKGROUND as black or white.
- Silhouette continuous — no random holes in shirts, pants, overalls, fur trim, turtlenecks, or eyes.
- Anti-aliased edge against magenta is OK; do not paint gray/magenta fringe glow onto the character.`;

const STYLE = `ART STYLE:
- 2D hand-drawn mobile fighting-game cartoon, thick clean ink outlines, simple cel shading, comedic EXAGGERATED motion.
- Match the attached reference image design 1:1 (colors, props, silhouette) — change POSE a lot, change DESIGN zero.
- Sharp, not blurry, not pixel art, not 3D, not realistic photo.
- Reference motion language: Tex Avery / rubber-hose / Cuphead idle bounce / Street-Fighter readable attack silhouettes.
- Output square 1024x1024 or 2048x2048.`;

function lookOf(key) {
    if (LOOK[key]) return LOOK[key];
    // 未知 key：仍给可生图的弱描述，并点名必须贴 refs。
    return `cartoon chicken character id "${key}" - copy the attached reference image EXACTLY (colors, outfit, props, face).`;
}

function buildPrompt(key, style) {
    const action = ACTION[style];
    if (!action) throw new Error("未知动作 " + style);
    const look = lookOf(key);
    const lines = [
        `Production 2D game ANIMATION sprite sheet (16-frame motion strip) for Cocos chicken-battle.`,
        `CRITICAL: maximize pose variety and motion amplitude while keeping character design locked. If unsure, EXAGGERATE the action more — never shrink it toward a still portrait.`,
        ``,
        CONTINUITY,
        ``,
        LAYOUT,
        ``,
        `CHARACTER IDENTITY LOCK (copy reference; name="${key}"):`,
        look + ".",
        `Use the attached reference image as the ONLY design source. If reference and text disagree, FOLLOW THE IMAGE. Pose may change drastically; outfit/colors may not.`,
        ``,
        `ACTION: ${action.title}`,
        ...action.beats.map((b) => `- ${b}`),
        action.intensity,
        ``,
        MATTING,
        ``,
        STYLE,
        ``,
        `Negative constraints: black background, white/gray studio background, green/mint floor shadow oval, 16 nearly-identical stills, micro-motion only, frozen statue idle, subtle 1% breathing, contact sheet of same standing pose, timid small leans, multiple characters, outfit changes across cells, random unordered poses, motion teleport, checkerboard, photo background, watermark, blur, pixel art, 3D, realistic feathers, cropped head, empty cells, text labels, frame numbers.`
    ];
    return lines.join("\n");
}

function listKeys() {
    if (!fs.existsSync(REF_DIR)) return [];
    return fs.readdirSync(REF_DIR)
        .filter((f) => f.endsWith(".png"))
        .map((f) => f.slice(0, -4))
        .sort();
}

function writeJobs(keys) {
    const jobs = [];
    let have = 0;
    let missing = 0;
    for (const key of keys) {
        for (const style of stylesFor(key)) {
            const file = `${key}.${style}.png`;
            const ready = fs.existsSync(path.join(RAW_DIR, file));
            if (ready) have += 1;
            else missing += 1;
            jobs.push({
                key,
                style,
                ready,
                file,
                ref: `refs/${key}.png`,
                prompt: `prompts/${key}.${style}.txt`
            });
        }
    }
    const doc = {
        have,
        missing,
        total: have + missing,
        note: "带 refs/<key>.png 参考图 + prompts/<key>.<style>.txt 生图，结果放到 raw/<key>.<style>.png，再 node tools/import-strike-gen.cjs --dir temp/strike-gen/raw",
        jobs
    };
    fs.writeFileSync(JOBS, JSON.stringify(doc, null, 2) + "\n");
    return doc;
}

function main(argv = process.argv.slice(2)) {
    let keys = listKeys();
    if (!keys.length) {
        console.error("没有 refs：请先把立绘放到 temp/strike-gen/refs/<key>.png");
        process.exit(1);
    }
    let onlyStyle = null;
    if (argv[0]) {
        keys = keys.filter((k) => k === argv[0]);
        if (!keys.length) {
            console.error("找不到 ref key:", argv[0]);
            process.exit(1);
        }
        if (argv[1]) onlyStyle = argv[1];
    }

    fs.mkdirSync(OUT_DIR, { recursive: true });
    let n = 0;
    for (const key of keys) {
        const styles = onlyStyle ? [onlyStyle] : stylesFor(key);
        for (const style of styles) {
            if (!ACTION[style]) {
                console.warn("skip unknown style", style);
                continue;
            }
            const text = buildPrompt(key, style);
            const dest = path.join(OUT_DIR, `${key}.${style}.txt`);
            fs.writeFileSync(dest, text + "\n", "utf8");
            n += 1;
        }
    }

    // jobs 始终扫全部 refs，方便看缺哪些 raw
    const doc = writeJobs(listKeys());
    console.log(`prompts ${n} 条 -> ${path.relative(ROOT, OUT_DIR)}`);
    console.log(`jobs ${doc.total}（raw 已有 ${doc.have}，缺 ${doc.missing}）-> ${path.relative(ROOT, JOBS)}`);
    console.log("生图：参考 refs + 对应 prompt -> 输出 raw/<key>.<style>.png");
    console.log("导入：node tools/import-strike-gen.cjs --dir temp/strike-gen/raw");
}

module.exports = { buildPrompt, lookOf, stylesFor, ACTION, LOOK, main };

if (require.main === module) main();
