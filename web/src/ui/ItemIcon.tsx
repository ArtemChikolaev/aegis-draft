import { useState } from "react";
import styles from "./ItemIcon.module.css";

// Иконки предметов Dota 2 с того же публичного Steam CDN, что портреты героев в `HeroThumb`.
// Отдельный компонент, а не проп у `HeroThumb`: у героя и предмета разные каталоги, разные
// пропорции (16:9 против 4:3) и разный фолбэк — общий примитив пришлось бы ветвить внутри по
// «а это герой или предмет», то есть склеить две сущности ради одного `<img>`.
const CDN = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items";

/** Иконка предмета по слагу (`game/itemArt.ts`). Картинка не загрузилась — узел исчезает целиком:
 *  рядом всегда есть название карточки, и «битая картинка» хуже её отсутствия. */
export function ItemIcon({ slug, name, size = "md" }: {
  slug: string;
  name: string;
  size?: "sm" | "md";
}) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return (
    <img
      className={`${styles.icon} ${styles[size]}`}
      src={`${CDN}/${slug}.png`}
      alt={name}
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}
