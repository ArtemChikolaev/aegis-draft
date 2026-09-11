import { beforeEach, describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE_CONFIG_VERSION } from "../src/game/arcade/config.ts";
import { IDLE_INPUT } from "../src/game/arcade/types.ts";
import { TRAITS, TRAIT_IDS, applyTrait, isTraitId, traitUnlocked } from "../src/game/arcade/content/traits.ts";
import { decodeReplay, encodeReplay } from "../src/game/arcade/replay.ts";
import { emptyProgress, recordProgress, useArcade } from "../src/state/arcadeStore.ts";

// Стартовые особенности (T13.62): множители базы с плюсом и минусом, открываются отметками мастерства героя.
describe("стартовые особенности", () => {
  it("каждая особенность имеет плюс и минус; применяется к базе героя до апгрейдов; чужой id — без особенности", () => {
    for (const id of TRAIT_IDS) {
      const t = TRAITS[id];
      const vals = Object.entries(t.mult).map(([k, v]) => (k === "attackInterval" ? 1 / v : v));
      expect(vals.some((v) => v > 1) || !!t.add, id).toBe(true);
      expect(vals.some((v) => v < 1), id).toBe(true);
      expect(t.unlockMarks).toBeGreaterThanOrEqual(1);
    }
    const base = new ArcadeSim("trait-1", { hero: "axe" }), b = new ArcadeSim("trait-1", { hero: "axe", trait: "berserk" });
    expect(base.trait).toBeNull(); expect(b.trait?.id).toBe("berserk");
    expect(b.player.stats.damage).toBeCloseTo(base.player.stats.damage * 1.2, 5);
    expect(b.player.stats.maxHp).toBeCloseTo(base.player.stats.maxHp * 0.85, 5);
    expect(b.player.stats.attackInterval).toBeCloseTo(base.player.stats.attackInterval * 0.92, 5);
    const w = new ArcadeSim("trait-1", { hero: "axe", trait: "bulwark" });
    expect(w.player.stats.armor).toBeCloseTo(base.player.stats.armor + 3, 5);
    expect(w.player.stats.speed).toBeCloseTo(base.player.stats.speed * 0.9, 5);
    expect(new ArcadeSim("trait-1", { hero: "axe", trait: "nope" }).trait).toBeNull();
    expect(isTraitId("swift")).toBe(true); expect(isTraitId("x")).toBe(false);
    const s = { ...base.player.stats }; applyTrait(s, null); expect(s).toEqual(base.player.stats);
    (b as unknown as { finish(o: "dead"): void }).finish("dead");
    expect(b.over?.trait).toBe("berserk");
    expect(base.over ?? null).toBeNull();
  });

  it("реплей несёт особенность десятой частью; без неё код прежний; кривая особенность → null; наследие-заглушка 0.0.0", () => {
    const sim = new ArcadeSim("trait-2", { hero: "zeus", trait: "swift" });
    for (let i = 0; i < 120; i++) sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : { ...IDLE_INPUT, mx: 16 });
    const base = { seed: sim.seed, hero: sim.hero.id, rank: 0, act: sim.act, version: ARCADE_CONFIG_VERSION, log: sim.log, gear: [] } as const;
    const plain = encodeReplay(base);
    expect(plain.split("~").length).toBe(8);
    const withTrait = encodeReplay({ ...base, trait: "swift" });
    expect(withTrait.split("~").length).toBe(10);
    expect(withTrait.split("~")[8]).toBe("0.0.0");
    const rep = decodeReplay(withTrait)!;
    expect(rep.trait).toBe("swift");
    expect(rep.legacy).toBeUndefined();
    expect(decodeReplay(plain)!.trait).toBeUndefined();
    expect(decodeReplay(withTrait.replace(/swift$/, "hax"))).toBeNull();
    const withBoth = decodeReplay(encodeReplay({ ...base, trait: "bulwark", legacy: { vitality: 1, might: 0, reach: 2 } }))!;
    expect(withBoth.trait).toBe("bulwark"); expect(withBoth.legacy).toEqual({ vitality: 1, might: 0, reach: 2 });
    // Воспроизведение с особенностью детерминировано.
    const re = new ArcadeSim(sim.seed, { hero: "zeus", trait: rep.trait });
    let cur = { ...IDLE_INPUT };
    for (const [step, mx, my, cast, choose, act] of rep.log) { while (re.steps < step && !re.over) re.step(cur); cur = { mx, my, cast, choose, act }; re.step(cur); }
    while (re.steps < sim.steps && !re.over) re.step(cur);
    expect(re.digest()).toBe(sim.digest());
  });

  describe("стор", () => {
    beforeEach(() => { useArcade.setState({ hero: "juggernaut", trait: null, progress: emptyProgress(), status: "setup" }); });
    it("закрытая особенность не выбирается; отметки открывают; смена героя сбрасывает закрытую", () => {
      const st = useArcade.getState();
      expect(traitUnlocked("berserk", 0)).toBe(false); expect(traitUnlocked("berserk", 1)).toBe(true); expect(traitUnlocked("swift", 1)).toBe(false);
      st.setTrait("berserk");
      expect(useArcade.getState().trait).toBeNull();
      const p = recordProgress(emptyProgress(), { seed: "s", outcome: "dead", seconds: 10, level: 3, kills: 1, gold: 0, schools: [], configVersion: "x", at: 0, hero: "juggernaut", act: "short", camp: true });
      useArcade.setState({ progress: p });
      st.setTrait("berserk");
      expect(useArcade.getState().trait).toBe("berserk");
      st.setTrait("swift");
      expect(useArcade.getState().trait).toBe("berserk"); // нужно 2 отметки
      st.setHero("axe");
      expect(useArcade.getState().trait).toBeNull(); // у Axe отметок нет
      st.setHero("juggernaut"); st.setTrait("berserk"); st.setTrait(null);
      expect(useArcade.getState().trait).toBeNull();
    });
  });
});
