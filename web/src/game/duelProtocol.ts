// Протокол онлайн-Дуэли (M-DUEL) поверх relay-комнат MP0. Сервер отдаёт УПОРЯДОЧЕННЫЙ лог
// {seq, from, payload} и гарантирует отправителя; здесь — детерминированная применялка этого
// лога к DuelEngine. Оба клиента (и любой reconnect с реплеем) применяют один и тот же лог
// одними и теми же правилами ⇒ приходят в одно и то же состояние без сверки состояний по сети.
//
// Правило устойчивости: НЕВАЛИДНОЕ сообщение (чужой ход, не тот фазовый глагол, мусорный
// payload, действие зрителя) молча ИГНОРИРУЕТСЯ — одинаково у всех. Ошибкой протокола оно не
// является: злоумышленный клиент может испортить только свою комнату, рейтинги дуэль не пишет.
import type { Format, GameData } from "../types/data.ts";
import { DuelEngine, type DuelSide } from "./duel.ts";

/** Стартовое сообщение: его шлёт создатель комнаты, когда оба капитана на месте. Несёт всё,
 *  что нужно для детерминированной сборки движка у обеих сторон и у любого будущего реплея:
 *  сид, конфиг и привязку member id → сторона (имена — снапшот на момент старта). */
export interface DuelStartAction {
  kind: "start";
  seed: string;
  format: Format;
  bestOf: 1 | 3 | 5;
  sides: Record<string, DuelSide>;
  names: [string, string];
}

export type DuelPlayAction =
  | { kind: "pickPlayer"; index: number }
  | { kind: "reroll" }
  | { kind: "actHero"; heroId: number }
  | { kind: "next" };

export type DuelAction = DuelStartAction | DuelPlayAction;

/** Активная партия: движок + привязка участников комнаты к сторонам. */
export interface DuelMatch {
  engine: DuelEngine;
  sides: Record<string, DuelSide>;
}

const FORMATS: readonly Format[] = ["last_1y", "last_2y", "last_5y", "valve_legacy"];

function parseStart(payload: unknown): DuelStartAction | null {
  if (typeof payload !== "object" || payload === null) return null;
  const raw = payload as Record<string, unknown>;
  if (raw.kind !== "start") return null;
  if (typeof raw.seed !== "string" || raw.seed.length === 0) return null;
  if (!FORMATS.includes(raw.format as Format)) return null;
  if (raw.bestOf !== 1 && raw.bestOf !== 3 && raw.bestOf !== 5) return null;
  const sides = raw.sides;
  if (typeof sides !== "object" || sides === null) return null;
  const entries = Object.entries(sides as Record<string, unknown>);
  const values = entries.map(([, side]) => side);
  if (entries.length !== 2 || !values.includes(0) || !values.includes(1)) return null;
  const names = raw.names;
  if (!Array.isArray(names) || names.length !== 2 || names.some((name) => typeof name !== "string")) return null;
  return {
    kind: "start",
    seed: raw.seed,
    format: raw.format as Format,
    bestOf: raw.bestOf,
    sides: sides as Record<string, DuelSide>,
    names: [names[0] as string, names[1] as string],
  };
}

/** Ожидаемая сторона-актор текущего шага движка (null — шаг ничей: next жмёт любой участник). */
function expectedActor(engine: DuelEngine): DuelSide | null {
  if (engine.phase === "players") return engine.currentPicker;
  if (engine.phase === "heroes") return engine.currentStep?.side ?? null;
  return null;
}

/**
 * Применить одну запись relay-лога. Возвращает новое состояние партии (или прежнее, если
 * запись проигнорирована). Мутирует движок внутри match — вызывающий бампает свой serial.
 */
export function applyDuelEntry(
  match: DuelMatch | null,
  entry: { from: string; payload: unknown },
  data: GameData,
): DuelMatch | null {
  if (!match) {
    const start = parseStart(entry.payload);
    if (!start) return match;
    // Стартовать партию может только будущий её участник — зритель не решает за капитанов.
    if (start.sides[entry.from] === undefined) return match;
    try {
      return {
        engine: new DuelEngine(data, { format: start.format, bestOf: start.bestOf }, start.seed, start.names),
        sides: start.sides,
      };
    } catch {
      return match; // битый формат/пустой пул — старт игнорируется, комната остаётся в лобби
    }
  }

  const action = entry.payload as DuelPlayAction | null;
  if (typeof action !== "object" || action === null || typeof action.kind !== "string") return match;
  const side = match.sides[entry.from];
  if (side === undefined) return match; // зритель
  const engine = match.engine;
  try {
    switch (action.kind) {
      case "pickPlayer":
        if (side !== expectedActor(engine)) return match;
        if (typeof action.index !== "number" || !engine.canPickPlayer(action.index)) return match;
        engine.pickPlayer(action.index);
        return match;
      case "reroll":
        if (side !== expectedActor(engine)) return match;
        if (engine.phase !== "players" || engine.rerollsLeft[side] <= 0) return match;
        engine.reroll();
        return match;
      case "actHero":
        if (side !== expectedActor(engine)) return match;
        if (typeof action.heroId !== "number" || !engine.canActHero(action.heroId)) return match;
        engine.actHero(action.heroId);
        return match;
      case "next":
        // «Дальше» после сыгранной игры жмёт любой из капитанов; второй next молча игнорируется.
        if (engine.phase !== "resolved") return match;
        engine.next();
        return match;
      default:
        return match;
    }
  } catch {
    return match; // страховка: применялка не имеет права уронить клиент из-за сетевого мусора
  }
}
