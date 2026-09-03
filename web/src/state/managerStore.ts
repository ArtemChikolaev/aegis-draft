// Стор Esports Manager (T5.5). Отдельный от runStore по границе game-state-architecture:
// mode shell (`selectedMode`) живёт в runStore, а долгий сейв менеджера — свой мир со своим
// движком. Данные (GameData) стор берёт из runStore: их грузит один loadData на всё приложение.
//
// Персист — снапшот состояния (long-save), локальный (решение M-D: сервер T8.4 не задеплоен;
// формат совместим с будущим облаком — это тот же blob). Совместимость — те же оси, что у
// SavedRun: schema/rating/dataHash + версия экономики менеджера.
import { create } from "zustand";
import type { GameData } from "../types/data.ts";
import { MANAGER_ECONOMY_VERSION, type ManagerDifficulty, type ManagerRegion } from "../game/manager/economy.ts";
import { ManagerEngine, type ManagerConfig, type ManagerState } from "../game/manager/engine.ts";
import { emptyHall, recordCareerStart, recordSeason, type HallState } from "../game/manager/hall.ts";
import { createRunSeed } from "../game/rng.ts";
import { readPersisted, removePersisted, writePersisted } from "./persist.ts";
import { sameDataset } from "./dataVersions.ts";
import { useRun } from "./runStore.ts";

const KEY = "aegis:manager:v1";
/** Hall of Legends — межкарьерная память: НЕ инвалидируется версиями данных/экономики
 *  (трофейная комната переживает и wipe карьеры, и апдейты датасета). */
const HALL_KEY = "aegis:manager:hall:v1";

export interface SavedManager {
  schemaVersion: number;
  ratingModelVersion: string;
  dataHash?: string;
  economyVersion: string;
  state: ManagerState;
}

/** Совместимость long-save: общий штамп датасета (dataVersions) + версия экономики менеджера. */
export function isSavedManagerCompatible(saved: SavedManager, data: GameData): boolean {
  return saved.economyVersion === MANAGER_ECONOMY_VERSION && sameDataset(saved, data.manifest);
}

/** Сводка совместимого сейва для баннеров resume (стартовый экран + онбординг режима). */
export interface ManagerResumeInfo {
  orgName: string;
  season: number;
}

interface ManagerStore {
  /** null — карьеры нет (онбординг). Движок держит state по ссылке — после каждого действия
   *  зовём touch() для нового снапшота в сторе. */
  engine: ManagerEngine | null;
  /** Совместимый сейв найден, но карьера ещё не возобновлена (баннер Resume). */
  resumable: ManagerResumeInfo | null;
  /** hydrate уже отработал: до этого не понять, показывать онбординг или продолжать сейв. */
  hydrated: boolean;
  /** Карьера «открыта» на экране (как classic-забег в своей фазе). Вход в режим всегда
   *  показывает онбординг новой карьеры; в открытую карьеру ведёт только плашка resume. */
  careerOpen: boolean;
  /** Hall of Legends — межкарьерные рекорды и коллекция игроков. */
  hall: HallState;
  version: number;
  setCareerOpen: (open: boolean) => void;

  hydrate: () => Promise<void>;
  startCareer: (orgName: string, region: ManagerRegion, difficulty: ManagerDifficulty) => void;
  resumeCareer: () => Promise<void>;
  abandonCareer: () => void;
  /** Применить действие движка и зафиксировать снапшот (persist + перерисовка). */
  act: (fn: (engine: ManagerEngine) => void) => void;
}

function dataOrNull(): GameData | null {
  return useRun.getState().data;
}

async function readSaved(data: GameData): Promise<ManagerState | null> {
  try {
    const raw = await readPersisted(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedManager;
    if (saved.state?.v !== 1 || !isSavedManagerCompatible(saved, data)) return null;
    return saved.state;
  } catch {
    return null;
  }
}

function persist(state: ManagerState, data: GameData): void {
  const saved: SavedManager = {
    schemaVersion: data.manifest.schemaVersion,
    ratingModelVersion: data.manifest.ratingModelVersion,
    dataHash: data.manifest.dataHash,
    economyVersion: MANAGER_ECONOMY_VERSION,
    state,
  };
  void writePersisted(KEY, JSON.stringify(saved));
}

function persistHall(hall: HallState): void {
  void writePersisted(HALL_KEY, JSON.stringify(hall));
}

export const useManager = create<ManagerStore>((set, get) => ({
  engine: null,
  resumable: null,
  hydrated: false,
  careerOpen: false,
  hall: emptyHall(),
  version: 0,

  setCareerOpen(open) {
    set({ careerOpen: open });
  },

  async hydrate() {
    const data = dataOrNull();
    if (!data || get().engine) return;
    const saved = await readSaved(data);
    let hall = get().hall;
    try {
      const rawHall = await readPersisted(HALL_KEY);
      if (rawHall) {
        const parsed = JSON.parse(rawHall) as HallState;
        if (parsed.v === 1) hall = parsed;
      }
    } catch {
      // битый зал — начинаем с пустого, карьеру это не трогает
    }
    set({ resumable: saved ? { orgName: saved.config.orgName, season: saved.season } : null, hydrated: true, hall });
  },

  startCareer(orgName, region, difficulty) {
    const data = dataOrNull();
    if (!data) return;
    const config: ManagerConfig = { orgName: orgName.trim(), region, difficulty, format: "last_2y" };
    const engine = ManagerEngine.create(data, createRunSeed(), config);
    persist(engine.state, data);
    const hall = recordCareerStart(get().hall);
    persistHall(hall);
    set({ engine, resumable: null, careerOpen: true, hall, version: get().version + 1 });
  },

  async resumeCareer() {
    const data = dataOrNull();
    if (!data) return;
    const saved = await readSaved(data);
    if (!saved) {
      set({ resumable: null });
      return;
    }
    set({ engine: new ManagerEngine(data, saved), resumable: null, version: get().version + 1 });
  },

  abandonCareer() {
    void removePersisted(KEY);
    set({ engine: null, resumable: null, careerOpen: false, version: get().version + 1 });
  },

  act(fn) {
    const { engine, version } = get();
    const data = dataOrNull();
    if (!engine || !data) return;
    const phaseBefore = engine.state.phase;
    fn(engine);
    persist(engine.state, data);
    // Переход season → offseason = сезон доигран: фиксируем его в Hall of Legends
    // (ростер ещё сезонный — замены оффсезона не применены).
    if (phaseBefore === "season" && engine.state.phase === "offseason") {
      const hall = recordSeason(get().hall, engine.state);
      persistHall(hall);
      set({ hall, version: version + 1 });
      return;
    }
    set({ version: version + 1 });
  },
}));
