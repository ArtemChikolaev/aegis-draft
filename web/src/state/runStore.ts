// Zustand-адаптер поверх RunEngine (T3.5). Вся логика — в движке; стор лишь хранит
// инстанс и снимок для рендера (граница из CLAUDE.md: game/ не зависит от ui/).
// Персист (game-state-architecture): забег сохраняется как config+seed+лог действий и
// восстанавливается детерминированным replay; имя команды — отдельная durable-настройка.
import { create } from "zustand";
import { RunEngine, type RosterSlot } from "../game/engine.ts";
import type { RunConfig, DraftPack, Candidate } from "../game/packs.ts";
import { StaticDataSource } from "../data/DataSource.ts";
import type { GameData } from "../types/data.ts";
import type { ScoreBreakdown } from "../game/score.ts";
import { TournamentEngine, fieldRerollCount, type TournamentSnapshot } from "../game/tournament.ts";
import { AnteRunEngine, ANTE_TARGETS, type AnteRunState } from "../game/anteRun.ts";
import { RunEconomy, type CampView, type RunEconomyState, type SummandModifiers } from "../game/anteEconomy.ts";
import { buildAnteMarketRoulette, refreshAnteMarketOffers } from "../game/anteMarket.ts";
import { buildTacticContext, evaluateTactics, type TacticEvaluation } from "../game/tactics.ts";
import { bannedHeroesForStage, bossForStage, evaluateBoss, type BossEvaluation } from "../game/bossConditions.ts";
import { evaluateItems, protectedBossPenalty } from "../game/items.ts";
import { runModifiers, stageStrength as runStageStrength } from "../game/runStrength.ts";
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
import { clearRunLinkHash, runLinkFromHash, runLinkIssue, type RunLink, type RunLinkIssue } from "./runLink.ts";

// Бесшовный Classic-флоу (TREF-TOUR2): после драфта нет отдельного экрана-итога —
// сразу непрерывный `tournament`-вид (разбор счёта + поле + одна CTA «Симулировать»).
// Roguelite Run добавляет фазу "camp" (Буткемп между этапами: reward + market), см. T5.2.
type Phase = "loading" | "start" | "draft" | "tournament" | "camp";
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

interface Snapshot {
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
}

export interface ReservePlayerView {
  candidate: Candidate;
  previews: Array<{ slotIndex: number; score: ScoreBreakdown }>;
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
  /** Вклад экипированных Tactics при текущем ростере + причины срабатывания (срез 4).
   *  Отдельно от `camp`, потому что условия зависят от состава и пересчитываются на каждый swap. */
  tactics: TacticEvaluation | null;
  /** Boss condition ПРЕДСТОЯЩЕГО этапа против текущего ростера (срез 5): правило + `до→после`.
   *  null — у этапа нет правила. Пересчитывается на каждый swap, как tactics. */
  boss: BossEvaluation | null;

  loadData: () => Promise<void>;
  start: (config: RunConfig, seed: string) => void;
  pickPlayer: (idx: number) => void;
  pickHero: (heroId: number) => void;
  canPickPlayer: (idx: number) => boolean;
  canPickHero: (heroId: number) => boolean;
  assign: (accountId: number, heroId: number) => void;
  swapHeroes: (accountIdA: number, accountIdB: number) => void;
  reroll: () => void;
  rerollField: () => void;
  reset: () => void;
  setSelectedMode: (mode: RunMode | null) => void;
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
  /** Буткемп: выбрать одну reward-карту (бесплатно, один раз). */
  chooseReward: (offerId: string) => void;
  /** Буткемп: купить market-оффер за золото. */
  buyMarket: (offerId: string) => void;
  /** Буткемп: реролл рынка за золото. */
  rerollMarket: () => void;
  /** Буткемп: снять пассивную тактику, освободив слот. */
  discardTactic: (tacticId: string) => void;
  /** Буткемп: выбросить неразыгранное одноразовое действие. */
  discardAction: (actionId: string) => void;
  /** Буткемп: разыграть одноразовое Camp Action (эффект живёт один следующий этап). */
  playCampAction: (actionId: string) => void;
  /** Буткемп: улучшить редкость активного героя за золото (срез 3b). */
  upgradeHeroRarity: (heroId: number) => void;
  /** Буткемп: поменять активного игрока на единственного запасного той же роли. */
  swapReservePlayer: (slotIndex: number, benchAccountId: number) => void;
  /** Буткемп: поменять активного героя на героя из малого резервного пула. */
  swapReserveHero: (outgoingHeroId: number, reserveHeroId: number) => void;
  /** Roguelite Run: выйти из Буткемпа и играть следующий этап (кнопка «Next stage»). */
  advanceAnteStage: () => void;
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
  if (config?.hardMode === true && (phase === "draft" || phase === "tournament")) return true;
  // Незавершённый хардкорный забег в сейве тоже запирает справочник: иначе достаточно
  // перезагрузить страницу (забег ещё не возобновлён), подсмотреть и продолжить.
  return resumable?.config.hardMode === true;
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
  }
}

export const useRun = create<RunStore>((set, get) => {
  // Сохранить текущий забег (config+seed+лог) под версию активного датасета.
  // Плей-офф с canAdvance=false — ещё НЕ финал для игрока: идёт reveal-анимация.
  // Сейв чистим только после finishTournament (reveal доигран до экрана результатов).
  const persist = () => {
    const { data, config, seed, selectedMode, actions, tournamentStep, tournamentEngine, engine, resultsSeen, anteRun, economy } = get();
    if (!data || !config || !selectedMode) return;
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
      economy: economy ? economy.snapshot : undefined,
      // Только Roguelite Run зависит от коэффициентов баланса — остальным режимам ключ не нужен.
      balanceConfigVersion: selectedMode === "run" ? BALANCE_CONFIG_VERSION : undefined,
    });
  };
  // Пересчитать вклад экипированных Tactics от ТЕКУЩЕГО ростера. Вызывать после любого swap:
  // условия карточек («сыгранные пары», «нет суперзвёзд», «одна эпоха») зависят от состава,
  // поэтому кэшировать их как разовую дельту нельзя — этим они и отличаются от покупок.
  const evaluateRunTactics = (): TacticEvaluation | null => {
    const { economy, engine, data } = get();
    const score = engine?.score();
    if (!economy || !engine || !data || !score) return null;
    const ctx = buildTacticContext(
      engine.rosterView,
      score.assignment.byPlayer,
      data,
      economy.snapshot.campStageIndex,
    );
    return evaluateTactics(economy.equippedTactics, ctx);
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
    const { engine, seed } = get();
    const score = engine?.score();
    if (!engine || !score) return null;
    const bossId = bossForStage(seed, stageIndex);
    if (!bossId) return null;
    const mods = effectiveModifiers(tactics);
    const items = runItems();
    const raw = evaluateBoss(bossId, {
      base: score.base + mods.base,
      heroSynergy: score.heroSynergy + mods.heroSynergy,
      chemistry: score.chemistry + mods.chemistry,
      playerOvrs: engine.players.map((p) => p.ovr),
      activeHeroes: engine.heroes,
      bannedHeroes: bannedHeroesForStage(seed, stageIndex, engine.allFormatHeroes),
    });
    // Предметы-защита смягчают штраф, но не отменяют правило (R8.3).
    return { ...raw, penalty: protectedBossPenalty(raw.penalty, items) };
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
                stageCount: ANTE_TARGETS.length,
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
      boss: evaluateRunBoss(upcoming, tactics),
    });
    persist();
  };
  // Записать действие в лог и сохранить.
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
      const anteRun = new AnteRunEngine(data, config.format, seed, snapshot.score.teamOvr, resolvedName);
      const economy = new RunEconomy(seed);
      // Мета-гейт редкости (срез 3b, R3.1): в первом-ever roguelite-забеге не выпадают СЛУЧАЙНЫЕ
      // повышенные качества — но ручное улучшение в Буткемпе доступно сразу, иначе первый забег
      // вообще не показывает систему качества (баг PF-8). Считаем по истории careerStore
      // (T6.4-lite до появления Штаба).
      const rogueliteRuns = careerEntriesForMode(useCareer.getState().entries, "run").length;
      economy.setRarityFlags({ drops: rogueliteRuns >= 1, upgrades: true });
      economy.setUnlimitedGold(config.cheatMode === true);
      return {
        anteRun, ante: anteRun.state, economy, economyView: economy.snapshot, camp: null,
        tactics: null, boss: null,
        tournamentEngine: anteRun.tournament, tournament: anteRun.tournament.snapshot,
        tournamentStep: 0, teamName: resolvedName,
      };
    }
    const tournamentEngine = new TournamentEngine(data, config.format, seed, snapshot.score.teamOvr, resolvedName, rerolls);
    return {
      anteRun: null, ante: null, economy: null, economyView: null, camp: null, tactics: null, boss: null,
      tournamentEngine, tournament: tournamentEngine.snapshot, tournamentStep: 0, teamName: resolvedName,
    };
  };
  const recordCareer = (tournament: TournamentSnapshot, rogueliteStage?: { index: number; count: number }) => {
    const { data, config, seed, snapshot, selectedMode } = get();
    if (tournament.canAdvance || !data || !config || !snapshot?.score || !snapshot.isComplete) return;
    useCareer.getState().record(buildCareerEntry({
      seed,
      datasetSchemaVersion: data.manifest.schemaVersion,
      ratingModelVersion: data.manifest.ratingModelVersion,
      config,
      mode: selectedMode ?? undefined,
      rogueliteStage,
      score: snapshot.score,
      roster: snapshot.roster,
      tournament,
    }));
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
    tactics: null, boss: null,

    async loadData() {
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
        const link = typeof window === "undefined" ? null : runLinkFromHash(window.location.hash);
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
      const { data } = get();
      if (!data) return;
      try {
        const engine = new RunEngine(data, config, seed);
        const snapshot = snap(engine);
        set({
          engine, config, seed, phase: "draft", snapshot, actions: [], resumable: null, error: null,
          startStep: "config", startConfig: config,
          tournamentEngine: null, tournament: null, tournamentStep: 0, resultsSeen: false,
          anteRun: null, ante: null, economy: null, economyView: null, camp: null, tactics: null, boss: null,
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
      const entered = engine.isComplete ? buildTournamentFields(snapshot) : null;
      set(entered ? { snapshot, phase: "tournament", ...entered } : { snapshot, phase: "draft" });
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
      const entered = engine.isComplete ? buildTournamentFields(snapshot) : null;
      set(entered ? { snapshot, phase: "tournament", ...entered } : { snapshot, phase: "draft" });
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

    rerollField() {
      const { tournament, snapshot, config, data, teamName, anteRun } = get();
      // Ante: поле этапа фиксировано по seed — перевыбора соперников нет (кнопка скрыта в UI).
      if (anteRun) return;
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
        anteRun: null, ante: null, economy: null, economyView: null, camp: null, tactics: null, boss: null,
      });
    },

    setSelectedMode(selectedMode) {
      set({ selectedMode });
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
        const engine = new RunEngine(data, resumable.config, resumable.seed);
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
            anteRun = new AnteRunEngine(data, resumable.config.format, resumable.seed, score.teamOvr, resolvedName);
            const stageIndex = Math.max(0, Math.min(ANTE_TARGETS.length - 1, resumable.anteStageIndex ?? 0));
            anteRun.jumpToStage(stageIndex);
            // Экономика: восстанавливаем валюту/покупки, применяем их модификаторы к полю этапа.
            economy = new RunEconomy(resumable.seed, resumable.economy);
            if (economy.snapshot.inCamp) {
              const economyState = economy.snapshot;
              if (economyState.preparedMarketOffers) {
                economy.replacePreparedMarketOffers(refreshAnteMarketOffers(
                  engine,
                  economy.campView().marketOffers,
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
                stageCount: ANTE_TARGETS.length,
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
            tactics = evaluateTactics(economy.equippedTactics, tacticCtx);
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
            const bossId = bossForStage(resumable.seed, stageIndex);
            boss = bossId
              ? evaluateBoss(bossId, {
                base: score.base + mods.base,
                heroSynergy: score.heroSynergy + mods.heroSynergy,
                chemistry: score.chemistry + mods.chemistry,
                playerOvrs: engine.players.map((p) => p.ovr),
                activeHeroes: engine.heroes,
                bannedHeroes: bannedHeroesForStage(resumable.seed, stageIndex, engine.allFormatHeroes),
              })
              : null;
            anteRun.rebuildCurrentStage(
              runStageStrength(score.teamOvr, strengthInput, { bossPenalty: boss?.penalty }),
            );
            inCamp = economy.snapshot.inCamp;
            ante = anteRun.state;
            tournamentEngine = anteRun.tournament;
          } else {
            const rerolls = fieldRerollCount(resumable.actions);
            tournamentEngine = new TournamentEngine(data, resumable.config.format, resumable.seed, score.teamOvr, resolvedName, rerolls);
          }
          // В Буткемпе следующий этап ещё не доигрывался — reveal не мотаем, поле свежее (step 0).
          const revealSteps = inCamp ? 0 : savedStep;
          for (let step = 0; step < revealSteps; step += 1) tournamentEngine.advance();
          tournament = tournamentEngine.snapshot;
        }
        set({
          engine,
          config: resumable.config,
          seed: resumable.seed,
          selectedMode: resumable.mode,
          startStep: "config",
          startConfig: resumable.config,
          actions: resumable.actions,
          snapshot: snap(engine),
          phase: inCamp ? "camp" : engine.isComplete ? "tournament" : "draft",
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
          tactics,
          boss,
        });
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
      set({ pendingLink: null, pendingLinkIssue: null, resumable: null, selectedMode: pendingLink.mode });
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
          const campId = resolvedAnte.index;
          const target = ANTE_TARGETS[campId - 1];
          economy.awardStageClear(campId, resolvedAnte.lastPlacement, target);
          economy.openCamp(campId);
          const economyState = economy.snapshot;
          const engine = get().engine;
          if (engine) {
            economy.prepareMarketOffers(buildAnteMarketRoulette(
              engine,
              get().seed,
              economyState.campStageIndex,
              economyState.marketRerolls,
              economy.equippedTactics,
              {
                rarityDrops: economy.rarityDropsEnabled,
                stageCount: ANTE_TARGETS.length,
                heroRarity: economy.heroRarity,
              },
            ));
          }
          const campTactics = evaluateRunTactics();
          set({
            ante: resolvedAnte,
            resultsSeen: false,
            economyView: economy.snapshot,
            camp: economy.campView(),
            tactics: campTactics,
            // Босс ПРЕДСТОЯЩЕГО этапа (resolvedAnte.index) — превью для адаптации в Буткемпе.
            boss: evaluateRunBoss(resolvedAnte.index, campTactics),
          });
          persist();
        } else {
          set({ ante: resolvedAnte, resultsSeen: true });
          recordCareer(tournament, { index: resolvedAnte.index, count: resolvedAnte.count });
          clearSavedRun();
        }
        return;
      }
      recordCareer(tournament);
      set({ resultsSeen: true });
      clearSavedRun();
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
        boss: evaluateRunBoss(get().ante?.index ?? 0, tactics),
      });
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
      });
      persist();
    },

    restartSameConfig() {
      const { config } = get();
      if (!config) return;
      get().start(config, createRunSeed());
    },
  };
});
