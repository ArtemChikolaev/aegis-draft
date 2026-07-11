import { useRun } from "../state/runStore.ts";
import { Pentagon } from "./Pentagon.tsx";
import { useHeroName } from "./heroes.ts";

const fmt = (n: number) => (n >= 0 ? `+${n.toFixed(1)}` : n.toFixed(1));

export function ResultScreen() {
  const snap = useRun((s) => s.snapshot);
  const seed = useRun((s) => s.seed);
  const config = useRun((s) => s.config);
  const reset = useRun((s) => s.reset);
  const heroName = useHeroName();
  if (!snap || !snap.score) return null;

  const { roster, score } = snap;

  return (
    <main className="result">
      <h2 className="result__title">Итог забега</h2>
      <div className="result__grid">
        <Pentagon roster={roster} teamOvr={score.teamOvr} />
        <div className="result__panel">
          <div className="result__ovr">{Math.round(score.teamOvr)}<span> TEAM OVR</span></div>
          <ul className="result__breakdown">
            <li><span>Base</span><b>{Math.round(score.base)}</b></li>
            <li><span>Hero Synergy</span><b>{fmt(score.heroSynergy)}</b></li>
            <li><span>Chemistry</span><b>{fmt(score.chemistry)}</b></li>
          </ul>

          <h3 className="result__sub">Состав и герои</h3>
          <ul className="result__roster">
            {roster.map((slot, i) => {
              const hid = slot.candidate ? score.assignment.byPlayer[slot.candidate.player.accountId] : undefined;
              return (
                <li key={i}>
                  <span className="result__role">{slot.role}</span>
                  <span className="result__player">{slot.candidate?.player.nickname ?? "—"}</span>
                  <span className="result__hero">{hid != null ? heroName(hid) : "—"}</span>
                </li>
              );
            })}
          </ul>

          <div className="result__meta muted small">
            {config?.draftStyle} · {config?.format} · seed {seed}
          </div>
          <button className="start__btn" onClick={reset}>Новый забег</button>
        </div>
      </div>
    </main>
  );
}
