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
import { createRunSeed } from "../game/rng.ts";
import { readPersisted, removePersisted, writePersisted } from "./persist.ts";
import { useRun } from "./runStore.ts";

const KEY = "aegis:manager:v1";

interface SavedManager {
  schemaVersion: number;
  ratingModelVersion: string;
  dataHash?: string;
  economyVersion: string;
  state: ManagerState;
}

function isSavedManagerCompatible(saved: SavedManager, data: GameData): boolean {
  const m = data.manifest;
  const sameData = saved.dataHash ? saved.dataHash === m.dataHash : false;
  return (
    saved.schemaVersion === m.schemaVersion &&
    saved.ratingModelVersion === m.ratingModelVersion &&
    saved.economyVersion === MANAGER_ECONOMY_VERSION &&
    sameData
  );
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
  version: number;

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

export const useManager = create<ManagerStore>((set, get) => ({
  engine: null,
  resumable: null,
  hydrated: false,
  version: 0,

  async hydrate() {
    const data = dataOrNull();
    if (!data || get().engine) return;
    const saved = await readSaved(data);
    set({ resumable: saved ? { orgName: saved.config.orgName, season: saved.season } : null, hydrated: true });
  },

  startCareer(orgName, region, difficulty) {
    const data = dataOrNull();
    if (!data) return;
    const config: ManagerConfig = { orgName: orgName.trim(), region, difficulty, format: "last_2y" };
    const engine = ManagerEngine.create(data, createRunSeed(), config);
    persist(engine.state, data);
    set({ engine, resumable: null, version: get().version + 1 });
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
    set({ engine: null, resumable: null, version: get().version + 1 });
  },

  act(fn) {
    const { engine, version } = get();
    const data = dataOrNull();
    if (!engine || !data) return;
    fn(engine);
    persist(engine.state, data);
    set({ version: version + 1 });
  },
}));
