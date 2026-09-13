import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { sec } from "../src/game/arcade/config.ts";
import { BANISH_ACT, IDLE_INPUT, REROLL_CHOOSE, SHOP_ACT, type InputLogEntry } from "../src/game/arcade/types.ts";
import { arcadeDaily, decodeReplay, encodeReplay, packLog, unpackLog } from "../src/game/arcade/replay.ts";
import { ARCADE_CONFIG_VERSION } from "../src/game/arcade/config.ts";
import { legacyBonus } from "../src/game/arcade/content/legacy.ts";

function play(sim: ArcadeSim, ticks: number): void {
  for (let i = 0; i < ticks && !sim.over; i++) {
    const t = sim.tick;
    const input = sim.pending ? { ...IDLE_INPUT, choose: 0 } : sim.shopOpen || sim.lootOpen || sim.neutralOpen ? { ...IDLE_INPUT, act: SHOP_ACT.close } : { mx: [16, 0, -16, 0][Math.floor(t / 90) % 4], my: [0, 16, 0, -16][Math.floor(t / 90) % 4], cast: (t % 300 === 0 ? 1 : 0), choose: -1, act: 0 };
    sim.step(input);
  }
}

describe("arcade replay codec + daily", () => {
  it("лог пакуется и распаковывается без потерь", () => {
    const sim = new ArcadeSim("codec-1", { hero: "zeus" });
    play(sim, sec(60));
    expect(sim.log.length).toBeGreaterThan(10);
    expect(unpackLog(packLog(sim.log))).toEqual(sim.log.map((e) => [...e]));
  });

  it("код реплея восстанавливает забег бит-в-бит; кривой код → null", () => {
    // Сид с точкой и тильдой, версия с точками — всё, что ломало разделитель.
    const sim = new ArcadeSim("codec.2~x", { hero: "axe", rank: 3, act: "short" });
    play(sim, sec(120));
    const code = encodeReplay({ seed: sim.seed, hero: sim.hero.id, rank: sim.rank.step, act: sim.act, version: ARCADE_CONFIG_VERSION, log: sim.log, gear: [] });
    const rep = decodeReplay(code)!;
    expect(rep.hero).toBe("axe");
    expect(rep.rank).toBe(3);
    expect(rep.act).toBe("short");
    expect(rep.seed).toBe("codec.2~x");
    expect(rep.version).toBe(ARCADE_CONFIG_VERSION);
    const replayed = ArcadeSim.replay(rep.seed, rep.log, sim.steps, { hero: rep.hero, rank: rep.rank, act: rep.act });
    expect(replayed.digest()).toBe(sim.digest());
    expect(decodeReplay("A1~x~y")).toBeNull();
    expect(decodeReplay(code.replace("axe", "no_such_hero"))).toBeNull();
    expect(decodeReplay(`https://x/y#arcade=${code}`)?.seed).toBe(sim.seed);
  });

  it("реролл уровня (choose −2) переживает упаковку лога и код реплея", () => {
    const entries: InputLogEntry[] = [[0, 0, 0, 0, REROLL_CHOOSE, 0], [7, 16, -16, 8, 2, BANISH_ACT + 1], [300, 0, 0, 0, -1, 0]];
    expect(unpackLog(packLog(entries))).toEqual(entries);
    // «Прозорливость» даёт бесплатные рероллы: золото не нужно подливать мимо лога.
    const spent = { reach: 0, swift: 0, thrift: 0, insight: 2, provisions: 0 };
    const opts = { hero: "juggernaut", act: "short" as const, legacy: legacyBonus(spent) };
    const live = new ArcadeSim("reroll-code", opts);
    let rerolled = false;
    for (let i = 0; i < sec(90) && !live.over; i++) {
      if (live.pending && !rerolled) { live.step({ ...IDLE_INPUT, choose: REROLL_CHOOSE }); rerolled = true; continue; }
      live.step(live.pending ? { ...IDLE_INPUT, choose: 0 } : IDLE_INPUT);
    }
    expect(live.levelRerolls).toBe(1);
    const code = encodeReplay({ seed: live.seed, hero: "juggernaut", rank: 0, act: "short", version: ARCADE_CONFIG_VERSION, log: live.log, gear: [], legacy: spent });
    const rep = decodeReplay(code)!;
    const replayed = ArcadeSim.replay(rep.seed, rep.log, live.steps, { hero: rep.hero, act: rep.act, legacy: legacyBonus(rep.legacy!) });
    expect(replayed.levelRerolls).toBe(1);
    expect(replayed.digest()).toBe(live.digest());
  });

  it("дейлик: один сид и герой на день, разные дни — разные", () => {
    const a = arcadeDaily(new Date("2026-09-05T10:00:00Z"));
    const b = arcadeDaily(new Date("2026-09-05T23:59:00Z"));
    const c = arcadeDaily(new Date("2026-09-06T00:01:00Z"));
    expect(a).toEqual(b);
    expect(c.seed).not.toBe(a.seed);
    expect(a.act).toBe("full");
  });
});
