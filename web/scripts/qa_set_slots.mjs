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
// Слот по токенам имени файла (без префикса героя): первый совпавший токен решает.
const SLOT_TOKENS = {
  head: ["head", "hat", "helm", "helmet", "hair", "horn", "horns", "mask", "face", "crown", "hood", "skull", "beard", "cowl", "bandana", "goggles", "veil", "jaw", "antlers", "mohawk", "ear", "ears", "goblinhat"],
  arms: ["arm", "arms", "bracer", "bracers", "gauntlet", "gauntlets", "glove", "gloves", "hand", "hands", "sleeve", "sleeves", "wrist", "claw", "claws", "leftarm", "rightarm", "demonarm"],
  back: ["back", "cape", "cloak", "wing", "wings", "scabbard", "quiver", "sheath", "banner", "pack", "tail", "ponytail", "backitem"],
  weapon: ["weapon", "weapon1", "weapon2", "sword", "swords", "blade", "blades", "axe", "gun", "rifle", "staff", "bow", "hammer", "mace", "club", "dagger", "spear", "scythe", "lance", "whip", "glaive", "shield", "offhand", "off", "rod", "wand", "hook", "anchor", "chainsaw", "crossbow", "sickle", "guns"],
  shoulder: ["shoulder", "shoulders", "pauldron", "pauldrons", "pads", "shoulderbottles"],
  belt: ["belt", "loincloth", "skirt", "pants", "legs", "leg", "waist", "boot", "boots", "feet", "foot", "tass", "tassets"],
  armor: ["armor", "armour", "vest", "torso", "chest", "body", "robe", "tunic", "coat", "dress", "dresstop", "upper", "fur", "shirt"],
  neck: ["neck", "necklace", "collar", "scarf"],
  mount: ["mount", "rider", "goblin", "saddle", "steed", "horse", "saddlehat", "cart"],
  misc: ["bottle", "lantern", "gem", "orb", "rotor", "propeller", "misc", "jar", "flask", "totem", "bag", "flower", "abdomen", "spike", "chain", "foliage", "amour"],
};
const stripHero = (name, hero, folder) => name.replace(new RegExp(`^(${hero}|${folder}|${hero.replace(/_/g, "")}|${folder.replace(/_/g, "")})_?`, "i"), "");
const slotOf = (part, hero, folder) => {
  const raw = part.split("/").pop().replace(/\.vmdl_c$/, "");
  const name = stripHero(raw, hero, folder);
  const tokens = name.toLowerCase().split(/[_\W]+/).filter(Boolean);
  // Сначала точное совпадение токена, потом составные слова (headitem, shoulderpads, lweapon, backpack) — по подстроке
  // от 4 символов, чтобы «ear» не ловил «spear». Порядок слотов: mount раньше armor (mount_armor у Chen — маунт).
  const order = ["mount", "head", "arms", "back", "weapon", "shoulder", "belt", "neck", "misc", "armor"];
  for (const slot of order) if (tokens.some((t) => SLOT_TOKENS[slot].includes(t))) return slot;
  for (const slot of order) if (tokens.some((t) => SLOT_TOKENS[slot].some((k) => k.length >= 4 && t.includes(k)))) return slot;
  return "?" + (tokens[0] ?? raw); // уникальный слот (foliage, abdomen…): сет его не перекрывает — оставляем
};
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
