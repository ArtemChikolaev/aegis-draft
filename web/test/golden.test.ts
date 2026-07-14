import { describe, expect, it } from "vitest";
import { RunEngine } from "../src/game/engine.ts";
import { tournamentCareerResults } from "../src/state/careerStore.ts";
import { loadGameData } from "./helpers/data.ts";
import { isMockBaseline } from "./helpers/dataset.ts";
import { defaultRunConfig } from "./helpers/packs.ts";
import { engineSignature, runToEnd } from "./helpers/engine.ts";
import { loadGolden, writeGolden } from "./helpers/golden.ts";
import { advanceToEnd, createTournament, tournamentGoldenSummary } from "./helpers/tournament.ts";

const UPDATE = process.env.UPDATE_GOLDEN === "1";

function engineGoldenPayload(engine: RunEngine) {
  return JSON.parse(engineSignature(engine));
}

describe("golden fixtures", () => {
  const data = loadGameData();

  it.skipIf(!isMockBaseline(data.manifest))("engine run-team (mock baseline)", () => {
    const engine = new RunEngine(data, defaultRunConfig, "run-team");
    runToEnd(engine);
    const payload = engineGoldenPayload(engine);
    if (UPDATE) writeGolden("engine-run-team", payload);
    expect(payload).toEqual(loadGolden("engine-run-team"));
  });

  it.skipIf(!isMockBaseline(data.manifest))("tournament tournament-contract (mock baseline)", () => {
    const snapshot = advanceToEnd(createTournament(data));
    const payload = tournamentGoldenSummary(snapshot);
    if (UPDATE) writeGolden("tournament-contract", payload);
    expect(payload).toEqual(loadGolden("tournament-contract"));
  });

  it.skipIf(!isMockBaseline(data.manifest))("career results career-contract (mock baseline)", () => {
    const snapshot = advanceToEnd(createTournament(data, "career-contract", 61.5, "Career Five"));
    const payload = {
      userPlacement: snapshot.userPlacement,
      results: tournamentCareerResults(snapshot),
    };
    if (UPDATE) writeGolden("career-contract", payload);
    expect(payload).toEqual(loadGolden("career-contract"));
  });
});
