// Генерация мира Esports Manager — выделена из engine.ts (T12.5/T12.7, 2026-09-02): календарь
// сезона, организации региона, имена событий, пул кандидатов и мгновенный розыгрыш сетки. Ничего
// из этого не читает состояние движка: чистые функции от seed/данных.
// ManagerEngine — чистая логика Esports Manager (T5.5, срез 1). Никакого UI и стора:
// экраны дергают методы, состояние сериализуется целиком (long-save по снапшоту, не по
// реплею — в отличие от Classic здесь нет одного короткого лога действий).
//
// Детерминизм: каждый ролл берёт СВОЙ поток Rng `${seed}:<назначение>` (паттерн anteRun
// `:card`) — вставка нового ролла не сдвигает чужие последовательности.
//
// Референс поведения — живой проход 322-0 (docs/audits/2026-08-11-322-0-em-live-walkthrough.md):
// tryouts со скрытыми зарплатами → пул героев → контракты → отбор под доход → сезон из
// 5 циклов с гейтом квалификаций → финал → оффсезон (дрифт + пересмотр контрактов).
import type { Format, GameData } from "../../types/data.ts";
import { type Candidate } from "../packs.ts";
import { Rng } from "../rng.ts";
import {
  ELO_BOT_MAX,
  ELO_BOT_MIN,
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  type ManagerEventKind,
  
  type ManagerRegion,
} from "./economy.ts";
import type { BracketRound, CalendarSlot, WorldOrg } from "./engine.ts";

const SEASON_CYCLES = 5;
const MONTHS = ["Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"];

/** Месяц слота — для подписи в календаре (2 события ≈ месяц, как у референса). */
export function slotMonth(slot: CalendarSlot): string {
  if (slot.kind === "finaleQual") return MONTHS[10];
  if (slot.kind === "finale") return MONTHS[11];
  const base = slot.cycle * 2;
  const shift = slot.kind === "tier2" && slot.id.endsWith("a") ? 0 : slot.kind === "tier2" ? 1 : slot.kind === "qualifier" ? 0 : 1;
  return MONTHS[Math.min(9, base + shift)];
}

/** Имена ботов-организаций и событий — свои, в духе генератора tournament.ts (не копия 322-0). */
const ORG_PREFIX = ["Smoke", "Glorious", "Eternal", "Tilted", "Roshan's", "Courier", "Naga", "Brood", "Rampage", "Divine", "Salty", "Megacreep", "Tinker", "Last Hit", "Disconnected", "Aegis", "Boosted"];
const ORG_NOUN = ["Demons", "Rejects", "Throwers", "Rats", "Creeps", "Gankers", "Penguins", "Stacks", "Snipers", "Wisps", "Pandas", "Spirits", "Couriers", "Dragons", "Wards", "Bots", "Roamers"];
const EVENT_SERIES = ["Pug League", "Pro Series", "Invitational", "Masters", "Clash", "Circuit", "Cup", "Open"];

export function eventName(rng: Rng, kind: ManagerEventKind, season: number, cycle: number): string {
  if (kind === "finale") return `Aegis Championship S${season}`;
  if (kind === "finaleQual") return `Aegis Championship S${season} — Qualifier`;
  const series = rng.pick(EVENT_SERIES);
  const brand = rng.pick(ORG_NOUN);
  const n = cycle + 1 + (season - 1) * SEASON_CYCLES;
  if (kind === "qualifier") return `${brand} ${series} ${n} — Open Qualifier`;
  if (kind === "lan") return `${brand} ${series} ${n} — LAN Finals`;
  return `${brand} ${series} ${n}`;
}

export function buildCalendar(seed: string, season: number): CalendarSlot[] {
  const rng = new Rng(`${seed}:calendar:${season}`);
  const slots: CalendarSlot[] = [];
  for (let cycle = 0; cycle < SEASON_CYCLES; cycle += 1) {
    slots.push({ id: `s${season}c${cycle}t2a`, cycle, kind: "tier2", name: eventName(rng, "tier2", season, cycle), gated: false });
    slots.push({ id: `s${season}c${cycle}t2b`, cycle, kind: "tier2", name: eventName(rng, "tier2", season, cycle), gated: false });
    slots.push({ id: `s${season}c${cycle}q`, cycle, kind: "qualifier", name: eventName(rng, "qualifier", season, cycle), gated: false });
    slots.push({ id: `s${season}c${cycle}o`, cycle, kind: "online", name: eventName(rng, "online", season, cycle), gated: true });
    slots.push({ id: `s${season}c${cycle}l`, cycle, kind: "lan", name: eventName(rng, "lan", season, cycle), gated: true });
  }
  slots.push({ id: `s${season}fq`, cycle: SEASON_CYCLES, kind: "finaleQual", name: eventName(rng, "finaleQual", season, SEASON_CYCLES), gated: false });
  slots.push({ id: `s${season}f`, cycle: SEASON_CYCLES, kind: "finale", name: eventName(rng, "finale", season, SEASON_CYCLES), gated: true });
  return slots;
}

export function buildWorld(seed: string, region: ManagerRegion): WorldOrg[] {
  const rng = new Rng(`${seed}:world:${region}`);
  const names = new Set<string>();
  while (names.size < 17) names.add(`${rng.pick(ORG_PREFIX)} ${rng.pick(ORG_NOUN)}`);
  return [...names].map((name) => ({
    name,
    elo: ELO_BOT_MIN + rng.int(ELO_BOT_MAX - ELO_BOT_MIN + 1),
  }));
}

/** Свежайший pack-снапшот на игрока в окне формата: кандидат Manager — текущая форма,
 *  а не лучшая в истории (у одного человека несколько форм — Manager берёт последнюю). */
export function managerCandidatePool(data: GameData, format: Format): Candidate[] {
  const eventYear = new Map(data.events.map((e) => [e.id, e.year]));
  const best = new Map<number, Candidate>();
  const freshness = (c: Candidate) => (eventYear.get(c.eventId) ?? 0);
  for (const pack of data.packs) {
    if (!pack.formats.includes(format)) continue;
    for (const candidate of pack.players.map((player) => ({
      player,
      teamId: pack.teamId,
      teamName: pack.teamName,
      logoUrl: pack.logoUrl,
      eventId: pack.eventId,
      signatureHeroes: pack.signatureHeroes,
    }))) {
      const prev = best.get(candidate.player.accountId);
      if (!prev || freshness(candidate) > freshness(prev) || (freshness(candidate) === freshness(prev) && candidate.eventId > prev.eventId)) {
        best.set(candidate.player.accountId, candidate);
      }
    }
  }
  return [...best.values()].sort((a, b) => a.player.accountId - b.player.accountId);
}


/** Мгновенный сеточный розыгрыш: сильные сеются врозь, серия — одна «карта» по ELO-формуле
 *  322-0 (`1/(1+10^(−Δ/22))`). Поле >8 режется play-in'ом до восьми (позиции 9+ без сетки).
 *  Возвращает и раунды сетки — панель результата рисует их вместо плоского списка. */
export function simKnockout(
  field: Array<{ name: string; strength: number; isUser: boolean }>,
  rng: Rng,
): {
  placements: Array<{ name: string; strength: number; isUser: boolean; placement: number }>;
  bracket: BracketRound[];
} {
  const winProb = (a: number, b: number) => 1 / (1 + Math.pow(10, -(a - b) / 22));
  const rated = field.map((team) => ({ ...team, seedScore: team.strength + rng.normal(0, 3) }));
  rated.sort((a, b) => b.seedScore - a.seedScore);
  const cut = rated.slice(8);
  const bracket = rated.slice(0, 8);
  // Змейка 1-8 2-7 3-6 4-5.
  const pairs = [
    [bracket[0], bracket[7]],
    [bracket[3], bracket[4]],
    [bracket[1], bracket[6]],
    [bracket[2], bracket[5]],
  ];
  const results: Array<{ name: string; strength: number; isUser: boolean; placement: number }> = [];
  const rounds: BracketRound[] = [[], [], []];
  const playMatch = (a: (typeof rated)[number], b: (typeof rated)[number], round: number) => {
    const outcome = rng.float() < winProb(a.strength, b.strength) ? { winner: a, loser: b } : { winner: b, loser: a };
    rounds[round].push({ a: a.name, b: b.name, winner: outcome.winner.name });
    return outcome;
  };
  const semis: (typeof rated)[number][] = [];
  for (const [a, b] of pairs) {
    const { winner, loser } = playMatch(a, b, 0);
    semis.push(winner);
    results.push({ ...loser, placement: 5 });
  }
  const finalists: (typeof rated)[number][] = [];
  for (const [a, b] of [[semis[0], semis[1]], [semis[2], semis[3]]]) {
    const { winner, loser } = playMatch(a, b, 1);
    finalists.push(winner);
    results.push({ ...loser, placement: 3 });
  }
  const { winner, loser } = playMatch(finalists[0], finalists[1], 2);
  results.push({ ...loser, placement: 2 });
  results.push({ ...winner, placement: 1 });
  cut.forEach((team, index) => results.push({ ...team, placement: 9 + index }));
  return { placements: results.sort((a, b) => a.placement - b.placement), bracket: rounds };
}

