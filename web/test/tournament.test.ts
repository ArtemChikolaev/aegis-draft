import { describe, expect, it } from "vitest";
import { TournamentEngine } from "../src/game/tournament.ts";
import { loadGameData } from "./helpers/data.ts";
import { advanceToEnd, collectStages, createTournament } from "./helpers/tournament.ts";

describe("TournamentEngine", () => {
  const data = loadGameData();

  it("детерминированный seed → идентичная симуляция", () => {
    const first = createTournament(data);
    const second = createTournament(data);
    expect(JSON.stringify(first.snapshot)).toBe(JSON.stringify(second.snapshot));
  });

  it("поле: 18 уникальных команд, одна — игрок", () => {
    const snapshot = createTournament(data).snapshot;
    expect(snapshot.field).toHaveLength(18);
    expect(new Set(snapshot.field.map((t) => t.id)).size).toBe(18);
    expect(snapshot.field.filter((t) => t.isUser)).toHaveLength(1);
  });

  it("группы: две по 9, 16 карт, upper/lower/out", () => {
    const snapshot = advanceToEnd(createTournament(data));
    expect(snapshot.groups).toHaveLength(2);
    for (const group of snapshot.groups) {
      expect(group.standings).toHaveLength(9);
      expect(group.standings.every((row) => row.wins + row.losses === 16)).toBe(true);
      expect(group.standings.filter((r) => r.route === "upper")).toHaveLength(4);
      expect(group.standings.filter((r) => r.route === "lower")).toHaveLength(4);
      expect(group.standings.filter((r) => r.route === "out")).toHaveLength(1);
    }
  });

  it("playoffs: 9 раундов, Grand Final BO5", () => {
    const snapshot = advanceToEnd(createTournament(data));
    expect(snapshot.playoffRounds).toHaveLength(9);
    expect(snapshot.grandFinal.bestOf).toBe(5);
  });

  it("итоговая таблица: 18 мест, чемпион = победитель GF", () => {
    const snapshot = advanceToEnd(createTournament(data));
    expect(snapshot.standings).toHaveLength(18);
    expect(new Set(snapshot.standings.map((r) => r.team.id)).size).toBe(18);
    expect(snapshot.champion.id).toBe(snapshot.grandFinal.winnerId);
    expect(snapshot.standings.some((r) => r.team.isUser && r.placement === snapshot.userPlacement)).toBe(true);
  });

  it("боты: фиксированное поле 322-0, НЕ привязано к силе игрока", () => {
    // Ключевой фикс: поле одинаково независимо от OVR игрока (раньше боты якорились к нему,
    // из-за чего игрок всегда был топ-3). Широкий разброс ~76-96, медиана ~84.
    const weak = createTournament(data, "field-fixed", 78).snapshot.field.filter((t) => !t.isUser).map((t) => t.strength);
    const strong = createTournament(data, "field-fixed", 96).snapshot.field.filter((t) => !t.isUser).map((t) => t.strength);
    expect(strong).toEqual(weak); // поле не зависит от игрока
    expect(weak.every((s) => s >= 70 && s <= 99)).toBe(true);
    expect(Math.max(...weak) - Math.min(...weak)).toBeGreaterThan(12); // широкий разброс, не кластер
  });

  it("место игрока зависит от OVR: сильный ранжируется не ниже слабого", () => {
    // Драфт снова имеет значение: при одном поле сильный OVR не может стоять ниже слабого.
    for (let roll = 0; roll < 24; roll += 1) {
      const strong = new TournamentEngine(data, "last_2y", "placement", 94, "S", roll).snapshot;
      const weak = new TournamentEngine(data, "last_2y", "placement", 80, "W", roll).snapshot;
      const strongRank = strong.field.findIndex((t) => t.isUser) + 1;
      const weakRank = weak.field.findIndex((t) => t.isUser) + 1;
      expect(strongRank).toBeLessThanOrEqual(weakRank);
    }
  });

  it("сильная команда: место варьируется между рероллами (иногда 1-е), а не фикс 2-3", () => {
    const userOvr = 94;
    const ranks = new Set<number>();
    for (let roll = 0; roll < 24; roll += 1) {
      const snap = new TournamentEngine(data, "last_2y", "reroll-vary", userOvr, "Test", roll).snapshot;
      ranks.add(snap.field.findIndex((t) => t.isUser) + 1);
    }
    expect(ranks.size).toBeGreaterThanOrEqual(3); // место реально варьируется
    expect([...ranks].some((r) => r === 1)).toBe(true); // сильный драфт иногда 1-е
  });

  it("группы и плей-офф сохраняют пошаговые frames", () => {
    const snapshot = advanceToEnd(createTournament(data));
    for (const match of snapshot.groupMatches) {
      expect(match.frames[0]).toEqual({ scoreA: 0, scoreB: 0 });
      expect(match.frames.at(-1)).toEqual({ scoreA: match.scoreA, scoreB: match.scoreB });
    }
    expect(snapshot.grandFinal.frames.length).toBeGreaterThan(1);
    expect(snapshot.grandFinal.frames.at(-1)).toEqual({
      scoreA: snapshot.grandFinal.scoreA,
      scoreB: snapshot.grandFinal.scoreB,
    });
  });

  it("field reroll: новые очки, те же имена", () => {
    const userOvr = 88;
    const first = createTournament(data, "field-reroll", userOvr).snapshot;
    const second = new TournamentEngine(data, "last_2y", "field-reroll", userOvr, "Test Five", 1).snapshot;
    const botNames = (snap: typeof first) => snap.field.filter((t) => !t.isUser).map((t) => t.name).sort();
    const botStrengths = (snap: typeof first) => snap.field.filter((t) => !t.isUser).map((t) => t.strength).sort();
    expect(botNames(first)).toEqual(botNames(second));
    expect(botStrengths(first)).not.toEqual(botStrengths(second));
  });

  it("этапы: field → groups → playoffs (терминальный)", () => {
    const engine = createTournament(data);
    expect(collectStages(engine)).toEqual(["field", "groups", "playoffs"]);
    expect(engine.advance()).toBe(false);
    expect(engine.snapshot.stage).toBe("playoffs");
  });
});

// Три параметра симуляции сняты из бандла 322-0 дословно (docs/reference-322-0.md).
// Раньше все три были подобраны мной на глаз по их скриншотам и промахивались.
describe("параметры симуляции по замеру 322-0", () => {
  // Данные поднимаем ОДИН раз: loadGameData() внутри цикла грузил весь датасет на каждой
  // итерации — на моке незаметно, на реальном (squadSynergy 8.5 МБ) это 26с и таймаут.
  const data = loadGameData();

  it("поле ботов ~ Normal(86, 5), кламп [76, 99] — не кусочная лестница (mean была 83.8)", () => {
    const strengths: number[] = [];
    for (let seed = 0; seed < 400; seed++) {
      const engine = new TournamentEngine(data, "last_2y", `field-${seed}`, 80, "T");
      for (const team of engine.snapshot.field) if (!team.isUser) strengths.push(team.strength);
    }
    const mean = strengths.reduce((s, x) => s + x, 0) / strengths.length;
    const sd = Math.sqrt(strengths.reduce((s, x) => s + (x - mean) ** 2, 0) / strengths.length);
    expect(Math.min(...strengths)).toBeGreaterThanOrEqual(76);
    expect(Math.max(...strengths)).toBeLessThanOrEqual(99);
    expect(mean).toBeGreaterThan(85.3);
    expect(mean).toBeLessThan(86.7);
    expect(sd).toBeGreaterThan(4.3);
    expect(sd).toBeLessThan(5.5);
  });

  it("группы разводятся змейкой по силе: перекос средней силы околонулевой (шафл давал до 9.3)", () => {
    let worstGap = 0;
    for (let seed = 0; seed < 300; seed++) {
      const engine = new TournamentEngine(data, "last_2y", `snake-${seed}`, 80, "T");
      const [a, b] = engine.snapshot.groups;
      const avg = (g: typeof a) => g.standings.reduce((s, r) => s + r.team.strength, 0) / g.standings.length;
      worstGap = Math.max(worstGap, Math.abs(avg(a) - avg(b)));
    }
    // Змейка 1-4-5-8 гарантирует перекос в пределах ~2; случайный шафл давал 9+.
    expect(worstGap).toBeLessThan(3);
  });
});
