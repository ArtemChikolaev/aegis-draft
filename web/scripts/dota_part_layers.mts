// Слои частей по слотам Dota (T13.80): «голое» тело основы + по слою на каждую часть каждого источника, чтобы гардероб
// собирал облик из частей разных сетов (меч одного, шлем другого — и на аркане тоже), а рендерер складывал их в рантайме
// (features/arcade/sprites.ts compositeSheet). Слой = разница листов «тело» и «тело + части слота» одного кадрирования
// (sprite_part_layer.mts, --fit-from в render_dota_sprites.py).
//
// Семейство (срез 2, 2026-09-15) = основа героя со своим телом: базовая строка `<hero>`, аркана `<hero>@arcana` и её
// стили `<hero>@arcana~style1` (у них другая модель или другие текстуры тела — слои с базового тела на них не лягут:
// перекрытия и тени телом другие). Внутри семейства источники частей: `base` (части модели по умолчанию), имя самой
// основы (`arcana` — её собственные части: маска Jugg, голова MK, пламя Lina) и сеты `<hero>@<set>` на том же теле.
// Части сета на аркане берутся с подменами `asset_modifier model` из items_game (аркана MK меняет сет Cult на `*_arcana_*`).
// Слот части — по item ID/`item_slot` из индекса (scripts/lib/dota_slots.mjs indexedSlot); неизвестная модель — стоп.
//
//   npx tsx scripts/dota_part_layers.mts plan  --heroes juggernaut,lina --families juggernaut@arcana,juggernaut@arcana~style1 --dir <scratch> [--only <id,id>]
//     → <dir>/family_px2.tsv, <dir>/family_px.tsv: строки `<fam>+ref` (лист-образец = строка основы), `<fam>+body`
//       (тело без частей) и `<fam>+<источник>.<слот>` (тело + части слота); экспортные папки семейства — симлинки на `+ref`,
//       чтобы glb тела и частей доставались из vpk один раз (REUSE=1). `--only` — рендерить лишь эти слои (+ref и +body всегда).
//   RAW=1 REUSE=1 OUT=<dir>/export SPRITES=<dir>/px2 bash scripts/blender/dota_pipeline.sh <dir>/family_px2.tsv
//   RAW=1 REUSE=1 OUT=<dir>/export SPRITES=<dir>/px  bash scripts/blender/dota_pipeline.sh <dir>/family_px.tsv
//   npx tsx scripts/dota_part_layers.mts build --heroes … --families … --dir <scratch> [--tol 12] [--only …]
//     → public/art/sprites/{dota_px2,dota_px}/<id>.{webp,json}, строки в scripts/blender/dota_manifest_parts_{px2,px}.tsv
//       (строка с тем же id заменяется), затем `table`; печатает долю расхождения «тело + слои по умолчанию» с образцом.
//   npx tsx scripts/dota_part_layers.mts table
//     → src/game/arcade/content/parts.ts из манифестов слоёв (px2 — истина, px обязан совпадать) и основного манифеста
//       (части строки основы → слоты по умолчанию семейства). Отдельно нужен после переименования слоёв без перерендера.
import { existsSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, join } from "node:path";
import { DRAW_ORDER, indexedSlot, loadSlotIndex, modelKey } from "./lib/dota_slots.mjs";

const argv = process.argv.slice(2);
const mode = argv[0];
const opt = (k: string, d: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const heroes = opt("--heroes", "").split(",").filter(Boolean);
const wantFamilies = opt("--families", "").split(",").filter(Boolean);
const only = new Set(opt("--only", "").split(",").filter(Boolean));
const dir = resolve(opt("--dir", ""));
const tol = Number(opt("--tol", "12"));
if (!["plan", "build", "table"].includes(mode ?? "") || (mode !== "table" && (!heroes.length || !dir))) {
  console.error("нужно: plan|build --heroes a,b [--families a@arcana,…] --dir <папка> [--tol 12] [--only id,id] | table");
  process.exit(1);
}
const SIZES = [["px2", "scripts/blender/dota_manifest_px2.tsv", "public/art/sprites/dota_px2", "scripts/blender/dota_manifest_parts_px2.tsv"], ["px", "scripts/blender/dota_manifest_px.tsv", "public/art/sprites/dota_px", "scripts/blender/dota_manifest_parts_px.tsv"]] as const;
const TS_PATH = "src/game/arcade/content/parts.ts";
// Рамка силуэта клетки (стойка, направление 0) у двух листов — сверка кадрирования цельного листа с образцом семейства.
const BBOX = `(async ({ a, am, b, bm, frame, row }) => {
  const load = (x, mime) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = "data:" + mime + ";base64," + x; });
  const out = [];
  for (const img of [await load(a, am), await load(b, bm)]) {
    const c = document.createElement("canvas"); c.width = c.height = frame; const x = c.getContext("2d");
    x.drawImage(img, 0, row * frame, frame, frame, 0, 0, frame, frame);
    const d = x.getImageData(0, 0, frame, frame).data; let x0 = frame, x1 = 0, y0 = frame, y1 = 0;
    for (let y = 0; y < frame; y++) for (let xx = 0; xx < frame; xx++) if (d[(y * frame + xx) * 4 + 3] > 64) { x0 = Math.min(x0, xx); x1 = Math.max(x1, xx); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    out.push([x0, y0, x1, y1]);
  }
  return out;
})`;
// Скрипт страницы для замера порядка слоя спины (measureBackOrder ниже); объявлен до режимов: они идут с top-level await.
const BACK_PROBE = `(async ({ whole, body, imgs, orders, meta }) => {
  const load = (b) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = "data:image/webp;base64," + b; });
  const W = await load(whole), B = await load(body); const L = {};
  for (const [k, v] of Object.entries(imgs)) L[k] = await load(v);
  const c = document.createElement("canvas"); c.width = W.width; c.height = W.height;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(W, 0, 0); const ref = x.getImageData(0, 0, c.width, c.height).data;
  const out = [];
  for (const order of orders) {
    x.clearRect(0, 0, c.width, c.height); x.drawImage(B, 0, 0); for (const sl of order) x.drawImage(L[sl], 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data; const bad = new Array(meta.dirs).fill(0), tot = new Array(meta.dirs).fill(0);
    for (const a of Object.values(meta.anims)) for (let dir = 0; dir < (a.dirs ?? meta.dirs); dir++) { const y0 = (a.row + dir) * meta.frame; for (let y = y0; y < y0 + meta.frame; y++) for (let xx = 0; xx < a.frames * meta.frame; xx++) { const i = (y * c.width + xx) * 4; if (ref[i + 3] < 8 && d[i + 3] < 8) continue; tot[dir]++; if (Math.abs(ref[i] - d[i]) + Math.abs(ref[i + 1] - d[i + 1]) + Math.abs(ref[i + 2] - d[i + 2]) + Math.abs(ref[i + 3] - d[i + 3]) > 48) bad[dir]++; } }
    out.push(bad.map((b, i) => (b / Math.max(1, tot[i])) * 100));
  }
  return out;
})`;
interface Row { id: string; vmdl: string; args: string; parts: string[] }
const rows = (f: string): Row[] => (existsSync(f) ? readFileSync(f, "utf8").split("\n").filter((l) => l && !l.startsWith("#")).map((l) => { const c = l.split("\t"); return { id: c[0], vmdl: c[1], args: c[2], parts: (c[3] ?? "").split(",").filter(Boolean) }; }) : []);
const rowLine = (r: Row) => [r.id, r.vmdl, r.args, r.parts.join(",")].join("\t");

/** Слот части по данным Dota; неизвестная модель или слот вне порядка отрисовки — стоп с подсказкой. */
function slotName(p: string): string {
  const s = indexedSlot(p);
  if (!s) throw new Error(`${p}: нет в dota_item_index.json и dota_slot_overrides.json — пересобери индекс (dota_item_index.mts) или добавь оверрайд с причиной`);
  if (!DRAW_ORDER.includes(s.slot)) throw new Error(`${p}: слот Dota «${s.slot}» (${"item" in s ? `предмет ${s.item.id} ${s.item.name}` : "оверрайд"}) не входит в DRAW_ORDER — добавь порядок отрисовки в dota_slots.mjs`);
  return s.slot;
}

/** Семейство: основа героя со своим телом, её источники частей (источник → слот → модели) и слоты по умолчанию. */
interface Family { id: string; hero: string; row: Row; sources: Map<string, Map<string, string[]>>; defaults: Map<string, string>; /** Хвост аргументов источника: сет-перекраска (`--style dpc` у Spring Lineage SF) рендерит свои слои с ним. */ extras: Map<string, string> }
export function families(hero: string, man: Row[], want: readonly string[]): Family[] {
  const base = man.find((r) => r.id === hero);
  if (!base) throw new Error(`${hero}: нет базовой строки в манифесте`);
  const { index } = loadSlotIndex();
  // Слот — по исходной модели; `swap` подменяет путь уже после (арканный вариант части наследует слот предмета).
  const group = (parts: string[], swap: (p: string) => string = (p) => p) => { const m = new Map<string, string[]>(); for (const p of parts) { const s = slotName(p); (m.get(s) ?? m.set(s, []).get(s)!).push(swap(p)); } return m; };
  // Сеты на базовом теле: та же модель и те же аргументы, без стиля и формы; свои части — те, которых нет у базовой строки.
  // Сет-перекраска: те же аргументы плюс хвост только из `--style <токен>` / `--style-folder <папка>` (другие текстуры тех же моделей).
  const setExtra = (r: Row): string | null => {
    if (r.args === base.args) return "";
    const e = r.args.startsWith(`${base.args} `) ? r.args.slice(base.args.length) : null;
    return e !== null && /^( --style \S+| --style-folder \S+)+$/.test(e) ? e : null;
  };
  const sets = man.filter((r) => r.id.startsWith(`${hero}@`) && !r.id.includes("~") && !r.id.endsWith("@meta") && r.vmdl === base.vmdl && setExtra(r) !== null)
    .map((r) => ({ name: r.id.split("@")[1], own: r.parts.filter((p) => !base.parts.includes(p)), extra: setExtra(r)! })).filter((s) => s.own.length);
  const famRows = [base, ...want.filter((id) => id.startsWith(`${hero}@`)).map((id) => { const r = man.find((x) => x.id === id); if (!r) throw new Error(`${id}: нет строки основы в манифесте`); return r; })];
  return famRows.map((row) => {
    const skin = row.id === hero ? null : row.id.split("@")[1].split("~")[0];
    const own = row.parts.filter((p) => !base.parts.includes(p));
    // Подмены моделей при надетой основе: аркана героя (hero_base) + предметы её собственных частей.
    const swaps: Record<string, string> = {};
    if (skin === "arcana") for (const b of index.bases[hero] ?? []) if (b.rarity === "arcana") Object.assign(swaps, b.swaps ?? {});
    for (const p of own) Object.assign(swaps, index.models[modelKey(p)]?.swaps ?? {});
    const swap = (p: string) => { const to = swaps[modelKey(p)]; return to ? `${to}_c` : p; };
    const sources = new Map<string, Map<string, string[]>>();
    sources.set("base", group(base.parts));
    if (skin && own.length) sources.set(skin, group(own));
    const extras = new Map<string, string>();
    for (const s of sets) { sources.set(s.name, group(s.own, swap)); if (s.extra) extras.set(s.name, s.extra); }
    const defaults = new Map<string, string>();
    for (const p of row.parts) defaults.set(slotName(p), own.includes(p) && skin ? skin : "base");
    return { id: row.id, hero, row, sources, defaults, extras };
  });
}
const layerIds = (f: Family) => [...f.sources].flatMap(([src, slots]) => [...slots.keys()].map((slot) => `${f.id}+${src}.${slot}`));
// `--only` — префиксы id: `juggernaut@arcana` берёт и `juggernaut@arcana+…`, и `juggernaut@arcana~style1+…`.
const wantedLayer = (id: string) => !only.size || [...only].some((o) => id === o || id.startsWith(o));
/** Семейство, у которого --only не оставил ни одного слоя, не рендерится и не пересобирается. */
const wantedFamily = (f: Family) => !only.size || layerIds(f).some(wantedLayer);

if (mode === "plan") {
  mkdirSync(join(dir, "export"), { recursive: true });
  for (const [size, manPath] of SIZES) {
    const man = rows(manPath);
    const out: string[] = ["# Семья слоёв частей (T13.80, dota_part_layers.mts plan) — рендерить с RAW=1 REUSE=1, потом build."];
    mkdirSync(join(dir, size), { recursive: true });
    for (const hero of heroes) for (const f of families(hero, man, wantFamilies)) {
      if (!wantedFamily(f)) continue;
      const fit = `--fit-from ${join(dir, size, `${f.id}+ref.json`)}`;
      const ids: string[] = [`${f.id}+ref`, `${f.id}+body`];
      out.push(rowLine({ ...f.row, id: `${f.id}+ref` }));
      out.push(rowLine({ id: `${f.id}+body`, vmdl: f.row.vmdl, args: `${f.row.args} ${fit}`, parts: [] }));
      for (const [src, slots] of f.sources) for (const [slot, parts] of slots) {
        const id = `${f.id}+${src}.${slot}`;
        if (!wantedLayer(id)) continue;
        ids.push(id);
        out.push(rowLine({ id, vmdl: f.row.vmdl, args: `${f.row.args}${f.extras.get(src) ?? ""} ${fit}`, parts }));
      }
      // Экспортные папки семьи → папка образца: vpk → glb один раз на основу (REUSE=1 в dota_pipeline.sh).
      mkdirSync(join(dir, "export", `${f.id}+ref`), { recursive: true });
      for (const id of ids.slice(1)) { const p = join(dir, "export", id); if (!existsSync(p)) symlinkSync(join(dir, "export", `${f.id}+ref`), p); }
      if (size === "px2") console.log(`${f.id}: ${[...f.sources].map(([s, m]) => `${s}(${[...m.keys()].join("+")})`).join(" · ")} · по умолчанию ${[...f.defaults].map(([sl, s]) => `${sl}=${s}`).join(",")} → рендеров ${ids.length}`);
    }
    writeFileSync(join(dir, `family_${size}.tsv`), out.join("\n") + "\n");
    console.log(`${size}: строк ${out.length - 1} → ${join(dir, `family_${size}.tsv`)}`);
  }
}

if (mode === "build") {
  const { chromium } = await import("playwright");
  const { partLayer } = await import("./sprite_part_layer.mts");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const quantWebp = (png: string, outWebp: string) => {
    const q = png.replace(/\.png$/, ".q.png");
    execFileSync("pngquant", ["--nofs", "--speed", "1", "--force", "--output", q, "48", png]);
    execFileSync("cwebp", ["-lossless", "-z", "6", "-quiet", q, "-o", outWebp]);
  };
  // Проверка: тело + слои по умолчанию в порядке отрисовки против образца — доля пикселей образца, где композит промахнулся.
  const CHECK = `(async (refB64, layersB64, tol) => {
    const load = (b64) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + b64; });
    const ref = await load(refB64); const layers = await Promise.all(layersB64.map(load));
    const c = document.createElement('canvas'); c.width = ref.width; c.height = ref.height;
    const x = c.getContext('2d', { willReadFrequently: true });
    for (const l of layers) x.drawImage(l, 0, 0);
    const comp = x.getImageData(0, 0, c.width, c.height).data;
    x.clearRect(0, 0, c.width, c.height); x.drawImage(ref, 0, 0);
    const r = x.getImageData(0, 0, c.width, c.height).data;
    let opaque = 0, bad = 0;
    for (let i = 0; i < r.length; i += 4) {
      if (r[i+3] < 8 && comp[i+3] < 8) continue;
      opaque++;
      const d = Math.abs(r[i]-comp[i]) + Math.abs(r[i+1]-comp[i+1]) + Math.abs(r[i+2]-comp[i+2]) + Math.abs(r[i+3]-comp[i+3]);
      if (d > tol) bad++;
    }
    return { opaque, bad };
  })`;
  for (const [size, manPath, pub, partsMan] of SIZES) {
    const man = rows(manPath);
    const byId = new Map(rows(partsMan).map((r) => [r.id, r]));
    let added = 0;
    for (const hero of heroes) for (const f of families(hero, man, wantFamilies)) {
      if (!wantedFamily(f)) continue;
      const raw = join(dir, size);
      const body = join(raw, `${f.id}+body.png`), ref = join(raw, `${f.id}+ref.png`);
      if (!existsSync(body) || !existsSync(ref)) { console.error(`${size} ${f.id}: нет ${body} или ${ref} — сначала рендер`); continue; }
      quantWebp(body, join(pub, `${f.id}+body.webp`)); copyFileSync(join(raw, `${f.id}+body.json`), join(pub, `${f.id}+body.json`));
      byId.set(`${f.id}+body`, { id: `${f.id}+body`, vmdl: f.row.vmdl, args: f.row.args, parts: [] });
      // Слои, которых нет в рендере: при --only — ожидаемо (остаются прежние), без него — семейство неполное, стоп.
      const missing = layerIds(f).filter((id) => wantedLayer(id) && !existsSync(join(raw, `${id}.png`)));
      if (missing.length) { console.error(`${size} ${f.id}: нет рендера ${missing.join(", ")} — семейство не публикуется`); continue; }
      const defaultLayers: string[] = [];
      for (const [src, slots] of f.sources) for (const [slot, parts] of slots) {
        const id = `${f.id}+${src}.${slot}`;
        const lp = join(raw, `${id}.layer.png`);
        if (wantedLayer(id)) {
          const layer = await partLayer(page, body, join(raw, `${id}.png`), tol);
          writeFileSync(lp, layer.png);
          quantWebp(lp, join(pub, `${id}.webp`)); copyFileSync(join(raw, `${id}.json`), join(pub, `${id}.json`));
          byId.set(id, { id, vmdl: f.row.vmdl, args: `${f.row.args}${f.extras.get(src) ?? ""}`, parts });
          added++;
          console.log(`${size} ${id}: ${((layer.kept / layer.total) * 100).toFixed(1)}% листа`);
        }
        if (f.defaults.get(slot) === src && existsSync(lp)) defaultLayers[DRAW_ORDER.indexOf(slot)] = lp;
      }
      // Цельный лист основы в public обязан быть того же кадрирования, что образец семейства: иначе при переходе от цельного
      // облика к смешанному спрайт «прыгает» (аркана SF 2026-09-19: старый цельный лист был мельче семейства на 8%).
      const wholeWebp = join(pub, `${f.id}.webp`);
      if (existsSync(wholeWebp)) {
        const meta = JSON.parse(readFileSync(join(raw, `${f.id}+ref.json`), "utf8")) as { frame: number; anims: Record<string, { row: number }> };
        const cell = { frame: meta.frame, row: (meta.anims.idle ?? Object.values(meta.anims)[0]).row };
        const bb = await page.evaluate(`${BBOX}(${JSON.stringify({ a: readFileSync(wholeWebp).toString("base64"), am: "image/webp", b: readFileSync(ref).toString("base64"), bm: "image/png", ...cell })})`) as number[][];
        if (bb[0].some((v, i) => Math.abs(v - bb[1][i]) > 3)) console.error(`${size} ${f.id}: ЦЕЛЬНЫЙ ЛИСТ ${f.id}.webp другого кадрирования (${bb[0].join(",")} против ${bb[1].join(",")}) — перерендерь строку основы или опубликуй лист из +ref`);
      }
      const ordered = defaultLayers.filter(Boolean);
      if (ordered.length === f.defaults.size) {
        const chk = await page.evaluate(`${CHECK}(${JSON.stringify(readFileSync(ref).toString("base64"))}, ${JSON.stringify([body, ...ordered].map((p) => readFileSync(p).toString("base64")))}, ${tol})`) as { opaque: number; bad: number };
        console.log(`${size} ${f.id}: композит тела и слоёв по умолчанию против образца — расхождение ${((chk.bad / Math.max(1, chk.opaque)) * 100).toFixed(2)}% (${chk.bad} из ${chk.opaque} px)`);
      } else console.log(`${size} ${f.id}: проверка композита пропущена — не все слои по умолчанию отрендерены в этом прогоне`);
    }
    const head = existsSync(partsMan) ? readFileSync(partsMan, "utf8").split("\n").filter((l) => l.startsWith("#")).join("\n") + "\n" : `# Слои частей (T13.80): id \`<основа>+body\` и \`<основа>+<источник>.<слот>\`; листы собирает dota_part_layers.mts (разница рендеров одного кадрирования), не dota_pipeline.sh напрямую. Колонки как в основном манифесте.\n`;
    writeFileSync(partsMan, head + [...byId.values()].map(rowLine).join("\n") + "\n");
    console.log(`${size}: слоёв обновлено ${added}, строк в ${partsMan} ${byId.size}`);
  }
  await browser.close();
  await writeTable();
}

if (mode === "table") await writeTable();

/** parts.ts из манифестов слоёв: семейства → источники → слоты (px2 — истина, px и файлы на диске обязаны совпадать). */
async function writeTable(): Promise<void> {
  const man = rows(SIZES[0][1]);
  const px2 = rows(SIZES[0][3]), px = new Set(rows(SIZES[1][3]).map((r) => r.id));
  type Fam = { defaults: Record<string, string>; sources: Record<string, string[]>; backOrder?: number[] };
  const table: Record<string, { slots: string[]; families: Record<string, Fam> }> = {};
  const famIds = new Map<string, Set<string>>(); // hero → id семейств из манифеста слоёв
  for (const r of px2) {
    const [famId] = r.id.split("+");
    const hero = famId.split("@")[0];
    (famIds.get(hero) ?? famIds.set(hero, new Set()).get(hero)!).add(famId);
  }
  const problems: string[] = [];
  for (const [hero, ids] of famIds) {
    const fams = families(hero, man, [...ids].filter((id) => id !== hero));
    const entry = (table[hero] ??= { slots: [], families: {} });
    for (const f of fams) {
      const fam: Fam = { defaults: Object.fromEntries(f.defaults), sources: {} };
      for (const r of px2) {
        if (!r.id.startsWith(`${f.id}+`) || r.id === `${f.id}+body`) continue;
        const rest = r.id.slice(f.id.length + 1);
        const dot = rest.lastIndexOf(".");
        const src = rest.slice(0, dot), slot = rest.slice(dot + 1);
        if (!f.sources.get(src)?.has(slot)) problems.push(`${r.id}: в манифесте слоёв, но семейство ${f.id} такого источника/слота не даёт (переименован слот? удали строку и лист)`);
        (fam.sources[src] ??= []).push(slot);
        if (!entry.slots.includes(slot)) entry.slots.push(slot);
        if (!px.has(r.id)) problems.push(`${r.id}: нет в dota_manifest_parts_px.tsv`);
        for (const [, , pub] of SIZES) if (!existsSync(join(pub, `${r.id}.webp`)) || !existsSync(join(pub, `${r.id}.json`))) problems.push(`${r.id}: нет листа в ${pub}`);
      }
      if (!px2.some((r) => r.id === `${f.id}+body`)) problems.push(`${f.id}+body: нет строки тела`);
      for (const [slot, src] of f.defaults) if (!fam.sources[src]?.includes(slot)) console.warn(`${f.id}: слот по умолчанию ${slot}=${src} без слоя — смешивание с этим слотом покажет облик без него`);
      for (const src of Object.keys(fam.sources)) fam.sources[src] = DRAW_ORDER.filter((s) => fam.sources[src].includes(s));
      entry.families[f.id] = fam;
    }
    entry.slots = DRAW_ORDER.filter((s) => entry.slots.includes(s));
  }
  if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
  await measureBackOrder(table);
  const data = JSON.stringify(table, null, 2).replace(/"backOrder": \[[^\]]*\]/g, (m) => m.replace(/\s+/g, " "));
  writeFileSync(TS_PATH, `// Части героев по слотам Dota (T13.80). СГЕНЕРИРОВАНО scripts/dota_part_layers.mts table — не править руками.
// У героя: слоты в порядке отрисовки (снизу вверх) и семейства основ — тела со своими слоями: базовая модель \`<hero>\`,
// аркана \`<hero>@arcana\` и её стили \`<hero>@arcana~style1\`. У семейства: \`defaults\` — источник части в каждом слоте у
// самой основы (слот без записи у неё пуст) и \`sources\` — источники (\`base\` — модель по умолчанию, имя основы — её
// собственные части, \`<set>\` — сет \`<hero>@<set>\`) со слотами, под которые отрендерен слой \`<основа>+<источник>.<слот>\`.
// Лист тела — \`<основа>+body\`. Слот — \`item_slot\` из items_game (dota_item_index.json), порядок — DRAW_ORDER (dota_slots.mjs).
// \`backOrder\` — где рисовать слой спины (плащ, крылья) в каждом направлении: порядок слотов один на лист, но спиной к камере
// плащ лежит ПОВЕРХ брони, а не под ней. Меряется здесь же: композит «тело + слои по умолчанию» против цельного листа основы.
// Сборка облика — content/cosmetics.ts (loadoutSheet), рендер — features/arcade/sprites.ts.
export type DotaSlot = ${DRAW_ORDER.map((s) => JSON.stringify(s)).join(" | ")};
export interface PartsFamily { defaults: Readonly<Partial<Record<DotaSlot, string>>>; sources: Readonly<Record<string, readonly DotaSlot[]>>; /** Порядок слоя спины по направлениям листа: 0 — первой, 1 — перед головой/оружием, 2 — последней (нет поля — всюду 0). */ backOrder?: readonly number[] }
export interface HeroParts { slots: readonly DotaSlot[]; families: Readonly<Record<string, PartsFamily>> }
export const HERO_PARTS: Readonly<Record<string, HeroParts>> = /* DATA */${data}/* END */;
`);
  console.log(`${TS_PATH}: героев ${Object.keys(table).length}, семейств ${Object.values(table).reduce((n, h) => n + Object.keys(h.families).length, 0)}`);
}


/**
 * Порядок слоя спины по направлениям (владелец 2026-09-19: «крылья TB просвечивают сквозь скин»). Слой — разница с голым
 * телом, взаимных перекрытий частей он не знает: лицом к камере плащ под бронёй, спиной — поверх неё. Для каждого
 * семейства со спиной по умолчанию сравниваем с цельным листом основы три варианта (0 — спина первой, 1 — перед
 * головой/оружием, 2 — последней) по каждому направлению и берём лучший; 0 уступает, только если выигрыш заметен
 * (> 0.5 п.п.). Семейство без спины по умолчанию (аркана Jugg) наследует порядок базового семейства героя.
 */
async function measureBackOrder(table: Record<string, { slots: string[]; families: Record<string, { defaults: Record<string, string>; sources: Record<string, string[]>; backOrder?: number[] }> }>): Promise<void> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pub = SIZES[0][2];
  const b64 = (f: string) => readFileSync(f).toString("base64");
  const TOP = ["head", "weapon", "offhand_weapon"];
  for (const [hero, hp] of Object.entries(table)) {
    for (const [fam, f] of Object.entries(hp.families)) {
      if (!f.defaults.back || !existsSync(join(pub, `${fam}.webp`))) continue;
      const meta = JSON.parse(readFileSync(join(pub, `${fam}.json`), "utf8")) as { frame: number; dirs: number; anims: Record<string, { row: number; frames: number }> };
      const slots = hp.slots.filter((sl) => f.defaults[sl]);
      const orders = [slots, [...slots.filter((x) => x !== "back" && !TOP.includes(x)), "back", ...slots.filter((x) => TOP.includes(x))], [...slots.filter((x) => x !== "back"), "back"]];
      const imgs = Object.fromEntries(slots.map((sl) => [sl, b64(join(pub, `${fam}+${f.defaults[sl]}.${sl}.webp`))]));
      // Скрипт страницы — строкой: tsx/esbuild вставляет в функции хелпер `__name`, которого в браузере нет.
      const miss = await page.evaluate(`${BACK_PROBE}(${JSON.stringify({ whole: b64(join(pub, `${fam}.webp`)), body: b64(join(pub, `${fam}+body.webp`)), imgs, orders, meta })})`) as number[][];
      const order = Array.from({ length: meta.dirs }, (_, d) => { const best = miss[1][d] <= miss[2][d] ? 1 : 2; return miss[0][d] - miss[best][d] > 0.5 ? best : 0; });
      if (order.some((o) => o !== 0)) f.backOrder = order;
      const avg = (o: number[]) => (o.reduce((s2, v) => s2 + v, 0) / o.length).toFixed(1);
      console.log(`${fam}: спина по направлениям [${order.join(",")}] — промах ${avg(miss[0])}% → ${avg(order.map((o, d) => miss[o][d]))}%`);
    }
    const base = hp.families[hero]?.backOrder;
    if (base) for (const f of Object.values(hp.families)) if (!f.defaults.back && !f.backOrder) f.backOrder = base;
  }
  await browser.close();
}
