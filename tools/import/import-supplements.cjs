// Import the supplied copy/audio; preserve existing IDs and UUIDs for saved games.
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const root = path.resolve(__dirname, '../..');
const source = path.resolve(process.argv[2] || path.join(root, '../鸡王争霸赛'));
const guandan = path.resolve(process.argv[3] || path.join(root, '../cocos_guandan'));
function json(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 4) + '\n');
}
function meta(file, importer, ver, files = []) {
    if (!fs.existsSync(file + '.meta')) json(file + '.meta', { ver, importer, imported: true, uuid: randomUUID(), files, subMetas: {}, userData: {} });
}
const audioDir = path.join(root, 'assets/bundle/game/audio');
fs.mkdirSync(audioDir, { recursive: true });
meta(audioDir, 'directory', '1.2.0');
const audio = {
    home: '背景音乐（封面、角色创建）', battle: '背景音乐（备选）', village: '背景音乐（备选2）',
    peck: '打斗互啄', hit: '打斗碰撞', wing: '打斗扇动翅膀', skill: '打斗中激烈的鸡叫伴随扇翅膀',
    critical: '打斗中激烈时鸡叫声', win: '战斗结束（成功）', lose: '战斗结束（失败）', start: '战斗开始'
};
for (const [id, name] of Object.entries(audio)) {
    const dest = path.join(audioDir, id + '.mp3');
    fs.copyFileSync(path.join(source, '鸡王争霸赛（音乐&音效）', name + '.mp3'), dest);
    meta(dest, 'audio-clip', '1.0.0', ['.json', '.mp3']);
}
for (const [id, name] of Object.entries({ click: 'btn_click_positive', close: 'btn_click_negative' })) {
    const dest = path.join(audioDir, id + '.mp3');
    fs.copyFileSync(path.join(guandan, 'assets/App/Art/Guandan/Audio', name + '.mp3'), dest);
    meta(dest, 'audio-clip', '1.0.0', ['.json', '.mp3']);
}
const fx = path.join(root, 'assets/bundle/game/image/ui/click_star.png');
const original = path.join(guandan, 'assets/App/Art/Guandan/Common/Textures/star/09_128_ComEff_Star.png');
fs.copyFileSync(original, fx);
if (!fs.existsSync(fx + '.meta')) {
    const data = JSON.parse(fs.readFileSync(original + '.meta', 'utf8'));
    const replacement = JSON.stringify(data).split(data.uuid).join(randomUUID());
    json(fx + '.meta', JSON.parse(replacement));
}
const copy = fs.readFileSync(path.join(source, '斗鸡弹幕文案.md'), 'utf8');
const pools = { common: [] };
let group = '';
for (const line of copy.split(/\r?\n/)) {
    const heading = line.trim().match(/^(#{2,3})\s+(.+)/);
    if (heading) {
        group = heading[2] === '万能抽象弹幕' ? 'common' : heading[1] === '###' ? heading[2] : '';
        if (group) pools[group] ||= [];
    }
    const bullet = line.trim().match(/^\*\s+(.+)/);
    if (group && bullet) pools[group].push(bullet[1].trim());
}
const dest = path.join(root, 'assets/bundle/config/game/Danmaku.json');
json(dest, pools);
meta(dest, 'json', '2.0.1', ['.json']);
console.log(`Imported ${Object.keys(audio).length + 2} audio clips, click texture and ${Object.values(pools).flat().length} comments.`);

const config = path.join(root, 'assets/bundle/config/game');
const read = name => JSON.parse(fs.readFileSync(path.join(config, name + '.json'), 'utf8'));
const save = (name, value) => json(path.join(config, name + '.json'), value);
const items = read('Item'), sets = read('Set'), enemies = read('Enemy'), player = read('Player');
for (const id of ['iron_beak', 'stone_crown', 'gale', 'kunkun']) sets[id].legacy = true;
// The supplement specifies effects, not numeric balance. These values are tunable in Set.json.
const definitions = [
    ['rookie', '小学鸡套', ['不合头草帽', '祖传红领巾', '纸板护翼', '草编防滑鞋'], { maxHp: 20 }, { retainGrowth: 1 }, '菜得耐打：生命+20', '这把不算：正式赛失败保留一项随机部位成长', 1],
    ['helicopter', '直升鸡套', ['起飞护目镜', '赶早披肩', '手摇旋翼', '弹簧起落架'], { spd: 4 }, { firstStrike: 1 }, '闻鸡起舞：敏捷+4', '鸡不可失：开战时优先行动一次', 1],
    ['brawler', '鸡哔你套', ['铁嘴头盔', '打鸡血围脖', '扇脸护翼', '挠人钢爪'], { atk: 4 }, { streakBonus: 0.08 }, '嘴硬：攻击+4', '鸡飞蛋打：连续命中每次增伤8%，最多5层，落空重置', 2],
    ['medic', '医学奇鸡套', ['枸杞头巾', '保温杯挂带', '鸡汤药包', '养生棉拖'], { healBonus: 0.3 }, { revive: 1 }, '多喝热水：治疗效果+30%', '汤还热着：每场战斗增加一次复活机会', 2],
    ['concrete', '钢鸡混凝土套', ['锅盖头盔', '钢圈护颈', '平底锅护翼', '铁盆脚套'], { maxHp: 20, def: 3 }, { lockHp: 1 }, '皮实：生命+20，防御+3', '还能抢救：每场一次，致命伤害时保留1点生命', 3],
    ['miser', '铁公鸡套', ['铁算盘冠', '砍价围巾', '优惠券翼袋', '会响金铃'], { goldBonus: 0.2 }, { shopDiscount: 0.15 }, '一毛不少：首通战斗金币+20%', '老板再便宜点：装备购买额外85折', 3],
    ['champion', '鸡王中王套', ['真空包装王冠', '淀粉含量不详围脖', '双肠护翼', '竹签破阵靴'], {}, {}, '不是每根肠都能称王，但这只鸡可以。', '通关奖励：专属加冕结算效果', 0]
];
const slots = ['head', 'neck', 'wing', 'leg'];
for (const [id, name, names, b2, b4, desc2, desc4, unlockMap] of definitions) {
    const pieceIds = slots.map(slot => `${id}_${slot}`);
    const def = { id, name, pieceIds, discount: 0.8, desc2, desc4, unlockMap, rewardOnly: id === 'champion' };
    for (const [key, value] of Object.entries(b2)) def['b2' + key] = value;
    for (const [key, value] of Object.entries(b4)) def['b4' + key] = value;
    sets[id] = def;
    slots.forEach((slot, i) => {
        const stats = id === 'medic' ? { maxHp: 5, healPerTurn: 2 } : id === 'champion' ? {} : { maxHp: 5, atk: i === 0 ? 2 : 1 };
        items[pieceIds[i]] = { id: pieceIds[i], name: names[i], desc: id === 'champion' ? desc2 : id === 'medic' ? '生命+5，基础治疗+2' : `生命+5，攻击+${stats.atk}`,
            slot, setId: id, price: id === 'champion' ? 0 : 35 + unlockMap * 10 + i * 5,
            // Temporary existing art; replace icon independently without changing saved equipment IDs.
            icon: ['iron_head', 'stone_comb', 'gale_wing', 'stone_leg'][i], ...stats };
    });
}
save('Item', items); save('Set', sets);
const names = ['菜鸡', '肯德鸡', '哈鸡米', '新一鸡', '缝纫鸡'];
const taunts = ['我的战术目前只有勇气！', '胜负不重要，火候很重要！', '先喵再说！', '真相只有一个！', '大针宽线，安排上了！'];
const colors = ['#F4D35E', '#C87438', '#F5E7D0', '#3498DB', '#AA77BB'];
for (let i = 1; i <= 5; i++) {
    const foe = enemies[`s${i}_official`];
    foe.name = names[i - 1]; foe.taunt1 = taunts[i - 1];
    foe.taunt2 = pools[names[i - 1]][0]; foe.taunt3 = pools[names[i - 1]][1];
    foe.body = foe.head = colors[i - 1];
    enemies[`s${i}_warmup`].name = `杂色鸡·${i}号`;
}
enemies.kun_boss.name = '鸡王坤坤';
enemies.kun_boss.taunt1 = '鸡你太美';
save('Enemy', enemies);
const maps = ['鸡鸣村', '青竹溪', '金穗田', '古祠镇', '鸡王山'];
const warmups = [1, 2, 3, 3, 5];
const route = {};
let id = 1;
for (let map = 1; map <= 5; map++) {
    const n = warmups[map - 1];
    for (let round = 1; round <= n + 1; round++) {
        const formal = round === n + 1;
        // 首图唯一小怪首通金币 = 诸葛亮/直升鸡套装折后价，保证战后商店刚好能买一套。
        const goldWin = formal
            ? 120 + map * 20
            : (map === 1 && round === 1 ? 168 : 30 + round * 10);
        route[id] = { id, mapId: map, kind: formal ? 'boss' : 'battle', encounter: formal ? 'official' : 'warmup',
            name: `${maps[map - 1]} · ${formal ? names[map - 1] + '正式赛' : (n === 1 ? '热身赛' : '热身赛' + round)}`,
            enemyId: `s${map}_${formal ? 'official' : 'warmup'}`, goldWin,
            goldLose: 0, shopAfter: !formal && (round === 2 || round === n) };
        id += 1;
    }
}
route[id] = { id, mapId: 5, kind: 'boss', encounter: 'final', name: '鸡鸣村 · 鸡王坤坤最终挑战', enemyId: 'kun_boss', goldWin: 300, goldLose: 0 };
require('../check/warmup-roster.cjs')(enemies, route);
save('Enemy', enemies);
save('Route', route);
Object.assign(player[1], { name: '无名鸡', storyIntro: '鸡鸣村的争霸赛开始了。无名的你，将用比赛、装备与成长，赢得全村的认可。',
    hintBoss: '五图赛程已毕，鸡王坤坤在全村注视下等你。',
    storyEnding: '全村见证新鸡王诞生。争霸赛年年有，挑战永不休。',
    story1: '村民还在笑：这只无名鸡，也想争王？', story2: '围观的鸡群渐渐安静，开始认真看你的比赛。',
    story3: '有人开始为你喝彩：无名鸡，继续冲！', story4: '全村都在期待，你能走到多远。', story5: '走完最后的赛程，在全村注视下挑战坤坤。' });
save('Player', player);
console.log(`Imported 7 sets / 28 pieces and ${Object.keys(route).length} encounters. Existing equipment IDs retained.`);
