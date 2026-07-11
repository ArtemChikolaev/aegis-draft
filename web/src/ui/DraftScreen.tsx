import { useRun } from "../state/runStore.ts";
import { Pentagon } from "./Pentagon.tsx";
import { useHeroName } from "./heroes.ts";
import type { Candidate } from "../game/packs.ts";

const ROLE_BADGE: Record<string, string> = { safelane: "CARRY", mid: "MID", offlane: "OFF", support: "SUP" };
const fmt = (n: number) => (n >= 0 ? `+${n.toFixed(1)}` : n.toFixed(1));

export function DraftScreen() {
  const snap = useRun((s) => s.snapshot);
  const pick = useRun((s) => s.pick);
  const reroll = useRun((s) => s.reroll);
  const canPick = useRun((s) => s.canPick);
  const heroName = useHeroName();
  if (!snap) return null;

  const { currentPack, roster, rerollsLeft, score, heroPool } = snap;
  const rerollLabel = rerollsLeft === Infinity ? "∞" : String(rerollsLeft);

  return (
    <main className="draft">
      <section className="draft__left">
        <Pentagon roster={roster} teamOvr={score?.teamOvr ?? null} />
        <div className="score">
          <Stat label="BASE" value={score ? Math.round(score.base).toString() : "0"} kind="base" />
          <Stat label="HERO SYNERGY" value={score ? fmt(score.heroSynergy) : "+0.0"} kind="syn" />
          <Stat label="CHEMISTRY" value={score ? fmt(score.chemistry) : "+0.0"} kind="chem" />
        </div>
      </section>

      <section className="draft__right">
        <div className="pack__head">
          <div>
            <div className="pack__label">{currentPack.label}</div>
            {currentPack.sublabel && <div className="pack__sub">{currentPack.sublabel}</div>}
          </div>
          <button className="reroll" onClick={reroll} disabled={rerollsLeft <= 0}>
            ↻ Reroll ({rerollLabel})
          </button>
        </div>

        <div className="candidates">
          {currentPack.candidates.map((cand, i) => (
            <CandidateCard key={cand.player.accountId} cand={cand} enabled={canPick(i)} onPick={() => pick(i)} />
          ))}
        </div>

        <div className="pool">
          <h3 className="pool__title">HERO POOL ({heroPool.length})</h3>
          <div className="pool__chips">
            {heroPool.length === 0 && <span className="muted small">— пусто —</span>}
            {heroPool.map((h) => (
              <span key={h} className="chip">{heroName(h)}</span>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function CandidateCard({ cand, enabled, onPick }: { cand: Candidate; enabled: boolean; onPick: () => void }) {
  const p = cand.player;
  return (
    <button className={`card ${enabled ? "" : "card--off"}`} onClick={onPick} disabled={!enabled}>
      <span className={`role role--${p.role}`}>{ROLE_BADGE[p.role]}</span>
      <span className="card__name">{p.nickname}</span>
      <span className="card__team">{cand.teamName}</span>
      <span className="card__stats">
        <b>{p.impact}</b> IMP · <b>{p.economy}</b> ECO · <b>{p.reliability}</b> REL
      </span>
      <span className="card__ovr">{p.ovr}</span>
    </button>
  );
}

function Stat({ label, value, kind }: { label: string; value: string; kind: string }) {
  return (
    <div className={`stat stat--${kind}`}>
      <div className="stat__value">{value}</div>
      <div className="stat__label">{label}</div>
    </div>
  );
}
