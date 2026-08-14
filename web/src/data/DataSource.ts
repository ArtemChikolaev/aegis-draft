// Абстракция над источником данных (CLAUDE.md: доступ к данным через интерфейс,
// чтобы позже подменить статику на Go API без переписывания фронта).
import type { GameData } from "../types/data.ts";
import { OPTIONAL_DATA_FILES, REQUIRED_DATA_FILES, dataFilePath } from "./dataFiles.ts";

export interface DataSource {
  load(): Promise<GameData>;
}

/** Static-first: грузит предрассчитанные JSON из <base>/data (как в оригинале 322-0).
 *  base берётся из Vite BASE_URL, чтобы работать и в корне (dev/Cloudflare), и под
 *  сабпутём (GitHub Pages, напр. /aegis-draft/). BASE_URL всегда с завершающим слэшем. */
export class StaticDataSource implements DataSource {
  constructor(private base = import.meta.env.BASE_URL) {}

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
