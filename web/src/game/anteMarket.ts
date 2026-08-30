// Контекстный рынок Roguelite Run (срез 3). Экономика по-прежнему отвечает за золото
// и детерминированные слоты, RunEngine — за реальный ростер и scoreTeam; этот тонкий слой
// связывает их, превращая три рычага Base/Hero Synergy/Chemistry в конкретные swaps.
import type { MutatorId } from "./dynastyMutators.ts";
import type { Role } from "../types/data.ts";
import type { ScoreBreakdown } from "./score.ts";
import { Rng } from "./rng.ts";
import { candidateRef, ROLE_SEQUENCE, type Candidate } from "./packs.ts";
import { RunEngine } from "./engine.ts";
import { formUpgradeCost, playerCost, type Offer, type SummandValues } from "./anteEconomy.ts";
import { marketCostFactor } from "./anteRun.ts";
import { heroPrice, rarityOvrContribution, rollHeroRarity, upgradePathCost } from "./heroRarity.ts";
import { rarityRank, type Rarity } from "./rarity.ts";
import { tacticMarketEffects, tacticRarityFactor } from "./tactics.ts";

interface HeroOption {
  outgoingHeroId: number;
  incomingHeroId: number;
  preview: ScoreBreakdown;
}

/** Карта hero re-pick до превращения в Offer: вариант замены, качество входящего и ПОЛНАЯ дельта
 *  Team OVR — ровно та, что увидит игрок (счёт состава + сдвиг вклада редкости). */
interface HeroCard {
  /** Замена: какой герой входит и кого вытесняет. Пусто у карты улучшения — она ростер не трогает. */
  option?: HeroOption;
  /** Улучшение своего героя (R14.8): вместо замены поднимается тир уже активного. */
  upgradeHeroId?: number;
  incomingRarity: Rarity;
  ovrDelta: number;
}

interface PlayerOption {
  slotIndex: number;
  candidate: Candidate;
  preview: ScoreBreakdown;
}

function values(score: ScoreBreakdown): SummandValues {
  return {
    base: score.base,
    heroSynergy: score.heroSynergy,
    chemistry: score.chemistry,
  };
}

/** Тир формы игрока — по percentile OVR ВНУТРИ роли (не по универсальному порогу): support с 80
 *  и керри с 80 — разные явления, а сравнивать надо однородное. */
export type FormTier = "standard" | "strong" | "elite" | "peak";

export const FORM_TIERS: readonly FormTier[] = ["standard", "strong", "elite", "peak"];

/** Верхняя граница percentile для каждого тира (доля пула роли снизу). */
const FORM_TIER_BOUNDS: Record<FormTier, number> = {
  standard: 0.50,
  strong: 0.80,
  elite: 0.95,
  peak: 1,
};

/** Шансы тиров по ходу сезона (R5.1). Жёсткой привязки тиров к актам НЕТ: игрок уровня 95 может
 *  встретиться уже в первом Буткемпе — это редкое, дорогое и определяющее событие (перенос
 *  принципа Balatro «редкая сильная карта может выпасть рано»). Этап влияет на ВЕРОЯТНОСТЬ, а не
 *  на eligibility.
 *  Placeholder под калибровку R10; часть BALANCE_CONFIG_VERSION. */
export const FORM_ODDS: readonly Record<FormTier, number>[] = [
  { standard: 70, strong: 24, elite: 5, peak: 1 },
  { standard: 58, strong: 29, elite: 11, peak: 2 },
  { standard: 45, strong: 34, elite: 17, peak: 4 },
  { standard: 34, strong: 36, elite: 23, peak: 7 },
  { standard: 25, strong: 35, elite: 28, peak: 12 },
];

/** Строка шансов по прогрессу сезона `0..1`. Индексируем прогрессом, а не номером акта, чтобы
 *  таблица одинаково работала и на нынешнем пятиэтапном сезоне, и на целевом 25-этапном (R6.1). */
export function formOdds(seasonProgress: number): Record<FormTier, number> {
  const clamped = Math.min(1, Math.max(0, seasonProgress));
  return FORM_ODDS[Math.min(FORM_ODDS.length - 1, Math.floor(clamped * FORM_ODDS.length))];
}

/** Разбить пул роли на тиры по percentile OVR. Порядок внутри тира стабилен (сортировка пула). */
export function formTiersOf(pool: readonly Candidate[]): Record<FormTier, Candidate[]> {
  const sorted = [...pool].sort((a, b) => a.player.ovr - b.player.ovr);
  const tiers: Record<FormTier, Candidate[]> = { standard: [], strong: [], elite: [], peak: [] };
  sorted.forEach((candidate, index) => {
    const percentile = sorted.length <= 1 ? 1 : (index + 1) / sorted.length;
    const tier = FORM_TIERS.find((t) => percentile <= FORM_TIER_BOUNDS[t]) ?? "peak";
    tiers[tier].push(candidate);
  });
  return tiers;
}

/** Нижняя граница рынка (R5.1-fix). Placeholder под калибровку R10; часть BALANCE_CONFIG_VERSION. */
export const FORM_FLOOR = {
  /** Какую долю пула роли рынок перестаёт выставлять К КОНЦУ сезона (в начале — ничего). */
  endPercentile: 0.5,
  /** Насколько ниже слабейшего своего игрока этой роли рынок ещё показывает формы. */
  rosterGapOvr: 6,
  /** Пул не сжимаем ниже этого числа форм — иначе рулетка выродится в одну карту. */
  minPoolSize: 12,
} as const;

/**
 * Что рынок вообще выставляет для роли.
 *
 * Проблема, которую это чинит: после отказа от свёртки snapshot'ов (R5.1) пул стал честным, но
 * абсолютно-перцентильным. Замер показал, что на последнем этапе 25% карт — это 56–74 OVR, ещё
 * 35% — 74–82. Против состава 85+ такие карты бесполезны, а дорожающий реролл (R4.2) превращает
 * их в чистую потерю золота.
 *
 * Важно: это НЕ отмена «ловушек» (решение 2026-07-23). Ловушка обязана быть соблазнительной и
 * неправильной; карта 60 рядом с составом 85 никого не соблазняет — это шум, а не выбор. Формы
 * чуть ниже своих (79–83 против 84) остаются и остаются ловушками.
 *
 * Порог — СТРОГИЙ ИЗ ДВУХ:
 *  1) кривая по этапу — предсказуема и калибруется симулятором в отрыве от стратегии игрока;
 *  2) «явно хуже того, что уже стоит в этой роли» — страхует случай, когда забег пошёл сильнее
 *     кривой; она же не даёт рынку раздуться, потому что только УБИРАЕТ мёртвые карты.
 *
 * Отдельное правило для форм СВОЕГО игрока: у них меняется только Base (Chemistry и Hero Synergy
 * считаются по accountId и переносятся), поэтому форма не сильнее текущей — доказуемо мёртвая
 * карта, а не ловушка. Ровно так на рынок попадал «Nisha 90 → Nisha 90» с нулевой дельтой.
 */
export function stockedForms(
  rolePool: readonly Candidate[],
  opts: { seasonProgress: number; activeOvrs: readonly number[]; ownActiveOvr?: number },
): Candidate[] {
  const byOvr = [...rolePool].sort((a, b) => a.player.ovr - b.player.ovr);
  if (!byOvr.length) return [];

  const progress = Math.min(1, Math.max(0, opts.seasonProgress));
  const cut = Math.floor(byOvr.length * FORM_FLOOR.endPercentile * progress);
  const stageFloor = byOvr[Math.min(cut, byOvr.length - 1)].player.ovr;
  const rosterFloor = opts.activeOvrs.length
    ? Math.min(...opts.activeOvrs) - FORM_FLOOR.rosterGapOvr
    : -Infinity;
  const floor = Math.max(stageFloor, rosterFloor);

  const kept = byOvr.filter((candidate) => candidate.player.ovr >= floor);
  // Пул роли может почти целиком уйти под порог на позднем этапе сильного забега — тогда просто
  // берём верхушку: лучше маленький сильный рынок, чем пустой.
  return kept.length >= FORM_FLOOR.minPoolSize ? kept : byOvr.slice(-FORM_FLOOR.minPoolSize);
}

/** Первый непустой набор из перечисленных — для ступенчатого ослабления фильтров рынка. */
function firstNonEmpty<T>(...lists: T[][]): T[] {
  return lists.find((list) => list.length > 0) ?? [];
}

/** Кандидат роли: сперва по шансам выбирается ТИР формы, потом равномерно карта внутри тира.
 *
 *  Раньше здесь был равномерный `rng.pick` по всему пулу. После отказа от свёртки snapshot'ов
 *  (R5.1) это стало прямым смещением: у одного человека в окне бывает под шесть десятков
 *  event-снимков, и равномерная выборка показывала бы «кто чаще играл», а не «кто сильнее».
 *  Фильтр «только апгрейд» по-прежнему отсутствует: слабые формы остаются честными ловушками. */
function roulettePick(pool: Candidate[], rng: Rng, seasonProgress: number): Candidate | null {
  if (!pool.length) return null;
  const tiers = formTiersOf(pool);
  const odds = formOdds(seasonProgress);
  // Пустые тиры не съедают свой вес: перенормируем по фактически доступным.
  const available = FORM_TIERS.filter((tier) => tiers[tier].length > 0);
  const total = available.reduce((sum, tier) => sum + odds[tier], 0);
  if (total <= 0) return rng.pick(pool);
  let roll = rng.int(total);
  for (const tier of available) {
    roll -= odds[tier];
    if (roll < 0) return rng.pick(tiers[tier]);
  }
  return rng.pick(tiers[available[available.length - 1]]);
}

/** Лучший same-role слот для конкретного входящего игрока. Обычно он один, но у двух
 * support-слотов выбор должен зависеть от полного scoreTeam, а не от позиции карты в паке. */
function bestPlayerOption(engine: RunEngine, candidate: Candidate): PlayerOption {
  const options = engine.rosterView.flatMap((slot, slotIndex) => (
    // canReplacePlayer, а не только совпадение роли: у Form Upgrade та же личность уже стоит в
    // составе, и второй слот той же роли для неё законно недоступен.
    slot.candidate && slot.role === candidate.player.role && engine.canReplacePlayer(slotIndex, candidate)
      ? [{
          slotIndex,
          candidate,
          preview: engine.previewPlayerReplacement(slotIndex, candidate),
        }]
      : []
  ));
  if (!options.length) {
    throw new Error(`Нет активного слота роли ${candidate.player.role} для market replacement`);
  }
  return options.reduce((best, option) => {
    if (option.preview.teamOvr !== best.preview.teamOvr) {
      return option.preview.teamOvr > best.preview.teamOvr ? option : best;
    }
    if (option.preview.base !== best.preview.base) {
      return option.preview.base > best.preview.base ? option : best;
    }
    return option.slotIndex < best.slotIndex ? option : best;
  });
}

/** Лучший честный вариант освобождения hero-slot под конкретного входящего героя.
 * Hungarian matching внутри preview заново оптимизирует назначения; здесь выбираем лишь,
 * кого убрать из активного пула, чтобы не показывать случайно испорченную замену.
 *
 * Выбор учитывает РЕДКОСТЬ снимаемого героя: `previewHeroReplacement` считает чистый score.ts, а
 * вклад редкости живёт слоем поверх него, и без вычитания рынок охотно предлагал снести immortal
 * (−3.4 к Team OVR) ради выигрыша в полочка score. Это тот же класс расхождения, который уже
 * чинили в превью карточки, — только здесь он влиял на САМ выбор, а не на подпись. */
function bestHeroOption(
  engine: RunEngine,
  incomingHeroId: number,
  rarityOf: (heroId: number) => Rarity,
  /** Множитель вклада редкости (trade-off Wide Pool): выбор снимаемого героя обязан считать
   *  редкость той же силой, что и боевой расчёт, иначе рынок ранжирует по несуществующей цене. */
  rarityFactor = 1,
): HeroOption {
  if (engine.heroes.length !== ROLE_SEQUENCE.length) {
    throw new Error(
      `Нельзя подобрать hero replacement: нужно ${ROLE_SEQUENCE.length} активных героев, `
      + `получено ${engine.heroes.length}`,
    );
  }
  return engine.heroes
    .map((outgoingHeroId) => {
      const preview = engine.previewHeroReplacement(outgoingHeroId, incomingHeroId);
      return {
        outgoingHeroId,
        incomingHeroId,
        preview,
        // Вклад входящего одинаков во всех вариантах и на выбор не влияет — вычитаем только потерю.
        adjusted: preview.teamOvr - rarityOvrContribution(rarityOf(outgoingHeroId)) * rarityFactor,
      };
    })
    .reduce((best, option) => {
      if (option.adjusted !== best.adjusted) return option.adjusted > best.adjusted ? option : best;
      if (option.preview.heroSynergy !== best.preview.heroSynergy) {
        return option.preview.heroSynergy > best.preview.heroSynergy ? option : best;
      }
      return option.outgoingHeroId < best.outgoingHeroId ? option : best;
    });
}

/** Какие карты player-пака остаются, когда тактика сужает рынок (Last Dance).
 *
 * Раньше здесь стоял `offers.splice(packSize)` — обрезка хвоста ФИКСИРОВАННОГО `ROLE_SEQUENCE`
 * (`safelane, mid, offlane, support, support`). То есть тактика не «убирала пару случайных
 * вариантов», а систематически удаляла ОБОИХ саппортов: саппорт-слот при активной Last Dance
 * нельзя было усилить в принципе. Trade-off обязан забирать КОЛИЧЕСТВО опций, а не запрещать
 * роль, поэтому выборка сбалансирована: минимум один core и минимум один support, пока размер
 * пака это позволяет.
 *
 * Детерминизм по `seed + camp + rerollN`: тот же забег ⇒ тот же сокращённый пак. Порядок
 * отображения сохраняется (сортировка по исходному слоту), а сами удержанные карты остаются в
 * точности теми же, что и без тактики, — сужение не подменяет вероятности скрытым образом. */
export function balancedPackSlots(roles: readonly Role[], packSize: number, rng: Rng): number[] {
  const all = roles.map((_, index) => index);
  if (packSize >= all.length) return all;
  if (packSize <= 0) return [];
  const picked = new Set<number>();
  // Гарантия обеих групп имеет смысл только когда в паке есть место хотя бы под две карты.
  if (packSize >= 2) {
    const core = all.filter((index) => roles[index] !== "support");
    const support = all.filter((index) => roles[index] === "support");
    if (core.length) picked.add(rng.pick(core));
    if (support.length) picked.add(rng.pick(support));
  }
  for (const index of rng.shuffle(all.filter((i) => !picked.has(i)))) {
    if (picked.size >= packSize) break;
    picked.add(index);
  }
  return [...picked].sort((a, b) => a - b);
}

/** Рулетка hero-пула (R12.2). Placeholder под калибровку R10; часть BALANCE_CONFIG_VERSION. */
export const HERO_POOL = {
  /** Базовый вес. Любой герой формата обязан оставаться достижимым, поэтому вес не бывает нулевым:
   *  собрать состав под тег нельзя, если героя с этим тегом невозможно встретить. */
  minWeight: 1,
  /** Во сколько раз чаще встречается герой, на котором у пятёрки максимум career-игр. */
  familiarBias: 4,
  /** Career-игры, на которых бонус веса выходит на плато. */
  gamesWindow: 60,
  /** Сколько карт рулетка вытягивает и оценивает, прежде чем добрать пак из отсеянных. Множитель к
   *  размеру пака: одна оценка — это пять полных `scoreTeam` с matching, поэтому перебирать весь
   *  пул из 117 героев на каждый реролл нельзя. */
  drawFactor: 4,
  /** Во сколько раз шире отсеянных рассматривается при доборе пака, чем нужно карт. Добор идёт
   *  рулеткой по этой верхушке: `1` означал бы детерминированный `sort().slice()` — ровно тот
   *  дефект, из-за которого реролл не работал (R12.1). */
  fillerSpread: 2,
} as const;

/** Вес героя в рулетке рынка: знакомый пятёрке встречается чаще, незнакомый — реже, но никогда не
 *  «никогда». Чистая функция от career-игр, чтобы вес считался одинаково в рынке и в тестах. */
export function heroWeight(games: number): number {
  const familiarity = Math.min(1, Math.max(0, games) / HERO_POOL.gamesWindow);
  return HERO_POOL.minWeight + HERO_POOL.familiarBias * familiarity;
}

/** Вытянуть героя по весу и УБРАТЬ его из пула: без возвращения, иначе одна карта пришла бы в пак
 *  дважды. Мутирует переданный массив — это локальная копия пула на текущий реролл. */
function drawWeighted(pool: { heroId: number; games: number }[], rng: Rng): number | null {
  if (!pool.length) return null;
  const weights = pool.map((entry) => heroWeight(entry.games));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = rng.float() * total;
  for (let index = 0; index < pool.length; index += 1) {
    roll -= weights[index];
    if (roll < 0) return pool.splice(index, 1)[0].heroId;
  }
  return pool.splice(pool.length - 1, 1)[0].heroId;
}

/**
 * Размер каждого пака рынка: по одной карте на каждый ролевой слот активной пятёрки.
 *
 * Плейтест 2026-08-04 отменил сужение R14.7 до трёх карт: компактная сетка уже удерживает экран,
 * а потеря двух вариантов делала рынок беднее. Связываем число с `ROLE_SEQUENCE`, чтобы UI и
 * генератор не разошлись при изменении состава. Last Dance по-прежнему сужает эту базу через
 * `balancedPackSlots`, не запрещая конкретную роль.
 *
 * Placeholder под калибровку R10; часть BALANCE_CONFIG_VERSION.
 */
export const MARKET_PACK = {
  size: ROLE_SEQUENCE.length,
} as const;

/** Нижняя граница hero-пака. Placeholder под калибровку R10; часть BALANCE_CONFIG_VERSION. */
export const HERO_FLOOR = {
  /** Насколько карта может УРОНИТЬ Team OVR и всё ещё считаться ловушкой, а не мусором.
   *  Абсолютная величина, а не доля: назначение героев уже оптимально по Hungarian, поэтому
   *  дельта карты — это разница с оптимумом, и она не растёт вместе с масштабом Team OVR.
   *  Ориентир — `ANTE_FIELD_STEP` (3 очка на этап): порог держим заметно ниже одного этапа. */
  maxLossOvr: 1,
} as const;

/**
 * Пять hero-карт. Карта бывает двух видов: замена (выпал ЧУЖОЙ герой) и улучшение своего (выпал
 * АКТИВНЫЙ герой, и выпавшее ему качество строго выше текущего). Свой герой качеством не выше в
 * рулетку не попадает вовсе — раньше все свои вычитались из пула, и единственным способом поднять
 * качество был грайнд по шагу за Буткемп, из-за чего игрок покупал одних и тех же героев по кругу
 * (плейтест 2026-08-05, R14.8). Побочный эффект правила — пул честно вычерпывается: герой уходит
 * из него, достигнув потолка качества.
 *
 * Как и player-pack, это рулетка, а не скрытый фильтр «только апгрейды»:
 * входящий герой может быть ловушкой. Но для каждого входящего героя карта показывает его лучший
 * способ войти в текущий активный пул, а не случайную пару.
 *
 * Проблема, которую чинит порог (тот же дефект, что `stockedForms` уже чинил для игроков). Стартовый
 * драфт назначает героев венгерским алгоритмом, то есть активная пятёрка уже ОПТИМАЛЬНА. Поэтому
 * случайный герой из пула почти всегда даёт минус, и на позднем этапе пак вырождался в 4–5
 * карт вида «−2 Team OVR за 12 золота». Это не ловушка (ловушка обязана быть соблазнительной), а
 * шум, который вдобавок съедал дорожающий реролл (R4.2).
 *
 * Порог считается по ПОЛНОЙ дельте, включая редкость: mythic-герой поднимает карту на свой вклад,
 * и отбраковывать его по «голому» score.ts значило бы фильтровать не то число, что видит игрок.
 *
 * Пак никогда не пустеет: если проходных карт меньше размера пака, добираем лучшими из ОТСЕЯННЫХ
 * этим рероллом — рынок обязан что-то предлагать, даже когда состав уже сильнее всего, что есть в
 * пуле. Last Dance сужает пак (trade-off тактики) — но не ниже одной карты.
 *
 * ПОЧЕМУ КАНДИДАТЫ ВЫТЯГИВАЮТСЯ РУЛЕТКОЙ, А НЕ `shuffle` ГОТОВОГО СПИСКА (R12.1, R12.2). Раньше
 * здесь стоял `rng.shuffle(marketHeroCandidatesShortlist)` — перемешивание ДЕТЕРМИНИРОВАННЫХ 20
 * героев, отобранных по career-играм. Отсюда два дефекта, и второй ломал рынок:
 *  1) за забег игрок не мог встретить больше 20 героев из 127 (см. `marketHeroCandidatePool`);
 *  2) когда проходных карт меньше размера пака, пак добирался сортировкой по `ovrDelta` — а
 *     сортировка от `shuffle` не зависит. Перемешивание меняло только ПОРЯДОК ОЦЕНКИ, поэтому при
 *     оценке всех 20 кандидатов реролл возвращал тот же самый набор карт. Замер до фикса: 300 из
 *     300 сравнений «реролл N против N+1» давали идентичный набор, стоило активным героям получить
 *     редкость (её потеря входит в дельту и роняет любую common-карту ниже порога).
 * Теперь рулетка вытягивает `drawFactor × packSize` кандидатов из ВСЕГО пула, поэтому и `kept`, и
 * `rejected` — выборка ЭТОГО реролла: следующий реролл получает другие карты в обеих ветках.
 * Инвариант «разный `rerollN` ⇒ разный набор» закреплён тестом, в том числе для fallback-ветки.
 */
function heroOptions(
  engine: RunEngine,
  rng: Rng,
  packSize: number,
  beforeOvr: number,
  rarityOf: (heroId: number) => Rarity,
  incomingRarityOf: (heroId: number) => Rarity,
  rarityFactor = 1,
): HeroCard[] {
  const active = new Set(engine.heroes);
  // Свой герой участвует в рулетке, ТОЛЬКО если выпавшее ему качество строго выше текущего —
  // иначе он «не может выпасть» вовсе (R14.8). Фильтруем ДО рулетки, а не пропуском внутри цикла:
  // пропуск съедал бы попытку вытягивания и молча сокращал пак (замер: 4 карты вместо 5).
  // Качество детерминировано по (seed, heroId, stage), поэтому фильтр устойчив к рероллу.
  const remaining = engine.marketHeroCandidatePool.filter((entry) => !active.has(entry.heroId)
    || rarityRank(incomingRarityOf(entry.heroId)) > rarityRank(rarityOf(entry.heroId)));
  if (engine.heroes.length !== ROLE_SEQUENCE.length) {
    throw new Error(
      `Нельзя собрать hero market pack: нужно ${ROLE_SEQUENCE.length} активных героев `
      + `(активных ${engine.heroes.length})`,
    );
  }
  // Пул МЕНЬШЕ пака — штатное состояние глубокой Династии, а не сбой: пул вычерпывается по
  // построению (R14.8 — достигший потолка герой уходит из рулетки навсегда). Прежний throw
  // ронял открытие лагеря на глубине 25+ этапов (найдено LG5-базлайном сима). Пак честно
  // сжимается вплоть до пустого: рынок героев закончился — это конец оси, о котором поздняя
  // игра (R12.6) и говорит.
  const effectiveSize = Math.min(packSize, remaining.length);
  if (effectiveSize === 0) return [];
  const kept: HeroCard[] = [];
  const rejected: HeroCard[] = [];
  // Оцениваем лениво и останавливаемся, набрав пак: каждая оценка — пять полных scoreTeam с
  // matching, поэтому весь пул на каждый реролл не перебираем.
  const drawLimit = Math.min(remaining.length, packSize * HERO_POOL.drawFactor);
  for (let draw = 0; draw < drawLimit && kept.length < effectiveSize; draw += 1) {
    const incomingHeroId = drawWeighted(remaining, rng);
    if (incomingHeroId == null) break;
    const incomingRarity = incomingRarityOf(incomingHeroId);
    // Свой герой выпал ⇒ это не замена, а улучшение (R14.8). Ниже или равным качеством он не
    // показывается вовсе: карта «то же самое, что уже есть» — не выбор, а шум, и именно из-за
    // неё игроку приходилось раз за разом покупать одних и тех же героев. Так пул вычерпывается:
    // достигший immortal герой перестаёт проходить это условие навсегда.
    if (active.has(incomingHeroId)) {
      const current = rarityOf(incomingHeroId);
      kept.push({
        upgradeHeroId: incomingHeroId,
        incomingRarity,
        // Ростер не меняется — вся дельта карты это прирост вклада редкости.
        ovrDelta: (rarityOvrContribution(incomingRarity) - rarityOvrContribution(current)) * rarityFactor,
      });
      continue;
    }
    const option = bestHeroOption(engine, incomingHeroId, rarityOf, rarityFactor);
    const rarityShift = (rarityOvrContribution(incomingRarity)
      - rarityOvrContribution(rarityOf(option.outgoingHeroId))) * rarityFactor;
    const card = { option, incomingRarity, ovrDelta: option.preview.teamOvr - beforeOvr + rarityShift };
    (card.ovrDelta >= -HERO_FLOOR.maxLossOvr ? kept : rejected).push(card);
  }
  if (kept.length < effectiveSize) {
    const need = effectiveSize - kept.length;
    // Добор обязан зависеть от реролла (R12.1). Одной широкой выборки для этого НЕ достаточно: когда
    // пул меньше `drawLimit`, рулетка вытягивает его целиком, и детерминированный `sort().slice()`
    // снова вернул бы тот же набор. Поэтому берём верхушку отсеянных с запасом и выбираем из неё
    // рулеткой: качество добора сохраняется (мёртвые карты со дна не всплывают), а набор у
    // следующего реролла другой. `rng` здесь уже продвинут вытягиваниями, то есть свой у реролла.
    const shortlist = [...rejected]
      .sort((a, b) => b.ovrDelta - a.ovrDelta
        || a.option!.incomingHeroId - b.option!.incomingHeroId)
      .slice(0, need * HERO_POOL.fillerSpread);
    kept.push(...rng.shuffle(shortlist).slice(0, need));
  }
  return kept;
}

/** Рынок Буткемпа: две пак-рулетки по 5 карт — игроки и hero re-pick. Ни один пак не
 * фильтруется по gain: в нём бывают и сильные варианты, и ловушки, игрок решает по полному
 * preview. Детерминизм по `seed + campId + rerollN`; экипированные тактики меняют только цену
 * и размер паков (их trade-off), но не то, КАКИЕ карты выпадают. */
export function buildAnteMarketRoulette(
  engine: RunEngine,
  seed: string,
  campStageIndex: number,
  rerollN: number,
  equippedTactics: readonly string[] = [],
  opts: {
    /** Открыты ли случайные повышенные качества (мета-гейт первого забега, R3.1). Пробрасывается
     *  сюда, а не читается заново, чтобы цена и превью карты не могли разойтись с покупкой. */
    rarityDrops?: boolean;
    /** Всего этапов в сезоне — из него считается прогресс для шансов тиров формы (R5.1). */
    stageCount?: number;
    /** Редкость АКТИВНЫХ героев забега. Нужна, чтобы карта не предлагала снести immortal и чтобы
     *  нижняя граница пака считалась по той же дельте, что показывает карточка. */
    heroRarity?: Record<string, Rarity>;
    /** Стартовые Stakes (T6.4/T6.4-2): expensiveMarket может действовать и в сезоне, не только в круге. */
    stakes?: readonly MutatorId[];
  } = {},
): Offer[] {
  const { rarityDrops = false, stageCount = 0, heroRarity = {} } = opts;
  const rarityOf = (heroId: number): Rarity => heroRarity[String(heroId)] ?? "common";
  // Прогресс сезона 0..1 по номеру пройденного этапа; при неизвестной длине остаёмся на старте.
  const seasonProgress = stageCount > 1
    ? Math.min(1, Math.max(0, (campStageIndex - 1) / (stageCount - 1)))
    : 0;
  const tactics = tacticMarketEffects(equippedTactics);
  const rarityFactor = tacticRarityFactor(equippedTactics);
  // База — `MARKET_PACK.size`, то есть по карте на каждый ролевой слот. Last Dance осознанно
  // вычитает из неё свои варианты через тот же сбалансированный отбор.
  const packSize = Math.max(1, MARKET_PACK.size - tactics.packSizePenalty);
  const before = engine.score();
  if (!before) throw new Error("Market pack доступен только после завершения драфта");

  // Пул кандидатов рынка по ролям (весь доступный пул — разное качество).
  const byRole = new Map<Role, Candidate[]>();
  for (const candidate of engine.marketPlayerCandidates) {
    const list = byRole.get(candidate.player.role) ?? [];
    list.push(candidate);
    byRole.set(candidate.player.role, list);
  }
  // Стабильный порядок пула до RNG — иначе pick не воспроизводится по seed. Сортируем по ПОЛНОМУ
  // ключу формы: после R5.1 у одного accountId в пуле несколько снимков, и одного id мало.
  for (const list of byRole.values()) {
    list.sort((a, b) => a.player.accountId - b.player.accountId
      || a.teamId - b.teamId
      || a.eventId.localeCompare(b.eventId));
  }

  // Активные OVR по ролям — вход для нижней границы рынка и для правила «апгрейд формы обязан
  // быть апгрейдом». Считаем один раз: пул фильтруется на каждый слот.
  const activeOvrsByRole = new Map<Role, number[]>();
  const activeOvrByAccount = new Map<number, number>();
  for (const slot of engine.rosterView) {
    if (!slot.candidate) continue;
    activeOvrsByRole.set(slot.role, [...(activeOvrsByRole.get(slot.role) ?? []), slot.candidate.player.ovr]);
    activeOvrByAccount.set(slot.candidate.player.accountId, slot.candidate.player.ovr);
  }

  const takenAccounts = new Set<number>();
  const offers: Offer[] = [];
  engine.rosterView.forEach((slot, packSlotIndex) => {
    if (!slot.candidate) return;
    const roleFull = byRole.get(slot.role) ?? [];
    const stocked = stockedForms(roleFull, {
      seasonProgress,
      activeOvrs: activeOvrsByRole.get(slot.role) ?? [],
    });
    // Своя форма имеет смысл только как строгий апгрейд: у неё меняется лишь Base.
    const usable = (c: Candidate) => {
      if (takenAccounts.has(c.player.accountId)) return false;
      const ownOvr = activeOvrByAccount.get(c.player.accountId);
      return ownOvr == null || c.player.ovr > ownOvr;
    };
    // Порог — предпочтение, а не жёсткое условие: слот за слотом `takenAccounts` выедает пул, и
    // на узкой роли отфильтрованный набор может опустеть. Пустой пул = исключение = сорванный
    // Буткемп, поэтому ослабляем ступенчато, а не падаем.
    const pool = firstNonEmpty(
      stocked.filter(usable),
      roleFull.filter(usable),
      roleFull.filter((c) => !takenAccounts.has(c.player.accountId)),
    );
    const rng = new Rng(`${seed}:camp-${campStageIndex}:roulette-${rerollN}:slot-${packSlotIndex}`);
    const candidate = roulettePick(pool, rng, seasonProgress);
    if (!candidate) {
      throw new Error(
        `Нельзя собрать player market pack: нет нового кандидата для слота ${packSlotIndex} (${slot.role})`,
      );
    }
    takenAccounts.add(candidate.player.accountId);
    const option = bestPlayerOption(engine, candidate);
    const outgoing = engine.rosterView[option.slotIndex].candidate!;
    // Апгрейд формы той же личности идёт по trade-in: за человека уже заплачено (R5.3).
    const isFormUpgrade = outgoing.player.accountId === candidate.player.accountId;
    const base = isFormUpgrade
      ? formUpgradeCost(candidate.player.ovr, outgoing.player.ovr)
      : playerCost(candidate.player.ovr);
    offers.push({
      id: `mkt-${campStageIndex}-${rerollN}-slot-${packSlotIndex}`,
      kind: "player",
      labelKey: "market.player",
      cost: base + tactics.playerCostSurcharge,
      playerSwap: {
        slotIndex: option.slotIndex,
        outgoingAccountId: outgoing.player.accountId,
        incoming: candidateRef(candidate),
      },
      preview: {
        before: values(before),
        after: values(option.preview),
        beforeAssignment: before.assignment.byPlayer,
        afterAssignment: option.preview.assignment.byPlayer,
      },
    });
  });
  if (offers.length !== ROLE_SEQUENCE.length) {
    throw new Error(
      `Нельзя собрать player market pack: нужно ${ROLE_SEQUENCE.length} карт, получено ${offers.length}`,
    );
  }
  // Пак собирается целиком, а урезается в конце: удержанные карты остаются в точности теми же,
  // что и без тактики, — Last Dance забирает варианты, а не подменяет их. Какие именно варианты
  // уходят — решает balancedPackSlots (роль не должна вымирать целиком).
  const keptSlots = new Set(balancedPackSlots(
    engine.rosterView.map((slot) => slot.role),
    packSize,
    new Rng(`${seed}:camp-${campStageIndex}:pack-trim-${rerollN}`),
  ));
  const players = offers.filter((_, packSlotIndex) => keptSlots.has(packSlotIndex));
  offers.length = 0;
  offers.push(...players);

  const heroes = heroOptions(
    engine,
    new Rng(`${seed}:camp-${campStageIndex}:market-${rerollN}:heroes`),
    packSize,
    before.teamOvr,
    rarityOf,
    // Качество входящего героя определяет цену (R4.1) и едет на оффере: раньше hero-карта брала
    // цену generic-рычага Hero Synergy, поэтому common и immortal стоили одинаково. Роллим ЗДЕСЬ,
    // а не после отбора: качество входит в дельту, по которой пак отсеивает мёртвые карты.
    (heroId) => (rarityDrops ? rollHeroRarity(seed, heroId, campStageIndex) : "common"),
    rarityFactor,
  );
  heroes.forEach(({ option: hero, upgradeHeroId, incomingRarity }, heroIndex) => {
    const id = `mkt-${campStageIndex}-${rerollN}-hero-${heroIndex}`;
    // Улучшение своего героя (R14.8) — вторая форма карты того же ролла, а не отдельная секция:
    // выпал свой герой качеством выше ⇒ его предлагают улучшить. Ростер не трогается, поэтому
    // ни swap-payload, ни preview от рынка ей не нужны — вклад считает UI по текущему составу.
    if (upgradeHeroId != null) {
      const cost = upgradePathCost(rarityOf(upgradeHeroId), incomingRarity);
      if (cost == null) return;
      offers.push({
        id,
        kind: "hero",
        labelKey: "market.heroUpgrade",
        cost,
        heroUpgrade: { heroId: upgradeHeroId, targetRarity: incomingRarity },
      });
      return;
    }
    if (!hero) return;
    offers.push({
      id,
      kind: "hero",
      labelKey: "market.heroSynergy",
      cost: heroPrice(incomingRarity),
      heroSwap: {
        outgoingHeroId: hero.outgoingHeroId,
        incomingHeroId: hero.incomingHeroId,
        incomingRarity,
      },
      preview: {
        before: values(before),
        after: values(hero.preview),
        beforeAssignment: before.assignment.byPlayer,
        afterAssignment: hero.preview.assignment.byPlayer,
      },
    });
  });
  // Мутатор круга expensiveMarket (LG3): множитель применяется к ГОТОВОМУ паку одним местом —
  // превью, покупка и сим читают одну цену, Rng и состав пака не тронуты.
  const costFactor = marketCostFactor(seed, campStageIndex, undefined, opts.stakes ?? []);
  if (costFactor === 1) return offers;
  return offers.map((offer) => ({ ...offer, cost: Math.round(offer.cost * costFactor) }));
}

/** Пересчитать breakdown уже показанных карт после другой покупки/ручного swap.
 *  Identity карты — входящий игрок/герой — сохраняется, а лучший освобождаемый слот
 *  пересчитывается под актуальный состав. Ставшая невалидной карта исчезает. */
export function refreshAnteMarketOffers(
  engine: RunEngine,
  offers: Offer[],
  /** Множитель цен мутатора круга (LG3, `marketCostFactor`). Обязателен: цена улучшения героя
   *  пересчитывается здесь от актуального тира, и refresh без множителя молча вернул бы её к
   *  базовой — превью разошлось бы с покупкой ровно в Династии. */
  costFactor: number,
  heroRarity: Record<string, Rarity> = {},
  /** Экипированные карты — для trade-off'ов, влияющих на пересчёт (rarityFactor Wide Pool). */
  equippedTactics: readonly string[] = [],
): Offer[] {
  const rarityOf = (heroId: number): Rarity => heroRarity[String(heroId)] ?? "common";
  const rarityFactor = tacticRarityFactor(equippedTactics);
  const before = engine.score();
  if (!before) return offers.filter((offer) => offer.kind === "stat");
  const refreshed: Offer[] = [];
  for (const offer of offers) {
    if (offer.kind === "stat") {
      refreshed.push(offer);
      continue;
    }
    try {
      if (offer.kind === "player" && offer.playerSwap) {
        const incoming = engine.candidateByRef(offer.playerSwap.incoming);
        if (!incoming) continue;
        const option = bestPlayerOption(engine, incoming);
        const outgoing = engine.rosterView[option.slotIndex].candidate!;
        refreshed.push({
          ...offer,
          playerSwap: {
            slotIndex: option.slotIndex,
            outgoingAccountId: outgoing.player.accountId,
            incoming: offer.playerSwap.incoming,
          },
          preview: {
            before: values(before),
            after: values(option.preview),
            beforeAssignment: before.assignment.byPlayer,
            afterAssignment: option.preview.assignment.byPlayer,
          },
        });
      } else if (offer.kind === "hero" && offer.heroSwap) {
        const option = bestHeroOption(engine, offer.heroSwap.incomingHeroId, rarityOf, rarityFactor);
        refreshed.push({
          ...offer,
          heroSwap: {
            outgoingHeroId: option.outgoingHeroId,
            incomingHeroId: option.incomingHeroId,
            // Identity карты сохраняется: пересчитывается только вытесняемый слот, а качество и
            // цена входящего героя остаются теми, что игрок уже увидел.
            incomingRarity: offer.heroSwap.incomingRarity,
          },
          preview: {
            before: values(before),
            after: values(option.preview),
            beforeAssignment: before.assignment.byPlayer,
            afterAssignment: option.preview.assignment.byPlayer,
          },
        });
      } else if (offer.heroUpgrade) {
        // Улучшение живёт, только пока его герой активен: соседняя покупка могла снести его с
        // ростера, и тогда карта обязана исчезнуть, а не поднимать тир герою на скамейке.
        // Тир мог вырасти и другим путём (грайнд в Preparation) — тогда цель уже достигнута.
        const current = rarityOf(offer.heroUpgrade.heroId);
        if (!engine.heroes.includes(offer.heroUpgrade.heroId)) continue;
        if (rarityRank(current) >= rarityRank(offer.heroUpgrade.targetRarity)) continue;
        const cost = upgradePathCost(current, offer.heroUpgrade.targetRarity);
        if (cost == null) continue;
        // Цена пересчитывается от АКТУАЛЬНОГО тира: иначе после грайнда игрок платил бы за уже
        // пройденные шаги. Множитель мутатора — тот же, что при генерации.
        refreshed.push({ ...offer, cost: Math.round(cost * costFactor) });
      }
    } catch {
      // A prior swap may make a card impossible; hiding it is safer than charging for stale payload.
    }
  }
  return refreshed;
}
