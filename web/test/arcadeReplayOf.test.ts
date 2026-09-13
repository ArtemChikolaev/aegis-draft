import { beforeEach, describe, expect, it } from "vitest";
import type { ArcadeSim } from "../src/game/arcade/sim.ts";
import { sec } from "../src/game/arcade/config.ts";
import { IDLE_INPUT, SHOP_ACT, type ArcadeInput } from "../src/game/arcade/types.ts";
import { decodeReplay, encodeReplay } from "../src/game/arcade/replay.ts";
import { rollGear } from "../src/game/arcade/content/gear.ts";
import { Rng } from "../src/game/rng.ts";
import { emptyProgress, equippedGear, getArcadeSim, replayOf, useArcade } from "../src/state/arcadeStore.ts";

/** Бот тестов реплея: круги по карте, редкий каст; карточка — первая, лавка/добыча/нейтралка закрываются. */
function play(sim: ArcadeSim, ticks: number): void {
  for (let i = 0; i < ticks && !sim.over; i++) {
    const t = sim.tick;
    sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : sim.shopOpen || sim.lootOpen || sim.neutralOpen ? { ...IDLE_INPUT, act: SHOP_ACT.close } : { mx: [16, 0, -16, 0][Math.floor(t / 90) % 4], my: [0, 16, 0, -16][Math.floor(t / 90) % 4], cast: t % 300 === 0 ? 1 : 0, choose: -1, act: 0 });
  }
}

/** Проиграть лог так же, как цикл экрана при просмотре реплея: на каждом step() — последняя запись с шагом ≤ текущего. */
function watch(sim: ArcadeSim, log: readonly (readonly number[])[], steps: number): void {
  let idx = 0;
  let input: ArcadeInput = { ...IDLE_INPUT };
  while (sim.steps < steps && !sim.over) {
    while (idx < log.length && log[idx][0] <= sim.steps) {
      const [, mx, my, cast, choose, act] = log[idx++];
      input = { mx, my, cast, choose, act: act ?? 0 };
    }
    sim.step(input);
  }
}

const SPENT = { reach: 1, swift: 2, thrift: 0, insight: 0, provisions: 0 };

describe("replayOf: код реплея с экрана итога", () => {
  beforeEach(() => {
    // Zeus с двумя отметками (открыта «Быстрота»), вложенным наследием и надетым шлемом — всё, что входит в детерминизм.
    const progress = emptyProgress();
    progress.perHero.zeus = { runs: 2, victories: 2, bestSeconds: 1200, bestLevel: 20, marks: ["win_full", "flawless"] };
    progress.legacy = { seals: 3, spent: { ...SPENT }, claimed: [] };
    const helm = rollGear(new Rng("replay-of-helm"), 2, "exotic", "replay-of-helm", "helm");
    useArcade.setState({ status: "setup", hero: "zeus", act: "short", rank: 0, trait: "swift", progress, gear: { items: [helm], equipped: { helm: helm.uid } }, replayLog: null });
  });

  it("несёт особенность, стартовую экипировку и наследие; «Смотреть реплей» воспроизводит забег с особенностью", () => {
    useArcade.getState().start("replay-of-1");
    const sim = getArcadeSim()!;
    expect(sim.trait?.id).toBe("swift");
    const startGear = equippedGear(useArcade.getState().gear);
    expect(startGear).toHaveLength(1);
    play(sim, sec(90));
    const rep = replayOf(sim, useArcade.getState().runStart);
    expect(rep).toMatchObject({ seed: "replay-of-1", hero: "zeus", act: "short", rank: 0, trait: "swift", gear: startGear, legacy: SPENT });
    expect(rep.log).toEqual(sim.log);
    expect(rep.log).not.toBe(sim.log); // копия: сим продолжает писать свой лог
    // «Копировать код» и «Ссылка» отдают строку — всё переживает кодек.
    const decoded = decodeReplay(encodeReplay(rep))!;
    expect(decoded).toMatchObject({ trait: "swift", gear: startGear, legacy: SPENT });
    // «Смотреть реплей»: стор строит сим из того же объекта, забег совпадает бит-в-бит.
    const steps = sim.steps, digest = sim.digest();
    useArcade.getState().startReplay(decoded);
    const watched = getArcadeSim()!;
    watch(watched, decoded.log, steps);
    expect(watched.digest()).toBe(digest);
    // Контроль: без особенности (так кнопка «Смотреть» собирала реплей до исправления) забег расходится.
    useArcade.getState().startReplay({ ...decoded, trait: undefined });
    const broken = getArcadeSim()!;
    watch(broken, decoded.log, steps);
    expect(broken.digest()).not.toBe(digest);
  });

  it("«Ещё раз» после забега, сменившего шлем, пишет в код стартовую экипировку нового забега, а не первого", () => {
    useArcade.getState().start("replay-of-again");
    const first = getArcadeSim()!;
    const firstGear = replayOf(first, useArcade.getState().runStart).gear;
    // По ходу забега герой надел найденный шлем: завершение кладёт добычу в инвентарь и переносит надетое.
    const found = rollGear(new Rng("replay-of-found"), 3, "arcana", "replay-of-found", "helm");
    first.loot.push(found);
    first.player.gear.helm = found;
    (first as unknown as { finish(o: "dead"): void }).finish("dead");
    useArcade.getState().finish();
    expect(useArcade.getState().status).toBe("over");
    useArcade.getState().start("replay-of-again");
    const second = getArcadeSim()!;
    const rep = decodeReplay(encodeReplay(replayOf(second, useArcade.getState().runStart)))!;
    expect(rep.gear.map((g) => g.uid)).toEqual(["replay-of-found"]);
    expect(rep.gear).toEqual(equippedGear(useArcade.getState().gear));
    expect(firstGear.map((g) => g.uid)).toEqual(["replay-of-helm"]);
  });

  it("дейлик: в коде нет экипировки, наследия и особенности игрока — сим дейлика стартует без них", () => {
    useArcade.getState().startDaily();
    const daily = getArcadeSim()!;
    expect(daily.trait).toBeNull();
    const rep = replayOf(daily, useArcade.getState().runStart);
    expect(rep.gear).toEqual([]);
    expect(rep.legacy).toBeUndefined();
    expect(rep.trait).toBeUndefined();
  });
});
