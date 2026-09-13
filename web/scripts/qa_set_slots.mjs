// Аудит слотов сетов (T13.36, 2026-09-12): у строки `<hero>@<set>` части сета перекрывают части базовой строки по слотам;
// базовая часть, слот которой сет не перекрыл (винт Gyrocopter, гоблин-наездник Alchemist, маунт Abaddon), должна остаться
// в строке сета — так делает и Dota: слот без предмета сета показывает предмет по умолчанию.
//   node scripts/qa_set_slots.mjs [manifest.tsv]            — отчёт
//   node scripts/qa_set_slots.mjs [manifest.tsv] --apply     — дописать непокрытые базовые части в строки сетов и вывести
//                                                              затронутые строки (TSV) в stdout для перерендера
import { readFileSync, writeFileSync } from "node:fs";
const argv = process.argv.slice(2);
const manifest = argv.find((a) => !a.startsWith("--")) ?? "scripts/blender/dota_manifest_px2.tsv";
const apply = argv.includes("--apply");
// Слот по токенам имени файла — общий модуль с dota_part_layers.mts (T13.80).
import { slotOf } from "./lib/dota_slots.mjs";
const rows = readFileSync(manifest, "utf8").split("\n").filter((l) => l && !l.startsWith("#")).map((l) => l.split("\t"));
const base = new Map(rows.filter((c) => !c[0].includes("@")).map((c) => [c[0], c]));
let issues = 0; const changed = [];
for (const c of rows) {
  if (!c[0].includes("@") || c[0].endsWith("@meta") || c[0].includes("@arcana") || c[0].includes("@persona")) continue;
  const hero = c[0].split("@")[0]; const b = base.get(hero); if (!b || !b[3]) continue;
  if (c[1] !== b[1]) continue; // другая модель тела — не сет поверх базы
  const folder = c[1].split("/")[2];
  const setParts = (c[3] ?? "").split(",").filter(Boolean), baseParts = b[3].split(",").filter(Boolean);
  const covered = new Set(setParts.map((p) => slotOf(p, hero, folder)));
  const kept = new Set(setParts);
  const missing = baseParts.filter((p) => !kept.has(p) && !covered.has(slotOf(p, hero, folder)));
  if (!missing.length) continue;
  issues++;
  console.error(`${c[0]}: без замены в сете → ${missing.map((p) => `${p.split("/").pop().replace(/\.vmdl_c$/, "")}[${slotOf(p, hero, folder)}]`).join(", ")}`);
  if (apply) { c[3] = [...setParts, ...missing].join(","); changed.push(c); }
}
if (apply) {
  writeFileSync(manifest, rows.map((c) => c.join("\t")).join("\n") + "\n");
  process.stdout.write(changed.map((c) => c.join("\t")).join("\n") + "\n");
}
console.error(`строк-сетов с непокрытыми базовыми частями: ${issues}${apply ? " — дописано в манифест" : ""}`);
