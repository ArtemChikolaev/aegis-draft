import { describe, expect, it } from "vitest";
import { FORM_FLOOR, balancedPackSlots, buildAnteMarketRoulette, refreshAnteMarketOffers, stockedForms } from "../src/game/anteMarket.ts";
import { RunEconomy, playerCost } from "../src/game/anteEconomy.ts";
import { RunEngine } from "../src/game/engine.ts";
import { heroPrice } from "../src/game/heroRarity.ts";
import { ROLE_SEQUENCE, candidateRef } from "../src/game/packs.ts";
import { useRun } from "../src/state/runStore.ts";
import { Rng } from "../src/game/rng.ts";
import { TACTICS } from "../src/game/tactics.ts";
import { loadGameData } from "./helpers/data.ts";
import { defaultRunConfig } from "./helpers/packs.ts";
import { runToEnd } from "./helpers/engine.ts";

describe("Roguelite market roulette (5 игроков + 5 героев)", () => {
  const data = loadGameData();

  function completed(seed: string): RunEngine {
    const engine = new RunEngine(data, defaultRunConfig, seed);
    runToEnd(engine);
    return engine;
  }

  it("детерминирован и всегда даёт 5 player-офферов по слотам с реальным breakdown", () => {
    const engineA = completed("roulette");
    const offersA = buildAnteMarketRoulette(engineA, "roulette", 1, 0);
    const offersB = buildAnteMarketRoulette(completed("roulette"), "roulette", 1, 0);
    expect(offersA).toEqual(offersB);
    const players = offersA.filter((offer) => offer.kind === "player");
    const heroes = offersA.filter((offer) => offer.kind === "hero");
    expect(players).toHaveLength(5);
    expect(heroes).toHaveLength(5);
    // Пять разных входящих игроков; каждый привязан к лучшему same-role слоту.
    expect(new Set(players.map((offer) =>
      engineA.candidateByRef(offer.playerSwap!.incoming)!.player.accountId)).size).toBe(5);
    for (const offer of players) {
      const incoming = engineA.candidateByRef(offer.playerSwap!.incoming)!;
      const eligibleSlots = engineA.rosterView.flatMap((slot, slotIndex) =>
        slot.candidate && slot.role === incoming.player.role ? [slotIndex] : []);
      const bestTeamOvr = Math.max(...eligibleSlots.map((slotIndex) =>
        engineA.previewPlayerReplacement(slotIndex, incoming).teamOvr));
      const after = offer.preview!.after;
      expect(eligibleSlots).toContain(offer.playerSwap!.slotIndex);
      expect(after.base + after.heroSynergy + after.chemistry).toBeCloseTo(bestTeamOvr, 6);
    }
    // Пять разных входящих героев; для каждого выбрана лучшая из пяти возможных замен.
    expect(new Set(heroes.map((o) => o.heroSwap!.incomingHeroId)).size).toBe(5);
    for (const offer of heroes) {
      const bestTeamOvr = Math.max(...engineA.heroes.map((outgoingHeroId) =>
        engineA.previewHeroReplacement(outgoingHeroId, offer.heroSwap!.incomingHeroId).teamOvr));
      const after = offer.preview!.after;
      expect(after.base + after.heroSynergy + after.chemistry).toBeCloseTo(bestTeamOvr, 6);
    }
    for (const offer of offersA.filter((o) => o.kind !== "stat")) {
      expect(offer.preview).toBeDefined();
      expect(offer.preview!.beforeAssignment).toBeDefined();
      expect(offer.preview!.afterAssignment).toBeDefined();
    }
  });

  it("R4.1: цена hero-карты = цена её качества, одинаково на раннем и позднем этапе", () => {
    const engine = completed("hero-price");
    // Дропы открыты: качества разные, и цена каждой карты равна цене её тира.
    const late = buildAnteMarketRoulette(engine, "hero-price", 9, 0, [], { rarityDrops: true });
    const heroes = late.filter((offer) => offer.kind === "hero");
    expect(heroes.length).toBeGreaterThan(0);
    for (const offer of heroes) {
      expect(offer.cost).toBe(heroPrice(offer.heroSwap!.incomingRarity ?? "common"));
    }
    // Тот же тир стоит столько же на этапе 2 и на этапе 22 — этап в базовую цену не входит.
    for (const stage of [2, 22]) {
      for (const offer of buildAnteMarketRoulette(engine, "hero-price", stage, 0, [], { rarityDrops: true })) {
        if (offer.kind !== "hero") continue;
        expect(offer.cost).toBe(heroPrice(offer.heroSwap!.incomingRarity ?? "common"));
      }
    }
    // Мета-гейт закрыт → всё common по базовой цене (первый забег не платит за качество).
    for (const offer of buildAnteMarketRoulette(engine, "hero-price", 9, 0, [], { rarityDrops: false })) {
      if (offer.kind !== "hero") continue;
      expect(offer.heroSwap!.incomingRarity).toBe("common");
      expect(offer.cost).toBe(heroPrice("common"));
    }
  });

  it("R4.1: refresh сохраняет качество и цену карты после соседнего swap", () => {
    const engine = completed("hero-price-refresh");
    const offers = buildAnteMarketRoulette(engine, "hero-price-refresh", 9, 0, [], { rarityDrops: true });
    const refreshed = refreshAnteMarketOffers(engine, offers);
    for (const offer of refreshed.filter((o) => o.kind === "hero")) {
      const original = offers.find((o) => o.id === offer.id)!;
      expect(offer.heroSwap!.incomingRarity).toBe(original.heroSwap!.incomingRarity);
      expect(offer.cost).toBe(original.cost);
    }
  });

  it("рулетка — не только апгрейды: за несколько reroll встречается и ослабление (ловушка)", () => {
    const engine = completed("roulette-variety");
    let sawDowngrade = false;
    let sawUpgrade = false;
    for (let rerollN = 0; rerollN < 12 && !(sawDowngrade && sawUpgrade); rerollN += 1) {
      const offers = buildAnteMarketRoulette(engine, "roulette-variety", 1, rerollN);
      expect(offers.filter((offer) => offer.kind === "player")).toHaveLength(5);
      expect(offers.filter((offer) => offer.kind === "hero")).toHaveLength(5);
      for (const offer of offers) {
        if (offer.kind !== "player" || !offer.preview) continue;
        const before = offer.preview.before;
        const after = offer.preview.after;
        const delta = (after.base + after.heroSynergy + after.chemistry)
          - (before.base + before.heroSynergy + before.chemistry);
        if (delta < -0.01) sawDowngrade = true;
        if (delta > 0.01) sawUpgrade = true;
      }
    }
    expect(sawDowngrade).toBe(true);
    expect(sawUpgrade).toBe(true);
  });

  it("playerCost растёт с OVR", () => {
    expect(playerCost(90)).toBeGreaterThan(playerCost(75));
    expect(playerCost(75)).toBeGreaterThan(playerCost(65));
    expect(playerCost(60)).toBeGreaterThanOrEqual(2);
  });

  it("reroll меняет набор (другие id/кандидаты)", () => {
    const engine = completed("roulette-reroll");
    const a = buildAnteMarketRoulette(engine, "roulette-reroll", 1, 0);
    const b = buildAnteMarketRoulette(engine, "roulette-reroll", 1, 1);
    expect(a.map((o) => o.id)).not.toEqual(b.map((o) => o.id));
    expect(a.filter((o) => o.kind === "hero").map((o) => o.heroSwap!.incomingHeroId))
      .not.toEqual(b.filter((o) => o.kind === "hero").map((o) => o.heroSwap!.incomingHeroId));
  });

  it("фиксирует офферы в economy snapshot и восстанавливает при resume", () => {
    const engine = completed("market-persist");
    const offers = buildAnteMarketRoulette(engine, "market-persist", 1, 0);
    const economy = new RunEconomy("market-persist");
    economy.awardStageClear(1, "1", 10);
    economy.openCamp(1);
    economy.prepareMarketOffers(offers);

    const restored = new RunEconomy("market-persist", economy.snapshot);
    expect(restored.campView().marketOffers).toEqual(economy.campView().marketOffers);
  });

  it("после покупки сохраняет identity оставшихся карт и обновляет их preview", () => {
    const engine = completed("market-refresh");
    const offers = buildAnteMarketRoulette(engine, "market-refresh", 1, 0);
    const player = offers.find((offer) => offer.kind === "player" && offer.playerSwap);
    if (!player?.playerSwap) return;
    const incoming = engine.candidateByRef(player.playerSwap.incoming)!;
    engine.replacePlayer(player.playerSwap.slotIndex, incoming);

    const remaining = offers.filter((offer) => offer.id !== player.id);
    const refreshed = refreshAnteMarketOffers(engine, remaining);
    expect(refreshed.every((offer) => remaining.some((old) => old.id === offer.id))).toBe(true);
    expect(refreshed.filter((offer) => offer.kind !== "stat").every((offer) =>
      offer.preview?.before.base === engine.score()!.base)).toBe(true);
    expect(refreshed.filter((offer) => offer.kind === "hero").map((offer) => offer.heroSwap!.incomingHeroId))
      .toEqual(remaining.filter((offer) => offer.kind === "hero").map((offer) => offer.heroSwap!.incomingHeroId));
    expect(refreshed.filter((offer) => offer.kind === "player").map((offer) =>
      engine.candidateByRef(offer.playerSwap!.incoming)!.player.accountId))
      .toEqual(remaining.filter((offer) => offer.kind === "player").map((offer) =>
        engine.candidateByRef(offer.playerSwap!.incoming)!.player.accountId));
    for (const offer of refreshed.filter((candidate) => candidate.kind === "player")) {
      const incomingCandidate = engine.candidateByRef(offer.playerSwap!.incoming)!;
      const eligibleSlots = engine.rosterView.flatMap((slot, slotIndex) =>
        slot.candidate && slot.role === incomingCandidate.player.role ? [slotIndex] : []);
      const bestTeamOvr = Math.max(...eligibleSlots.map((slotIndex) =>
        engine.previewPlayerReplacement(slotIndex, incomingCandidate).teamOvr));
      const after = offer.preview!.after;
      expect(after.base + after.heroSynergy + after.chemistry).toBeCloseTo(bestTeamOvr, 6);
    }
    for (const offer of refreshed.filter((candidate) => candidate.kind === "hero")) {
      const bestTeamOvr = Math.max(...engine.heroes.map((outgoingHeroId) =>
        engine.previewHeroReplacement(outgoingHeroId, offer.heroSwap!.incomingHeroId).teamOvr));
      const after = offer.preview!.after;
      expect(after.base + after.heroSynergy + after.chemistry).toBeCloseTo(bestTeamOvr, 6);
    }
  });
});

// R9.1 — регресс: сужение пака тактикой не должно убивать роль целиком.
describe("Last Dance: сбалансированное сужение пака", () => {
  const data = loadGameData();
  const roles = ROLE_SEQUENCE;

  function completed(seed: string): RunEngine {
    const engine = new RunEngine(data, defaultRunConfig, seed);
    runToEnd(engine);
    return engine;
  }

  it("держит минимум один core и один support при любом seed", () => {
    for (let rerollN = 0; rerollN < 40; rerollN += 1) {
      const kept = balancedPackSlots(roles, 3, new Rng(`trim-${rerollN}`));
      expect(kept).toHaveLength(3);
      expect(kept.some((i) => roles[i] !== "support")).toBe(true);
      expect(kept.some((i) => roles[i] === "support")).toBe(true);
      // Порядок отображения остаётся исходным порядком слотов.
      expect([...kept].sort((a, b) => a - b)).toEqual(kept);
    }
  });

  it("вырожденные размеры пака не падают", () => {
    expect(balancedPackSlots(roles, 5, new Rng("edge"))).toEqual([0, 1, 2, 3, 4]);
    expect(balancedPackSlots(roles, 9, new Rng("edge"))).toEqual([0, 1, 2, 3, 4]);
    expect(balancedPackSlots(roles, 1, new Rng("edge"))).toHaveLength(1);
    expect(balancedPackSlots(roles, 0, new Rng("edge"))).toEqual([]);
  });

  it("support-оффер выживает при активной Last Dance (раньше срезался всегда)", () => {
    const engine = completed("last-dance-market");
    let sawSupport = false;
    for (let rerollN = 0; rerollN < 8; rerollN += 1) {
      const offers = buildAnteMarketRoulette(engine, "last-dance-market", 1, rerollN, ["lastDance"]);
      const players = offers.filter((offer) => offer.kind === "player");
      expect(players).toHaveLength(5 - TACTICS.lastDance.marketPackPenalty);
      const offeredRoles = players.map((offer) =>
        engine.candidateByRef(offer.playerSwap!.incoming)!.player.role);
      // Инвариант на КАЖДОМ реролле: роль не вымирает целиком.
      expect(offeredRoles.some((role) => role !== "support")).toBe(true);
      if (offeredRoles.includes("support")) sawSupport = true;
    }
    expect(sawSupport).toBe(true);
  });

  it("сужение детерминировано и не подменяет удержанные карты", () => {
    const engine = completed("last-dance-determinism");
    const a = buildAnteMarketRoulette(engine, "last-dance-determinism", 2, 0, ["lastDance"]);
    const b = buildAnteMarketRoulette(engine, "last-dance-determinism", 2, 0, ["lastDance"]);
    expect(a).toEqual(b);
    // Полный пак без тактики содержит те же карты — тактика забирает варианты, а не меняет их.
    const full = buildAnteMarketRoulette(engine, "last-dance-determinism", 2, 0);
    const fullPlayerIds = new Set(full.filter((o) => o.kind === "player").map((o) => o.id));
    for (const offer of a.filter((o) => o.kind === "player")) {
      expect(fullPlayerIds.has(offer.id)).toBe(true);
      expect(offer).toEqual(full.find((o) => o.id === offer.id));
    }
  });
});

// Регресс live-бага 2026-07-27: покупка Form Upgrade у SUPPORT молча не срабатывала.
// snap() строил превью возврата запасного во ВСЕ слоты той же роли; после апгрейда на скамейке
// лежала старая форма человека, чья личность активна, и превью во второй support-слот бросало
// исключение. buyMarket его глотал: золото списано, ростер изменён, UI заморожен.
describe("Form Upgrade у роли с двумя слотами", () => {
  const data = loadGameData();

  it("покупка support-апгрейда обновляет и ростер, и снимок стора, и золото — один раз", () => {
    const engine = new RunEngine(data, defaultRunConfig, "form-upgrade-support");
    runToEnd(engine);

    // Ищем активного support, у которого в пуле есть более сильная форма той же роли.
    const supportSlots = engine.rosterView.flatMap((slot, index) => slot.role === "support" ? [index] : []);
    expect(supportSlots).toHaveLength(2);
    let found: { slotIndex: number; incoming: ReturnType<typeof engine.candidateByRef> } | null = null;
    for (const slotIndex of supportSlots) {
      const active = engine.rosterView[slotIndex].candidate!;
      const better = engine.marketPlayerCandidates.find((c) =>
        c.player.accountId === active.player.accountId
        && c.player.role === "support"
        && c.player.ovr > active.player.ovr);
      if (better) { found = { slotIndex, incoming: better }; break; }
    }
    if (!found?.incoming) return; // у этого seed нет более сильной support-формы

    const economy = new RunEconomy("form-upgrade-support");
    economy.awardStageClear(1, "1", 8);
    economy.openCamp(1);
    economy.prepareMarketOffers([{
      id: "mkt-form-upgrade",
      kind: "player",
      labelKey: "market.player",
      cost: 1,
      playerSwap: {
        slotIndex: found.slotIndex,
        outgoingAccountId: engine.rosterView[found.slotIndex].candidate!.player.accountId,
        incoming: candidateRef(found.incoming),
      },
    }]);

    useRun.setState({ engine, economy, phase: "camp", data, seed: "form-upgrade-support" });
    const goldBefore = economy.gold;
    useRun.getState().buyMarket("mkt-form-upgrade");

    // Ростер получил новую форму...
    expect(engine.rosterView[found.slotIndex].candidate!.eventId).toBe(found.incoming.eventId);
    // ...снимок стора это увидел (до фикса snap бросал, и set() не выполнялся)...
    expect(useRun.getState().snapshot?.roster[found.slotIndex].candidate?.eventId)
      .toBe(found.incoming.eventId);
    // ...и золото списано ровно один раз.
    expect(economy.gold).toBe(goldBefore - 1);

    // Старая форма на скамейке: вернуть её можно в СВОЙ слот и нельзя во второй той же роли.
    const benchAccountId = engine.reservePlayers.at(-1)!.player.accountId;
    const other = supportSlots.find((index) => index !== found!.slotIndex)!;
    expect(engine.canSwapReservePlayer(found.slotIndex, benchAccountId)).toBe(true);
    expect(engine.canSwapReservePlayer(other, benchAccountId)).toBe(false);
  });

  it("своя форма не сильнее текущей на рынок не попадает", () => {
    const engine = new RunEngine(data, defaultRunConfig, "no-sidegrade-forms");
    runToEnd(engine);
    const activeOvr = new Map(engine.rosterView.flatMap((slot) =>
      slot.candidate ? [[slot.candidate.player.accountId, slot.candidate.player.ovr] as const] : []));

    for (const stage of [1, 3, 5]) {
      const offers = buildAnteMarketRoulette(engine, "no-sidegrade-forms", stage, 0, [], { stageCount: 5 });
      for (const offer of offers.filter((o) => o.kind === "player")) {
        const incoming = engine.candidateByRef(offer.playerSwap!.incoming)!;
        const own = activeOvr.get(incoming.player.accountId);
        // Nisha 90 → Nisha 90 с нулевой дельтой больше не предлагается.
        if (own != null) expect(incoming.player.ovr).toBeGreaterThan(own);
      }
    }
  });
});

// R5.1-fix: нижняя граница рынка. Поздний этап не должен показывать карты, которые заведомо
// бесполезны против текущего состава, — это не ловушка, а шум, съедающий дорожающий реролл.
describe("Нижняя граница рынка", () => {
  const data = loadGameData();
  const engine = (() => {
    const e = new RunEngine(data, defaultRunConfig, "floor");
    runToEnd(e);
    return e;
  })();
  const pool = engine.marketPlayerCandidates.filter((c) => c.player.role === "support");
  const minOvr = (list: readonly { player: { ovr: number } }[]) =>
    list.reduce((m, c) => Math.min(m, c.player.ovr), Infinity);
  const maxOvr = (list: readonly { player: { ovr: number } }[]) =>
    list.reduce((m, c) => Math.max(m, c.player.ovr), -Infinity);

  it("к концу сезона порог растёт, в начале не режет", () => {
    const weak = [70, 72];
    const start = stockedForms(pool, { seasonProgress: 0, activeOvrs: weak });
    const end = stockedForms(pool, { seasonProgress: 1, activeOvrs: weak });
    expect(minOvr(end)).toBeGreaterThan(minOvr(start));
    expect(end.length).toBeLessThan(start.length);
  });

  it("сильный состав поднимает порог независимо от этапа", () => {
    const strong = stockedForms(pool, { seasonProgress: 0, activeOvrs: [85, 86] });
    // 85 − rosterGapOvr: карты, безнадёжно слабее своих, не выставляются даже на первом этапе.
    expect(minOvr(strong)).toBeGreaterThanOrEqual(85 - FORM_FLOOR.rosterGapOvr);
    // Ловушки живы: формы чуть слабее активных остаются.
    expect(strong.some((c) => c.player.ovr < 85)).toBe(true);
  });

  it("верх пула не срезается никогда и пул не вырождается", () => {
    const full = maxOvr(pool);
    for (const activeOvrs of [[70, 72], [85, 86], [93, 94]]) {
      for (const seasonProgress of [0, 0.5, 1]) {
        const stocked = stockedForms(pool, { seasonProgress, activeOvrs });
        expect(maxOvr(stocked)).toBe(full);
        expect(stocked.length).toBeGreaterThanOrEqual(FORM_FLOOR.minPoolSize);
      }
    }
  });

  it("пустой пул роли не роняет расчёт", () => {
    expect(stockedForms([], { seasonProgress: 1, activeOvrs: [88] })).toEqual([]);
  });
});
