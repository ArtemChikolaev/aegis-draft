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
import { useEffect, useRef, useState } from "react";
import type { CardEdition } from "../../game/editions.ts";
import type { Rarity } from "../../game/rarity.ts";
import { itemDef, itemTier } from "../../game/items.ts";
import { itemArtSlug } from "../../game/itemArt.ts";
import { isTacticId } from "../../game/tactics.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/core.ts";
import { ItemIcon } from "../../ui/index.ts";
import { BuildCardInspector, type BuildCardContribution } from "./BuildCardInspector.tsx";
import "./buildRail.css";

export interface BuildRailCard {
  id: string;
  rarity: Rarity;
  /** Условие карточки выполнено на текущем ростере — она сейчас во что-то играет. */
  active: boolean;
  /** Одноразовое Camp Action в слоте (ещё не разыграно). */
  held?: boolean;
  /** Edition (R13.5); undefined — обычная карта. */
  edition?: CardEdition;
  /** Заряды Charged-карты. */
  charges?: number;
}

/** Сборка списка из состояния экономики + источников силы. Чистая, чтобы оба экрана строили рейл
 *  одинаково и ни один не завёл свою версию «активна ли карточка». */
export function buildRailCards(
  equipped: readonly string[],
  heldActions: readonly string[],
  cardRarity: Record<string, Rarity>,
  activeIds: ReadonlySet<string>,
  cardEditions: Record<string, CardEdition> = {},
  cardCharges: Record<string, number> = {},
): BuildRailCard[] {
  return [
    ...equipped.map((id) => ({
      id,
      rarity: cardRarity[id] ?? ("common" as Rarity),
      active: activeIds.has(id),
      edition: cardEditions[id],
      charges: cardCharges[id] ?? 0,
    })),
    ...heldActions.map((id) => ({ id, rarity: "common" as Rarity, active: false, held: true })),
  ];
}

export function BuildRail({ cards, slots, testId, activeHeroes, cardRarity, contributionsOf }: {
  cards: readonly BuildRailCard[];
  /** Сколько слотов всего — пустые рисуем точками, иначе непонятно, есть ли ещё место. */
  slots: number;
  testId?: string;
  /** Контекст разбора: рейл сам открывает карточку по клику, поэтому знает, чем её объяснить. */
  activeHeroes: readonly number[];
  cardRarity: Record<string, Rarity>;
  contributionsOf?: (cardId: string) => readonly BuildCardContribution[];
}) {
  const { t } = useI18n();
  // Плейтест 2026-08-04: иконку было видно, а прочитать карточку негде — особенно на экране этапа,
  // где панели Build нет вовсе. Состояние держит сам рейл: так оба экрана получают разбор даром.
  const [inspected, setInspected] = useState<BuildRailCard | null>(null);
  // Пульс новой карточки (R15.1): сравниваем id с прошлым рендером ЭТОГО рейла — пульсирует только
  // добавленное при живом экране (покупка/награда), а не весь ряд при каждом монтировании.
  const prevIds = useRef<ReadonlySet<string> | null>(null);
  const fresh = new Set<string>();
  if (prevIds.current) {
    for (const card of cards) if (!prevIds.current.has(card.id)) fresh.add(card.id);
  }
  useEffect(() => {
    prevIds.current = new Set(cards.map((card) => card.id));
  });
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
          <button
            type="button"
            key={card.id}
            className={`build-rail__card build-rail__card--${kind}${fresh.has(card.id) ? " build-rail__card--fresh" : ""}`}
            data-card-id={card.id}
            data-card-tier={item ? itemTier(card.rarity) : undefined}
            data-active={card.active}
            data-edition={card.edition}
            title={`${label}${card.active ? "" : ` · ${t("camp.tacticNoEffect")}`}`}
            aria-label={`${label} · ${t("camp.offerDetails")}`}
            onClick={() => setInspected(card)}
          >
            {slug
              ? <ItemIcon slug={slug} name={label} size="sm" />
              : <b className="build-rail__mono">{label.slice(0, 2)}</b>}
            {/* Заряды Charged-карты (R13.5): пипсы на мини-карте — рост виден без инспектора. */}
            {card.edition === "charged" && (
              <i className="build-rail__charges" aria-hidden="true">{card.charges || "⚡"}</i>
            )}
          </button>
        );
      })}
      {Array.from({ length: empty }, (_, i) => (
        <span key={`empty-${i}`} className="build-rail__card build-rail__card--empty" aria-hidden="true" />
      ))}
      {inspected && (
        <BuildCardInspector
          cardId={inspected.id}
          rarity={inspected.rarity}
          edition={inspected.edition}
          charges={inspected.charges}
          activeHeroes={activeHeroes}
          cardRarity={cardRarity}
          contributions={contributionsOf?.(inspected.id)}
          onClose={() => setInspected(null)}
        />
      )}
    </div>
  );
}
