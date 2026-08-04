// Постоянный ряд карточек билда (R14.6).
//
// Главное расхождение с Balatro было не в анимациях, а в композиции: там ряд джокеров виден ВСЕГДА
// и он же — предмет разговора во время скоринга. У нас билд жил во вкладке Буткемпа, а на экране
// этапа сжимался в одну строку `Roster · Mult · Total` — то есть ровно там, где игрок смотрит на
// результат своей сборки, самой сборки видно не было.
//
// Рейл презентационный: он не считает свою математику, а получает готовый список. Активность
// карточки берётся из ТОГО ЖЕ источника, что и боевой расчёт (`sources` силы забега), поэтому
// подсветка не может разойтись с тем, что реально сработало.
import type { Rarity } from "../../game/rarity.ts";
import { itemDef, itemTier } from "../../game/items.ts";
import { itemArtSlug } from "../../game/itemArt.ts";
import { isTacticId } from "../../game/tactics.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/core.ts";
import { ItemIcon } from "../../ui/index.ts";
import "./buildRail.css";

export interface BuildRailCard {
  id: string;
  rarity: Rarity;
  /** Условие карточки выполнено на текущем ростере — она сейчас во что-то играет. */
  active: boolean;
  /** Одноразовое Camp Action в слоте (ещё не разыграно). */
  held?: boolean;
}

/** Сборка списка из состояния экономики + источников силы. Чистая, чтобы оба экрана строили рейл
 *  одинаково и ни один не завёл свою версию «активна ли карточка». */
export function buildRailCards(
  equipped: readonly string[],
  heldActions: readonly string[],
  cardRarity: Record<string, Rarity>,
  activeIds: ReadonlySet<string>,
): BuildRailCard[] {
  return [
    ...equipped.map((id) => ({
      id,
      rarity: cardRarity[id] ?? ("common" as Rarity),
      active: activeIds.has(id),
    })),
    ...heldActions.map((id) => ({ id, rarity: "common" as Rarity, active: false, held: true })),
  ];
}

export function BuildRail({ cards, slots, testId }: {
  cards: readonly BuildRailCard[];
  /** Сколько слотов всего — пустые рисуем точками, иначе непонятно, есть ли ещё место. */
  slots: number;
  testId?: string;
}) {
  const { t } = useI18n();
  // Пустой билд не показываем вовсе: ряд из пяти пустых точек — это шум, а не информация.
  if (cards.length === 0) return null;
  const empty = Math.max(0, slots - cards.filter((card) => !card.held).length);
  return (
    <div className="build-rail" data-testid={testId} aria-label={t("camp.tactics")}>
      {cards.map((card) => {
        const item = itemDef(card.id);
        const kind = item ? "item" : isTacticId(card.id) ? "tactic" : "action";
        const label = t(`${kind}.${card.id}` as MessageKey);
        const slug = itemArtSlug(card.id);
        return (
          <span
            key={card.id}
            className={`build-rail__card build-rail__card--${kind}`}
            data-card-id={card.id}
            data-card-tier={item ? itemTier(card.rarity) : undefined}
            data-active={card.active}
            title={`${label}${card.active ? "" : ` · ${t("camp.tacticNoEffect")}`}`}
          >
            {slug
              ? <ItemIcon slug={slug} name={label} size="sm" />
              : <b className="build-rail__mono">{label.slice(0, 2)}</b>}
          </span>
        );
      })}
      {Array.from({ length: empty }, (_, i) => (
        <span key={`empty-${i}`} className="build-rail__card build-rail__card--empty" aria-hidden="true" />
      ))}
    </div>
  );
}
