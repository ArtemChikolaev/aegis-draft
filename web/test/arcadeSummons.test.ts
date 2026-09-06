import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HEROES } from "../src/game/arcade/content/heroes.ts";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { IDLE_INPUT } from "../src/game/arcade/types.ts";

// Призывы (T13.27, владелец: «Terrorblade должен звать иллюзии, а он ставит на пол шарик»):
// картинка призыва — чисто визуальная надстройка над damage_ward. Тест держит две вещи:
// у каждого объявленного призыва есть лист спрайтов, и сим от него не изменился.
const rows = (file: string) => readFileSync(new URL(`../scripts/blender/${file}`, import.meta.url), "utf8").split("\n").filter((l) => l && !l.startsWith("#")).map((l) => l.split("\t")[0]);

describe("призывы Аркады", () => {
  it("у каждого призыва есть лист: либо иллюзия героя, либо существо из манифеста", () => {
    const sheets = new Set(rows("dota_manifest_px2.tsv"));
    let seen = 0;
    for (const hero of Object.values(HEROES)) {
      for (const ab of Object.values(hero.abilities)) {
        if (!ab.summon) continue;
        seen++;
        expect(ab.kind, `${hero.id}: призыв объявлен не у damage_ward`).toBe("damage_ward");
        if (ab.summon.art !== "illusion") expect(sheets.has(ab.summon.art), `${hero.id} → ${ab.summon.art}`).toBe(true);
        expect((ab.summon.count ?? 1) >= 1 && (ab.summon.count ?? 1) <= 4, `${hero.id}: count`).toBe(true);
      }
    }
    expect(seen).toBeGreaterThanOrEqual(8);
  });

  it("призыв не трогает сим: Conjure Image у Terrorblade ставит источник урона ровно в игрока", () => {
    const sim = new ArcadeSim("summon-1", { rank: 0, hero: "terrorblade", act: "short" });
    sim.player.abilities.w = 2;
    for (let i = 0; i < 5; i++) sim.step({ ...IDLE_INPUT });
    const { x, y } = sim.player;
    sim.step({ ...IDLE_INPUT, cast: 2 });
    expect(sim.player.wardUntil).toBeGreaterThan(sim.tick);
    expect(sim.player.wardX).toBe(x);
    expect(sim.player.wardY).toBe(y);
  });
});
