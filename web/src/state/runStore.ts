// Zustand-адаптер поверх RunEngine (T3.5). Вся логика — в движке; стор лишь хранит
// инстанс и снимок для рендера (граница из CLAUDE.md: game/ не зависит от ui/).
// Персист (game-state-architecture): забег сохраняется как config+seed+лог действий и
// восстанавливается детерминированным replay; имя команды — отдельная durable-настройка.
import { create } from "zustand";
import { RunEngine, type RosterSlot } from "../game/engine.ts";
import type { RunConfig, DraftPack } from "../game/packs.ts";
import { StaticDataSource } from "../data/DataSource.ts";
import type { GameData } from "../types/data.ts";
import type { ScoreBreakdown } from "../game/score.ts";
import { TournamentEngine, fieldRerollCount, type TournamentSnapshot } from "../game/tournament.ts";
import { AnteRunEngine, ANTE_TARGETS, type AnteRunState } from "../game/anteRun.ts";
import { createRunSeed } from "../game/rng.ts";
import { buildCareerEntry, useCareer } from "./careerStore.ts";
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
type Phase = "loading" | "start" | "draft" | "tournament";
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
  /** Вызывать, когда UI доиграл playoffs reveal до итоговой таблицы (не при входе в стадию). */
  finishTournament: () => void;
  /** Roguelite Run: перейти к следующему этапу после пройденного порога (кнопка «Next stage»). */
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

function snap(engine: RunEngine): Snapshot {
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
  }
}

export const useRun = create<RunStore>((set, get) => {
  // Сохранить текущий забег (config+seed+лог) под версию активного датасета.
  // Плей-офф с canAdvance=false — ещё НЕ финал для игрока: идёт reveal-анимация.
  // Сейв чистим только после finishTournament (reveal доигран до экрана результатов).
  const persist = () => {
    const { data, config, seed, selectedMode, actions, tournamentStep, tournamentEngine, engine, resultsSeen, anteRun } = get();
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
      dataBuiltAt: data.manifest.builtAt,
      mode: selectedMode,
      config,
      seed,
      actions,
      tournamentStep,
      tournamentStarted: tournamentEngine != null,
      frozenRoster: frozenRoster ?? undefined,
      anteStageIndex: anteRun ? anteRun.state.index : undefined,
    });
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
      return {
        anteRun, ante: anteRun.state,
        tournamentEngine: anteRun.tournament, tournament: anteRun.tournament.snapshot,
        tournamentStep: 0, teamName: resolvedName,
      };
    }
    const tournamentEngine = new TournamentEngine(data, config.format, seed, snapshot.score.teamOvr, resolvedName, rerolls);
    return {
      anteRun: null, ante: null,
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

    async loadData() {
      try {
        // Сейв и имя команды читаем ПАРАЛЛЕЛЬНО с данными: в Telegram это поход в CloudStorage,
        // и последовательные ожидания сложились бы в заметную паузу перед стартовым экраном.
        const [data, rawSaved, savedTeamName] = await Promise.all([
          new StaticDataSource().load(),
          loadSavedRunAsync(),
          loadTeamNameAsync(),
        ]);
        const { schemaVersion, ratingModelVersion, builtAt } = data.manifest;
        // Пустой actions = только стартовали; первый пак уже зафиксирован seed'ом — resume нужен.
        const saved = isSavedRunResumable(rawSaved, schemaVersion, ratingModelVersion, builtAt)
          ? rawSaved
          : null;
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
          pendingLinkIssue: link ? runLinkIssue(link, schemaVersion, ratingModelVersion) : null,
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
          anteRun: null, ante: null,
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
        const { anteRun, tournament } = get();
        if (tournament?.stage === "field" && snapshot.score) {
          if (anteRun) {
            // Ante: пересобираем поле ТЕКУЩЕГО этапа под новый teamOvr, прогресс сохраняется
            // (fresh AnteRunEngine сбросил бы забег на этап 0).
            anteRun.rebuildCurrentStage(snapshot.score.teamOvr);
            set({ snapshot, anteRun, ante: anteRun.state, tournamentEngine: anteRun.tournament, tournament: anteRun.tournament.snapshot, tournamentStep: 0 });
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
        anteRun: null, ante: null,
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
        const tournamentStep = Math.max(0, Math.min(2, resumable.tournamentStep ?? 0));
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
            ante = anteRun.state;
            tournamentEngine = anteRun.tournament;
          } else {
            const rerolls = fieldRerollCount(resumable.actions);
            tournamentEngine = new TournamentEngine(data, resumable.config.format, resumable.seed, score.teamOvr, resolvedName, rerolls);
          }
          for (let step = 0; step < tournamentStep; step += 1) tournamentEngine.advance();
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
          phase: engine.isComplete ? "tournament" : "draft",
          resumable: null,
          error: null,
          tournamentEngine,
          tournament,
          tournamentStep,
          resultsSeen: false,
          anteRun,
          ante,
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
      set({ pendingLink: link, pendingLinkIssue: runLinkIssue(link, schemaVersion, ratingModelVersion) });
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

    finishTournament() {
      const { tournament, resultsSeen, anteRun } = get();
      if (resultsSeen || !tournament || tournament.canAdvance) return;
      // Roguelite Run: этап доигран → решаем порог. Пройден и не последний → забег жив
      // (кнопка «Next stage»); победа/смерть → пишем карьеру и чистим сейв, как Quick Draft.
      if (anteRun) {
        const phase = anteRun.resolveStage();
        const resolvedAnte = anteRun.state;
        set({ ante: resolvedAnte, resultsSeen: true });
        if (phase === "playing") {
          persist();
        } else {
          recordCareer(tournament, { index: resolvedAnte.index, count: resolvedAnte.count });
          clearSavedRun();
        }
        return;
      }
      recordCareer(tournament);
      set({ resultsSeen: true });
      clearSavedRun();
    },

    advanceAnteStage() {
      const { anteRun, ante } = get();
      if (!anteRun || !ante || ante.phase !== "playing") return;
      // resolveStage уже перевёл движок на следующий этап (stage "field") — подставляем его
      // турнир в тот же tournamentEngine/tournament, что рендерит экран; reveal сбросится.
      set({
        tournamentEngine: anteRun.tournament,
        tournament: anteRun.tournament.snapshot,
        tournamentStep: 0,
        resultsSeen: false,
        ante: anteRun.state,
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
