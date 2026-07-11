import type { RosterSlot } from "../../game/engine.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { roleMessageKey } from "../../i18n/core.ts";
import "./pentagon.css";

/** Радар-пентагон: 5 слотов ростера по вершинам + Team OVR в центре. */
export function Pentagon({ roster, teamOvr }: { roster: RosterSlot[]; teamOvr: number | null }) {
  const { t } = useI18n();
  const size = 420;
  const c = size / 2;
  const r = 150;
  const pts = roster.map((_, i) => {
    const angle = (-90 + (360 / roster.length) * i) * (Math.PI / 180);
    return { x: c + r * Math.cos(angle), y: c + r * Math.sin(angle) };
  });
  const polygon = pts.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="pentagon" role="img" aria-label={t("pentagon.label")}>
      <polygon points={polygon} className="pentagon__web" />
      {pts.map((p, i) => (
        <line key={i} x1={c} y1={c} x2={p.x} y2={p.y} className="pentagon__spoke" />
      ))}

      <text x={c} y={c - 12} className="pentagon__ovr">{teamOvr != null ? Math.round(teamOvr) : "—"}</text>
      <text x={c} y={c + 16} className="pentagon__ovrlabel">{t("common.teamOvr")}</text>

      {roster.map((slot, i) => {
        const p = pts[i];
        const outward = 1.16;
        const lx = c + (p.x - c) * outward;
        const ly = c + (p.y - c) * outward;
        return (
          <g key={i} className={`node ${slot.candidate ? "node--filled" : ""}`}>
            <circle cx={p.x} cy={p.y} r={6} className="pentagon__dot" />
            <text x={lx} y={ly - 6} className="node__role">{t(roleMessageKey(slot.role))}</text>
            <text x={lx} y={ly + 10} className="node__name">
              {slot.candidate ? slot.candidate.player.nickname : "—"}
            </text>
            {slot.candidate && (
              <text x={lx} y={ly + 26} className="node__ovr">{slot.candidate.player.ovr}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
