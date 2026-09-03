import type { ElementType } from "react";
import { playerOvrTier } from "./ovrTier.ts";

/** Номер OVR игрока, окрашенный по тиру (`.ovr-tier--*`, base.css). Раскладку/шрифт задаёт
 *  экран через className; здесь только цвет тира и опциональная подпись единицы.
 *  Раньше каждая карточка собирала `ovr-tier--${playerOvrTier(ovr)}` сама — 9 копий. */
export function OvrBadge({ ovr, as: Tag = "b", className, unit = false, ...rest }: {
  ovr: number;
  as?: ElementType;
  className?: string;
  /** Подпись «OVR» под/рядом с номером (`<small>`), где карточка её показывает. */
  unit?: boolean;
} & Record<string, unknown>) {
  return (
    <Tag className={[`ovr-tier--${playerOvrTier(ovr)}`, className].filter(Boolean).join(" ")} {...rest}>
      {Math.round(ovr)}
      {unit && <small>OVR</small>}
    </Tag>
  );
}
