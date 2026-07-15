import { useState } from "react";
import styles from "./HeroThumb.module.css";

// Портреты героев Dota 2 с публичного Steam CDN по slug (picture из heroes.json).
const CDN = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes";

/** Аватар героя: портрет по slug + имя. Если картинка не загрузилась — остаётся имя. */
export function HeroThumb({ picture, name, size = "sm", showName = true, layout = "pill" }: {
  picture: string;
  name: string;
  size?: "sm" | "md" | "lg";
  showName?: boolean;
  /** pill — горизонтальная капсула; card — портрет сверху, имя снизу (пак героев). */
  layout?: "pill" | "card";
}) {
  const [broken, setBroken] = useState(false);
  const hasImage = picture !== "" && !broken;
  const layoutClass = layout === "card" ? styles.card : styles[size];
  return (
    <span className={`${styles.thumb} ${layoutClass}`}>
      {hasImage && (
        <img src={`${CDN}/${picture}.png`} alt={name} loading="lazy" onError={() => setBroken(true)} />
      )}
      {showName && <span className={styles.name}>{name}</span>}
    </span>
  );
}
