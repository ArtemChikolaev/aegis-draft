import { describe, expect, it } from "vitest";
import { LOWER_BRACKET_EDGES, UPPER_BRACKET_EDGES, manhattanPath, pathLengthApprox } from "../src/features/tournament/bracketConnectors.ts";

describe("bracketConnectors", () => {
  it("верхняя сетка ведёт в Grand Final", () => {
    expect(UPPER_BRACKET_EDGES.some((e) => e.to === "grand-final")).toBe(true);
    expect(UPPER_BRACKET_EDGES).toHaveLength(7);
  });

  it("нижняя сетка: R1→R2 без пересечений slot", () => {
    const r1 = LOWER_BRACKET_EDGES.filter((e) => e.from.startsWith("lb-r1"));
    expect(r1).toHaveLength(4);
    expect(new Set(r1.map((e) => e.to)).size).toBe(4);
  });

  it("manhattan path — три сегмента", () => {
    expect(manhattanPath(0, 10, 100, 40)).toBe("M 0 10 L 50 10 L 50 40 L 100 40");
    expect(pathLengthApprox(0, 10, 100, 40)).toBe(50 + 30 + 50);
  });
});
