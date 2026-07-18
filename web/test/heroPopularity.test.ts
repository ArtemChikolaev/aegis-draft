import { describe, expect, it } from "vitest";
import { heroPopularity, sortHeroes } from "../src/features/heroes/heroPopularity.ts";
import type { Hero, PlayerHeroStats } from "../src/types/data.ts";
import { loadGameData } from "./helpers/data.ts";
import { isMockBaseline } from "./helpers/dataset.ts";

const heroes: Hero[] = [
  { id: 1, name: "Anti-Mage", picture: "antimage" },
  { id: 2, name: "Axe", picture: "axe" },
  { id: 3, name: "Bane", picture: "bane" },
];

describe("heroPopularity", () => {
  it("винрейт взвешен по играм, а не усреднён по игрокам", () => {
    // Игрок A: 100 игр с 60%, игрок B: 1 игра с 0%. Среднее от средних дало бы 30%,
    // правильный ответ — 60/101 ≈ 59.4%: вклад одной игры не равен вкладу сотни.
    const stats: PlayerHeroStats = {
      "1": { "1": { games: 100, winrate: 0.6 } },
      "2": { "1": { games: 1, winrate: 0 } },
    };
    const row = heroPopularity(heroes, stats).find((item) => item.id === 1)!;
    expect(row.games).toBe(101);
    expect(row.players).toBe(2);
    expect(row.winrate).toBeCloseTo(60 / 101, 5);
  });

  it("герой без игр остаётся в списке с нулями, а не пропадает", () => {
    const stats: PlayerHeroStats = { "1": { "1": { games: 5, winrate: 0.4 } } };
    const rows = heroPopularity(heroes, stats);
    expect(rows).toHaveLength(3);
    const bane = rows.find((row) => row.id === 3)!;
    expect(bane.games).toBe(0);
    expect(bane.players).toBe(0);
    expect(bane.winrate).toBeNull();
  });

  it("доли складываются в единицу", () => {
    const stats: PlayerHeroStats = {
      "1": { "1": { games: 30, winrate: 0.5 }, "2": { games: 70, winrate: 0.5 } },
    };
    const rows = heroPopularity(heroes, stats);
    expect(rows.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(1, 6);
    expect(rows.find((row) => row.id === 2)!.share).toBeCloseTo(0.7, 6);
  });

  it("сортировка стабильна: равные значения разводит число игр", () => {
    const stats: PlayerHeroStats = {
      "1": { "1": { games: 10, winrate: 0.5 }, "2": { games: 40, winrate: 0.5 } },
    };
    const rows = sortHeroes(heroPopularity(heroes, stats), "winrate");
    expect(rows.map((row) => row.id)).toEqual([2, 1, 3]);
  });

  it("покрывает всех героев из справочника (любой датасет)", () => {
    const data = loadGameData();
    const rows = heroPopularity(data.heroes, data.careerPlayerHeroStats);
    expect(rows).toHaveLength(data.heroes.length);
  });

  // Масштаб — свойство РЕАЛЬНОГО датасета: у мока другие порядки (лидер ~35 игроков).
  it.skipIf(isMockBaseline(loadGameData().manifest))("даёт осмысленный топ (реальный датасет)", () => {
    const data = loadGameData();
    const rows = sortHeroes(heroPopularity(data.heroes, data.careerPlayerHeroStats), "games");
    // Лидер должен быть заметно сыгран — если агрегация сломается, тут будут нули.
    expect(rows[0].games).toBeGreaterThan(500);
    expect(rows[0].players).toBeGreaterThan(50);
    // Винрейты про-сцены жмутся к 50%: у каждой игры есть победитель и проигравший.
    expect(rows[0].winrate).toBeGreaterThan(0.3);
    expect(rows[0].winrate).toBeLessThan(0.7);
  });
});
