const fs = require('fs');
const path = require('path');
const assert = require('assert');

exports.throwError = true;

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const ICON_DIR = path.join(PROJECT_ROOT, 'build-templates', 'icon');
const ANDROID_ICON_RES = path.join(PROJECT_ROOT, 'build-templates', 'android', 'proj', 'res');
const NATIVE_ANDROID_RES = path.join(PROJECT_ROOT, 'native', 'engine', 'android', 'res');

const WEB_ICON_FILES = [
    'favicon.png',
    'favicon.ico',
    'apple-touch-icon.png',
    'icon-192.png',
];

const MIPMAPS = [
    'mipmap-mdpi',
    'mipmap-hdpi',
    'mipmap-xhdpi',
    'mipmap-xxhdpi',
    'mipmap-xxxhdpi',
];

const ICON_TAGS = [
    '  <link rel="icon" type="image/png" href="favicon.png"/>',
    '  <link rel="apple-touch-icon" href="apple-touch-icon.png"/>',
    '  <link rel="apple-touch-icon-precomposed" href="apple-touch-icon.png"/>',
].join('\n');

function copyFile(src, dest) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
}

function copyAppIcons(dest) {
    for (const name of WEB_ICON_FILES) {
        const src = path.join(ICON_DIR, name);
        if (fs.existsSync(src)) {
            copyFile(src, path.join(dest, name));
        }
    }
    const htmlPath = path.join(dest, 'index.html');
    if (!fs.existsSync(htmlPath)) return;
    let html = fs.readFileSync(htmlPath, 'utf8');
    if (html.includes('href="favicon.png"')) return;
    if (html.includes('<!--<link rel="apple-touch-icon" href=".png" />-->')) {
        html = html.replace(
            /[ \t]*<!--<link rel="apple-touch-icon" href="\.png" \/>-->\s*<!--<link rel="apple-touch-icon-precomposed" href="\.png" \/>-->/,
            ICON_TAGS,
        );
    } else {
        html = html.replace('</head>', `${ICON_TAGS}\n</head>`);
    }
    fs.writeFileSync(htmlPath, html);
}

function applyAndroidIcons(destResDirs) {
    for (const destRoot of destResDirs) {
        if (!destRoot) continue;
        for (const folder of MIPMAPS) {
            const src = path.join(ANDROID_ICON_RES, folder, 'ic_launcher.png');
            if (!fs.existsSync(src)) continue;
            copyFile(src, path.join(destRoot, folder, 'ic_launcher.png'));
        }
    }
}

function androidResDirs(buildRoot) {
    const dirs = [NATIVE_ANDROID_RES];
    if (buildRoot) {
        dirs.push(path.join(buildRoot, 'proj', 'res'));
    } else {
        dirs.push(path.join(PROJECT_ROOT, 'build', 'android', 'proj', 'res'));
    }
    return dirs;
}

exports.onBeforeBuild = function (options) {
    if (options.platform === 'android') {
        applyAndroidIcons(androidResDirs());
    }
};

exports.onBeforeMake = function (root, options) {
    if ((options && options.platform) === 'android' || path.basename(root) === 'android') {
        applyAndroidIcons(androidResDirs(root));
    }
};

exports.onAfterBuild = function (options, result) {
    if (options.platform === 'android') {
        applyAndroidIcons(androidResDirs(result && result.dest));
        return;
    }
    if (options.platform === 'web-mobile' || options.platform === 'web-desktop') {
        copyAppIcons(result.dest);
    }
    if (!options.md5Cache) return;
    if (options.platform !== 'web-mobile' && options.platform !== 'web-desktop') return;
    // The hosting service discovers and shares an engine only when cc.js exists.
    // Keep the hashed entry too: the generated import map still references it.
    const engineDir = path.join(result.dest, 'cocos-js');
    const entries = fs.readdirSync(engineDir).filter(name => /^cc\.[a-f0-9]+\.js$/.test(name));
    assert.equal(entries.length, 1, 'Expected one versioned Cocos engine entry');
    fs.copyFileSync(path.join(engineDir, entries[0]), path.join(engineDir, 'cc.js'));
};
