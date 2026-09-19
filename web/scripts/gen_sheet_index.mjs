// Индекс спрайт-листов Аркады: `public/art/sprites/<набор>/index.json` — отсортированные имена листов набора
// (пара `<имя>.json` + `<имя>.webp`) и файлов `terrain/`. Загрузчик (src/features/arcade/sprites.ts) читает индекс
// набора один раз и про лист, которого в нём нет, отвечает «missing» без сетевого запроса. Раньше отсутствие
// узнавалось пробой 404 (`dota_px2/` → `dota_px/`): пять ошибок консоли на старте забега и десятки — в гардеробе.
//
// Вместе с индексами пишется `src/features/arcade/sheetIndexRev.ts` — короткий хеш содержимого каждого индекса.
// Загрузчик просит `index.json?v=<хеш>`: service worker отдаёт арт спрайтов cache-first и чистит его только при
// смене сборки, поэтому без версии в адресе устаревший индекс объявлял бы новые листы отсутствующими.
//
// Запуск: npm run gen:sheets-index [-- --check]
//   --check — ничего не писать, код выхода 1, если файлы на диске расходятся с каталогами.
// Запускать после любого добавления/удаления листов (рендер, `dota_part_layers.mts build`, чистка наборов);
// забытую перегенерацию ловит test/arcadeSheetIndex.test.ts.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SPRITES = join(ROOT, "public/art/sprites");
const REV_FILE = join(ROOT, "src/features/arcade/sheetIndexRev.ts");
const CHECK = process.argv.includes("--check");

/** Индекс одного набора; null — в каталоге нет ни одного листа Dota (например, `lpc/`). */
function buildIndex(dir) {
  const files = new Set(readdirSync(dir));
  const sheets = [...files]
    .filter((f) => f.endsWith(".json") && f !== "index.json" && files.has(`${f.slice(0, -5)}.webp`))
    .map((f) => f.slice(0, -5))
    .sort();
  if (sheets.length === 0) return null;
  const terrainDir = join(dir, "terrain");
  const terrain = existsSync(terrainDir)
    ? readdirSync(terrainDir).filter((f) => f.endsWith(".webp")).map((f) => f.slice(0, -5)).sort()
    : [];
  return { sheets, terrain };
}

const sets = readdirSync(SPRITES).filter((d) => statSync(join(SPRITES, d)).isDirectory()).sort();
const revs = {};
let stale = 0;
for (const set of sets) {
  const index = buildIndex(join(SPRITES, set));
  if (!index) continue;
  const text = `${JSON.stringify(index, null, 1)}\n`;
  revs[set] = createHash("sha256").update(text).digest("hex").slice(0, 10);
  const file = join(SPRITES, set, "index.json");
  const same = existsSync(file) && readFileSync(file, "utf8") === text;
  if (!same) { stale++; if (!CHECK) writeFileSync(file, text); }
  console.log(`${set}: ${index.sheets.length} листов, terrain ${index.terrain.length}${same ? "" : CHECK ? " — УСТАРЕЛ" : " — записан"}`);
}

const revText = `// Генерируется scripts/gen_sheet_index.mjs (npm run gen:sheets-index) — руками не править.
// Хеш содержимого \`public/art/sprites/<набор>/index.json\`: уходит в адрес запроса индекса, чтобы кэш service worker'а
// не отдавал индекс прошлой сборки.
export const SHEET_INDEX_REV: Readonly<Record<string, string>> = ${JSON.stringify(revs, null, 2)};
`;
const revSame = existsSync(REV_FILE) && readFileSync(REV_FILE, "utf8") === revText;
if (!revSame) { stale++; if (!CHECK) writeFileSync(REV_FILE, revText); }
if (CHECK && stale > 0) { console.error("Индекс листов устарел: npm run gen:sheets-index"); process.exit(1); }
