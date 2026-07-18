import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bestAssignment, assignmentPairScore, synergyTotalForAssignment } from "../src/game/assign.ts";
import { RunEngine } from "../src/game/engine.ts";
import { playerHeroGames, squadChemistryRows } from "../src/game/score.ts";
import type { PackPlayer } from "../src/types/data.ts";
import { loadGameData } from "./helpers/data.ts";
import { isMockBaseline } from "./helpers/dataset.ts";
import { playerOvrTier } from "../src/ui/ovrTier.ts";
import { assignmentPairScoreTotal, greedyAssignmentPairScore, sigFromPack } from "./helpers/assignment.ts";
import { defaultRunConfig, rosterFromPack } from "./helpers/packs.ts";
import { runToEnd } from "./helpers/engine.ts";

/**
 * Named regression cases from real bugs (322-0 parity / session fixes).
 * Each `it` name documents the bug so failures are self-explanatory in CI.
 */
describe("regression: hero assignment prioritizes games on hero", () => {
  it("BUG-2026-07-12: Ghost с 1 game на Drow получает её, а не 33 с 0 games", () => {
    const ghostId = 206642367;
    const p33Id = 86698277;
    const drowId = 6;
    const enigmaId = 19;
    const experienceStats = {
      [String(ghostId)]: { [String(drowId)]: { games: 1, winrate: 0 } },
      [String(p33Id)]: {},
    };
    const experiencePlayers: PackPlayer[] = [
      { accountId: ghostId, nickname: "Ghost", role: "safelane", ovr: 57, impact: 50, economy: 50, reliability: 50, games: 10 },
      { accountId: p33Id, nickname: "33", role: "offlane", ovr: 65, impact: 50, economy: 50, reliability: 50, games: 10 },
    ];
    const assignment = bestAssignment(experiencePlayers, [drowId, enigmaId], experienceStats);
    expect(assignment.byPlayer[ghostId]).toBe(drowId);
    expect(assignmentPairScore(ghostId, drowId, experienceStats)).toBeGreaterThan(
      assignmentPairScore(p33Id, drowId, experienceStats),
    );
  });
});

describe("regression: hero assignment pro-only (no pub bleed)", () => {
  it("BUG-2026-07-15: support с TB только в pub-stats не получает Terrorblade из pro career", () => {
    const rueId = 847565596;
    const tb = 109;
    const bane = 3;
    const proCareer = {
      [String(rueId)]: { [String(bane)]: { games: 44, winrate: 0.5 } },
    };
    const player: PackPlayer = {
      accountId: rueId, nickname: "rue", role: "support",
      ovr: 84, impact: 50, economy: 50, reliability: 50, games: 10,
    };
    expect(bestAssignment([player], [tb, bane], proCareer).byPlayer[rueId]).toBe(bane);
    expect(proCareer[String(rueId)]?.[String(tb)]).toBeUndefined();
  });
});

describe("regression: squad chemistry UI не прячет пары", () => {
  it("BUG-2026-07-12: squadChemistryRows показывает все пары ростера (v1.5.0: сыгранные → bonus>0)", () => {
    const data = loadGameData();
    const spirit = data.packs.find((p) => p.teamName === "Team Spirit")!;
    const roster = rosterFromPack(spirit);
    const rows = squadChemistryRows(roster, data.squadSynergy, data.teammates);
    expect(rows.length).toBeGreaterThanOrEqual(10); // все C(5,2) пары присутствуют, не фильтруются
    expect(rows.filter((r) => r.games > 0).every((r) => r.bonus > 0)).toBe(true); // games-driven химия
  });
});

describe("regression: assignment.total vs matching metric", () => {
  it("BUG-2026-07-12: assignment.total — pairScore (synergy), не assignmentPairScore", () => {
    const data = loadGameData();
    const spirit = data.packs.find((p) => p.teamName === "Team Spirit")!;
    const phs = data.playerHeroStats;
    const sig = sigFromPack(spirit);
    const assignment = bestAssignment(spirit.players, spirit.signatureHeroes, phs, sig);
    const gamesMetric = assignmentPairScoreTotal(assignment.byPlayer, phs, sig);
    expect(assignment.total).toBeCloseTo(synergyTotalForAssignment(assignment.byPlayer, phs, sig), 5);
    expect(assignment.total).not.toBeCloseTo(gamesMetric, 0);
  });
});

describe("regression: manual hero swap", () => {
  const data = loadGameData();

  it("BUG-2026-07-12: automatic allocation блокирует swapHeroes", () => {
    const engine = new RunEngine(data, defaultRunConfig, "run-auto-swap");
    runToEnd(engine);
    const [a, b] = engine.players.map((p) => p.accountId);
    expect(() => engine.swapHeroes(a, b)).toThrow(/Manual/i);
  });

  it("BUG-2026-07-12: manual swap меняет assignment и score() пересчитывается", () => {
    const engine = new RunEngine(data, { ...defaultRunConfig, allocation: "manual" }, "run-manual-swap");
    runToEnd(engine);
    const swapA = engine.players[0].accountId;
    const swapB = engine.players[1].accountId;
    const before = { ...engine.score()!.assignment.byPlayer };
    engine.swapHeroes(swapA, swapB);
    const after = engine.score()!.assignment.byPlayer;
    expect(after[swapA]).toBe(before[swapB]);
    expect(after[swapB]).toBe(before[swapA]);
  });
});

describe("regression: playerHeroGames matches stats", () => {
  it("BUG-2026-07-12: games в breakdown = playerHeroGames из stats", () => {
    const data = loadGameData();
    const spirit = data.packs.find((p) => p.teamName === "Team Spirit")!;
    const phs = data.playerHeroStats;
    for (const pl of spirit.players) {
      for (const hid of spirit.signatureHeroes.slice(0, 3)) {
        expect(playerHeroGames(phs, pl.accountId, hid)).toBe(
          phs[String(pl.accountId)]?.[String(hid)]?.games ?? 0,
        );
      }
    }
  });
});

describe("regression: matching ≥ greedy (CI failure 2026-07-12)", () => {
  it("BUG-2026-07-12: matching не хуже жадности на assignmentPairScore (Team Spirit)", () => {
    const data = loadGameData();
    const spirit = data.packs.find((p) => p.teamName === "Team Spirit")!;
    const phs = data.playerHeroStats;
    const sig = sigFromPack(spirit);
    const assignment = bestAssignment(spirit.players, spirit.signatureHeroes, phs, sig);
    const matching = assignmentPairScoreTotal(assignment.byPlayer, phs, sig);
    const greedy = greedyAssignmentPairScore(spirit.players, spirit.signatureHeroes, phs, sig);
    // Допуск на флоат: при совпадении оптимума суммы равны, но порядок слагаемых разный —
    // точное >= падало на 13-м знаке (117002.63541726189 против 117002.6354172619).
    // Инвариант не ослаблен: 1e-9 при значениях ~1e5 — это 1e-14 относительной погрешности.
    expect(matching).toBeGreaterThanOrEqual(greedy - 1e-9);
  });
});

describe("regression: chemistry только за реальные совместные pro-игры", () => {
  it("BUG-2026-07-16: пара без совместных игр не даёт бонуса и не показывается (v1.7.0)", () => {
    const data = loadGameData();
    // Кросс-командный фэнтези-ростер: берём по игроку из пяти РАЗНЫХ паков — большинство
    // пар вместе не играли. Раньше каждая такая пара набегала chemistryCurrentBaseline и
    // химия складывалась из фантомных +0.1; в 322-0 таких строк нет вовсе.
    const picks = data.packs.slice(0, 5).map((pack, i) => ({
      accountId: pack.players[i].accountId,
      teamId: pack.teamId,
      eventId: pack.eventId,
    }));
    const roster = picks.map((p, i) => ({
      candidate: {
        player: data.packs[i].players[i],
        teamId: p.teamId,
        eventId: p.eventId,
        signatureHeroes: data.packs[i].signatureHeroes,
      },
    }));
    const rows = squadChemistryRows(roster as never, data.squadSynergy, data.teammates);
    expect(rows.every((r) => r.games > 0)).toBe(true);
    expect(rows.every((r) => r.bonus > 0)).toBe(true);
  });
});

describe("regression: движение драфта (TREF9/TREF10)", () => {
  it("BUG-2026-07-17: раздача пака гасится prefers-reduced-motion глобальным правилом", () => {
    // У 322-0 ровно тут опечатка: анимация висит на .card-flip, а гасят .flip-in — их флип
    // не отключается. У нас правило по `*`, поэтому проверяем САМ факт глобальности, а не
    // перечисление: иначе будущий keyframe добавят, а гасить забудут.
    const base = readFileSync(new URL("../src/design/base.css", import.meta.url), "utf8");
    const rule = base.match(/@media \(prefers-reduced-motion: reduce\)[^}]*\{[^}]*\}/)?.[0] ?? "";
    expect(rule).toContain("*");
    expect(rule).toContain("animation-duration");
    // Ни один keyframe не должен полагаться на перечисление классов.
    expect(rule).not.toMatch(/\.deal-in|\.card-flip|\.flip-in/);
  });

  // Раздача НЕ играла: keyframe лежал в design/base.css, а ссылка шла из CSS-модуля.
  // CSS Modules скоупят имена keyframes ⇒ `deal-in` компилировался в `_deal-in_hash`,
  // которого не существует. getComputedStyle при этом бодро показывал animation-name и
  // playState:"running" — и ввёл меня в заблуждение. Честный признак: getAnimations().
  it("BUG-2026-07-17: keyframe раздачи лежит в ТОМ ЖЕ модуле, что и ссылка на него", () => {
    const dealt = readFileSync(new URL("../src/ui/Dealt.module.css", import.meta.url), "utf8");
    expect(dealt).toMatch(/@keyframes\s+deal-in/);
    expect(dealt).toContain("animation: deal-in");
    // В глобальном base.css кейфрейма быть не должно — иначе снова разъедется.
    const base = readFileSync(new URL("../src/design/base.css", import.meta.url), "utf8");
    expect(base).not.toMatch(/@keyframes\s+deal-in/);
  });

  it("BUG-2026-07-17: константы движения — токены, не литералы в компонентах", () => {
    const tokens = readFileSync(new URL("../src/design/tokens.css", import.meta.url), "utf8");
    for (const token of ["--ease-out", "--motion-deal", "--motion-deal-stagger", "--motion-count"]) {
      expect(tokens).toContain(token);
    }
    // Dealt берёт длительность/шаг из токенов, а не хардкодит миллисекунды.
    const dealt = readFileSync(new URL("../src/ui/Dealt.module.css", import.meta.url), "utf8");
    expect(dealt).toContain("var(--motion-deal)");
    expect(dealt).toContain("var(--motion-deal-stagger)");
    expect(dealt).not.toMatch(/\d+ms|\d+s\b/);
  });
});

describe("regression: цвета радара (TREF10+)", () => {
  it("BUG-2026-07-17: fallback цвета связи объявлен ДО тиров — иначе все линии зелёные", () => {
    // Все селекторы одной специфичности (один класс) ⇒ побеждает последний в источнике.
    // Fallback ниже тиров молча перекрасил бы всё в --brand-green.
    const css = readFileSync(new URL("../src/features/draft/pentagon.css", import.meta.url), "utf8");
    const fallback = css.indexOf(".pentagon__ring--chem, .pentagon__edge {");
    const firstTier = css.indexOf(".pentagon__ring--strong");
    expect(fallback).toBeGreaterThan(-1);
    expect(firstTier).toBeGreaterThan(-1);
    expect(fallback).toBeLessThan(firstTier);
  });

  it("BUG-2026-07-17: цвета радара — токены, не литералы", () => {
    const css = readFileSync(new URL("../src/features/draft/pentagon.css", import.meta.url), "utf8");
    // Направление Team OVR и сила связи берут семантические токены.
    expect(css).toContain("fill: var(--win)");
    expect(css).toContain("fill: var(--loss)");
    for (const tier of ["--chem-strong", "--chem-good", "--chem-mid", "--chem-weak"]) {
      expect(css).toContain(`var(${tier})`);
    }
    // Ноль хардкод-цветов в радаре. Комментарии вырезаем: в них документирован цвет
    // 322-0 (#1fd0bd) — это ссылка на замер, а не литерал в стилях.
    const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,6}|rgba?\(/);
  });
});

describe("regression: пул героев пака (2026-07-17)", () => {
  it("BUG-2026-07-17: пак хранит пул шире показа (обычно 10, показываем 5)", () => {
    // Раньше хранили ровно 5 и всегда показывали их же: пул был вдвое уже, а пайплайн ещё и
    // сортирует по heroId — без шаффла slice(0,5) брал бы пятёрку с наименьшими id.
    // Замер до фикса: Anti-Mage в 13 паках из 1415 (0.9% на пак), 16 героев с шансом <1%;
    // у 322-0 при том же среднем таких героев 2, и они хранят 10 (shuffle(sig).slice(0,5)).
    //
    // Требовать 10 у КАЖДОГО пака нельзя: ростер, отыгравший за турнир всего пять разных
    // героев, десяти дать не может — в реальных данных таких паков 5.3% (58 из 1415).
    // Первая версия теста это и проглядела: на моке (там ровно 10) проходила, на проде падала.
    const data = loadGameData();
    const wide = data.packs.filter((p) => new Set(p.signatureHeroes).size >= 10).length;
    expect(wide / data.packs.length).toBeGreaterThan(0.8);
    // Ни один пак не должен быть уже показа — иначе выбирать не из чего.
    for (const pack of data.packs) {
      expect(new Set(pack.signatureHeroes).size).toBeGreaterThanOrEqual(5);
    }
  });

  it("BUG-2026-07-17: показанная пятёрка зависит от seed, но воспроизводима", () => {
    const data = loadGameData();
    const shown = (seed: string) => {
      const engine = new RunEngine(data, defaultRunConfig, seed);
      return engine.packHeroes.join(",");
    };
    // Тот же seed — та же пятёрка (детерминизм забега).
    expect(shown("hero-pool-a")).toBe(shown("hero-pool-a"));
    // Разные seed на десяти прогонах дают больше одной комбинации: пятёрка не прибита к
    // первым пяти по id. Без шаффла все варианты совпали бы.
    const variants = new Set(Array.from({ length: 10 }, (_, i) => shown(`hero-pool-${i}`)));
    expect(variants.size).toBeGreaterThan(1);
  });
});

describe("regression: тиры игрока по OVR (ui/ovrTier)", () => {
  // Пороги — не вкусовые: калиброваны по реальному распределению packs.json (7075
  // значений). Края шкалы редкие и потому «событийные»: elite ~4.8%, liability ~1.9%.
  // Тест держит и границы, и саму редкость — если пайплайн сдвинет шкалу OVR,
  // эффекты либо расползутся на полпака, либо исчезнут, и это упадёт здесь.
  it("границы тиров совпадают с задокументированными", () => {
    expect(playerOvrTier(99)).toBe("elite");
    expect(playerOvrTier(88)).toBe("elite");
    expect(playerOvrTier(87)).toBe("strong");
    expect(playerOvrTier(82)).toBe("strong");
    expect(playerOvrTier(81)).toBe("mid");
    expect(playerOvrTier(76)).toBe("mid");
    expect(playerOvrTier(75)).toBe("low");
    expect(playerOvrTier(70)).toBe("low");
    expect(playerOvrTier(69)).toBe("weak");
    expect(playerOvrTier(60)).toBe("weak");
    expect(playerOvrTier(59)).toBe("liability");
    expect(playerOvrTier(54)).toBe("liability");
  });

  // Свойство РЕАЛЬНОГО датасета: на моке шкала OVR синтетическая (elite там ~30%), поэтому
  // на нём проверять нечего — тот же приём, что у golden (skipIf isMockBaseline).
  it.skipIf(isMockBaseline(loadGameData().manifest))("края шкалы остаются редкими (реальный датасет)", () => {
    const data = loadGameData();
    const ovrs = data.packs.flatMap((pack) => pack.players.map((player) => player.ovr));
    const share = (tier: string) =>
      ovrs.filter((ovr) => playerOvrTier(ovr) === tier).length / ovrs.length;
    // Эффект должен быть событием, а не фоном: elite и liability вместе — меньше 12%.
    expect(share("elite")).toBeGreaterThan(0.01);
    expect(share("elite")).toBeLessThan(0.1);
    expect(share("liability")).toBeGreaterThan(0.002);
    expect(share("liability")).toBeLessThan(0.05);
  });
});
