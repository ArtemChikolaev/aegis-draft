// Контекстный рынок Roguelite Run (срез 3). Экономика по-прежнему отвечает за золото
// и детерминированные слоты, RunEngine — за реальный ростер и scoreTeam; этот тонкий слой
// связывает их, превращая три рычага Base/Hero Synergy/Chemistry в конкретные swaps.
import type { Role } from "../types/data.ts";
import type { ScoreBreakdown } from "./score.ts";
import { Rng } from "./rng.ts";
import { candidateRef, ROLE_SEQUENCE, type Candidate } from "./packs.ts";
import { RunEngine } from "./engine.ts";
import { formUpgradeCost, playerCost, type Offer, type SummandValues } from "./anteEconomy.ts";
import { heroPrice, rollRarity } from "./heroRarity.ts";
import { tacticMarketEffects } from "./tactics.ts";

interface HeroOption {
  outgoingHeroId: number;
  incomingHeroId: number;
  preview: ScoreBreakdown;
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
 * кого убрать из активного пула, чтобы не показывать случайно испорченную замену. */
function bestHeroOption(engine: RunEngine, incomingHeroId: number): HeroOption {
  if (engine.heroes.length !== ROLE_SEQUENCE.length) {
    throw new Error(
      `Нельзя подобрать hero replacement: нужно ${ROLE_SEQUENCE.length} активных героев, `
      + `получено ${engine.heroes.length}`,
    );
  }
  return engine.heroes
    .map((outgoingHeroId) => ({
      outgoingHeroId,
      incomingHeroId,
      preview: engine.previewHeroReplacement(outgoingHeroId, incomingHeroId),
    }))
    .reduce((best, option) => {
      if (option.preview.teamOvr !== best.preview.teamOvr) {
        return option.preview.teamOvr > best.preview.teamOvr ? option : best;
      }
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

/** Пять разных hero re-pick. Как и player-pack, это рулетка, а не скрытый фильтр
 * «только апгрейды»: входящий герой может быть ловушкой. Но для каждого входящего героя
 * карта показывает его лучший способ войти в текущий активный пул, а не случайную пару.
 * Last Dance сужает пак (trade-off тактики) — но не ниже одной карты. */
function heroOptions(engine: RunEngine, rng: Rng, packSize: number): HeroOption[] {
  const incomingHeroes = rng.shuffle(engine.marketHeroCandidatesShortlist);
  if (engine.heroes.length !== ROLE_SEQUENCE.length || incomingHeroes.length < ROLE_SEQUENCE.length) {
    throw new Error(
      `Нельзя собрать hero market pack: нужно ${ROLE_SEQUENCE.length} активных и новых героев `
      + `(активных ${engine.heroes.length}, доступно ${incomingHeroes.length})`,
    );
  }
  return incomingHeroes
    .slice(0, packSize)
    .map((incomingHeroId) => bestHeroOption(engine, incomingHeroId));
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
  } = {},
): Offer[] {
  const { rarityDrops = false, stageCount = 0 } = opts;
  // Прогресс сезона 0..1 по номеру пройденного этапа; при неизвестной длине остаёмся на старте.
  const seasonProgress = stageCount > 1
    ? Math.min(1, Math.max(0, (campStageIndex - 1) / (stageCount - 1)))
    : 0;
  const tactics = tacticMarketEffects(equippedTactics);
  const packSize = Math.max(1, ROLE_SEQUENCE.length - tactics.packSizePenalty);
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
  );
  heroes.forEach((hero, heroIndex) => {
    // Качество входящего героя определяет цену (R4.1) и едет на оффере: раньше hero-карта брала
    // цену generic-рычага Hero Synergy, поэтому common и immortal стоили одинаково.
    const incomingRarity = rarityDrops
      ? rollRarity(seed, hero.incomingHeroId, campStageIndex)
      : "common";
    offers.push({
      id: `mkt-${campStageIndex}-${rerollN}-hero-${heroIndex}`,
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
  return offers;
}

/** Пересчитать breakdown уже показанных карт после другой покупки/ручного swap.
 *  Identity карты — входящий игрок/герой — сохраняется, а лучший освобождаемый слот
 *  пересчитывается под актуальный состав. Ставшая невалидной карта исчезает. */
export function refreshAnteMarketOffers(engine: RunEngine, offers: Offer[]): Offer[] {
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
        const option = bestHeroOption(engine, offer.heroSwap.incomingHeroId);
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
      }
    } catch {
      // A prior swap may make a card impossible; hiding it is safer than charging for stale payload.
    }
  }
  return refreshed;
}
