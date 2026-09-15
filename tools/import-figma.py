"""Import the original Figma SVG exports, retaining composition and 1080x1920 coordinates.

Usage: python tools/import-figma.py <export-directory> <resvg-node-module>
The export directory contains png/ and svg/ from Figma's Export 133 layers.
"""
import copy
import io
import json
import subprocess
import sys
import uuid
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SOURCE = Path(sys.argv[1]).resolve()
RENDERER = Path(sys.argv[2]).resolve()
TEX = ROOT / 'assets/bundle/game/texture'
NS = '{http://www.w3.org/2000/svg}'
ET.register_namespace('', NS[1:-1])
ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')
template = json.loads((TEX / 'bg/start_figma.png.meta').read_text('utf-8'))
manifest = {}


def save(name, image, source, box):
    if name == 'ui/figma_match_card':
        # The source embeds example values in the raster. Extend each row's
        # adjacent empty background across those values; retain labels/icons.
        for x, y, w, h, sample in [(275, 65, 140, 48, 250), (824, 81, 132, 36, 800)] + [
            (125, y, 132, 36, 115) for y in [256, 341, 427, 515, 600, 686]
        ] + [(883, y, 105, 34, 975) for y in [274, 353, 435, 516, 595, 674]]:
            image.paste(image.crop((sample, y, sample+1, y+h)).resize((w, h)), (x, y))
    if name == 'bg/result_figma':
        # 战斗结算 SVG 底层是白底，画面从 x=4 才开始，缩放后左边会剩一条白边。
        image = cover_left_margin(image)
    target = TEX / (name + '.png')
    target.parent.mkdir(parents=True, exist_ok=True)
    encoded = io.BytesIO()
    image.save(encoded, format='PNG')
    if not target.exists() or target.read_bytes() != encoded.getvalue():
        staging = SOURCE / 'asset-write.png'
        staging.write_bytes(encoded.getvalue())
        staging.replace(target)
    meta_path = Path(str(target) + '.meta')
    ident = json.loads(meta_path.read_text('utf-8'))['uuid'] if meta_path.exists() else str(uuid.uuid5(uuid.NAMESPACE_URL, 'chicken-battle/figma/' + name))
    meta = json.loads(json.dumps(template).replace(template['uuid'], ident))
    w, h = image.size
    for sub in meta['subMetas'].values():
        sub['displayName'] = target.stem
    data = meta['subMetas']['f9941']['userData']
    data.update(trimType='none', width=w, height=h, rawWidth=w, rawHeight=h, packable=False)
    data['vertices'].update(rawPosition=[-w/2,-h/2,0,w/2,-h/2,0,-w/2,h/2,0,w/2,h/2,0],
                            uv=[0,h,w,h,0,0,w,0], minPos=[-w/2,-h/2,0], maxPos=[w/2,h/2,0])
    meta['userData']['hasAlpha'] = image.mode == 'RGBA'
    serialized = json.dumps(meta, indent=2)
    if not meta_path.exists() or meta_path.read_text('utf-8') != serialized:
        staging = SOURCE / 'asset-write.meta'
        staging.write_text(serialized, encoding='utf-8')
        staging.replace(meta_path)
    manifest[name] = dict(uuid=ident, source=source, box=box)


def cover_left_margin(image):
    """Extend the first real scene column over the leftover white canvas strip."""
    out = image.copy()
    pixels = out.load()
    width, height = out.size
    source_x = 0
    mid = height // 2
    for x in range(min(16, width)):
        r, g, b = pixels[x, mid][:3]
        if r < 200:
            source_x = min(x + 2, width - 1)
            break
    if source_x <= 0:
        return out
    for x in range(source_x):
        for y in range(height):
            pixels[x, y] = pixels[source_x, y]
    return out


def composition(name, source, indices, box=(0, 0, 1080, 1920), transform=None):
    original = ET.parse(SOURCE / 'svg' / (source + '.svg')).getroot()
    group = original.find(NS + 'g')
    children = list(group if group is not None else original)
    root = ET.Element(NS + 'svg', dict(width=str(box[2]), height=str(box[3]),
                                     viewBox=' '.join(map(str, box)), fill='none'))
    dest = ET.SubElement(root, NS + 'g', group.attrib if group is not None else {})
    if transform:
        dest.set('transform', transform)
    for i in indices:
        element = copy.deepcopy(children[i])
        if name == 'ui/figma_gold' and i == 64:
            for sample_text in list(element)[2:]:
                element.remove(sample_text)
        dest.append(element)
    root.append(copy.deepcopy(original.find(NS + 'defs')))
    scratch = SOURCE / 'composition.svg'
    ET.ElementTree(root).write(scratch, encoding='utf-8', xml_declaration=True)
    output = SOURCE / 'composition.png'
    subprocess.run(['node', '-e', "const fs=require('fs');const {Resvg}=require(process.argv[1]);fs.writeFileSync(process.argv[3],new Resvg(fs.readFileSync(process.argv[2])).render().asPng())", str(RENDERER), str(scratch), str(output)], check=True)
    save(name, Image.open(output).copy(), source, list(box))


composition('ui/figma_customize_base', '角色界面-1', [7], (0,1100,1080,820))
composition('ui/figma_customize_buttons', '角色界面-1', list(range(14,22)), (0,1100,1080,820))
composition('ui/figma_customize_colors', '角色界面-1', list(range(8,14)), (0,1100,1080,820))
composition('ui/figma_tab', '角色界面-1', [29], (68,1140,173,151))
for name, indices, box in [
    ('head', [30,31,32], (108,1144,90,96)),
    ('face', [22,23], (291,1150,113,92)),
    ('wing', [24], (488,1144,96,100)),
    ('body', [25,26,27], (686,1140,78,105)),
    ('leg', [28], (860,1144,102,100))]:
    composition('ui/figma_tab_' + name, '角色界面-1', indices, box)
set_icon = Image.open(SOURCE / 'png/image 79.png').convert('RGBA').crop((882,1075,1000,1172))
# Extract the gray silhouette from the black source tab as a tintable white icon.
set_alpha = set_icon.getchannel('R').point(lambda value: min(255, value * 2))
set_icon = Image.new('RGBA', set_icon.size, 'white')
set_icon.putalpha(set_alpha)
save('ui/figma_tab_set', set_icon, 'image 79', [882,1075,118,97])
composition('bg/start_figma', '开始界面', [0, 1])
composition('bg/village_figma', '角色界面', [0, 1, 2])
composition('bg/arena_figma', '自动战斗界面', [0, 1])
composition('ui/figma_hp', '自动战斗界面', [3], (149, 89, 362, 66))
composition('bg/map_figma', '冒险地图', [0, 1])
# The composed map background includes sample stage numbers and a baked button.
# Use its separately supplied empty-road counterpart for live progression.
for index, number in enumerate([127, 129, 130, 131, 133], 1):
    source = 'image ' + str(number)
    im = Image.open(SOURCE / 'png' / (source + '.png')).convert('RGBA').resize((1080, 1920), Image.Resampling.LANCZOS)
    save('bg/' + ('map_figma' if index == 1 else 'map_' + str(index) + '_figma'), im, source, [0, 0, 1080, 1920])
# Original Figma store illustrations, center-cropped to the portrait viewport.
for name, number in [('shop_figma', 76), ('shop_weapon_figma', 75)]:
    source = 'image ' + str(number)
    im = Image.open(SOURCE / 'png' / (source + '.png')).convert('RGBA')
    save('bg/' + name, im.crop((0,235,1080,2155)), source, [0,235,1080,1920])
composition('bg/result_figma', '战斗结算', [0, 1, 2, 3])
# result_lose_figma is a dedicated rainy defeat painting (rain + 失败 / 变强继续挑战！),
# not a stripped WINNER frame. Do not overwrite it on Figma reimport.
composition('bg/prebattle_figma', '战前准备', range(533))
composition('bg/reward_figma', '战利品强化', [0, 1, 2])
composition('ui/figma_button_red', '开始界面', range(2, 5), (292, 1392, 496, 231))
composition('ui/figma_button_green', '战斗结算', range(5, 8), (292, 1610, 500, 182))
composition('ui/figma_reward_banner', '战利品强化', [9], (144, 269, 792, 202))
composition('ui/figma_reward_card', '战利品强化', [3, 4], (73, 559, 312, 935))
composition('ui/figma_avatar', '自动战斗界面', [6, 8], (44, 43, 157, 164))
composition('ui/figma_gold', '冒险地图', range(64, 69), (830, 35, 198, 80))
composition('chicken/figma_shadow', '角色界面-1', [33], (332, 960, 444, 136))
composition('ui/figma_match_card', '战前准备', [533], (6, 614, 1073, 766))
composition('ui/figma_customize_panel', '角色界面-1', range(3, 8), (0, 1100, 1080, 820))
composition('ui/figma_customize_controls', '角色界面-1', range(8, 33), (0, 1100, 1080, 820))
composition('ui/figma_button_yellow', '角色界面-1', [14], (589, 1628, 356, 128))
composition('ui/figma_button_pink', '角色界面-1', [18], (160, 1590, 350, 200))
composition('ui/figma_player_source', '角色界面-1', [i for i in range(34, 98) if i not in range(74, 78)], (352, 157, 377, 920))
faces = [
    ('dumb',124,92,list(range(98,103)),102),
    ('cute',284,95,list(range(103,107)),106),
    ('sad',460,93,list(range(107,114)),111),
    ('fierce',620,96,list(range(122,129)),125),
    ('proud',796,94,list(range(114,118)),116),
    ('wink',956,97,list(range(118,122)),120)]
for face, cx, badge, features, beak in faces:
    composition('ui/figma_expression_' + face, '角色界面', [badge] + features, (cx-68,1368,136,140))
    composition('chicken/figma_face_' + face, '角色界面', [i for i in features if i != beak],
                (352,157,377,243), f'translate({438-cx*1.8} {300-1430*1.8}) scale(1.8)')
player = Image.open(TEX / 'ui/figma_player_source.png').convert('RGBA')
# Non-overlapping cuts retain the exact resting silhouette, while allowing the
# existing head/neck/body/leg animation and colour controls to keep working.
for part, rect in {'head': (0, 0, 377, 243), 'neck': (0, 243, 377, 442),
                   'body': (0, 442, 377, 767), 'leg_left': (0, 767, 188, 920),
                   'leg_right': (188, 767, 377, 920), 'wing': (242, 442, 377, 667)}.items():
    im = player.crop(rect)
    if part == 'body':
        im.paste((0, 0, 0, 0), (242, 0, 377, 225))
    ink = im.copy()
    pixels = im.load()
    ink_pixels = ink.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = pixels[x, y]
            # Keep black ink and the face; neutralize only the coloured feathers.
            red = r > 90 and r > g * 1.7 and r > b * 1.6
            if a and red and part != 'wing':
                v = min(255, round(r / 240 * 255))
                pixels[x, y] = (v, v, v, a)
                ink_pixels[x, y] = (0, 0, 0, 0)
            elif (part.startswith('leg') or part == 'wing') and a and r > 70 and not red:
                v = min(255, round(r / (173 if part == 'wing' else 197) * 255))
                pixels[x, y] = (v, v, v, a)
                ink_pixels[x, y] = (0, 0, 0, 0)
            else:
                pixels[x, y] = (0, 0, 0, 0)
    save('chicken/figma_' + part, im, '角色界面-1', [352+rect[0], 157+rect[1], im.width, im.height])
    save('chicken/figma_' + part + '_ink', ink, '角色界面-1', [352+rect[0], 157+rect[1], im.width, im.height])
for name, source in [('s1_official', 'image 105'), ('s2_official', 'image 107'),
                     ('s3_official', 'image 109'), ('s4_official', 'image 110'),
                     ('s5_official', 'image 113'), ('kun_boss', 'image 39'),
                     ('s1_warmup', 'image 135'), ('s2_warmup', 'image 136'),
                     ('s3_warmup', 'image 137'), ('s4_warmup', 'image 138'), ('s5_warmup', 'image 140')]:
    im = Image.open(SOURCE / 'png' / (source + '.png')).convert('RGBA')
    im = im.crop(im.getbbox())
    save('chicken/' + name, im, source, [0, 0, *im.size])
for index in range(1, 13):
    source = 'image ' + str(60 + index)
    im = Image.open(SOURCE / 'png' / (source + '.png')).convert('RGBA')
    save('chicken/warmup_' + str(index), im, source, [0, 0, *im.size])
for name, source in [('stage', 'Group 28'), ('lock', 'Group 29'), ('boss', 'Group 31'), ('chest', 'Group 33'), ('shop', 'image 120')]:
    im = Image.open(SOURCE / 'png' / (source + '.png')).convert('RGBA')
    save('map/' + name, im, source, [0, 0, *im.size])
sets = {
    'rookie': ('诸葛亮套', ['孔明冠', '八卦道袍', '羽扇', '玉佩'], [81, 82, 78, 83], 84),
    'brawler': ('关羽套', ['武圣冠', '青龙战袍', '青龙偃月刀', '美髯'], [85, 87, 86, 88], 89),
    'medic': ('医疗鸡套', ['医师头巾', '白大褂', '保温杯', '急救药箱'], [90, 92, 91, 93], 94),
    'helicopter': ('直升鸡套', ['飞行头盔', '飞行服', '螺旋桨', '操纵盘'], [95, 97, 96, 98], 99),
    'miser': ('铁公鸡套', ['铁公鸡头盔', '省钱毛衣', '算盘', '优惠券包'], [100, 102, 101, 103], 104),
}
config = ROOT / 'assets/bundle/config/game'
items = json.loads((config / 'Item.json').read_text('utf-8'))
definitions = json.loads((config / 'Set.json').read_text('utf-8'))
for ident, (title, names, images, complete) in sets.items():
    definitions[ident]['name'] = title
    for suffix, label, number, slot in zip(['head', 'neck', 'wing', 'leg'], names, images, ['head', 'body', 'wing', 'neck']):
        key = ident + '_' + suffix
        items[key].update(name=label, icon=key, slot=slot)
        source = 'image ' + str(number)
        im = Image.open(SOURCE / 'png' / (source + '.png')).convert('RGBA')
        im = im.crop(im.getbbox())
        save('equip/' + key, im, source, [0, 0, *im.size])
    source = 'image ' + str(complete)
    im = Image.open(SOURCE / 'png' / (source + '.png')).convert('RGBA')
    im = im.crop(im.getbbox())
    save('equip/set_' + ident, im, source, [0, 0, *im.size])
definitions['concrete']['legacy'] = True
parts = json.loads((config / 'Part.json').read_text('utf-8'))
for order, (face, label) in enumerate(zip(['dumb','cute','sad','fierce','proud','wink'], ['呆','萌','委屈','凶','傲','眨眼'])):
    parts['face_' + face] = dict(id='face_' + face, type='face', name=label, value=face, order=order)
for index, value in {0: '#F03E53', 1: '#FCC421', 9: '#01A4FC', 4: '#59AB5E', 7: '#FFFFFF', 5: '#000E17'}.items():
    parts['color_' + str(index)]['value'] = value
equipment_screen = Image.open(SOURCE / 'png/image 79.png').convert('RGBA')
for name, box in [('back', (56, 31, 110, 81)), ('stat_hp', (66, 400, 194, 198)),
                  ('stat_atk', (810, 400, 195, 198)), ('stat_combo', (66, 776, 194, 198)),
                  ('stat_spd', (810, 776, 195, 198)), ('equipment_panel', (0, 1060, 1080, 860)),
                  ('power', (379, 129, 289, 100))]:
    x, y, w, h = box
    im = equipment_screen.crop((x, y, x+w, y+h))
    if name == 'equipment_panel':
        im.paste((35, 33, 47, 255), (0, 150, w, h))
    if name == 'power':
        for yy in range(22, 87):
            im.paste(im.crop((270, yy, 271, yy+1)).resize((163, 1)), (104, yy))
    save('ui/figma_' + name, im, 'image 79', list(box))
im = Image.open(SOURCE / 'png/image 80.png').convert('RGBA')
save('ui/figma_equip_slot', im, 'image 80', [0, 0, *im.size])
for name, data in [('Item', items), ('Set', definitions), ('Part', parts)]:
    (config / (name + '.json')).write_text(json.dumps(data, ensure_ascii=False, indent=4), encoding='utf-8')
# Intermediate composition is useful during import, but not a runtime asset.
for name in ['ui/figma_player_source', 'ui/figma_button_pink']:
    manifest.pop(name, None)
    for suffix in ['.png', '.png.meta']:
        target = (TEX / (name + suffix)).resolve()
        assert target.is_relative_to(TEX.resolve())
        target.unlink(missing_ok=True)
(ROOT / 'tools/figma-assets.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'Imported {len(manifest)} original Figma compositions')
