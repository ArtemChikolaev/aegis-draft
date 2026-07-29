/** Бейдж тира — один примитив на обе шкалы: редкость героя (`--rarity-*`) и качество пассивной
 *  карточки (`--card-tier-*`, R11.5).
 *
 *  У героя базовый тир не рисуем: common — это норма состава, и бейдж на каждой карточке был бы
 *  шумом. У ПРЕДМЕТА наоборот (`showBase`): отсутствие бейджа читалось как «у этой карточки
 *  качества нет вообще» — именно так игрок и понял standard-предмет. Явный «Обычная» снимает
 *  двусмысленность: качество есть у каждой карточки, вопрос только какое.
 *
 *  Локализация снаружи (как у `RoleTag`/`TagChips`): примитив презентационный, а решение «какой
 *  словарь тиров» принадлежит экрану. */
export function RarityBadge({ rarity, label, showBase = false }: {
  rarity: string;
  label: string;
  showBase?: boolean;
}) {
  if (!showBase && (rarity === "common" || rarity === "standard")) return null;
  return <span className={`rarity-badge rarity-badge--${rarity}`}>{label}</span>;
}
