// Индекс листов (`public/art/sprites/<набор>/index.json`, scripts/gen_sheet_index.mjs) обязан совпадать с каталогом:
// загрузчик про лист вне индекса отвечает «нет» без запроса, так что забытая перегенерация = невидимый новый облик.
// Лечится одной командой: `npm run gen:sheets-index`.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SHEET_INDEX_REV } from "../src/features/arcade/sheetIndexRev.ts";

const SPRITES = new URL("../public/art/sprites/", import.meta.url);
const SETS = ["dota_px", "dota_px2"];

describe("индекс листов Аркады", () => {
  for (const set of SETS) {
    const dir = new URL(`${set}/`, SPRITES);
    const text = readFileSync(new URL("index.json", dir), "utf8");
    const index = JSON.parse(text) as { sheets: string[]; terrain: string[] };

    it(`${set}: список листов совпадает с каталогом (пары .json + .webp), отсортирован`, () => {
      const files = new Set(readdirSync(dir));
      const onDisk = [...files].filter((f) => f.endsWith(".json") && f !== "index.json" && files.has(`${f.slice(0, -5)}.webp`)).map((f) => f.slice(0, -5)).sort();
      expect(onDisk.length).toBeGreaterThan(0);
      expect(index.sheets, "npm run gen:sheets-index").toEqual(onDisk);
    });

    it(`${set}: список terrain совпадает с каталогом`, () => {
      const terrainDir = new URL("terrain/", dir);
      const onDisk = existsSync(terrainDir) ? readdirSync(terrainDir).filter((f) => f.endsWith(".webp")).map((f) => f.slice(0, -5)).sort() : [];
      expect(index.terrain, "npm run gen:sheets-index").toEqual(onDisk);
    });

    it(`${set}: версия индекса в бандле — хеш его содержимого`, () => {
      expect(SHEET_INDEX_REV[set], "npm run gen:sheets-index").toBe(createHash("sha256").update(text).digest("hex").slice(0, 10));
    });
  }

  it("версии заведены ровно для наборов с листами", () => {
    expect(Object.keys(SHEET_INDEX_REV).sort()).toEqual([...SETS].sort());
  });
});
