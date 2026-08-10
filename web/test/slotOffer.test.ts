// Шестой слот тактик (LG2, R12.6): одноразовый reward-оффер «+1 слот за перманентный минус».
import { describe, expect, it } from "vitest";
import { ECONOMY, RunEconomy, type RunEconomyState } from "../src/game/anteEconomy.ts";
import { ACT_LENGTH, SEASON } from "../src/game/anteRun.ts";
import { TACTIC_SLOTS, TACTIC_IDS } from "../src/game/tactics.ts";

const ACT4_CAMP = ACT_LENGTH * 3; // первый лагерь предпоследнего акта (акт 4 при пяти)
const DYNASTY_CAMP = SEASON.stages.length; // первый лагерь Династии

function economyAt(campStageIndex: number, mutate?: (state: RunEconomyState) => void): RunEconomy {
  const economy = new RunEconomy("slot-test");
  const state = economy.snapshot;
  state.inCamp = true;
  state.campStageIndex = campStageIndex;
  mutate?.(state);
  return new RunEconomy("slot-test", state);
}

function slotOfferOf(economy: RunEconomy) {
  return economy.campView().rewardOffers.find((offer) => offer.kind === "slot");
}

describe("оффер шестого слота", () => {
  it("приходит в первом лагере предпоследнего акта и в Династии, но не раньше", () => {
    for (const camp of [0, 1, ACT_LENGTH, ACT4_CAMP - 1, ACT4_CAMP + 1, DYNASTY_CAMP - 1]) {
      expect(slotOfferOf(economyAt(camp)), `лагерь ${camp}`).toBeUndefined();
    }
    expect(slotOfferOf(economyAt(ACT4_CAMP))).toBeDefined();
    expect(slotOfferOf(economyAt(DYNASTY_CAMP))).toBeDefined();
    expect(slotOfferOf(economyAt(DYNASTY_CAMP + ACT_LENGTH * 3))).toBeDefined();
  });

  it("взятие даёт +1 слот и перманентный минус к Base; второй оффер не приходит", () => {
    const economy = economyAt(ACT4_CAMP);
    const offer = slotOfferOf(economy)!;
    expect(economy.chooseReward(offer.id)).toBe(true);
    expect(economy.campView().tacticSlots).toBe(TACTIC_SLOTS + ECONOMY.slotOffer.slots);
    expect(economy.modifiers().base).toBe(-ECONOMY.slotOffer.basePenalty);
    // Оффер одноразовый: в следующем лагере Династии его больше нет.
    const later = economy.snapshot;
    later.campStageIndex = DYNASTY_CAMP;
    later.chosenRewardId = null;
    expect(slotOfferOf(new RunEconomy("slot-test", later))).toBeUndefined();
  });

  it("шестая тактика реально помещается только после обмена", () => {
    const five = TACTIC_IDS.slice(0, TACTIC_SLOTS);
    const withFull = economyAt(ACT4_CAMP, (state) => {
      state.equippedTactics = [...five];
      state.ownedCards = [...five];
    });
    expect(withFull.canTakeCard("tactic")).toBe(false);
    const offer = slotOfferOf(withFull)!;
    expect(withFull.chooseReward(offer.id)).toBe(true);
    expect(withFull.canTakeCard("tactic")).toBe(true);
  });

  it("legacy-сейв без tacticSlots читается пятью слотами, roundtrip сохраняет шестой", () => {
    const legacy = economyAt(0).snapshot as Partial<RunEconomyState>;
    delete legacy.tacticSlots;
    const restored = new RunEconomy("slot-test", legacy as RunEconomyState);
    expect(restored.campView().tacticSlots).toBe(TACTIC_SLOTS);
    const taken = economyAt(ACT4_CAMP);
    taken.chooseReward(slotOfferOf(taken)!.id);
    const roundtrip = new RunEconomy("slot-test", JSON.parse(JSON.stringify(taken.snapshot)));
    expect(roundtrip.campView().tacticSlots).toBe(TACTIC_SLOTS + ECONOMY.slotOffer.slots);
  });
});
