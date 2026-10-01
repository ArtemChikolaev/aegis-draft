import { describe, expect, it } from "vitest";
import { ART_MAX_ENTRIES, ART_REVALIDATE_MS, artNeedsRevalidate, artOverflow, dataCacheName, dataFileFromPath, decideDataAction, isArtPath, staleDataCaches } from "../src/sw/policy.ts";

const HASH_A = "sha256:aaaa";
const HASH_B = "sha256:bbbb";

describe("decideDataAction", () => {
  it("активная версия совпадает с сетевой — ничего не делаем", () => {
    expect(decideDataAction({ activeHash: HASH_A, remoteHash: HASH_A, bucketComplete: true, allowSwap: true })).toBe("none");
  });

  it("офлайн-копии ещё нет — качаем даже посреди забега (защищать пока нечего)", () => {
    expect(decideDataAction({ activeHash: null, remoteHash: HASH_A, bucketComplete: false, allowSwap: false })).toBe("download");
  });

  it("незавершённый забег держит старый набор: новый не качаем и не включаем", () => {
    // Смена dataHash обнуляет сейв (BUG-2026-07-23) — обновление ждёт конца забега.
    expect(decideDataAction({ activeHash: HASH_A, remoteHash: HASH_B, bucketComplete: false, allowSwap: false })).toBe("none");
    expect(decideDataAction({ activeHash: HASH_A, remoteHash: HASH_B, bucketComplete: true, allowSwap: false })).toBe("none");
  });

  it("забега нет: полное ведро — переключаем, неполное — докачиваем", () => {
    expect(decideDataAction({ activeHash: HASH_A, remoteHash: HASH_B, bucketComplete: true, allowSwap: true })).toBe("swap");
    expect(decideDataAction({ activeHash: HASH_A, remoteHash: HASH_B, bucketComplete: false, allowSwap: true })).toBe("download");
  });

  it("первая копия при полном ведре — сразу своп, без повторной закачки", () => {
    expect(decideDataAction({ activeHash: null, remoteHash: HASH_A, bucketComplete: true, allowSwap: true })).toBe("swap");
  });
});

describe("dataCacheName", () => {
  it("версия датасета попадает в имя ведра, двоеточие из sha256: не проходит", () => {
    expect(dataCacheName(HASH_A)).toBe("aegis-data-sha256-aaaa");
  });

  it("разные версии — разные ведра (наборы не смешиваются)", () => {
    expect(dataCacheName(HASH_A)).not.toBe(dataCacheName(HASH_B));
  });
});

describe("dataFileFromPath", () => {
  it("узнаёт файлы датасета в корне и под сабпутём Pages", () => {
    expect(dataFileFromPath("/data/packs.json", "/")).toBe("packs");
    expect(dataFileFromPath("/aegis-draft/data/manifest.json", "/aegis-draft/")).toBe("manifest");
  });

  it("чужие пути и не-json мимо: перехватывать оболочку датасетным правилом нельзя", () => {
    expect(dataFileFromPath("/assets/index-abc.js", "/")).toBeNull();
    expect(dataFileFromPath("/data/nested/packs.json", "/")).toBeNull();
    expect(dataFileFromPath("/data/packs.txt", "/")).toBeNull();
    expect(dataFileFromPath("/data/packs.json", "/aegis-draft/")).toBeNull();
  });
});

describe("staleDataCaches", () => {
  it("под снос идут только наши ведра, кроме активного", () => {
    const names = ["aegis-shell", "aegis-meta", dataCacheName(HASH_A), dataCacheName(HASH_B), "other-app"];
    expect(staleDataCaches(names, HASH_B)).toEqual([dataCacheName(HASH_A)]);
  });

  it("активного набора нет — чистим все ведра данных", () => {
    expect(staleDataCaches([dataCacheName(HASH_A), "aegis-shell"], null)).toEqual([dataCacheName(HASH_A)]);
  });
});

describe("арт Аркады — своё ведро (M23)", () => {
  it("арт узнаётся по пути под базой приложения; датасет и бандл — нет", () => {
    expect(isArtPath("/aegis-draft/art/sprites/dota_px2/axe.webp", "/aegis-draft/")).toBe(true);
    expect(isArtPath("/art/sfx/dota/pack/index.json", "/")).toBe(true);
    expect(isArtPath("/aegis-draft/data/players.json", "/aegis-draft/")).toBe(false);
    expect(isArtPath("/aegis-draft/assets/index-abc.js", "/aegis-draft/")).toBe(false);
  });

  it("перепроверка — без метки или раз в окно, не на каждый показ", () => {
    const now = 10 * ART_REVALIDATE_MS;
    expect(artNeedsRevalidate(null, now)).toBe(true);
    expect(artNeedsRevalidate("мусор", now)).toBe(true);
    expect(artNeedsRevalidate(String(now - 1000), now)).toBe(false);
    expect(artNeedsRevalidate(String(now - ART_REVALIDATE_MS - 1), now)).toBe(true);
  });

  it("ведро не растёт сверх потолка", () => {
    expect(artOverflow(ART_MAX_ENTRIES)).toBe(0);
    expect(artOverflow(ART_MAX_ENTRIES + 3)).toBe(3);
  });
});
