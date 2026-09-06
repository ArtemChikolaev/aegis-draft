import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HEROES } from "../src/game/arcade/content/heroes.ts";
import { ENEMY_KINDS } from "../src/game/arcade/content/enemies.ts";
import { COSMETICS } from "../src/game/arcade/content/cosmetics.ts";

// Один id — один лист. Однажды `centaur` оказался и видом крипа, и героем: строки манифеста
// затирали друг друга, и нейтральный кентавр бегал в модели Centaur Warrunner.
const rows = (file: string) => readFileSync(new URL(`../scripts/blender/${file}`, import.meta.url), "utf8").split("\n").filter((l) => l && !l.startsWith("#")).map((l) => l.split("\t")[0]);

describe("id листов спрайтов", () => {
  it("в манифестах нет повторяющихся строк", () => {
    for (const f of ["dota_manifest_px.tsv", "dota_manifest_px2.tsv"]) {
      const ids = rows(f);
      const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
      expect(dup, f).toEqual([]);
    }
  });

  it("id героя и id вида врага не совпадают (иначе один лист на двоих)", () => {
    const heroes = new Set(Object.keys(HEROES));
    const clash = Object.keys(ENEMY_KINDS).filter((id) => heroes.has(id));
    // `centaur` разведён на уровне имени листа (ENEMY_SHEET в sprites.ts) — новых столкновений быть не должно.
    expect(clash).toEqual(["centaur"]);
  });

  it("каждый вариант косметики есть в обоих манифестах ровно один раз", () => {
    for (const f of ["dota_manifest_px.tsv", "dota_manifest_px2.tsv"]) {
      const ids = rows(f);
      for (const c of COSMETICS.filter((x) => x.slot === "skin")) {
        expect(ids.filter((id) => id === c.variant).length, `${c.variant} в ${f}`).toBe(1);
      }
    }
  });
});
// Строка манифеста без отрендеренного листа = невидимый герой (или вард) в бою: загрузчик тихо
// отдаёт undefined, а рендер рисует кружок. Ловим это до игры, а не в бою.
describe("листы на диске", () => {
  it("под каждую строку манифеста лежит лист в обоих наборах", () => {
    for (const [file, dir] of [["dota_manifest_px.tsv", "dota_px"], ["dota_manifest_px2.tsv", "dota_px2"]] as const) {
      const missing = rows(file).filter((id) =>
        !existsSync(new URL(`../public/art/sprites/${dir}/${id}.webp`, import.meta.url))
        || !existsSync(new URL(`../public/art/sprites/${dir}/${id}.json`, import.meta.url)));
      expect(missing, `${dir}: нет листа`).toEqual([]);
    }
  });
});

