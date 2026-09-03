import { describe, expect, it } from "vitest";
import { isSavedManagerCompatible, type SavedManager } from "../src/state/managerStore.ts";
import { MANAGER_ECONOMY_VERSION } from "../src/game/manager/economy.ts";
import { sameDataset } from "../src/state/dataVersions.ts";
import type { GameData } from "../src/types/data.ts";

const manifest = {
  schemaVersion: 1,
  ratingModelVersion: "v1.13.0",
  dataHash: "sha256:abc",
  builtAt: "2026-09-01T00:00:00Z",
} as GameData["manifest"];
const data = { manifest } as GameData;

const saved = (over: Partial<SavedManager> = {}): SavedManager => ({
  schemaVersion: 1,
  ratingModelVersion: "v1.13.0",
  dataHash: "sha256:abc",
  economyVersion: MANAGER_ECONOMY_VERSION,
  state: { v: 1 } as SavedManager["state"],
  ...over,
});

describe("managerStore: совместимость long-save", () => {
  it("совпадение schema/rating/dataHash/economyVersion — совместим", () => {
    expect(isSavedManagerCompatible(saved(), data)).toBe(true);
  });
  it("любая ось врозь — несовместим", () => {
    expect(isSavedManagerCompatible(saved({ dataHash: "sha256:other" }), data)).toBe(false);
    expect(isSavedManagerCompatible(saved({ ratingModelVersion: "v0" }), data)).toBe(false);
    expect(isSavedManagerCompatible(saved({ schemaVersion: 2 }), data)).toBe(false);
    expect(isSavedManagerCompatible(saved({ economyVersion: "m0.0.0" }), data)).toBe(false);
  });
  it("сейв без dataHash (и без builtAt-фолбэка) — несовместим, как и раньше", () => {
    expect(isSavedManagerCompatible(saved({ dataHash: undefined }), data)).toBe(false);
  });
});

describe("dataVersions.sameDataset", () => {
  it("dataHash главнее builtAt: builtAt-only refresh сейв не ломает", () => {
    expect(sameDataset({ schemaVersion: 1, ratingModelVersion: "v1.13.0", dataHash: "sha256:abc", dataBuiltAt: "2020-01-01T00:00:00Z" }, manifest)).toBe(true);
  });
  it("legacy без dataHash сверяется по builtAt", () => {
    const legacy = { schemaVersion: 1, ratingModelVersion: "v1.13.0", dataBuiltAt: manifest.builtAt };
    expect(sameDataset(legacy, manifest)).toBe(true);
    expect(sameDataset({ ...legacy, dataBuiltAt: "2020-01-01T00:00:00Z" }, manifest)).toBe(false);
    expect(sameDataset({ schemaVersion: 1, ratingModelVersion: "v1.13.0" }, manifest)).toBe(false);
  });
});
