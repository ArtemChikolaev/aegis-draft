#!/usr/bin/env node
// Zero-dep validator для используемого проектом подмножества JSON Schema draft-07:
// nested types/required/properties/additionalProperties, items/min/max, enum/const,
// local $ref, numeric bounds, propertyNames и date/date-time formats.
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
  "careerPlayerHeroStats.json": "careerPlayerHeroStats.schema.json",
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

  validate(data, schema, schema, "$", err);

  // Cross-contract invariant: единый accountId — нет steamId нигде в output.
  const raw = JSON.stringify(data);
  if (/"steamId"/.test(raw)) err(`встречается "steamId" — контракт требует единый accountId`);
}

console.log(errors === 0 ? "\n✅ JSON Schema validation пройдена" : `\n❌ проблем: ${errors}`);
process.exit(errors === 0 ? 0 : 1);

function validate(value, schema, root, path, report) {
  if (schema.$ref) {
    const target = resolveRef(root, schema.$ref);
    if (!target) return report(`${path}: не найден $ref ${schema.$ref}`);
    return validate(value, target, root, path, report);
  }

  if (schema.type && !matchesType(value, schema.type)) {
    report(`${path}: ожидался type=${schema.type}, получен ${describeType(value)}`);
    return;
  }
  if ("const" in schema && !deepEqual(value, schema.const)) report(`${path}: значение не равно const ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some((candidate) => deepEqual(value, candidate))) {
    report(`${path}: значение ${JSON.stringify(value)} не входит в enum`);
  }

  if (typeof value === "number") {
    if (schema.minimum != null && value < schema.minimum) report(`${path}: ${value} < minimum ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) report(`${path}: ${value} > maximum ${schema.maximum}`);
  }
  if (typeof value === "string" && schema.format && !validFormat(value, schema.format)) {
    report(`${path}: строка ${JSON.stringify(value)} не соответствует format=${schema.format}`);
  }

  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) report(`${path}: items=${value.length} < minItems ${schema.minItems}`);
    if (schema.maxItems != null && value.length > schema.maxItems) report(`${path}: items=${value.length} > maxItems ${schema.maxItems}`);
    if (schema.items) value.forEach((item, index) => validate(item, schema.items, root, `${path}[${index}]`, report));
    return;
  }

  if (value !== null && typeof value === "object") {
    for (const key of schema.required ?? []) {
      if (!(key in value)) report(`${path}: нет required поля ${JSON.stringify(key)}`);
    }
    const properties = schema.properties ?? {};
    for (const [key, child] of Object.entries(value)) {
      if (schema.propertyNames) validate(key, schema.propertyNames, root, `${path}{propertyName:${key}}`, report);
      if (key in properties) {
        validate(child, properties[key], root, `${path}.${key}`, report);
      } else if (schema.additionalProperties === false) {
        report(`${path}: неизвестное поле ${JSON.stringify(key)} (additionalProperties=false)`);
      } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        validate(child, schema.additionalProperties, root, `${path}.${key}`, report);
      }
    }
  }
}

function resolveRef(root, ref) {
  if (!ref.startsWith("#/")) return null;
  return ref.slice(2).split("/").reduce((node, token) => node?.[token.replace(/~1/g, "/").replace(/~0/g, "~")], root);
}

function matchesType(value, type) {
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "string") return typeof value === "string";
  if (type === "boolean") return typeof value === "boolean";
  if (type === "null") return value === null;
  return true;
}

function describeType(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function validFormat(value, format) {
  if (format === "date") return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
  if (format === "date-time") return /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));
  return true;
}
