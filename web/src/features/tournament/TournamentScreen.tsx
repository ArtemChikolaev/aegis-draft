import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  userPlayoffCameraTarget,
} from "../../game/tournamentPlayback.ts";
import { isNarrowViewport } from "../../design/breakpoints.ts";
import { useRun } from "../../state/runStore.ts";
import { Button, Eyebrow, HeroThumb, Modal, motionMs, playerOvrTier, prefersReducedMotion, RoleTag, StatTile, Surface, TeamName, TeamSigil } from "../../ui/index.ts";
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
import { summandModifiers } from "../../game/anteEconomy.ts";
import { useHero } from "../draft/heroes.ts";
import type { Candidate } from "../../game/packs.ts";
import { CareerPanel } from "./CareerPanel.tsx";
import { ShareRunButton } from "./ShareRunButton.tsx";
import { BracketConnectors } from "./BracketConnectors.tsx";
import { LOWER_BRACKET_EDGES, UPPER_BRACKET_EDGES } from "./bracketConnectors.ts";
import "../result/result.css";
import "./tournament.css";

const fmt = (value: number) => (value >= 0 ? `+${value.toFixed(1)}` : value.toFixed(1));
const projectionKey = (key: ProjectionKey) => `tournament.projection.${key}` as MessageKey;
const placementKey = (key: PlacementKey) => `tournament.place.${key}` as MessageKey;

// Тир силы команды для цветового градиента (зелёный→красный, токены --tier-*).
const scoreTier = (score: number): "elite" | "strong" | "mid" | "low" | "weak" =>
  score >= 90 ? "elite" : score >= 86 ? "strong" : score >= 82 ? "mid" : score >= 78 ? "low" : "weak";

// Группы: один тик = весь матч (финальный счёт сразу). Плей-офф: тик = одна карта серии.
const GROUP_MATCH_STEP_MS = 95;
const PLAYOFF_MAP_STEP_MS = 200;
// Число команд в группе — им же меряется каскад «наполнения» перед стартом матчей.
const GROUP_TEAM_ROWS = 9;
// Фаза распределения после групп (замер 322-0, бандл index-BCFh8CR5.js, фаза `quali`):
// подпись маршрута + построчная раскраска 140мс, пауза 1100мс между маршрутами.
const ROUTE_STEP_MS = 140;
const ROUTE_HOLD_MS = 1100;
const ROUTE_LEAD_MS = 600;
// Порядок маршрутов = порядок, в котором команды узнают свою судьбу: вверх → вниз → вылет.
const ROUTE_ORDER = ["upper", "lower", "out"] as const;
type RouteKey = (typeof ROUTE_ORDER)[number];

// Презентационный прогрессивный reveal: движок уже посчитал весь результат детерминированно,
// а здесь мы лишь «проигрываем» его по одному элементу с возможностью Skip. Сбрасывается при
// смене стадии (resetKey). Состояние эфемерное — в persist забега не попадает (при resume
// стадия открывается сразу, а reveal доиграется/скипнется заново).
function useReveal(total: number, resetKey: unknown, stepMs: number, startDelayMs = 0) {
  const [n, setN] = useState(0);
  const timer = useRef<number | null>(null);
  const startTimer = useRef<number | null>(null);
  const resetKeyRef = useRef(resetKey);
  const keyChanged = resetKeyRef.current !== resetKey;
  if (keyChanged) resetKeyRef.current = resetKey;

  const stop = useCallback(() => {
    if (startTimer.current != null) { window.clearTimeout(startTimer.current); startTimer.current = null; }
    if (timer.current == null) return;
    window.clearInterval(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => {
    stop();
    setN(0);
    if (total <= 0) return;
    let current = 0;
    const begin = () => {
      timer.current = window.setInterval(() => {
        current += 1;
        setN(current);
        if (current >= total) stop();
      }, stepMs);
    };
    // Стадия сперва «наполняется» (каскад строк въезжает), и лишь потом идёт живой reveal
    // матчей: иначе пересортировка стоящих таблиц дерётся с входной анимацией строк и они
    // моргают. reduced-motion → без задержки (входной анимации всё равно нет).
    if (startDelayMs > 0 && !prefersReducedMotion()) {
      startTimer.current = window.setTimeout(begin, startDelayMs);
    } else {
      begin();
    }
    return stop;
  }, [resetKey, stepMs, stop, total, startDelayMs]);
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

// Строка команды в серии: знак + имя + счёт; win зелёный / loss коралл.
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
      {!empty && <TeamSigil monogram={team.sigil.monogram} color={team.sigil.color} />}
      <em className="series__name">{empty ? "·" : team.name}</em>
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
  const winnerSlot = finished
    ? series.winnerId === series.teamA.id ? "0" : "1"
    : undefined;
  return (
    <div
      key={series.id}
      data-series-id={series.id}
      data-winner-slot={winnerSlot}
      className={`match ${extraClass} ${hasUser ? "has-user" : ""} ${live ? "is-live" : ""} ${started ? "" : "is-pending"} ${slotsVisible ? "" : "is-locked"} ${finished ? "is-finished" : ""}`.trim()}
    >
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
    <div key={round.id} className={`bracket-col bracket-col--slot-${slot} enter-fade`} style={{ ["--enter-i" as string]: slot } as React.CSSProperties}>
      <h4 className="bracket-col__title">{round.label}</h4>
      <div className="bracket-col__matches">
        {round.series.map((series) => renderSeriesMatch(series, tournament, feeders, ticks, step, revealComplete))}
      </div>
    </div>
  );
}

export function TournamentScreen() {
  const tournament = useRun((state) => state.tournament);
  const ante = useRun((state) => state.ante);
  const selectedMode = useRun((state) => state.selectedMode);
  const enterCamp = useRun((state) => state.enterCamp);
  const advance = useRun((state) => state.advanceTournament);
  const finishTournament = useRun((state) => state.finishTournament);
  const rerollField = useRun((state) => state.rerollField);
  const reset = useRun((state) => state.reset);
  const restartSameConfig = useRun((state) => state.restartSameConfig);
  const snapshot = useRun((state) => state.snapshot);
  const economyView = useRun((state) => state.economyView);
  const tactics = useRun((state) => state.tactics);
  const config = useRun((state) => state.config);
  const data = useRun((state) => state.data);
  const teamName = useRun((state) => state.teamName);
  const setTeamName = useRun((state) => state.setTeamName);
  const swapHeroes = useRun((state) => state.swapHeroes);
  const hero = useHero();
  const { locale, t } = useI18n();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [inspectedPlayer, setInspectedPlayer] = useState<Candidate | null>(null);
  // Хардкор: профили закрыты, поле соперников не перевыбрать (см. game/packs RunConfig).
  const hardMode = config?.hardMode === true;
  const [swapSelectedId, setSwapSelectedId] = useState<number | null>(null);

  // «Камера»: авто-скролл к активной секции при смене стадии.
  const groupsRef = useRef<HTMLDivElement | null>(null);
  const groupResultsRef = useRef<HTMLDivElement | null>(null);
  const playoffsRef = useRef<HTMLDivElement | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const upperGridRef = useRef<HTMLDivElement | null>(null);
  const lowerGridRef = useRef<HTMLDivElement | null>(null);

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
  // Группы: держим матчи, пока строки-команды не «въехали» + пауза, чтобы группа «вдохнула»
  // перед играми (наполнилась → замерла → пошли матчи). См. useReveal.
  const groupFillMs = useMemo(
    () => motionMs("--motion-enter", 360) + (GROUP_TEAM_ROWS - 1) * motionMs("--motion-enter-stagger", 45) + 450,
    [],
  );
  const { n, done, skip } = useReveal(revealTotal, stage, stepMs, stage === "groups" ? groupFillMs : 0);

  // Серии, уже доигранные на текущем шаге — от них рисуем коннектор к следующему слоту.
  const finishedSeriesIds = useMemo(() => {
    const ids = new Set<string>();
    if (!tournament || stage !== "playoffs") return ids;
    for (const round of tournament.playoffRounds) {
      for (const series of round.series) {
        if (done || seriesFinished(series, playoffSimTicks, n)) ids.add(series.id);
      }
    }
    if (done || seriesFinished(tournament.grandFinal, playoffSimTicks, n)) ids.add(tournament.grandFinal.id);
    return ids;
  }, [done, n, playoffSimTicks, stage, tournament]);

  // Зелёный коннектор вперёд — только если юзер выиграл серию-источник.
  // Участие без победы (дроп в LB) не должно красить winner-edge.
  const accentSeriesIds = useMemo(() => {
    const ids = new Set<string>();
    if (!tournament) return ids;
    const addIfUserWon = (series: SeriesResult) => {
      if (series.teamA.isUser && series.winnerId === series.teamA.id) ids.add(series.id);
      else if (series.teamB.isUser && series.winnerId === series.teamB.id) ids.add(series.id);
    };
    for (const round of tournament.playoffRounds) {
      for (const series of round.series) addIfUserWon(series);
    }
    addIfUserWon(tournament.grandFinal);
    return ids;
  }, [tournament]);

  // После доигранных групп — фаза распределения (как `quali` в 322-0): маршрут за маршрутом
  // объявляется подписью, и под неё построчно закрашиваются ровно те команды, которых она
  // касается. Красить всё разом нельзя: тогда подпись не к чему привязать, и игрок не видит,
  // КТО именно поехал вниз — а это единственный момент, где решается судьба его команды.
  // reduced-motion → всё сразу, без задержек. field→groups запускает пользователь кнопкой.
  const [routedTeams, setRoutedTeams] = useState<ReadonlySet<string>>(() => new Set());
  const [routeCaption, setRouteCaption] = useState<RouteKey | null>(null);
  // Команды по маршрутам в порядке объявления: сначала все группы по местам вверх, потом вниз.
  const routeQueue = useMemo(() => {
    const byRoute = new Map<RouteKey, string[]>(ROUTE_ORDER.map((r) => [r, []]));
    for (const group of tournament?.groups ?? []) {
      for (const row of [...group.standings].sort((a, b) => a.rank - b.rank)) {
        byRoute.get(row.route as RouteKey)?.push(row.team.id);
      }
    }
    return byRoute;
  }, [tournament?.groups]);
  useEffect(() => { setRoutedTeams(new Set()); setRouteCaption(null); }, [stage]);
  useEffect(() => {
    if (stage !== "groups" || !done) return;
    const revealAll = () => {
      setRoutedTeams(new Set([...routeQueue.values()].flat()));
      setRouteCaption(null);
    };
    if (prefersReducedMotion()) {
      revealAll();
      if (tournament?.canAdvance) advance();
      return;
    }
    let cancelled = false;
    const timers: number[] = [];
    const wait = (ms: number) =>
      new Promise<void>((resolve) => { timers.push(window.setTimeout(resolve, ms)); });
    void (async () => {
      await wait(ROUTE_LEAD_MS);
      for (const route of ROUTE_ORDER) {
        const ids = routeQueue.get(route) ?? [];
        if (ids.length === 0) continue;
        if (cancelled) return;
        setRouteCaption(route);
        for (const id of ids) {
          await wait(ROUTE_STEP_MS);
          if (cancelled) return;
          setRoutedTeams((prev) => new Set(prev).add(id));
        }
        await wait(ROUTE_HOLD_MS);
        if (cancelled) return;
      }
      setRouteCaption(null);
      if (tournament?.canAdvance) advance();
    })();
    return () => {
      cancelled = true;
      for (const t of timers) window.clearTimeout(t);
    };
  }, [stage, done, tournament?.canAdvance, advance, routeQueue]);

  // «Камера» ведёт к активной секции / матчу. reduced-motion → без плавной анимации.
  const scrollTo = useCallback((el: HTMLElement | null, block: ScrollLogicalPosition = "start") => {
    if (!el) return;
    if (prefersReducedMotion()) { el.scrollIntoView({ block }); return; }
    // Плавно на реальных браузерах; в webview/TMA, где smooth scrollIntoView — no-op,
    // мгновенный фолбэк (срабатывает, только если скролл вообще не сдвинулся — анимацию не рубит).
    const startY = window.scrollY;
    el.scrollIntoView({ behavior: "smooth", block });
    window.setTimeout(() => {
      if (window.scrollY === startY && Math.abs(el.getBoundingClientRect().top) > 120) {
        el.scrollIntoView({ block });
      }
    }, 250);
  }, []);
  // Группы: сразу к таблице со своей командой (A или B), не всегда к первой.
  useEffect(() => {
    if (stage !== "groups") return;
    const userGroup = groupsRef.current?.querySelector<HTMLElement>("[data-user-group]");
    scrollTo(userGroup ?? groupsRef.current);
  }, [stage, scrollTo]);
  // Плей-офф: камера на текущий матч юзера (UB → LB при дропе → GF при выходе в финал).
  const playoffCameraId = useMemo(() => {
    if (!tournament || stage !== "playoffs") return null;
    return userPlayoffCameraTarget(tournament, playoffFeeders, playoffSimTicks, n, done);
  }, [done, n, playoffFeeders, playoffSimTicks, stage, tournament]);
  // На широком сетка видна целиком — ставим её один раз и больше не дёргаем: слежение
  // за серией там только мешает (экран прыгает, хотя нужный матч и так на виду).
  useEffect(() => {
    if (stage !== "playoffs" || done || isNarrowViewport()) return;
    scrollTo(playoffsRef.current, "start");
  }, [done, scrollTo, stage]);
  // На узком колонки не влезают — ведём камеру за текущей серией юзера.
  useEffect(() => {
    if (stage !== "playoffs" || !playoffCameraId || done || !isNarrowViewport()) return;
    const match = playoffsRef.current?.querySelector<HTMLElement>(`[data-series-id="${playoffCameraId}"]`);
    scrollTo(match ?? playoffsRef.current, match ? "center" : "start");
  }, [done, playoffCameraId, scrollTo, stage]);
  // Драфт завершается на прокрученной вниз странице, а run-вид наследует scrollY (был ~1400px)
  // и открывается где-то в середине — визуально «прыжок». На входе в run (стадия field) ставим
  // верх ДО отрисовки (useLayoutEffect, без мигания кадра): экран открывается с пентагона.
  useLayoutEffect(() => {
    if (stage === "field") window.scrollTo(0, 0);
  }, [stage]);
  const playoffsDone = stage === "playoffs" && done;
  useEffect(() => {
    if (!playoffsDone) return;
    finishTournament();
    scrollTo(resultRef.current);
  }, [playoffsDone, finishTournament, scrollTo]);

  const revealedGroupMatches = stage === "groups" ? orderedGroupMatches.slice(0, n) : orderedGroupMatches;
  const groupsDone = stage === "playoffs" || (stage === "groups" && done);
  // Входной каскад строк — ТОЛЬКО пока группа наполняется (матчи ещё не пошли, n === 0).
  // Как только начинаются игры, строки пересортировываются, и оставленная на них
  // opacity-анимация подхватывается при переезде строки → моргание. Снимаем .enter —
  // пересортировка снова мгновенная, без мигания (как было до анимаций).
  const groupFillPhase = stage === "groups" && n === 0;
  // Лента результатов не скроллится с обрезанной строкой сверху, а показывает столько
  // ПОСЛЕДНИХ матчей, сколько влезает ЦЕЛИКОМ: панель фиксированной высоты, а строка не
  // делится на неё нацело (471/30 ≈ 15.7) — иначе верхняя пара вечно срезана.
  const [resultsCapacity, setResultsCapacity] = useState(0);
  useEffect(() => {
    const list = groupResultsRef.current;
    if (!list) return;
    const measure = () => {
      const rows = list.querySelectorAll<HTMLElement>(".group-result");
      const stride = rows.length >= 2
        ? rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().top
        : 30; // min-height 28 + gap 2 — фолбэк, пока строк нет
      if (list.clientHeight > 0 && stride > 0) setResultsCapacity(Math.max(1, Math.floor(list.clientHeight / stride)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => ro.disconnect();
  }, [stage]);
  const shownGroupResults = resultsCapacity > 0 ? revealedGroupMatches.slice(-resultsCapacity) : revealedGroupMatches;

  const eventNameById = useMemo(
    () => new Map((data?.events ?? []).map((e) => [e.id, e.short ?? e.name])),
    [data?.events],
  );

  if (!tournament || !snapshot?.score || !config || !data) return null;

  const { roster, score } = snapshot;
  // Эффективные слагаемые обязаны совпадать с силой, ушедшей в поле этапа (иначе радар и таблица
  // разъедутся): покупки + временные Camp Actions (economy) + условные Tactics.
  const economyModifiers = summandModifiers([
    ...(economyView?.applied ?? []),
    ...(economyView?.temporary ?? []).map((t) => t.effect),
  ]);
  const tacticModifiers = tactics?.modifiers ?? { base: 0, heroSynergy: 0, chemistry: 0 };
  const effectiveScore = {
    base: score.base + economyModifiers.base + tacticModifiers.base,
    heroSynergy: score.heroSynergy + economyModifiers.heroSynergy + tacticModifiers.heroSynergy,
    chemistry: score.chemistry + economyModifiers.chemistry + tacticModifiers.chemistry,
    teamOvr: score.teamOvr
      + economyModifiers.base + economyModifiers.heroSynergy + economyModifiers.chemistry
      + tacticModifiers.base + tacticModifiers.heroSynergy + tacticModifiers.chemistry,
  };
  const isManual = config.allocation === "manual";
  const canSwap = isManual && stage === "field";
  const chemistryEdges = chemistryPairEdges(chemistryPlayersFromRoster(roster), data.squadSynergy, data.teammates);
  const phs = heroStatsForAssignment(data);
  const displayPhs = heroStatsForDisplay(data);
  const heroRows = heroSynergyRows(roster, score.assignment, phs, displayPhs);
  const chemistryRows = squadChemistryRows(roster, data.squadSynergy, data.teammates);
  const assignmentByPlayer = score.assignment.byPlayer;
  const synergyTier = heroSynergyTier(effectiveScore.heroSynergy);
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
  // Порог топ-1 читается как «выиграть финал», а не «топ-1».
  const anteTargetLabel = ante ? (ante.target <= 1 ? t("ante.targetWin") : t("ante.target", { rank: ante.target })) : "";
  const anteNextLabel = ante ? (ante.target <= 1 ? t("ante.nextTargetWin") : t("ante.nextTargetTop", { rank: ante.target })) : "";

  return (
    <main className="run" data-testid="run-screen">
      {/* Постоянная тим-панель: пентагон + разбор + ростер (как левая колонка 322-0). */}
      <div className="result__grid run__team enter">
        <Surface className="result__radar on-invert-surface">
          <span className="result__radar-glow" aria-hidden="true" />
          <Pentagon
            roster={roster}
            teamOvr={effectiveScore.teamOvr}
            chemistryEdges={chemistryEdges}
            assignmentByPlayer={assignmentByPlayer}
            swapMode={canSwap}
            swapSelectedId={swapSelectedId}
            onSwapTap={canSwap ? handleSwapTap : undefined}
            onSelectPlayer={canSwap || hardMode ? undefined : setInspectedPlayer}
          />
          <div className="score-strip">
            <StatTile label={t("common.base")} value={Math.round(effectiveScore.base).toString()} kind="base" />
            <StatTile label={t("common.heroSynergy")} value={fmt(effectiveScore.heroSynergy)} kind="synergy" sublabel={synergySublabel} />
            <StatTile label={t("common.chemistry")} value={fmt(effectiveScore.chemistry)} kind="chemistry" />
          </div>
          <SynergyBreakdown
            heroRows={heroRows}
            chemistryRows={chemistryRows}
            onPlayerClick={(accountId) => {
              const candidate = roster.find((slot) => slot.candidate?.player.accountId === accountId)?.candidate;
              if (candidate && !hardMode) setInspectedPlayer(candidate);
            }}
          />
          {canSwap && (
            <>
              <HeroAllocation roster={roster} assignmentByPlayer={assignmentByPlayer} swapSelectedId={swapSelectedId} onSelect={handleSwapTap} />
              {swapHint && <p className="result__swap-hint muted">{swapHint}</p>}
            </>
          )}
        </Surface>

        <Surface className="result__report run__field enter-fade" style={{ ["--enter-i" as string]: 1 } as React.CSSProperties}>
          <header className="run__field-head">
            <div>
              <Eyebrow>{t("tournament.eyebrow")}</Eyebrow>
              <h1><TeamName value={teamName} placeholder={t("team.placeholder")} editLabel={t("team.edit")} onChange={setTeamName} /></h1>
            </div>
            {stage === "field" && <Button variant="leave" onClick={() => setConfirmLeave(true)}>{t("draft.leave")}</Button>}
          </header>
          {ante && (
            <div className="ante-status" data-testid="ante-status">
              <span className="ante-status__stage">{t("ante.stage", { n: ante.index + 1, count: ante.count })}</span>
              <strong className="ante-status__target">{anteTargetLabel}</strong>
              {ante.index > 0 && <em className="ante-status__field">↑ {t("ante.fieldStronger")}</em>}
            </div>
          )}
          <div className="tournament__projection enter" style={{ ["--enter-i" as string]: 3 } as React.CSSProperties}>
            <span>{t("tournament.yourProjection")}</span>
            <strong>{t(projectionKey(tournament.projection))}</strong>
          </div>
          <ol className="field-list" data-testid="tournament-stage-field">
            {tournament.field.map((team, index) => (
              <li key={team.id} className={`enter ${team.isUser ? "is-user" : ""}`.trim()} style={{ ["--enter-i" as string]: index } as React.CSSProperties}>
                <span>{index + 1}</span>
                <TeamSigil monogram={team.sigil.monogram} color={team.sigil.color} />
                <strong>{team.name}</strong>
                <b
                  className={`field-strength score-tier--${scoreTier(team.strength)}`}
                  data-testid={team.isUser ? "tournament-user-strength" : undefined}
                >
                  {Math.round(team.strength)}
                </b>
              </li>
            ))}
          </ol>
          {stage === "field" && (
            <div className="run__field-actions">
              <Button variant="primary" data-testid="tournament-simulate" onClick={advance}>{t("tournament.simulate")}<span>→</span></Button>
              {!hardMode && !ante && (
                <Button variant="secondary" data-testid="tournament-field-reroll" onClick={rerollField}>↻ {t("tournament.rerollField")}<small>{t("tournament.rerollFieldHint")}</small></Button>
              )}
            </div>
          )}
        </Surface>
      </div>

      {/* Симуляция: секции стекаются вниз, «камера» ведёт к активной. */}
      <div className="run__sim">
        {stage !== "field" && (
          <div className="tournament__groups" data-testid="tournament-stage-groups" ref={groupsRef}>
            {tournament.groups.map((group, gi) => (
              <Surface
                key={group.id}
                className="group-table enter"
                style={{ ["--enter-i" as string]: gi } as React.CSSProperties}
                {...(group.standings.some((row) => row.team.isUser) ? { "data-user-group": group.id } : {})}
              >
                <h2>Group {group.id}</h2>
                <div className="table-head"><span>#</span><span aria-hidden="true" /><span>{t("tournament.team")}</span><span>{t("tournament.record")}</span><span>{t("tournament.route")}</span></div>
                <div className="table-body">
                  {liveStandings(group, tournament.groupMatches, revealedGroupMatches, groupsDone).map((row) => {
                    const routed = stage === "playoffs" || routedTeams.has(row.team.id);
                    return (
                    <div
                      key={row.team.id}
                      className={`table-row ${groupFillPhase ? "enter" : ""} ${row.team.isUser ? "is-user" : ""} ${routed ? `is-routed route--${row.route}` : ""}`.replace(/\s+/g, " ").trim()}
                      style={{ ["--enter-i" as string]: row.rank - 1 } as React.CSSProperties}
                    >
                      <span>{row.rank}</span>
                      <TeamSigil monogram={row.team.sigil.monogram} color={row.team.sigil.color} />
                      {/* \u041F\u043E\u0434\u0441\u0442\u0440\u043E\u043A\u0430 \u0441\u043E\u0431\u044B\u0442\u0438\u044F \u2014 \u0442\u043E\u043B\u044C\u043A\u043E \u043A\u043E\u0433\u0434\u0430 \u043E\u043D\u0430 \u0435\u0441\u0442\u044C: \u043F\u0443\u0441\u0442\u043E\u0439 <small> \u0441 nbsp \u0441\u044A\u0435\u0434\u0430\u043B 12px
                          \u0432\u044B\u0441\u043E\u0442\u044B \u0432 \u043A\u0430\u0436\u0434\u043E\u0439 \u0438\u0437 18 \u0441\u0442\u0440\u043E\u043A \u0438 \u0443\u0436\u0438\u043C\u0430\u043B \u0438\u043C\u044F \u0434\u043E \u00ABCursed Dra\u2026\u00BB. */}
                      <span className="table-row__team"><strong>{row.team.name}</strong>{row.team.eventLabel ? <small>{row.team.eventLabel}</small> : null}</span>
                      <span>{row.wins}–{row.losses}</span><span className={routed ? `route-tag route-tag--${row.route}` : ""}>{routed ? t(`tournament.${row.route}` as MessageKey) : "·"}</span>
                    </div>
                    );
                  })}
                </div>
              </Surface>
            ))}
            <Surface className="group-results enter" style={{ ["--enter-i" as string]: 2 } as React.CSSProperties}>
              <h3 className="bracket__side-title">{t("tournament.results")}</h3>
              <div className="group-results__list" ref={groupResultsRef}>
                {shownGroupResults.map((match) => (
                  <div key={match.id} className={`group-result enter-fade ${match.teamA.isUser || match.teamB.isUser ? "is-user" : ""}`.trim()}>
                    <span className="group-result__tag">{match.group}</span>
                    <span className={`group-result__team is-a ${match.teamA.isUser ? "is-user" : ""} ${match.scoreA > match.scoreB ? "is-win" : match.scoreA < match.scoreB ? "is-loss" : ""}`.trim()}>
                      <span className="group-result__name">{match.teamA.name}</span>
                      <TeamSigil monogram={match.teamA.sigil.monogram} color={match.teamA.sigil.color} />
                    </span>
                    <b className="group-result__score">{match.scoreA}–{match.scoreB}</b>
                    <span className={`group-result__team is-b ${match.teamB.isUser ? "is-user" : ""} ${match.scoreB > match.scoreA ? "is-win" : match.scoreB < match.scoreA ? "is-loss" : ""}`.trim()}>
                      <TeamSigil monogram={match.teamB.sigil.monogram} color={match.teamB.sigil.color} />
                      <span className="group-result__name">{match.teamB.name}</span>
                    </span>
                  </div>
                ))}
              </div>
            </Surface>
            {/* Подпись фазы распределения: живёт ровно столько, сколько красятся её строки. */}
            {routeCaption && (
              <p className={`route-caption route-caption--${routeCaption}`} role="status">
                {t(`tournament.routeCaption.${routeCaption}` as MessageKey)}
              </p>
            )}
          </div>
        )}

        {stage === "playoffs" && (
          <div data-testid="tournament-stage-playoffs" ref={playoffsRef}>
            <div className="bracket">
              <section className="bracket__side">
                <h3 className="bracket__side-title">{t("tournament.upperBracket")}</h3>
                <div className="bracket-grid bracket-grid--upper" ref={upperGridRef}>
                  <BracketConnectors
                    gridRef={upperGridRef}
                    edges={UPPER_BRACKET_EDGES}
                    finishedIds={finishedSeriesIds}
                    accentFromIds={accentSeriesIds}
                  />
                  {tournament.playoffRounds.filter((round) => round.id.startsWith("ub")).map((round, index) => renderRound(round, tournament, playoffFeeders, playoffSimTicks, n, done, [1, 3, 5][index]))}
                  <div className="bracket-col bracket-col--gf bracket-col--slot-6 enter-fade" style={{ ["--enter-i" as string]: 6 } as React.CSSProperties}>
                    <h4 className="bracket-col__title bracket-col__title--gf">{t("tournament.grandFinalShort")}</h4>
                    <div className="bracket-col__matches">
                      {renderSeriesMatch(tournament.grandFinal, tournament, playoffFeeders, playoffSimTicks, n, done, "match--gf")}
                    </div>
                  </div>
                </div>
              </section>
              <section className="bracket__side">
                <h3 className="bracket__side-title">{t("tournament.lowerBracket")}</h3>
                <div className="bracket-grid bracket-grid--lower" ref={lowerGridRef}>
                  <BracketConnectors
                    gridRef={lowerGridRef}
                    edges={LOWER_BRACKET_EDGES}
                    finishedIds={finishedSeriesIds}
                    accentFromIds={accentSeriesIds}
                  />
                  {tournament.playoffRounds.filter((round) => round.id.startsWith("lb")).map((round, index) => renderRound(round, tournament, playoffFeeders, playoffSimTicks, n, done, index + 1))}
                </div>
              </section>
            </div>
          </div>
        )}

        {playoffsDone && (
          <div ref={resultRef}>
            {ante && (
              <Surface className={`ante-result ante-result--${ante.phase} enter`} data-testid="ante-result">
                <strong>{ante.phase === "won" ? t("ante.won") : ante.phase === "lost" ? t("ante.eliminated") : t("ante.passed")}</strong>
                <span>{ante.phase === "won" ? t("ante.wonText") : ante.phase === "lost" ? t("ante.lostText") : anteNextLabel}</span>
              </Surface>
            )}
            <Surface className="tournament__champion enter">
              <div>
                <span>{t("tournament.yourFinish")}</span>
                <strong className={tournament.champion.isUser ? "is-user" : ""}>{t(placementKey(tournament.userPlacement))}</strong>
              </div>
              <div className="tournament__champion-name">
                <span>{t("tournament.champion")}</span>
                <strong>
                  <TeamSigil monogram={tournament.champion.sigil.monogram} color={tournament.champion.sigil.color} />
                  {tournament.champion.name}
                </strong>
              </div>
            </Surface>
            <div className="tournament__report">
              <Surface className="final-table enter" style={{ ["--enter-i" as string]: 1 } as React.CSSProperties}>
                <h3 className="bracket__side-title">{t("tournament.finalStandings")}</h3>
                {/* 18 мест в две колонки (как в 322-0): одной колонкой панель вдвое выше
                    соседнего «твоего состава» — рядом стоят поля разной высоты. */}
                <div className="final-table__list">
                  {tournament.standings.map((row) => (
                    <div key={row.team.id} className={row.team.isUser ? "is-user" : ""}>
                      <span>{t(placementKey(row.placement))}</span>
                      <TeamSigil monogram={row.team.sigil.monogram} color={row.team.sigil.color} />
                      <strong>{row.team.name}</strong>
                      <b className={`score-tier--${scoreTier(row.team.strength)}`}>{Math.round(row.team.strength)}</b>
                    </div>
                  ))}
                </div>
              </Surface>
              <Surface className="run-summary enter" style={{ ["--enter-i" as string]: 2 } as React.CSSProperties}>
                <h3 className="bracket__side-title">{t("tournament.yourRun")}</h3>
                <div className="run-summary__scores">
                  <StatTile label={t("common.base")} value={Math.round(effectiveScore.base).toString()} kind="base" />
                  <StatTile label={t("common.heroSynergy")} value={fmt(effectiveScore.heroSynergy)} kind="synergy" />
                  <StatTile label={t("common.chemistry")} value={fmt(effectiveScore.chemistry)} kind="chemistry" />
                  <StatTile label={t("common.teamOvr")} value={Math.round(effectiveScore.teamOvr).toString()} kind="base" />
                </div>
                <ul className="run-summary__roster">
                  {roster.map((slot, index) => {
                    const player = slot.candidate?.player;
                    const heroId = player ? score.assignment.byPlayer[player.accountId] : undefined;
                    const info = heroId != null ? hero(heroId) : null;
                    const eventName = slot.candidate ? (eventNameById.get(slot.candidate.eventId) ?? slot.candidate.eventId) : undefined;
                    const ovr = player?.ovr ?? 0;
                    return (
                      <li key={index} className={`card-tint--${playerOvrTier(ovr)}`}>
                        <RoleTag role={slot.role}>{t(roleMessageKey(slot.role))}</RoleTag>
                        <div className="run-summary__player">
                          <strong>{player?.nickname ?? "—"}</strong>
                          <small>
                            {eventName
                              ? `${locale.startsWith("ru") ? "из " : "from "}${eventName}`
                              : "—"}
                          </small>
                        </div>
                        {/* Шкала ИГРОКА (54–99), не командная: scoreTier (78–90) красил
                            две трети ростера в красный — типовой 74 попадал в «weak». */}
                        <b className={`run-summary__ovr ovr-tier--${playerOvrTier(ovr)}`}>{Math.round(ovr)}</b>
                        {/* Портрет без подписи: в строке ростера ширина зажата, и поле под имя
                            усыхало до 34px — «Crystal Maiden» читался как «Cry…». Снятая
                            подпись отдана портрету, он опознаёт героя лучше трёх букв. */}
                        {info && (
                          <span className="run-summary__heroCard">
                            <HeroThumb picture={info.picture} name={info.name} layout="card" showName={false} />
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Surface>
            </div>
            {/* Карьера — итог ВСЕГО забега; между ante-этапами (phase playing) её не показываем. */}
            {(!ante || ante.phase !== "playing") && (
              <div className="enter" style={{ ["--enter-i" as string]: 3 } as React.CSSProperties}>
                <CareerPanel mode={selectedMode ?? "classic"} />
              </div>
            )}
          </div>
        )}

        {/* Контейнер рисуем только когда внутри что-то есть: пустой он всё равно приносил
            свой margin-top и оставлял мёртвый зазор под панелями на стадии field. */}
        {(playing || playoffsDone) && (
        <div className="tournament__actions">
          {playing ? (
            <div className="tournament__live">
              <span className="tournament__live-dot">{t("tournament.live")}</span>
              <em>{t(stage === "groups" ? "tournament.playingGroups" : "tournament.playingPlayoffs")}</em>
              <Button variant="leave" data-testid="tournament-skip" onClick={skip}>{t("tournament.skip")}</Button>
            </div>
          ) : playoffsDone ? (
            ante && ante.phase === "playing" ? (
              <div className="tournament__restart tournament__restart--ante" data-testid="ante-next">
                <Button variant="primary" data-testid="ante-to-camp" onClick={enterCamp}>{t("ante.toCamp")}<span>→</span></Button>
                <Button variant="secondary" onClick={() => setConfirmLeave(true)}>{t("ante.giveUp")}</Button>
              </div>
            ) : (
              <div className="tournament__restart" data-testid="tournament-complete">
                <Button variant="primary" data-testid="tournament-restart" onClick={restartSameConfig}>{t("tournament.restartSame")}<span>↻</span></Button>
                <Button variant="secondary" onClick={reset}>{t("tournament.restartChange")}</Button>
                <ShareRunButton />
              </div>
            )
          ) : null}
        </div>
        )}
      </div>

      {confirmLeave && (
        <Modal mark="A" title={t("tournament.leaveTitle")} description={t("tournament.leaveText")} labelledBy="tournament-leave-title" dismissLabel={t("common.close")} onClose={() => setConfirmLeave(false)}>
          {({ close }) => (
            <>
              <Button variant="primaryInvert" onClick={close}>{t("tournament.leaveCancel")}</Button>
              <Button variant="danger" onClick={reset}>{t("tournament.leaveConfirm")}</Button>
            </>
          )}
        </Modal>
      )}
      {inspectedPlayer && (
        <PlayerInspector candidate={inspectedPlayer} data={data} onClose={() => setInspectedPlayer(null)} />
      )}
    </main>
  );
}
