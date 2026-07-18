import type { EventInfo, Format, Pack } from "../../types/data.ts";

/** Совместное появление двух игроков в одном ростере на конкретном турнире. */
export interface SharedEvent {
  eventId: string;
  eventName: string;
  /** У части событий года нет — падаем на год из startDate, иначе сортировка развалится. */
  year: number;
  teamName: string;
}

export interface TeammateLink {
  accountId: number;
  nickname: string;
  /** Турниры, где играли вместе; новые первыми. */
  shared: SharedEvent[];
}

/** accountId → (accountId соседа → совместные турниры). */
export type TeammateIndex = Map<number, Map<number, SharedEvent[]>>;

/**
 * Кто с кем был тиммейтом внутри временного окна.
 *
 * Источник — `packs.json` (пак = реальный ростер команды на турнире) × `events.json`
 * (у события есть `formats`, то есть в какие окна оно попадает). Плоский `teammates.json`
 * для этого не годится: в нём нет дат, только общий факт «пересекались когда-то».
 * Поэтому пайплайн трогать не пришлось — окна уже нарезаны им же, теми же четырьмя,
 * что и в настройках забега.
 *
 * Замер на реальных данных: 297–877 игроков в окне, степень вершины медиана 4–8,
 * p90 10–19, максимум 38 — то есть вокруг выбранного игрока умещается одно кольцо.
 */
export function buildTeammateIndex(packs: Pack[], events: EventInfo[], format: Format): TeammateIndex {
  const eventById = new Map(events.map((event) => [event.id, event]));
  const index: TeammateIndex = new Map();

  const link = (a: number, b: number, shared: SharedEvent) => {
    let neighbours = index.get(a);
    if (!neighbours) index.set(a, (neighbours = new Map()));
    const existing = neighbours.get(b);
    if (existing) existing.push(shared);
    else neighbours.set(b, [shared]);
  };

  for (const pack of packs) {
    const event = eventById.get(pack.eventId);
    if (!event?.formats?.includes(format)) continue;
    const shared: SharedEvent = {
      eventId: event.id,
      eventName: event.name,
      year: event.year ?? Number(event.startDate.slice(0, 4)) ?? 0,
      teamName: pack.teamName,
    };
    const roster = pack.players;
    for (let i = 0; i < roster.length; i += 1) {
      for (let j = i + 1; j < roster.length; j += 1) {
        const left = roster[i].accountId;
        const right = roster[j].accountId;
        if (left === right) continue;
        link(left, right, shared);
        link(right, left, shared);
      }
    }
  }
  return index;
}

/** Ники берём из паков: там они на момент турнира, а профиль знает только текущий. */
export function nicknameIndex(packs: Pack[]): Map<number, string> {
  const names = new Map<number, string>();
  for (const pack of packs) {
    for (const player of pack.players) names.set(player.accountId, player.nickname);
  }
  return names;
}

/**
 * Соседи игрока, отсортированные по силе связи: сперва по числу совместных турниров,
 * затем по нику. Без второго ключа порядок «прыгал» бы между рендерами у равных пар.
 */
export function teammateLinks(
  index: TeammateIndex,
  names: Map<number, string>,
  accountId: number,
): TeammateLink[] {
  const neighbours = index.get(accountId);
  if (!neighbours) return [];
  return [...neighbours.entries()]
    .map(([id, shared]) => ({
      accountId: id,
      nickname: names.get(id) ?? `#${id}`,
      shared: [...shared].sort((left, right) => right.year - left.year || left.eventName.localeCompare(right.eventName)),
    }))
    .sort((left, right) => right.shared.length - left.shared.length || left.nickname.localeCompare(right.nickname));
}
