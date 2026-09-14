// Exercise the actual view-opening gate with delayed and failed downloads.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const ts = require(path.join(root, 'extensions/oops-plugin-framework/node_modules/typescript'));
const pending = [];
let opens = 0;
let boundBackground;
let shows = 0;
const node = { children: [], name: 'map', setScale() {}, getComponent: () => ({
    async setSprite(target, resource) {
        await Promise.resolve();
        boundBackground = resource;
    }
}) };
const oops = {
    res: {
        loadDir(bundle, dir, type, done) { pending.push({ dir, done }); },
        loadAny(bundle, paths, progress, done) { pending.push({ paths, done }); }
    },
    gui: { async open() { opens++; return node; }, show() {
        assert.equal(boundBackground, `game/texture/bg/${entity.run.currentMap().background}/spriteFrame`,
            'current background must be bound before show');
        shows++;
    } }
};
const gui = { internal: { getKey: ctor => ctor.key, getConfig: () => ({ prefab: 'gui/map/map' }) } };
const exportsObject = {};
const code = ts.transpileModule(fs.readFileSync(path.join(root, 'assets/script/game/gui/RunGui.ts'), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS }
}).outputText;
vm.runInNewContext(code, { exports: exportsObject, require(name) {
    if (name === 'cc') return { SpriteFrame: class {}, view: { getDesignResolutionSize: () => ({ height: 1280 }) } };
    if (name.endsWith('/Oops')) return { oops };
    if (name.endsWith('/Gui')) return { gui };
    return {};
} });
const entity = { run: { currentMap: () => ({ background: 'map_3_figma' }) }, add() {} };
const ctor = { key: 'MapView' };
(async () => {
    const first = exportsObject.openRunView(entity, ctor);
    assert.equal(opens, 0, 'old/loading view stays visible during download');
    const requests = pending.splice(0);
    assert(requests.some(r => r.paths?.includes('game/texture/bg/map_3_figma/spriteFrame')));
    requests.slice(1).forEach(r => r.done(null));
    await Promise.resolve();
    assert.equal(opens, 0, 'a single unfinished directory must still block opening');
    requests[0].done(Error('offline'));
    await assert.rejects(first, /offline/);
    assert.equal(opens, 0, 'failure must leave the previous view intact');
    const retry = exportsObject.openRunView(entity, ctor);
    assert.equal(pending.filter(r => r.dir).length, 1, 'retry only the failed directory');
    pending.splice(0).forEach(r => r.done(null));
    await retry;
    assert.equal(opens, 1);
    const again = exportsObject.openRunView(entity, ctor);
    assert.equal(pending.filter(r => r.dir).length, 0, 'reuse prepared directories');
    pending.splice(0).forEach(r => r.done(null));
    await again;
    assert.equal(opens, 2);
    for (let id = 1; id <= 5; id++) {
        const background = id === 1 ? 'map_figma' : `map_${id}_figma`;
        entity.run.currentMap = () => ({ background });
        boundBackground = undefined;
        const opening = exportsObject.openRunView(entity, ctor);
        pending.splice(0).forEach(r => r.done(null));
        await opening;
    }
    assert.equal(shows, 7);
    console.log('PASS view resource gate: delayed downloads, failure, retry, cache reuse and all five backgrounds before display');
})().catch(error => { console.error(error); process.exitCode = 1; });
