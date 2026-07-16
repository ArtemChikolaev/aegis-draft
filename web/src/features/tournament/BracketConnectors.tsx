import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";
import {
  manhattanPath,
  pathLengthApprox,
  type BracketEdge,
} from "./bracketConnectors.ts";

interface ConnectorPath {
  key: string;
  d: string;
  length: number;
  active: boolean;
  accent: boolean;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** SVG-линии сетки (как Liquipedia/TI): появляются после победы в серии-источнике. */
export function BracketConnectors({
  gridRef,
  edges,
  finishedIds,
  accentFromIds,
}: {
  gridRef: RefObject<HTMLDivElement | null>;
  edges: BracketEdge[];
  finishedIds: Set<string>;
  /** Подсветка линий от матчей со своей командой. */
  accentFromIds?: Set<string>;
}) {
  const [paths, setPaths] = useState<ConnectorPath[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const measure = () => {
      const root = grid.getBoundingClientRect();
      const next: ConnectorPath[] = [];
      for (const edge of edges) {
        const fromEl = grid.querySelector<HTMLElement>(`[data-series-id="${edge.from}"]`);
        const toEl = grid.querySelector<HTMLElement>(`[data-series-id="${edge.to}"]`);
        if (!fromEl || !toEl) continue;
        const from = fromEl.getBoundingClientRect();
        const to = toEl.getBoundingClientRect();
        const x1 = from.right - root.left;
        const y1 = from.top - root.top + from.height / 2;
        // Цель — середина строки teamA/teamB в следующем матче.
        const rowH = to.height / 2;
        const y2 = to.top - root.top + rowH * (edge.slot + 0.5);
        const x2 = to.left - root.left;
        const active = finishedIds.has(edge.from);
        next.push({
          key: `${edge.from}->${edge.to}`,
          d: manhattanPath(x1, y1, x2, y2),
          length: pathLengthApprox(x1, y1, x2, y2),
          active,
          accent: accentFromIds?.has(edge.from) ?? false,
        });
      }
      setPaths(next);
      setSize({ w: grid.clientWidth, h: grid.clientHeight });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(grid);
    window.addEventListener("scroll", measure, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", measure, true);
    };
  }, [accentFromIds, edges, finishedIds, gridRef]);

  if (size.w <= 0 || size.h <= 0) return null;
  const instant = prefersReducedMotion();

  return (
    <svg className="bracket-connectors" width={size.w} height={size.h} aria-hidden>
      {paths.map((path) => (
        <path
          key={path.key}
          className={`bracket-connector ${path.active ? "is-active" : ""} ${path.accent ? "is-accent" : ""} ${instant ? "is-instant" : ""}`.trim()}
          d={path.d}
          style={{ ["--connector-len"]: path.length } as CSSProperties}
        />
      ))}
    </svg>
  );
}
