import { useState } from "react";
import { useRun } from "../../state/runStore.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { heroGamesMessageKey, roleMessageKey } from "../../i18n/core.ts";
import { Button, Eyebrow, HeroThumb, Modal, RoleTag, StatTile, Surface } from "../../ui/index.ts";
import { Pentagon } from "./Pentagon.tsx";
import { PlayerInspector } from "./PlayerInspector.tsx";
import { SynergyBreakdown } from "./SynergyBreakdown.tsx";
import { ScoringLegend } from "./ScoringLegend.tsx";
import {
  chemistryPairEdges,
  chemistryPlayersFromRoster,
  heroStatsForAssignment,
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
  const config = useRun((state) => state.config);
  const data = useRun((state) => state.data);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [inspectedPlayer, setInspectedPlayer] = useState<Candidate | null>(null);
  const hero = useHero();
  const { locale, t } = useI18n();
  if (!snapshot || !config) return null;

  const { currentPack, roster, rerollsLeft, score, heroes, packHeroes, rosterFilled } = snapshot;
  const rerollCount = rerollsLeft === Infinity ? "∞" : String(rerollsLeft);
  const picked = rosterFilled + heroes.length;
  const chemistryEdges = data
    ? chemistryPairEdges(
      chemistryPlayersFromRoster(roster),
      data.squadSynergy,
      data.teammates,
    )
    : [];
  const phs = data
    ? heroStatsForAssignment(data, config.scoring, roster.map((slot) => slot.candidate))
    : null;
  const heroRows = score && phs ? heroSynergyRows(roster, score.assignment, phs) : [];
  const chemistryRows = data ? squadChemistryRows(roster, data.squadSynergy, data.teammates) : [];
  const synergyTier = score ? heroSynergyTier(score.heroSynergy) : null;
  const synergySublabel = synergyTier === "insane"
    ? t("draft.synergyInsane")
    : synergyTier === "great"
      ? t("draft.synergyGreat")
      : undefined;

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
    <main className="draft">
      <header className="screen-heading draft__heading">
        <div><Eyebrow>{t("draft.eyebrow")}</Eyebrow><h1>{t("draft.picked", { current: picked, total: 10 })}</h1></div>
        <Button variant="leave" onClick={() => setConfirmLeave(true)}>{t("draft.leave")}</Button>
      </header>
      <Surface className="draft__radar">
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
      <Surface className="pack-panel">
        <div className="pack-heading">
          <div>
            <Eyebrow className="pack-eyebrow">{currentPack.kind === "mixed" ? t("draft.freeAgents") : currentPack.label}</Eyebrow>
            <h2>{currentPack.kind === "mixed" ? t("draft.mixedSubtitle") : currentPack.sublabel}</h2>
          </div>
          <Button variant="secondary" onClick={reroll} disabled={rerollsLeft <= 0}>↻ {t("draft.reroll")}<small>{t("draft.rerollsLeft", { count: rerollCount })}</small></Button>
        </div>
        <div className="candidates">
          {currentPack.candidates.map((candidate, index) => <CandidateCard key={candidate.player.accountId} candidate={candidate} enabled={canPickPlayer(index)} onPick={() => pickPlayer(index)} index={index} />)}
        </div>

        <div className="hero-pool">
          <div><h3>{t("draft.packHeroes")} <span>{packHeroes.length}</span></h3><p>{t("draft.packHeroesHint")}</p></div>
          <div className="hero-pool__chips">
            {packHeroes.map((id) => {
              const h = hero(id);
              return (
                <button key={id} type="button" className="hero-pick" disabled={!canPickHero(id)} onClick={() => pickHero(id)} data-testid={`pack-hero-${id}`}>
                  <HeroThumb picture={h.picture} name={h.name} />
                </button>
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
                        const games = phs?.[String(heroOwner[id].accountId)]?.[String(id)]?.games ?? 0;
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
        <Modal mark="A" title={t("draft.leaveTitle")} description={t("draft.leaveText")} labelledBy="leave-title" onClose={() => setConfirmLeave(false)}>
          <Button variant="secondary" autoFocus onClick={() => setConfirmLeave(false)}>{t("draft.leaveCancel")}</Button>
          <Button variant="danger" data-testid="confirm-leave" onClick={reset}>{t("draft.leaveConfirm")}</Button>
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
