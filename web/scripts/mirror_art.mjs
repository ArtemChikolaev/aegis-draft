// Зеркало игрового арта Dota 2 к себе (T11.2, ADR 0003): портреты героев, логотипы команд и
// иконки предметов кладём в web/public/art/*.webp и отдаём со СВОЕГО origin.
//
// Зачем, если картинки и так есть на Steam CDN:
//   • ОФЛАЙН. Чужой origin отдаёт `ACAO: https://www.dota2.com`, то есть его ответы для нас
//     opaque: их нельзя проверить (страница captive-portal закэшируется как «картинка») и они
//     раздувают квоту. Своя статика кэшируется service worker'ом наравне с оболочкой.
//   • ВЕС. Оригиналы рассчитаны не на наши плашки: портрет 61 КБ грузится под картинку 34×19,
//     логотип 53 КБ — под знак 22×22. После webp это ~10 КБ и ~3 КБ.
//   • CANVAS. Cross-origin картинка «пачкает» canvas, из-за чего шеринг-карточка рисуется без
//     портретов (T7.1). Своя — не пачкает.
//
// Никакой обработки, кроме масштаба и перекодирования: арт остаётся артом Valve, атрибуция —
// в manifest.source и в UI. Файлы коммитятся в git (решение владельца 2026-08-13): офлайн не
// должен зависеть от того, какие экраны игрок успел открыть до самолёта.
//
// Запуск: npm run gen:art [-- --force | -- --check]
//   --force — перекодировать даже то, что уже лежит (смена качества/размера).
//   --check — ничего не качать, только сказать, для кого зеркала нет (для крона data-refresh:
//             датасет обновляется ежедневно, а зеркало — руками, и расхождение должно быть видно).
//
// Отсутствующий локальный файл — НЕ ошибка: компоненты падают на CDN, а потом на монограмму.
// Поэтому 404 у исторической команды просто считается и не валит прогон.
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ITEM_ART } from "../src/game/itemArt.ts";
import { SCHOOL_ART } from "../src/game/arcade/content/schools.ts";
import { ARCADE_ITEMS } from "../src/game/arcade/content/items.ts";
import { NEUTRALS } from "../src/game/arcade/content/neutrals.ts";
import { GEAR_BASES, UNIQUES } from "../src/game/arcade/content/gear.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = resolve(ROOT, "public/data");
const ART_DIR = resolve(ROOT, "public/art");
const FORCE = process.argv.includes("--force");
const CHECK_ONLY = process.argv.includes("--check");
/** Кого на CDN нет вовсе. Файл ведёт сам скрипт, чтобы `--check` не ругался вечно на исторические
 *  команды без знака: у них нет картинки в природе, и это нормальное состояние, а не пробел. */
const MISSING_FILE = resolve(ART_DIR, "missing.json");
/** Контакт в User-Agent — то же правило вежливости, что для API-источников (скилл external-data-etl). */
const UA = "aegis-draft-art-mirror/1.0 (+https://github.com/ArtemChikolaev/aegis-draft)";
const HERO_CDN = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes";
const ITEM_CDN = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items";
/** Одновременных загрузок: CDN отдаёт быстро, но толпой ходить незачем. */
const CONCURRENCY = 6;
const QUALITY = 0.82;

/** Целевые размеры = максимум, в котором картинка реально показывается, ×2 под retina.
 *  Больше исходника не растягиваем (в источнике деталей всё равно нет). */
const KINDS = {
  // Портрет в карточке пика тянется на всю ширину карточки (16:9) — исходные 256×144 и есть потолок.
  heroes: { box: [256, 144] },
  // Знак команды показывается максимум 56×56 (TeamLogo.lg) — 128 хватает с запасом.
  teams: { box: [128, 128] },
  // Иконка предмета максимум 44×32 (ItemIcon.md) — исходные 88×64 ровно ×2.
  items: { box: [88, 64] },
};

const json = async (name) => JSON.parse(await readFile(resolve(DATA_DIR, name), "utf8"));

/** Что зеркалим: список {kind, name, url}. Источник имён — те же файлы, что читает игра. */
async function collectTargets() {
  const heroes = await json("heroes.json");
  const packs = await json("packs.json");
  const logos = new Map();
  for (const pack of packs) if (pack.logoUrl) logos.set(pack.teamId, pack.logoUrl);

  return [
    ...heroes
      .filter((hero) => hero.picture)
      .map((hero) => ({ kind: "heroes", name: hero.picture, url: `${HERO_CDN}/${hero.picture}.png` })),
    ...[...logos].map(([teamId, url]) => ({ kind: "teams", name: String(teamId), url })),
    // Значения ITEM_ART — реальные внутренние имена Dota (см. комментарий в itemArt.ts),
    // поэтому берём именно их, а не ключи каталога.
    // Аркада (M13): иконки школ, предметов лавки и нейтралок — те же внутренние имена Dota.
    ...[...new Set([...Object.values(ITEM_ART), ...Object.values(SCHOOL_ART), ...ARCADE_ITEMS.map((i) => i.art), ...NEUTRALS.map((n) => n.id), ...GEAR_BASES.map((b) => b.art), ...Object.values(UNIQUES).map((u) => u.art)])].map((slug) => ({ kind: "items", name: slug, url: `${ITEM_CDN}/${slug}.png` })),
  ];
}

async function fetchBytes(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
      if (res.status === 404) return null; // нет такой картинки — штатный случай
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((done) => setTimeout(done, 400 * attempt));
    }
  }
  return null;
}

/**
 * Перекодирование в WEBP через canvas самого Chromium — тем же приёмом, что splash-иконка в
 * render_bot_assets.mjs: тащить нативный кодировщик в зависимости ради этого не нужно.
 * Картинку отдаём страницей как data:-URL, поэтому canvas не «пачкается» чужим origin.
 * Пропорция сохраняется (логотипы бывают не квадратные, а CSS показывает их `object-fit: contain`).
 */
async function toWebp(page, bytes, [maxWidth, maxHeight]) {
  const dataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
  const encoded = await page.evaluate(async ({ src, maxWidth, maxHeight, quality }) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const context = canvas.getContext("2d");
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { url: canvas.toDataURL("image/webp", quality), width: canvas.width, height: canvas.height };
  }, { src: dataUrl, maxWidth, maxHeight, quality: QUALITY });
  if (!encoded.url.startsWith("data:image/webp")) throw new Error("Chromium не отдал WEBP");
  return { bytes: Buffer.from(encoded.url.split(",")[1], "base64"), width: encoded.width, height: encoded.height };
}

const exists = async (file) => stat(file).then(() => true, () => false);

const targets = await collectTargets();
for (const kind of Object.keys(KINDS)) await mkdir(resolve(ART_DIR, kind), { recursive: true });
const knownMissing = new Set(await readFile(MISSING_FILE, "utf8").then(JSON.parse, () => []));

if (CHECK_ONLY) {
  const gaps = [];
  for (const item of targets) {
    const id = `${item.kind}/${item.name}`;
    if (knownMissing.has(id)) continue; // картинки нет на CDN — в UI останется фолбэк, это норма
    if (!(await exists(resolve(ART_DIR, item.kind, `${item.name}.webp`)))) gaps.push(id);
  }
  if (gaps.length === 0) {
    console.log(`зеркало арта полное: ${targets.length} сущностей`);
    process.exit(0);
  }
  console.error(`нет зеркала для ${gaps.length}: ${gaps.slice(0, 20).join(", ")}${gaps.length > 20 ? " …" : ""}`);
  console.error("это не поломка (UI возьмёт картинку с CDN), но офлайн их не увидит — прогони `npm run gen:art`");
  process.exit(1);
}

// Playwright подгружаем ЛЕНИВО: режим `--check` должен работать без установленных зависимостей —
// его гоняет крон data-refresh, где `npm ci` во web не делается вовсе.
const { chromium } = await import("@playwright/test");
const browser = await chromium.launch();
const stats = { written: 0, skipped: 0, missing: [], bytes: 0 };
try {
  const pages = await Promise.all(Array.from({ length: CONCURRENCY }, () => browser.newPage()));
  const queue = [...targets];
  await Promise.all(pages.map(async (page) => {
    await page.setContent("<body></body>");
    for (let item = queue.shift(); item; item = queue.shift()) {
      const file = resolve(ART_DIR, item.kind, `${item.name}.webp`);
      if (!FORCE && (await exists(file))) { stats.skipped++; continue; }
      const source = await fetchBytes(item.url);
      if (!source) { stats.missing.push(`${item.kind}/${item.name}`); continue; }
      const { bytes } = await toWebp(page, source, KINDS[item.kind].box);
      await writeFile(file, bytes);
      stats.written++;
      stats.bytes += bytes.length;
    }
  }));
} finally {
  await browser.close();
}

console.log(`зеркало арта: записано ${stats.written}, пропущено (уже есть) ${stats.skipped}, ${(stats.bytes / 1024 / 1024).toFixed(2)} МБ`);

// Список «нет на CDN» переписываем, только если прошли ВСЕ цели: при частичном прогоне
// (пропуск уже скачанного) в нём остались бы лишь новички, и `--check` начал бы ругаться на
// давно известные пробелы. Норма, а не сбой: у части исторических команд знака нет в природе.
const seenAll = stats.skipped === 0;
const missing = seenAll ? stats.missing : [...new Set([...knownMissing, ...stats.missing])];
await writeFile(MISSING_FILE, `${JSON.stringify(missing.sort(), null, 2)}\n`);
if (stats.missing.length > 0) {
  console.log(`нет на CDN (${stats.missing.length}): ${stats.missing.slice(0, 12).join(", ")}${stats.missing.length > 12 ? " …" : ""}`);
}
