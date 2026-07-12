import { useState } from "react";
import styles from "./HeroThumb.module.css";

// Портреты героев Dota 2 с публичного Steam CDN по slug (picture из heroes.json).
const CDN = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes";

/** Аватар героя: портрет по slug + имя. Если картинка не загрузилась — остаётся имя. */
export function HeroThumb({ picture, name, size = "sm", showName = true }: {
  picture: string;
  name: string;
  size?: "sm" | "md";
  showName?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const hasImage = picture !== "" && !broken;
  return (
    <span className={`${styles.thumb} ${styles[size]}`}>
      {hasImage && (
        <img src={`${CDN}/${picture}.png`} alt={name} loading="lazy" onError={() => setBroken(true)} />
      )}
      {showName && <span className={styles.name}>{name}</span>}
    </span>
  );
}
