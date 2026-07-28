// Теги героев (R8.1) — курируемый вручную словарь свойств, на который будут опираться условия
// предметов/пассивок (R8.3) и hero-tag синергии.
//
// ПОЧЕМУ ВРУЧНУЮ, А НЕ ИЗ ДАННЫХ. Соблазн вывести теги из патча или из матчей велик, но он ломает
// главное свойство забега: воспроизводимость. Обновление датасета меняло бы смысл уже выданных
// карточек, и старый seed перестал бы описывать ту же игру — понятная сборка «пять dark-героев»
// внезапно рассыпалась бы. Поэтому теги — ЗАМОРОЖЕННЫЙ снимок, живущий рядом с кодом и
// версионируемый вместе с `BALANCE_CONFIG_VERSION` (отдельный `heroTagsVersion` намеренно не
// заводим: вторая версия рядом — вторая точка рассинхрона).
//
// Следствие, которое надо принять сознательно: объективный слой (атрибут, дальность) — снимок, а
// не зеркало живой Dota. Valve меняла атрибуты героев не раз (в частности реворк Universal), и наш
// файл может расходиться с текущим патчем. Для игровой логики это нормально: нам нужна стабильная
// однозначная классификация, а не синхронность с ежемесячными правками.
//
// `heroes.json` и `schema/` этим файлом НЕ затрагиваются: теги — игровой конфиг, а не данные ETL.
import raw from "../data/heroTags.v1.json";

/** Основной атрибут. `universal` — соответствующий класс Dota. */
export const HERO_ATTRS = ["str", "agi", "int", "universal"] as const;
export type HeroAttr = (typeof HERO_ATTRS)[number];

export const HERO_RANGES = ["melee", "ranged"] as const;
export type HeroRange = (typeof HERO_RANGES)[number];

/**
 * Lore-теги: «кто это по миру Dota». Критерий — принадлежность существа/фракции по официальному
 * описанию героя, а не по визуалу способностей.
 *
 * - `dark` — служит силам тьмы/скверны, питается страхом или разложением;
 * - `light` — служит силам света/порядка, целитель или защитник по лору;
 * - `demon` — демон или житель Ада (Foulfell и родственные планы);
 * - `undead` — мёртвый, но действующий: скелет, лич, призрак, зомби;
 * - `spirit` — воплощение стихии или духа без телесного происхождения;
 * - `dragon` — дракон либо носитель драконьей крови/формы;
 * - `celestial` — древнее космическое существо, титан, божество;
 * - `void` — связан с Тьмой Вне Мира, временем или разрывами реальности;
 * - `nature` — друид, страж леса, растение;
 * - `beast` — зверь или зверолюд, действующий по животной природе;
 * - `mechanical` — конструкт, механизм или носитель машинного тела.
 */
export const LORE_TAGS = [
  "dark", "light", "demon", "undead", "spirit", "dragon",
  "celestial", "void", "nature", "beast", "mechanical",
] as const;
export type LoreTag = (typeof LORE_TAGS)[number];

/**
 * Gameplay-теги: «что герой делает в игре». Критерий — наличие способности, ради которой героя
 * берут именно для этой роли. Тег ставится, только если ответ «да» на вопрос из критерия.
 *
 * - `summon` — создаёт независимые управляемые/атакующие юниты;
 * - `illusion` — создаёт иллюзии себя;
 * - `control` — имеет надёжный дизейбл (стан/оглушение/подвешивание) как основной инструмент;
 * - `global` — влияет на карту вне зоны своего присутствия;
 * - `save` — способен вытащить союзника из смертельной ситуации (неуязвимость, дисперсия, рывок);
 * - `heal` — восстанавливает здоровье союзникам;
 * - `push` — ускоряет снос строений сверх обычной атаки;
 * - `burst` — убивает цель коротким окном магического/физического урона;
 * - `mobility` — имеет блинк/рывок/высокую скорость как часть кита;
 * - `stealth` — уходит в невидимость или скрывает союзников;
 * - `scaling` — заметно сильнее в late-game, чем в early (кэрри-профиль);
 * - `teamfight` — имеет AoE-ультимейт, разворачивающий командный бой;
 * - `pickoff` — специализируется на убийстве одиночной цели вне боя.
 */
export const GAMEPLAY_TAGS = [
  "summon", "illusion", "control", "global", "save", "heal", "push",
  "burst", "mobility", "stealth", "scaling", "teamfight", "pickoff",
] as const;
export type GameplayTag = (typeof GAMEPLAY_TAGS)[number];

export type HeroTag = LoreTag | GameplayTag;

export interface HeroTags {
  attr: HeroAttr;
  range: HeroRange;
  lore: readonly LoreTag[];
  play: readonly GameplayTag[];
  /** Помечен для ревью человеком: классификация спорна либо герой новый и слабо знаком.
   *  Существование флага — требование R8.1: спорные назначения не должны выглядеть как факт. */
  review?: boolean;
}

interface RawFile {
  version: number;
  heroes: Record<string, {
    attr: string;
    range: string;
    lore: string[];
    play: string[];
    review?: boolean;
  }>;
}

const file = raw as RawFile;

/** Версия файла тегов. Входит в игровой контракт через `BALANCE_CONFIG_VERSION`. */
export const HERO_TAGS_VERSION = file.version;

const TAGS_BY_HERO: Map<number, HeroTags> = new Map(
  Object.entries(file.heroes).map(([id, entry]) => [Number(id), {
    attr: entry.attr as HeroAttr,
    range: entry.range as HeroRange,
    lore: entry.lore as LoreTag[],
    play: entry.play as GameplayTag[],
    review: entry.review,
  }]),
);

/** Теги героя; `null` — героя нет в курируемом файле (например добавлен новым патчем). */
export function heroTags(heroId: number): HeroTags | null {
  return TAGS_BY_HERO.get(heroId) ?? null;
}

/** Все id, для которых теги курированы. */
export function taggedHeroIds(): number[] {
  return [...TAGS_BY_HERO.keys()].sort((a, b) => a - b);
}

/** Есть ли у героя этот тег (lore или gameplay). */
export function hasTag(heroId: number, tag: HeroTag): boolean {
  const tags = TAGS_BY_HERO.get(heroId);
  if (!tags) return false;
  return (tags.lore as readonly string[]).includes(tag)
    || (tags.play as readonly string[]).includes(tag);
}

/** Сколько героев набора несут этот тег. Основа условий предметов вида «за каждого dark-героя». */
export function countTag(heroIds: readonly number[], tag: HeroTag): number {
  return heroIds.filter((heroId) => hasTag(heroId, tag)).length;
}

/** Сколько РАЗНЫХ gameplay-тегов покрыто набором. Основа условий вида «пять разных ролей». */
export function distinctGameplayTags(heroIds: readonly number[]): number {
  const seen = new Set<GameplayTag>();
  for (const heroId of heroIds) {
    for (const tag of TAGS_BY_HERO.get(heroId)?.play ?? []) seen.add(tag);
  }
  return seen.size;
}

/** Сколько героев набора имеют этот атрибут. */
export function countAttr(heroIds: readonly number[], attr: HeroAttr): number {
  return heroIds.filter((heroId) => TAGS_BY_HERO.get(heroId)?.attr === attr).length;
}

export interface TagValidationIssue {
  heroId: number;
  problem: string;
}

/** Проверка курируемого файла. Зовётся тестом (он же и есть валидатор из DoD R8.1):
 *  словарь закрыт, объективный слой заполнен, у каждого героя есть хотя бы один gameplay-тег —
 *  иначе условия предметов молча обходили бы часть ростера. */
export function validateHeroTags(knownHeroIds: readonly number[]): TagValidationIssue[] {
  const issues: TagValidationIssue[] = [];
  const known = new Set(knownHeroIds);

  for (const heroId of knownHeroIds) {
    const tags = TAGS_BY_HERO.get(heroId);
    if (!tags) {
      issues.push({ heroId, problem: "нет записи в heroTags.v1.json" });
      continue;
    }
    if (!(HERO_ATTRS as readonly string[]).includes(tags.attr)) {
      issues.push({ heroId, problem: `неизвестный атрибут "${tags.attr}"` });
    }
    if (!(HERO_RANGES as readonly string[]).includes(tags.range)) {
      issues.push({ heroId, problem: `неизвестная дальность "${tags.range}"` });
    }
    for (const tag of tags.lore) {
      if (!(LORE_TAGS as readonly string[]).includes(tag)) {
        issues.push({ heroId, problem: `неизвестный lore-тег "${tag}"` });
      }
    }
    for (const tag of tags.play) {
      if (!(GAMEPLAY_TAGS as readonly string[]).includes(tag)) {
        issues.push({ heroId, problem: `неизвестный gameplay-тег "${tag}"` });
      }
    }
    if (new Set(tags.lore).size !== tags.lore.length) {
      issues.push({ heroId, problem: "дубликат в lore-тегах" });
    }
    if (new Set(tags.play).size !== tags.play.length) {
      issues.push({ heroId, problem: "дубликат в gameplay-тегах" });
    }
    if (tags.play.length === 0) {
      issues.push({ heroId, problem: "ни одного gameplay-тега" });
    }
  }

  for (const heroId of TAGS_BY_HERO.keys()) {
    if (!known.has(heroId)) {
      issues.push({ heroId, problem: "герой есть в тегах, но отсутствует в heroes.json" });
    }
  }

  return issues;
}

/** Герои, чья классификация помечена как спорная. Отдельный список нужен, чтобы «на ревью» не
 *  растворялось в файле и было видно в отчёте. */
export function heroesNeedingReview(): number[] {
  return taggedHeroIds().filter((heroId) => TAGS_BY_HERO.get(heroId)?.review);
}
