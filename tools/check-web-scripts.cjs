// Check the compiled Babel imports before uploading a Cocos web build.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.resolve(process.argv[2] || 'build/web-mobile');
const settingsFiles = fs.readdirSync(path.join(root, 'src'))
    .filter(name => /^settings(?:\.[a-f0-9]+)?\.json$/.test(name));
assert.equal(settingsFiles.length, 1, 'Expected one settings file; rebuild into a clean output directory');
const settings = JSON.parse(fs.readFileSync(path.join(root, 'src', settingsFiles[0]), 'utf8'));
const mapFiles = fs.readdirSync(path.join(root, 'src'))
    .filter(name => /^import-map(?:\.[a-f0-9]+)?\.json$/.test(name));
assert.equal(mapFiles.length, 1, 'Expected one import map');
const importMap = JSON.parse(fs.readFileSync(path.join(root, 'src', mapFiles[0]), 'utf8'));
const engineEntry = path.resolve(root, 'src', importMap.imports.cc);
assert(fs.existsSync(engineEntry), `Missing engine entry: ${importMap.imports.cc}`);
const hostingEntry = path.join(root, 'cocos-js', 'cc.js');
assert(fs.existsSync(hostingEntry), 'Hosting requires cocos-js/cc.js; enable the web-publish build extension');
assert(fs.readFileSync(hostingEntry).equals(fs.readFileSync(engineEntry)), 'Hosting entry differs from the imported engine entry');
const modules = new Map();
const context = vm.createContext({ System: { register(...args) {
    if (typeof args[0] === 'string') {
        assert(!modules.has(args[0]), `Duplicate module: ${args[0]}`);
        modules.set(args[0], { deps: args[1], declare: args[2] });
    } else {
        // Script packages wrap their named registrations in an anonymous module.
        args[1](() => {}, {}).execute();
    }
} } });
function readScript(file) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file, timeout: 5000 });
}

for (const script of settings.scripting.scriptPackages) {
    assert(/\.[a-f0-9]+\.js$/.test(script), `Enable MD5 Cache: ${script}`);
    readScript(path.resolve(root, 'src', script));
}
for (const bundle of settings.assets.projectBundles) {
    const version = settings.assets.bundleVers[bundle];
    assert(version, `Missing bundle version: ${bundle}`);
    const file = path.join(root, 'assets', bundle, `index.${version}.js`);
    readScript(file);
}

const helperName = 'chunks:///_virtual/rollupPluginModLoBabelHelpers.js';
assert(modules.has(helperName), 'Missing Babel helper module');
const helpers = {};
modules.get(helperName).declare((name, value) => {
    if (typeof name === 'string') helpers[name] = value;
    else Object.assign(helpers, name);
}).execute();
let imports = 0;
for (const [name, module] of modules) {
    const index = module.deps.findIndex(dep => dep.endsWith('rollupPluginModLoBabelHelpers.js'));
    if (index < 0) continue;
    module.declare(() => {}, {}).setters[index](new Proxy(helpers, {
        get(target, key) {
            assert.equal(typeof target[key], 'function', `${name}: missing Babel helper ${String(key)}`);
            imports++;
            return target[key];
        }
    }));
}
console.log(`Web scripts OK: ${imports} Babel imports, ${modules.size} modules, versioned scripts and hosting engine entry`);
