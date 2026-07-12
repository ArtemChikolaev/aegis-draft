import { useCallback, useEffect, useMemo, useState } from "react";
import { roleMessageKey, type MessageKey } from "../../i18n/core.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type {
  GroupMatch, GroupStanding, PlacementKey, PlayoffRound, ProjectionKey, TournamentGroup,
  TournamentStage, TournamentTeam,
} from "../../game/tournament.ts";
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

// Ритм проигрывания live-симуляции: группы дают много коротких матчей (быстрый фид),
// сетка — редкие крупные серии (пораундовое раскрытие).
const GROUP_STEP_MS = 70;
const PLAYOFF_STEP_MS = 320;

// Презентационный прогрессивный reveal: движок уже посчитал весь результат детерминированно,
// а здесь мы лишь «проигрываем» его по одному элементу с возможностью Skip. Сбрасывается при
// смене стадии (resetKey). Состояние эфемерное — в persist забега не попадает (при resume
// стадия открывается сразу, а reveal доиграется/скипнется заново).
function useReveal(total: number, resetKey: unknown, stepMs: number) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    if (total <= 0) return;
    let current = 0;
    const id = window.setInterval(() => {
      current += 1;
      setN(current);
      if (current >= total) window.clearInterval(id);
    }, stepMs);
    return () => window.clearInterval(id);
  }, [total, resetKey, stepMs]);
  const skip = useCallback(() => setN(total), [total]);
  return { n, done: n >= total, skip };
}

// Частичная таблица группы из уже сыгранных матчей (route открываем только когда группа
// доиграна — до этого путь ещё не определён).
function liveStandings(group: TournamentGroup, played: GroupMatch[], done: boolean): GroupStanding[] {
  if (done) return group.standings;
  const rec = new Map(group.standings.map((s) => [s.team.id, { team: s.team, wins: 0, losses: 0 }]));
  for (const m of played) {
    if (m.group !== group.id) continue;
    const a = rec.get(m.teamA.id)!;
    const b = rec.get(m.teamB.id)!;
    a.wins += m.scoreA; a.losses += m.scoreB;
    b.wins += m.scoreB; b.losses += m.scoreA;
  }
  return [...rec.values()]
    .sort((x, y) => y.wins - x.wins || y.team.strength - x.team.strength || x.team.id.localeCompare(y.team.id))
    .map((r, index) => ({ ...r, rank: index + 1, route: "out" as const }));
}

// Строка команды в серии: лого-бейдж, имя, счёт. Победитель ярко, проигравший приглушён,
// своя команда подсвечена; ещё не сыгранная серия (pending) — нейтральная, без счёта.
function TeamRow({ team, score, won, pending }: { team: TournamentTeam; score: number; won: boolean; pending?: boolean }) {
  const state = pending ? "is-pending" : won ? "is-winner" : "is-loser";
  return (
    <span className={`series__team ${state} ${team.isUser ? "is-user" : ""}`}>
      <i className="series__logo" aria-hidden="true">{team.name.slice(0, 1)}</i>
      <em className="series__name">{team.name}</em>
      <b className="series__score">{pending ? "·" : score}</b>
    </span>
  );
}

// Колонка раунда сетки: серии со счётом (как в 322-0), с коннекторами к следующему раунду.
// Ещё не раскрытые серии показываются заглушкой.
function renderRound(round: PlayoffRound, isRevealed: (id: string) => boolean) {
  return (
    <div key={round.id} className="bracket-col">
      <h4 className="bracket-col__title">{round.label}</h4>
      <div className="bracket-col__matches">
        {round.series.map((series) => {
          const shown = isRevealed(series.id);
          return (
            <div key={series.id} className={`match ${series.teamA.isUser || series.teamB.isUser ? "has-user" : ""} ${shown ? "" : "is-pending"}`}>
              <TeamRow team={series.teamA} score={series.scoreA} won={series.winnerId === series.teamA.id} pending={!shown} />
              <TeamRow team={series.teamB} score={series.scoreB} won={series.winnerId === series.teamB.id} pending={!shown} />
            </div>
          );
        })}
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

  // Матчи групп чередуем A/B, чтобы обе таблицы наполнялись одновременно.
  const orderedGroupMatches = useMemo(() => {
    if (!tournament) return [];
    const a = tournament.groupMatches.filter((m) => m.group === "A");
    const b = tournament.groupMatches.filter((m) => m.group === "B");
    const out: GroupMatch[] = [];
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      if (a[i]) out.push(a[i]);
      if (b[i]) out.push(b[i]);
    }
    return out;
  }, [tournament]);
  // Порядок раскрытия сетки = зависимостный порядок раундов движка + Grand Final.
  const playoffOrder = useMemo(() => {
    if (!tournament) return [];
    const ids: string[] = [];
    for (const r of tournament.playoffRounds) for (const s of r.series) ids.push(s.id);
    ids.push(tournament.grandFinal.id);
    return ids;
  }, [tournament]);

  const stage = tournament?.stage ?? "field";
  const revealTotal = stage === "groups" ? orderedGroupMatches.length : stage === "playoffs" ? playoffOrder.length : 0;
  const stepMs = stage === "groups" ? GROUP_STEP_MS : PLAYOFF_STEP_MS;
  const { n, done, skip } = useReveal(revealTotal, stage, stepMs);

  if (!tournament) return null;

  const stageIndex = stages.indexOf(tournament.stage);
  const advanceLabel: Partial<Record<TournamentStage, MessageKey>> = {
    field: "tournament.advanceGroups", groups: "tournament.advancePlayoffs",
  };
  const score = snapshot?.score ?? null;
  const playing = revealTotal > 0 && !done;
  const revealedGroupMatches = orderedGroupMatches.slice(0, n);
  const revealedSeries = new Set(playoffOrder.slice(0, n));
  const isRevealed = (id: string) => revealedSeries.has(id);

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
        {stages.map((item, index) => <span key={item} className={index <= stageIndex ? "is-active" : ""}>{index + 1}. {t(stageKey(item))}</span>)}
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
              {liveStandings(group, revealedGroupMatches, done).map((row) => (
                <div key={row.team.id} className={`table-row ${row.team.isUser ? "is-user" : ""}`}>
                  <span>{row.rank}</span><span><strong>{row.team.name}</strong>{row.team.eventLabel && <small>{row.team.eventLabel}</small>}</span>
                  <span>{row.wins}–{row.losses}</span><span>{done ? t(`tournament.${row.route}` as MessageKey) : "·"}</span>
                </div>
              ))}
            </Surface>
          ))}
          <Surface className="group-results">
            <h3 className="bracket__side-title">{t("tournament.results")}</h3>
            <div className="group-results__list">
              {[...revealedGroupMatches].reverse().map((match) => (
                <div key={match.id} className={`group-result ${match.teamA.isUser || match.teamB.isUser ? "is-user" : ""}`}>
                  <span className="group-result__tag">{match.group}</span>
                  <span className={`group-result__team is-a ${match.teamA.isUser ? "is-user" : ""}`}>{match.teamA.name}</span>
                  <b className="group-result__score">{match.scoreA}–{match.scoreB}</b>
                  <span className={`group-result__team is-b ${match.teamB.isUser ? "is-user" : ""}`}>{match.teamB.name}</span>
                </div>
              ))}
            </div>
          </Surface>
        </div>
      )}

      {tournament.stage === "playoffs" && (
        <>
          {done && (
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
          )}

          <div className="bracket">
            <section className="bracket__side">
              <h3 className="bracket__side-title">{t("tournament.upperBracket")}</h3>
              <div className="bracket-flow">
                {tournament.playoffRounds.filter((round) => round.id.startsWith("ub")).map((round) => renderRound(round, isRevealed))}
                <div className="bracket-col">
                  <h4 className="bracket-col__title bracket-col__title--gf">{t("tournament.grandFinalShort")}</h4>
                  <div className="bracket-col__matches">
                    <div className={`match match--gf ${tournament.grandFinal.teamA.isUser || tournament.grandFinal.teamB.isUser ? "has-user" : ""} ${isRevealed(tournament.grandFinal.id) ? "" : "is-pending"}`}>
                      <TeamRow team={tournament.grandFinal.teamA} score={tournament.grandFinal.scoreA} won={tournament.grandFinal.winnerId === tournament.grandFinal.teamA.id} pending={!isRevealed(tournament.grandFinal.id)} />
                      <TeamRow team={tournament.grandFinal.teamB} score={tournament.grandFinal.scoreB} won={tournament.grandFinal.winnerId === tournament.grandFinal.teamB.id} pending={!isRevealed(tournament.grandFinal.id)} />
                    </div>
                  </div>
                </div>
              </div>
            </section>
            <section className="bracket__side">
              <h3 className="bracket__side-title">{t("tournament.lowerBracket")}</h3>
              <div className="bracket-flow">{tournament.playoffRounds.filter((round) => round.id.startsWith("lb")).map((round) => renderRound(round, isRevealed))}</div>
            </section>
          </div>

          {done && (
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
          )}
        </>
      )}

      <div className="tournament__actions">
        {playing ? (
          <div className="tournament__live">
            <span className="tournament__live-dot">{t("tournament.live")}</span>
            <em>{t(tournament.stage === "groups" ? "tournament.playingGroups" : "tournament.playingPlayoffs")}</em>
            <Button variant="leave" onClick={skip}>{t("tournament.skip")}</Button>
          </div>
        ) : (
          <>
            {tournament.canAdvance && advanceLabel[tournament.stage] && <Button variant="primary" onClick={advance}>{t(advanceLabel[tournament.stage]!)}<span>→</span></Button>}
            {!tournament.canAdvance && <Button variant="primary" onClick={() => setConfirmLeave(true)}>{t("tournament.newRun")}<span>↻</span></Button>}
          </>
        )}
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
