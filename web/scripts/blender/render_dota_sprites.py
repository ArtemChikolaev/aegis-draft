# Рендер спрайт-листов Аркады из моделей Dota 2 (BACKLOG T13.13, путь А).
#
# Вход — glTF/GLB, экспортированный Source 2 Viewer CLI (с анимациями и материалами).
# Выход — <out>/<name>.png (лист: строки = анимация × направление, колонки = кадры) и
# <out>/<name>.json (мета: размер кадра, число направлений, какие строки у какой анимации,
# якорь ног, желаемый размер в игровых пикселях). Игра читает мету и ничего о Blender не знает.
#
# Запуск (Blender 4.x/5.x, без GUI):
#   blender -b -P render_dota_sprites.py -- --glb juggernaut.glb --name juggernaut \
#       --out ../../public/art/sprites/dota --dirs 8 --frame 128 --fps 12 --world 84 \
#       --anims "walk=run,idle=idle,attack=attack,death=death"
#
# Ориентация и кадрирование определяются ПО РЕНДЕРУ (пробные снимки силуэта), а не по геометрии:
# у glTF из Source 2 меш «стоит» по вершинам, а поза анимации кладёт модель через кости, и любые
# вычисления по мешу/костям врут. Пробы: три кандидата поворота (как есть / ±90° вокруг X), выбираем
# самый высокий силуэт спереди, затем центруем и подбираем охват камеры по силуэту спереди и сверху.
# Направление 0 = лицом к камере (вниз по экрану), далее против часовой на экране (вниз, вправо,
# вверх, влево): камера и свет орбитой уходят по часовой.
import bpy, sys, os, json, math, argparse

def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--glb", required=True)
    p.add_argument("--name", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--dirs", type=int, default=8)
    p.add_argument("--frame", type=int, default=128, help="размер кадра в пикселях (квадрат)")
    p.add_argument("--fps", type=int, default=12, help="кадров в секунду анимации")
    p.add_argument("--max-frames", type=int, default=16)
    p.add_argument("--world", type=int, default=84, help="желаемая высота спрайта в игровых px (мета)")
    p.add_argument("--anims", default="walk=run,idle=idle,attack=attack,death=death")
    p.add_argument("--pitch", type=float, default=45.0, help="высота камеры над горизонтом, градусов (90 = строго сверху; 45 читается как RTS/DMD)")
    p.add_argument("--hide-base", action="store_true", help="скрыть меши основной модели и оставить только части: скелет и анимации берём у героя, а вид — у арканы (её собственный item-glb часто без клипов ходьбы, и герой «скользил»)")
    p.add_argument("--parts", default="", help="доп. glb через запятую (штаны/маска/оружие героя Dota): их меши пришиваются к скелету основной модели по именам костей")
    p.add_argument("--no-root-lock", action="store_true", help="не гасить смещение корневой кости (root motion) в анимациях")
    p.add_argument("--yaw-offset", type=float, default=0.0, help="поворот направления 0 (модели Source 2 из VRF уже смотрят в камеру)")
    p.add_argument("--up", default="none", help="none — модели Source 2 из VRF стоят верно (стандарт); plus / minus — ±90° вокруг X; auto — по пробным рендерам (ненадёжно для сгорбленных)")
    p.add_argument("--margin", type=float, default=1.12)
    p.add_argument("--samples", type=int, default=16)
    p.add_argument("--ortho", type=float, default=0.0, help="принудительный охват камеры в единицах модели (0 = по силуэту)")
    p.add_argument("--pixel", action="store_true", help="пиксель-арт в духе Dead Cells: движок Workbench (плоский студийный свет, контур, без сглаживания), маленький кадр (48 px герой), палитра без дизеринга — см. docs/arcade-dota-sprites.md §7")
    p.add_argument("--outline", type=float, default=1.0, help="толщина контура Workbench в пикселях (только --pixel)")
    p.add_argument("--light", type=float, default=1.25, help="яркость студийного света Workbench (только --pixel): тёмным моделям (Shadow Fiend, Рошан) 1.4–1.8")
    p.add_argument("--autoexpose", type=float, default=0.16, help="только --pixel: если средняя яркость текстуры цвета ниже порога, гамма поднимает её до --expose-target (Shadow Fiend в Dota светится selfillum/spec, а его color-текстура почти чёрная); 0 — выключить")
    p.add_argument("--expose-target", type=float, default=0.4)
    p.add_argument("--style", default="", help="стиль арканы Dota (style1/style2): color-текстуры материалов подменяются одноимёнными из --style-dir; см. dota_style_textures.sh")
    p.add_argument("--style-dir", default="", help="папка с PNG стиля (рекурсивно), распакованными из vpk")
    return p.parse_args(argv)


def style_index(root):
    """PNG стиля из vpk по именам файлов: {имя без расширения в нижнем регистре: путь}."""
    idx = {}
    for dirpath, _dirs, files in os.walk(root):
        for f in files:
            if f.lower().endswith(".png"):
                idx[os.path.splitext(f)[0].lower()] = os.path.join(dirpath, f)
    return idx


def _color_prefix(name):
    """Токены имени текстуры до слова `color` включительно: хвост (psd/png + хэш) у стиля свой."""
    t = os.path.splitext(name)[0].lower().split("_")
    return t[: t.index("color") + 1] if "color" in t else None


def style_texture(idx, image_name, style):
    """Текстура стиля для базовой color-текстуры. Токен стиля Valve ставит в разные места:
    `drow_arcana_base_color` → `drow_arcana_base_style1_color` (суффиксом), а
    `juggernaut_arcana_body_color` → `juggernaut_arcana_v2_body_color` (в середине).
    Поэтому ищем имя, которое равно базовому со вставленным токеном стиля в любой позиции."""
    base = _color_prefix(image_name)
    if not base:
        return None
    want = {tuple(base[:i] + [style] + base[i:]) for i in range(len(base))}
    for key, path in idx.items():
        pref = _color_prefix(key)
        if pref and tuple(pref) in want:
            return path
    return None

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]

def pick_action(actions, key, strict=False):
    """Точное имя → иначе лучший по подстроке. Служебные клипы Source 2 не выкидываем жёстко, а штрафуем:
    у item-моделей аркан ВСЕ клипы идут с префиксом `@` («@arcana_run_anim», «@arc_run_haste»), и жёсткий
    фильтр обнулял кандидатов — выбор сваливался в «что угодно с подстрокой» и брал скольжение на скорости
    (владелец 2026-09-06: «аркана Drow не ходит, а скользит по полу»)."""
    key = key.lower()
    exact = [a for a in actions if a.name.lower() == key]
    if exact:
        return exact[0]
    # Совсем не про движение — эти в кандидаты не идут никогда.
    hard = ("portrait", "loadout", "lookframe", "_faces_dup", "_cc_20", "basher", "ward", "pact", "effigy", "channel", "debut")
    # Вариации той же анимации: годятся, но только если ничего лучше нет.
    soft = ("haste", "injured", "showoff", "_alt", "versus", "turns", "taunt", "spawn", "agg", "green", "copy", "slide", "gesture", "sidestep", "loop_end", "_end", "_to_", "stop", "start", "heavy", "rare", "custom")
    def score(a):
        n = a.name.lower()
        return (sum(1 for t in soft if t in n), n.startswith("@"), not n.startswith(key), len(n))
    cands = [a for a in actions if key in a.name.lower() and not any(h in a.name.lower() for h in hard)]
    if not cands and not strict:
        cands = [a for a in actions if key in a.name.lower()]
    if not cands and key == "cast":
        # Valve называет клипы каста по способности, а не «cast»: у Shadow Fiend это `nevermore_Requiem`
        # и `nevermore_Shadowraze_1`, у Naga — `siren_song`. Ряд `cast` нужен всем героям (рендерер
        # проигрывает его на событие каста), поэтому берём любой клип, который не из служебного набора.
        skip = ("bindpose", "idle", "run", "walk", "attack", "death", "loadout", "portrait", "turn", "spawn", "stun",
                "flail", "victory", "defeat", "taunt", "teleport", "capture", "cloth", "gesture", "look",
                "injured", "haste", "_alt", "rare", "effigy", "debut", "workshop", "_mm", "bp_", "loop",
                "sleep", "hover", "blend", "transition", "slide", "shape", "physics", "dropped", "_fx")
        alt = [a for a in actions if not any(t in a.name.lower() for t in skip)]
        alt.sort(key=lambda a: (a.name.lower().startswith("@"), len(a.name)))
        if alt:
            print(f"cast: клипа «cast» нет, взят {alt[0].name}")
            return alt[0]
    if not cands:
        return None
    cands.sort(key=score)
    return cands[0]

def setup_render(size, samples, pixel=False, outline=1.0, light=1.0):
    scene = bpy.context.scene
    engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
    if pixel:
        # Пиксель-арт (Dead Cells-подход: 3D → низкое разрешение без сглаживания): Workbench даёт плоскую заливку
        # текстурой, ровный студийный свет и чёрный контур по силуэту — то, что руками рисует пиксель-художник.
        scene.render.engine = "BLENDER_WORKBENCH"
        sh = scene.display.shading
        sh.light = "STUDIO"
        sh.color_type = "TEXTURE"
        sh.show_shadows = False
        sh.show_cavity = True
        sh.cavity_type = "SCREEN"
        sh.curvature_ridge_factor = 0.6
        sh.curvature_valley_factor = 1.2
        sh.show_object_outline = True
        sh.object_outline_color = (0.05, 0.04, 0.07)
        sh.show_specular_highlight = False
        try:
            sh.studiolight_intensity = light
        except Exception:
            pass
        try:
            scene.display.render_aa = "OFF"
            scene.display.viewport_aa = "OFF"
        except Exception:
            pass
        scene.render.filter_size = 0.0
        scene.render.line_thickness = max(0.5, outline)
        scene.view_settings.exposure = 0.25  # тёмные модели Dota на маленьком кадре «мылятся» в кашу — приподнимаем
    else:
        scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else ("BLENDER_EEVEE" if "BLENDER_EEVEE" in engines else "CYCLES")
    if scene.render.engine == "CYCLES":
        scene.cycles.samples = samples
    elif scene.render.engine != "BLENDER_WORKBENCH":
        try:
            scene.eevee.taa_render_samples = samples
        except Exception:
            pass
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    scene.display_settings.display_device = "sRGB"

class Rig:
    """Камера + свет на общем пивоте (орбита) и «фикс»-пустышка над моделью (поворот/сдвиг)."""
    def __init__(self, objs):
        scene = bpy.context.scene
        self.fix = bpy.data.objects.new("UpFix", None)
        scene.collection.objects.link(self.fix)
        for o in objs:
            if o.parent is None:
                o.parent = self.fix
        cam_data = bpy.data.cameras.new("SpriteCam")
        cam_data.type = "ORTHO"
        cam_data.clip_end = 10000
        self.cam = bpy.data.objects.new("SpriteCam", cam_data)
        scene.collection.objects.link(self.cam)
        scene.camera = self.cam
        key = bpy.data.lights.new("Key", "SUN"); key.energy = 3.5
        key_o = bpy.data.objects.new("Key", key); key_o.rotation_euler = (math.radians(50), 0, math.radians(35)); scene.collection.objects.link(key_o)
        fill = bpy.data.lights.new("Fill", "SUN"); fill.energy = 1.8
        fill_o = bpy.data.objects.new("Fill", fill); fill_o.rotation_euler = (math.radians(60), 0, math.radians(-120)); scene.collection.objects.link(fill_o)
        world = bpy.data.worlds.new("W"); scene.world = world
        world.use_nodes = True
        bg = world.node_tree.nodes.get("Background")
        if bg:
            bg.inputs[0].default_value = (0.35, 0.35, 0.4, 1)
            bg.inputs[1].default_value = 1.0
        self.pivot = bpy.data.objects.new("SpritePivot", None)
        scene.collection.objects.link(self.pivot)
        for o in (self.cam, key_o, fill_o):
            o.parent = self.pivot

    def place(self, pitch_deg, ortho, cz):
        pitch = math.radians(pitch_deg)
        dist = max(ortho, 1.0) * 4
        self.cam.data.ortho_scale = ortho
        self.cam.location = (0, -math.cos(pitch) * dist, cz + math.sin(pitch) * dist)
        self.cam.rotation_euler = (math.radians(90) - pitch, 0, 0)

    def orient(self, mode):
        self.fix.rotation_euler = (math.radians(90 if mode == "plus" else -90 if mode == "minus" else 0), 0, 0)
        bpy.context.view_layer.update()

    def yaw(self, deg):
        self.pivot.rotation_euler = (0, 0, -math.radians(deg))

def render_to(path):
    scene = bpy.context.scene
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)

def alpha_bounds(path):
    """Границы непрозрачных пикселей (px, снизу-вверх у bpy → переводим в обычные координаты сверху-вниз)."""
    import numpy as np
    img = bpy.data.images.load(path)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    bpy.data.images.remove(img)
    mask = px[:, :, 3] > 0.05
    if not mask.any():
        return None
    # Границы берём не по крайнему непрозрачному пикселю, а по 2% массы силуэта с каждого края:
    # тонкие отростки (цепь оружия Batrider, крюк Pudge в стойке, брошенный предмет) раздували габарит
    # и герой рисовался в разы мельче остальных. Тело такой обрезки не замечает.
    def span(counts):
        total = counts.sum()
        if total <= 0:
            return None
        cum = np.cumsum(counts)
        lo = int(np.searchsorted(cum, total * 0.02))
        hi = int(np.searchsorted(cum, total * 0.98))
        return max(0, lo), min(len(counts) - 1, hi)
    rspan = span(mask.sum(axis=1)); cspan = span(mask.sum(axis=0))
    if rspan is None or cspan is None:
        return None
    rows = np.array(rspan); cols = np.array(cspan)
    # bpy: строка 0 — низ картинки; переворачиваем в «сверху вниз».
    top = h - 1 - rows.max(); bottom = h - 1 - rows.min()
    return (cols.min(), cols.max(), top, bottom, w, h)

def probe(rig, tmp, tag, pitch, ortho, cz):
    """Снимок силуэта с заданной камерой → границы в ЕДИНИЦАХ модели относительно центра кадра."""
    scene = bpy.context.scene
    old = (scene.render.resolution_x, scene.render.resolution_y)
    scene.render.resolution_x = scene.render.resolution_y = 128
    rig.place(pitch, ortho, cz)
    path = os.path.join(tmp, f"probe_{tag}.png")
    render_to(path)
    scene.render.resolution_x, scene.render.resolution_y = old
    b = alpha_bounds(path)
    if not b:
        return None
    x0, x1, y0, y1, w, h = b
    u = ortho / w
    # Центр кадра = (0, cz) в плоскости камеры; ось X экрана = мировая X, ось Y экрана = вертикаль камеры.
    return {"xmin": (x0 - w / 2) * u, "xmax": (x1 + 1 - w / 2) * u, "vmax": cz + (h / 2 - y0) * u, "vmin": cz + (h / 2 - (y1 + 1)) * u}

def main():
    a = parse_args()
    reset_scene()
    objs = import_glb(os.path.abspath(a.glb))
    if not objs:
        raise SystemExit("import failed: no objects")
    main_arms = [o for o in objs if o.type == "ARMATURE"]
    def drop_junk(lst):
        # VRF кладёт в каждый glb служебную «Icosphere» без весов (маркер origin) — в кадре это шар у ног.
        keep = []
        for o in lst:
            if o.type == "MESH" and o.name.startswith("Icosphere") and not o.vertex_groups:
                bpy.data.objects.remove(o, do_unlink=True)
            else:
                keep.append(o)
        return keep
    objs = drop_junk(objs)
    base_meshes = [o for o in objs if o.type == "MESH"]
    # Части героя (в Dota штаны/маска/оружие — отдельные модели со своим скелетом). Пересаживать их меши
    # на скелет тела нельзя: у тела кости, к которым не привязан ни один вершинный вес (например sword_1),
    # экспортируются с вырожденной позой покоя, и меч уезжает от руки. Поэтому часть оставляет свой скелет
    # и веса, а каждая её кость копирует мировую трансформацию одноимённой кости тела (Copy Transforms):
    # деформация части = поза тела относительно её собственной корректной позы покоя.
    main_bones = {b.name.lower(): b.name for b in main_arms[0].data.bones} if main_arms else {}
    for part in [x for x in a.parts.split(",") if x.strip()]:
        pobjs = drop_junk(import_glb(os.path.abspath(part.strip())))
        part_arms = [o for o in pobjs if o.type == "ARMATURE"]
        if not part_arms or not main_arms:
            print(f"WARN: у части {os.path.basename(part)} нет скелета — экспортируй её с --gltf_export_animations, иначе она застынет в bind-позе")
            objs.extend(o for o in pobjs if o.type == "MESH")
            continue
        missing = []
        for pa in part_arms:
            for pb in pa.pose.bones:
                target = main_bones.get(pb.name.lower())
                if not target:
                    missing.append(pb.name)
                    continue
                con = pb.constraints.new("COPY_TRANSFORMS")
                con.target = main_arms[0]
                con.subtarget = target
                con.owner_space = "WORLD"
                con.target_space = "WORLD"
        if missing:
            print(f"WARN: у части {os.path.basename(part)} кости без пары в теле (пойдут за родителем): {missing[:6]}")
        objs.extend(pobjs)
        print("attached part:", os.path.basename(part), "bones", sum(len(pa.pose.bones) for pa in part_arms))
    if a.hide_base:
        # Скелет и анимации берём у героя, а показываем только надетые части (аркана целиком заменяет тело).
        for o in base_meshes:
            if o.name in bpy.data.objects:
                bpy.data.objects.remove(o, do_unlink=True)
        objs = [o for o in objs if o not in base_meshes]
        print(f"hide-base: убрано мешей тела {len(base_meshes)}")
    if a.pixel:
        # Workbench в режиме TEXTURE берёт АКТИВНЫЙ узел-картинку материала; у материалов Dota первым идёт
        # detailmask/normal (чёрный силуэт) — делаем активной текстуру цвета (*_color*).
        def base_color_image(tree):
            # Сначала по имени: `*_color*` без масок. У аркан (PA «Многоликий парадокс», демон Terrorblade)
            # ход по графу от Principled BSDF приводил к маске, и тело выходило серым без текстуры
            # (фидбэк владельца 2026-09-06) — а нужный `*_color*` в экспорте есть всегда.
            imgs_all = [n for n in tree.nodes if n.type == "TEX_IMAGE" and n.image]
            bad_tokens = ("mask", "normal", "_orm", "spec", "rough", "metal", "detail")
            by_name = [n for n in imgs_all if "_color" in n.image.name.lower() and not any(b in n.image.name.lower() for b in bad_tokens)]
            if by_name:
                return by_name[0]
            # Иначе идём от Principled BSDF по входу Base Color до узла-картинки (через mix/etc., глубина 4).
            bsdf = next((n for n in tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if bsdf and bsdf.inputs["Base Color"].links:
                frontier = [bsdf.inputs["Base Color"].links[0].from_node]
                for _ in range(4):
                    nxt = []
                    for n in frontier:
                        if n.type == "TEX_IMAGE" and n.image:
                            return n
                        for inp in n.inputs:
                            for l in inp.links:
                                nxt.append(l.from_node)
                    frontier = nxt
            imgs = [n for n in tree.nodes if n.type == "TEX_IMAGE" and n.image]
            bad = ("mask", "normal", "_orm", "spec", "rough", "metal", "detail")
            good = [n for n in imgs if "_color" in n.image.name.lower() and not any(b in n.image.name.lower() for b in bad)]
            return (good or [n for n in imgs if not any(b in n.image.name.lower() for b in bad)] or imgs or [None])[0]
        def auto_expose(img, threshold, target):
            # Workbench берёт пиксели картинки как есть (граф узлов не считается), поэтому светлим сами пиксели:
            # гамма по среднему непрозрачных пикселей, чёрное остаётся чёрным, а тёмно-красная кожа SF читается.
            import numpy as np
            w, h = img.size
            if w == 0 or h == 0:
                return
            px = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)
            rgb = px[:, :3]
            lum = rgb @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
            mask = px[:, 3] > 0.5
            vis = lum[mask] if mask.any() else lum
            mean = float(vis.mean())
            if mean <= 0.0 or mean >= threshold:
                return
            # Светлим только РАВНОМЕРНО тёмные текстуры. У арканы Phantom Assassin средняя яркость тоже
            # низкая (0.13), но это белая филигрань по чёрному: гамма вытягивала белое, и герой выходил
            # блёклым пятном (фидбэк владельца 2026-09-06). Разделяет их верхний процентиль: у арканы
            # p99 = 0.85 (светлые детали есть), у Shadow Fiend — 0.30 (текстура тёмная целиком).
            p99 = float(np.percentile(vis, 99))
            if p99 >= 0.6:
                print(f"autoexpose: {img.name} пропущен — светлые детали есть (p99 {p99:.2f})")
                return
            gamma = math.log(target) / math.log(mean)
            px[:, :3] = np.clip(rgb, 0.0, 1.0) ** gamma
            img.pixels.foreach_set(px.reshape(-1))
            img.update()
            try:
                img.gl_free()
            except Exception:
                pass
            print(f"autoexpose: {img.name} mean {mean:.3f} → gamma {gamma:.2f}")
        styles = style_index(a.style_dir) if a.style and a.style_dir else {}
        swapped = 0
        exposed = set()
        for m in bpy.data.materials:
            if not m.use_nodes:
                continue
            node = base_color_image(m.node_tree)
            if node and styles:
                # Стиль арканы — та же модель с другим набором текстур (Dota хранит их отдельным
                # материалом `arcana_style1`, в glb приезжает только базовый).
                alt = style_texture(styles, node.image.name, a.style)
                if alt:
                    node.image = bpy.data.images.load(alt, check_existing=True)
                    swapped += 1
            if node:
                m.node_tree.nodes.active = node
                if a.autoexpose > 0 and node.image.name not in exposed:
                    exposed.add(node.image.name)
                    auto_expose(node.image, a.autoexpose, a.expose_target)
            else:
                print(f"WARN: у материала {m.name} нет текстуры цвета — Workbench нарисует его серым")
        if a.style:
            print(f"style {a.style}: подменено текстур {swapped}" if swapped else f"WARN: стиль {a.style} не нашёл ни одной текстуры в {a.style_dir}")
    setup_render(a.frame, a.samples, a.pixel, a.outline, a.light)
    rig = Rig(objs)
    armatures = [o for o in objs if o.type == "ARMATURE"]
    actions = list(bpy.data.actions)
    anim_map = []
    for pair in a.anims.split(","):
        if "=" not in pair:
            continue
        ours, theirs = [s.strip() for s in pair.split("=", 1)]
        # «attack=attack@0.15-0.75» — брать только часть клипа (доли длительности): у клипов Dota длинные
        # замах и возврат, а в игре урон наносится в начале окна анимации — оставляем сам удар.
        span = (0.0, 1.0)
        if "@" in theirs:
            theirs, rng = theirs.split("@", 1)
            lo, hi = rng.split("-", 1)
            span = (max(0.0, float(lo)), min(1.0, float(hi)))
        # Синонимы Source 2: смерть у части моделей — «die»/«dieAlt», бег — «run» либо «walk».
        alts = {"death": ["die", "dieAlt"], "die": ["death"], "run": ["walk"], "walk": ["run"]}
        # «spin=whirling|chakram» — свои варианты имени клипа через `|`: у Valve вращение называется
        # по способности (whirling_death, tricks_of_the_trade, rolling_thunder), общего слова нет.
        wanted = [t for t in theirs.split("|") if t]
        act = None
        if armatures:
            # Сначала строгий проход по всем синонимам (без служебных клипов), потом мягкий: иначе «death_pact»
            # Clinkz перебивает его настоящий «die», потому что подстрока «death» нашлась раньше синонима.
            keys = wanted + [k for w in wanted for k in alts.get(w, [])]
            for strict in (True, False):
                for key in keys:
                    act = pick_action(actions, key, strict)
                    if act is not None:
                        break
                if act is not None:
                    break
        anim_map.append((ours, act, span))
    found = [t for t in anim_map if t[1] is not None]
    anim_map = found if found else [("idle", None, (0.0, 1.0))]
    print("actions in file:", [a_.name for a_ in actions], "→ rendering:", [(o, a_.name if a_ else None, sp) for o, a_, sp in anim_map])
    scene = bpy.context.scene
    src_fps = scene.render.fps or 24
    tmp = os.path.join(bpy.app.tempdir, "aegis_sprites")
    os.makedirs(tmp, exist_ok=True)

    def use_action(act):
        for arm in armatures:
            if arm.animation_data is None:
                arm.animation_data_create()
            arm.animation_data.action = act
        scene.frame_set(int(act.frame_range[0]) if act else scene.frame_current)
        bpy.context.view_layer.update()

    # --- Калибровка по силуэту: ориентация, центр, охват ---
    # Кадрируем по САМОЙ КОМПАКТНОЙ из поз «стойка» и «ходьба», а не по первому клипу списка: у Meepo
    # клип каста уводит модель далеко от начала координат, а у арканы Pudge разлетается стойка — в обоих
    # случаях охват считался по кривой позе и герой рисовался полоской в углу кадра.
    frame_acts = [act for ours, act, _ in anim_map if act is not None and ours in ("idle", "walk")]
    if not frame_acts:
        frame_acts = [act for _, act, _ in anim_map if act is not None][:1]
    first_act = frame_acts[0] if frame_acts else None
    if first_act is not None:
        use_action(first_act)
    wide = 40.0
    mode = a.up
    if mode == "auto":
        best, best_ratio = "none", -1.0
        for cand in ("none", "plus", "minus"):
            rig.orient(cand)
            b = probe(rig, tmp, f"orient_{cand}", 0.0, wide, 0.0)
            if not b:
                continue
            ratio = (b["vmax"] - b["vmin"]) / max(1e-6, b["xmax"] - b["xmin"])
            print(f"probe {cand}: height/width = {ratio:.2f}")
            if ratio > best_ratio:
                best, best_ratio = cand, ratio
        mode = best
    rig.orient(mode)
    def measure(act, tag):
        if act is not None:
            use_action(act)
        f = probe(rig, tmp, f"front_{tag}", 0.0, wide, 0.0)   # X и вертикаль
        t = probe(rig, tmp, f"top_{tag}", 90.0, wide, 0.0)     # X и глубина
        return f, t
    best = None
    for i, act in enumerate(frame_acts or [None]):
        f, t = measure(act, str(i))
        if not f:
            continue
        span = (f["vmax"] - f["vmin"]) * (f["xmax"] - f["xmin"])
        if best is None or span < best[0]:
            best = (span, f, t, act)
    if best is not None:
        _, front, top, chosen = best
        print(f"кадр по клипу: {chosen.name if chosen else '—'}")
        if chosen is not None:
            use_action(chosen)
    else:
        front, top = None, None
    if front:
        cx = (front["xmin"] + front["xmax"]) / 2
        zmin, zmax = front["vmin"], front["vmax"]
        rig.fix.location.x -= cx
        rig.fix.location.z -= zmin
        height = zmax - zmin
        width = front["xmax"] - front["xmin"]
    else:
        height, width = 2.0, 1.0
    depth = (top["vmax"] - top["vmin"]) if top else width
    if top:
        # Центр по глубине: сверху экранная вертикаль соответствует мировой Y (камера смотрит вниз, «вверх экрана» = +Y).
        cy = (top["vmin"] + top["vmax"]) / 2
        rig.fix.location.y -= cy
    bpy.context.view_layer.update()
    base_loc = rig.fix.location.copy()
    def root_world():
        # Мировая позиция корневой кости (без потомков) — источник root motion в анимациях.
        for arm in armatures:
            for pb in arm.pose.bones:
                if pb.parent is None:
                    return arm.matrix_world @ pb.head
        return None
    root0 = root_world()
    extent = a.ortho if a.ortho > 0 else max(height, width, depth) * a.margin
    print(f"orientation: {mode}; height {height:.2f}, width {width:.2f}, depth {depth:.2f} → ortho {extent:.2f}")
    rig.place(a.pitch, extent, height / 2)

    # --- Рендер листа ---
    fps = a.fps
    rows = []  # (ours, dir, [frame paths])
    first_row = {}
    for ours, act, span in anim_map:
        # Опору для гашения root motion берём У КАЖДОГО клипа свою: общая опора от клипа кадрирования
        # сдвигала другие клипы (у Monkey King ряд idle уезжал за кадр и оставалось 66 пикселей).
        clip_root0 = root0
        if act is not None:
            use_action(act)
            scene.frame_set(int(act.frame_range[0]))
            bpy.context.view_layer.update()
            rig.fix.location = base_loc
            bpy.context.view_layer.update()
            clip_root0 = root_world() or root0
            f0, f1 = act.frame_range
            f0, f1 = f0 + (f1 - f0) * span[0], f0 + (f1 - f0) * span[1]
            seconds = max(0.05, (f1 - f0) / src_fps)
            n = max(2, min(a.max_frames, round(seconds * fps)))
            sample_frames = [f0 + (f1 - f0) * i / n for i in range(n)]
        else:
            n = 1
            sample_frames = [scene.frame_current]
        first_row[ours] = len(rows)
        for d in range(a.dirs):
            rig.yaw(d * 360.0 / a.dirs + a.yaw_offset)
            paths = []
            for i, fr in enumerate(sample_frames):
                scene.frame_set(int(math.floor(fr)), subframe=fr - math.floor(fr))
                if not a.no_root_lock and clip_root0 is not None:
                    # Гасим горизонтальное смещение корня (бег «на месте»); вертикаль оставляем (прыжки).
                    rig.fix.location = base_loc
                    bpy.context.view_layer.update()
                    cur = root_world()
                    if cur is not None:
                        dx, dy = cur.x - clip_root0.x, cur.y - clip_root0.y
                        # Ограничиваем компенсацию половиной охвата камеры: у части моделей (Meepo,
                        # персона Dragon Knight) корневая кость несёт огромное смещение, и «отмотка»
                        # root motion уводила всю сборку за кадр — лист выходил пустым или обрезанным.
                        if abs(dx) < extent * 0.5 and abs(dy) < extent * 0.5:
                            rig.fix.location = base_loc - __import__("mathutils").Vector((dx, dy, 0.0))
                            bpy.context.view_layer.update()
                        if os.environ.get("SPRITE_DEBUG"):
                            print(f"rootlock {ours} d{d} f{i}: root0 {tuple(round(v,2) for v in clip_root0)} cur {tuple(round(v,2) for v in cur)} fix {tuple(round(v,2) for v in rig.fix.location)}")
                path = os.path.join(tmp, f"{a.name}_{ours}_{d}_{i:02d}.png")
                render_to(path)
                paths.append(path)
            rows.append((ours, d, paths))
    # --- Сборка листа ---
    import numpy as np
    cols = max(len(paths) for _, _, paths in rows)
    W, H = a.frame * cols, a.frame * len(rows)
    sheet = bpy.data.images.new("sheet", W, H, alpha=True)
    buf = np.zeros((H, W, 4), dtype=np.float32)
    meta_anims = {}
    for r, (ours, d, paths) in enumerate(rows):
        for cidx, path in enumerate(paths):
            img = bpy.data.images.load(path)
            px = np.array(img.pixels[:], dtype=np.float32).reshape(img.size[1], img.size[0], 4)
            y0 = H - (r + 1) * a.frame
            buf[y0:y0 + a.frame, cidx * a.frame:(cidx + 1) * a.frame, :] = px
            bpy.data.images.remove(img)
        entry = meta_anims.setdefault(ours, {"row": first_row[ours], "frames": len(paths)})
        entry["frames"] = max(entry["frames"], len(paths))
    sheet.pixels = buf.ravel().tolist()
    out_dir = os.path.abspath(a.out)
    os.makedirs(out_dir, exist_ok=True)
    png = os.path.join(out_dir, f"{a.name}.png")
    sheet.filepath_raw = png
    sheet.file_format = "PNG"
    sheet.save()
    # Якорь ног: модель сдвинута так, что её низ лежит на z=0 в центре кадра по X, значит точка касания
    # земли — мировой (0,0,0), а её доля кадра при ортокамере под углом = 0.5 + (высота/2)·sin(pitch)/охват.
    # Проверено проекцией через камеру (bpy_extras.world_to_camera_view) на Keeper of the Light и
    # Juggernaut: значения совпадают до третьего знака, так что «конь висит над кольцом» — не про якорь,
    # а про то, что охват и низ меряются пробным рендером в позе покоя, а лист рисуется анимацией.
    pitch = math.radians(a.pitch)
    feet_from_center = (height / 2) * math.sin(pitch) / extent  # доля кадра
    anchor_y = float(min(0.98, max(0.55, 0.5 + feet_from_center)))
    meta = {
        "name": a.name, "frame": a.frame, "dirs": a.dirs, "fps": fps, "world": a.world,
        "order": "0 = вниз, далее против часовой на экране (вниз, вправо, вверх, влево)",
        "anchor": {"x": 0.5, "y": round(anchor_y, 3)},
        "anims": {k: {"row": v["row"], "frames": v["frames"]} for k, v in meta_anims.items()},
        "source": os.path.basename(a.glb), "orientation": mode, "pitch": a.pitch, "pixel": bool(a.pixel),
    }
    with open(os.path.join(out_dir, f"{a.name}.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print(f"sheet {png} {W}x{H}; anims {meta['anims']}; anchor {meta['anchor']}")

main()
