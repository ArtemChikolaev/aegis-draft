import { describe, expect, it } from "vitest";
import { MANAGER_INCOME, salaryBand, salaryFor } from "../src/game/manager/economy.ts";
import {
  HERO_PICKS_PER_ROUND,
  HERO_ROUNDS,
  ManagerEngine,
  TRYOUT_PICKS,
  managerCandidatePool,
  type ManagerConfig,
  type ManagerState,
} from "../src/game/manager/engine.ts";
import { Rng } from "../src/game/rng.ts";
import { ROLE_SEQUENCE } from "../src/game/packs.ts";
import { loadGameData } from "./helpers/data.ts";

const data = loadGameData();
const config: ManagerConfig = { orgName: "Test Org", region: "weu", difficulty: "normal", format: "last_2y" };

/** Прогнать драфт орга до контрактов: пики + герои первой карточкой. */
function draftOrg(engine: ManagerEngine): void {
  for (let i = 0; i < TRYOUT_PICKS; i += 1) {
    expect(engine.pickTryout(engine.state.tryoutOffer[0].candidate.player.accountId)).toBe(true);
  }
  for (let r = 0; r < HERO_ROUNDS; r += 1) {
    expect(engine.pickHeroes(engine.state.heroOffer.slice(0, HERO_PICKS_PER_ROUND))).toBe(true);
  }
}

/** Дешёвая валидная пятёрка: филлеры покрывают все роли по построению. */
function cheapestFive(engine: ManagerEngine): number[] {
  const byRole = new Map<string, number[]>();
  const sorted = [...engine.state.candidates].sort((a, b) => a.salary - b.salary);
  const ids: number[] = [];
  for (const role of ROLE_SEQUENCE) {
    const pick = sorted.find(
      (c) => c.candidate.player.role === role && !ids.includes(c.candidate.player.accountId),
    )!;
    ids.push(pick.candidate.player.accountId);
    byRole.set(role, [...(byRole.get(role) ?? []), pick.candidate.player.accountId]);
  }
  return ids;
}

describe("economy", () => {
  it("зарплата растёт с OVR, бенды стабильны", () => {
    const rng = () => new Rng("salary");
    expect(salaryFor(90, rng())).toBeGreaterThan(salaryFor(75, rng()));
    expect(salaryFor(75, rng())).toBeGreaterThan(salaryFor(62, rng()));
    expect(salaryBand(8)).toBe(1);
    expect(salaryBand(15)).toBe(2);
    expect(salaryBand(25)).toBe(3);
    expect(salaryBand(40)).toBe(4);
  });
});

describe("ManagerEngine — драфт орга", () => {
  it("детерминизм: один сид — одинаковые трайауты и календарь", () => {
    const a = ManagerEngine.create(data, "det", config);
    const b = ManagerEngine.create(data, "det", config);
    expect(a.state.tryoutOffer.map((o) => o.candidate.player.accountId)).toEqual(
      b.state.tryoutOffer.map((o) => o.candidate.player.accountId),
    );
    expect(a.state.calendar.map((s) => s.name)).toEqual(b.state.calendar.map((s) => s.name));
    expect(a.state.world).toEqual(b.state.world);
  });

  it("пул кандидатов: одна (свежайшая) форма на человека", () => {
    const pool = managerCandidatePool(data, "last_2y");
    const ids = pool.map((c) => c.player.accountId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(pool.length).toBeGreaterThan(50);
  });

  it("реролл меняет предложение, пики уходят из пула, после 8 пиков — герои", () => {
    const engine = ManagerEngine.create(data, "flow", config);
    const before = engine.state.tryoutOffer.map((o) => o.candidate.player.accountId);
    expect(engine.rerollTryouts()).toBe(true);
    expect(engine.state.tryoutOffer.map((o) => o.candidate.player.accountId)).not.toEqual(before);
    expect(engine.rerollTryouts()).toBe(false); // лимит 1
    const picked: number[] = [];
    for (let i = 0; i < TRYOUT_PICKS; i += 1) {
      const id = engine.state.tryoutOffer[0].candidate.player.accountId;
      expect(picked).not.toContain(id); // взятый не предлагается снова
      picked.push(id);
      engine.pickTryout(id);
    }
    expect(engine.state.phase).toBe("heroPool");
  });

  it("4 раунда героев → контракты: 8 пиков + филлеры на все роли, пул героев 12", () => {
    const engine = ManagerEngine.create(data, "heroes", config);
    draftOrg(engine);
    expect(engine.state.phase).toBe("contracts");
    expect(engine.state.heroPool.length).toBe(HERO_ROUNDS * HERO_PICKS_PER_ROUND);
    expect(new Set(engine.state.heroPool).size).toBe(12);
    const fillers = engine.state.candidates.filter((c) => c.filler);
    const fillerRoles = fillers.map((f) => f.candidate.player.role).sort();
    expect(fillerRoles).toEqual([...ROLE_SEQUENCE].sort());
    expect(engine.state.candidates.length).toBe(TRYOUT_PICKS + 5);
  });
});

describe("ManagerEngine — контракты и сезон", () => {
  it("валидация: роли и бюджет; подпись переводит в сезон и даёт счёт", () => {
    const engine = ManagerEngine.create(data, "sign", config);
    draftOrg(engine);
    expect(engine.validateRoster([1, 2, 3]).reason).toBe("size");
    const five = cheapestFive(engine);
    expect(engine.validateRoster(five).ok).toBe(true);
    // Дешёвая пятёрка обязана влезать в даже hard-доход — иначе режим несобираем.
    const wages = engine.state.candidates
      .filter((c) => five.includes(c.candidate.player.accountId))
      .reduce((sum, c) => sum + c.salary, 0);
    expect(wages).toBeLessThanOrEqual(MANAGER_INCOME.hard);
    expect(engine.signRoster(five)).toBe(true);
    expect(engine.state.phase).toBe("season");
    expect(engine.state.roster.map((p) => p.candidate.player.role)).toEqual(ROLE_SEQUENCE);
    const score = engine.score();
    expect(score).not.toBeNull();
    expect(score!.teamOvr).toBeGreaterThan(40);
  });

  it("полный сезон: все слоты закрываются, гейт работает, оффсезон детерминирован", () => {
    const engine = ManagerEngine.create(data, "season", config);
    draftOrg(engine);
    engine.signRoster(cheapestFive(engine));
    let guard = 0;
    while (!engine.seasonFinished() && guard < 60) {
      const result = engine.playNextEvent();
      if (result) {
        expect(result.placement).toBeGreaterThanOrEqual(1);
        expect(result.placement).toBeLessThanOrEqual(result.fieldSize);
      }
      engine.continueSeason();
      guard += 1;
    }
    expect(engine.seasonFinished()).toBe(true);
    // Гейт: каждое gated-событие либо сыграно после успешной квалификации, либо dnq.
    for (const slot of engine.state.calendar) {
      expect(Boolean(slot.result) || slot.dnq === true).toBe(true);
      if (slot.gated && slot.dnq) expect(slot.result).toBeUndefined();
    }
    expect(engine.state.phase).toBe("offseason");
    // Детерминизм дрифта: второй прогон того же сида даёт те же дрифты.
    const engine2 = ManagerEngine.create(data, "season", config);
    draftOrg(engine2);
    engine2.signRoster(cheapestFive(engine2));
    let guard2 = 0;
    while (!engine2.seasonFinished() && guard2 < 60) {
      engine2.playNextEvent();
      engine2.continueSeason();
      guard2 += 1;
    }
    expect(engine2.state.offseasonDrifts).toEqual(engine.state.offseasonDrifts);
    expect(engine2.state.bankK).toBe(engine.state.bankK);
  });

  it("оффсезон: подтверждение применяет дрифт/зарплаты, release заменяет той же ролью, новый сезон чист", () => {
    const engine = ManagerEngine.create(data, "season", config);
    draftOrg(engine);
    engine.signRoster(cheapestFive(engine));
    let guard = 0;
    while (!engine.seasonFinished() && guard < 60) {
      engine.playNextEvent();
      engine.continueSeason();
      guard += 1;
    }
    const releasedId = engine.state.roster[0].candidate.player.accountId;
    const releasedRole = engine.state.roster[0].candidate.player.role;
    engine.toggleRelease(releasedId);
    expect(engine.confirmOffseason()).toBe(true);
    expect(engine.state.phase).toBe("review");
    expect(engine.state.roster[0].candidate.player.accountId).not.toBe(releasedId);
    expect(engine.state.roster[0].candidate.player.role).toBe(releasedRole);
    engine.startNextSeason();
    expect(engine.state.season).toBe(2);
    expect(engine.state.phase).toBe("season");
    expect(engine.state.feed).toEqual([]);
    expect(engine.nextSlot).not.toBeNull();
  });
});

describe("ManagerEngine — персист", () => {
  it("JSON round-trip восстанавливает движок: тот же счёт и следующее событие", () => {
    const engine = ManagerEngine.create(data, "persist", config);
    draftOrg(engine);
    engine.signRoster(cheapestFive(engine));
    engine.playNextEvent();
    engine.continueSeason();
    const restored = new ManagerEngine(data, JSON.parse(JSON.stringify(engine.state)) as ManagerState);
    expect(restored.nextSlot?.id).toBe(engine.nextSlot?.id);
    expect(restored.score()?.teamOvr).toBe(engine.score()?.teamOvr);
    expect(restored.wagesK).toBe(engine.wagesK);
    // Продолжение с восстановленного даёт тот же результат, что с оригинала (сид-детерминизм).
    const a = restored.playNextEvent();
    const b = engine.playNextEvent();
    expect(a?.placement).toBe(b?.placement);
    expect(a?.prizeK).toBe(b?.prizeK);
  });
});
