import { useState } from "react";
import { useRun } from "../../state/runStore.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { roleMessageKey } from "../../i18n/core.ts";
import { Button, Chip, Eyebrow, Modal, RoleTag, StatTile, Surface } from "../../ui/index.ts";
import { Pentagon } from "./Pentagon.tsx";
import { useHeroName } from "./heroes.ts";
import type { Candidate } from "../../game/packs.ts";
import "./draft.css";

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
        <div><Eyebrow>{t("draft.eyebrow")}</Eyebrow><h1>{t("draft.progress", { current: currentSlotIndex + 1, total: roster.length })}</h1></div>
        <Button variant="leave" onClick={() => setConfirmLeave(true)}>{t("draft.leave")}</Button>
      </header>
      <Surface className="draft__radar">
        <Pentagon roster={roster} teamOvr={score?.teamOvr ?? null} />
        <div className="score-strip">
          <StatTile label={t("common.base")} value={score ? Math.round(score.base).toString() : "0"} kind="base" />
          <StatTile label={t("common.heroSynergy")} value={score ? fmt(score.heroSynergy) : "+0.0"} kind="synergy" />
          <StatTile label={t("common.chemistry")} value={score ? fmt(score.chemistry) : "+0.0"} kind="chemistry" />
        </div>
      </Surface>
      <Surface className="pack-panel">
        <div className="pack-heading">
          <div>
            <Eyebrow className="pack-eyebrow">{currentPack.kind === "mixed" ? t("draft.freeAgents") : currentPack.label}</Eyebrow>
            <h2>{currentPack.kind === "mixed" ? t("draft.mixedSubtitle") : currentPack.sublabel}</h2>
          </div>
          <Button variant="secondary" onClick={reroll} disabled={rerollsLeft <= 0}>↻ {t("draft.reroll")}<small>{t("draft.rerollsLeft", { count: rerollCount })}</small></Button>
        </div>
        <div className="candidates">
          {currentPack.candidates.map((candidate, index) => <CandidateCard key={candidate.player.accountId} candidate={candidate} enabled={canPick(index)} onPick={() => pick(index)} index={index} />)}
        </div>
        <div className="hero-pool">
          <div><h3>{t("draft.heroPool")} <span>{heroPool.length}</span></h3><p>{t("draft.heroPoolHint")}</p></div>
          <div className="hero-pool__chips">{heroPool.length === 0 ? <span className="muted">{t("common.empty")}</span> : heroPool.map((hero) => <Chip key={hero}>{heroName(hero)}</Chip>)}</div>
        </div>
      </Surface>
      {confirmLeave && (
        <Modal mark="A" title={t("draft.leaveTitle")} description={t("draft.leaveText")} labelledBy="leave-title" onClose={() => setConfirmLeave(false)}>
          <Button variant="secondary" autoFocus onClick={() => setConfirmLeave(false)}>{t("draft.leaveCancel")}</Button>
          <Button variant="danger" data-testid="confirm-leave" onClick={reset}>{t("draft.leaveConfirm")}</Button>
        </Modal>
      )}
    </main>
  );
}

function CandidateCard({ candidate, enabled, onPick, index }: { candidate: Candidate; enabled: boolean; onPick: () => void; index: number }) {
  const { t } = useI18n();
  const player = candidate.player;
  return (
    <button className="candidate" onClick={onPick} disabled={!enabled} data-testid={`candidate-${index}`}>
      <RoleTag role={player.role}>{t(roleMessageKey(player.role))}</RoleTag>
      <span className="candidate__identity"><strong>{player.nickname}</strong><small>{candidate.teamName}</small></span>
      <span className="candidate__stats"><span><b>{player.impact}</b> IMP</span><span><b>{player.economy}</b> ECO</span><span><b>{player.reliability}</b> REL</span></span>
      <span className="candidate__ovr">{player.ovr}<small>OVR</small></span>
      <span className="candidate__action">{t("draft.pick")} →</span>
    </button>
  );
}
