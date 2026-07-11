// Абстракция над источником данных (CLAUDE.md: доступ к данным через интерфейс,
// чтобы позже подменить статику на Go API без переписывания фронта).
import type { GameData } from "../types/data.ts";

export interface DataSource {
  load(): Promise<GameData>;
}

/** Static-first: грузит предрассчитанные JSON из /data (как в оригинале 322-0). */
export class StaticDataSource implements DataSource {
  constructor(private base = "/data") {}

  async load(): Promise<GameData> {
    const get = async (name: string) => {
      const res = await fetch(`${this.base}/${name}.json`);
      if (!res.ok) throw new Error(`Не удалось загрузить ${name}.json (${res.status})`);
      return res.json();
    };
    const [
      manifest, events, heroes, packs, players,
      playerHeroStats, teammates, squadSynergy, eventHeroStats, teamSuccess,
    ] = await Promise.all([
      get("manifest"), get("events"), get("heroes"), get("packs"), get("players"),
      get("playerHeroStats"), get("teammates"), get("squadSynergy"), get("eventHeroStats"), get("teamSuccess"),
    ]);
    return { manifest, events, heroes, packs, players, playerHeroStats, teammates, squadSynergy, eventHeroStats, teamSuccess };
  }
}
