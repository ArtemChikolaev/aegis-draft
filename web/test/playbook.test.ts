import { describe, expect, it } from "vitest";
import { cardOffer, rewardOffers, tradeOffers } from "../src/game/anteOffers.ts";
import { PLAYBOOK_CARD_IDS, normalizePlaybook, playbookAllows, samePlaybook } from "../src/game/playbook.ts";
import { decodeRunLink, encodeRunLink, runConfigsMatch, type RunLink } from "../src/state/runLink.ts";
import type { RunConfig } from "../src/game/packs.ts";

const PLAYBOOK = ["widePool", "oldTeammates", "blackKingBar", "bottle", "dagon", "radiance", "forceStaff", "octarineCore"];

describe("playbook: канонизация", () => {
  it("уникальные карты каталога в диапазоне 6–10 → порядок каталога", () => {
    const shuffled = [...PLAYBOOK].reverse();
    const normalized = normalizePlaybook(shuffled)!;
    expect(normalized).toHaveLength(8);
    expect(normalized).toEqual(PLAYBOOK_CARD_IDS.filter((id) => PLAYBOOK.includes(id)));
  });
  it("дубликаты, чужие id, действия сбора и размер вне 6–10 — невалидны", () => {
    expect(normalizePlaybook([...PLAYBOOK, "widePool"])).toBeNull();
    expect(normalizePlaybook([...PLAYBOOK.slice(0, 7), "nope"])).toBeNull();
    expect(normalizePlaybook([...PLAYBOOK.slice(0, 7), "scouting"])).toBeNull();
    expect(normalizePlaybook(PLAYBOOK.slice(0, 5))).toBeNull();
    expect(normalizePlaybook([...PLAYBOOK, "linkensSphere", "butterfly", "mantaStyle"])).toBeNull();
  });
  it("playbookAllows: без Playbook — всё, действия сбора — всегда", () => {
    expect(playbookAllows(undefined, "mantaStyle")).toBe(true);
    expect(playbookAllows(PLAYBOOK, "mantaStyle")).toBe(false);
    expect(playbookAllows(PLAYBOOK, "widePool")).toBe(true);
    expect(playbookAllows(PLAYBOOK, "scouting")).toBe(true);
    expect(samePlaybook([...PLAYBOOK].reverse(), PLAYBOOK)).toBe(true);
    expect(samePlaybook(PLAYBOOK, undefined)).toBe(false);
  });
});

describe("playbook: генерация офферов", () => {
  const seeds = Array.from({ length: 60 }, (_, i) => `pb-seed-${i}`);
  it("карточная награда и trade-in берутся только из Playbook (действия сбора остаются)", () => {
    for (const seed of seeds) {
      for (const camp of [1, 2, 3]) {
        const card = cardOffer(seed, camp, [], false, undefined, PLAYBOOK);
        expect(card).not.toBeNull();
        if (card!.kind !== "action") expect(PLAYBOOK).toContain(card!.cardId);
        for (const id of tradeOffers(seed, camp, [], 0, PLAYBOOK)) expect(PLAYBOOK).toContain(id);
      }
    }
  });
  it("без Playbook офферы байт-идентичны прежним (сиды e2e не сдвигаются)", () => {
    for (const seed of seeds.slice(0, 20)) {
      expect(cardOffer(seed, 1, [], false, undefined, undefined)).toEqual(cardOffer(seed, 1, [], false));
      expect(rewardOffers(seed, 1, [], undefined, true, false, undefined, false, undefined)).toEqual(rewardOffers(seed, 1, [], undefined, true, false, undefined, false));
      expect(tradeOffers(seed, 1, [], 0, undefined)).toEqual(tradeOffers(seed, 1, [], 0));
    }
  });
});

describe("playbook: ссылка и совместимость конфигов", () => {
  const config: RunConfig = { draftStyle: "team", format: "last_2y", rerolls: 2, scoring: "event", allocation: "auto", playbook: normalizePlaybook(PLAYBOOK)! };
  const link: RunLink = { v: 1, s: 1, r: "v1.13.0", b: "b1.43.0", mode: "run", config, seed: "pb-link" };
  it("round-trip сохраняет Playbook, ссылка с битым Playbook не разбирается", () => {
    const decoded = decodeRunLink(encodeRunLink(link))!;
    expect(decoded.config.playbook).toEqual(config.playbook);
    const broken = encodeRunLink({ ...link, config: { ...config, playbook: ["widePool", "nope", "bottle", "dagon", "radiance", "forceStaff"] } });
    expect(decodeRunLink(broken)).toBeNull();
    const plain = decodeRunLink(encodeRunLink({ ...link, config: { ...config, playbook: undefined } }))!;
    expect("playbook" in plain.config).toBe(false);
  });
  it("runConfigsMatch различает Playbook, но не порядок карт в нём", () => {
    expect(runConfigsMatch(config, { ...config, playbook: [...PLAYBOOK].reverse() })).toBe(true);
    expect(runConfigsMatch(config, { ...config, playbook: undefined })).toBe(false);
  });
});
