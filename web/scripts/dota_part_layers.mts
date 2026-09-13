// Слои частей по слотам Dota (T13.80): «голое» тело героя + по слою на каждую часть каждого сета, чтобы
// гардероб собирал облик из частей разных сетов (меч одного, шлем другого), а рендерер складывал их в
// рантайме (sprites.ts compositeSheet). Слой = разница листов «тело» и «тело + части слота» одного
// кадрирования (sprite_part_layer.mts, --fit-from в render_dota_sprites.py).
//
//   npx tsx scripts/dota_part_layers.mts plan  --heroes juggernaut,lina --dir <scratch>
//     → <dir>/family_px2.tsv, <dir>/family_px.tsv: строки `<hero>+ref` (лист-образец = базовая строка),
//       `<hero>+body` (тело без частей) и `<hero>+<источник>.<слот>` (тело + части слота); экспортные папки
//       семьи — симлинки на `+ref`, чтобы glb тела и частей доставались из vpk один раз (REUSE=1).
//   RAW=1 REUSE=1 OUT=<dir>/export SPRITES=<dir>/px2 bash scripts/blender/dota_pipeline.sh <dir>/family_px2.tsv
//   RAW=1 REUSE=1 OUT=<dir>/export SPRITES=<dir>/px  bash scripts/blender/dota_pipeline.sh <dir>/family_px.tsv
//   npx tsx scripts/dota_part_layers.mts build --heroes juggernaut,lina --dir <scratch> [--tol 12]
//     → public/art/sprites/{dota_px2,dota_px}/<id>.{webp,json}, строки в scripts/blender/dota_manifest_parts_{px2,px}.tsv,
//       таблица src/game/arcade/content/parts.ts; печатает долю расхождения «тело + базовые слои» с образцом.
// Источник части: `base` — части базовой строки манифеста, `<set>` — части строки `<hero>@<set>` на том же теле
// (арканы/персоны с другой моделью тела в смешивание не идут: у них свои слоты, см. BACKLOG T13.80).
import { existsSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, copyFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, join } from "node:path";
import { chromium } from "playwright";
import { slotOf, DRAW_ORDER } from "./lib/dota_slots.mjs";
import { partLayer } from "./sprite_part_layer.mts";

const argv = process.argv.slice(2);
const mode = argv[0];
const opt = (k: string, d: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const heroes = opt("--heroes", "").split(",").filter(Boolean);
const dir = resolve(opt("--dir", ""));
const tol = Number(opt("--tol", "12"));
if (!["plan", "build"].includes(mode ?? "") || !heroes.length || !dir) {
  console.error("нужно: plan|build --heroes a,b --dir <папка> [--tol 12]");
  process.exit(1);
}
const SIZES = [["px2", "scripts/blender/dota_manifest_px2.tsv", "public/art/sprites/dota_px2", "scripts/blender/dota_manifest_parts_px2.tsv"], ["px", "scripts/blender/dota_manifest_px.tsv", "public/art/sprites/dota_px", "scripts/blender/dota_manifest_parts_px.tsv"]] as const;
interface Row { id: string; vmdl: string; args: string; parts: string[] }
const rows = (f: string): Row[] => readFileSync(f, "utf8").split("\n").filter((l) => l && !l.startsWith("#")).map((l) => { const c = l.split("\t"); return { id: c[0], vmdl: c[1], args: c[2], parts: (c[3] ?? "").split(",").filter(Boolean) }; });
const slotName = (p: string, hero: string, folder: string) => { const s = slotOf(p, hero, folder); return s.startsWith("?") ? "misc" : s; };

/** Семья героя: источники → слот → части. */
function family(hero: string, man: Row[]): { base: Row; sources: Map<string, Map<string, string[]>> } | null {
  const base = man.find((r) => r.id === hero);
  if (!base) { console.error(`${hero}: нет базовой строки`); return null; }
  const folder = base.vmdl.split("/")[2];
  const sources = new Map<string, Map<string, string[]>>();
  const group = (parts: string[]) => { const m = new Map<string, string[]>(); for (const p of parts) { const s = slotName(p, hero, folder); (m.get(s) ?? m.set(s, []).get(s)!).push(p); } return m; };
  if (base.parts.length) sources.set("base", group(base.parts));
  for (const r of man) {
    if (!r.id.startsWith(`${hero}@`) || r.id.includes("~") || r.id.endsWith("@meta") || r.vmdl !== base.vmdl) continue;
    const own = r.parts.filter((p) => !base.parts.includes(p));
    if (own.length) sources.set(r.id.split("@")[1], group(own));
  }
  return { base, sources };
}

if (mode === "plan") {
  mkdirSync(join(dir, "export"), { recursive: true });
  for (const [size, manPath] of SIZES) {
    const man = rows(manPath);
    const out: string[] = ["# Семья слоёв частей (T13.80, dota_part_layers.mts plan) — рендерить с RAW=1 REUSE=1, потом build."];
    mkdirSync(join(dir, size), { recursive: true });
    for (const hero of heroes) {
      const f = family(hero, man);
      if (!f) continue;
      const fit = `--fit-from ${join(dir, size, `${hero}+ref.json`)}`;
      const ids: string[] = [`${hero}+ref`, `${hero}+body`];
      out.push([`${hero}+ref`, f.base.vmdl, f.base.args, f.base.parts.join(",")].join("\t"));
      out.push([`${hero}+body`, f.base.vmdl, `${f.base.args} ${fit}`, ""].join("\t"));
      for (const [src, slots] of f.sources) for (const [slot, parts] of slots) {
        const id = `${hero}+${src}.${slot}`;
        ids.push(id);
        out.push([id, f.base.vmdl, `${f.base.args} ${fit}`, parts.join(",")].join("\t"));
      }
      // Экспортные папки семьи → папка образца: vpk → glb один раз на героя (REUSE=1 в dota_pipeline.sh).
      mkdirSync(join(dir, "export", `${hero}+ref`), { recursive: true });
      for (const id of ids.slice(1)) { const p = join(dir, "export", id); if (!existsSync(p)) symlinkSync(join(dir, "export", `${hero}+ref`), p); }
      if (size === "px2") console.log(`${hero}: ${[...f.sources].map(([s, m]) => `${s}(${[...m.keys()].join("+")})`).join(" · ")} → рендеров ${ids.length}`);
    }
    writeFileSync(join(dir, `family_${size}.tsv`), out.join("\n") + "\n");
    console.log(`${size}: строк ${out.length - 1} → ${join(dir, `family_${size}.tsv`)}`);
  }
}

if (mode === "build") {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const quantWebp = (png: string, outWebp: string) => {
    const q = png.replace(/\.png$/, ".q.png");
    execFileSync("pngquant", ["--nofs", "--speed", "1", "--force", "--output", q, "48", png]);
    execFileSync("cwebp", ["-lossless", "-z", "6", "-quiet", q, "-o", outWebp]);
  };
  // Проверка: тело + базовые слои в порядке отрисовки против образца — доля пикселей образца, где композит промахнулся.
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
  const partsTs: Record<string, { slots: string[]; sources: Record<string, string[]> }> = {};
  for (const [size, manPath, pub, partsMan] of SIZES) {
    const man = rows(manPath);
    const have = existsSync(partsMan) ? new Set(rows(partsMan).map((r) => r.id)) : new Set<string>();
    const add: string[] = [];
    for (const hero of heroes) {
      const f = family(hero, man);
      if (!f) continue;
      const raw = join(dir, size);
      const body = join(raw, `${hero}+body.png`), ref = join(raw, `${hero}+ref.png`);
      if (!existsSync(body) || !existsSync(ref)) { console.error(`${size} ${hero}: нет ${body} или ${ref} — сначала рендер`); continue; }
      quantWebp(body, join(pub, `${hero}+body.webp`)); copyFileSync(join(raw, `${hero}+body.json`), join(pub, `${hero}+body.json`));
      if (!have.has(`${hero}+body`)) add.push([`${hero}+body`, f.base.vmdl, f.base.args, ""].join("\t"));
      const entry = partsTs[hero] ?? (partsTs[hero] = { slots: [], sources: {} });
      const baseLayers: Record<string, string> = {};
      for (const [src, slots] of f.sources) for (const [slot, parts] of slots) {
        const id = `${hero}+${src}.${slot}`;
        const withPng = join(raw, `${id}.png`);
        if (!existsSync(withPng)) { console.error(`${size} ${id}: нет рендера`); continue; }
        const layer = await partLayer(page, body, withPng, tol);
        const lp = join(raw, `${id}.layer.png`);
        writeFileSync(lp, layer.png);
        quantWebp(lp, join(pub, `${id}.webp`)); copyFileSync(join(raw, `${id}.json`), join(pub, `${id}.json`));
        if (!have.has(id)) add.push([id, f.base.vmdl, f.base.args, parts.join(",")].join("\t"));
        if (src === "base") baseLayers[slot] = lp;
        if (size === "px2") { (entry.sources[src] ??= []).push(slot); if (!entry.slots.includes(slot)) entry.slots.push(slot); }
        console.log(`${size} ${id}: ${((layer.kept / layer.total) * 100).toFixed(1)}% листа`);
      }
      const ordered = DRAW_ORDER.filter((s) => baseLayers[s]).map((s) => baseLayers[s]);
      const chk = await page.evaluate(`${CHECK}(${JSON.stringify(readFileSync(body).toString("base64"))}, ${JSON.stringify([body, ...ordered].map((p) => readFileSync(p).toString("base64")))}, ${tol})`) as { opaque: number; bad: number };
      // Первый аргумент CHECK — образец, второй — тело и слои: композит сравнивается с `+ref`.
      const chk2 = await page.evaluate(`${CHECK}(${JSON.stringify(readFileSync(ref).toString("base64"))}, ${JSON.stringify([body, ...ordered].map((p) => readFileSync(p).toString("base64")))}, ${tol})`) as { opaque: number; bad: number };
      void chk;
      console.log(`${size} ${hero}: композит тела и базовых слоёв против образца — расхождение ${((chk2.bad / Math.max(1, chk2.opaque)) * 100).toFixed(2)}% (${chk2.bad} из ${chk2.opaque} px)`);
    }
    if (add.length) {
      const head = existsSync(partsMan) ? readFileSync(partsMan, "utf8").replace(/\n?$/, "\n") : `# Слои частей (T13.80): id \`<hero>+body\` и \`<hero>+<источник>.<слот>\`; листы собирает dota_part_layers.mts (разница рендеров одного кадрирования), не dota_pipeline.sh напрямую. Колонки как в основном манифесте.\n`;
      writeFileSync(partsMan, head + add.join("\n") + "\n");
    }
    console.log(`${size}: строк в ${partsMan} +${add.length}`);
  }
  await browser.close();
  // Таблица для игры: слоты в порядке отрисовки, источники → слоты, у которых есть слой.
  const tsPath = "src/game/arcade/content/parts.ts";
  const prev: Record<string, { slots: string[]; sources: Record<string, string[]> }> = existsSync(tsPath) ? JSON.parse(readFileSync(tsPath, "utf8").split("/* DATA */")[1].split("/* END */")[0]) : {};
  const merged = { ...prev, ...partsTs };
  for (const h of Object.keys(merged)) merged[h].slots = DRAW_ORDER.filter((s) => merged[h].slots.includes(s)).concat(merged[h].slots.filter((s) => !DRAW_ORDER.includes(s)));
  const data = JSON.stringify(merged, null, 2);
  writeFileSync(tsPath, `// Части героев по слотам Dota (T13.80). СГЕНЕРИРОВАНО scripts/dota_part_layers.mts build — не править руками:
// у каждого героя слоты в порядке отрисовки (снизу вверх) и источники частей (\`base\` — модель по умолчанию,
// \`<set>\` — сет \`<hero>@<set>\`) с теми слотами, под которые отрендерен слой \`<hero>+<источник>.<слот>\`.
// Лист тела — \`<hero>+body\`. Сборка облика — content/cosmetics.ts (loadoutSheet), рендер — features/arcade/sprites.ts.
export type DotaSlot = "back" | "mount" | "belt" | "armor" | "arms" | "shoulder" | "neck" | "misc" | "head" | "weapon";
export interface HeroParts { slots: readonly DotaSlot[]; sources: Readonly<Record<string, readonly DotaSlot[]>> }
export const HERO_PARTS: Readonly<Record<string, HeroParts>> = /* DATA */${data}/* END */;
`);
  console.log(`parts.ts: героев ${Object.keys(merged).length}`);
}
