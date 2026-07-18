import { describe, expect, it } from "vitest";
import { isCodexLocked } from "../src/state/runStore.ts";
import type { RunConfig } from "../src/game/packs.ts";

const config = (hardMode?: boolean): RunConfig => ({
  draftStyle: "team",
  format: "last_2y",
  rerolls: 1,
  scoring: "event",
  allocation: "auto",
  hardMode,
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

  it("вне забега открыт даже после хардкора: подсматривать уже нечего", () => {
    expect(isCodexLocked(config(true), "start")).toBe(false);
    expect(isCodexLocked(config(true), "loading")).toBe(false);
    expect(isCodexLocked(null, "start")).toBe(false);
  });
});
