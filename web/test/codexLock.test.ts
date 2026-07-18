import { describe, expect, it } from "vitest";
import { isCodexLocked } from "../src/state/runStore.ts";
import type { SavedRun } from "../src/state/runPersist.ts";
import type { RunConfig } from "../src/game/packs.ts";

const config = (hardMode?: boolean): RunConfig => ({
  draftStyle: "team",
  format: "last_2y",
  rerolls: 1,
  scoring: "event",
  allocation: "auto",
  hardMode,
});

const saved = (hardMode: boolean): SavedRun => ({
  v: 1,
  schemaVersion: 1,
  ratingModelVersion: "v1",
  dataBuiltAt: "2026-07-18T00:00:00Z",
  mode: "classic",
  config: config(hardMode),
  seed: "seed",
  actions: [],
  tournamentStep: 0,
  tournamentStarted: false,
});

describe("isCodexLocked", () => {
  it("закрывает справочник, пока идёт хардкорный забег", () => {
    expect(isCodexLocked(config(true), "draft")).toBe(true);
    expect(isCodexLocked(config(true), "tournament")).toBe(true);
  });

  it("обычный забег справочник не трогает", () => {
    expect(isCodexLocked(config(false), "draft")).toBe(false);
    expect(isCodexLocked(config(), "tournament")).toBe(false);
  });

  it("незавершённый хардкорный сейв тоже запирает: иначе reload открывал бы лазейку", () => {
    // Перезагрузка страницы возвращает phase=start и config=null, но забег ещё идёт.
    expect(isCodexLocked(null, "start", saved(true))).toBe(true);
    expect(isCodexLocked(null, "start", saved(false))).toBe(false);
  });

  it("вне забега открыт даже после хардкора: подсматривать уже нечего", () => {
    expect(isCodexLocked(config(true), "start")).toBe(false);
    expect(isCodexLocked(config(true), "loading")).toBe(false);
    expect(isCodexLocked(null, "start")).toBe(false);
  });
});
