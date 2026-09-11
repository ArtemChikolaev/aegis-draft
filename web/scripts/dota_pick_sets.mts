// Автоподбор сетов Dota для обликов Аркады (T13.27/T13.36, 2026-09-12): по списку моделей vpk (scripts/dota_vpk_list.mts)
// для каждого героя из манифеста собирает сеты — группы частей `<set>_<слот>` в `models/items/<hero>/…` — и печатает
// строки манифеста для лучшего ещё не заведённого сета (больше слотов; служебные/событийные по имени отброшены).
//   npx tsx scripts/dota_vpk_list.mts models/items/ --ext vmdl_c > items.txt
//   npx tsx scripts/dota_pick_sets.mts items.txt [--heroes a,b,c] [--min-slots 4] [--px2 manifest_px2.tsv] [--px manifest_px.tsv]
// Выход: stdout — TSV строк для px2; файл <px>.out — для px; stderr — сводка. Проверка глазами обязательна (скилл arcade-assets).
import { readFileSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const opt = (k: string, d: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const items = readFileSync(argv[0], "utf8").split("\n").filter((l) => l.startsWith("models/items/") && l.endsWith(".vmdl_c"));
const px2Path = opt("--px2", "scripts/blender/dota_manifest_px2.tsv"), pxPath = opt("--px", "scripts/blender/dota_manifest_px.tsv");
const minSlots = Number(opt("--min-slots", "4"));
const onlyHeroes = new Set(opt("--heroes", "").split(",").filter(Boolean));

const SLOTS = ["head", "arms", "legs", "back", "weapon", "shoulder", "shoulders", "belt", "off_hand", "offhand", "mount", "tail", "neck", "misc", "armor", "cape", "bracer", "gun", "hands", "torso", "body", "wings", "helmet", "hat"];
const BAD = /(^|_)(ti\d+|dotapit\d*|aghsbp|frostivus\d*|spring\d{4}|fall\d{4}|winter\d{4}|summer\d{4}|cache|dplus|cavern_crawl|\d{4}|debut|arcana|persona|rainbow|effigy|ward|courier|loadout|dummy|physics|hitbox|fx|ability|familiar|ambient|base|style\d*|low|lod\d|alt|gold|golden|prestige|unusual|kinetic|taunt|mount_fx|weapon_fx|spirit|pet|summon|treant|hawk|boar|wolf_pet|illusion)(_|$)/;

const parseRow = (l: string) => { const c = l.split("\t"); return { id: c[0], vmdl: c[1], args: c[2], parts: c[3] ?? "" }; };
const px2 = readFileSync(px2Path, "utf8").split("\n").filter((l) => l && !l.startsWith("#")).map(parseRow);
const px = readFileSync(pxPath, "utf8").split("\n").filter((l) => l && !l.startsWith("#")).map(parseRow);
const baseRows = px2.filter((r) => !r.id.includes("@") && r.vmdl.startsWith("models/heroes/"));
const used = new Set<string>();
for (const r of px2) if (r.id.includes("@")) for (const p of r.parts.split(",")) { const m = p.match(/^models\/items\/[^/]+\/([^/]+)\//); if (m) used.add(m[1].replace(/_(head|arms|legs|back|weapon|shoulder|shoulders|belt|off_hand|mount|tail|neck|misc|armor|cape)$/, "")); }
const skinsPerHero = new Map<string, number>();
for (const r of px2) if (r.id.includes("@")) { const h = r.id.split("@")[0]; skinsPerHero.set(h, (skinsPerHero.get(h) ?? 0) + 1); }

interface Part { path: string; slot: string; set: string }
const byHeroFolder = new Map<string, Part[]>();
for (const path of items) {
  const seg = path.split("/"); // models items <hero> ... file
  const hero = seg[2], file = seg[seg.length - 1].replace(/\.vmdl_c$/, "");
  let name = file.replace(/_(high|hi)$/, "");
  if (/_(low|lod\d)$/.test(file)) continue;
  const slot = SLOTS.find((s) => name.endsWith("_" + s));
  if (!slot) continue;
  const set = name.slice(0, -(slot.length + 1));
  if (!set || BAD.test(set) || BAD.test(file)) continue;
  (byHeroFolder.get(hero) ?? byHeroFolder.set(hero, []).get(hero)!).push({ path, slot, set });
}

const outPx2: string[] = [], outPx: string[] = [], summary: string[] = [];
for (const base of baseRows) {
  const hero = base.id;
  if (onlyHeroes.size && !onlyHeroes.has(hero)) continue;
  const folder = base.vmdl.split("/")[2];
  const parts = byHeroFolder.get(folder) ?? byHeroFolder.get(hero) ?? [];
  const sets = new Map<string, Part[]>();
  for (const p of parts) (sets.get(p.set) ?? sets.set(p.set, []).get(p.set)!).push(p);
  const ranked = [...sets.entries()].map(([set, ps]) => { const slots = new Map<string, Part>(); for (const p of ps) if (!slots.has(p.slot) || /_high\.vmdl_c$/.test(p.path)) slots.set(p.slot, p); return { set, slots: [...slots.values()] }; })
    .filter((s) => s.slots.length >= minSlots && !used.has(s.set)).sort((a, b) => b.slots.length - a.slots.length || a.set.localeCompare(b.set));
  if (!ranked.length) { summary.push(`${hero}: нет сета (${sets.size} групп, слотов < ${minSlots} или уже заведены)`); continue; }
  const best = ranked[0];
  const skinId = best.set.replace(new RegExp(`^${folder}_|^${hero}_`), "").replace(/^_+|_+$/g, "").replace(/_set$/, "");
  const id = `${hero}@${skinId}`;
  const partList = best.slots.map((p) => p.path).join(",");
  outPx2.push([id, base.vmdl, base.args, partList].join("\t"));
  const pxBase = px.find((r) => r.id === hero);
  if (pxBase) outPx.push([id, base.vmdl, pxBase.args, partList].join("\t"));
  summary.push(`${hero}: ${best.set} (${best.slots.map((p) => p.slot).join("+")}) · обликов уже ${skinsPerHero.get(hero) ?? 0}`);
}
process.stdout.write(outPx2.join("\n") + "\n");
writeFileSync(pxPath + ".out", outPx.join("\n") + "\n");
console.error(summary.join("\n"));
console.error(`строк px2: ${outPx2.length}, px: ${outPx.length} (файл ${pxPath}.out)`);
