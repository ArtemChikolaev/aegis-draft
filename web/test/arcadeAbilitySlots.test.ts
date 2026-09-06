import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HEROES } from "../src/game/arcade/content/heroes.ts";

// Умение должно работать в любом слоте (T13.25). Тик активных эффектов раньше искал вид по букве —
// `H.q.kind === "spin"`, `H.w.kind === "ward"` — и одиннадцать умений молчали: Rolling Thunder у
// Pangolier и Raptor Dance у Kez стоят в R, Hand of God у Chen — в R, Cold Embrace у Winter Wyvern — в E.
// Каст ставил spinUntil/wardUntil, а тик их не видел, и ульт не делал ничего.
const SIM = readFileSync(new URL("../src/game/arcade/sim.ts", import.meta.url), "utf8");

describe("слоты умений Аркады", () => {
  it("сим не ищет вид умения по букве слота", () => {
    const hardcoded = [...SIM.matchAll(/H\.([qwer])\.kind === "([a-z_]+)"/g)].map((m) => `H.${m[1]}.kind === "${m[2]}"`);
    expect(hardcoded, "вид умения ищут через ABILITY_KEYS.find, иначе умение в другом слоте мертво").toEqual([]);
  });

  it("рендер тоже не берёт радиус по букве слота", () => {
    const R = readFileSync(new URL("../src/features/arcade/renderer.ts", import.meta.url), "utf8");
    const hardcoded = [...R.matchAll(/abilities\.([qwer])\.(kind|radius)/g)].map((m) => m[0]);
    expect(hardcoded.filter((h) => !h.endsWith(".radius")), "вид умения — через ArcadeRenderer.slot").toEqual([]);
  });

  // Виды, которые сим и рендер читают из фиксированного слота (пассивки и добивание). Пока каждый
  // такой вид стоит у всех героев в одном слоте, это безопасно; тест ловит момент, когда перестанет.
  it("пассивки с фиксированным слотом стоят у всех героев именно в нём", () => {
    const LOCKED: Record<string, string> = {
      static_field: "e", headshot: "w", presence: "e", counter_helix: "e",
      reincarnation: "r", culling_blade: "r", omni: "r", freezing_field: "r",
    };
    for (const hero of Object.values(HEROES)) {
      for (const [slot, ab] of Object.entries(hero.abilities)) {
        const want = LOCKED[ab.kind];
        if (want) expect(slot, `${hero.id}: ${ab.kind} читают только из ${want}`).toBe(want);
      }
    }
  });

  it("виды, у которых есть тик-обработчик, встречаются в разных слотах — значит поиск по виду обязателен", () => {
    const slots: Record<string, Set<string>> = {};
    for (const hero of Object.values(HEROES)) {
      for (const [slot, ab] of Object.entries(hero.abilities)) (slots[ab.kind] ??= new Set()).add(slot);
    }
    // Эти виды живут в тике (вихрь, лечащий тотем, серии ударов) и точно стоят у героев в разных слотах.
    for (const kind of ["spin", "ward"]) expect(slots[kind]?.size, `${kind}: ожидали несколько слотов`).toBeGreaterThan(1);
  });
});
