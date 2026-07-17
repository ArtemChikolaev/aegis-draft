import type { ChemistryEdge } from "../../game/score.ts";
import type { RosterSlot } from "../../game/engine.ts";
import type { Candidate } from "../../game/packs.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { roleMessageKey } from "../../i18n/core.ts";
import { HeroThumb, useCountUp } from "../../ui/index.ts";
import { useHero } from "./heroes.ts";
import "./pentagon.css";

const fmtEdge = (value: number) => (value >= 0 ? `+${value.toFixed(1)}` : value.toFixed(1));

const SIZE = 420;
const C = SIZE / 2;
const WEB_R = 118;
/** Карточка игрока смещена наружу от вершины сетки — как в 322-0. */
const CARD_OFFSET = 38;
const RING_STROKE_THIN = 1.4;
const RING_STROKE_CHEM = 5.5;
const CHORD_STROKE = 2.2;
const EDGE_MIN = 0.05;

function vertexLayouts(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const angle = (-90 + (360 / count) * i) * (Math.PI / 180);
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const vx = C + WEB_R * ux;
    const vy = C + WEB_R * uy;
    return {
      vertex: { x: vx, y: vy },
      card: { x: vx + CARD_OFFSET * ux, y: vy + CARD_OFFSET * uy },
    };
  });
}

function pct(n: number) {
  return `${(n / SIZE) * 100}%`;
}

function pairKey(a: number, b: number) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function isAdjacent(ia: number, ib: number, n: number) {
  const d = Math.abs(ia - ib);
  return d === 1 || d === n - 1;
}

function ringTone(bonus: number | undefined): "thin" | "chem" {
  if (bonus == null || bonus < EDGE_MIN) return "thin";
  return "chem";
}

/** Радар-пентагон: SVG-сетка + HTML-карточки на вершинах + связи Chemistry. */
export function Pentagon({ roster, teamOvr, chemistryEdges = [], assignmentByPlayer = {}, onSelectPlayer, swapMode = false, swapSelectedId = null, onSwapTap }: {
  roster: RosterSlot[];
  teamOvr: number | null;
  chemistryEdges?: ChemistryEdge[];
  assignmentByPlayer?: Record<number, number>;
  onSelectPlayer?: (candidate: Candidate) => void;
  /** После завершения драфта: tap two players to swap heroes (322-0). */
  swapMode?: boolean;
  swapSelectedId?: number | null;
  onSwapTap?: (accountId: number) => void;
}) {
  const { t } = useI18n();
  const hero = useHero();
  // Team OVR — главный фидбек драфта: набегает, а не прыгает. У 322-0 тут скачок, это
  // улучшение сверх референса. Хук сам гасится при prefers-reduced-motion.
  const shownOvr = useCountUp(teamOvr);
  const filled = roster.filter((slot) => slot.candidate).length;
  const layouts = vertexLayouts(roster.length);
  const polygon = layouts.map((l) => l.vertex).map((p) => `${p.x},${p.y}`).join(" ");

  const slotByAccount = new Map<number, number>();
  roster.forEach((slot, i) => {
    if (slot.candidate) slotByAccount.set(slot.candidate.player.accountId, i);
  });

  const bonusByPair = new Map(chemistryEdges.map((edge) => [pairKey(edge.a, edge.b), edge.bonus]));

  const chordEdges = chemistryEdges.filter((edge) => {
    const ia = slotByAccount.get(edge.a);
    const ib = slotByAccount.get(edge.b);
    return ia != null && ib != null && !isAdjacent(ia, ib, roster.length);
  });

  return (
    <div className="pentagon-wrap">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="pentagon" role="img" aria-label={t("pentagon.label")}>
        <polygon points={polygon} className="pentagon__web" />
        {layouts.map((l, i) => (
          <line key={i} x1={C} y1={C} x2={l.vertex.x} y2={l.vertex.y} className="pentagon__spoke" strokeWidth={1} />
        ))}

        {chordEdges.map((edge) => {
          const ia = slotByAccount.get(edge.a)!;
          const ib = slotByAccount.get(edge.b)!;
          const a = layouts[ia].vertex;
          const b = layouts[ib].vertex;
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const tone = "pos";
          return (
            <g key={`${edge.a}:${edge.b}`} className={`pentagon__edge pentagon__edge--${tone}`}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="pentagon__edge-line" strokeWidth={CHORD_STROKE} />
              <text x={mx} y={my - 4} className="pentagon__edge-label">{fmtEdge(edge.bonus)}</text>
            </g>
          );
        })}

        {layouts.map((l, i) => {
          const next = layouts[(i + 1) % layouts.length];
          const idA = roster[i].candidate?.player.accountId;
          const idB = roster[(i + 1) % roster.length].candidate?.player.accountId;
          const bonus = idA != null && idB != null ? bonusByPair.get(pairKey(idA, idB)) : undefined;
          const tone = ringTone(bonus);
          const mx = (l.vertex.x + next.vertex.x) / 2;
          const my = (l.vertex.y + next.vertex.y) / 2;
          return (
            <g key={`ring-${i}`} className={`pentagon__ring pentagon__ring--${tone}`}>
              <line
                x1={l.vertex.x}
                y1={l.vertex.y}
                x2={next.vertex.x}
                y2={next.vertex.y}
                strokeWidth={tone === "chem" ? RING_STROKE_CHEM : RING_STROKE_THIN}
              />
              {bonus != null && Math.abs(bonus) >= EDGE_MIN && (
                <text x={mx} y={my - 5} className="pentagon__edge-label">{fmtEdge(bonus)}</text>
              )}
            </g>
          );
        })}

        {filled > 0 && teamOvr != null && (
          <>
            <text x={C} y={C - 12} className="pentagon__ovr">{Math.round(shownOvr ?? teamOvr)}</text>
            <text x={C} y={C + 16} className="pentagon__ovrlabel">{t("common.teamOvr")}</text>
          </>
        )}
      </svg>

      <div className="pentagon__nodes">
        {roster.map((slot, i) => {
          const card = layouts[i].card;
          const accountId = slot.candidate?.player.accountId;
          const heroId = accountId != null ? assignmentByPlayer[accountId] : undefined;
          const heroInfo = heroId != null ? hero(heroId) : null;
          const canSwap = !!(swapMode && slot.candidate && onSwapTap);
          const canInspect = !!(slot.candidate && onSelectPlayer && !swapMode);
          const interactive = canSwap || canInspect;
          const selected = swapSelectedId != null && accountId === swapSelectedId;
          const Tag = interactive ? "button" : "div";
          return (
            <Tag
              key={i}
              type={interactive ? "button" : undefined}
              className={[
                "pentagon-node",
                slot.candidate ? "pentagon-node--filled" : "pentagon-node--empty",
                interactive ? "pentagon-node--interactive" : "",
                selected ? "pentagon-node--selected" : "",
              ].filter(Boolean).join(" ")}
              style={{ left: pct(card.x), top: pct(card.y) }}
              aria-label={slot.candidate?.player.nickname}
              aria-pressed={selected || undefined}
              onClick={() => {
                if (!slot.candidate) return;
                if (canSwap) onSwapTap?.(slot.candidate.player.accountId);
                else if (canInspect) onSelectPlayer?.(slot.candidate);
              }}
            >
              <span className="pentagon-node__role" data-role={slot.role}>
                {t(roleMessageKey(slot.role))}
              </span>
              {slot.candidate && (
                <>
                  {heroInfo && (
                    <span className="pentagon-node__hero">
                      <HeroThumb picture={heroInfo.picture} name={heroInfo.name} showName={false} />
                    </span>
                  )}
                  <span className="pentagon-node__name" title={slot.candidate.player.nickname}>
                    {slot.candidate.player.nickname}
                  </span>
                  <span className="pentagon-node__ovr">{slot.candidate.player.ovr}</span>
                </>
              )}
            </Tag>
          );
        })}
      </div>
    </div>
  );
}
