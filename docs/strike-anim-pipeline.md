# 出招序列帧（生图）管线

正式动画表**只走参考图生图**，不用 `gen-strike-sheets` 程序化扭立绘（那只是占位备用）。

## 目录

| 路径 | 用途 |
|------|------|
| `temp/strike-gen/refs/<key>.png` | 角色立绘参考（外貌锁死） |
| `temp/strike-gen/prompts/<key>.<style>.txt` | 生图提示词 |
| `temp/strike-gen/raw/<key>.<style>.png` | 生图原片（4×4） |
| `temp/strike-gen/jobs.json` | 缺哪些 raw 的清单 |
| `assets/bundle/game/image/anim/<key>/<style>.png` | 导入后的 1024×1024 游戏资源 |

`style`：`idle` `peck` `jump` `dive` `leap` `charge` `tail` `combo` `feint`  
小怪（`warmup_*` / `s*_warmup`）只要 `idle` + `peck`。

## 步骤

```bash
# 1. 确认 refs 齐（从 actor/equip 拷过也行）
# 2. 生成 / 刷新提示词
node tools/gen/gen-strike-prompts.cjs
node tools/gen/gen-strike-prompts.cjs set_rookie        # 单角色
node tools/gen/gen-strike-prompts.cjs set_rookie peck   # 单动作

# 3. 生图：每张图带 refs/<key>.png + 对应 prompt 文本
#    输出放到 temp/strike-gen/raw/<key>.<style>.png
#    规格：4×4 宫格，建议 1024²+，纯品红底 #FF00FF（勿用黑底，黑衣会被抠穿）

# 4. 抠图 + 切格 + 写入 anim/
node tools/import-strike-gen.cjs --dir temp/strike-gen/raw
```

## 提示词在管什么

`gen-strike-prompts.cjs` 写死四块，针对以前糟心事：

1. **16 帧必须是夸张动画，不是 16 张相似立绘**  
   - 先写大关键帧（预备 / 最高点 / 命中 / 落地），再写中间帧；**禁止 +2px / +3% 微动文案**（模型会生成静帧）  
   - HARD FAIL：整行几乎一样、缩略图看不出动作、只有眨眼级呼吸  
   - 攻击：橡胶管大拉伸；idle：明显起伏 + 左右倾（高/低差约 15%，倾角约 20°）  
2. **难抠 / 抠坏**：只要 **纯品红底 #FF00FF**（黑衣/黑毛安全）；禁止黑底/白底、绿/灰脚下阴影盘、棋盘；白衣服必须实心。  
3. **外貌漂**：每个 `key` 有 LOOK，并写明「与参考图冲突时听参考图」。  
4. **排版**：4×4、左→右上→下即帧序、全身、朝左、格边留白。

改动作手感或某只鸡的外观，改 `tools/gen/gen-strike-prompts.cjs` 里的 `ACTION` / `LOOK` 再跑一遍脚本，然后 **重新生图**（旧 raw 不会自己变连贯）。

## 导入抠图

`import-strike-gen` 对每格跑 `knockCharacterCell`：

- 边缘识别 **品红 / 黑 / 白** 棚（优先品红键，黑衣不会被掏空）  
- 主体核保护彩色 + 黑/白面料；**脚下绿影不进核**  
- 品红底：抠品红；黑底兜底时收紧阈值并靠核保护黑衣  
- 去脚下绿盘、飞点、填内部小洞、清溢色  

脚底 Y 对齐后再拼进 256 格，减轻帧间上下跳。

有 raw 优先重导入；无 raw 可对已入库表：

```bash
node tools/art/reknock-anim.cjs              # 全表
node tools/art/reknock-anim.cjs set_rookie   # 单角色
```

## 验收

- 播任意序列：邻帧有可见变化，不像 16 张静帧轮播；idle 有呼吸/重心；攻击有预备→命中→回收。  
- 白衣服角色（`set_rookie` / `kun_boss` / `s5_official` / `set_medic` 毛边）：无大块破洞。  
- 脚下无薄荷绿阴影盘、无黑垫、无白细线。  
- 编辑器里 reimport 贴图后再进战斗预览。

## 备用

```bash
node tools/gen-strike-sheets.cjs   # 立绘仿射占位，正式不要用
```
