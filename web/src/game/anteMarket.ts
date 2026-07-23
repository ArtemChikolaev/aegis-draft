// Контекстный рынок Roguelite Run (срез 3). Экономика по-прежнему отвечает за золото
// и детерминированные слоты, RunEngine — за реальный ростер и scoreTeam; этот тонкий слой
// связывает их, превращая три рычага Base/Hero Synergy/Chemistry в конкретные swaps.
import type { Role } from "../types/data.ts";
import type { ScoreBreakdown } from "./score.ts";
import { Rng } from "./rng.ts";
import { candidateRef, ROLE_SEQUENCE, type Candidate } from "./packs.ts";
import { RunEngine } from "./engine.ts";
import { marketOffers, playerCost, type Offer, type SummandValues } from "./anteEconomy.ts";

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

/** Случайный кандидат роли из всего доступного пула — БЕЗ фильтра «только апгрейд»: пак
 *  показывает разное качество, включая слабых-ловушек (Balatro-рулетка, решение 2026-07-23). */
function roulettePick(pool: Candidate[], rng: Rng): Candidate | null {
  return pool.length ? rng.pick(pool) : null;
}

/** Лучший same-role слот для конкретного входящего игрока. Обычно он один, но у двух
 * support-слотов выбор должен зависеть от полного scoreTeam, а не от позиции карты в паке. */
function bestPlayerOption(engine: RunEngine, candidate: Candidate): PlayerOption {
  const options = engine.rosterView.flatMap((slot, slotIndex) => (
    slot.candidate && slot.role === candidate.player.role
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

/** Пять разных hero re-pick. Как и player-pack, это рулетка, а не скрытый фильтр
 * «только апгрейды»: входящий герой может быть ловушкой. Но для каждого входящего героя
 * карта показывает его лучший способ войти в текущий активный пул, а не случайную пару. */
function heroOptions(engine: RunEngine, rng: Rng): HeroOption[] {
  const incomingHeroes = rng.shuffle(engine.marketHeroCandidatesShortlist);
  if (engine.heroes.length !== ROLE_SEQUENCE.length || incomingHeroes.length < ROLE_SEQUENCE.length) {
    throw new Error(
      `Нельзя собрать hero market pack: нужно ${ROLE_SEQUENCE.length} активных и новых героев `
      + `(активных ${engine.heroes.length}, доступно ${incomingHeroes.length})`,
    );
  }
  return incomingHeroes
    .slice(0, ROLE_SEQUENCE.length)
    .map((incomingHeroId) => bestHeroOption(engine, incomingHeroId));
}

/** Рынок Буткемпа: две пак-рулетки по 5 карт — игроки и hero re-pick. Ни один пак не
 * фильтруется по gain: в нём бывают и сильные варианты, и ловушки, игрок решает по полному
 * preview. Детерминизм по `seed + campId + rerollN`. */
export function buildAnteMarketRoulette(
  engine: RunEngine,
  seed: string,
  campStageIndex: number,
  rerollN: number,
): Offer[] {
  const before = engine.score();
  if (!before) throw new Error("Market pack доступен только после завершения драфта");

  // Пул кандидатов рынка по ролям (весь доступный пул — разное качество).
  const byRole = new Map<Role, Candidate[]>();
  for (const candidate of engine.marketPlayerCandidates) {
    const list = byRole.get(candidate.player.role) ?? [];
    list.push(candidate);
    byRole.set(candidate.player.role, list);
  }
  // Стабильный порядок пула до RNG — иначе pick не воспроизводится по seed.
  for (const list of byRole.values()) list.sort((a, b) => a.player.accountId - b.player.accountId);

  const takenAccounts = new Set<number>();
  const offers: Offer[] = [];
  engine.rosterView.forEach((slot, packSlotIndex) => {
    if (!slot.candidate) return;
    const pool = (byRole.get(slot.role) ?? []).filter((c) => !takenAccounts.has(c.player.accountId));
    const rng = new Rng(`${seed}:camp-${campStageIndex}:roulette-${rerollN}:slot-${packSlotIndex}`);
    const candidate = roulettePick(pool, rng);
    if (!candidate) {
      throw new Error(
        `Нельзя собрать player market pack: нет нового кандидата для слота ${packSlotIndex} (${slot.role})`,
      );
    }
    takenAccounts.add(candidate.player.accountId);
    const option = bestPlayerOption(engine, candidate);
    const outgoing = engine.rosterView[option.slotIndex].candidate!;
    offers.push({
      id: `mkt-${campStageIndex}-${rerollN}-slot-${packSlotIndex}`,
      kind: "player",
      labelKey: "market.player",
      cost: playerCost(candidate.player.ovr),
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

  const heroCost = marketOffers(seed, campStageIndex, rerollN)
    .find((offer) => offer.effect?.summand === "heroSynergy")!.cost;
  const heroes = heroOptions(
    engine,
    new Rng(`${seed}:camp-${campStageIndex}:market-${rerollN}:heroes`),
  );
  heroes.forEach((hero, heroIndex) => {
    offers.push({
      id: `mkt-${campStageIndex}-${rerollN}-hero-${heroIndex}`,
      kind: "hero",
      labelKey: "market.heroSynergy",
      cost: heroCost,
      heroSwap: {
        outgoingHeroId: hero.outgoingHeroId,
        incomingHeroId: hero.incomingHeroId,
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
