// Абстракция над источником данных (CLAUDE.md: доступ к данным через интерфейс,
// чтобы позже подменить статику на Go API без переписывания фронта).
import type { GameData } from "../types/data.ts";
import { OPTIONAL_DATA_FILES, REQUIRED_DATA_FILES, dataFilePath, type DEFERRED_DATA_FILES } from "./dataFiles.ts";

type DeferredFile = (typeof DEFERRED_DATA_FILES)[number];

export interface DataSource {
  load(): Promise<GameData>;
  /** Отложенный файл (DEFERRED_DATA_FILES): тянется по первому обращению, повторные вызовы
   *  возвращают тот же промис — файлы в 3.7 и 8.5 МБ не должны качаться дважды. */
  loadDeferred<K extends DeferredFile>(name: K): Promise<NonNullable<GameData[K]>>;
}

/** Static-first: грузит предрассчитанные JSON из <base>/data (как в оригинале 322-0).
 *  base берётся из Vite BASE_URL, чтобы работать и в корне (dev/Cloudflare), и под
 *  сабпутём (GitHub Pages, напр. /aegis-draft/). BASE_URL всегда с завершающим слэшем. */
export class StaticDataSource implements DataSource {
  private deferred = new Map<DeferredFile, Promise<unknown>>();

  constructor(private base = import.meta.env.BASE_URL) {}

  loadDeferred<K extends DeferredFile>(name: K): Promise<NonNullable<GameData[K]>> {
    let pending = this.deferred.get(name);
    if (!pending) {
      pending = fetch(`${this.base}${dataFilePath(name)}`).then(async (res) => {
        if (!res.ok) throw new Error(`Не удалось загрузить ${name}.json (${res.status})`);
        return res.json();
      }).catch((error: unknown) => {
        // Неудача не должна залипать: следующее обращение попробует снова.
        this.deferred.delete(name);
        throw error;
      });
      this.deferred.set(name, pending);
    }
    return pending as Promise<NonNullable<GameData[K]>>;
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
