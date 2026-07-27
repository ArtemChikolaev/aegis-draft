import type { Format, GameData } from "../types/data.ts";
import { Rng } from "./rng.ts";

export type TournamentStage = "field" | "groups" | "playoffs" | "final" | "complete";
export type PlacementKey = "1" | "2" | "3" | "4" | "5-6" | "7-8" | "9-12" | "13-16" | "17" | "18";

/** Все бакеты итоговой таблицы в порядке возрастания места. Runtime-список нужен потребителям,
 *  которые обязаны говорить ровно на языке бакетов, — прежде всего порогам ante-этапов
 *  (`LEGAL_ANTE_TARGETS`): «топ-10» невыразимо, потому что бакета, кончающегося на 10, нет. */
export const PLACEMENT_KEYS: readonly PlacementKey[] = [
  "1", "2", "3", "4", "5-6", "7-8", "9-12", "13-16", "17", "18",
];
export type ProjectionKey = "1" | "2-4" | "5-8" | "9-12" | "13-16" | "17-18";

export interface TournamentTeam {
  id: string;
  name: string;
  eventLabel: string;
  strength: number;
  isUser: boolean;
  /** Опознавательный знак команды: монограмма из имени + индекс цвета опознания (--sigil-N).
   *  Нужен, потому что имена ботов намеренно похожи («Ranked Techies» / «Ranked Goblins»):
   *  на live-симуляции глазу не за что зацепиться, чтобы следить за конкретной командой. */
  sigil: TeamSigil;
}

export interface TeamSigil {
  /** Две буквы: инициалы префикса и существительного. Уникальны в пределах поля. */
  monogram: string;
  /** Индекс в палитре опознания 0..SIGIL_COLORS-1, либо "user" для своей команды (--accent).
   *  Это НЕ сила: цвета опознания взяты вне tier-шкалы, чтобы знак не читался как оценка. */
  color: number | "user";
}

/** Размер палитры опознания — должен совпадать с числом токенов --sigil-N в design/tokens.css. */
export const SIGIL_COLORS = 5;

export interface GroupStanding {
  team: TournamentTeam;
  wins: number;
  losses: number;
  rank: number;
  route: "upper" | "lower" | "out";
}

export interface TournamentGroup {
  id: "A" | "B";
  standings: GroupStanding[];
}

/** Отдельный BO2-матч группы (для истории игр / будущей live-симуляции). */
export interface GroupMatch {
  id: string;
  group: "A" | "B";
  teamA: TournamentTeam;
  teamB: TournamentTeam;
  scoreA: number;
  scoreB: number;
  /** Пошаговый счёт BO2 для live-симуляции (включая 0-0). */
  frames: { scoreA: number; scoreB: number }[];
}

export interface SeriesResult {
  id: string;
  round: string;
  teamA: TournamentTeam;
  teamB: TournamentTeam;
  scoreA: number;
  scoreB: number;
  bestOf: 3 | 5;
  winnerId: string;
  loserId: string;
  /** Пошаговый счёт серии для live-симуляции (включая 0-0). */
  frames: { scoreA: number; scoreB: number }[];
}

export interface PlayoffRound {
  id: string;
  label: string;
  series: SeriesResult[];
}

export interface FinalStanding {
  team: TournamentTeam;
  placement: PlacementKey;
}

export interface TournamentResult {
  field: TournamentTeam[];
  projection: ProjectionKey;
  groups: TournamentGroup[];
  groupMatches: GroupMatch[];
  playoffRounds: PlayoffRound[];
  grandFinal: SeriesResult;
  standings: FinalStanding[];
  champion: TournamentTeam;
  userPlacement: PlacementKey;
}

export interface TournamentSnapshot extends TournamentResult {
  stage: TournamentStage;
  canAdvance: boolean;
}

const USER_ID = "aegis-user-team";
// Стадии: field → groups → playoffs. Playoffs — терминальный экран: сетка (вкл. Grand
// Final) + итоговая таблица + твой результат на одном экране (без отдельных final/complete).
const STAGES: TournamentStage[] = ["field", "groups", "playoffs"];

/**
 * Модель поля соперников (R7.1).
 *
 * Разделены две разные вещи:
 *  - **качество ростера** соперника — сэмплируется из `N(mean, sd)` и ограничено `[min, max]`,
 *    потому что это оценка живых игроков и у неё есть естественный потолок;
 *  - **`threat`** — надбавка к итоговой силе сверх качества ростера (акт/босс/Stake, R7.2).
 *    Она НЕ клампится: именно здесь снимается потолок 99, из-за которого поздняя угроза упиралась
 *    в стену.
 *
 * Зачем параметризация вместо прежнего «сдвинуть и переклампить»: Roguelite двигал уже
 * ограниченную выборку и переклампливал её, из-за чего распределение схлопывалось в спайк на
 * границе. Замер на этапе 1: **90.2% ботов стояли ровно на 76**, `sd ≈ 0.99` — то есть поле было
 * не распределением, а одним значением, матчи ботов между собой превращались в монетку, и место
 * игрока определялось жеребьёвкой, а не силой. Теперь по этапу двигается сам `mean`, а `sd`
 * остаётся живым.
 */
export interface FieldModel {
  /** Средняя сила ростера соперников на этом этапе. */
  mean: number;
  sd: number;
  /** Границы КАЧЕСТВА ростера (не итоговой силы). */
  min: number;
  max: number;
  /** Надбавка к итоговой силе сверх качества ростера. Без верхней границы. */
  threat?: number;
}

/** Поле Quick Draft — `round(clamp(76, 99, Normal(86, 5)))`, параметры сняты из бандла 322-0
 *  дословно (docs/reference-322-0.md) и НЕ меняются: на них стоят golden-фикстуры и
 *  parity-аудит. */
export const QUICK_DRAFT_FIELD: FieldModel = { mean: 86, sd: 5, min: 76, max: 99 };

// Сила бота НЕ привязана к силе игрока: место зависит от того, куда попадает его OVR в этом
// поле (сильный драфт → 1-3, средний → середина, слабый → низ), а не «всегда 2-3».
function sampleBotStrength(rng: Rng, field: FieldModel): number {
  const raw = rng.normal(field.mean, field.sd);
  // Клампится КАЧЕСТВО ростера — у оценки живых игроков есть естественный потолок. Угроза
  // (`threat`) прибавляется уже после и потолка не имеет.
  const quality = Math.round(Math.min(field.max, Math.max(field.min, raw)));
  return quality + (field.threat ?? 0);
}

function rollBotStrengths(rng: Rng, count: number, field: FieldModel): number[] {
  // Каждый бот — независимая выборка из поля. Число ботов выше игрока варьируется само
  // (для OVR 94 — обычно 0-2 → 1-3 место; для 84 — ~7 → середина), даёт динамику как в 322-0.
  return Array.from({ length: count }, () => sampleBotStrength(rng, field));
}

// Соперники — фэнтезийные бот-команды (как в 322-0: «Naga Spirits», «No Techies»…),
// а не реальные ростеры: Classic собирает состав из случайных людей и играет против
// таких же ботов со случайными именами. Сила берётся из распределения OVR реальных
// паков окна, чтобы поле было правдоподобным; имена — детерминированно из seed.
const BOT_PREFIX = [
  "Eternal", "Boosted", "Throwback", "Glorious", "Rampage", "Divine", "Feeding", "Smurfing",
  "Disconnected", "Cursed", "Turbo", "Ranked", "Mega", "Ancient", "Phantom", "Aegis", "Roshan's",
];
const BOT_NOUN = [
  "Throwers", "Gankers", "Believers", "Pandas", "Penguins", "Wards", "Couriers", "Spirits",
  "Bots", "Creeps", "Rejects", "Dragons", "Goblins", "Demons", "Techies", "Smurfs", "Pugs",
];

/** Монограмма — ровно две буквы: инициалы первых двух слов, а для односложного имени
 *  («Roshan») его первые две буквы. Имя команды правит игрок, поэтому нельзя рассчитывать
 *  ни на два слова, ни на латиницу. */
function monogramOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length >= 2 ? words[0][0] + words[1][0] : (words[0] ?? "").slice(0, 2);
  return letters.toUpperCase();
}

/** Имена ботов с ГАРАНТИРОВАННО уникальной монограммой в пределах поля: «Divine Wards» и
 *  «Disconnected Wards» дают одинаковое DW, и знак перестал бы опознавать команду. Комбинаций
 *  с разными инициалами хватает с запасом (12 инициалов префикса × 9 существительного). */
function botNames(rng: Rng, count: number): string[] {
  const combos: string[] = [];
  for (const prefix of BOT_PREFIX) for (const noun of BOT_NOUN) combos.push(`${prefix} ${noun}`);
  const picked: string[] = [];
  const seen = new Set<string>();
  for (const name of rng.shuffle(combos)) {
    if (picked.length === count) break;
    const mono = monogramOf(name);
    if (seen.has(mono)) continue;
    seen.add(mono);
    picked.push(name);
  }
  return picked;
}

function opponentPool(fieldRng: Rng, field: FieldModel): TournamentTeam[] {
  // Имена и силы — оба от fieldRng: реролл поля меняет СОПЕРНИКОВ, а не только их очки
  // (так же в 322-0: у них и то и другое сидит на fieldSeed).
  const names = botNames(fieldRng, 17);
  const strengths = rollBotStrengths(fieldRng, 17, field);
  // Цвет опознания раздаётся по кругу перетасованной палитры: 17 команд на 6 цветов дают
  // по 2-3 повтора, но пара (монограмма, цвет) при уникальной монограмме всё равно уникальна.
  const palette = fieldRng.shuffle(Array.from({ length: SIGIL_COLORS }, (_, i) => i));
  return names.map((name, index) => ({
    id: `bot-${index + 1}`,
    name,
    eventLabel: "",
    strength: strengths[index],
    isUser: false,
    sigil: { monogram: monogramOf(name), color: palette[index % SIGIL_COLORS] },
  }));
}

/** Развод по группам змейкой 1-4-5-8 (322-0, дословно: `i%4===0||i%4===3 ? "A" : "B"`).
 *  `field` обязан быть отсортирован по силе убыв. — змейка читает индекс как посев.
 *
 *  Раньше поле просто шаффлилось: на 20k роллов это давало средний перекос силы между
 *  группами 1.82 очка и до 9.3 в худших — то есть одна группа выходила смертельной, вторая
 *  прогулкой, чисто по броску. Змейка держит перекос на 0.39 (худший 1.8), как на реальных
 *  турнирах с посевом. Детерминизма это не отнимает: сид всё так же правит силы и симуляцию. */
function snakeSeed(field: TournamentTeam[]): [TournamentTeam[], TournamentTeam[]] {
  const a: TournamentTeam[] = [];
  const b: TournamentTeam[] = [];
  field.forEach((team, index) => ((index % 4 === 0 || index % 4 === 3) ? a : b).push(team));
  return [a, b];
}

function projectionForRank(rank: number): ProjectionKey {
  if (rank === 1) return "1";
  if (rank <= 4) return "2-4";
  if (rank <= 8) return "5-8";
  if (rank <= 12) return "9-12";
  if (rank <= 16) return "13-16";
  return "17-18";
}

/** Делитель ELO-кривой (322-0, дословно): чем меньше, тем решительнее побеждает фаворит.
 *  Прежние `Math.exp(Δ/12)` — это база 10 с делителем 27.6, то есть кривая была заметно
 *  площе: при перевесе в 10 очков фаворит брал 70% вместо 74%.
 *
 *  ⚠️ **Граница применимости (важно для R8.2).** Значение откалибровано под шкалу силы порядка
 *  `76–99`: разрыв в 22 очка = ~90% за фаворита. Кривая АДДИТИВНА — она смотрит на разность, а не
 *  на отношение. Пока растёт только поле (`FieldModel.threat`, R7.2), это корректно: разрыв растёт
 *  ровно потому, что соперник действительно сильнее, и это и есть задуманная сложность.
 *
 *  Но как только силу начнут МАСШТАБИРОВАТЬ обе стороны — а именно это делает `Tournament Power`
 *  из R8.2 (`rosterPower × teamMult × xMult`, пример в брифе даёт 178) — одинаковое
 *  ОТНОСИТЕЛЬНОЕ преимущество начнёт давать разную вероятность, и при разрывах в 40+ очков каждый
 *  матч станет детерминированным: турнир перестанет быть турниром. Тогда делитель обязан
 *  масштабироваться вместе со шкалой (или сравнение — перейти на отношение). Менять его здесь
 *  заранее нельзя: это сдвинуло бы Quick Draft и golden. */
const ELO_DIVISOR = 22;

/** Вероятность победы a над b — ELO по основанию 10. */
function winProbability(a: TournamentTeam, b: TournamentTeam): number {
  return 1 / (1 + Math.pow(10, -(a.strength - b.strength) / ELO_DIVISOR));
}

function playSeries(
  rng: Rng,
  id: string,
  round: string,
  teamA: TournamentTeam,
  teamB: TournamentTeam,
  bestOf: 3 | 5,
): SeriesResult {
  const needed = Math.floor(bestOf / 2) + 1;
  let scoreA = 0;
  let scoreB = 0;
  const frames: { scoreA: number; scoreB: number }[] = [{ scoreA: 0, scoreB: 0 }];
  while (scoreA < needed && scoreB < needed) {
    if (rng.float() < winProbability(teamA, teamB)) scoreA += 1;
    else scoreB += 1;
    frames.push({ scoreA, scoreB });
  }
  const winnerId = scoreA > scoreB ? teamA.id : teamB.id;
  return { id, round, teamA, teamB, scoreA, scoreB, bestOf, winnerId, loserId: winnerId === teamA.id ? teamB.id : teamA.id, frames };
}

function winner(series: SeriesResult): TournamentTeam {
  return series.winnerId === series.teamA.id ? series.teamA : series.teamB;
}

function loser(series: SeriesResult): TournamentTeam {
  return series.loserId === series.teamA.id ? series.teamA : series.teamB;
}

function buildGroup(rng: Rng, id: "A" | "B", teams: TournamentTeam[]): { group: TournamentGroup; matches: GroupMatch[] } {
  const records = new Map(teams.map((team) => [team.id, { team, wins: 0, losses: 0 }]));
  const matches: GroupMatch[] = [];
  for (let i = 0; i < teams.length; i += 1) {
    for (let j = i + 1; j < teams.length; j += 1) {
      let scoreA = 0;
      let scoreB = 0;
      const frames: { scoreA: number; scoreB: number }[] = [{ scoreA: 0, scoreB: 0 }];
      for (let map = 0; map < 2; map += 1) {
        if (rng.float() < winProbability(teams[i], teams[j])) scoreA += 1;
        else scoreB += 1;
        frames.push({ scoreA, scoreB });
      }
      const a = records.get(teams[i].id)!;
      const b = records.get(teams[j].id)!;
      a.wins += scoreA; a.losses += scoreB;
      b.wins += scoreB; b.losses += scoreA;
      matches.push({ id: `grp-${id}-${i}-${j}`, group: id, teamA: teams[i], teamB: teams[j], scoreA, scoreB, frames });
    }
  }
  const sorted = [...records.values()].sort((a, b) => b.wins - a.wins || b.team.strength - a.team.strength || a.team.id.localeCompare(b.team.id));
  return {
    group: {
      id,
      standings: sorted.map((record, index) => ({
        ...record,
        rank: index + 1,
        route: index < 4 ? "upper" : index < 8 ? "lower" : "out",
      })),
    },
    matches,
  };
}

function round(rng: Rng, id: string, label: string, pairs: [TournamentTeam, TournamentTeam][]): PlayoffRound {
  return { id, label, series: pairs.map(([a, b], index) => playSeries(rng, `${id}-${index + 1}`, label, a, b, 3)) };
}

function buildResult(data: GameData, format: Format, seed: string, userStrength: number, userName: string, fieldReroll = 0, fieldModel: FieldModel = QUICK_DRAFT_FIELD): TournamentResult {
  void data;
  void format;
  const fieldRng = new Rng(`${seed}:tournament:field-${fieldReroll}`);
  const simRng = new Rng(`${seed}:tournament:sim-${fieldReroll}`);
  const name = userName.trim() || "Aegis Five";
  const user: TournamentTeam = { id: USER_ID, name, eventLabel: "Fantasy roster", strength: userStrength, isUser: true, sigil: { monogram: monogramOf(name), color: "user" } };
  // Roguelite Run (PRD §5.9.3): поле задаётся моделью этапа, а не пост-сдвигом уже
  // ограниченной выборки. Quick Draft передаёт QUICK_DRAFT_FIELD ⇒ те же роллы в том же
  // порядке ⇒ golden Classic байт-в-байт.
  const bots = opponentPool(fieldRng, fieldModel);
  const field = [...bots, user]
    .sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id));
  const projection = projectionForRank(field.findIndex((team) => team.isUser) + 1);
  const [drawA, drawB] = snakeSeed(field);
  const groupA = buildGroup(simRng, "A", drawA);
  const groupB = buildGroup(simRng, "B", drawB);
  const groups = [groupA.group, groupB.group];
  const groupMatches = [...groupA.matches, ...groupB.matches];
  const a = groups[0].standings;
  const b = groups[1].standings;

  const ubQf = round(simRng, "ub-qf", "Upper Bracket R1", [[a[0].team, b[3].team], [b[1].team, a[2].team], [b[0].team, a[3].team], [a[1].team, b[2].team]]);
  const lbR1 = round(simRng, "lb-r1", "Lower Bracket R1", [[a[4].team, b[7].team], [b[5].team, a[6].team], [b[4].team, a[7].team], [a[5].team, b[6].team]]);
  const lbR2 = round(simRng, "lb-r2", "Lower Bracket R2", lbR1.series.map((series, index) => [winner(series), loser(ubQf.series[index])]));
  const ubSf = round(simRng, "ub-sf", "Upper Bracket Semifinal", [[winner(ubQf.series[0]), winner(ubQf.series[1])], [winner(ubQf.series[2]), winner(ubQf.series[3])]]);
  const lbR3 = round(simRng, "lb-r3", "Lower Bracket R3", [[winner(lbR2.series[0]), winner(lbR2.series[1])], [winner(lbR2.series[2]), winner(lbR2.series[3])]]);
  const lbR4 = round(simRng, "lb-r4", "Lower Bracket R4", [[winner(lbR3.series[0]), loser(ubSf.series[0])], [winner(lbR3.series[1]), loser(ubSf.series[1])]]);
  const ubFinal = round(simRng, "ub-final", "Upper Bracket Final", [[winner(ubSf.series[0]), winner(ubSf.series[1])]]);
  const lbR5 = round(simRng, "lb-r5", "Lower Bracket R5", [[winner(lbR4.series[0]), winner(lbR4.series[1])]]);
  const lbFinal = round(simRng, "lb-final", "Lower Bracket Final", [[winner(lbR5.series[0]), loser(ubFinal.series[0])]]);
  const grandFinal = playSeries(simRng, "grand-final", "Grand Final", winner(ubFinal.series[0]), winner(lbFinal.series[0]), 5);
  const playoffRounds = [ubQf, lbR1, lbR2, ubSf, lbR3, lbR4, ubFinal, lbR5, lbFinal];

  const groupOuts = [a[8], b[8]]
    .sort((left, right) => right.wins - left.wins || right.team.strength - left.team.strength)
    .map((row) => row.team);
  const buckets: [PlacementKey, TournamentTeam[]][] = [
    ["1", [winner(grandFinal)]], ["2", [loser(grandFinal)]], ["3", [loser(lbFinal.series[0])]],
    ["4", [loser(lbR5.series[0])]], ["5-6", lbR4.series.map(loser)], ["7-8", lbR3.series.map(loser)],
    ["9-12", lbR2.series.map(loser)], ["13-16", lbR1.series.map(loser)], ["17", [groupOuts[0]]], ["18", [groupOuts[1]]],
  ];
  const standings = buckets.flatMap(([placement, teams]) => teams
    .sort((left, right) => right.strength - left.strength)
    .map((team) => ({ team, placement })));
  const userPlacement = standings.find((entry) => entry.team.isUser)?.placement;
  if (!userPlacement || standings.length !== 18 || new Set(standings.map((entry) => entry.team.id)).size !== 18) {
    throw new Error("Tournament simulation produced an invalid final table");
  }
  return { field, projection, groups, groupMatches, playoffRounds, grandFinal, standings, champion: winner(grandFinal), userPlacement };
}

export function fieldRerollCount(actions: readonly { t: string }[]): number {
  return actions.filter((action) => action.t === "fieldReroll").length;
}

/** Pure deterministic tournament orchestration. Draft engine remains independent. */
export class TournamentEngine {
  private stageIndex = 0;
  private readonly result: TournamentResult;

  constructor(data: GameData, format: Format, seed: string, userStrength: number, userName: string, fieldReroll = 0, fieldModel: FieldModel = QUICK_DRAFT_FIELD) {
    this.result = buildResult(data, format, seed, userStrength, userName, fieldReroll, fieldModel);
  }

  get snapshot(): TournamentSnapshot {
    return { ...this.result, stage: STAGES[this.stageIndex], canAdvance: this.stageIndex < STAGES.length - 1 };
  }

  advance(): boolean {
    if (this.stageIndex >= STAGES.length - 1) return false;
    this.stageIndex += 1;
    return true;
  }
}
