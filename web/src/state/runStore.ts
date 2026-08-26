// Zustand-адаптер поверх RunEngine (T3.5). Вся логика — в движке; стор лишь хранит
// инстанс и снимок для рендера (граница из CLAUDE.md: game/ не зависит от ui/).
// Персист (game-state-architecture): забег сохраняется как config+seed+лог действий и
// восстанавливается детерминированным replay; имя команды — отдельная durable-настройка.
import { create } from "zustand";
import { RunEngine, type RosterSlot } from "../game/engine.ts";
import { PREP, scoutedTeams, type PrepAction, type PrepPlan, type ScoreOverlay } from "../game/prep.ts";
import { stakesOf, type RunConfig, type DraftPack, type Candidate } from "../game/packs.ts";
import { StaticDataSource } from "../data/DataSource.ts";
import type { GameData } from "../types/data.ts";
import type { ScoreBreakdown } from "../game/score.ts";
import { QUICK_DRAFT_FIELD, TournamentEngine, fieldRerollCount, type PlacementKey, type TournamentSnapshot, type TournamentTeam } from "../game/tournament.ts";
import { buildRealField, rescoreRealField, scoutOptions, type RealField, type ScoutOption } from "../game/realTournament.ts";
import { AnteRunEngine, effectiveStageTarget, grantsDynastyTitle, marketCostFactor, nextBossStage, SEASON, type AnteRunState } from "../game/anteRun.ts";
import { RunEconomy, type CampView, type RunEconomyState, type SummandModifiers } from "../game/anteEconomy.ts";
import type { CardEdition } from "../game/editions.ts";
import { buildAnteMarketRoulette, refreshAnteMarketOffers } from "../game/anteMarket.ts";
import { buildTacticContext, evaluateTactics, type TacticEvaluation } from "../game/tactics.ts";
import { bannedHeroesForStage, bossForStage, bossIsRolled, evaluateBoss, type BossEvaluation } from "../game/bossConditions.ts";
import { evaluateItems, protectedBossPenalty } from "../game/items.ts";
import { activeCardIds, runModifiers, stageStrength as runStageStrength } from "../game/runStrength.ts";
import { BALANCE_CONFIG_VERSION } from "../game/balance.ts";
import { createRunSeed } from "../game/rng.ts";
import { buildCareerEntry, careerEntriesForMode, useCareer } from "./careerStore.ts";
import {
  clearSavedRun,
  freezeRoster,
  frozenRostersMatch,
  isSavedRunResumable,
  loadSavedRunAsync,
  loadTeamNameAsync,
  saveRun,
  saveTeamName,
  type RunAction,
  type RunMode,
  type SavedRun,
} from "./runPersist.ts";
import { logDataLoaded, logDraftSnap, logRunStart, logScreen, logTournament } from "../debug/logDraft.ts";
import { clearRunLinkHash, decodeRunLink, runLinkFromHash, runLinkIssue, type RunLink, type RunLinkIssue } from "./runLink.ts";
import { telegramStartParam } from "../tma/telegram.ts";

// Бесшовный Classic-флоу (TREF-TOUR2): после драфта нет отдельного экрана-итога —
// сразу непрерывный `tournament`-вид (разбор счёта + поле + одна CTA «Симулировать»).
// Roguelite Run добавляет фазу "camp" (Буткемп между этапами: reward + market), см. T5.2.
/** `arenaWait` — Arena MP1: свой драфт сдан/сдаётся, ждём лока комнаты (features/start/ArenaWait). */
type Phase = "loading" | "start" | "draft" | "prep" | "tournament" | "camp" | "arenaWait";
export type StartStep = "modes" | "variants" | "config";
export type { RunMode } from "./runPersist.ts";

const DEFAULT_START_CONFIG: RunConfig = {
  draftStyle: "team",
  format: "last_2y",
  rerolls: 1,
  scoring: "event",
  allocation: "auto",
  hardMode: false,
};

export interface Snapshot {
  currentPack: DraftPack;
  roster: RosterSlot[];
  rerollsLeft: number;
  currentSlotIndex: number;
  rosterFilled: number;
  isComplete: boolean;
  heroes: number[]; // драфтованные герои
  heroesLeft: number;
  packHeroes: number[]; // драфтуемые герои текущего пака
  packSerial: number;   // номер пака: меняется на каждую новую раздачу
  score: ScoreBreakdown | null;
  /** Скамейка (Balatro-стиль: несколько запасных). У каждого — точный scoreTeam-превью
   *  для каждого допустимого бесплатного swap-back в слот его роли. */
  reservePlayers: ReservePlayerView[];
  /** Резерв героев с точным preview для каждого активного героя, которого можно убрать. */
  reserveHeroes: ReserveHeroView[];
  /** Наложение подготовки к событию (RT-E): рёбра химии и строки разбора обязаны видеть те же
   *  виртуальные игры, что и счёт, иначе радар и плитки разъедутся. Пустое вне Real Tournament. */
  prepOverlay: ScoreOverlay;
}

export interface ReservePlayerView {
  candidate: Candidate;
  previews: Array<{ slotIndex: number; score: ScoreBreakdown }>;
}

/** Одна возможная неделя сборов: действие + счёт «если потратить её сюда» (RT-E). */
export interface PrepOptionView {
  action: PrepAction;
  score: ScoreBreakdown;
  /** Прирост Team OVR против текущего плана. */
  delta: number;
  /** Сколько недель уже вложено в эту же пару / этого же игрока×героя. */
  spent: number;
}

/** Фаза подготовки Real Tournament: план, остаток бюджета и превью каждой опции. Считается в
 *  сторе на каждое действие (как previewTactic) — UI не держит второй копии формулы. */
export interface PrepView {
  plan: PrepPlan;
  pointsLeft: number;
  budget: number;
  /** Счёт без подготовки — «было» для разложения до → после. */
  baseline: ScoreBreakdown;
  scrims: PrepOptionView[];
  practices: PrepOptionView[];
  /** Разбор соперника (срез 2): составы поля с потерей от разбора; уже разобранные помечены. */
  scouts: ScoutOption[];
  scoutsLeft: number;
  overlay: ScoreOverlay;
}

/** Разведанный босс: обычная оценка + на каком этапе он стоит (R9.4). */
export interface ScoutedBoss extends BossEvaluation {
  stageIndex: number;
}

export interface ReserveHeroView {
  heroId: number;
  previews: Array<{ outgoingHeroId: number; score: ScoreBreakdown }>;
}

interface RunStore {
  phase: Phase;
  error: string | null;
  data: GameData | null;
  engine: RunEngine | null;
  config: RunConfig | null;
  seed: string;
  snapshot: Snapshot | null;
  selectedMode: RunMode | null;
  /** Real Tournament (T5.6): выбранное событие. Часть mode-shell-состояния — переживает reset
   *  забега, как selectedMode (правило CLAUDE.md: reset не сбрасывает режим). */
  realEventId: string | null;
  /** Поле выбранного события: 17 реальных составов + roster lock. Производная data+realEventId,
   *  собирается на старте/resume и не персистится. */
  realField: RealField | null;
  /** Позиция внутри стартового флоу. Живёт в store, чтобы Settings/справочник не сбрасывали её. */
  startStep: StartStep;
  /** Ещё не запущенная конфигурация; сохраняется при служебной навигации вне game-view. */
  startConfig: RunConfig;
  /** Введённый seed/link на стартовом экране; Settings не должен стирать пользовательский ввод. */
  startSeedInput: string;
  teamName: string;
  actions: RunAction[]; // лог действий текущего забега (для персиста/replay)
  resumable: SavedRun | null; // незавершённый совместимый забег, предложить продолжить
  /** Забег из ссылки, ожидающий подтверждения. Не стартуем молча: у игрока может идти свой. */
  pendingLink: RunLink | null;
  /** Почему присланная ссылка невоспроизводима (несовпадение версий), иначе null. */
  pendingLinkIssue: RunLinkIssue | null;
  tournamentEngine: TournamentEngine | null;
  tournament: TournamentSnapshot | null;
  tournamentStep: number;
  /** Reveal плей-офф доигран до экрана результатов — сейв больше не нужен. */
  resultsSeen: boolean;
  /** Roguelite Run (mode "run"): движок ante-петли поверх этапов, иначе null. */
  anteRun: AnteRunEngine | null;
  /** Снимок состояния ante-забега для рендера (этап/порог/фаза/место). */
  ante: AnteRunState | null;
  /** Экономика забега (валюта/покупки/офферы) поверх ante-петли, иначе null. */
  economy: RunEconomy | null;
  /** Сериализуемый снимок экономики для persist. */
  economyView: RunEconomyState | null;
  /** Снимок Буткемпа для рендера (offers/gold/breakdown), иначе null. */
  camp: CampView | null;
  /** Real Tournament: фаза подготовки к событию (RT-E), иначе null. */
  prep: PrepView | null;
  /** Вклад экипированных Tactics при текущем ростере + причины срабатывания (срез 4).
   *  Отдельно от `camp`, потому что условия зависят от состава и пересчитываются на каждый swap. */
  tactics: TacticEvaluation | null;
  /** Boss condition ПРЕДСТОЯЩЕГО этапа против текущего ростера (срез 5): правило + `до→после`.
   *  null — у этапа нет правила. Пересчитывается на каждый swap, как tactics. */
  boss: BossEvaluation | null;
  /** Разведанный босс СЛЕДУЮЩЕГО боссового турнира (R9.4): то, чего в Буткемпе ещё не видно.
   *  null — разведка в этом Буткемпе не сыграна. Оценивается против текущего ростера, чтобы к
   *  правилу можно было готовиться заранее, а не узнавать о нём за этап. */
  scoutedBoss: ScoutedBoss | null;
  /** Секвенция «этап пройден» (R15.2). Транзиентный флаг: взводится ТОЛЬКО в openCampAfterStage
   *  (свежий проход порога / вход в Династию), в SavedRun не пишется — resume в лагерь не
   *  переигрывает праздник и не может продублировать эффекты: все числа читаются из уже
   *  начисленного lastPayout, движок секвенцией не трогается. */
  campCelebration: boolean;

  loadData: () => Promise<void>;
  start: (config: RunConfig, seed: string) => void;
  pickPlayer: (idx: number) => void;
  pickHero: (heroId: number) => void;
  canPickPlayer: (idx: number) => boolean;
  canPickHero: (heroId: number) => boolean;
  assign: (accountId: number, heroId: number) => void;
  swapHeroes: (accountIdA: number, accountIdB: number) => void;
  /** Real Tournament: потратить неделю сборов / откатить последнюю / закрыть подготовку и идти к посеву. */
  addPrep: (action: PrepAction) => void;
  undoPrep: () => void;
  confirmPrep: () => void;
  /** Arena MP1: после лока комнаты построить общий турнир 18 команд (поле передаёт arenaStore). */
  startArenaTournament: (user: { name: string; strength: number }, opponents: TournamentTeam[], simSeed: string) => void;
  reroll: () => void;
  rerollField: () => void;
  reset: () => void;
  setSelectedMode: (mode: RunMode | null) => void;
  setRealEventId: (eventId: string | null) => void;
  setStartStep: (step: StartStep) => void;
  setStartConfig: (config: RunConfig | ((current: RunConfig) => RunConfig)) => void;
  setStartSeedInput: (value: string) => void;
  setTeamName: (name: string) => void;
  resumeRun: () => void;
  discardResume: () => void;
  /** Забег из присланной ссылки: обнаружен в URL, ждёт решения игрока. */
  acceptPendingLink: () => void;
  dismissPendingLink: () => void;
  /** Перечитать ссылку из адресной строки. Нужен, когда её открыли в УЖЕ открытом
   *  приложении: меняется только hash, перезагрузки нет, и loadData повторно не идёт. */
  syncLinkFromHash: () => void;
  advanceTournament: () => void;
  /** «Показать результат»: довести турнир до терминальной стадии, не проигрывая reveal. */
  completeTournamentPlayback: () => void;
  /** Вызывать, когда UI доиграл playoffs reveal до итоговой таблицы (не при входе в стадию). */
  finishTournament: () => void;
  /** Roguelite Run: открыть Буткемп после пройденного этапа (кнопка «В Буткемп»). */
  enterCamp: () => void;
  /** Roguelite Run: продолжить выигранный сезон Династией (R6.3) — добровольный выбор игрока
   *  на экране победы. Победа остаётся засчитанной; забег продолжается тем же ростером. */
  continueDynasty: () => void;
  /** Буткемп: выбрать одну reward-карту (бесплатно, один раз). */
  chooseReward: (offerId: string) => void;
  /** Что даст ЕЩЁ НЕ ВЗЯТАЯ тактика на текущем ростере. Живёт в сторе, а не в UI: контекст условий
   *  строится ровно тем же `buildTacticContext`, что и боевой расчёт, и второй копии тут быть не
   *  должно (на разъехавшихся копиях этот проект уже горел — см. R10). */
  previewTactic: (tacticId: string) => TacticEvaluation | null;
  /** Буткемп: купить market-оффер за золото. */
  buyMarket: (offerId: string) => void;
  /** Буткемп: реролл рынка за золото. */
  rerollMarket: () => void;
  /** Буткемп: снять пассивную тактику, освободив слот. */
  discardTactic: (tacticId: string) => void;
  /** Trade-in (LG1): обменять карту слота на карту из тройки офферов; реролл тройки. */
  tradeCard: (outgoingId: string, incomingId: string) => void;
  /** Зачаровать карту токеном титула Династии (LG6): выбранная Edition на карту без Edition. */
  enchantCard: (cardId: string, edition: CardEdition) => void;
  rerollTrade: () => void;
  /** Буткемп: выбросить неразыгранное одноразовое действие. */
  discardAction: (actionId: string) => void;
  /** Буткемп: разыграть одноразовое Camp Action (эффект живёт один следующий этап). */
  playCampAction: (actionId: string) => void;
  /** Буткемп: улучшить редкость активного героя за золото (срез 3b). */
  upgradeHeroRarity: (heroId: number) => void;
  /** Буткемп: поздние синки (T5.9) — усиленная подготовка к этапу, смена правила этапа,
   *  разведка за золото. Все расходуемые и дорожающие: см. ECONOMY.prep. */
  buyPrep: () => void;
  rerollBoss: () => void;
  buyScouting: () => void;
  /** Буткемп: поменять активного игрока на единственного запасного той же роли. */
  swapReservePlayer: (slotIndex: number, benchAccountId: number) => void;
  /** Буткемп: поменять активного героя на героя из малого резервного пула. */
  swapReserveHero: (outgoingHeroId: number, reserveHeroId: number) => void;
  /** Roguelite Run: выйти из Буткемпа и играть следующий этап (кнопка «Next stage»). */
  advanceAnteStage: () => void;
  /** Закрыть секвенцию «этап пройден» (клик/Continue). Идемпотентно. */
  dismissCampCelebration: () => void;
  restartSameConfig: () => void;
}

/** Справочник закрыт, пока идёт ХАРДКОРНЫЙ забег: страницы «герои игрока» и «паутина
 *  тиммейтов» показывают ровно то, что хардкор прячет в самом забеге (на чём играет
 *  игрок и кто с кем в составе). Иначе режим обходится в два клика через меню.
 *  Чистая функция — тестируется без стора. */
export function isCodexLocked(
  config: RunConfig | null,
  phase: Phase,
  resumable?: SavedRun | null,
): boolean {
  if (config?.hardMode === true && (phase === "draft" || phase === "prep" || phase === "tournament")) return true;
  // Незавершённый хардкорный забег в сейве тоже запирает справочник: иначе достаточно
  // перезагрузить страницу (забег ещё не возобновлён), подсмотреть и продолжить.
  return resumable?.config.hardMode === true;
}

/** Теги героев (R11.7) — механика ТОЛЬКО Roguelite Run: их читают предметы и тактики
 *  («+6% mult за героя-illusion»), и вопрос «какие у героя теги» возникает у игрока ровно
 *  там. В Quick Draft, Manager и Real Tournament тег ничего не решает — в справочнике это
 *  просто шум поперёк строки, поэтому чипы и фильтр по тегу показываем по режиму.
 *
 *  `resumable` учитываем по тому же доводу, что и в `isCodexLocked`: после перезагрузки
 *  страницы забег ещё не возобновлён (`selectedMode` пуст), но игрок стоит именно в
 *  рогалике — прятать от него теги было бы враньём о его же режиме.
 *  Чистая функция — тестируется без стора. */
export function showsHeroTags(selectedMode: RunMode | null, resumable?: SavedRun | null): boolean {
  if (selectedMode) return selectedMode === "run";
  return resumable?.mode === "run";
}

/** `snap` обязан быть ТОТАЛЬНЫМ: он вызывается уже ПОСЛЕ мутации движка и экономики, а
 *  `buyMarket` оборачивает всё в try/catch. Любое исключение отсюда означает «золото списано,
 *  ростер изменён, а UI не обновился» — то есть молча сломанное состояние.
 *
 *  Так и было с Form Upgrade (R5.2): на скамейке оказывалась старая форма человека, чья личность
 *  активна, и превью её возврата во ВТОРОЙ слот той же роли (у support их два) бросало «игрок уже
 *  в активном составе». Покупка support-апгрейда выглядела как «кнопка не работает», хотя золото
 *  уже ушло. Одиночные роли (carry/mid/offlane) не задевало — там второго слота нет. */
function snap(engine: RunEngine): Snapshot {
  const reservePlayers: ReservePlayerView[] = engine.reservePlayers.map((candidate) => ({
    candidate,
    previews: engine.rosterView.flatMap((slot, slotIndex) => (
      slot.candidate
        && slot.role === candidate.player.role
        && engine.canSwapReservePlayer(slotIndex, candidate.player.accountId)
        ? [{ slotIndex, score: engine.previewReservePlayerSwap(slotIndex, candidate.player.accountId) }]
        : []
    )),
  }));
  return {
    currentPack: engine.currentPack,
    roster: engine.rosterView,
    rerollsLeft: engine.rerollsLeft,
    currentSlotIndex: engine.currentSlotIndex,
    rosterFilled: engine.rosterFilled,
    isComplete: engine.isComplete,
    heroes: engine.heroes,
    heroesLeft: engine.heroesLeft,
    packHeroes: engine.packHeroes,
    packSerial: engine.packSerial,
    score: engine.score(),
    prepOverlay: engine.scoreOverlay,
    reservePlayers,
    reserveHeroes: engine.reserveHeroes.map((heroId) => ({
      heroId,
      previews: engine.heroes.map((outgoingHeroId) => ({
        outgoingHeroId,
        score: engine.previewHeroReplacement(outgoingHeroId, heroId),
      })),
    })),
  };
}

function debugSnap(
  action: string,
  _engine: RunEngine,
  snapshot: Snapshot,
  config: RunConfig,
  seed: string,
  data: GameData,
  detail?: Record<string, unknown>,
): void {
  logDraftSnap({ action, seed, config, data, snapshot, detail });
}

/** Детерминированный повтор действий на свежем движке (восстановление забега). */
function replay(engine: RunEngine, actions: RunAction[]): void {
  for (const action of actions) {
    if (action.t === "pickPlayer") engine.pickPlayer(action.index);
    else if (action.t === "pickHero") engine.pickHero(action.heroId);
    else if (action.t === "reroll") engine.reroll();
    else if (action.t === "assign") engine.assign(action.accountId, action.heroId);
    else if (action.t === "swap") engine.swapHeroes(action.a, action.b);
    else if (action.t === "replacePlayer") {
      const incoming = engine.candidateByRef(action.incoming);
      if (!incoming) throw new Error("Market player is missing from dataset");
      engine.replacePlayer(action.slotIndex, incoming);
    } else if (action.t === "swapReservePlayer") engine.swapReservePlayer(action.slotIndex, action.benchAccountId);
    else if (action.t === "replaceHero") engine.replaceHero(action.outgoingHeroId, action.incomingHeroId);
    else if (action.t === "swapReserveHero") engine.swapReserveHero(action.outgoingHeroId, action.reserveHeroId);
    else if (action.t === "prep") engine.addPrep(action.action);
    else if (action.t === "prepUndo") engine.undoPrep();
    // prepDone — маркер фазы, движок не трогает (см. prepDoneIn).
  }
}

/** Подготовка закрыта — в логе есть `prepDone` (resume различает фазы prep/tournament по нему). */
function prepDoneIn(actions: RunAction[]): boolean {
  return actions.some((action) => action.t === "prepDone");
}

/** Вью подготовки: превью каждой недели сборов тем же scoreFor, что боевой счёт. */
function buildPrepView(engine: RunEngine, data: GameData, realField: RealField | null): PrepView | null {
  const current = engine.score();
  if (!engine.isComplete || !current) return null;
  const plan = engine.prepPlan;
  const spentFor = (action: PrepAction) => plan.actions.filter((spent) => (
    spent.kind === "scrim" && action.kind === "scrim"
      ? (spent.a === action.a && spent.b === action.b) || (spent.a === action.b && spent.b === action.a)
      : spent.kind === "practice" && action.kind === "practice" && spent.accountId === action.accountId && spent.heroId === action.heroId
  )).length;
  const option = (action: PrepAction): PrepOptionView | null => {
    const score = engine.previewPrep(action);
    return score ? { action, score, delta: score.teamOvr - current.teamOvr, spent: spentFor(action) } : null;
  };
  const players = engine.players;
  const scrims: PrepOptionView[] = [];
  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) {
      const view = option({ kind: "scrim", a: players[i].accountId, b: players[j].accountId });
      if (view) scrims.push(view);
    }
  }
  const practices: PrepOptionView[] = [];
  for (const player of players) {
    for (const heroId of engine.heroes) {
      const view = option({ kind: "practice", accountId: player.accountId, heroId });
      if (view) practices.push(view);
    }
  }
  // Счёт без подготовки — «было» для разложения: считаем пустым наложением.
  const baseline = engine.previewWithoutPrep();
  const scouted = scoutedTeams(plan);
  return {
    plan, pointsLeft: engine.prepPointsLeft, budget: PREP.budget, baseline: baseline ?? current,
    scrims: scrims.sort((x, y) => y.delta - x.delta),
    practices: practices.sort((x, y) => y.delta - x.delta),
    scouts: realField ? scoutOptions(data, realField, scouted) : [],
    scoutsLeft: Math.max(0, PREP.scoutMax - scouted.size),
    overlay: engine.scoreOverlay,
  };
}

/** T9.9: сид-код из `startapp`-параметра Mini App. Payload тот же, что в `#/run=` (T3.12) —
 *  единственная новая часть здесь — откуда берётся строка; кодек и проверка версий общие. */
function runLinkFromStartParam(): RunLink | null {
  const param = telegramStartParam();
  return param ? decodeRunLink(param) : null;
}

export const useRun = create<RunStore>((set, get) => {
  // Сохранить текущий забег (config+seed+лог) под версию активного датасета.
  // Плей-офф с canAdvance=false — ещё НЕ финал для игрока: идёт reveal-анимация.
  // Сейв чистим только после finishTournament (reveal доигран до экрана результатов).
  const persist = () => {
    const { data, config, seed, selectedMode, actions, tournamentStep, tournamentEngine, engine, resultsSeen, anteRun, economy } = get();
    if (!data || !config || !selectedMode) return;
    // Arena (MP1): забег живёт в комнате, resume вне её бессмыслен — long-save не пишем.
    if (selectedMode === "arena") return;
    if (resultsSeen) {
      clearSavedRun();
      return;
    }
    const score = engine?.score();
    const frozenRoster = engine?.isComplete && score
      ? freezeRoster(engine.rosterView, score.assignment.byPlayer)
      : undefined;
    saveRun({
      v: 1,
      schemaVersion: data.manifest.schemaVersion,
      ratingModelVersion: data.manifest.ratingModelVersion,
      dataHash: data.manifest.dataHash,
      dataBuiltAt: data.manifest.builtAt,
      mode: selectedMode,
      config,
      seed,
      actions,
      tournamentStep,
      tournamentStarted: tournamentEngine != null,
      frozenRoster: frozenRoster ?? undefined,
      anteStageIndex: anteRun ? anteRun.state.index : undefined,
      anteSeasonWon: anteRun?.state.seasonWon ? true : undefined,
      economy: economy ? economy.snapshot : undefined,
      // Только Roguelite Run зависит от коэффициентов баланса — остальным режимам ключ не нужен.
      balanceConfigVersion: selectedMode === "run" ? BALANCE_CONFIG_VERSION : undefined,
      // Real Tournament: без события resume не пересоберёт поле и lock (T5.6).
      realEventId: selectedMode === "tournament" ? get().realEventId ?? undefined : undefined,
    });
  };
  // Пересчитать вклад экипированных Tactics от ТЕКУЩЕГО ростера. Вызывать после любого swap:
  // условия карточек («сыгранные пары», «нет суперзвёзд», «одна эпоха») зависят от состава,
  // поэтому кэшировать их как разовую дельту нельзя — этим они и отличаются от покупок.
  const tacticContext = () => {
    const { economy, engine, data } = get();
    const score = engine?.score();
    if (!economy || !engine || !data || !score) return null;
    return buildTacticContext(
      engine.rosterView,
      score.assignment.byPlayer,
      data,
      economy.snapshot.campStageIndex,
    );
  };
  const evaluateRunTactics = (): TacticEvaluation | null => {
    const ctx = tacticContext();
    const economy = get().economy;
    return ctx && economy ? evaluateTactics(economy.equippedTactics, ctx, economy.cardCharges) : null;
  };
  // Вклад редкости активных героев (срез 3b): heroSynergy + base у immortal. Пересчитывается от
  // engine.heroes + карты редкости в экономике, поэтому зависит от текущего состава (как tactics).
  // Итоговые модификаторы забега: покупки/временные действия (экономика) + условные Tactics +
  // редкость героев. Единственное место, где слои складываются, — чтобы поле этапа и UI не
  // разъезжались; редкость вложена сюда, поэтому все места сборки силы получают её автоматически.
  // Композиция слоёв — общая с балансовым симулятором (game/runStrength.ts). Складывать их здесь
  // «своей» суммой нельзя: именно так копия в симуляторе однажды разъехалась с игрой.
  const effectiveModifiers = (tactics: TacticEvaluation | null): SummandModifiers => {
    const { economy, engine } = get();
    return runModifiers({
      economy: economy?.modifiers() ?? { base: 0, heroSynergy: 0, chemistry: 0 },
      tactics: tactics?.modifiers ?? null,
      heroRarity: economy?.heroRarity ?? {},
      activeHeroes: engine?.heroes ?? [],
    });
  };
  // Boss condition этапа `stageIndex` против текущего ростера с уже применёнными modifiers.
  // Штраф вычитается из силы поля; null — этап без правила. Пересчитывается на swap, как tactics.
  const evaluateRunBoss = (stageIndex: number, tactics: TacticEvaluation | null): BossEvaluation | null => {
    const { engine, seed, economy } = get();
    const score = engine?.score();
    if (!engine || !score) return null;
    // Правило могло быть перекуплено в Буткемпе (T5.9) — счётчик живёт в экономике, сам босс
    // остаётся чистой функцией от seed+stage+n.
    const rerolls = economy?.bossRerollsFor(stageIndex) ?? 0;
    // Stake обязателен и здесь: под uncappedBoss (b1.41.0) правило стоит и на элитных этапах.
    const bossId = bossForStage(seed, stageIndex, rerolls, stakesOf(get().config));
    if (!bossId) return null;
    const mods = effectiveModifiers(tactics);
    const items = runItems();
    const raw = evaluateBoss(bossId, {
      seed,
      // Индекс именно оцениваемого этапа, а не текущего: разведка (R9.4) считает условие БУДУЩЕГО
      // боссового турнира, и рампа планки обязана взяться от него же.
      absoluteStageIndex: stageIndex,
      base: score.base + mods.base,
      heroSynergy: score.heroSynergy + mods.heroSynergy,
      chemistry: score.chemistry + mods.chemistry,
      playerOvrs: engine.players.map((p) => p.ovr),
      activeHeroes: engine.heroes,
      bannedHeroes: bannedHeroesForStage(seed, stageIndex, engine.allFormatHeroes, rerolls, stakesOf(get().config)),
      stakes: stakesOf(get().config),
      // Через тот же `buildTacticContext`, что и боевой расчёт тактик: «pro-игры на назначенном
      // герое» и co-games пар определены там ровно один раз, второй копии быть не должно.
      assignedHeroGames: tacticContext()?.players.map((player) => player.assignedHeroGames) ?? [],
      pairCoGames: tacticContext()?.pairs.map((pair) => pair.games) ?? [],
    });
    // Предметы-защита смягчают штраф, но не отменяют правило (R8.3); Tempered-карты (LG4) —
    // та же роль от Edition: активность judged теми же activeCardIds, что заряды и рейл.
    const editions = economy?.cardEditions ?? {};
    const activeTempered = [...activeCardIds(tactics, items)]
      .filter((id) => editions[id] === "tempered").length;
    return { ...raw, penalty: protectedBossPenalty(raw.penalty, items, activeTempered) };
  };
  /** Боссы Буткемпа: правило ПРЕДСТОЯЩЕГО этапа + разведанный босс следующего боссового турнира.
   *  Разведка (R9.4) обязана раскрывать то, чего ещё не видно, поэтому смотрит строго ДАЛЬШЕ
   *  предстоящего этапа: его правило и так на экране. */
  const campBosses = (upcomingIndex: number, tactics: TacticEvaluation | null) => {
    const economy = get().economy;
    // Ближайший этап с НЕИЗВЕСТНЫМ правилом, а не ближайший финал: под стейком uncappedBoss
    // (b1.41.0) роллящееся правило стоит и на elite/playoffCheck — разведка обязана раскрывать
    // ближайшее из них; источник истины «есть ли на этапе правило» один, bossForStage. Амбиентный
    // heroBan стейка doubleBans разведывать нечего (правило известно с запуска, а его бан-лист
    // виден только с Буткемпа этапа) — этап без ролла разведка пропускает, как обычный.
    const nextRuledStage = (from: number): number => {
      const { seed } = get();
      const stakes = stakesOf(get().config);
      for (let index = from + 1; index <= from + SEASON.actLength; index += 1) {
        if (bossIsRolled(seed, index, stakes)) return index;
      }
      return nextBossStage(from);
    };
    const scoutStage = nextRuledStage(upcomingIndex);
    // Разведка раскрывает КОНКРЕТНЫЙ боссовый турнир, и знание о нём не исчезает в следующем
    // Буткемпе: узнал — знаешь до самого турнира. Поэтому сверяем не «разведан ли этот лагерь»,
    // а «раскрывал ли какой-нибудь сыгранный Scouting именно этот этап». Формат сейва при этом
    // не меняется: `scoutedCamps` как хранил индексы лагерей, так и хранит.
    const scouted = economy
      ? economy.snapshot.scoutedCamps.some((camp) => nextRuledStage(camp) === scoutStage)
      : false;
    const scoutedEval = scouted && scoutStage >= 0 ? evaluateRunBoss(scoutStage, tactics) : null;
    return {
      boss: evaluateRunBoss(upcomingIndex, tactics),
      scoutedBoss: scoutedEval ? { ...scoutedEval, stageIndex: scoutStage } : null,
    };
  };
  // Итоговая сила поля этапа: сила состава + модификаторы − штраф босса (не ниже нуля вклада).
  // Через общий слой (game/runStrength.ts): он же проводит счёт через слои Tournament Power,
  // которые сегодня пусты, а в R8.3 наполнятся предметами.
  /** Вклад экипированных предметов при текущем ростере (R8.3). Условия на тегах героев, поэтому
   *  пересчитывается на каждый swap — как tactics. */
  const runItems = () => {
    const { economy, engine } = get();
    return evaluateItems(economy?.equippedTactics ?? [], {
      activeHeroes: engine?.heroes ?? [],
      cardRarity: economy?.cardRarity ?? {},
      cardCharges: economy?.cardCharges ?? {},
    });
  };
  const stageStrength = (baseTeamOvr: number, tactics: TacticEvaluation | null, boss: BossEvaluation | null): number => {
    const { economy, engine } = get();
    const items = runItems();
    return runStageStrength(baseTeamOvr, {
      economy: economy?.modifiers() ?? { base: 0, heroSynergy: 0, chemistry: 0 },
      tactics: tactics?.modifiers ?? null,
      heroRarity: economy?.heroRarity ?? {},
      activeHeroes: engine?.heroes ?? [],
    }, {
      bossPenalty: boss?.penalty,
      power: { flat: items.flat, additive: items.additive, xMults: items.xMults },
    });
  };
  // Обновить снимки экономики/Буткемпа для рендера и сохранить (во время camp резалтов нет).
  const syncCamp = () => {
    const { economy, engine, seed } = get();
    if (!economy || !engine) return;
    const economyState = economy.snapshot;
    if (economyState.preparedMarketOffers) {
      economy.replacePreparedMarketOffers(refreshAnteMarketOffers(
        engine,
        economy.campView().marketOffers,
        marketCostFactor(seed, economyState.campStageIndex, undefined, stakesOf(get().config)),
        economy.heroRarity,
      ));
    } else {
      economy.prepareMarketOffers(buildAnteMarketRoulette(
        engine,
        seed,
        economyState.campStageIndex,
        economyState.marketRerolls,
        economy.equippedTactics,
        {
                rarityDrops: economy.rarityDropsEnabled,
                stakes: stakesOf(get().config),
                stageCount: SEASON.stages.length,
                heroRarity: economy.heroRarity,
              },
      ));
    }
    const tactics = evaluateRunTactics();
    // Босс ПРЕДСТОЯЩЕГО этапа: в Буткемпе ante.index уже указывает на следующий этап.
    const upcoming = get().ante?.index ?? 0;
    set({
      economyView: economy.snapshot,
      camp: economy.campView(),
      tactics,
      ...campBosses(upcoming, tactics),
    });
    persist();
  };
  // Записать действие в лог и сохранить.
  /** Stake текущего забега (T6.4): правило сезона из конфига; null вне Roguelite Run. */

  const record = (action: RunAction) => {
    set((state) => ({ actions: [...state.actions, action] }));
    persist();
  };
  // Собрать турнир (стадия field) из готового снапшота драфта. Детерминизм: seed+teamOvr.
  // Имя команды по умолчанию фиксируем как durable-настройку (как раньше в startTournament).
  const buildTournamentFields = (snapshot: Snapshot, rerolls = fieldRerollCount(get().actions)) => {
    const { data, config, seed, teamName, selectedMode } = get();
    if (!data || !config || !snapshot.score) return null;
    const resolvedName = teamName.trim() || "Aegis Five";
    if (!teamName.trim()) saveTeamName(resolvedName);
    // Roguelite Run: этапы гонит AnteRunEngine (поле растёт по этапу), но UI-рендер тот же —
    // ante.tournament подставляется в тот же tournamentEngine/tournament, что и Quick Draft.
    if (selectedMode === "run") {
      const anteRun = new AnteRunEngine(data, config.format, seed, snapshot.score.teamOvr, resolvedName, undefined, stakesOf(config));
      const economy = new RunEconomy(seed);
      // Мета-гейт редкости (срез 3b, R3.1): в первом-ever roguelite-забеге не выпадают СЛУЧАЙНЫЕ
      // повышенные качества — но ручное улучшение в Буткемпе доступно сразу, иначе первый забег
      // вообще не показывает систему качества (баг PF-8). Считаем по истории careerStore
      // (T6.4-lite до появления Штаба).
      const rogueliteRuns = careerEntriesForMode(useCareer.getState().entries, "run").length;
      economy.setRarityFlags({ drops: rogueliteRuns >= 1, upgrades: true });
      economy.setUnlimitedGold(config.cheatMode === true);
      economy.setStakes(stakesOf(config));
      return {
        anteRun, ante: anteRun.state, economy, economyView: economy.snapshot, camp: null,
        tactics: null, boss: null, scoutedBoss: null, campCelebration: false,
        tournamentEngine: anteRun.tournament, tournament: anteRun.tournament.snapshot,
        tournamentStep: 0, teamName: resolvedName,
      };
    }
    // Real Tournament (T5.6): поле — реальные составы события, реролла поля нет (реальность не
    // рероллится), сила поля не зависит от сида — он решает только исход матчей.
    // Разборы соперников (RT-E срез 2) режут силу разобранных составов — поле строится уже по ним.
    const baseField = selectedMode === "tournament" ? get().realField : null;
    const realField = baseField && get().engine ? rescoreRealField(data, baseField, scoutedTeams(get().engine!.prepPlan)) : baseField;
    const tournamentEngine = realField
      ? new TournamentEngine(
        data, config.format, seed, snapshot.score.teamOvr, resolvedName,
        0, QUICK_DRAFT_FIELD, realField.opponents,
      )
      : new TournamentEngine(data, config.format, seed, snapshot.score.teamOvr, resolvedName, rerolls);
    return {
      anteRun: null, ante: null, economy: null, economyView: null, camp: null, tactics: null, boss: null, scoutedBoss: null,
      campCelebration: false,
      tournamentEngine, tournament: tournamentEngine.snapshot, tournamentStep: 0, teamName: resolvedName,
    };
  };
  /** Шаг драфта сделан: драфт не окончен → остаёмся; окончен → Quick Draft/Roguelite сразу
   *  строят поле, Real Tournament сперва идёт в подготовку к событию (RT-E). */
  const afterDraftStep = (snapshot: Snapshot): Partial<RunStore> => {
    const { engine, selectedMode } = get();
    if (!engine?.isComplete) return { snapshot, phase: "draft" };
    // Arena MP1: свой драфт готов — состав уезжает в комнату (сдаёт экран ожидания), турнир
    // построит startArenaTournament после лока: поле — 18 реальных составов, не генерация.
    if (selectedMode === "arena") return { snapshot, phase: "arenaWait" };
    if (selectedMode === "tournament") {
      logScreen("Prep", "Roster and heroes complete → preparation for the event");
      const { data, realField } = get();
      return { snapshot, phase: "prep", prep: data ? buildPrepView(engine, data, realField) : null };
    }
    const entered = buildTournamentFields(snapshot);
    return entered ? { snapshot, phase: "tournament", ...entered } : { snapshot, phase: "draft" };
  };
  const recordCareer = (
    tournament: TournamentSnapshot,
    rogueliteStage?: { index: number; count: number },
    opts: { seasonWon?: boolean; dynasty?: boolean } = {},
  ) => {
    const { data, config, seed, snapshot, selectedMode } = get();
    if (tournament.canAdvance || !data || !config || !snapshot?.score || !snapshot.isComplete) return;
    useCareer.getState().record(buildCareerEntry({
      seed,
      datasetSchemaVersion: data.manifest.schemaVersion,
      ratingModelVersion: data.manifest.ratingModelVersion,
      config,
      mode: selectedMode ?? undefined,
      rogueliteStage,
      seasonWon: opts.seasonWon,
      dynasty: opts.dynasty,
      score: snapshot.score,
      roster: snapshot.roster,
      tournament,
    }));
  };
  /** Переход «этап пройден → Буткемп»: призовые за пройденный этап, открытие лагеря и подготовка
   *  рынка. Общий для обычного прохода порога и для входа в Династию (R6.3) — это одно и то же
   *  событие, и второй его копии быть не должно. `nextIndex` уже указывает на ПРЕДСТОЯЩИЙ этап. */
  const openCampAfterStage = (nextIndex: number, placement: PlacementKey | null) => {
    const { economy, engine, seed } = get();
    if (!economy) return null;
    // Заряды Charged-карт (R13.5): +1 за пройденный этап с выполненным условием, сгорают при
    // сломанном. Активность — из тех же sources, что боевой расчёт (activeCardIds); состав не
    // менялся с выхода на этап, поэтому пересчёт честный. Строго ДО пересборки лагеря: превью
    // и разборы нового Буткемпа обязаны видеть уже обновлённые заряды.
    economy.accrueCharges(activeCardIds(evaluateRunTactics(), runItems()));
    // Порог пройденного этапа — ЭФФЕКТИВНЫЙ (мутатор круга LG3 мог его ужесточить): выплата
    // премии за место обязана судить по тому же порогу, по которому этап был пройден.
    economy.awardStageClear(nextIndex, placement, effectiveStageTarget(seed, nextIndex - 1, undefined, stakesOf(get().config)));
    // Титул Династии (T5.8): один за каждый пройденный акт ЗА пределами сезона. Внутри сезона
    // финал акта уже оплачен растущими призовыми и премией за место (R6.4), а Династии нужна
    // своя причина продолжать — иначе бесконечная фаза это только растущая угроза без ответа.
    if (grantsDynastyTitle(nextIndex - 1)) economy.awardDynastyTitle(nextIndex);
    economy.openCamp(nextIndex);
    if (engine) {
      const economyState = economy.snapshot;
      economy.prepareMarketOffers(buildAnteMarketRoulette(
        engine,
        seed,
        economyState.campStageIndex,
        economyState.marketRerolls,
        economy.equippedTactics,
        {
          rarityDrops: economy.rarityDropsEnabled,
          stakes: stakesOf(get().config),
          stageCount: SEASON.stages.length,
          heroRarity: economy.heroRarity,
        },
      ));
    }
    const campTactics = evaluateRunTactics();
    return {
      resultsSeen: false,
      economyView: economy.snapshot,
      camp: economy.campView(),
      tactics: campTactics,
      // Секвенция «этап пройден» (R15.2): взводится только здесь — свежий проход порога.
      // Resume не проходит через openCampAfterStage, поэтому праздник не переигрывается.
      campCelebration: true,
      // Босс ПРЕДСТОЯЩЕГО этапа — превью для адаптации в Буткемпе.
      ...campBosses(nextIndex, campTactics),
    };
  };

  return {
    phase: "loading",
    error: null,
    data: null,
    engine: null,
    config: null,
    seed: "",
    snapshot: null,
    selectedMode: null,
    realEventId: null,
    realField: null,
    startStep: "modes",
    startConfig: DEFAULT_START_CONFIG,
    startSeedInput: "",
    teamName: "",
    actions: [],
    resumable: null,
    pendingLink: null,
    pendingLinkIssue: null,
    tournamentEngine: null,
    tournament: null,
    tournamentStep: 0,
    resultsSeen: false,
    anteRun: null,
    ante: null,
    economy: null,
    economyView: null,
    camp: null,
    prep: null,
    tactics: null, boss: null, scoutedBoss: null,
    campCelebration: false,

    async loadData() {
      // Retry после упавшей загрузки (T7.3): прошлую ошибку убираем, пока идёт новая попытка.
      set({ error: null });
      try {
        // Сейв и имя команды читаем ПАРАЛЛЕЛЬНО с данными: в Telegram это поход в CloudStorage,
        // и последовательные ожидания сложились бы в заметную паузу перед стартовым экраном.
        const [data, rawSaved, savedTeamName] = await Promise.all([
          new StaticDataSource().load(),
          loadSavedRunAsync(),
          loadTeamNameAsync(),
        ]);
        const { schemaVersion, ratingModelVersion, dataHash, builtAt } = data.manifest;
        // Пустой actions = только стартовали; первый пак уже зафиксирован seed'ом — resume нужен.
        let saved: SavedRun | null = isSavedRunResumable(
          rawSaved, schemaVersion, ratingModelVersion, dataHash, builtAt, BALANCE_CONFIG_VERSION,
        ) ? rawSaved : null;
        if (saved && !saved.dataHash) {
          saved = { ...saved, dataHash };
          saveRun(saved);
        }
        if (rawSaved && !saved) clearSavedRun();
        // Ссылку разбираем ЗДЕСЬ, а не в UI: без манифеста нечем проверить совместимость.
        // Забег из неё не стартуем — сперва спросим (у игрока может идти свой, а CLAUDE.md
        // требует confirm на любую потерю прогресса).
        // T9.9: в Telegram тот же payload приезжает параметром запуска Mini App
        // (`?startapp=<код>` → `tgWebAppStartParam`); внутри TMA hash занят параметрами
        // Telegram, поэтому источника два, а кодек один — decodeRunLink.
        const link = typeof window === "undefined"
          ? null
          : runLinkFromHash(window.location.hash) ?? runLinkFromStartParam();
        set({
          data,
          phase: "start",
          teamName: savedTeamName,
          resumable: saved,
          pendingLink: link,
          pendingLinkIssue: link ? runLinkIssue(link, schemaVersion, ratingModelVersion, BALANCE_CONFIG_VERSION) : null,
        });
        logDataLoaded(data);
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
    },

    start(config, seed) {
      const { data, selectedMode, realEventId } = get();
      if (!data) return;
      try {
        // Real Tournament (T5.6): поле и roster lock детерминированно выводятся из события —
        // движок получает lock ДО первого пака, чтобы залоченный не появился нигде.
        const realField = selectedMode === "tournament" && realEventId
          ? buildRealField(data, realEventId)
          : null;
        if (selectedMode === "tournament" && !realField) {
          throw new Error("Real Tournament: событие не выбрано");
        }
        const engine = new RunEngine(
          data, config, seed,
          realField ? { lockedAccounts: realField.lockedAccounts } : undefined,
        );
        const snapshot = snap(engine);
        set({
          engine, config, seed, phase: "draft", snapshot, actions: [], resumable: null, error: null,
          startStep: "config", startConfig: config, realField,
          tournamentEngine: null, tournament: null, tournamentStep: 0, resultsSeen: false,
          anteRun: null, ante: null, economy: null, economyView: null, camp: null, prep: null, tactics: null, boss: null, scoutedBoss: null,
        });
        logRunStart(config, seed, data);
        debugSnap("after start", engine, snapshot, config, seed, data);
        persist();
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
    },

    pickPlayer(idx) {
      const { engine, config, seed, data } = get();
      if (!engine || !config || !data || !engine.canPickPlayer(idx)) return;
      const candidate = engine.currentPack.candidates[idx];
      engine.pickPlayer(idx);
      const snapshot = snap(engine);
      set(afterDraftStep(snapshot));
      debugSnap("pickPlayer", engine, snapshot, config, seed, data, {
        index: idx,
        nickname: candidate?.player.nickname,
        role: candidate?.player.role,
      });
      if (engine.isComplete) logScreen("Tournament", "Roster and heroes complete → field");
      record({ t: "pickPlayer", index: idx });
    },

    pickHero(heroId) {
      const { engine, config, seed, data } = get();
      if (!engine || !config || !data || !engine.canPickHero(heroId)) return;
      engine.pickHero(heroId);
      const snapshot = snap(engine);
      set(afterDraftStep(snapshot));
      debugSnap("pickHero", engine, snapshot, config, seed, data, { heroId });
      if (engine.isComplete) logScreen("Tournament", "Roster and heroes complete → field");
      record({ t: "pickHero", heroId });
    },

    assign(accountId, heroId) {
      const { engine, config, seed, data } = get();
      if (!engine || !config || !data) return;
      engine.assign(accountId, heroId);
      const snapshot = snap(engine);
      set({ snapshot });
      debugSnap("assign", engine, snapshot, config, seed, data, { accountId, heroId });
      record({ t: "assign", accountId, heroId });
    },

    swapHeroes(accountIdA, accountIdB) {
      const { engine, config, seed, data } = get();
      if (!engine || !config || !data) return;
      try {
        engine.swapHeroes(accountIdA, accountIdB);
        const snapshot = snap(engine);
        // До запуска симуляции (стадия field) свап меняет teamOvr → пересобираем поле,
        // чтобы посев остался консистентным. После старта групп ростер залочен.
        const { anteRun, tournament, economy } = get();
        if (tournament?.stage === "field" && snapshot.score) {
          if (anteRun) {
            // Ante: пересобираем поле ТЕКУЩЕГО этапа под новый teamOvr (+ модификаторы экономики
            // и Tactics − штраф босса), прогресс сохраняется (fresh AnteRunEngine сбросил бы на
            // этап 0). Свап героев меняет назначения → пересчёт tactics и boss обязателен.
            const tactics = economy ? evaluateRunTactics() : null;
            const boss = evaluateRunBoss(anteRun.state.index, tactics);
            anteRun.rebuildCurrentStage(stageStrength(snapshot.score.teamOvr, tactics, boss));
            set({ snapshot, anteRun, ante: anteRun.state, tactics, boss, tournamentEngine: anteRun.tournament, tournament: anteRun.tournament.snapshot, tournamentStep: 0 });
          } else {
            const rebuild = buildTournamentFields(snapshot);
            set(rebuild ? { snapshot, ...rebuild } : { snapshot });
          }
        } else {
          set({ snapshot });
        }
        debugSnap("swapHeroes", engine, snapshot, config, seed, data, { accountIdA, accountIdB });
        record({ t: "swap", a: accountIdA, b: accountIdB });
      } catch {
        /* ignore invalid swap */
      }
    },

    addPrep(action) {
      const { engine, phase, data, realField } = get();
      if (!engine || !data || phase !== "prep") return;
      // Разбор — только состава ЭТОГО поля: движок поля не знает, проверяет стор.
      if (action.kind === "scout" && !realField?.opponents.some((opponent) => opponent.id === action.teamId)) return;
      if (!engine.addPrep(action)) return;
      set({ snapshot: snap(engine), prep: buildPrepView(engine, data, realField) });
      record({ t: "prep", action });
    },

    undoPrep() {
      const { engine, phase, data, realField } = get();
      if (!engine || !data || phase !== "prep" || !engine.undoPrep()) return;
      set({ snapshot: snap(engine), prep: buildPrepView(engine, data, realField) });
      record({ t: "prepUndo" });
    },

    confirmPrep() {
      const { engine, phase } = get();
      if (!engine || phase !== "prep" || !engine.isComplete) return;
      const snapshot = snap(engine);
      const entered = buildTournamentFields(snapshot);
      if (!entered) return;
      set({ snapshot, phase: "tournament", prep: null, ...entered });
      logScreen("Tournament", "Preparation done → field");
      record({ t: "prepDone" });
    },

    reroll() {
      const { engine, config, seed, data } = get();
      if (!engine || !config || !data) return;
      const ok = engine.reroll();
      const snapshot = snap(engine);
      set({ snapshot });
      if (ok) {
        debugSnap("reroll", engine, snapshot, config, seed, data, { rerollsLeft: snapshot.rerollsLeft });
        record({ t: "reroll" });
      }
    },

    startArenaTournament(user, opponents, simSeed) {
      const { data, config, snapshot, phase } = get();
      if (!data || !config || !snapshot?.score || phase !== "arenaWait") return;
      if (opponents.length !== 17) return; // сетка классики — ровно 18 команд
      // Тот же путь, что Real Tournament: явное поле вместо генерации. Сид симуляции ОБЩИЙ на
      // комнату, сила своей команды — из канонического поля (с эпсилоном), не из локального
      // счёта: все клиенты обязаны прогнать бит-в-бит один турнир (canonical-рассадка
      // buildResult сортирует по силе, id в неё не входит).
      const tournamentEngine = new TournamentEngine(
        data, config.format, simSeed, user.strength, user.name, 0, QUICK_DRAFT_FIELD, opponents,
      );
      logScreen("Tournament", "Arena: room locked → shared 18-team field");
      set({ phase: "tournament", tournamentEngine, tournament: tournamentEngine.snapshot, tournamentStep: 0, teamName: user.name });
    },

    rerollField() {
      const { tournament, snapshot, config, data, teamName, anteRun, selectedMode } = get();
      // Ante: поле этапа фиксировано по seed — перевыбора соперников нет (кнопка скрыта в UI).
      if (anteRun) return;
      // Real Tournament: поле — реальные составы события, перевыбор невозможен по смыслу.
      if (selectedMode === "tournament") return;
      if (!tournament || tournament.stage !== "field" || !snapshot?.score || !config || !data) return;
      record({ t: "fieldReroll" });
      const rebuilt = buildTournamentFields(snapshot, fieldRerollCount(get().actions));
      if (!rebuilt) return;
      set(rebuilt);
      logTournament(rebuilt.tournament, { teamName: teamName || "Aegis Five", teamOvr: snapshot.score.teamOvr, fieldReroll: true });
      persist();
    },

    canPickPlayer(idx) {
      return get().engine?.canPickPlayer(idx) ?? false;
    },

    canPickHero(heroId) {
      return get().engine?.canPickHero(heroId) ?? false;
    },

    reset() {
      clearSavedRun();
      set({
        phase: "start", engine: null, config: null, seed: "", snapshot: null, actions: [],
        resumable: null, error: null, tournamentEngine: null, tournament: null, tournamentStep: 0, resultsSeen: false,
        anteRun: null, ante: null, economy: null, economyView: null, camp: null, prep: null, tactics: null, boss: null, scoutedBoss: null,
      });
    },

    setSelectedMode(selectedMode) {
      set({ selectedMode });
    },

    setRealEventId(realEventId) {
      set({ realEventId });
    },

    setStartStep(startStep) {
      set({ startStep });
    },

    setStartConfig(next) {
      set((state) => ({ startConfig: typeof next === "function" ? next(state.startConfig) : next }));
    },

    setStartSeedInput(startSeedInput) {
      set({ startSeedInput });
    },

    setTeamName(name) {
      saveTeamName(name);
      set({ teamName: name });
    },

    resumeRun() {
      const { data, resumable } = get();
      if (!data || !resumable) return;
      try {
        // Real Tournament: поле и lock пересобираются из события детерминированно (сила поля не
        // зависит от сида). Событие могло выпасть из датасета после refresh — buildRealField
        // упадёт, и resume честно откажет через общий catch, а не молча ослабит lock.
        const resumedField = resumable.mode === "tournament" && resumable.realEventId
          ? buildRealField(data, resumable.realEventId)
          : null;
        const engine = new RunEngine(
          data, resumable.config, resumable.seed,
          resumedField ? { lockedAccounts: resumedField.lockedAccounts } : undefined,
        );
        replay(engine, resumable.actions);
        if (resumable.frozenRoster) {
          const score = engine.score();
          const replayed = score ? freezeRoster(engine.rosterView, score.assignment.byPlayer) : null;
          if (!replayed || !frozenRostersMatch(resumable.frozenRoster, replayed)) {
            throw new Error("Replay roster mismatch");
          }
        }
        let tournamentEngine: TournamentEngine | null = null;
        let tournament: TournamentSnapshot | null = null;
        let anteRun: AnteRunEngine | null = null;
        let ante: AnteRunState | null = null;
        let economy: RunEconomy | null = null;
        let tactics: TacticEvaluation | null = null;
        let boss: BossEvaluation | null = null;
        let inCamp = false;
        const savedStep = Math.max(0, Math.min(2, resumable.tournamentStep ?? 0));
        if (engine.isComplete) {
          const score = engine.score();
          if (!score) throw new Error("Completed draft has no score");
          const resolvedName = get().teamName.trim() || "Aegis Five";
          if (resumable.mode === "run") {
            // Ante-забег: пересобираем движок и перематываем на сохранённый этап (детерминизм —
            // пройденные этапы по seed те же), затем доигрываем reveal-шаги текущего этапа.
            anteRun = new AnteRunEngine(data, resumable.config.format, resumable.seed, score.teamOvr, resolvedName, undefined, stakesOf(resumable.config));
            // Верхней границы нет: забег мог уйти в Династию за пределы сезона (R6.3).
            const stageIndex = Math.max(0, resumable.anteStageIndex ?? 0);
            anteRun.jumpToStage(stageIndex, { seasonWon: resumable.anteSeasonWon === true });
            // Экономика: восстанавливаем валюту/покупки, применяем их модификаторы к полю этапа.
            economy = new RunEconomy(resumable.seed, resumable.economy);
            economy.setStakes(stakesOf(resumable.config));
            if (economy.snapshot.inCamp) {
              const economyState = economy.snapshot;
              if (economyState.preparedMarketOffers) {
                economy.replacePreparedMarketOffers(refreshAnteMarketOffers(
                  engine,
                  economy.campView().marketOffers,
                  marketCostFactor(resumable.seed, economyState.campStageIndex, undefined, stakesOf(resumable.config)),
                  economy.heroRarity,
                ));
              } else {
                economy.prepareMarketOffers(buildAnteMarketRoulette(
                  engine,
                  resumable.seed,
                  economyState.campStageIndex,
                  economyState.marketRerolls,
                  economy.equippedTactics,
                  {
                rarityDrops: economy.rarityDropsEnabled,
                stakes: stakesOf(resumable.config),
                stageCount: SEASON.stages.length,
                heroRarity: economy.heroRarity,
              },
                ));
              }
            }
            // Условные Tactics восстанавливаются из ростера, а не из сейва (их вклад — производная
            // состава); складываем с экономикой в поле этапа, чтобы resume совпал с исходным полем.
            const tacticCtx = buildTacticContext(
              engine.rosterView,
              score.assignment.byPlayer,
              data,
              economy.snapshot.campStageIndex,
            );
            tactics = evaluateTactics(economy.equippedTactics, tacticCtx, economy.cardCharges);
            // Та же композиция слоёв, что и в игре (game/runStrength.ts) — здесь она собиралась
            // руками третьей копией, и именно так копии разъезжаются.
            const strengthInput = {
              economy: economy.modifiers(),
              tactics: tactics.modifiers,
              heroRarity: economy.heroRarity,
              activeHeroes: engine.heroes,
            };
            const mods = runModifiers(strengthInput);
            // Босс восстанавливается из ростера (как tactics), а не из сейва: правило детерминировано
            // по seed+stage, штраф — производная состава. Без него resume дал бы более лёгкое поле.
            // Из сейва берётся ровно одно число — сколько раз правило перекуплено (T5.9).
            const bossRerolls = economy.bossRerollsFor(stageIndex);
            const bossId = bossForStage(resumable.seed, stageIndex, bossRerolls, stakesOf(resumable.config));
            boss = bossId
              ? evaluateBoss(bossId, {
                seed: resumable.seed,
                absoluteStageIndex: stageIndex,
                base: score.base + mods.base,
                heroSynergy: score.heroSynergy + mods.heroSynergy,
                chemistry: score.chemistry + mods.chemistry,
                playerOvrs: engine.players.map((p) => p.ovr),
                activeHeroes: engine.heroes,
                bannedHeroes: bannedHeroesForStage(resumable.seed, stageIndex, engine.allFormatHeroes, bossRerolls, stakesOf(resumable.config)),
                stakes: stakesOf(resumable.config),
                // Тот же `tacticCtx`, что уже собран выше для восстановления тактик.
                assignedHeroGames: tacticCtx.players.map((player) => player.assignedHeroGames),
                pairCoGames: tacticCtx.pairs.map((pair) => pair.games),
              })
              : null;
            anteRun.rebuildCurrentStage(
              runStageStrength(score.teamOvr, strengthInput, { bossPenalty: boss?.penalty }),
            );
            inCamp = economy.snapshot.inCamp;
            ante = anteRun.state;
            tournamentEngine = anteRun.tournament;
          } else if (resumedField) {
            // Подготовка к событию ещё не закрыта (RT-E) — поле не строим, возвращаемся в фазу prep.
            tournamentEngine = prepDoneIn(resumable.actions)
              ? new TournamentEngine(
                data, resumable.config.format, resumable.seed, score.teamOvr, resolvedName,
                0, QUICK_DRAFT_FIELD, rescoreRealField(data, resumedField, scoutedTeams(engine.prepPlan)).opponents,
              )
              : null;
          } else {
            const rerolls = fieldRerollCount(resumable.actions);
            tournamentEngine = new TournamentEngine(data, resumable.config.format, resumable.seed, score.teamOvr, resolvedName, rerolls);
          }
          // В Буткемпе следующий этап ещё не доигрывался — reveal не мотаем, поле свежее (step 0).
          const revealSteps = inCamp ? 0 : savedStep;
          if (tournamentEngine) {
            for (let step = 0; step < revealSteps; step += 1) tournamentEngine.advance();
            tournament = tournamentEngine.snapshot;
          }
        }
        const inPrep = engine.isComplete && resumable.mode === "tournament" && !prepDoneIn(resumable.actions);
        set({
          engine,
          config: resumable.config,
          seed: resumable.seed,
          selectedMode: resumable.mode,
          realEventId: resumable.realEventId ?? get().realEventId,
          realField: resumedField,
          startStep: "config",
          startConfig: resumable.config,
          actions: resumable.actions,
          snapshot: snap(engine),
          phase: inCamp ? "camp" : inPrep ? "prep" : engine.isComplete ? "tournament" : "draft",
          resumable: null,
          error: null,
          tournamentEngine,
          tournament,
          tournamentStep: inCamp ? 0 : savedStep,
          resultsSeen: false,
          anteRun,
          ante,
          economy,
          economyView: economy ? economy.snapshot : null,
          camp: inCamp && economy ? economy.campView() : null,
          prep: inPrep ? buildPrepView(engine, data, resumedField) : null,
          tactics,
          boss,
        });
        // Разведанный босс (R9.4) — только после того, как стор получил движок: оценка идёт
        // против ростера, а он живёт в сторе. Босса предстоящего этапа при этом не трогаем:
        // выше он уже посчитан по восстановленному состоянию.
        if (inCamp && ante) set({ scoutedBoss: campBosses(ante.index, tactics).scoutedBoss });
      } catch (e) {
        // Сейв не воспроизвёлся — сбрасываем; раньше баннер просто исчезал без объяснения.
        console.warn("[aegis] resume failed", e);
        clearSavedRun();
        set({ resumable: null, error: "resume.failed" });
      }
    },

    discardResume() {
      clearSavedRun();
      set({ resumable: null });
    },

    acceptPendingLink() {
      const { pendingLink, pendingLinkIssue } = get();
      // Невоспроизводимую ссылку не запускаем: паки на этих версиях будут другими, и
      // «тот же забег» окажется неправдой. UI объясняет причину, а не молча стартует.
      if (!pendingLink || pendingLinkIssue) return;
      clearSavedRun();
      set({
        pendingLink: null, pendingLinkIssue: null, resumable: null, selectedMode: pendingLink.mode,
        // Ссылка Real Tournament несёт событие (кодек без него её не разбирает) — оно и есть поле.
        ...(pendingLink.mode === "tournament" ? { realEventId: pendingLink.eventId ?? null } : {}),
      });
      get().start(pendingLink.config, pendingLink.seed);
      clearRunLinkHash();
    },

    dismissPendingLink() {
      set({ pendingLink: null, pendingLinkIssue: null });
      clearRunLinkHash();
    },

    syncLinkFromHash() {
      const { data } = get();
      // Без манифеста проверить совместимость нечем; loadData разберёт ссылку сам.
      if (!data || typeof window === "undefined") return;
      const link = runLinkFromHash(window.location.hash);
      if (!link) return;
      const { schemaVersion, ratingModelVersion } = data.manifest;
      set({ pendingLink: link, pendingLinkIssue: runLinkIssue(link, schemaVersion, ratingModelVersion, BALANCE_CONFIG_VERSION) });
    },

    advanceTournament() {
      const { tournamentEngine, tournamentStep, teamName, snapshot } = get();
      if (!tournamentEngine || !tournamentEngine.advance()) return;
      const tournament = tournamentEngine.snapshot;
      set({ tournament, tournamentStep: tournamentStep + 1 });
      const ovr = snapshot?.score?.teamOvr ?? 0;
      logTournament(tournament, { teamName: teamName || "Aegis Five", teamOvr: ovr });
      // Career и clearSavedRun — только в finishTournament после reveal итогов.
      persist();
    },

    completeTournamentPlayback() {
      const { tournamentEngine, tournamentStep, teamName, snapshot } = get();
      if (!tournamentEngine) return;
      // Исход НЕ пересчитывается: TournamentEngine считает весь турнир в конструкторе
      // (buildResult), а advance() двигает только стадию показа. Поэтому «Показать результат»
      // даёт байт-в-байт тот же snapshot, что и полный просмотр, не трогает seed и не заводит
      // второй «быстрый симулятор». Награду по-прежнему начисляет finishTournament() — он
      // идемпотентен по resultsSeen, и UI зовёт его, доиграв reveal до терминальной стадии.
      let step = tournamentStep;
      while (tournamentEngine.advance()) step += 1;
      if (step === tournamentStep) return;
      const tournament = tournamentEngine.snapshot;
      set({ tournament, tournamentStep: step });
      logTournament(tournament, { teamName: teamName || "Aegis Five", teamOvr: snapshot?.score?.teamOvr ?? 0 });
      persist();
    },

    finishTournament() {
      const { tournament, resultsSeen, anteRun, economy } = get();
      if (resultsSeen || !tournament || tournament.canAdvance) return;
      // Буткемп уже открыт для этого прохода — не разрешаем этап повторно (защита от двойного эффекта).
      if (anteRun && economy?.snapshot.inCamp) return;
      // Roguelite Run: этап доигран → решаем порог. Пройден и не последний → начисляем призовые и
      // открываем Буткемп (кнопка «В Буткемп»); победа/смерть → пишем карьеру и чистим сейв.
      if (anteRun) {
        const phase = anteRun.resolveStage();
        const resolvedAnte = anteRun.state;
        if (phase === "playing" && economy) {
          // resolveStage продвинул индекс на следующий этап; призовые — за только что пройденный.
          const patch = openCampAfterStage(resolvedAnte.index, resolvedAnte.lastPlacement);
          if (patch) set({ ante: resolvedAnte, ...patch });
          persist();
        } else {
          // Победа сезона банкуется СРАЗУ (R6.3), не дожидаясь выбора «завершить/Династия»:
          // сам факт победы от решения не зависит, а вкладку могут закрыть на экране итога.
          // Забег Династии, если игрок его выберет, пишется отдельной записью и в агрегаты не идёт.
          set({ ante: resolvedAnte, resultsSeen: true });
          recordCareer(
            tournament,
            { index: resolvedAnte.index, count: resolvedAnte.count },
            { seasonWon: resolvedAnte.seasonWon, dynasty: resolvedAnte.dynasty },
          );
          clearSavedRun();
        }
        return;
      }
      recordCareer(tournament);
      set({ resultsSeen: true });
      clearSavedRun();
    },

    continueDynasty() {
      const { anteRun, ante, economy } = get();
      if (!anteRun || !ante || ante.phase !== "won" || !economy) return;
      // Победа уже записана в карьеру и сейв очищен (см. finishTournament). Династия — это
      // продолжение ТОГО ЖЕ забега: ростер, билд и золото остаются, поэтому дальше идёт обычный
      // переход «этап пройден → Буткемп», просто за концом сезона.
      anteRun.continueDynasty();
      const next = anteRun.state;
      const patch = openCampAfterStage(next.index, ante.lastPlacement);
      if (!patch) return;
      set({ phase: "camp", ante: next, ...patch });
      persist();
    },

    enterCamp() {
      const { economy, phase } = get();
      // Буткемп открыт экономикой в finishTournament; здесь только переключаем UI-фазу.
      if (!economy || !economy.snapshot.inCamp || phase === "camp") return;
      const tactics = evaluateRunTactics();
      set({
        phase: "camp",
        economyView: economy.snapshot,
        camp: economy.campView(),
        tactics,
        ...campBosses(get().ante?.index ?? 0, tactics),
      });
    },

    previewTactic(tacticId) {
      const ctx = tacticContext();
      return ctx ? evaluateTactics([tacticId], ctx) : null;
    },
    chooseReward(offerId) {
      const { economy } = get();
      if (!economy) return;
      const reward = economy.campView().rewardOffers.find((offer) => offer.id === offerId);
      if (!economy.chooseReward(offerId)) return;
      // Взяли тактику — её trade-off меняет цены/размер рынка, пересобираем офферы.
      if (reward?.kind === "tactic") economy.invalidateMarketOffers();
      syncCamp();
    },

    buyMarket(offerId) {
      const { economy, engine } = get();
      if (!economy || !engine) return;
      const offer = economy.campView().marketOffers.find((candidate) => candidate.id === offerId);
      if (!offer) return;
      try {
        // Сначала проверяем payload на текущем ростере; золото списываем только после
        // успешной валидации, чтобы сломанный/устаревший оффер не съел валюту.
        let action: RunAction | null = null;
        let incomingPlayer: Candidate | null = null;
        if (offer.kind === "player" && offer.playerSwap) {
          incomingPlayer = engine.candidateByRef(offer.playerSwap.incoming);
          if (!incomingPlayer) return;
          if (engine.rosterView[offer.playerSwap.slotIndex].candidate?.player.accountId
            !== offer.playerSwap.outgoingAccountId) return;
          engine.previewPlayerReplacement(offer.playerSwap.slotIndex, incomingPlayer);
          action = { t: "replacePlayer", slotIndex: offer.playerSwap.slotIndex, incoming: offer.playerSwap.incoming };
        } else if (offer.kind === "hero" && offer.heroSwap) {
          engine.previewHeroReplacement(offer.heroSwap.outgoingHeroId, offer.heroSwap.incomingHeroId);
          action = { t: "replaceHero", ...offer.heroSwap };
        }
        if (!economy.purchaseMarket(offerId)) return;
        if (offer.kind === "player" && offer.playerSwap && incomingPlayer) {
          engine.replacePlayer(offer.playerSwap.slotIndex, incomingPlayer);
        } else if (offer.kind === "hero" && offer.heroSwap) {
          engine.replaceHero(offer.heroSwap.outgoingHeroId, offer.heroSwap.incomingHeroId);
          // Срез 3b: входящий на re-pick герой роллит редкость по этапу (лут прогрессии).
          // Детерминизм по seed+heroId+stage — совпадает с превью на карте.
          economy.rollHeroRarity(offer.heroSwap.incomingHeroId, economy.snapshot.campStageIndex);
        }
        const snapshot = snap(engine);
        economy.replacePreparedMarketOffers(refreshAnteMarketOffers(
          engine,
          economy.campView().marketOffers,
          marketCostFactor(get().seed, economy.snapshot.campStageIndex, undefined, stakesOf(get().config)),
          economy.heroRarity,
        ));
        // Замена меняет состав → условные Tactics пересчитываются (напр. new star гасит No Superstars).
        set({ snapshot, economyView: economy.snapshot, camp: economy.campView(), tactics: evaluateRunTactics() });
        if (action) record(action);
        else persist();
      } catch {
        /* stale/invalid structural offer: leave state untouched */
      }
    },

    rerollMarket() {
      const { economy } = get();
      if (!economy || !economy.rerollMarket()) return;
      syncCamp();
    },

    discardTactic(tacticId) {
      const { economy, phase } = get();
      if (!economy || phase !== "camp" || !economy.discardTactic(tacticId)) return;
      // Тактика меняет цены/размер рынка (её trade-off) — пересобираем офферы под новый набор.
      economy.invalidateMarketOffers();
      syncCamp();
    },

    enchantCard(cardId, edition) {
      const { economy, phase } = get();
      if (!economy || phase !== "camp" || !economy.enchantCard(cardId, edition)) return;
      // Зачарование меняет пул edition-офферов рулетки (карта уже Charged — «зарядить» её
      // больше нечего) — пересобираем рынок, как это делает discard/trade.
      economy.invalidateMarketOffers();
      syncCamp();
    },

    tradeCard(outgoingId, incomingId) {
      const { economy, phase } = get();
      if (!economy || phase !== "camp" || !economy.tradeCard(outgoingId, incomingId)) return;
      // Смена карты билда меняет и условные тактики, и market trade-off'ы — как discard+взятие.
      economy.invalidateMarketOffers();
      syncCamp();
    },

    rerollTrade() {
      const { economy, phase } = get();
      if (!economy || phase !== "camp" || !economy.rerollTrade()) return;
      syncCamp();
    },

    discardAction(actionId) {
      const { economy, phase } = get();
      if (!economy || phase !== "camp" || !economy.discardAction(actionId)) return;
      syncCamp();
    },

    playCampAction(actionId) {
      const { economy, phase } = get();
      if (!economy || phase !== "camp" || !economy.playCampAction(actionId)) return;
      // Разведка даёт бесплатный реролл — рынок пересобираем, чтобы он был доступен сразу.
      economy.invalidateMarketOffers();
      syncCamp();
    },

    buyPrep() {
      const { economy, phase } = get();
      if (!economy || phase !== "camp" || !economy.buyPrep()) return;
      // Временный эффект меняет силу состава ⇒ пересчёт босса и превью рынка идут через syncCamp.
      syncCamp();
    },

    rerollBoss() {
      const { economy, phase } = get();
      if (!economy || phase !== "camp" || !economy.rerollBoss()) return;
      syncCamp();
    },

    buyScouting() {
      const { economy, phase } = get();
      if (!economy || phase !== "camp" || !economy.buyScouting()) return;
      syncCamp();
    },

    upgradeHeroRarity(heroId) {
      const { economy, engine, phase } = get();
      // Улучшать можно только активного героя в Буткемпе; редкость меняет силу → пересчёт camp.
      if (!economy || !engine || phase !== "camp") return;
      if (!engine.heroes.includes(heroId)) return;
      if (!economy.upgradeHeroRarity(heroId)) return;
      syncCamp();
    },

    swapReservePlayer(slotIndex, benchAccountId) {
      const { engine, phase } = get();
      if (!engine || phase !== "camp") return;
      try {
        engine.swapReservePlayer(slotIndex, benchAccountId);
        set({ snapshot: snap(engine) });
        syncCamp();
        record({ t: "swapReservePlayer", slotIndex, benchAccountId });
      } catch {
        /* invalid role/slot */
      }
    },

    swapReserveHero(outgoingHeroId, reserveHeroId) {
      const { engine, phase } = get();
      if (!engine || phase !== "camp") return;
      try {
        engine.swapReserveHero(outgoingHeroId, reserveHeroId);
        set({ snapshot: snap(engine) });
        syncCamp();
        record({ t: "swapReserveHero", outgoingHeroId, reserveHeroId });
      } catch {
        /* invalid hero swap */
      }
    },

    advanceAnteStage() {
      const { anteRun, ante, economy, snapshot } = get();
      if (!anteRun || !ante || ante.phase !== "playing" || !snapshot?.score) return;
      // Выходим из Буткемпа и пересобираем поле следующего этапа под итоговый effectiveTeamOvr
      // (base teamOvr + покупки + Tactics − штраф босса этого этапа). Турнир текущего этапа
      // рендерится тем же экраном. Tactics/boss снимаем ДО leaveCamp — состав финальный.
      const tactics = economy ? evaluateRunTactics() : null;
      const boss = evaluateRunBoss(ante.index, tactics);
      economy?.leaveCamp();
      if (economy) anteRun.rebuildCurrentStage(stageStrength(snapshot.score.teamOvr, tactics, boss));
      set({
        phase: "tournament",
        tournamentEngine: anteRun.tournament,
        tournament: anteRun.tournament.snapshot,
        tournamentStep: 0,
        resultsSeen: false,
        ante: anteRun.state,
        economyView: economy ? economy.snapshot : null,
        camp: null,
        tactics,
        boss,
        campCelebration: false,
      });
      persist();
    },

    dismissCampCelebration() {
      if (get().campCelebration) set({ campCelebration: false });
    },

    restartSameConfig() {
      const { config } = get();
      if (!config) return;
      get().start(config, createRunSeed());
    },
  };
});
