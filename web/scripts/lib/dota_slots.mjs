// Слот части Dota по имени файла модели (T13.36/T13.80). Единственный источник: аудит слотов сетов
// (qa_set_slots.mjs) и сборка слоёв частей (dota_part_layers.mts) должны класть одну и ту же часть в один
// и тот же слот, иначе сет «перекроет» не то, что надел игрок.
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
/** Порядок отрисовки слоёв снизу вверх (T13.80): дальнее и крупное раньше, оружие и голова поверх. */
export const DRAW_ORDER = ["back", "mount", "belt", "armor", "arms", "shoulder", "neck", "misc", "head", "weapon"];
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
