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
    p.add_argument("--parts", default="", help="доп. glb через запятую (штаны/маска/оружие героя Dota): их меши пришиваются к скелету основной модели по именам костей")
    p.add_argument("--no-root-lock", action="store_true", help="не гасить смещение корневой кости (root motion) в анимациях")
    p.add_argument("--yaw-offset", type=float, default=0.0, help="поворот направления 0 (модели Source 2 из VRF уже смотрят в камеру)")
    p.add_argument("--up", default="none", help="none — модели Source 2 из VRF стоят верно (стандарт); plus / minus — ±90° вокруг X; auto — по пробным рендерам (ненадёжно для сгорбленных)")
    p.add_argument("--margin", type=float, default=1.12)
    p.add_argument("--samples", type=int, default=16)
    p.add_argument("--ortho", type=float, default=0.0, help="принудительный охват камеры в единицах модели (0 = по силуэту)")
    return p.parse_args(argv)

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]

def pick_action(actions, key):
    key = key.lower()
    exact = [a for a in actions if a.name.lower() == key]
    if exact:
        return exact[0]
    candidates = [a for a in actions if key in a.name.lower()]
    if not candidates:
        return None
    candidates.sort(key=lambda a: len(a.name))
    return candidates[0]

def setup_render(size, samples):
    scene = bpy.context.scene
    engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else ("BLENDER_EEVEE" if "BLENDER_EEVEE" in engines else "CYCLES")
    if scene.render.engine == "CYCLES":
        scene.cycles.samples = samples
    else:
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
    rows = np.where(mask.any(axis=1))[0]; cols = np.where(mask.any(axis=0))[0]
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
    # Части героя (в Dota штаны/маска/оружие — отдельные модели со скелетом-копией): берём их меши и
    # переключаем модификатор Armature на скелет основной модели; кости совпадают по именам.
    for part in [x for x in a.parts.split(",") if x.strip()]:
        pobjs = import_glb(os.path.abspath(part.strip()))
        part_arms = [o for o in pobjs if o.type == "ARMATURE"]
        for o in pobjs:
            if o.type != "MESH":
                continue
            if main_arms:
                o.parent = main_arms[0]
                o.matrix_parent_inverse = main_arms[0].matrix_world.inverted()
                for mod in o.modifiers:
                    if mod.type == "ARMATURE":
                        mod.object = main_arms[0]
                if not any(m.type == "ARMATURE" for m in o.modifiers):
                    o.modifiers.new("Armature", "ARMATURE").object = main_arms[0]
            objs.append(o)
        for pa in part_arms:
            bpy.data.objects.remove(pa, do_unlink=True)
        print("attached part:", os.path.basename(part))
    setup_render(a.frame, a.samples)
    rig = Rig(objs)
    armatures = [o for o in objs if o.type == "ARMATURE"]
    actions = list(bpy.data.actions)
    anim_map = []
    for pair in a.anims.split(","):
        if "=" not in pair:
            continue
        ours, theirs = [s.strip() for s in pair.split("=", 1)]
        act = pick_action(actions, theirs) if armatures else None
        anim_map.append((ours, act))
    found = [(o, a_) for o, a_ in anim_map if a_ is not None]
    anim_map = found if found else [("idle", None)]
    print("actions in file:", [a_.name for a_ in actions], "→ rendering:", [(o, a_.name if a_ else None) for o, a_ in anim_map])
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
    first_act = next((act for _, act in anim_map if act is not None), None)
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
    front = probe(rig, tmp, "front", 0.0, wide, 0.0)   # X и вертикаль
    top = probe(rig, tmp, "top", 90.0, wide, 0.0)       # X и глубина (экранная вертикаль сверху = −Y мира... знак нам не важен)
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
    for ours, act in anim_map:
        if act is not None:
            use_action(act)
            f0, f1 = act.frame_range
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
                if not a.no_root_lock and root0 is not None:
                    # Гасим горизонтальное смещение корня (бег «на месте»); вертикаль оставляем (прыжки).
                    rig.fix.location = base_loc
                    bpy.context.view_layer.update()
                    cur = root_world()
                    if cur is not None:
                        rig.fix.location = base_loc - __import__("mathutils").Vector((cur.x - root0.x, cur.y - root0.y, 0.0))
                        bpy.context.view_layer.update()
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
    # Якорь ног: модель стоит на z=0 в центре кадра по X; при ортокамере под углом ноги смещены вниз от центра.
    pitch = math.radians(a.pitch)
    feet_from_center = (height / 2) * math.sin(pitch) / extent  # доля кадра
    anchor_y = float(min(0.98, max(0.55, 0.5 + feet_from_center)))
    meta = {
        "name": a.name, "frame": a.frame, "dirs": a.dirs, "fps": fps, "world": a.world,
        "order": "0 = вниз, далее против часовой на экране (вниз, вправо, вверх, влево)",
        "anchor": {"x": 0.5, "y": round(anchor_y, 3)},
        "anims": {k: {"row": v["row"], "frames": v["frames"]} for k, v in meta_anims.items()},
        "source": os.path.basename(a.glb), "orientation": mode, "pitch": a.pitch,
    }
    with open(os.path.join(out_dir, f"{a.name}.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print(f"sheet {png} {W}x{H}; anims {meta['anims']}; anchor {meta['anchor']}")

main()
