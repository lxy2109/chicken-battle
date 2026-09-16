/**
 * 把绝招标题字体拷进 bundle，并同步 library，编辑器预览才能立刻用上。
 */
const fs = require("fs");
const path = require("path");
const uuids = require("./art-uuids.cjs");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "temp", "skill_title.ttf");
const DIR = path.join(ROOT, "assets", "bundle", "game", "font");
const NAME = "skill_title";
const uuid = uuids[NAME];

if (!fs.existsSync(SRC)) throw new Error("missing " + SRC);
if (!uuid) throw new Error("no uuid for " + NAME);

fs.mkdirSync(DIR, { recursive: true });
const dest = path.join(DIR, NAME + ".ttf");
fs.copyFileSync(SRC, dest);

const dirMeta = path.join(DIR + ".meta");
if (!fs.existsSync(dirMeta)) {
    fs.writeFileSync(dirMeta, JSON.stringify({
        ver: "1.2.0",
        importer: "directory",
        imported: true,
        uuid: "a1b2c3d4-5005-4d00-8000-000000000000",
        files: [],
        subMetas: {},
        userData: {}
    }, null, 2) + "\n");
}

fs.writeFileSync(dest + ".meta", JSON.stringify({
    ver: "1.0.1",
    importer: "ttf-font",
    imported: true,
    uuid,
    files: [".json"],
    subMetas: {},
    userData: {}
}, null, 2) + "\n");

const libRoot = path.join(ROOT, "library");
if (fs.existsSync(libRoot)) {
    const dir = path.join(libRoot, uuid.slice(0, 2));
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(dest, path.join(dir, uuid + ".ttf"));
    fs.writeFileSync(path.join(dir, uuid + ".json"), JSON.stringify({
        __type__: "cc.TTFFont",
        _name: NAME,
        _objFlags: 0,
        _native: ".ttf"
    }, null, 2) + "\n");

    const rel = "bundle\\game\\font\\" + NAME + ".ttf";
    const now = Date.now();
    const infoPath = path.join(libRoot, ".assets-info.json");
    if (fs.existsSync(infoPath)) {
        const info = JSON.parse(fs.readFileSync(infoPath, "utf8"));
        const files = info.map || info.files || info;
        files[rel] = { time: now, uuid };
        files[rel + ".meta"] = { time: now };
        fs.writeFileSync(infoPath, JSON.stringify(info, null, 2) + "\n");
    }
    const dataPath = path.join(libRoot, ".assets-data.json");
    if (fs.existsSync(dataPath)) {
        const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
        const url = "db://assets/bundle/game/font/" + NAME + ".ttf";
        data[uuid] = { url, value: { depends: [] }, versionCode: 1 };
        fs.writeFileSync(dataPath, JSON.stringify(data, null, 2) + "\n");
    }
    const listPath = path.join(libRoot, ".assets");
    if (fs.existsSync(listPath)) {
        const list = JSON.parse(fs.readFileSync(listPath, "utf8"));
        const paths = list.data && list.data.paths;
        if (Array.isArray(paths) && !paths.includes(rel)) paths.push(rel);
        fs.writeFileSync(listPath, JSON.stringify(list, null, 4) + "\n");
    }
}

console.log(NAME, uuid, fs.statSync(dest).size);