import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { roleMessageKey, type MessageKey } from "../../i18n/core.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type {
  GroupMatch, GroupStanding, PlacementKey, PlayoffRound, ProjectionKey, SeriesResult, TournamentGroup,
  TournamentSnapshot, TournamentTeam,
} from "../../game/tournament.ts";
import {
  buildPlayoffFeeders,
  buildPlayoffSimTicks,
  groupDrawOrder,
  orderGroupMatchesBySeries,
  seriesFinished,
  seriesFrame,
  seriesLive,
  seriesSlotsVisible,
  seriesStarted,
} from "../../game/tournamentPlayback.ts";
import { useRun } from "../../state/runStore.ts";
import { Button, Eyebrow, HeroThumb, Modal, RoleTag, StatTile, Surface, TeamName } from "../../ui/index.ts";
import { Pentagon } from "../draft/Pentagon.tsx";
import { SynergyBreakdown } from "../draft/SynergyBreakdown.tsx";
import { HeroAllocation } from "../draft/HeroAllocation.tsx";
import { PlayerInspector } from "../draft/PlayerInspector.tsx";
import {
  chemistryPairEdges,
  chemistryPlayersFromRoster,
  heroStatsForAssignment,
  heroStatsForDisplay,
  heroSynergyRows,
  heroSynergyTier,
  squadChemistryRows,
} from "../../game/score.ts";
import { useHero } from "../draft/heroes.ts";
import type { Candidate } from "../../game/packs.ts";
import { CareerPanel } from "./CareerPanel.tsx";
import "../result/result.css";
import "./tournament.css";

const fmt = (value: number) => (value >= 0 ? `+${value.toFixed(1)}` : value.toFixed(1));
const projectionKey = (key: ProjectionKey) => `tournament.projection.${key}` as MessageKey;
const placementKey = (key: PlacementKey) => `tournament.place.${key}` as MessageKey;

// Тир силы команды для цветового градиента (зелёный→красный, токены --tier-*).
const scoreTier = (score: number): "elite" | "strong" | "mid" | "low" | "weak" =>
  score >= 90 ? "elite" : score >= 86 ? "strong" : score >= 82 ? "mid" : score >= 78 ? "low" : "weak";

// Группы: один тик = весь матч (финальный счёт сразу). Плей-офф: тик = одна карта серии.
const GROUP_MATCH_STEP_MS = 70;
const PLAYOFF_MAP_STEP_MS = 200;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Презентационный прогрессивный reveal: движок уже посчитал весь результат детерминированно,
// а здесь мы лишь «проигрываем» его по одному элементу с возможностью Skip. Сбрасывается при
// смене стадии (resetKey). Состояние эфемерное — в persist забега не попадает (при resume
// стадия открывается сразу, а reveal доиграется/скипнется заново).
function useReveal(total: number, resetKey: unknown, stepMs: number) {
  const [n, setN] = useState(0);
  const timer = useRef<number | null>(null);
  const resetKeyRef = useRef(resetKey);
  const keyChanged = resetKeyRef.current !== resetKey;
  if (keyChanged) resetKeyRef.current = resetKey;

  const stop = useCallback(() => {
    if (timer.current == null) return;
    window.clearInterval(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => {
    stop();
    setN(0);
    if (total <= 0) return;
    let current = 0;
    timer.current = window.setInterval(() => {
      current += 1;
      setN(current);
      if (current >= total) stop();
    }, stepMs);
    return stop;
  }, [resetKey, stepMs, stop, total]);
  const skip = useCallback(() => {
    stop();
    setN(total);
  }, [stop, total]);
  // Синхронный сброс при смене стадии: иначе n от групп (72) > тиков плей-офф (~68) → done=true на 1 кадр.
  const step = keyChanged ? 0 : n;
  return { n: step, done: total > 0 && step >= total, skip };
}

// Частичная таблица: все 9 команд сразу (порядок жеребьёvки), затем пересорт по картам.
function liveStandings(
  group: TournamentGroup,
  groupMatches: GroupMatch[],
  played: GroupMatch[],
  done: boolean,
): GroupStanding[] {
  if (done) return group.standings;

  const drawOrder = groupDrawOrder(group, groupMatches);
  const rec = new Map(drawOrder.map((team) => [team.id, { team, wins: 0, losses: 0 }]));
  for (const m of played) {
    if (m.group !== group.id) continue;
    const a = rec.get(m.teamA.id)!;
    const b = rec.get(m.teamB.id)!;
    a.wins += m.scoreA;
    a.losses += m.scoreB;
    b.wins += m.scoreB;
    b.losses += m.scoreA;
  }

  const rows = [...rec.values()];
  const groupPlayed = played.some((m) => m.group === group.id);
  if (!groupPlayed) {
    return rows.map((r, index) => ({ ...r, rank: index + 1, route: "out" as const }));
  }

  return rows
    .sort((x, y) => y.wins - x.wins || y.team.strength - x.team.strength || x.team.id.localeCompare(y.team.id))
    .map((r, index) => ({ ...r, rank: index + 1, route: "out" as const }));
}

// Строка команды в серии (виджет Claude): ★ у своей, имя + счёт; win зелёный / loss коралл.
// live — карта идёт; pending — серия ещё не началась; empty — слот ещё не определён фидерами.
function TeamRow({
  team,
  score,
  won,
  pending,
  live,
  empty,
}: {
  team: TournamentTeam;
  score: number;
  won: boolean;
  pending?: boolean;
  live?: boolean;
  empty?: boolean;
}) {
  const state = empty ? "is-empty" : pending ? "is-pending" : live ? "is-live" : won ? "is-winner" : "is-loser";
  return (
    <span className={`series__team ${state} ${!empty && team.isUser ? "is-user" : ""}`}>
      <em className="series__name">{empty ? "·" : team.isUser ? `★ ${team.name}` : team.name}</em>
      <b className="series__score">{empty || pending ? "·" : score}</b>
    </span>
  );
}

function renderSeriesMatch(
  series: SeriesResult,
  tournament: TournamentSnapshot,
  feeders: Map<string, string[]>,
  ticks: ReturnType<typeof buildPlayoffSimTicks>,
  step: number,
  revealComplete: boolean,
  extraClass = "",
) {
  const slotsVisible = seriesSlotsVisible(series.id, tournament, feeders, ticks, step, revealComplete);
  const started = seriesStarted(series.id, ticks, step);
  const finished = seriesFinished(series, ticks, step);
  const live = seriesLive(series, ticks, step);
  const frame = seriesFrame(series, ticks, step);
  const scoreA = frame?.scoreA ?? 0;
  const scoreB = frame?.scoreB ?? 0;
  const teamA = slotsVisible ? series.teamA : null;
  const teamB = slotsVisible ? series.teamB : null;
  const hasUser = slotsVisible && (series.teamA.isUser || series.teamB.isUser);
  return (
    <div key={series.id} className={`match ${extraClass} ${hasUser ? "has-user" : ""} ${live ? "is-live" : ""} ${started ? "" : "is-pending"} ${slotsVisible ? "" : "is-locked"}`.trim()}>
      <TeamRow team={teamA ?? series.teamA} score={scoreA} won={finished && series.winnerId === series.teamA.id} pending={slotsVisible && !started} live={live} empty={!slotsVisible} />
      <TeamRow team={teamB ?? series.teamB} score={scoreB} won={finished && series.winnerId === series.teamB.id} pending={slotsVisible && !started} live={live} empty={!slotsVisible} />
    </div>
  );
}

// Колонка раунда сетки: серии со счётом (как в 322-0), с коннекторами к следующему раунду.
function renderRound(
  round: PlayoffRound,
  tournament: TournamentSnapshot,
  feeders: Map<string, string[]>,
  ticks: ReturnType<typeof buildPlayoffSimTicks>,
  step: number,
  revealComplete: boolean,
  slot: number,
) {
  return (
    <div key={round.id} className={`bracket-col bracket-col--slot-${slot}`}>
      <h4 className="bracket-col__title">{round.label}</h4>
      <div className="bracket-col__matches">
        {round.series.map((series) => renderSeriesMatch(series, tournament, feeders, ticks, step, revealComplete))}
      </div>
    </div>
  );
}

export function TournamentScreen() {
  const tournament = useRun((state) => state.tournament);
  const advance = useRun((state) => state.advanceTournament);
  const rerollField = useRun((state) => state.rerollField);
  const reset = useRun((state) => state.reset);
  const restartSameConfig = useRun((state) => state.restartSameConfig);
  const snapshot = useRun((state) => state.snapshot);
  const config = useRun((state) => state.config);
  const data = useRun((state) => state.data);
  const teamName = useRun((state) => state.teamName);
  const setTeamName = useRun((state) => state.setTeamName);
  const swapHeroes = useRun((state) => state.swapHeroes);
  const hero = useHero();
  const { locale, t } = useI18n();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [inspectedPlayer, setInspectedPlayer] = useState<Candidate | null>(null);
  const [swapSelectedId, setSwapSelectedId] = useState<number | null>(null);

  // «Камера»: авто-скролл к активной секции при смене стадии.
  const groupsRef = useRef<HTMLDivElement | null>(null);
  const groupResultsRef = useRef<HTMLDivElement | null>(null);
  const playoffsRef = useRef<HTMLDivElement | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);

  // Матчи групп: серия A + серия B за тик-серию (как TI), чтобы счёт рос синхронно.
  const orderedGroupMatches = useMemo(() => {
    if (!tournament) return [];
    return orderGroupMatchesBySeries(tournament.groupMatches);
  }, [tournament]);
  // Порядок раскрытия сетки = зависимостный порядок раундов движка + Grand Final.
  const playoffOrder = useMemo(() => {
    if (!tournament) return [];
    const ids: string[] = [];
    for (const r of tournament.playoffRounds) for (const s of r.series) ids.push(s.id);
    ids.push(tournament.grandFinal.id);
    return ids;
  }, [tournament]);

  const playoffSimTicks = useMemo(
    () => (tournament ? buildPlayoffSimTicks(tournament, playoffOrder) : []),
    [tournament, playoffOrder],
  );

  const playoffFeeders = useMemo(
    () => (tournament ? buildPlayoffFeeders(tournament) : new Map<string, string[]>()),
    [tournament],
  );

  const stage = tournament?.stage ?? "field";
  const revealTotal = stage === "groups"
    ? orderedGroupMatches.length
    : stage === "playoffs"
      ? playoffSimTicks.length
      : 0;
  const stepMs = stage === "groups" ? GROUP_MATCH_STEP_MS : PLAYOFF_MAP_STEP_MS;
  const { n, done, skip } = useReveal(revealTotal, stage, stepMs);

  // После доигранных групп: пауза → стаггер-раскраска путей (UB/LB/OUT сверху вниз) → плей-офф.
  // Это «закрашивание, кто куда попал» из 322-0. reduced-motion → мгновенно, без задержек.
  // field→groups запускает пользователь кнопкой «Симулировать».
  const [groupRoutesRevealed, setGroupRoutesRevealed] = useState(false);
  useEffect(() => { setGroupRoutesRevealed(false); }, [stage]);
  useEffect(() => {
    if (stage !== "groups" || !done) return;
    if (prefersReducedMotion()) {
      setGroupRoutesRevealed(true);
      if (tournament?.canAdvance) advance();
      return;
    }
    const revealT = window.setTimeout(() => setGroupRoutesRevealed(true), 600);
    const advanceT = tournament?.canAdvance ? window.setTimeout(() => advance(), 2400) : undefined;
    return () => { window.clearTimeout(revealT); if (advanceT !== undefined) window.clearTimeout(advanceT); };
  }, [stage, done, tournament?.canAdvance, advance]);

  // «Камера» ведёт к текущей секции. reduced-motion → без плавной анимации.
  const scrollTo = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    if (prefersReducedMotion()) { el.scrollIntoView({ block: "start" }); return; }
    // Плавно на реальных браузерах; в webview/TMA, где smooth scrollIntoView — no-op,
    // мгновенный фолбэк (срабатывает, только если скролл вообще не сдвинулся — анимацию не рубит).
    const startY = window.scrollY;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      if (window.scrollY === startY && Math.abs(el.getBoundingClientRect().top) > 120) {
        el.scrollIntoView({ block: "start" });
      }
    }, 250);
  }, []);
  useEffect(() => {
    if (stage === "groups") scrollTo(groupsRef.current);
    else if (stage === "playoffs") scrollTo(playoffsRef.current);
  }, [stage, scrollTo]);
  const playoffsDone = stage === "playoffs" && done;
  useEffect(() => {
    if (playoffsDone) scrollTo(resultRef.current);
  }, [playoffsDone, scrollTo]);

  const revealedGroupMatches = stage === "groups" ? orderedGroupMatches.slice(0, n) : orderedGroupMatches;
  const groupsDone = stage === "playoffs" || (stage === "groups" && done);
  useEffect(() => {
    if (stage !== "groups") return;
    const list = groupResultsRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [revealedGroupMatches.length, stage]);

  if (!tournament || !snapshot?.score || !config || !data) return null;

  const { roster, score } = snapshot;
  const eventNameById = useMemo(
    () => new Map(data.events.map((e) => [e.id, e.short ?? e.name])),
    [data.events],
  );
  const isManual = config.allocation === "manual";
  const canSwap = isManual && stage === "field";
  const chemistryEdges = chemistryPairEdges(chemistryPlayersFromRoster(roster), data.squadSynergy, data.teammates);
  const phs = heroStatsForAssignment(data);
  const displayPhs = heroStatsForDisplay(data);
  const heroRows = heroSynergyRows(roster, score.assignment, phs, displayPhs);
  const chemistryRows = squadChemistryRows(roster, data.squadSynergy, data.teammates);
  const assignmentByPlayer = score.assignment.byPlayer;
  const synergyTier = heroSynergyTier(score.heroSynergy);
  const synergySublabel = synergyTier === "insane" ? t("draft.synergyInsane") : synergyTier === "great" ? t("draft.synergyGreat") : undefined;

  const handleSwapTap = (accountId: number) => {
    if (!canSwap) return;
    if (swapSelectedId == null) { setSwapSelectedId(accountId); return; }
    if (swapSelectedId === accountId) { setSwapSelectedId(null); return; }
    swapHeroes(swapSelectedId, accountId);
    setSwapSelectedId(null);
  };
  const swapHint = canSwap
    ? swapSelectedId == null
      ? t("draft.swapHeroesHint")
      : t("draft.swapHeroesSelected", { nickname: roster.find((s) => s.candidate?.player.accountId === swapSelectedId)?.candidate?.player.nickname ?? "" })
    : null;

  const playing = revealTotal > 0 && !done;

  return (
    <main className="run" data-testid="run-screen">
      {/* Постоянная тим-панель: пентагон + разбор + ростер (как левая колонка 322-0). */}
      <div className="result__grid run__team">
        <Surface className="result__radar">
          <Pentagon
            roster={roster}
            teamOvr={score.teamOvr}
            chemistryEdges={chemistryEdges}
            assignmentByPlayer={assignmentByPlayer}
            swapMode={canSwap}
            swapSelectedId={swapSelectedId}
            onSwapTap={canSwap ? handleSwapTap : undefined}
            onSelectPlayer={canSwap ? undefined : setInspectedPlayer}
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
          {canSwap && (
            <>
              <HeroAllocation roster={roster} assignmentByPlayer={assignmentByPlayer} swapSelectedId={swapSelectedId} onSelect={handleSwapTap} />
              {swapHint && <p className="result__swap-hint muted">{swapHint}</p>}
            </>
          )}
        </Surface>

        <Surface className="result__report run__field">
          <header className="run__field-head">
            <div>
              <Eyebrow>{t("tournament.eyebrow")}</Eyebrow>
              <h1><TeamName value={teamName} placeholder={t("team.placeholder")} editLabel={t("team.edit")} onChange={setTeamName} /></h1>
            </div>
            {stage === "field" && <Button variant="leave" onClick={() => setConfirmLeave(true)}>{t("draft.leave")}</Button>}
          </header>
          <div className="tournament__projection">
            <span>{t("tournament.yourProjection")}</span>
            <strong>{t(projectionKey(tournament.projection))}</strong>
          </div>
          <ol className="field-list" data-testid="tournament-stage-field">
            {tournament.field.map((team, index) => (
              <li key={team.id} className={team.isUser ? "is-user" : ""}>
                <span>{index + 1}</span><strong>{team.name}</strong>
                <b className={`field-strength score-tier--${scoreTier(team.strength)}`}>{Math.round(team.strength)}</b>
              </li>
            ))}
          </ol>
          {stage === "field" && (
            <div className="run__field-actions">
              <Button variant="primary" data-testid="tournament-simulate" onClick={advance}>{t("tournament.simulate")}<span>→</span></Button>
              <Button variant="secondary" data-testid="tournament-field-reroll" onClick={rerollField}>↻ {t("tournament.rerollField")}<small>{t("tournament.rerollFieldHint")}</small></Button>
            </div>
          )}
        </Surface>
      </div>

      {/* Симуляция: секции стекаются вниз, «камера» ведёт к активной. */}
      <div className="run__sim">
        {stage !== "field" && (
          <div className="tournament__groups" data-testid="tournament-stage-groups" ref={groupsRef}>
            {tournament.groups.map((group) => (
              <Surface key={group.id} className="group-table">
                <h2>Group {group.id}</h2>
                <div className="table-head"><span>#</span><span>{t("tournament.team")}</span><span>{t("tournament.record")}</span><span>{t("tournament.route")}</span></div>
                <div className="table-body">
                  {liveStandings(group, tournament.groupMatches, revealedGroupMatches, groupsDone).map((row) => {
                    const routed = stage === "playoffs" || groupRoutesRevealed;
                    return (
                    <div
                      key={row.team.id}
                      className={`table-row ${row.team.isUser ? "is-user" : ""} ${routed ? `is-routed route--${row.route}` : ""}`.trim()}
                      style={{ ["--route-i" as string]: row.rank - 1 } as React.CSSProperties}
                    >
                      <span>{row.rank}</span><span><strong>{row.team.name}</strong><small>{row.team.eventLabel || "\u00A0"}</small></span>
                      <span>{row.wins}–{row.losses}</span><span className={routed ? `route-tag route-tag--${row.route}` : ""}>{groupsDone ? t(`tournament.${row.route}` as MessageKey) : "·"}</span>
                    </div>
                    );
                  })}
                </div>
              </Surface>
            ))}
            <Surface className="group-results">
              <h3 className="bracket__side-title">{t("tournament.results")}</h3>
              <div className="group-results__list" ref={groupResultsRef}>
                {revealedGroupMatches.map((match) => (
                  <div key={match.id} className={`group-result ${match.teamA.isUser || match.teamB.isUser ? "is-user" : ""}`}>
                    <span className="group-result__tag">{match.group}</span>
                    <span className={`group-result__team is-a ${match.teamA.isUser ? "is-user" : ""} ${match.scoreA > match.scoreB ? "is-win" : match.scoreA < match.scoreB ? "is-loss" : ""}`.trim()}>{match.teamA.name}</span>
                    <b className="group-result__score">{match.scoreA}–{match.scoreB}</b>
                    <span className={`group-result__team is-b ${match.teamB.isUser ? "is-user" : ""} ${match.scoreB > match.scoreA ? "is-win" : match.scoreB < match.scoreA ? "is-loss" : ""}`.trim()}>{match.teamB.name}</span>
                  </div>
                ))}
              </div>
            </Surface>
          </div>
        )}

        {stage === "playoffs" && (
          <div data-testid="tournament-stage-playoffs" ref={playoffsRef}>
            <div className="bracket">
              <section className="bracket__side">
                <h3 className="bracket__side-title">{t("tournament.upperBracket")}</h3>
                <div className="bracket-grid bracket-grid--upper">
                  {tournament.playoffRounds.filter((round) => round.id.startsWith("ub")).map((round, index) => renderRound(round, tournament, playoffFeeders, playoffSimTicks, n, done, [1, 3, 5][index]))}
                  <div className="bracket-col bracket-col--gf bracket-col--slot-6">
                    <h4 className="bracket-col__title bracket-col__title--gf">{t("tournament.grandFinalShort")}</h4>
                    <div className="bracket-col__matches">
                      {renderSeriesMatch(tournament.grandFinal, tournament, playoffFeeders, playoffSimTicks, n, done, "match--gf")}
                    </div>
                  </div>
                </div>
              </section>
              <section className="bracket__side">
                <h3 className="bracket__side-title">{t("tournament.lowerBracket")}</h3>
                <div className="bracket-grid bracket-grid--lower">{tournament.playoffRounds.filter((round) => round.id.startsWith("lb")).map((round, index) => renderRound(round, tournament, playoffFeeders, playoffSimTicks, n, done, index + 1))}</div>
              </section>
            </div>
          </div>
        )}

        {playoffsDone && (
          <div ref={resultRef}>
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
            <div className="tournament__report">
              <Surface className="final-table">
                <h3 className="bracket__side-title">{t("tournament.finalStandings")}</h3>
                {tournament.standings.map((row) => (
                  <div key={row.team.id} className={row.team.isUser ? "is-user" : ""}>
                    <span>{t(placementKey(row.placement))}</span><strong>{row.team.name}</strong><b className={`score-tier--${scoreTier(row.team.strength)}`}>{Math.round(row.team.strength)}</b>
                  </div>
                ))}
              </Surface>
              <Surface className="run-summary">
                <h3 className="bracket__side-title">{t("tournament.yourRun")}</h3>
                <div className="run-summary__scores">
                  <StatTile label={t("common.base")} value={Math.round(score.base).toString()} kind="base" />
                  <StatTile label={t("common.heroSynergy")} value={fmt(score.heroSynergy)} kind="synergy" />
                  <StatTile label={t("common.chemistry")} value={fmt(score.chemistry)} kind="chemistry" />
                  <StatTile label={t("common.teamOvr")} value={Math.round(score.teamOvr).toString()} kind="base" />
                </div>
                <ul className="run-summary__roster">
                  {roster.map((slot, index) => {
                    const player = slot.candidate?.player;
                    const heroId = player ? score.assignment.byPlayer[player.accountId] : undefined;
                    const info = heroId != null ? hero(heroId) : null;
                    const eventName = slot.candidate ? (eventNameById.get(slot.candidate.eventId) ?? slot.candidate.eventId) : undefined;
                    const ovr = player?.ovr ?? 0;
                    return (
                      <li key={index}>
                        <RoleTag role={slot.role}>{t(roleMessageKey(slot.role))}</RoleTag>
                        <div className="run-summary__player">
                          <strong>{player?.nickname ?? "—"}</strong>
                          <small>
                            {eventName
                              ? `${locale.startsWith("ru") ? "из " : "from "}${eventName}`
                              : "—"}
                          </small>
                        </div>
                        <b className={`run-summary__ovr score-tier--${scoreTier(ovr)}`}>{Math.round(ovr)}</b>
                        {info && (
                          <span className="run-summary__heroCard">
                            <HeroThumb picture={info.picture} name={info.name} layout="card" showName />
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Surface>
            </div>
            <CareerPanel />
          </div>
        )}

        <div className="tournament__actions">
          {playing ? (
            <div className="tournament__live">
              <span className="tournament__live-dot">{t("tournament.live")}</span>
              <em>{t(stage === "groups" ? "tournament.playingGroups" : "tournament.playingPlayoffs")}</em>
              <Button variant="leave" data-testid="tournament-skip" onClick={skip}>{t("tournament.skip")}</Button>
            </div>
          ) : playoffsDone ? (
            <div className="tournament__restart" data-testid="tournament-complete">
              <Button variant="primary" data-testid="tournament-restart" onClick={restartSameConfig}>{t("tournament.restartSame")}<span>↻</span></Button>
              <Button variant="secondary" onClick={reset}>{t("tournament.restartChange")}</Button>
            </div>
          ) : null}
        </div>
      </div>

      {confirmLeave && (
        <Modal mark="A" title={t("tournament.leaveTitle")} description={t("tournament.leaveText")} labelledBy="tournament-leave-title" onClose={() => setConfirmLeave(false)}>
          <Button variant="primaryInvert" onClick={() => setConfirmLeave(false)}>{t("tournament.leaveCancel")}</Button>
          <Button variant="danger" onClick={reset}>{t("tournament.leaveConfirm")}</Button>
        </Modal>
      )}
      {inspectedPlayer && (
        <PlayerInspector candidate={inspectedPlayer} data={data} onClose={() => setInspectedPlayer(null)} />
      )}
    </main>
  );
}
