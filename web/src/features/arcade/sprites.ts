// Спрайты Аркады (T13.13 срез 2, решение владельца 2026-09-06: Kenney/LPC как временный слой).
// LPC-персонажи — слоёные листы 64×64: ряды = направления (вверх, влево, вниз, вправо), колонки =
// кадры; тело + одежда + оружие рисуются по порядку README (BEHIND … WEAPON). Композит на вид
// собирается один раз в offscreen-канвас (с оттенком для «расы»), дальше — блиттинг кадров.
// Монстры LPC — 3 кадра × 4 направления. Пока лист не загружен, рендер падает на риги (rig.ts).
// Лицензии: CC-BY-SA 3.0 / GPL 3.0 / OGA-BY 3.0 — авторы в public/art/sprites/lpc/ATTRIBUTION.md
// и строка атрибуции на экране режима.
export type Dir = 0 | 1 | 2 | 3; // up, left, down, right — порядок рядов LPC
export type CharAnim = "walk" | "slash" | "thrust" | "bow" | "spellcast" | "hurt";

const ROOT = `${import.meta.env.BASE_URL}art/sprites/`;
const BASE = `${ROOT}lpc/`;
const FOLDER: Record<CharAnim, string> = { walk: "walkcycle", slash: "slash", thrust: "thrust", bow: "bow", spellcast: "spellcast", hurt: "hurt" };
/** Кадров в ряду по анимации (hurt — один ряд из 6). */
export const FRAMES: Record<CharAnim, number> = { walk: 9, slash: 6, thrust: 8, bow: 13, spellcast: 7, hurt: 6 };

export interface CharSpec {
  body: "male" | "skeleton";
  /** Слои одежды/брони в порядке снизу вверх (FEET → LEGS → TORSO → HEAD). */
  layers: string[];
  weapon: "dagger" | "spear" | "staff" | "bow" | null;
  /** Оттенок брони/тела (только слои, не тело — если tintBody не задан). */
  tint?: string;
  tintBody?: boolean;
  scale: number;
}

export interface MonsterSpec {
  file: string;
  fw: number;
  fh: number;
  scale: number;
}

export const MONSTER_SPECS: Record<string, MonsterSpec> = {
  bat: { file: "bat", fw: 32, fh: 32, scale: 1.8 },
  slime: { file: "slime", fw: 32, fh: 32, scale: 1.4 },
  snake: { file: "snake", fw: 32, fh: 32, scale: 1.3 },
  bee: { file: "bee", fw: 32, fh: 32, scale: 1.3 },
  eyeball: { file: "eyeball", fw: 32, fh: 38, scale: 1.5 },
  ghost: { file: "ghost", fw: 40, fh: 46, scale: 1.5 },
  pumpking: { file: "pumpking", fw: 46, fh: 46, scale: 1.5 },
};

/** Анимация удара по оружию. */
export function attackAnim(spec: CharSpec): CharAnim {
  return spec.weapon === "bow" ? "bow" : spec.weapon === "spear" || spec.weapon === "staff" ? "thrust" : "slash";
}

/** Направление по вектору. */
export function dirOf(dx: number, dy: number): Dir {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 3 : 1;
  return dy >= 0 ? 2 : 0;
}

const images = new Map<string, HTMLImageElement | null>();
const composites = new Map<string, HTMLCanvasElement | null>();
let version = 0;

function img(path: string, root = BASE): HTMLImageElement | null | undefined {
  if (images.has(path)) return images.get(path);
  const el = new Image();
  el.onload = () => { version++; };
  el.onerror = () => { images.set(path, null); version++; };
  el.src = root + path;
  images.set(path, el);
  return el;
}

function ready(el: HTMLImageElement | null | undefined): el is HTMLImageElement {
  return !!el && el.complete && el.naturalWidth > 0;
}

/** Растёт при каждой загрузке — рендер сбрасывает свои кэши (чанки ландшафта). */
export function spriteVersion(): number {
  return version;
}

/** Композит персонажа для анимации; null — ещё грузится (или чего-то нет). */
export function charSheet(key: string, spec: CharSpec, anim: CharAnim): HTMLCanvasElement | null {
  const ck = `${key}:${anim}`;
  const cached = composites.get(ck);
  if (cached !== undefined) return cached;
  const folder = FOLDER[anim];
  const parts: string[] = [`char/${folder}/BODY_${spec.body}.png`, ...spec.layers.map((l) => `char/${folder}/${l}.png`)];
  if (spec.weapon === "bow" && anim === "bow") parts.unshift(`char/bow/BEHIND_quiver.png`);
  if (spec.weapon && ((spec.weapon === "dagger" && anim === "slash") || ((spec.weapon === "spear" || spec.weapon === "staff") && anim === "thrust") || (spec.weapon === "bow" && anim === "bow"))) parts.push(`char/${folder}/WEAPON_${spec.weapon}.png`);
  const els = parts.map((p) => img(p));
  // Тело обязательно; слой одежды, которого нет для этой анимации, просто пропускаем.
  if (!ready(els[parts[0].includes("BEHIND") ? 1 : 0])) return null;
  if (els.some((e) => e === undefined || (e !== null && !e.complete))) return null;
  const body = els.find((e, i) => ready(e) && parts[i].includes("BODY_"))!;
  const canvas = document.createElement("canvas");
  canvas.width = body.naturalWidth; canvas.height = body.naturalHeight;
  const c = canvas.getContext("2d")!;
  const armor = document.createElement("canvas");
  armor.width = canvas.width; armor.height = canvas.height;
  const ac = armor.getContext("2d")!;
  els.forEach((e, i) => {
    if (!ready(e)) return;
    const isBody = parts[i].includes("BODY_");
    if (isBody || !spec.tint || spec.tintBody) c.drawImage(e, 0, 0);
    else ac.drawImage(e, 0, 0);
  });
  if (spec.tint) {
    const target = spec.tintBody ? c : ac;
    target.globalCompositeOperation = "source-atop";
    target.globalAlpha = 0.55;
    target.fillStyle = spec.tint;
    target.fillRect(0, 0, canvas.width, canvas.height);
    target.globalAlpha = 1;
    target.globalCompositeOperation = "source-over";
  }
  if (!spec.tintBody) c.drawImage(armor, 0, 0);
  composites.set(ck, canvas);
  return canvas;
}

export function monsterSheet(name: string): HTMLImageElement | null {
  const spec = MONSTER_SPECS[name];
  if (!spec) return null;
  const el = img(`monsters/${spec.file}.png`);
  return ready(el) ? el : null;
}

export function tileImage(name: string): HTMLImageElement | null {
  const el = img(`tiles/${name}.png`);
  return ready(el) ? el : null;
}

/** Нарисовать кадр персонажа центром ног в (x, y). `frame` — колонка, `dir` — ряд. */
export function drawCharFrame(c: CanvasRenderingContext2D, sheet: HTMLCanvasElement, frame: number, dir: Dir, x: number, y: number, scale: number, alpha = 1): void {
  const fw = 64, fh = 64;
  const cols = Math.floor(sheet.width / fw);
  const f = Math.max(0, Math.min(cols - 1, frame));
  const row = sheet.height >= fh * 4 ? dir : 0;
  const w = fw * scale, h = fh * scale;
  c.globalAlpha = alpha;
  c.drawImage(sheet, f * fw, row * fh, fw, fh, x - w / 2, y - h + 8 * scale, w, h);
  c.globalAlpha = 1;
}

export function drawMonsterFrame(c: CanvasRenderingContext2D, name: string, frame: number, dir: Dir, x: number, y: number, alpha = 1): boolean {
  const spec = MONSTER_SPECS[name];
  const sheet = monsterSheet(name);
  if (!spec || !sheet) return false;
  const f = frame % 3;
  const w = spec.fw * spec.scale, h = spec.fh * spec.scale;
  c.globalAlpha = alpha;
  c.drawImage(sheet, f * spec.fw, dir * spec.fh, spec.fw, spec.fh, x - w / 2, y - h + 6 * spec.scale, w, h);
  c.globalAlpha = 1;
  return true;
}

/** Внешний вид врагов: LPC-персонаж, монстр или «rig» (нет подходящего спрайта — кентавр, Рошан). */
export type EnemyLook = { kind: "char"; spec: CharSpec } | { kind: "monster"; name: string } | { kind: "rig" };

export function enemyLook(kindId: string): EnemyLook {
  switch (kindId) {
    case "kobold": return { kind: "char", spec: { body: "skeleton", layers: [], weapon: "dagger", tint: "#c9a15a", tintBody: true, scale: 0.8 } };
    case "kobold_foreman": return { kind: "char", spec: { body: "skeleton", layers: ["HEAD_chain_armor_helmet"], weapon: "spear", tint: "#c9a15a", tintBody: true, scale: 0.95 } };
    case "hill_troll": return { kind: "char", spec: { body: "male", layers: ["LEGS_pants_greenish", "TORSO_leather_armor_torso"], weapon: "dagger", tint: "#5f9a4a", tintBody: true, scale: 1.0 } };
    case "satyr": return { kind: "char", spec: { body: "male", layers: ["LEGS_robe_skirt", "TORSO_robe_shirt_brown", "HEAD_robe_hood"], weapon: "staff", tint: "#8a5fd0", scale: 1.05 } };
    case "ogre": return { kind: "char", spec: { body: "male", layers: ["LEGS_pants_greenish", "TORSO_leather_armor_torso"], weapon: null, tint: "#b0563a", tintBody: true, scale: 1.55 } };
    case "wildwing": return { kind: "monster", name: "bat" };
    case "lane_creep": return { kind: "char", spec: { body: "male", layers: ["FEET_shoes_brown", "LEGS_pants_greenish", "TORSO_chain_armor_torso"], weapon: "spear", scale: 0.95 } };
    case "siege_creep": return { kind: "monster", name: "pumpking" };
    case "golem": return { kind: "char", spec: { body: "male", layers: ["FEET_plate_armor_shoes", "LEGS_plate_armor_pants", "TORSO_plate_armor_torso", "HEAD_plate_armor_helmet"], weapon: null, tint: "#8d8d86", tintBody: true, scale: 1.75 } };
    case "dark_troll": return { kind: "char", spec: { body: "skeleton", layers: [], weapon: "bow", tint: "#4f8a3f", tintBody: true, scale: 1.0 } };
    case "hellbear": return { kind: "char", spec: { body: "male", layers: ["LEGS_pants_greenish", "TORSO_leather_armor_torso"], weapon: null, tint: "#5a3a22", tintBody: true, scale: 1.5 } };
    default: return { kind: "rig" };
  }
}

/** Оттенок брони героя — узнаваемость на расстоянии, пока нет своего арта. */
export const HERO_TINT: Record<string, string> = {
  juggernaut: "#e0862a", crystal_maiden: "#7cc4ff", sniper: "#8a6a3a", axe: "#c23b2a", zeus: "#5aa0ff",
  phantom_assassin: "#6d5cc7", anti_mage: "#4bc3c9", lina: "#ff7a3a", lich: "#9fd8ff", drow_ranger: "#7fb2d6", windranger: "#d97a3f",
  bristleback: "#c47a3a", sven: "#3a6ac4", storm_spirit: "#5ab8ff", leshrac: "#5bd0c8", faceless_void: "#7a5ccf", ursa: "#b86a3a",
  lion: "#c04a8a", shadow_fiend: "#c0402a", pugna: "#6ad0a0", invoker: "#c9a84a", tidehunter: "#3aa27a", mirana: "#c8c0ff", clinkz: "#ff9a3a",
  wraith_king: "#7ad8a0", dragon_knight: "#d8552a", kunkka: "#3a9ad8", necrophos: "#7ae08a", razor: "#7ab8ff", venomancer: "#8ad83a", witch_doctor: "#d8a03a", luna: "#8ab0ff",
  earthshaker: "#c89a4a", bloodseeker: "#d83a3a", riki: "#8a5cd8", queen_of_pain: "#d85ab0", viper: "#7ad84a", ogre_magi: "#e08a3a", huskar: "#ff7a2a", slardar: "#3ab0c8",
  tiny: "#9a9a90", spectre: "#8a6ad8", chaos_knight: "#c84a3a", night_stalker: "#5a6ad8", doom: "#e06a2a", legion_commander: "#d8a04a", templar_assassin: "#c85ab8", medusa: "#5ac8a0",
  silencer: "#c8b0ff", skywrath_mage: "#7ab0ff", dazzle: "#c8a0e8", jakiro: "#7ad0ff", shadow_shaman: "#a0e07a", warlock: "#e0a04a", enigma: "#6a4ad8", tinker: "#7ae0ff",
};

/** Внешний вид героя по киту и цвету оттенка (свой у каждого героя). */
export function heroLook(kit: string, tint: string): CharSpec {
  switch (kit) {
    case "juggernaut": case "blademaster":
      return { body: "male", layers: ["FEET_shoes_brown", "LEGS_pants_greenish", "TORSO_leather_armor_torso", "HEAD_hair_blonde"], weapon: "dagger", tint, scale: 1.15 };
    case "axe": case "warlord":
      return { body: "male", layers: ["FEET_plate_armor_shoes", "LEGS_plate_armor_pants", "TORSO_plate_armor_torso", "HEAD_plate_armor_helmet"], weapon: "spear", tint, scale: 1.2 };
    case "sniper": case "marksman":
      return { body: "male", layers: ["FEET_shoes_brown", "LEGS_pants_greenish", "TORSO_leather_armor_torso", "HEAD_leather_armor_hat"], weapon: "bow", tint, scale: 1.15 };
    default:
      return { body: "male", layers: ["LEGS_robe_skirt", "TORSO_robe_shirt_brown", "HEAD_robe_hood"], weapon: "staff", tint, scale: 1.15 };
  }
}

/* ─── Листы из моделей Dota 2 (путь А, docs/arcade-dota-sprites.md) ───
   `dota/<id>.json` + `dota/<id>.png`: строки = анимация × направление, колонки = кадры. Есть лист —
   он главнее LPC и ригов. Загрузка ленивая; 404 = «нет», без повторных запросов. */
export interface DotaMeta {
  name: string;
  frame: number;
  dirs: number;
  fps: number;
  world: number;
  anchor: { x: number; y: number };
  anims: Record<string, { row: number; frames: number }>;
}

export interface DotaSheet {
  img: HTMLImageElement;
  meta: DotaMeta;
}

const dotaSheets = new Map<string, DotaSheet | null | "loading">();

/** Пиксельные листы (`dota_px/`, Dead Cells-стиль, docs/arcade-dota-sprites.md §7): включаются рендерером в пиксельном режиме; нет px-листа — берётся обычный. */
let pixelSheets = false;
let denseSheets = false;
export function setPixelSheets(on: boolean, dense = false): void {
  if (pixelSheets === on && denseSheets === dense) return;
  pixelSheets = on;
  denseSheets = dense;
  dotaSheets.clear();
  version++;
}

function loadSheet(name: string, dir: string, onMiss: () => void): void {
  fetch(`${ROOT}${dir}/${name}.json`)
    .then((r) => (r.ok ? (r.json() as Promise<DotaMeta>) : null))
    .then((meta) => {
      if (!meta || !meta.anims) { onMiss(); return; }
      const el = new Image();
      el.onload = () => { dotaSheets.set(name, { img: el, meta }); version++; };
      el.onerror = () => { onMiss(); };
      el.src = `${ROOT}${dir}/${name}.png`;
    })
    .catch(() => { onMiss(); });
}

export function dotaSheet(name: string): DotaSheet | null {
  const v = dotaSheets.get(name);
  if (v === undefined) {
    dotaSheets.set(name, "loading");
    const miss = () => { dotaSheets.set(name, null); version++; };
    // Плотный пиксель (фактор 1): 128-px кадры `dota_px2/`, нет — 64-px `dota_px/` (растянутся nearest ×2), нет — обычный лист.
    const px = () => loadSheet(name, "dota_px", () => loadSheet(name, "dota", miss));
    if (pixelSheets && denseSheets) loadSheet(name, "dota_px2", px);
    else if (pixelSheets) px();
    else loadSheet(name, "dota", miss);
    return null;
  }
  return v === "loading" ? null : v;
}

/** Индекс направления листа Dota: 0 = лицом к камере (вниз по экрану), далее против часовой
 *  на экране (вниз → вправо → вверх → влево) — так вращает модель Blender-скрипт (+Z). */
export function dotaDir(dx: number, dy: number, dirs: number): number {
  if (dx === 0 && dy === 0) return 0;
  const angle = Math.atan2(dx, dy); // 0 = вниз, +90° = вправо
  const step = (Math.PI * 2) / dirs;
  return ((Math.round(angle / step) % dirs) + dirs) % dirs;
}

/** Нарисовать кадр листа Dota якорем ног в (x, y). Нет анимации — падаем на walk/idle; false — нечего рисовать. */
let tintScratch: HTMLCanvasElement | null = null;

/**
 * Кадр листа Dota. `tint` — цвет поверх силуэта (source-atop): у части пропсов (листва деревьев, камни) в
 * экспорте VRF нет шейдерного тинта Source 2, и они выходят белёсыми — подкрашиваем на месте, тени сохраняются.
 */
export function drawDotaFrame(c: CanvasRenderingContext2D, sheet: DotaSheet, anim: string, dir: number, frame: number, x: number, y: number, alpha = 1, sizeMult = 1, tint?: string): boolean {
  const m = sheet.meta;
  const a = m.anims[anim] ?? (anim === "attack" || anim === "idle" ? m.anims.walk ?? m.anims.idle : anim === "walk" ? m.anims.idle : undefined);
  if (!a) return false;
  const row = a.row + (dir % m.dirs);
  const f = a.frames > 0 ? ((frame % a.frames) + a.frames) % a.frames : 0;
  const scale = (m.world / m.frame) * sizeMult;
  const w = m.frame * scale;
  c.globalAlpha = alpha;
  if (tint) {
    if (!tintScratch) tintScratch = document.createElement("canvas");
    if (tintScratch.width < m.frame) tintScratch.width = tintScratch.height = m.frame;
    const sc = tintScratch.getContext("2d")!;
    sc.globalCompositeOperation = "source-over";
    sc.clearRect(0, 0, m.frame, m.frame);
    sc.drawImage(sheet.img, f * m.frame, row * m.frame, m.frame, m.frame, 0, 0, m.frame, m.frame);
    sc.globalCompositeOperation = "source-atop";
    sc.fillStyle = tint;
    sc.fillRect(0, 0, m.frame, m.frame);
    sc.globalCompositeOperation = "source-over";
    c.drawImage(tintScratch, 0, 0, m.frame, m.frame, x - w * m.anchor.x, y - w * m.anchor.y, w, w);
  } else {
    c.drawImage(sheet.img, f * m.frame, row * m.frame, m.frame, m.frame, x - w * m.anchor.x, y - w * m.anchor.y, w, w);
  }
  c.globalAlpha = 1;
  return true;
}

/** Бесшовная текстура земли Dota (`dota/terrain/<name>.png`), если положена. */
export function dotaTerrain(name: string): HTMLImageElement | null {
  const el = img(`${pixelSheets ? "dota_px" : "dota"}/terrain/${name}.png`, ROOT);
  return ready(el) ? el : null;
}
export function pixelSheetsOn(): boolean { return pixelSheets; }

/**
 * Предзагрузка арта забега (владелец 2026-09-06: «на мгновение видна другая моделька и карта»): лист героя,
 * враги акта, земля и пропсы. Резолвится, когда всё загрузилось или отвалилось, не дольше `timeoutMs`.
 */
export function preloadArcadeArt(hero: string, enemyIds: readonly string[], act: string, timeoutMs = 6000): Promise<void> {
  const sheets = [hero, ...enemyIds, "tree_oak", "tree_pine", "rock"];
  const terrain = ["grass", "dirt", ...(act === "river" ? ["water"] : []), ...(act === "dire" ? ["grass_dire"] : [])];
  const kick = () => { for (const n of sheets) dotaSheet(n); for (const t of terrain) dotaTerrain(t); tileImage("grass"); tileImage("dirt"); tileImage("treetop"); tileImage("rock"); };
  kick();
  const ready = () => sheets.every((n) => dotaSheets.get(n) !== "loading" && dotaSheets.get(n) !== undefined) && terrain.every((t) => { const el = img(`${pixelSheets ? "dota_px" : "dota"}/terrain/${t}.png`, ROOT); return el === null || (!!el && el.complete); });
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => { if (ready() || Date.now() - started > timeoutMs) resolve(); else window.setTimeout(tick, 50); };
    tick();
  });
}
