/**
 * 把框架模板自带的通用贴图换成本项目风格。
 *
 * 这些图被 common/prefab 下的弹窗和 gui/loading 引用着，而框架内部是按路径硬编码
 * 找这些预制体的（GuiEnum 里的 Toast / Wait / Mask），所以不能改名也不能挪位置。
 * 做法是原地覆盖像素、沿用 .meta 里原有的 uuid，这样所有引用一个都不用动。
 *
 * 尺寸变了必须同步重写 spriteFrame 的顶点和 uv，否则编辑器还按旧尺寸采样，
 * 画面会错位。九宫格边距一律保持 0，跟原 meta 一致，免得改了 SLICED 的表现。
 *
 * 用法: node tools/replace-tex.cjs
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const png = require("./png.cjs");
const draw = require("./draw-ui.cjs");

const ROOT = path.resolve(__dirname, "../..");
/**
 * GenerateImage 的落盘位置，可用 GEN_DIR 覆盖。
 * 生成图不入库，跟 import-art 一个路子：产物已经提交了，
 * 重跑时源图不在就跳过那一条，磁盘上的成品照旧。
 */
const GEN = process.env.GEN_DIR
    || path.join(os.homedir(), ".cursor/projects/h-chicken-battle/assets");

/**
 * 目标贴图清单。from 有三种写法：
 * 函数按目标尺寸直接画；assets/ 开头的路径复用项目现成素材；其余当生成图文件名。
 */
const JOBS = [
    {
        to: "assets/bundle/common/texture/bg_window.png",
        from: "dlg_window.png", w: 478, h: 320, trim: true
    },
    {
        to: "assets/bundle/common/texture/btn_ok.png",
        from: "dlg_btn.png", w: 117, h: 53, trim: true
    },
    {
        to: "assets/bundle/common/texture/toast.png",
        from: draw.toast, w: 539, h: 90
    },
    {
        to: "assets/bundle/common/texture/loading.png",
        from: draw.spinner, w: 138, h: 138
    },
    {
        to: "assets/bundle/gui/loading/texture/icon_loading_bar.png",
        from: draw.barFill, w: 549, h: 47
    },
    {
        to: "assets/bundle/gui/loading/texture/panel_loading_bottom_frame.png",
        from: draw.barFrame, w: 567, h: 65
    }
];

/** 沿用原 meta 的 uuid，只把尺寸相关的字段按新图重算。 */
function rewriteMeta(metaFile, w, h) {
    const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    const sub = meta.subMetas || {};
    const frameKey = Object.keys(sub).find(k => sub[k].importer === "sprite-frame");
    if (!frameKey) throw new Error(`${metaFile} 里没有 sprite-frame`);
    const u = sub[frameKey].userData;
    const hw = w / 2;
    const hh = h / 2;
    Object.assign(u, {
        trimX: 0, trimY: 0, offsetX: 0, offsetY: 0, rotated: false,
        width: w, height: h, rawWidth: w, rawHeight: h,
        borderTop: 0, borderBottom: 0, borderLeft: 0, borderRight: 0,
        vertices: {
            rawPosition: [-hw, -hh, 0, hw, -hh, 0, -hw, hh, 0, hw, hh, 0],
            indexes: [0, 1, 2, 2, 1, 3],
            uv: [0, h, w, h, 0, 0, w, 0],
            nuv: [0, 0, 1, 0, 0, 1, 1, 1],
            minPos: [-hw, -hh, 0],
            maxPos: [hw, hh, 0]
        }
    });
    fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2) + "\n");
    return meta.uuid;
}

let done = 0;
for (const job of JOBS) {
    const dest = path.join(ROOT, job.to);
    const metaFile = dest + ".meta";
    if (!fs.existsSync(metaFile)) {
        console.error("缺少 meta，跳过", job.to);
        continue;
    }

    let img;
    if (typeof job.from === "function") {
        img = job.from(job.w, job.h);
    }
    else {
        const reuse = job.from.startsWith("assets/");
        const src = reuse ? path.join(ROOT, job.from) : path.join(GEN, job.from);
        if (!fs.existsSync(src)) {
            console.error("缺少来源图，跳过", job.from);
            continue;
        }
        img = png.decode(src);
        if (job.trim) img = png.trim(img) || img;
        img = png.fitCrop(img, job.w, job.h);
    }

    png.encode(dest, img);
    const uuid = rewriteMeta(metaFile, job.w, job.h);
    console.log(`${path.basename(job.to).padEnd(32)} ${job.w}x${job.h}  uuid ${uuid}`);
    done += 1;
}
console.log(`\n替换完成 ${done}/${JOBS.length}`);
