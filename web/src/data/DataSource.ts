// Абстракция над источником данных (CLAUDE.md: доступ к данным через интерфейс,
// чтобы позже подменить статику на Go API без переписывания фронта).
import type { GameData } from "../types/data.ts";

export interface DataSource {
  load(): Promise<GameData>;
}

/** Static-first: грузит предрассчитанные JSON из <base>/data (как в оригинале 322-0).
 *  base берётся из Vite BASE_URL, чтобы работать и в корне (dev/Cloudflare), и под
 *  сабпутём (GitHub Pages, напр. /aegis-draft/). BASE_URL всегда с завершающим слэшем. */
export class StaticDataSource implements DataSource {
  constructor(private base = `${import.meta.env.BASE_URL}data`) {}

  async load(): Promise<GameData> {
    const get = async (name: string) => {
      const res = await fetch(`${this.base}/${name}.json`);
      if (!res.ok) throw new Error(`Не удалось загрузить ${name}.json (${res.status})`);
      return res.json();
    };
    // careerPlayerHeroStats — опционально: датасет получает его лишь после прогона пайплайна
    // с career-эмитом. Пока файла нет — {} (назначение героев падает на окно), чтобы деплой
    // фронта не зависел от тайминга data-refresh.
    const getOptional = async (name: string, fallback: unknown) => {
      try {
        const res = await fetch(`${this.base}/${name}.json`);
        return res.ok ? await res.json() : fallback;
      } catch {
        return fallback;
      }
    };
    const [
      manifest, events, heroes, packs, players,
      playerHeroStats, careerPlayerHeroStats, teammates, squadSynergy, eventHeroStats, teamSuccess,
    ] = await Promise.all([
      get("manifest"), get("events"), get("heroes"), get("packs"), get("players"),
      get("playerHeroStats"), getOptional("careerPlayerHeroStats", {}), get("teammates"), get("squadSynergy"), get("eventHeroStats"), get("teamSuccess"),
    ]);
    return { manifest, events, heroes, packs, players, playerHeroStats, careerPlayerHeroStats, teammates, squadSynergy, eventHeroStats, teamSuccess };
  }
}
