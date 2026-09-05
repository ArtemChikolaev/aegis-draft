# Рендер спрайт-листов Аркады из моделей Dota 2 (BACKLOG T13.13, путь А).
#
# Вход — glTF/GLB, экспортированный Source 2 Viewer CLI (с анимациями и материалами).
# Выход — <out>/<name>.png (лист: строки = анимация × направление, колонки = кадры) и
# <out>/<name>.json (мета: размер кадра, число направлений, какие строки у какой анимации,
# якорь ног, желаемый размер в игровых пикселях). Игра читает мету и ничего о Blender не знает.
#
# Запуск (Blender 4.x, без GUI):
#   blender -b -P render_dota_sprites.py -- --glb juggernaut.glb --name juggernaut \
#       --out ../../public/art/sprites/dota --dirs 8 --frame 128 --fps 12 --world 84 \
#       --anims "walk=run,idle=idle,attack=attack,death=death" --pitch 58
#
# --anims: наши состояния = подстроки имён экшенов модели (регистр не важен; берётся самое
# короткое подходящее имя, чтобы `run` не превратился в `run_injured`). Нет экшена — состояние
# пропускается (игра подставит walk/idle). Статичная модель без арматуры рендерится одной строкой idle.
# Направление 0 = лицом к камере (вниз по экрану), дальше против часовой на экране
# (вниз → вправо → вверх → влево): корень вращается на +Z, камера смотрит с −Y.
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
    p.add_argument("--pitch", type=float, default=58.0, help="наклон камеры, градусов от горизонта (90 = строго сверху)")
    p.add_argument("--yaw-offset", type=float, default=0.0, help="поправка, если модель смотрит не по -Y")
    p.add_argument("--margin", type=float, default=1.15)
    p.add_argument("--samples", type=int, default=16)
    return p.parse_args(argv)

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]

def bbox_of(objs):
    xs, ys, zs = [], [], []
    dg = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        if o.type != "MESH":
            continue
        ev = o.evaluated_get(dg)
        for v in ev.bound_box:
            w = ev.matrix_world @ __import__("mathutils").Vector(v)
            xs.append(w.x); ys.append(w.y); zs.append(w.z)
    if not xs:
        return (-1, 1, -1, 1, 0, 2)
    return (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))

def pick_action(actions, key):
    key = key.lower()
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

def setup_camera_and_lights(bb, pitch_deg, margin):
    scene = bpy.context.scene
    x0, x1, y0, y1, z0, z1 = bb
    height = max(z1 - z0, 0.01)
    width = max(x1 - x0, y1 - y0, 0.01)
    extent = max(height, width) * margin
    cam_data = bpy.data.cameras.new("SpriteCam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = extent
    cam_data.clip_end = 1000
    cam = bpy.data.objects.new("SpriteCam", cam_data)
    scene.collection.objects.link(cam)
    pitch = math.radians(pitch_deg)
    dist = extent * 4
    cz = (z0 + z1) / 2
    cam.location = (0, -math.cos(pitch) * dist, cz + math.sin(pitch) * dist)
    cam.rotation_euler = (math.radians(90) - pitch, 0, 0)
    scene.camera = cam
    key = bpy.data.lights.new("Key", "SUN"); key.energy = 3.0
    key_o = bpy.data.objects.new("Key", key); key_o.rotation_euler = (math.radians(50), 0, math.radians(35)); scene.collection.objects.link(key_o)
    fill = bpy.data.lights.new("Fill", "SUN"); fill.energy = 1.2
    fill_o = bpy.data.objects.new("Fill", fill); fill_o.rotation_euler = (math.radians(60), 0, math.radians(-120)); scene.collection.objects.link(fill_o)
    # Направления получаем ОРБИТОЙ камеры и света вокруг модели (а не вращением иерархии модели —
    # у импортированных glTF бывают повороты на арматуре, и вращение корня их складывает непредсказуемо).
    pivot = bpy.data.objects.new("SpritePivot", None)
    scene.collection.objects.link(pivot)
    for o in (cam, key_o, fill_o):
        o.parent = pivot
    setup_camera_and_lights.pivot = pivot
    world = bpy.data.worlds.new("W"); scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.35, 0.35, 0.4, 1)
        bg.inputs[1].default_value = 0.6
    return height

def main():
    a = parse_args()
    reset_scene()
    objs = import_glb(os.path.abspath(a.glb))
    if not objs:
        raise SystemExit("import failed: no objects")
    setup_render(a.frame, a.samples)
    bb = bbox_of(objs)
    setup_camera_and_lights(bb, a.pitch, a.margin)
    pivot = setup_camera_and_lights.pivot
    armatures = [o for o in objs if o.type == "ARMATURE"]
    actions = list(bpy.data.actions)
    anim_map = []
    for pair in a.anims.split(","):
        if "=" not in pair:
            continue
        ours, theirs = [s.strip() for s in pair.split("=", 1)]
        act = pick_action(actions, theirs) if armatures else None
        anim_map.append((ours, act))
    # Состояния без экшена не рендерим (игра сама падает на walk/idle) — кроме случая, когда экшенов нет вовсе.
    found = [(o, a_) for o, a_ in anim_map if a_ is not None]
    anim_map = found if found else [("idle", None)]
    print("actions in file:", [a_.name for a_ in actions], "→ rendering:", [o for o, _ in anim_map])
    scene = bpy.context.scene
    src_fps = scene.render.fps or 24  # частота, с которой импортёр glTF разложил анимации по кадрам
    fps = a.fps
    tmp = os.path.join(bpy.app.tempdir, "aegis_sprites")
    os.makedirs(tmp, exist_ok=True)
    rows = []  # (ours, dir, [frame paths])
    first_row = {}
    for ours, act in anim_map:
        if act is not None:
            for arm in armatures:
                if arm.animation_data is None:
                    arm.animation_data_create()
                arm.animation_data.action = act
            f0, f1 = act.frame_range
            seconds = max(0.05, (f1 - f0) / src_fps)
            n = max(2, min(a.max_frames, round(seconds * fps)))
            sample_frames = [f0 + (f1 - f0) * i / n for i in range(n)]
        else:
            n = 1
            sample_frames = [scene.frame_current]
        first_row[ours] = len(rows)
        for d in range(a.dirs):
            # Камера уходит по часовой (−Z) → модель на экране поворачивается против часовой: вниз, вправо, вверх, влево.
            pivot.rotation_euler = (0, 0, -math.radians(d * 360.0 / a.dirs + a.yaw_offset))
            paths = []
            for i, fr in enumerate(sample_frames):
                scene.frame_set(int(math.floor(fr)), subframe=fr - math.floor(fr))
                path = os.path.join(tmp, f"{a.name}_{ours}_{d}_{i:02d}.png")
                scene.render.filepath = path
                bpy.ops.render.render(write_still=True)
                paths.append(path)
            rows.append((ours, d, paths))
    # Сборка листа.
    cols = max(len(paths) for _, _, paths in rows)
    W, H = a.frame * cols, a.frame * len(rows)
    sheet = bpy.data.images.new("sheet", W, H, alpha=True)
    import numpy as np
    buf = np.zeros((H, W, 4), dtype=np.float32)
    meta_anims = {}
    for r, (ours, d, paths) in enumerate(rows):
        for cidx, path in enumerate(paths):
            img = bpy.data.images.load(path)
            px = np.array(img.pixels[:], dtype=np.float32).reshape(img.size[1], img.size[0], 4)
            # bpy хранит строки снизу вверх; лист собираем сверху вниз.
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
    meta = {
        "name": a.name, "frame": a.frame, "dirs": a.dirs, "fps": fps, "world": a.world,
        "order": "0 = вниз, далее против часовой на экране (вниз, вправо, вверх, влево)", "anchor": {"x": 0.5, "y": 0.92},
        "anims": {k: {"row": v["row"], "frames": v["frames"]} for k, v in meta_anims.items()},
        "source": os.path.basename(a.glb),
    }
    with open(os.path.join(out_dir, f"{a.name}.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print(f"sheet {png} {W}x{H}; anims {meta['anims']}")

main()
