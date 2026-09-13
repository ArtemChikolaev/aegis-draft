// Выбранный ранг (2026-09-13): помнится между перезагрузками и не перебивается реплеем/дейликом — владелец после
// просмотра реплея увидел, что «прогресс не стал Herald 3»: реплей Herald 1 переписал выбор, а забег стартовал на нём.
import { describe, it, expect } from "vitest";
import { useArcade } from "../src/state/arcadeStore.ts";
import { readCached } from "../src/state/persist.ts";

describe("выбор ранга", () => {
  it("setRank пишет выбор в хранилище (в пределах открытого)", () => {
    useArcade.setState({ progress: { ...useArcade.getState().progress, bestRank: 5 } });
    useArcade.getState().setRank(1);
    expect(useArcade.getState().rank).toBe(1);
    expect(readCached("aegis-draft.arcade.rank")).toBe("1");
  });
  it("реплей с другим рангом не меняет выбор игрока", () => {
    useArcade.getState().setRank(1);
    useArcade.getState().startReplay({ seed: "old", rank: 0, hero: "juggernaut", act: "short", log: [], gear: [], legacy: undefined, trait: null, configVersion: "x" } as never);
    expect(useArcade.getState().rank).toBe(1);
    expect(useArcade.getState().hero).toBe("juggernaut");
  });
});
