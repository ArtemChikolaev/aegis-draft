import type { CSSProperties } from "react";
import { useState } from "react";
import { useRun } from "../../state/runStore.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { heroGamesMessageKey, roleMessageKey } from "../../i18n/core.ts";
import { Button, Dealt, Eyebrow, HeroThumb, Modal, playerOvrTier, RoleTag, StatTile, Surface, TeamName } from "../../ui/index.ts";
import { Pentagon } from "./Pentagon.tsx";
import { PlayerInspector } from "./PlayerInspector.tsx";
import { SynergyBreakdown } from "./SynergyBreakdown.tsx";
import { ScoringLegend } from "./ScoringLegend.tsx";
import {
  chemistryPairEdges,
  chemistryPlayersFromRoster,
  heroStatsForAssignment,
  heroStatsForDisplay,
  heroSynergyRows,
  heroSynergyTier,
  squadChemistryRows,
} from "../../game/score.ts";
import { useHero } from "./heroes.ts";
import type { Candidate } from "../../game/packs.ts";
import "./draft.css";

const fmt = (value: number) => (value >= 0 ? `+${value.toFixed(1)}` : value.toFixed(1));

export function DraftScreen() {
  const snapshot = useRun((state) => state.snapshot);
  const pickPlayer = useRun((state) => state.pickPlayer);
  const pickHero = useRun((state) => state.pickHero);
  const reroll = useRun((state) => state.reroll);
  const canPickPlayer = useRun((state) => state.canPickPlayer);
  const canPickHero = useRun((state) => state.canPickHero);
  const reset = useRun((state) => state.reset);
  const restartSameConfig = useRun((state) => state.restartSameConfig);
  const config = useRun((state) => state.config);
  const data = useRun((state) => state.data);
  const teamName = useRun((state) => state.teamName);
  const setTeamName = useRun((state) => state.setTeamName);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [inspectedPlayer, setInspectedPlayer] = useState<Candidate | null>(null);
  const hero = useHero();
  const { locale, t } = useI18n();
  if (!snapshot || !config) return null;

  const { currentPack, roster, rerollsLeft, score, heroes, packHeroes, rosterFilled, packSerial } = snapshot;
  const rerollCount = rerollsLeft === Infinity ? "∞" : String(rerollsLeft);
  const picked = rosterFilled + heroes.length;
  const chemistryEdges = data
    ? chemistryPairEdges(
      chemistryPlayersFromRoster(roster),
      data.squadSynergy,
      data.teammates,
    )
    : [];
  const phs = data ? heroStatsForAssignment(data) : null;
  const displayPhs = data ? heroStatsForDisplay(data) : null;
  const heroRows = score && phs ? heroSynergyRows(roster, score.assignment, phs, displayPhs ?? undefined) : [];
  const chemistryRows = data ? squadChemistryRows(roster, data.squadSynergy, data.teammates) : [];
  const synergyTier = score ? heroSynergyTier(score.heroSynergy) : null;
  const synergySublabel = synergyTier === "insane"
    ? t("draft.synergyInsane")
    : synergyTier === "great"
      ? t("draft.synergyGreat")
      : undefined;
  // Заголовок пака показывает название турнира, а не сырой eventId (league-19785).
  const packEventLabel = data?.events.find((e) => e.id === currentPack.sublabel)?.name
    ?? currentPack.sublabel;

  const heroOwner: Record<number, { accountId: number; nickname: string }> = {};
  if (score) {
    for (const slot of roster) {
      if (!slot.candidate) continue;
      const h = score.assignment.byPlayer[slot.candidate.player.accountId];
      if (h != null) heroOwner[h] = {
        accountId: slot.candidate.player.accountId,
        nickname: slot.candidate.player.nickname,
      };
    }
  }

  return (
    <main className="draft" data-testid="draft-screen">
      <header className="screen-heading draft__heading">
        <div><Eyebrow>{t("draft.picked", { current: picked, total: 10 })}</Eyebrow><h1><TeamName value={teamName} placeholder={t("team.placeholder")} editLabel={t("team.edit")} onChange={setTeamName} /></h1></div>
        <div className="draft__heading-actions">
          <Button variant="secondary" className="draft__reset" data-testid="draft-restart" onClick={() => setConfirmRestart(true)}>↻ {t("draft.restart")}</Button>
          <Button variant="leave" onClick={() => setConfirmLeave(true)}>{t("draft.leave")}</Button>
        </div>
      </header>
      <Surface className="draft__radar on-invert-surface enter">
        <span className="draft__radar-glow" aria-hidden="true" />
        <Pentagon
          roster={roster}
          teamOvr={score?.teamOvr ?? null}
          chemistryEdges={chemistryEdges}
          assignmentByPlayer={score?.assignment.byPlayer ?? {}}
          onSelectPlayer={setInspectedPlayer}
        />
        <div className="score-strip">
          <StatTile label={t("common.base")} value={score ? Math.round(score.base).toString() : "0"} kind="base" />
          <StatTile label={t("common.heroSynergy")} value={score ? fmt(score.heroSynergy) : "+0.0"} kind="synergy" sublabel={synergySublabel} />
          <StatTile label={t("common.chemistry")} value={score ? fmt(score.chemistry) : "+0.0"} kind="chemistry" />
        </div>
        {rosterFilled > 0 && (
          <SynergyBreakdown
            heroRows={heroRows}
            chemistryRows={chemistryRows}
            onPlayerClick={(accountId) => {
              const candidate = roster.find((slot) => slot.candidate?.player.accountId === accountId)?.candidate;
              if (candidate) setInspectedPlayer(candidate);
            }}
          />
        )}
      </Surface>
      <Surface className="pack-panel enter" style={{ "--enter-i": 1 } as CSSProperties}>
        <div className="pack-heading">
          <div>
            <Eyebrow className="pack-eyebrow">{currentPack.kind === "mixed" ? t("draft.freeAgents") : currentPack.label}</Eyebrow>
            <h2>{currentPack.kind === "mixed" ? t("draft.mixedSubtitle") : packEventLabel}</h2>
          </div>
          <Button variant="secondary" onClick={reroll} disabled={rerollsLeft <= 0}>↻ {t("draft.reroll")}<small>{t("draft.rerollsLeft", { count: rerollCount })}</small></Button>
        </div>
        <div className="candidates">
          {currentPack.candidates.map((candidate, index) => (
            <Dealt key={`${packSerial}:${candidate.player.accountId}`} index={index}>
              <CandidateCard candidate={candidate} enabled={canPickPlayer(index)} onPick={() => pickPlayer(index)} index={index} />
            </Dealt>
          ))}
        </div>

        <div className="hero-pool hero-pool--pack">
          <div><h3>{t("draft.packHeroes")} <span>{packHeroes.length}</span></h3><p>{t("draft.packHeroesHint")}</p></div>
          <div
            className="hero-pool__chips hero-pool__chips--pack"
            style={{ gridTemplateColumns: `repeat(${Math.max(1, packHeroes.length)}, minmax(0, 1fr))` }}
          >
            {packHeroes.map((id, index) => {
              const h = hero(id);
              return (
                // Нумерация сквозная: герои идут после игроков, пак раздаётся одной волной.
                <Dealt key={`${packSerial}:${id}`} index={currentPack.candidates.length + index}>
                  <button type="button" className="hero-pick hero-pick--card" disabled={!canPickHero(id)} onClick={() => pickHero(id)} data-testid={`pack-hero-${id}`}>
                    <HeroThumb picture={h.picture} name={h.name} layout="card" />
                  </button>
                </Dealt>
              );
            })}
          </div>
        </div>

        <div className="hero-pool">
          <div><h3>{t("draft.heroPool")} <span>{heroes.length}</span></h3><p>{t("draft.heroPoolHint")}</p></div>
          <div className="hero-pool__chips">
            {heroes.length === 0 ? <span className="muted">{t("common.empty")}</span> : heroes.map((id) => {
              const h = hero(id);
              return (
                <span key={id} className="drafted-hero">
                  <HeroThumb picture={h.picture} name={h.name} />
                  {heroOwner[id] && (
                    <small>
                      → {heroOwner[id].nickname} · {(() => {
                        const games = displayPhs?.[String(heroOwner[id].accountId)]?.[String(id)]?.games ?? 0;
                        return t(heroGamesMessageKey(locale, games), { count: games });
                      })()}
                    </small>
                  )}
                </span>
              );
            })}
          </div>
        </div>
        <ScoringLegend />
      </Surface>
      {confirmLeave && (
        <Modal mark="A" title={t("draft.leaveTitle")} description={t("draft.leaveText")} labelledBy="leave-title" dismissLabel={t("common.close")} onClose={() => setConfirmLeave(false)}>
          {({ close }) => (
            <>
              <Button variant="secondaryInvert" autoFocus onClick={close}>{t("draft.leaveCancel")}</Button>
              <Button variant="danger" data-testid="confirm-leave" onClick={reset}>{t("draft.leaveConfirm")}</Button>
            </>
          )}
        </Modal>
      )}
      {confirmRestart && (
        <Modal mark="A" title={t("draft.restartTitle")} description={t("draft.restartText")} labelledBy="restart-title" dismissLabel={t("common.close")} onClose={() => setConfirmRestart(false)}>
          {({ close }) => (
            <>
              <Button variant="secondaryInvert" autoFocus onClick={close}>{t("draft.restartCancel")}</Button>
              <Button variant="danger" data-testid="confirm-restart" onClick={() => { setConfirmRestart(false); restartSameConfig(); }}>{t("draft.restartConfirm")}</Button>
            </>
          )}
        </Modal>
      )}
      {inspectedPlayer && data && (
        <PlayerInspector candidate={inspectedPlayer} data={data} onClose={() => setInspectedPlayer(null)} />
      )}
    </main>
  );
}

function CandidateCard({ candidate, enabled, onPick, index }: { candidate: Candidate; enabled: boolean; onPick: () => void; index: number }) {
  const { t } = useI18n();
  const player = candidate.player;
  const tier = playerOvrTier(player.ovr);
  return (
    <button className={`candidate card-tint--${tier}`} onClick={onPick} disabled={!enabled} data-testid={`candidate-${index}`}>
      <RoleTag role={player.role}>{t(roleMessageKey(player.role))}</RoleTag>
      <span className="candidate__identity"><strong>{player.nickname}</strong><small>{candidate.teamName}</small></span>
      <span className="candidate__stats"><span><b>{player.impact}</b> IMP</span><span><b>{player.economy}</b> ECO</span><span><b>{player.reliability}</b> REL</span></span>
      <span className={`candidate__ovr ovr-tier--${tier}`}>{player.ovr}<small>OVR</small></span>
      <span className="candidate__action">{t("draft.pick")} →</span>
    </button>
  );
}
