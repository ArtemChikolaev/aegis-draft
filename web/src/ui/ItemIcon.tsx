import styles from "./ItemIcon.module.css";
import { itemArtSources, useArtSource } from "./artSource.ts";

// Иконки предметов Dota 2. Как и портреты, идут из своего зеркала `public/art/items` с фолбэком
// на Steam CDN (T11.2) — порядок и причина в artSource.ts. Отдельный компонент, а не проп у
// `HeroThumb`: у героя и предмета разные каталоги, разные пропорции (16:9 против 4:3) и разный
// фолбэк — общий примитив пришлось бы ветвить внутри по «а это герой или предмет».

/** Иконка предмета по слагу (`game/itemArt.ts`). Картинка не загрузилась — узел исчезает целиком:
 *  рядом всегда есть название карточки, и «битая картинка» хуже её отсутствия. */
export function ItemIcon({ slug, name, size = "md", pixel = false }: {
  slug: string;
  name: string;
  size?: "sm" | "md";
  /** Пиксельная версия иконки (Аркада в пиксельном режиме): низкое разрешение + image-rendering: pixelated. */
  pixel?: boolean;
}) {
  const { src, onError } = useArtSource(itemArtSources(slug, pixel));
  if (!src) return null;
  return (
    <img
      className={`${styles.icon} ${styles[size]}${pixel ? ` ${styles.pixel}` : ""}`}
      src={src}
      alt={name}
      loading="lazy"
      onError={onError}
    />
  );
}
