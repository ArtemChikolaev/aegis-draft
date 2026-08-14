import styles from "./HeroThumb.module.css";
import { heroArtSources, useArtSource } from "./artSource.ts";

// Портреты героев Dota 2 по slug (`picture` из heroes.json). Источник — своё зеркало
// `public/art/heroes` (T11.2), Steam CDN остаётся запасным: подробности и порядок — в artSource.ts.

/** Аватар героя: портрет по slug + имя. Если картинка не загрузилась — остаётся имя. */
export function HeroThumb({ picture, name, size = "sm", showName = true, layout = "pill" }: {
  picture: string;
  name: string;
  size?: "sm" | "md" | "lg";
  showName?: boolean;
  /** pill — горизонтальная капсула; card — портрет сверху, имя снизу (пак героев). */
  layout?: "pill" | "card";
}) {
  const { src, onError } = useArtSource(heroArtSources(picture));
  const layoutClass = layout === "card" ? styles.card : styles[size];
  return (
    <span className={`${styles.thumb} ${layoutClass}`}>
      {src && <img src={src} alt={name} loading="lazy" onError={onError} />}
      {showName && <span className={styles.name}>{name}</span>}
    </span>
  );
}
