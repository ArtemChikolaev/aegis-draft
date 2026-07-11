#!/usr/bin/env node
// Лёгкая проверка сгенерированных data JSON против schema/ (zero-dep).
// Не полный JSON Schema валидатор — ловит частые поломки: тип верхнего уровня,
// required-поля в элементах массива, единый accountId (нет steamId).
// Полную валидацию делать через ajv: `npx ajv-cli validate -s <schema> -d <data>`.
//
// Использование: node validate_data.mjs [dataDir=web/public/data]
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..", "..", "..");
const schemaDir = join(repo, "schema");
// resolve корректно обрабатывает и относительный, и абсолютный путь аргумента.
const dataDir = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : join(repo, "web", "public", "data");

// data-файл -> schema-файл
const MAP = {
  "manifest.json": "manifest.schema.json",
  "events.json": "events.schema.json",
  "heroes.json": "heroes.schema.json",
  "packs.json": "packs.schema.json",
  "players.json": "players.schema.json",
  "playerHeroStats.json": "playerHeroStats.schema.json",
  "teammates.json": "teammates.schema.json",
  "squadSynergy.json": "squadSynergy.schema.json",
  "eventHeroStats.json": "eventHeroStats.schema.json",
  "teamSuccess.json": "teamSuccess.schema.json",
};

let errors = 0;
const err = (m) => { console.error("  ❌ " + m); errors++; };
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

if (!existsSync(dataDir)) {
  console.error(`Нет каталога данных: ${dataDir}\n(данные генерирует пайплайн — сначала собери их)`);
  process.exit(1);
}

for (const [dataFile, schemaFile] of Object.entries(MAP)) {
  const dPath = join(dataDir, dataFile);
  const sPath = join(schemaDir, schemaFile);
  if (!existsSync(dPath)) { console.log(`• ${dataFile}: нет файла (пропуск)`); continue; }
  console.log(`• ${dataFile}`);
  let data, schema;
  try { data = readJson(dPath); } catch (e) { err(`не парсится: ${e.message}`); continue; }
  try { schema = readJson(sPath); } catch (e) { err(`схема не парсится: ${e.message}`); continue; }

  // 1) тип верхнего уровня
  const isArr = Array.isArray(data);
  if (schema.type === "array" && !isArr) err("ожидался массив");
  if (schema.type === "object" && isArr) err("ожидался объект");

  // 2) required в элементах массива
  if (schema.type === "array" && isArr && schema.items?.required) {
    data.slice(0, 50).forEach((it, i) => {
      for (const k of schema.items.required)
        if (it == null || !(k in it)) err(`элемент[${i}]: нет поля "${k}"`);
    });
  }

  // 3) единый accountId — нет steamId в паках/игроках
  const raw = JSON.stringify(data);
  if (/"steamId"/.test(raw)) err(`встречается "steamId" — контракт требует единый accountId`);
}

console.log(errors === 0 ? "\n✅ базовая валидация пройдена" : `\n❌ проблем: ${errors}`);
process.exit(errors === 0 ? 0 : 1);
