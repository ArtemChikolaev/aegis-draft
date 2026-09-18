// Индекс предметов Dota по данным клиента (T13.80 A2): слот части берётся из `items_game.txt` (item ID, `item_slot`,
// `model_player`, `prefab`), а не угадывается по имени файла. Аудит 2026-09-15 показал, что догадка по имени кладёт голову
// арканы MK в misc, наручи Lina в misc и воротник в shoulder, а под именем арканы Lina лежит сет Battle Caster.
//
//   npx tsx scripts/dota_item_index.mts [--items <items_game.txt>] [--out scripts/blender/dota_item_index.json]
//
// Без `--items` файл достаётся из vpk через Source2Viewer-CLI во временную папку (как в dota_pipeline.sh: DOTA, S2V из env).
// Полный items_game.txt (50 МБ) в репозиторий не кладём: индекс содержит только модели, на которые ссылаются наши манифесты
// (`scripts/blender/dota_manifest*.tsv`), по одной записи на путь модели. Модель без записи в items_game — не ошибка индекса:
// её слот задаётся явно в `dota_slot_overrides.json` с причиной, иначе генератор слоёв останавливается (неизвестное ≠ misc).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const argv = process.argv.slice(2);
const opt = (k: string, d: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const OUT = opt("--out", "scripts/blender/dota_item_index.json");
const HOME = process.env.HOME ?? "";
const DOTA = process.env.DOTA ?? `${HOME}/Library/Application Support/Steam/steamapps/common/dota 2 beta/game/dota`;
const S2V = process.env.S2V ?? `${HOME}/tools/s2v/Source2Viewer-CLI`;

/** items_game.txt: `-f scripts/items/items_game.txt -o <path> -d` пишет ОДИН файл с именем `<path>` (см. память dota-vpk-source-of-truth). */
function itemsGamePath(): string {
  const given = opt("--items", "");
  if (given) return resolve(given);
  const dir = join(tmpdir(), "aegis-items-game");
  mkdirSync(dir, { recursive: true });
  const out = join(dir, "items_game.txt");
  if (!existsSync(out)) {
    const vpk = join(DOTA, "pak01_dir.vpk");
    if (!existsSync(vpk) || !existsSync(S2V)) throw new Error(`нет ${vpk} или ${S2V}: задай DOTA/S2V или --items <items_game.txt>`);
    execFileSync(S2V, ["-i", vpk, "-f", "scripts/items/items_game.txt", "-o", out, "-d"], { stdio: "ignore" });
  }
  return out;
}

/* ─── Valve KeyValues (текстовый формат items_game.txt): `"key" "value"` и `"key" { … }`, комментарии `//`. Ключи
   повторяются (несколько `asset_modifier`), поэтому объект хранит массив значений на ключ. ─── */
type KV = Map<string, (string | KV)[]>;
function parseKV(text: string): KV {
  let i = 0;
  const n = text.length;
  const skipWs = () => {
    for (;;) {
      while (i < n && (text[i] === " " || text[i] === "\t" || text[i] === "\n" || text[i] === "\r")) i++;
      if (i + 1 < n && text[i] === "/" && text[i + 1] === "/") { while (i < n && text[i] !== "\n") i++; continue; }
      return;
    }
  };
  const token = (): string | null => {
    skipWs();
    if (i >= n) return null;
    if (text[i] === "{" || text[i] === "}") return text[i++];
    if (text[i] === '"') {
      let s = "";
      i++;
      while (i < n && text[i] !== '"') { if (text[i] === "\\" && i + 1 < n) { i++; } s += text[i++]; }
      i++;
      return s;
    }
    let s = "";
    while (i < n && !/[\s{}"]/.test(text[i])) s += text[i++];
    return s;
  };
  const block = (): KV => {
    const m: KV = new Map();
    for (;;) {
      const k = token();
      if (k === null || k === "}") return m;
      const v = token();
      if (v === null) return m;
      const val: string | KV = v === "{" ? block() : v;
      (m.get(k) ?? m.set(k, []).get(k)!).push(val);
    }
  };
  return block();
}
const one = (m: KV | undefined, k: string): string | undefined => { const v = m?.get(k)?.[0]; return typeof v === "string" ? v : undefined; };
const sub = (m: KV | undefined, k: string): KV | undefined => { const v = m?.get(k)?.[0]; return v instanceof Map ? v : undefined; };

export interface IndexedItem {
  id: string;
  name: string;
  /** `item_slot` из предмета или его prefab; `hero_base` — аркана/персона со своей моделью тела. */
  slot: string;
  rarity?: string;
  hero?: string;
  prefab?: string;
  /** Число стилей (`visuals.styles`) — у аркан с текстурами. */
  styles?: number;
  /** `asset_modifier` типа `model`: при надетом предмете модель другого предмета подменяется (аркана MK меняет части
   *  сета Cult of the Demon Trickster на `*_arcana_*`). Путь → путь, без `_c`. */
  swaps?: Record<string, string>;
}
export interface ItemIndex {
  /** Дата и SHA-256 источника: индекс сверяется по конкретной сборке клиента. */
  source: { file: string; sha256: string; built: string };
  /** Путь модели (`models/…/x.vmdl`, без `_c`) → предмет. Несколько предметов на одну модель (сезонные перекраски) — первый по ID. */
  models: Record<string, IndexedItem>;
  /** Основы героя (`item_slot = hero_base`: арканы/персоны со своей моделью тела) по героям: у них нет `model_player`,
   *  тело задаёт `asset_modifier` типа `entity_model`. */
  bases: Record<string, IndexedItem[]>;
  /** Подмены модели сущности (`asset_modifier` типов `entity_model` и `hero_model_change`): скины форм (Метаморфоза TB, True Form LD, дракон DK — `asset`
   *  = модель базовой формы) и призывов без `model_player` (волки Lycan — `asset` = имя юнита). Путь модели скина → предмет. */
  entityModels: Record<string, IndexedItem & { asset: string }>;
}
const norm = (p: string) => p.replace(/\.vmdl_c$/, ".vmdl");

/** Все модели, на которые ссылаются манифесты (основная модель и части), без `_c`. */
function manifestModels(): Set<string> {
  const out = new Set<string>();
  const dir = "scripts/blender";
  for (const f of readdirSync(dir)) {
    if (!/^dota_manifest.*\.tsv$/.test(f)) continue;
    for (const line of readFileSync(join(dir, f), "utf8").split("\n")) {
      if (!line || line.startsWith("#")) continue;
      const c = line.split("\t");
      if (c[1]) out.add(norm(c[1]));
      for (const p of (c[3] ?? "").split(",").filter(Boolean)) out.add(norm(p));
    }
  }
  return out;
}

export function buildIndex(itemsFile: string, wanted: Set<string>): ItemIndex {
  // Герои, чьи модели есть в манифестах: для них собираем и основы (hero_base) — арканы с другой моделью тела.
  const wantedHeroes = new Set([...wanted].map((m) => m.split("/")[2]).filter(Boolean));
  const text = readFileSync(itemsFile, "utf8");
  const sha256 = execFileSync("shasum", ["-a", "256", itemsFile]).toString().split(" ")[0];
  const root = sub(parseKV(text), "items_game");
  const prefabs = sub(root, "prefabs");
  const items = sub(root, "items");
  if (!items) throw new Error(`${itemsFile}: нет блока items_game.items`);
  const models: Record<string, IndexedItem> = {};
  const bases: Record<string, IndexedItem[]> = {};
  const inherited = (item: KV, key: string): string | undefined => {
    const own = one(item, key);
    if (own) return own;
    // prefab может быть цепочкой через пробел (`wearable default_item`): первый, у кого есть ключ.
    for (const p of (one(item, "prefab") ?? "").split(/\s+/).filter(Boolean)) {
      const pf = sub(prefabs, p);
      const v = one(pf, key);
      if (v) return v;
    }
    return undefined;
  };
  const entryOf = (id: string, item: KV): IndexedItem => {
    const heroes = sub(item, "used_by_heroes");
    const hero = heroes ? [...heroes.keys()][0]?.replace(/^npc_dota_hero_/, "") : undefined;
    const visuals = sub(item, "visuals");
    const styles = sub(visuals, "styles");
    const entry: IndexedItem = { id, name: one(item, "name") ?? "", slot: inherited(item, "item_slot") ?? "?" };
    const rarity = inherited(item, "item_rarity"); if (rarity) entry.rarity = rarity;
    if (hero) entry.hero = hero;
    const prefab = one(item, "prefab"); if (prefab) entry.prefab = prefab;
    if (styles && styles.size > 1) entry.styles = styles.size;
    const swaps: Record<string, string> = {};
    for (const [k, vals] of visuals ?? []) {
      if (!k.startsWith("asset_modifier")) continue;
      for (const v of vals) {
        if (!(v instanceof Map) || one(v, "type") !== "model") continue;
        const asset = one(v, "asset"), modifier = one(v, "modifier");
        if (asset && modifier) swaps[norm(asset)] = norm(modifier);
      }
    }
    if (Object.keys(swaps).length) entry.swaps = swaps;
    return entry;
  };
  const entityModels: Record<string, IndexedItem & { asset: string }> = {};
  for (const [id, raw] of items) {
    const item = raw[0];
    if (!(item instanceof Map)) continue;
    for (const [k, vals] of sub(item, "visuals") ?? []) {
      if (!k.startsWith("asset_modifier")) continue;
      for (const v of vals) {
        // `entity_model` — подмена модели юнита (волки Lycan, аркана TB), `hero_model_change` — модели формы (демон TB, True Form LD, дракон DK).
        if (!(v instanceof Map) || !["entity_model", "hero_model_change"].includes(one(v, "type") ?? "")) continue;
        const asset = one(v, "asset"), modifier = one(v, "modifier");
        if (!asset || !modifier || !wanted.has(norm(modifier)) || entityModels[norm(modifier)] || norm(asset) === norm(modifier)) continue;
        const e = entryOf(id, item);
        delete e.swaps;
        entityModels[norm(modifier)] = { ...e, asset: norm(asset) };
      }
    }
    const model = one(item, "model_player");
    if (!model) {
      // Основа героя: аркана/персона без model_player (тело — entity_model). Нужны только те, у кого есть герой.
      if (inherited(item, "item_slot") !== "hero_base") continue;
      const e = entryOf(id, item);
      if (e.hero && wantedHeroes.has(e.hero)) (bases[e.hero] ??= []).push(e);
      continue;
    }
    const key = norm(model);
    if (!wanted.has(key) || models[key]) continue;
    models[key] = entryOf(id, item);
  }
  const sorted = <T,>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  return { source: { file: "scripts/items/items_game.txt", sha256, built: new Date().toISOString().slice(0, 10) }, models: sorted(models), bases: sorted(bases), entityModels: sorted(entityModels) };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop()!)) {
  const wanted = manifestModels();
  const index = buildIndex(itemsGamePath(), wanted);
  writeFileSync(OUT, JSON.stringify(index, null, 2) + "\n");
  const missing = [...wanted].filter((m) => !index.models[m]).sort();
  console.log(`${OUT}: моделей в манифестах ${wanted.size}, найдено в items_game ${Object.keys(index.models).length}, без записи ${missing.length}`);
  for (const m of missing) console.log(`  нет в items_game: ${m}`);
}
