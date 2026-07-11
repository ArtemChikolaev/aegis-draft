import { useState } from "react";
import { useRun } from "../state/runStore.ts";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { roleMessageKey } from "../i18n/core.ts";
import { Pentagon } from "./Pentagon.tsx";
import { useHeroName } from "./heroes.ts";
import type { Candidate } from "../game/packs.ts";

const fmt = (value: number) => (value >= 0 ? `+${value.toFixed(1)}` : value.toFixed(1));

export function DraftScreen() {
  const snapshot = useRun((state) => state.snapshot);
  const pick = useRun((state) => state.pick);
  const reroll = useRun((state) => state.reroll);
  const canPick = useRun((state) => state.canPick);
  const reset = useRun((state) => state.reset);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const heroName = useHeroName();
  const { t } = useI18n();
  if (!snapshot) return null;

  const { currentPack, roster, rerollsLeft, score, heroPool, currentSlotIndex } = snapshot;
  const rerollCount = rerollsLeft === Infinity ? "∞" : String(rerollsLeft);

  return (
    <main className="draft">
      <header className="screen-heading draft__heading">
        <div><p className="eyebrow">{t("draft.eyebrow")}</p><h1>{t("draft.progress", { current: currentSlotIndex + 1, total: roster.length })}</h1></div>
        <button className="leave-button" onClick={() => setConfirmLeave(true)}>{t("draft.leave")}</button>
      </header>
      <section className="surface draft__radar">
        <Pentagon roster={roster} teamOvr={score?.teamOvr ?? null} />
        <div className="score-strip">
          <Stat label={t("common.base")} value={score ? Math.round(score.base).toString() : "0"} kind="base" />
          <Stat label={t("common.heroSynergy")} value={score ? fmt(score.heroSynergy) : "+0.0"} kind="synergy" />
          <Stat label={t("common.chemistry")} value={score ? fmt(score.chemistry) : "+0.0"} kind="chemistry" />
        </div>
      </section>
      <section className="surface pack-panel">
        <div className="pack-heading">
          <div><p className="eyebrow">{currentPack.kind === "mixed" ? t("draft.freeAgents") : currentPack.label}</p><h2>{currentPack.kind === "mixed" ? t("draft.mixedSubtitle") : currentPack.sublabel}</h2></div>
          <button className="secondary-button" onClick={reroll} disabled={rerollsLeft <= 0}>↻ {t("draft.reroll")}<small>{t("draft.rerollsLeft", { count: rerollCount })}</small></button>
        </div>
        <div className="candidates">
          {currentPack.candidates.map((candidate, index) => <CandidateCard key={candidate.player.accountId} candidate={candidate} enabled={canPick(index)} onPick={() => pick(index)} index={index} />)}
        </div>
        <div className="hero-pool">
          <div><h3>{t("draft.heroPool")} <span>{heroPool.length}</span></h3><p>{t("draft.heroPoolHint")}</p></div>
          <div className="hero-pool__chips">{heroPool.length === 0 ? <span className="muted">{t("common.empty")}</span> : heroPool.map((hero) => <span key={hero} className="chip">{heroName(hero)}</span>)}</div>
        </div>
      </section>
      {confirmLeave && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setConfirmLeave(false)}>
          <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="leave-title">
            <span className="confirm-modal__mark" aria-hidden="true">A</span>
            <h2 id="leave-title">{t("draft.leaveTitle")}</h2>
            <p>{t("draft.leaveText")}</p>
            <div className="confirm-modal__actions">
              <button className="secondary-button" autoFocus onClick={() => setConfirmLeave(false)}>{t("draft.leaveCancel")}</button>
              <button className="danger-button" data-testid="confirm-leave" onClick={reset}>{t("draft.leaveConfirm")}</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function CandidateCard({ candidate, enabled, onPick, index }: { candidate: Candidate; enabled: boolean; onPick: () => void; index: number }) {
  const { t } = useI18n();
  const player = candidate.player;
  return (
    <button className="candidate" onClick={onPick} disabled={!enabled} data-testid={`candidate-${index}`}>
      <span className={`role-tag role-tag--${player.role}`}>{t(roleMessageKey(player.role))}</span>
      <span className="candidate__identity"><strong>{player.nickname}</strong><small>{candidate.teamName}</small></span>
      <span className="candidate__stats"><span><b>{player.impact}</b> IMP</span><span><b>{player.economy}</b> ECO</span><span><b>{player.reliability}</b> REL</span></span>
      <span className="candidate__ovr">{player.ovr}<small>OVR</small></span>
      <span className="candidate__action">{t("draft.pick")} →</span>
    </button>
  );
}

function Stat({ label, value, kind }: { label: string; value: string; kind: string }) {
  return <div className={`stat stat--${kind}`}><strong>{value}</strong><span>{label}</span></div>;
}
