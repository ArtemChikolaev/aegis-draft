// Ante-петля Roguelite Run (T5.7, срез 1). Чистый stage-orchestration-слой ПОВЕРХ
// TournamentEngine: движок драфта (RunEngine) и сам турнир не трогаем (скилл
// game-state-architecture: этапы — отдельный слой, не вливать в RunEngine/TournamentEngine).
//
// Забег = СЕЗОН из актов (R6.1): структура живёт здесь же, потому что «какой это этап» и «по
// каким правилам он играется» — один вопрос. На каждом этапе играется один турнир (тот же
// TournamentEngine), но поле сильнее по позиции в акте (растёт mean) и по числу пройденных актов
// (растёт threat). Пробил порог → следующий этап; промах → смерть.
// Экономика/рынок/редкость/боссы — поздние срезы (PRD §5.9.2), здесь их намеренно нет.
import type { Format, GameData } from "../types/data.ts";
import { MUTATORS, mutatorForCircle, type MutatorId } from "./dynastyMutators.ts";
import { PLACEMENT_KEYS, TournamentEngine, type FieldModel, type PlacementKey } from "./tournament.ts";

/** Тип этапа внутри акта (PRD §5.9.3). Не косметика: от типа зависят порог места и сила поля.
 *  `playoffCheck` — «проверка плей-офф»: порог выше обычного, но чемпионство ещё не требуется. */
export type StageKind = "regular" | "elite" | "playoffCheck" | "boss";

/** Шаблон акта: этапы 1–2 Regular, 3 Elite, 4 Playoff Check, 5 Boss Tournament (PRD §5.9.3).
 *  Длина акта выводится ОТСЮДА — второго места, где записано «пять», быть не должно. */
export const SEASON_TEMPLATE: readonly StageKind[] = ["regular", "regular", "elite", "playoffCheck", "boss"];

/** Длина акта = длина шаблона. Cadence боссов и разметка UI считаются от неё. */
export const ACT_LENGTH = SEASON_TEMPLATE.length;

/** Число актов в сезоне. `25` — стартовая продуктовая гипотеза (кандидаты 20/25/30), поэтому
 *  живёт как конфиг билдера, а НЕ как условие победы в коде (PRD §5.9.3, R6.1). */
export const SEASON_ACTS = 5;

/** Пороги обычных этапов по типу. Обычный этап требует конкурентоспособности, а не чемпионства.
 *  Все значения обязаны быть worst-rank реального бакета (см. `LEGAL_ANTE_TARGETS`).
 *
 *  Заменяет плоскую лестницу `ANTE_TARGETS = [8, 6, 4, 3, 1]` пятиэтапного вступительного круга:
 *  та была откалибрована под пять этапов и в 25-этапном сезоне требовала бы чемпионства на пятом
 *  турнире из двадцати пяти. Часть BALANCE_CONFIG_VERSION. */
export const SEASON_TARGETS: Readonly<Record<Exclude<StageKind, "boss">, number>> = {
  regular: 8,
  elite: 6,
  playoffCheck: 4,
};

/** Финалы актов ужесточаются: топ-4 → топ-3 → топ-2 → топ-2 → 1-е (Showdown). Список короче числа
 *  актов — последний порог повторяется (нужно для Династии и для сезонов длиннее пяти актов).
 *
 *  **Чемпионство требуется ровно один раз — на последнем этапе сезона (R6.4, ответ на открытый
 *  вопрос PRD §10.I).** Было `[4, 3, 2, 1, 1]`, то есть 1-е место и на Stage 20, и на Stage 25.
 *  Замер (`npm run sim -- 60 --finales`, общие сиды): требование чемпионства на S20 срезало
 *  билд-забеги, дошедшие до него, с 93.5% до 83.9% проходимости, а жадные — с 62.1% до 48.3%.
 *  При этом ОБЩИЙ win-rate билд-агента одинаков (30.0% на обеих кривых): смягчение S20 не делает
 *  сезон легче, оно переносит точку обрыва с середины сезона в финал — 20 сыгранных турниров
 *  больше не теряются на одной сетке, а забег доходит до Showdown и умирает там.
 *  Полностью убрать чемпионство (`[4,3,2,2,2]`) — 36.7%, но тогда у сезона нет кульминации.
 *  Место выше порога не пропадает: `prizeForStage` платит нормализованную премию, и на S20
 *  чемпионство становится максимальной наградой этапа вместо условия прохода.
 *  Часть BALANCE_CONFIG_VERSION. */
export const SEASON_ACT_FINALES: readonly number[] = [4, 3, 2, 2, 1];

/** Один этап сезона: где он стоит и по каким правилам играется. */
export interface SeasonStage {
  /** Абсолютный индекс с 0. */
  index: number;
  /** Номер акта с 1. */
  act: number;
  /** Номер этапа внутри акта с 1. */
  stageInAct: number;
  kind: StageKind;
  /** Порог места (worst-rank бакета). */
  target: number;
}

/** Правила сезона без развёрнутого списка этапов: их достаточно, чтобы вычислить ЛЮБОЙ этап,
 *  в том числе за концом сезона (Династия продолжает те же акты дальше). */
export interface SeasonRules {
  acts: number;
  actLength: number;
  template: readonly StageKind[];
  targets: Readonly<Record<Exclude<StageKind, "boss">, number>>;
  actFinales: readonly number[];
}

export interface SeasonModel extends SeasonRules {
  /** Все этапы сезона по порядку. Длина = условие окончания забега. */
  stages: readonly SeasonStage[];
}

export interface SeasonConfig {
  acts?: number;
  template?: readonly StageKind[];
  targets?: Readonly<Record<Exclude<StageKind, "boss">, number>>;
  actFinales?: readonly number[];
}

/** Правила ОДНОГО этапа по его абсолютному индексу — арифметикой от шаблона, а не поиском в
 *  массиве. Поэтому функция отвечает и за индексы за пределами сезона: там же живёт Династия
 *  (T5.8), которая продолжает те же акты дальше. */
export function seasonStage(index: number, season: SeasonRules = SEASON): SeasonStage {
  const safeIndex = Math.max(0, index);
  const template = season.template;
  const stageInAct = safeIndex % season.actLength;
  const act = Math.floor(safeIndex / season.actLength) + 1;
  const kind = template[stageInAct];
  const finales = season.actFinales;
  const target = kind === "boss"
    ? finales[Math.min(act - 1, finales.length - 1)]
    : season.targets[kind];
  return { index: safeIndex, act, stageInAct: stageInAct + 1, kind, target };
}

/** Сезон из конфига. Длина сезона — параметр, чтобы симулятор (R10) сравнивал 20/25/30 этапов
 *  тем же кодом, каким играет игра, а не своей копией лестницы. */
export function buildSeason(config: SeasonConfig = {}): SeasonModel {
  const acts = config.acts ?? SEASON_ACTS;
  const template = config.template ?? SEASON_TEMPLATE;
  const rules: SeasonRules = {
    acts,
    actLength: template.length,
    template,
    targets: config.targets ?? SEASON_TARGETS,
    actFinales: config.actFinales ?? SEASON_ACT_FINALES,
  };
  const stages = Array.from({ length: acts * template.length }, (_, index) => seasonStage(index, rules));
  return { ...rules, stages };
}

/** Сезон из готовой лестницы порогов — для тестов и для сравнения произвольных кривых.
 *  Тип этапа выводится из позиции в акте, чтобы cadence боссов оставалась одна на всю игру. */
export function seasonFromTargets(targets: readonly number[], actLength = ACT_LENGTH): SeasonModel {
  const template = Array.from(
    { length: actLength },
    (_, i) => (i === actLength - 1 ? "boss" : "regular") as StageKind,
  );
  const rules: SeasonRules = {
    acts: Math.ceil(targets.length / actLength),
    actLength,
    template,
    targets: SEASON_TARGETS,
    actFinales: SEASON_ACT_FINALES,
  };
  // Разметка (акт, позиция, тип) считается той же функцией, что и в обычном сезоне; своё здесь
  // только явно заданный порог.
  const stages = targets.map((target, index) => ({ ...seasonStage(index, rules), target }));
  return { ...rules, stages };
}

/** Сезон по умолчанию: 5 актов × 5 этапов = 25 турниров (PRD §5.9.3). */
export const SEASON: SeasonModel = buildSeason();

/** Босс стоит только на финале акта — заранее видимое исключительное событие, а не фон каждого
 *  второго этапа (R6.2). Раньше `BOSS_FIRST_STAGE = 2` давал босса на КАЖДОМ этапе с третьего:
 *  три боссовых этапа из пяти, что прямо противоречило PRD. */
export function isActFinale(absoluteStageIndex: number): boolean {
  return absoluteStageIndex >= 0 && seasonStage(absoluteStageIndex).kind === "boss";
}

/** Даёт ли ПРОЙДЕННЫЙ этап титул Династии (T5.8): титул за акт, но только за пределами сезона —
 *  внутри него финал акта уже оплачен растущими призовыми и премией за место (R6.4).
 *  Правило живёт здесь, потому что его читают двое: стор и симулятор. */
export function grantsDynastyTitle(clearedIndex: number, season: SeasonModel = SEASON): boolean {
  return clearedIndex >= season.stages.length && seasonStage(clearedIndex, season).kind === "boss";
}

/** Номер круга Династии для этапа: 0 внутри сезона, 1+ за его пределами. Круг — продолжение
 *  актов за сезоном (LG3), арифметика сезона живёт здесь, рядом с `seasonStage`. */
export function dynastyCircleOf(absoluteStageIndex: number, season: SeasonRules = SEASON): number {
  const seasonLength = season.acts * season.actLength;
  if (absoluteStageIndex < seasonLength) return 0;
  return Math.floor((absoluteStageIndex - seasonLength) / season.actLength) + 1;
}

/** Правила, под которыми играется этап (LG3 / T6.4): внутри сезона — добровольные стартовые
 *  Stakes (то же множество правил, решение 2026-08-09 «мутаторы = Stakes»; с T6.4-2 их может
 *  быть НЕСКОЛЬКО — комбинация открывается первой победой со ставкой), за пределами сезона —
 *  ровно один мутатор круга Династии: Stakes считаются сыгранными вместе с сезоном, а «ставки
 *  плюс правило круга» разом читались бы как каша. Определения и выбор — `dynastyMutators`;
 *  здесь только привязка «этап → правила». Пустой массив = обычный этап. */
export function stageMutators(
  seed: string,
  absoluteStageIndex: number,
  season: SeasonRules = SEASON,
  stakes: readonly MutatorId[] = [],
): readonly MutatorId[] {
  const circle = dynastyCircleOf(absoluteStageIndex, season);
  if (circle === 0) return stakes;
  const rule = mutatorForCircle(seed, circle);
  return rule ? [rule] : [];
}

/** Порог на `steps` шагов жёстче по легальной лестнице бакетов (мутатор `tighterTargets`).
 *  Результат остаётся легальным порогом по построению; жёстче чемпионства не бывает. */
export function tightenedTarget(target: number, steps: number): number {
  const at = LEGAL_ANTE_TARGETS.indexOf(target);
  if (at === -1) return target;
  return LEGAL_ANTE_TARGETS[Math.max(0, at - steps)];
}

/** Эффективный порог этапа с учётом мутатора круга. Единственная точка этой поправки: её читают
 *  движок (resolveStage/state), выплата за пройденный этап (awardStageClear в store и симе) и UI —
 *  вторая копия дала бы этап, который судится по одному порогу, а оплачивается по другому. */
export function effectiveStageTarget(
  seed: string,
  absoluteStageIndex: number,
  season: SeasonRules = SEASON,
  stakes: readonly MutatorId[] = [],
): number {
  const target = seasonStage(absoluteStageIndex, season).target;
  return stageMutators(seed, absoluteStageIndex, season, stakes).includes("tighterTargets")
    ? tightenedTarget(target, MUTATORS.tighterTargets.steps)
    : target;
}

/** Множитель цен рынка этапа (мутатор `expensiveMarket`). Живёт рядом с мутаторами, а не в
 *  рынке: рынок применяет множитель на ГЕНЕРАЦИИ офферов, чтобы превью, покупка и сим читали
 *  одну цену. */
export function marketCostFactor(
  seed: string,
  campStageIndex: number,
  season: SeasonRules = SEASON,
  stakes: readonly MutatorId[] = [],
): number {
  return stageMutators(seed, campStageIndex, season, stakes).includes("expensiveMarket")
    ? MUTATORS.expensiveMarket.costFactor
    : 1;
}

/** Ближайший боссовый этап СТРОГО ПОСЛЕ `absoluteStageIndex` (R9.4).
 *
 *  Нужен разведке: правило предстоящего этапа игрок и так видит в Буткемпе, поэтому «раскрыть»
 *  можно только то, что дальше по сезону. Считается арифметикой актов, поэтому работает и в
 *  Династии, где сезон уже кончился. */
export function nextBossStage(absoluteStageIndex: number, season: SeasonRules = SEASON): number {
  const from = Math.max(-1, absoluteStageIndex);
  for (let index = from + 1; index <= from + season.actLength; index += 1) {
    if (seasonStage(index, season).kind === "boss") return index;
  }
  // В шаблоне акта боссовый этап есть всегда (иначе это не акт-модель), но не полагаться на это
  // молча: пустой ответ честнее выдуманного индекса.
  return -1;
}

/** Легальные пороги = worst-rank реальных placement-бакетов (R9.3/R6.4).
 *
 *  Любое другое число даёт ложную подпись. Прежний `target = 10` не пропускал бакет «9-12»
 *  (worst 12), то есть «топ-10» фактически требовал топ-8 — игрок читал одно правило, а играл по
 *  другому. Проверяется в конструкторе, чтобы будущая калибровка не завела новое ложное число. */
export const LEGAL_ANTE_TARGETS: readonly number[] = [
  ...new Set(PLACEMENT_KEYS.map(placementWorstRank)),
].sort((a, b) => a - b);

export function isLegalAnteTarget(target: number): boolean {
  return LEGAL_ANTE_TARGETS.includes(target);
}

/** На сколько растёт СРЕДНЯЯ сила поля с каждым этапом. */
export const ANTE_FIELD_STEP = 3;

/** Средняя сила поля на первом этапе и границы качества ростера соперника (R7.1).
 *
 *  Раньше здесь стоял `ANTE_FIELD_HANDICAP`: поле Quick Draft сдвигалось вниз и переклампливалось
 *  в `[76, 99]`. Замер показал, что это ломало саму выборку — на первом этапе **90.2% ботов
 *  стояли ровно на 76** при `sd ≈ 0.99`, то есть поле было одним значением, а не распределением:
 *  боты играли между собой в монетку, и место игрока решала жеребьёвка. Теперь по этапу двигается
 *  `mean`, а `sd` остаётся живым; нижняя граница качества опущена до 60, чтобы ранние этапы не
 *  упирались в неё снова.
 *
 *  Часть BALANCE_CONFIG_VERSION — правишь числа, бампай версию в balance.ts. */
export const ANTE_FIELD = { meanBase: 71, sd: 5, min: 60, max: 99 } as const;

/** Угроза поля сверх качества ростера (R7.2). Часть BALANCE_CONFIG_VERSION. */
export const ANTE_THREAT = {
  /** За каждый ПРОЙДЕННЫЙ акт. Внутри акта рампу даёт растущий `mean`, между актами — угроза:
   *  так у двух источников сложности разные роли и их видно раздельно. */
  perAct: 6,
  /** Каждый следующий акт добавляет больше предыдущего. Без ускорения бесконечная Династия вышла
   *  бы на плато: команда упирается в конечный потолок (пул игроков, caps, слоты), а угроза
   *  обязана расти без границы — иначе штатным финалом перестаёт быть поражение (PRD §5.9.3). */
  actAcceleration: 2,
  /** Надбавка на финале акта (Boss Tournament). Правило босса остаётся главным — это лишь
   *  «финал акта играется более сильным полем», а не замена условия числом. */
  boss: 1,
  /** Elite-этап (3-й в акте) по PRD — «усиленное поле, но не босс»: у него нет правила, поэтому
   *  вся его сложность обязана быть в поле, и надбавка заметно больше боссовой. Число —
   *  плейсхолдер R6.1, пере-калибровка по замеру за R6.4/R10. */
  elite: 3,
  /** Множитель поля за каждый ПРОЙДЕННЫЙ акт — геометрический (`(1+multPerAct)^acts`): это
   *  мультипликативная часть угрозы из R7.2 (`opponentTeamMult · opponentXMult`), отложенная
   *  до появления Tournament Power у игрока (R8.2). Без неё поле росло только аддитивно
   *  (+36 к 5-му акту), а билд игрока — множителями (×2.65 p50 на 25-м этапе, замер b1.35.0),
   *  и после 6-го этапа билд-агент не умирал вовсе (survival 64% плоско до финала). Число —
   *  из офлайн-свипа по дампу 400 сидов + A/B на тех же сидах: 0.20 → 42.5%, 0.22 → 35.8%,
   *  0.25 → 23.8% у synergy-build при полосе PRD 30–40% (см. balance.ts b1.36.0).
   *  b1.44.0 (2026-09-02): перекалибровка под агента `select-build` (карта берётся только при
   *  приросте силы сейчас — ближайший прокси осмысленной игры; прежний synergy-opt брал карты
   *  вслепую). Свип на 300 общих сидах: 0.22 → 52.7%, 0.25 → 45.7%, **0.28 → 35.0%**,
   *  0.32 → 23.3% у select-build; 0.28 — середина полосы PRD. Акт 1 не меняется (рампа с первого
   *  пройденного акта) — e2e-сиды и golden на месте. */
  multPerAct: 0.28,
  /** Шаг того же множителя ЗА пределами сезона (Династия, R6.3). Меньше сезонного не ради
   *  «полегче», а потому что у двух фаз разный источник роста игрока: замер 200 сидов показал
   *  рост силы билда за акт `1.53 / 1.50 / 1.24 / 1.26 / 1.05` по актам сезона и **1.007** в
   *  Династии — там слоты полны, качество на максимуме, и билд живёт заменами, а не ростом.
   *  При общем шаге 0.22 чистое давление (поле ÷ рост билда) в Династии — самое высокое в игре
   *  (1.21 против 0.98–1.17 в сезоне), и хвост срезался раньше, чем игрок успевал ответить.
   *  0.14 держит давление Династии между серединой и концом сезона (1.14/1.007 ≈ 1.13 против
   *  0.98 в актах 3–4 и 1.17 в акте 5) — Династия остаётся самой тяжёлой фазой, но перестаёт
   *  быть тяжелее всего сезона разом. Медианную глубину это не двигает (её решает дисперсия
   *  первых кругов), растёт именно хвост — свип по дампу и A/B в BACKLOG R10. */
  /** b1.44.0: сезонный шаг 0.22→0.28, династийный 0.14→0.22. Свип `--dynasty` (100 сидов,
   *  select-build): 0.18 → глубина p50/p90 13/30, 0.22 → 10/26, 0.26 → 10/24; смерть неизбежна
   *  во всех (35/35 династийных забегов гибнут). 0.22 держит документированную глубину ~9–10 и
   *  оставляет Династию тяжелее конца сезона. */
  dynastyMultPerAct: 0.22,
  /** Центр рампы множителя — доля длины акта (b1.39.0). 0.6 = центр смещён к хвосту: бОльшая
   *  часть акта мягче плоского уровня, жёстче только финал. Симметричный центр 0.5 (чистое
   *  сохранение геосреднего) ронял сезонную полосу 35.8 → 26.0%: «жёстче хвост» бьёт по этапам
   *  с жёсткими порогами дороже, чем «мягче вход» компенсирует на топ-8. Свип реальным симом
   *  (400 сидов): 0.5 → 26.0, 0.55 → 28.7, 0.6 → 32.5% — полоса PRD 30–40 возвращена. */
  multRampCenter: 0.6,
} as const;

/** Множитель поля по пройденным актам (R7.2, мультипликативная часть), с b1.39.0 — сглаженный
 *  ВНУТРИ акта центрированной рампой показателя: `q^(acts + (stageInAct − центр)/длина)`.
 *
 *  Зачем рампа (замер b1.38.0, дамп 200 сидов): при плоском множителе 30 из 69 смертей Династии
 *  стояли на ПЕРВОМ этапе нового акта — самом мягком по порогу (топ-8), сразу после взятого
 *  титула: ступенька +22% приходила скачком, а билд за один этап так не прибавляет. Худший
 *  вариант драматургически — гибель на проходном турнире после чемпионства.
 *
 *  Свойства конструкции:
 *  - центр рампы смещён к хвосту акта (`multRampCenter`): вход в акт заметно мягче плоского
 *    уровня, жёстче плоского — только финал; геосреднее акта = q^(acts − 0.1·…) чуть мягче
 *    плоского, и это НЕ побочный эффект, а калибровка: симметричный центр возвращал полосу
 *    26.0% (см. ANTE_THREAT.multRampCenter) — смерть переезжает на этапы с именем;
 *  - акт 1 остаётся ровно 1 на всех этапах (рампы нет до первого пройденного акта): сезонное
 *    начало, e2e-сиды и golden не двигаются;
 *  - кривая строго неубывающая: внутри акта шаг q^(1/5), на границе актов q^(3/5) — больше
 *    внутриактового, но втрое меньше прежнего скачка q^1;
 *  - Династия продолжает ту же кривую своим наклоном (`dynastyMultPerAct`), рампа та же. */
export function anteFieldMult(absoluteStageIndex: number, season: SeasonRules = SEASON): number {
  const completedActs = Math.max(0, Math.floor(absoluteStageIndex / season.actLength));
  if (completedActs === 0) return 1;
  const stageInAct = Math.max(0, absoluteStageIndex) % season.actLength;
  const frac = (stageInAct - ANTE_THREAT.multRampCenter * season.actLength) / season.actLength;
  const seasonActs = Math.min(completedActs, season.acts);
  const dynastyActs = completedActs - seasonActs;
  // Дробная часть уходит наклону ТЕКУЩЕГО акта: первый акт Династии (completedActs == acts)
  // уже рампится династийным шагом — иначе на стыке наклонов кривая давала бы микропровал
  // (сезонный полушаг q^0.4 больше династийного q^0.6 при dynastyMultPerAct < multPerAct).
  const inDynasty = completedActs >= season.acts;
  const seasonExp = inDynasty ? seasonActs : seasonActs + frac;
  const dynastyExp = inDynasty ? dynastyActs + frac : 0;
  return ((1 + ANTE_THREAT.multPerAct) ** seasonExp) * ((1 + ANTE_THREAT.dynastyMultPerAct) ** dynastyExp);
}

/** Суммарная угроза этапа. `stake` — сид под Stakes (T6.4): системы ещё нет, поэтому значение
 *  приходит извне и по умолчанию 0, а не выдумывается здесь.
 *
 *  Угроза акта = сумма арифметической прогрессии по ПРОЙДЕННЫМ актам: за первый пройденный акт
 *  `perAct`, за второй `perAct + actAcceleration` и так далее. Надбавка типа этапа (boss/elite)
 *  живёт рядом: внутри акта рампу даёт растущий `mean`, а тип этапа — точечный скачок. */
export function anteThreat(
  absoluteStageIndex: number,
  opts: { stake?: number; season?: SeasonRules } = {},
): number {
  const season = opts.season ?? SEASON;
  const completedActs = Math.max(0, Math.floor(absoluteStageIndex / season.actLength));
  const actThreat = completedActs * ANTE_THREAT.perAct
    + (ANTE_THREAT.actAcceleration * completedActs * (completedActs - 1)) / 2;
  const { kind } = seasonStage(absoluteStageIndex, season);
  const kindThreat = kind === "boss" ? ANTE_THREAT.boss : kind === "elite" ? ANTE_THREAT.elite : 0;
  return actThreat + kindThreat + (opts.stake ?? 0);
}

/** Модель поля этапа `stageIndex` (0-based). Верхняя граница относится к КАЧЕСТВУ ростера;
 *  безлимитная угроза акта/босса/Stake приходит отдельным слагаемым `threat` (R7.2). */
export function anteFieldModel(
  stageIndex: number,
  opts: { stake?: number; season?: SeasonRules } = {},
): FieldModel {
  // Рампа `mean` — ВНУТРИ акта, а не по абсолютному этапу. Иначе к 25-му этапу mean ушёл бы за
  // 143, все боты уткнулись бы в потолок качества 99, и спайк, ради которого затевался R7.1,
  // вернулся бы с другой стороны. Рост между актами несёт безлимитный `threat`.
  const stageInAct = Math.max(0, stageIndex) % (opts.season ?? SEASON).actLength;
  return {
    mean: ANTE_FIELD.meanBase + stageInAct * ANTE_FIELD_STEP,
    sd: ANTE_FIELD.sd,
    min: ANTE_FIELD.min,
    max: ANTE_FIELD.max,
    threat: anteThreat(stageIndex, opts),
    mult: anteFieldMult(stageIndex, opts.season),
  };
}

export type AntePhase = "playing" | "won" | "lost";

/** Худшее (самое высокое) числовое место в бакете PlacementKey. Порог пройден, если весь бакет
 *  укладывается в цель: «7-8» (худшее 8) проходит топ-8, «9-12» (худшее 12) — нет. Так сравнение
 *  бакета с числовой целью однозначно, без «а вдруг там 5-е». */
export function placementWorstRank(placement: PlacementKey): number {
  const dash = placement.indexOf("-");
  return dash === -1 ? Number(placement) : Number(placement.slice(dash + 1));
}

export interface AnteStageView {
  /** Индекс этапа с 0. */
  index: number;
  /** Всего этапов в забеге. */
  count: number;
  /** Порог места текущего этапа (числовой, worst-rank). */
  target: number;
  /** Средняя сила поля этого этапа — то, что растёт от этапа к этапу. */
  fieldMean: number;
  /** Номер акта с 1 и позиция внутри акта с 1 — то, что показывает UI («Акт 2 · Этап 3»). */
  act: number;
  stageInAct: number;
  /** Всего актов в сезоне. */
  actCount: number;
  /** Тип этапа: от него зависят порог и сила поля, поэтому он виден игроку. */
  kind: StageKind;
  /** Взятые титулы (Aegis) — по одному за пройденный финал акта. Выводится из индекса, а не
   *  хранится счётчиком: попасть на этап N можно только пройдя все предыдущие, поэтому второй
   *  источник правды здесь был бы лишним местом для рассинхрона. */
  titles: number;
}

export interface AnteRunState extends AnteStageView {
  phase: AntePhase;
  /** Место игрока на предыдущем разрешённом этапе, иначе null. */
  lastPlacement: PlacementKey | null;
  /** Сезон уже выигран (R6.3). Липкий флаг: поражение в Династии победу НЕ отменяет. */
  seasonWon: boolean;
  /** Забег продолжается за пределами сезона — идёт Династия (T5.8). */
  dynasty: boolean;
}

/** Чистая оркестрация ante-забега. Детерминизм: `seed + dataset + версия ⇒ та же
 *  последовательность полей, исходов и точки смерти`. */
export class AnteRunEngine {
  private stageIndex = 0;
  private phase: AntePhase = "playing";
  private lastPlacement: PlacementKey | null = null;
  /** Липкий флаг победы сезона (R6.3): once true — навсегда, даже если дальше Династия проиграна. */
  private seasonWon = false;
  private currentEngine: TournamentEngine;

  constructor(
    private readonly data: GameData,
    private readonly format: Format,
    private readonly seed: string,
    private teamOvr: number,
    private readonly teamName: string,
    private readonly season: SeasonModel = SEASON,
    /** Стартовые Stakes (T6.4/T6.4-2): правила, под которыми играется весь сезон. Часть RunConfig. */
    private readonly stakes: readonly MutatorId[] = [],
  ) {
    if (season.stages.length === 0) throw new Error("Ante run needs at least one stage");
    const illegal = season.stages.map((stage) => stage.target).filter((target) => !isLegalAnteTarget(target));
    if (illegal.length) {
      throw new Error(
        `Порог этапа обязан совпадать с worst-rank реального бакета `
        + `(${LEGAL_ANTE_TARGETS.join(", ")}), получено: ${illegal.join(", ")}`,
      );
    }
    this.currentEngine = this.buildStage(0);
  }

  private buildStage(index: number): TournamentEngine {
    // Своё seed-пространство на этап: этапы не должны делить поток Rng, иначе исход одного
    // зависел бы от числа роллов другого. Поле задаётся моделью этапа; Quick Draft зовёт турнир
    // вообще без неё (дефолт QUICK_DRAFT_FIELD) — golden не двигается.
    const stageSeed = `${this.seed}:ante:stage-${index}`;
    return new TournamentEngine(
      this.data, this.format, stageSeed, this.teamOvr, this.teamName, 0,
      anteFieldModel(index, { season: this.season }),
    );
  }

  /** Турнир текущего этапа. UI гонит его reveal (advance) как в Quick Draft. */
  get tournament(): TournamentEngine {
    return this.currentEngine;
  }

  /** Правила этапа: внутри сезона авторитетен его список (там могут стоять произвольные пороги,
   *  например у тестовой лестницы), за его пределами — арифметика актов, по которой идёт
   *  Династия (R6.3). Мутатор круга (LG3) может ужесточить порог — внутри сезона он null,
   *  поэтому сезонные лестницы (и легальность порогов из конструктора) не трогаются. */
  private stageAt(index: number): SeasonStage {
    const stage = this.season.stages[index] ?? seasonStage(index, this.season);
    if (!stageMutators(this.seed, index, this.season, this.stakes).includes("tighterTargets")) return stage;
    return { ...stage, target: tightenedTarget(stage.target, MUTATORS.tighterTargets.steps) };
  }

  get state(): AnteRunState {
    const stage = this.stageAt(this.stageIndex);
    return {
      index: this.stageIndex,
      count: this.season.stages.length,
      target: stage.target,
      fieldMean: anteFieldModel(this.stageIndex, { season: this.season }).mean,
      act: stage.act,
      stageInAct: stage.stageInAct,
      actCount: this.season.acts,
      kind: stage.kind,
      titles: Math.floor(this.stageIndex / this.season.actLength) + (this.phase === "won" ? 1 : 0),
      phase: this.phase,
      lastPlacement: this.lastPlacement,
      seasonWon: this.seasonWon,
      dynasty: this.stageIndex >= this.season.stages.length,
    };
  }

  /** Разрешить текущий этап по фактическому месту игрока. Вызывать, когда турнир доигран
   *  (playoffs терминальный). Пробил порог → следующий этап (или победа на последнем); промах →
   *  смерть. После окончания забега — no-op. Возвращает новую фазу. */
  resolveStage(): AntePhase {
    if (this.phase !== "playing") return this.phase;
    const placement = this.currentEngine.snapshot.userPlacement;
    this.lastPlacement = placement;
    if (placementWorstRank(placement) > this.stageAt(this.stageIndex).target) {
      this.phase = "lost";
    } else if (this.stageIndex === this.season.stages.length - 1) {
      // Победа сезона терминальна ровно один раз — на последнем его этапе (R6.3). В Династии
      // (индекс уже за сезоном) прохода порога достаточно, чтобы играть дальше: второй «победы»
      // там нет, штатный финал бесконечной фазы — поражение (PRD §5.9.3).
      this.phase = "won";
      this.seasonWon = true;
    } else {
      this.stageIndex += 1;
      this.currentEngine = this.buildStage(this.stageIndex);
    }
    return this.phase;
  }

  /** Продолжить выигранный сезон Династией (R6.3): добровольный выбор игрока после победы.
   *  Победа остаётся засчитанной (`seasonWon` липкий), поэтому поражение в Династии её не
   *  отменяет — оно лишь фиксирует глубину. Вне фазы `won` — no-op. */
  continueDynasty(): AntePhase {
    if (this.phase !== "won") return this.phase;
    this.phase = "playing";
    this.stageIndex += 1;
    this.lastPlacement = null;
    this.currentEngine = this.buildStage(this.stageIndex);
    return this.phase;
  }

  /** Пересобрать поле ТЕКУЩЕГО этапа под новый teamOvr (manual-свап героев до симуляции),
   *  сохранив прогресс по этапам. */
  rebuildCurrentStage(teamOvr: number): void {
    if (this.phase !== "playing") return;
    this.teamOvr = teamOvr;
    this.currentEngine = this.buildStage(this.stageIndex);
  }

  /** Перемотать до этапа `index` (resume сохранённого ante-забега). Детерминизм: пройденные
   *  этапы по seed те же, поэтому просто пересобираем поле нужного этапа без ре-симуляции.
   *  Верхней границы нет: сохранённый забег мог уйти в Династию за пределы сезона (R6.3).
   *  `seasonWon` восстанавливается отдельно — из сейва, а не выводится из индекса: сезон считается
   *  выигранным по факту победы, а не по тому, докуда дошёл индекс. */
  jumpToStage(index: number, opts: { seasonWon?: boolean } = {}): void {
    if (index < 0) throw new Error(`Ante stage out of range: ${index}`);
    this.stageIndex = index;
    this.phase = "playing";
    this.lastPlacement = null;
    this.seasonWon = opts.seasonWon ?? index >= this.season.stages.length;
    this.currentEngine = this.buildStage(index);
  }
}
