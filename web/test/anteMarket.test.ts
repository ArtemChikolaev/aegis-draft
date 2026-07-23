import { describe, expect, it } from "vitest";
import { buildAnteMarketRoulette, refreshAnteMarketOffers } from "../src/game/anteMarket.ts";
import { RunEconomy, playerCost } from "../src/game/anteEconomy.ts";
import { RunEngine } from "../src/game/engine.ts";
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
