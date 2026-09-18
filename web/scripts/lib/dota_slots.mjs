// Слот части Dota (T13.36/T13.80). Два источника:
//   1. `indexedSlot` — по данным клиента: `scripts/blender/dota_item_index.json` (item ID → `item_slot`, собирает
//      dota_item_index.mts из items_game.txt) плюс явные `dota_slot_overrides.json` с причиной для моделей без предмета.
//      Этим пользуется сборка слоёв частей (dota_part_layers.mts): неизвестная модель останавливает генератор, а не
//      уходит молча в misc (аудит 2026-09-15: догадка по имени клала голову арканы MK в misc, наручи Lina в misc).
//   2. `slotOf` — догадка по токенам имени файла: только для аудита строк сетов (qa_set_slots.mjs), где нужен быстрый
//      обзор всех героев, включая тех, чьих моделей ещё нет в индексе.
import { existsSync, readFileSync } from "node:fs";

export const SLOT_TOKENS = {
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
/** Порядок распознавания: mount раньше armor (mount_armor у Chen — маунт). */
export const SLOT_ORDER = ["mount", "head", "arms", "back", "weapon", "shoulder", "belt", "neck", "misc", "armor"];
/** Порядок отрисовки слоёв снизу вверх (T13.80): дальнее и крупное раньше, оружие и голова поверх. Семантический слот
 *  Dota (`item_slot`) и порядок отрисовки — разные вещи: тут только порядок; слот, которого здесь нет, генератор не берёт. */
// Волна героев 2026-09-19 добавила слоты Dota, которых не было у первых шести героев: `tail` (хвост — позади тела), `costume`
// (цельное одеяние поверх брони), `gloves` (вместе с руками), `body_head` (лицо/голова самого героя — ПОД шлемом слота `head`,
// шлем его не заменяет) и `offhand_weapon` (вторая рука — поверх всего, как оружие).
export const DRAW_ORDER = ["back", "tail", "mount", "legs", "belt", "armor", "costume", "arms", "gloves", "shoulder", "neck", "misc", "body_head", "head", "weapon", "offhand_weapon"];
const stripHero = (name, hero, folder) => name.replace(new RegExp(`^(${hero}|${folder}|${hero.replace(/_/g, "")}|${folder.replace(/_/g, "")})_?`, "i"), "");
export const slotOf = (part, hero, folder) => {
  const raw = part.split("/").pop().replace(/\.vmdl_c$/, "");
  const name = stripHero(raw, hero, folder);
  const tokens = name.toLowerCase().split(/[_\W]+/).filter(Boolean);
  // Сначала точное совпадение токена, потом составные слова (headitem, shoulderpads, lweapon, backpack) — по подстроке
  // от 4 символов, чтобы «ear» не ловил «spear».
  for (const slot of SLOT_ORDER) if (tokens.some((t) => SLOT_TOKENS[slot].includes(t))) return slot;
  for (const slot of SLOT_ORDER) if (tokens.some((t) => SLOT_TOKENS[slot].some((k) => k.length >= 4 && t.includes(k)))) return slot;
  return "?" + (tokens[0] ?? raw); // уникальный слот (foliage, abdomen…): сет его не перекрывает — оставляем
};

/** Путь модели без `_c`: так ключуется индекс. */
export const modelKey = (p) => p.replace(/\.vmdl_c$/, ".vmdl");

let cache = null;
/** Индекс предметов и оверрайды (грузятся один раз). `root` — папка `scripts/blender`. */
export function loadSlotIndex(root = "scripts/blender") {
  if (cache) return cache;
  const ixPath = `${root}/dota_item_index.json`, ovPath = `${root}/dota_slot_overrides.json`;
  if (!existsSync(ixPath)) throw new Error(`нет ${ixPath}: собери индекс — npx tsx scripts/dota_item_index.mts`);
  const index = JSON.parse(readFileSync(ixPath, "utf8"));
  const overrides = existsSync(ovPath) ? JSON.parse(readFileSync(ovPath, "utf8")) : {};
  delete overrides._;
  cache = { index, overrides };
  return cache;
}

/**
 * Слот модели по данным Dota: `{ slot, item }` из индекса или `{ slot, why }` из оверрайдов; null — неизвестно.
 * Слоты Dota, которых нет в DRAW_ORDER (offhand_weapon, tail, costume…), тоже возвращаются как есть — решать вызывающему.
 */
export function indexedSlot(part, root) {
  const { index, overrides } = loadSlotIndex(root);
  const key = modelKey(part);
  const item = index.models[key];
  if (item) return { slot: item.slot, item };
  const ov = overrides[key];
  if (ov) return { slot: ov.slot, why: ov.why };
  return null;
}
