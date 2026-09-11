import { describe, expect, it } from "vitest";
import { ARCADE } from "../src/game/arcade/config.ts";
import { CHUNK, chunkKey, inRiverBand } from "../src/features/arcade/terrain.ts";

// Прилив в терре (T13.61, хвост): полоса воды по текущей полуширине; ключ чанка зависит от неё только у русла.
describe("терра и прилив", () => {
  it("полоса русла по полуширине; в прилив тайл за базовым руслом становится водой", () => {
    const R = ARCADE.river, wide = R.halfWidth * ARCADE.tide.halfWidthMult;
    expect(inRiverBand(R.y, R.halfWidth)).toBe(true);
    expect(inRiverBand(R.y + R.halfWidth + 20, R.halfWidth)).toBe(false);
    expect(inRiverBand(R.y + R.halfWidth + 20, wide)).toBe(true);
    expect(inRiverBand(R.y - wide - 1, wide)).toBe(false);
  });

  it("ключ чанка: у русла в River несёт полуширину, вдали и вне River — нет (кэш не сбрасывается зря)", () => {
    const R = ARCADE.river, wide = R.halfWidth * ARCADE.tide.halfWidthMult;
    const riverCy = Math.floor(R.y / CHUNK), farCy = Math.floor((R.y - wide - CHUNK * 2) / CHUNK);
    expect(chunkKey(1, riverCy, "river", R.halfWidth)).toBe(`1:${riverCy}:w${R.halfWidth}`);
    expect(chunkKey(1, riverCy, "river", wide)).not.toBe(chunkKey(1, riverCy, "river", R.halfWidth));
    expect(chunkKey(1, farCy, "river", wide)).toBe(`1:${farCy}`);
    expect(chunkKey(1, riverCy, "full", wide)).toBe(`1:${riverCy}`);
    // Чанк, который задевает только приливную полосу (не базовую), тоже зависит от полуширины.
    const edgeCy = Math.floor((R.y + R.halfWidth + 10) / CHUNK);
    if (edgeCy !== riverCy) expect(chunkKey(0, edgeCy, "river", wide)).toBe(`0:${edgeCy}:w${Math.round(wide)}`);
  });
});
