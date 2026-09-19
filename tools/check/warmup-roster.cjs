/** Figma image 61–72；外观按轮次轮换，数值沿用所在地图的热身敌人。 */
module.exports = function applyWarmupRoster(enemies, route) {
    const names = ['金颈鸡', '细脖麻鸡', '黄羽鸡', '红冠青鸡', '黑羽鸡', '墨绿鸡',
        '乌金鸡', '斑点鸡', '长颈斗鸡', '赤颈鸡', '浅羽麻鸡', '蓬尾黄鸡'];
    const warmups = Object.values(route).filter(node => node.encounter === 'warmup');
    for (const node of warmups) {
        const round = warmups.filter(other => other.mapId === node.mapId && other.id <= node.id).length;
        const variant = ((node.mapId - 1) * 5 + (round - 1)) % 12;
        const baseId = `s${node.mapId}_warmup`;
        const id = `${baseId}_${round}`;
        enemies[id] = { ...enemies[baseId], id, name: names[variant], illustration: `warmup_${variant + 1}` };
        node.enemyId = id;
    }
};
