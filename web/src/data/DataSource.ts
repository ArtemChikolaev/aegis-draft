// Абстракция над источником данных (CLAUDE.md: доступ к данным через интерфейс,
// чтобы позже подменить статику на Go API без переписывания фронта).
import type { EventHeroStats, GameData } from "../types/data.ts";
import { OPTIONAL_DATA_FILES, REQUIRED_DATA_FILES, dataFilePath } from "./dataFiles.ts";

export interface DataSource {
  load(): Promise<GameData>;
  /** Отложенный файл (DEFERRED_DATA_FILES): тянется по первому обращению, повторные вызовы
   *  возвращают тот же промис — файл в 3.7 МБ не должен качаться дважды. */
  loadEventHeroStats(): Promise<EventHeroStats>;
}

/** Static-first: грузит предрассчитанные JSON из <base>/data (как в оригинале 322-0).
 *  base берётся из Vite BASE_URL, чтобы работать и в корне (dev/Cloudflare), и под
 *  сабпутём (GitHub Pages, напр. /aegis-draft/). BASE_URL всегда с завершающим слэшем. */
export class StaticDataSource implements DataSource {
  private eventHeroStats: Promise<EventHeroStats> | null = null;

  constructor(private base = import.meta.env.BASE_URL) {}

  loadEventHeroStats(): Promise<EventHeroStats> {
    this.eventHeroStats ??= fetch(`${this.base}${dataFilePath("eventHeroStats")}`).then(async (res) => {
      if (!res.ok) throw new Error(`Не удалось загрузить eventHeroStats.json (${res.status})`);
      return (await res.json()) as EventHeroStats;
    }).catch((error: unknown) => {
      // Неудача не должна залипать: следующее открытие инспектора попробует снова.
      this.eventHeroStats = null;
      throw error;
    });
    return this.eventHeroStats;
  }

  async load(): Promise<GameData> {
    const get = async (name: string) => {
      const res = await fetch(`${this.base}${dataFilePath(name)}`);
      if (!res.ok) throw new Error(`Не удалось загрузить ${name}.json (${res.status})`);
      return res.json();
    };
    // careerPlayerHeroStats — опционально: датасет получает его лишь после прогона пайплайна
    // с career-эмитом. Пока файла нет — {} (назначение героев падает на окно), чтобы деплой
    // фронта не зависел от тайминга data-refresh.
    const getOptional = async (name: string, fallback: unknown) => {
      try {
        const res = await fetch(`${this.base}${dataFilePath(name)}`);
        return res.ok ? await res.json() : fallback;
      } catch {
        return fallback;
      }
    };
    // Состав набора — из общего списка (см. dataFiles.ts): SW кэширует ровно то же, что грузит
    // игра. Соответствие «имя файла = ключ GameData» проверяет компайл-тайм замок там же,
    // поэтому сборка объекта по именам безопасна.
    const entries = await Promise.all([
      ...REQUIRED_DATA_FILES.map(async (name) => [name, await get(name)] as const),
      ...OPTIONAL_DATA_FILES.map(async (name) => [name, await getOptional(name, {})] as const),
    ]);
    return Object.fromEntries(entries) as unknown as GameData;
  }
}
