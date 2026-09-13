import styles from "./RarityBadge.module.css";

/** Бейдж тира — один примитив на обе шкалы: редкость героя (`--rarity-*`) и качество пассивной
 *  карточки (`--card-tier-*`, R11.5).
 *
 *  У героя базовый тир не рисуем: common — это норма состава, и бейдж на каждой карточке был бы
 *  шумом. У ПРЕДМЕТА наоборот (`showBase`): отсутствие бейджа читалось как «у этой карточки
 *  качества нет вообще» — именно так игрок и понял standard-предмет. Явный «Обычная» снимает
 *  двусмысленность: качество есть у каждой карточки, вопрос только какое.
 *
 *  Локализация снаружи (как у `RoleTag`/`TagChips`): примитив презентационный, а решение «какой
 *  словарь тиров» принадлежит экрану.
 *
 *  Вид — в своём модуле. `rarity-badge` / `rarity-badge--<тир>` остаются глобальными классами-хуками
 *  без стилей: за них держатся e2e и раскладка карточки улучшения (`.camp-rarity-card__hero`). */
export function RarityBadge({ rarity, label, showBase = false }: {
  rarity: string;
  label: string;
  showBase?: boolean;
}) {
  if (!showBase && (rarity === "common" || rarity === "standard")) return null;
  const className = [styles.badge, styles[rarity], "rarity-badge", `rarity-badge--${rarity}`].filter(Boolean).join(" ");
  return <span className={className}>{label}</span>;
}
