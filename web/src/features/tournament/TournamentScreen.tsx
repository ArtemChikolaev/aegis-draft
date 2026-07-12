import { useState } from "react";
import { roleMessageKey, type MessageKey } from "../../i18n/core.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { PlacementKey, PlayoffRound, ProjectionKey, TournamentStage, TournamentTeam } from "../../game/tournament.ts";
import { useRun } from "../../state/runStore.ts";
import { Button, Eyebrow, HeroThumb, Modal, RoleTag, StatTile, Surface } from "../../ui/index.ts";
import { useHero } from "../draft/heroes.ts";
import "./tournament.css";

const stages: TournamentStage[] = ["field", "groups", "playoffs"];
const fmt = (value: number) => (value >= 0 ? `+${value.toFixed(1)}` : value.toFixed(1));
const projectionKey = (key: ProjectionKey) => `tournament.projection.${key}` as MessageKey;
const placementKey = (key: PlacementKey) => `tournament.place.${key}` as MessageKey;
const stageKey = (stage: TournamentStage) => `tournament.${stage}` as MessageKey;
const titleKey = (stage: TournamentStage) => `tournament.${stage}Title` as MessageKey;
const textKey = (stage: TournamentStage) => `tournament.${stage}Text` as MessageKey;

// Строка команды в серии: лого-бейдж, имя, счёт; победитель ярко, проигравший приглушён,
// своя команда подсвечена.
function TeamRow({ team, score, won }: { team: TournamentTeam; score: number; won: boolean }) {
  return (
    <span className={`series__team ${won ? "is-winner" : "is-loser"} ${team.isUser ? "is-user" : ""}`}>
      <i className="series__logo" aria-hidden="true">{team.name.slice(0, 1)}</i>
      <em className="series__name">{team.name}</em>
      <b className="series__score">{score}</b>
    </span>
  );
}

// Колонка раунда сетки: серии со счётом (как в 322-0), с коннекторами к следующему раунду.
function renderRound(round: PlayoffRound) {
  return (
    <div key={round.id} className="bracket-col">
      <h4 className="bracket-col__title">{round.label}</h4>
      <div className="bracket-col__matches">
        {round.series.map((series) => (
          <div key={series.id} className={`match ${series.teamA.isUser || series.teamB.isUser ? "has-user" : ""}`}>
            <TeamRow team={series.teamA} score={series.scoreA} won={series.winnerId === series.teamA.id} />
            <TeamRow team={series.teamB} score={series.scoreB} won={series.winnerId === series.teamB.id} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TournamentScreen() {
  const tournament = useRun((state) => state.tournament);
  const advance = useRun((state) => state.advanceTournament);
  const reset = useRun((state) => state.reset);
  const snapshot = useRun((state) => state.snapshot);
  const hero = useHero();
  const { t } = useI18n();
  const [confirmLeave, setConfirmLeave] = useState(false);
  if (!tournament) return null;

  const stageIndex = stages.indexOf(tournament.stage);
  const advanceLabel: Partial<Record<TournamentStage, MessageKey>> = {
    field: "tournament.advanceGroups", groups: "tournament.advancePlayoffs",
  };
  const score = snapshot?.score ?? null;

  return (
    <main className="tournament">
      <header className="tournament__heading">
        <div>
          <Eyebrow>{t("tournament.eyebrow")}</Eyebrow>
          <h1>{t(titleKey(tournament.stage))}</h1>
          <p>{t(textKey(tournament.stage))}</p>
        </div>
        <Button variant="leave" onClick={() => setConfirmLeave(true)}>{t("draft.leave")}</Button>
      </header>

      <nav className="tournament__progress" aria-label={t("tournament.eyebrow")}>
        {stages.map((stage, index) => <span key={stage} className={index <= stageIndex ? "is-active" : ""}>{index + 1}. {t(stageKey(stage))}</span>)}
      </nav>

      {tournament.stage === "field" && (
        <Surface className="tournament__field">
          <div className="tournament__projection">
            <span>{t("tournament.yourProjection")}</span>
            <strong>{t(projectionKey(tournament.projection))}</strong>
          </div>
          <ol className="field-list">
            {tournament.field.map((team, index) => (
              <li key={team.id} className={team.isUser ? "is-user" : ""}>
                <span>{index + 1}</span><strong>{team.name}</strong>
                <b className="field-strength">{Math.round(team.strength)}</b>
              </li>
            ))}
          </ol>
        </Surface>
      )}

      {tournament.stage === "groups" && (
        <div className="tournament__groups">
          {tournament.groups.map((group) => (
            <Surface key={group.id} className="group-table">
              <h2>Group {group.id}</h2>
              <div className="table-head"><span>#</span><span>{t("tournament.team")}</span><span>{t("tournament.record")}</span><span>{t("tournament.route")}</span></div>
              {group.standings.map((row) => (
                <div key={row.team.id} className={`table-row ${row.team.isUser ? "is-user" : ""}`}>
                  <span>{row.rank}</span><span><strong>{row.team.name}</strong>{row.team.eventLabel && <small>{row.team.eventLabel}</small>}</span>
                  <span>{row.wins}–{row.losses}</span><span>{t(`tournament.${row.route}` as MessageKey)}</span>
                </div>
              ))}
            </Surface>
          ))}
        </div>
      )}

      {tournament.stage === "playoffs" && (
        <>
          <Surface className="tournament__champion">
            <div>
              <span>{t("tournament.yourFinish")}</span>
              <strong className={tournament.champion.isUser ? "is-user" : ""}>{t(placementKey(tournament.userPlacement))}</strong>
            </div>
            <div className="tournament__champion-name">
              <span>{t("tournament.champion")}</span>
              <strong>{tournament.champion.name}</strong>
            </div>
          </Surface>

          <div className="bracket">
            <section className="bracket__side">
              <h3 className="bracket__side-title">{t("tournament.upperBracket")}</h3>
              <div className="bracket-flow">
                {tournament.playoffRounds.filter((round) => round.id.startsWith("ub")).map(renderRound)}
                <div className="bracket-col">
                  <h4 className="bracket-col__title bracket-col__title--gf">{t("tournament.grandFinalShort")}</h4>
                  <div className="bracket-col__matches">
                    <div className={`match match--gf ${tournament.grandFinal.teamA.isUser || tournament.grandFinal.teamB.isUser ? "has-user" : ""}`}>
                      <TeamRow team={tournament.grandFinal.teamA} score={tournament.grandFinal.scoreA} won={tournament.grandFinal.winnerId === tournament.grandFinal.teamA.id} />
                      <TeamRow team={tournament.grandFinal.teamB} score={tournament.grandFinal.scoreB} won={tournament.grandFinal.winnerId === tournament.grandFinal.teamB.id} />
                    </div>
                  </div>
                </div>
              </div>
            </section>
            <section className="bracket__side">
              <h3 className="bracket__side-title">{t("tournament.lowerBracket")}</h3>
              <div className="bracket-flow">{tournament.playoffRounds.filter((round) => round.id.startsWith("lb")).map(renderRound)}</div>
            </section>
          </div>

          <div className="tournament__report">
            <Surface className="final-table">
              <h3 className="bracket__side-title">{t("tournament.finalStandings")}</h3>
              {tournament.standings.map((row) => (
                <div key={row.team.id} className={row.team.isUser ? "is-user" : ""}>
                  <span>{t(placementKey(row.placement))}</span><strong>{row.team.name}</strong><b>{Math.round(row.team.strength)}</b>
                </div>
              ))}
            </Surface>
            {score && snapshot && (
              <Surface className="run-summary">
                <h3 className="bracket__side-title">{t("tournament.yourRun")}</h3>
                <div className="run-summary__scores">
                  <StatTile label={t("common.base")} value={Math.round(score.base).toString()} kind="base" />
                  <StatTile label={t("common.heroSynergy")} value={fmt(score.heroSynergy)} kind="synergy" />
                  <StatTile label={t("common.chemistry")} value={fmt(score.chemistry)} kind="chemistry" />
                  <StatTile label={t("common.teamOvr")} value={Math.round(score.teamOvr).toString()} kind="base" />
                </div>
                <ul className="run-summary__roster">
                  {snapshot.roster.map((slot, index) => {
                    const heroId = slot.candidate ? score.assignment.byPlayer[slot.candidate.player.accountId] : undefined;
                    const info = heroId != null ? hero(heroId) : null;
                    return (
                      <li key={index}>
                        <RoleTag role={slot.role}>{t(roleMessageKey(slot.role))}</RoleTag>
                        <strong>{slot.candidate?.player.nickname ?? "—"}</strong>
                        {info && <span className="run-summary__hero"><HeroThumb picture={info.picture} name={info.name} /></span>}
                      </li>
                    );
                  })}
                </ul>
              </Surface>
            )}
          </div>
        </>
      )}

      <div className="tournament__actions">
        {tournament.canAdvance && advanceLabel[tournament.stage] && <Button variant="primary" onClick={advance}>{t(advanceLabel[tournament.stage]!)}<span>→</span></Button>}
        {!tournament.canAdvance && <Button variant="primary" onClick={() => setConfirmLeave(true)}>{t("tournament.newRun")}<span>↻</span></Button>}
      </div>

      {confirmLeave && (
        <Modal mark="A" title={t("tournament.leaveTitle")} description={t("tournament.leaveText")} labelledBy="tournament-leave-title" onClose={() => setConfirmLeave(false)}>
          <Button variant="primaryInvert" onClick={() => setConfirmLeave(false)}>{t("tournament.leaveCancel")}</Button>
          <Button variant="danger" onClick={reset}>{t("tournament.leaveConfirm")}</Button>
        </Modal>
      )}
    </main>
  );
}
