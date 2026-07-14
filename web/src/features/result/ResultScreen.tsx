import { useState } from "react";
import { useRun } from "../../state/runStore.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { heroGamesMessageKey, roleMessageKey } from "../../i18n/core.ts";
import { Button, Eyebrow, HeroThumb, RoleTag, StatTile, Surface, TeamName } from "../../ui/index.ts";
import { Pentagon } from "../draft/Pentagon.tsx";
import { SynergyBreakdown } from "../draft/SynergyBreakdown.tsx";
import { HeroAllocation } from "../draft/HeroAllocation.tsx";
import {
  chemistryPairEdges,
  chemistryPlayersFromRoster,
  heroStatsForAssignment,
  heroSynergyRows,
  heroSynergyTier,
  squadChemistryRows,
} from "../../game/score.ts";
import { PlayerInspector } from "../draft/PlayerInspector.tsx";
import { useHero } from "../draft/heroes.ts";
import type { Candidate } from "../../game/packs.ts";
import "./result.css";

const fmt = (value: number) => (value >= 0 ? `+${value.toFixed(1)}` : value.toFixed(1));

export function ResultScreen() {
  const snapshot = useRun((state) => state.snapshot);
  const config = useRun((state) => state.config);
  const startTournament = useRun((state) => state.startTournament);
  const swapHeroes = useRun((state) => state.swapHeroes);
  const data = useRun((state) => state.data);
  const teamName = useRun((state) => state.teamName);
  const setTeamName = useRun((state) => state.setTeamName);
  const heroInfo = useHero();
  const { locale, t } = useI18n();
  const [swapSelectedId, setSwapSelectedId] = useState<number | null>(null);
  const [inspectedPlayer, setInspectedPlayer] = useState<Candidate | null>(null);
  if (!snapshot?.score || !data || !config) return null;

  const { roster, score } = snapshot;
  const isManual = config.allocation === "manual";
  const chemistryEdges = chemistryPairEdges(
    chemistryPlayersFromRoster(roster),
    data.squadSynergy,
    data.teammates,
  );
  const phs = heroStatsForAssignment(
    data,
    config.scoring,
    roster.map((slot) => slot.candidate),
  );
  const heroRows = heroSynergyRows(roster, score.assignment, phs);
  const chemistryRows = squadChemistryRows(roster, data.squadSynergy, data.teammates);
  const assignmentByPlayer = score.assignment.byPlayer;
  const synergyTier = heroSynergyTier(score.heroSynergy);
  const synergySublabel = synergyTier === "insane"
    ? t("draft.synergyInsane")
    : synergyTier === "great"
      ? t("draft.synergyGreat")
      : undefined;

  const handleSwapTap = (accountId: number) => {
    if (!isManual) return;
    if (swapSelectedId == null) {
      setSwapSelectedId(accountId);
      return;
    }
    if (swapSelectedId === accountId) {
      setSwapSelectedId(null);
      return;
    }
    swapHeroes(swapSelectedId, accountId);
    setSwapSelectedId(null);
  };

  const swapHint = isManual
    ? swapSelectedId == null
      ? t("draft.swapHeroesHint")
      : t("draft.swapHeroesSelected", {
        nickname: roster.find((s) => s.candidate?.player.accountId === swapSelectedId)?.candidate?.player.nickname ?? "",
      })
    : null;

  return (
    <main className="result" data-testid="result-screen">
      <header className="screen-heading result__heading">
        <Eyebrow>{t("result.eyebrow")}</Eyebrow>
        <h1><TeamName value={teamName} placeholder={t("team.placeholder")} editLabel={t("team.edit")} onChange={setTeamName} /></h1>
        <p>{t("result.subtitle")}</p>
      </header>
      <div className="result__grid">
        <Surface className="result__radar">
          <Pentagon
            roster={roster}
            teamOvr={score.teamOvr}
            chemistryEdges={chemistryEdges}
            assignmentByPlayer={assignmentByPlayer}
            swapMode={isManual}
            swapSelectedId={swapSelectedId}
            onSwapTap={isManual ? handleSwapTap : undefined}
          />
          <div className="score-strip">
            <StatTile label={t("common.base")} value={Math.round(score.base).toString()} kind="base" />
            <StatTile label={t("common.heroSynergy")} value={fmt(score.heroSynergy)} kind="synergy" sublabel={synergySublabel} />
            <StatTile label={t("common.chemistry")} value={fmt(score.chemistry)} kind="chemistry" />
          </div>
          <SynergyBreakdown
            heroRows={heroRows}
            chemistryRows={chemistryRows}
            onPlayerClick={(accountId) => {
              const candidate = roster.find((slot) => slot.candidate?.player.accountId === accountId)?.candidate;
              if (candidate) setInspectedPlayer(candidate);
            }}
          />
          {isManual && (
            <>
              <HeroAllocation
                roster={roster}
                assignmentByPlayer={assignmentByPlayer}
                swapSelectedId={swapSelectedId}
                onSelect={handleSwapTap}
              />
              {swapHint && <p className="result__swap-hint muted">{swapHint}</p>}
            </>
          )}
        </Surface>
        <Surface className="result__report">
          <div className="result__ovr">
            <strong>{Math.round(score.teamOvr)}</strong>
            <span>{t("common.teamOvr")}</span>
          </div>
          <h2>{t("result.breakdown")}</h2>
          <dl className="breakdown">
            <div><dt>{t("common.base")}</dt><dd>{Math.round(score.base)}</dd></div>
            <div><dt>{t("common.heroSynergy")}</dt><dd>{fmt(score.heroSynergy)}</dd></div>
            <div><dt>{t("common.chemistry")}</dt><dd>{fmt(score.chemistry)}</dd></div>
          </dl>
          <h2>{t("result.roster")}</h2>
          <ul className="final-roster">
            {roster.map((slot, index) => {
              const heroId = slot.candidate ? score.assignment.byPlayer[slot.candidate.player.accountId] : undefined;
              const games = slot.candidate && heroId != null
                ? phs[String(slot.candidate.player.accountId)]?.[String(heroId)]?.games ?? 0
                : 0;
              return (
                <li key={index}>
                  <RoleTag role={slot.role}>{t(roleMessageKey(slot.role))}</RoleTag>
                  <strong>{slot.candidate?.player.nickname ?? "—"}</strong>
                  <span>
                    {heroId == null ? "—" : (
                      <>
                        <HeroThumb picture={heroInfo(heroId).picture} name={heroInfo(heroId).name} />
                        <small>{t(heroGamesMessageKey(locale, games), { count: games })}</small>
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="run-meta muted">{t("result.tournamentIntro")}</p>
          <Button variant="primary" data-testid="start-tournament" onClick={() => startTournament(teamName || t("team.placeholder"))}>{t("tournament.start")}<span>→</span></Button>
        </Surface>
      </div>
      {inspectedPlayer && data && (
        <PlayerInspector candidate={inspectedPlayer} data={data} onClose={() => setInspectedPlayer(null)} />
      )}
    </main>
  );
}
