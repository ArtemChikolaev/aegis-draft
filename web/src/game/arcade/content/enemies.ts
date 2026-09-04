// Враги среза 0 — нейтралы леса Radiant + лейн-крипы + элита + Рошан (PRD §5.15).
// Числа — базовые на минуте 0; сим умножает HP/урон по минутам (ARCADE.spawn.*PerMin).
import type { EnemyKind, EnemyKindId } from "../types.ts";

export const ENEMY_KINDS: Record<EnemyKindId, EnemyKind> = {
  kobold: { id: "kobold", hp: 14, speed: 86, dmg: 6, r: 10, xp: 1, gold: 1, fromMin: 0, weight: 10, tone: "grunt" },
  kobold_foreman: { id: "kobold_foreman", hp: 32, speed: 72, dmg: 9, r: 12, xp: 2, gold: 1, fromMin: 0.75, weight: 6, tone: "grunt" },
  hill_troll: { id: "hill_troll", hp: 44, speed: 112, dmg: 10, r: 11, xp: 3, gold: 2, fromMin: 1.5, weight: 6, tone: "swift" },
  satyr: { id: "satyr", hp: 74, speed: 70, dmg: 14, r: 13, xp: 4, gold: 2, fromMin: 2.25, weight: 5, tone: "grunt" },
  ogre: { id: "ogre", hp: 170, speed: 58, dmg: 22, r: 17, xp: 7, gold: 3, fromMin: 3, weight: 4, tone: "brute" },
  centaur: { id: "centaur", hp: 240, speed: 86, dmg: 26, r: 16, xp: 9, gold: 4, fromMin: 4.5, weight: 3, tone: "brute" },
  wildwing: { id: "wildwing", hp: 210, speed: 104, dmg: 18, r: 14, xp: 8, gold: 4, fromMin: 5.5, weight: 3, tone: "swift" },
  lane_creep: { id: "lane_creep", hp: 56, speed: 84, dmg: 10, r: 12, xp: 3, gold: 2, fromMin: 99, weight: 0, tone: "creep" },
  siege_creep: {
    id: "siege_creep", hp: 230, speed: 54, dmg: 30, r: 18, xp: 10, gold: 6, fromMin: 99, weight: 0, tone: "creep",
    ranged: { range: 260, every: 2.6, speed: 190 },
  },
  golem: { id: "golem", hp: 950, speed: 50, dmg: 40, r: 24, xp: 40, gold: 15, elite: true, fromMin: 99, weight: 0, tone: "elite" },
  roshan: { id: "roshan", hp: 4200, speed: 68, dmg: 26, r: 40, xp: 120, gold: 60, boss: true, fromMin: 99, weight: 0, tone: "boss" },
};

/** Пул обычного спавна на минуте `min` (виды, доступные к этому времени). */
export function spawnPool(min: number): EnemyKind[] {
  const pool: EnemyKind[] = [];
  for (const kind of Object.values(ENEMY_KINDS)) if (kind.weight > 0 && kind.fromMin <= min) pool.push(kind);
  return pool;
}
