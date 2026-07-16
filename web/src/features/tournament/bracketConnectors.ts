/** Winner-edges плей-офф: откуда победитель идёт в следующую серию (slot 0 = верх, 1 = низ). */
export interface BracketEdge {
  from: string;
  to: string;
  /** 0 = teamA row, 1 = teamB row в целевом матче. */
  slot: 0 | 1;
}

const seriesId = (roundId: string, index: number) => `${roundId}-${index + 1}`;

/** Верхняя сетка + Grand Final (в той же grid). */
export const UPPER_BRACKET_EDGES: BracketEdge[] = [
  { from: seriesId("ub-qf", 0), to: seriesId("ub-sf", 0), slot: 0 },
  { from: seriesId("ub-qf", 1), to: seriesId("ub-sf", 0), slot: 1 },
  { from: seriesId("ub-qf", 2), to: seriesId("ub-sf", 1), slot: 0 },
  { from: seriesId("ub-qf", 3), to: seriesId("ub-sf", 1), slot: 1 },
  { from: seriesId("ub-sf", 0), to: seriesId("ub-final", 0), slot: 0 },
  { from: seriesId("ub-sf", 1), to: seriesId("ub-final", 0), slot: 1 },
  { from: seriesId("ub-final", 0), to: "grand-final", slot: 0 },
];

/** Нижняя сетка (только winner-edges внутри LB). */
export const LOWER_BRACKET_EDGES: BracketEdge[] = [
  ...[0, 1, 2, 3].map((i) => ({ from: seriesId("lb-r1", i), to: seriesId("lb-r2", i), slot: 0 as const })),
  { from: seriesId("lb-r2", 0), to: seriesId("lb-r3", 0), slot: 0 },
  { from: seriesId("lb-r2", 1), to: seriesId("lb-r3", 0), slot: 1 },
  { from: seriesId("lb-r2", 2), to: seriesId("lb-r3", 1), slot: 0 },
  { from: seriesId("lb-r2", 3), to: seriesId("lb-r3", 1), slot: 1 },
  { from: seriesId("lb-r3", 0), to: seriesId("lb-r4", 0), slot: 0 },
  { from: seriesId("lb-r3", 1), to: seriesId("lb-r4", 1), slot: 0 },
  { from: seriesId("lb-r4", 0), to: seriesId("lb-r5", 0), slot: 0 },
  { from: seriesId("lb-r4", 1), to: seriesId("lb-r5", 0), slot: 1 },
  { from: seriesId("lb-r5", 0), to: seriesId("lb-final", 0), slot: 0 },
];

/** Manhattan path: mid-right → mid-left через вертикальный стык. */
export function manhattanPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string {
  const midX = (x1 + x2) / 2;
  return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
}

export function pathLengthApprox(x1: number, y1: number, x2: number, y2: number): number {
  const midX = (x1 + x2) / 2;
  return Math.abs(midX - x1) + Math.abs(y2 - y1) + Math.abs(x2 - midX);
}
