/** Verify the real ResLoader against a minimal Cocos asset/ref-count adapter. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const tsPath = ["node_modules/typescript", "extensions/oops-plugin-framework/node_modules/typescript",
    "extensions/cocos-mcp-server/node_modules/typescript"].find(p => fs.existsSync(path.join(root, p)));
const ts = require(path.join(root, tsPath));

class Asset {
    constructor(uuid) { this.uuid = uuid; this.refCount = 0; this.isValid = true; }
    addRef() { this.refCount++; return this; }
    decRef() { if (--this.refCount <= 0) this.isValid = false; return this; }
}
const assets = new Map(), bundles = new Map();
let physicalLoads = 0;
let failNext = true;
function makeBundle(name) {
    const loaded = new Map();
    const bundle = {
        name,
        get: p => loaded.get(p)?.isValid ? loaded.get(p) : null,
        getDirWithPath: p => [...loaded].filter(([key]) => key.startsWith(p)).map(([, a]) => ({ uuid: a.uuid })),
        load(paths, type, progress, done) {
            const list = (Array.isArray(paths) ? paths : [paths]).map(p => {
                if (p === "fail" && failNext) { failNext = false; return null; }
                let a = bundle.get(p);
                if (!a) {
                    a = new Asset(name + ":" + p);
                    loaded.set(p, a); assets.set(a.uuid, a); physicalLoads++;
                }
                return a;
            });
            queueMicrotask(() => done(list.includes(null) ? Error("failed") : null, Array.isArray(paths) ? list : list[0]));
        },
        loadDir(p, type, progress, done) { bundle.load([p + "/a", p + "/b"], type, progress, done); },
        preload(p, type, progress, done) { done(null, { url: p }); },
        releaseAll() { for (const a of loaded.values()) a.isValid = false; loaded.clear(); }
    };
    bundles.set(name, bundle);
    return bundle;
}
const resources = makeBundle("resources");
const cc = {
    Asset, resources,
    assetManager: { assets, bundles, getBundle: name => bundles.get(name), removeBundle: b => bundles.delete(b.name) },
    js: { isChildClassOf: type => type === Asset }
};
const file = "extensions/oops-plugin-framework/assets/core/common/loader/ResLoader.ts";
const code = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS }
}).outputText;
const moduleExports = {};
vm.runInNewContext(code, { Array, exports: moduleExports, require: name => {
    assert.equal(name, "cc"); return cc;
}, console });

(async () => {
    makeBundle("bundle");
    const loader = new moduleExports.ResLoader();
    loader.memoryCacheBundles.add("bundle");
    assert.equal(physicalLoads, 0, "enabling cache must not preload the bundle");
    const first = await loader.load("bundle", "hero", Asset);
    assert.equal(first.refCount, 1);
    for (let i = 0; i < 100; i++) {
        const again = await loader.load("bundle", "hero", Asset);
        assert.equal(again, first);
        again.addRef(); // A view owns a reference while it is open.
        loader.release("hero", "bundle");
    }
    assert.equal(physicalLoads, 1, "reopening views must reuse loaded assets");
    assert.equal(first.refCount, 1, "cache reference must not grow per view");
    loader.release("hero", "bundle");
    assert.equal(first.isValid, true, "raw texture/JSON users must not consume the cache reference");
    const batch = await new Promise(resolve => loader.loadAny("bundle", ["hero", "icon"], null, (err, data) => resolve(data)));
    assert.equal(batch[0], first);
    assert.equal(batch[1].refCount, 1);
    const directory = await new Promise(resolve => loader.loadDir("bundle", "fx", Asset, null, (err, data) => resolve(data)));
    loader.releaseDir("fx", "bundle");
    assert(directory.every(a => a.isValid && a.refCount === 1));
    const count = loader.memoryCache.size;
    assert.equal(await loader.load("bundle", "fail", Asset), null);
    await loader.preload("bundle", "later", Asset);
    assert.equal(loader.memoryCache.size, count, "failed and download-only requests must not be retained");
    const retry = await loader.load("bundle", "fail", Asset);
    assert(retry.isValid && retry.refCount === 1, "failed requests must allow retry");
    const concurrent = await Promise.all(Array.from({ length: 10 }, () => loader.load("bundle", "shared", Asset)));
    assert(concurrent.every(a => a === concurrent[0]));
    assert.equal(concurrent[0].refCount, 1, "concurrent completions must pin an asset only once");
    const uncached = await loader.load("resources", "temporary", Asset);
    uncached.addRef(); loader.release("temporary", "resources");
    assert.equal(uncached.isValid, false, "unconfigured bundles keep the original release behavior");
    loader.releaseDir("", "bundle");
    assert.equal(bundles.has("bundle"), false);
    assert.equal(loader.memoryCache.size, 0);
    assert.equal(first.isValid, false);
    makeBundle("bundle");
    const fresh = await loader.load("bundle", "hero", Asset);
    assert.notEqual(fresh, first);
    assert.equal(fresh.refCount, 1);
    loader.removeBundle("bundle");
    assert.equal(loader.memoryCache.size, 0);
    assert.equal(fresh.isValid, false);
    console.log("PASS resource cache: 100 view cycles, batch/directory loads, failure/preload, default release and explicit unload");
})().catch(err => { console.error(err); process.exitCode = 1; });
