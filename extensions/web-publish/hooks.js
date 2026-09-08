const fs = require('fs');
const path = require('path');
const assert = require('assert');

exports.throwError = true;
exports.onAfterBuild = function (options, result) {
    if (!options.md5Cache) return;
    // The hosting service discovers and shares an engine only when cc.js exists.
    // Keep the hashed entry too: the generated import map still references it.
    const engineDir = path.join(result.dest, 'cocos-js');
    const entries = fs.readdirSync(engineDir).filter(name => /^cc\.[a-f0-9]+\.js$/.test(name));
    assert.equal(entries.length, 1, 'Expected one versioned Cocos engine entry');
    fs.copyFileSync(path.join(engineDir, entries[0]), path.join(engineDir, 'cc.js'));
};
