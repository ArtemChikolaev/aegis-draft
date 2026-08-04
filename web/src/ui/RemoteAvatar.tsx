import { useState } from "react";
import styles from "./RemoteAvatar.module.css";

// Картинка-опознание с CDN: логотип команды и аватар игрока.
//
// Ключевое ограничение, из-за которого фолбэк здесь ПЕРВИЧЕН, а не аварийный: покрытие заведомо
// неполное. Логотипы закрывают ~95% команд, аватары — ~35% игроков (источник перечисляет
// действующих про, а составы у нас исторические). То есть отсутствие картинки — норма, а не сбой,
// и место под неё обязано выглядеть законченным без неё.
export function RemoteAvatar({ src, name, shape = "square", size = "sm", fallback }: {
  /** Ссылка с CDN. Пусто/undefined — сразу фолбэк, запроса не будет. */
  src?: string;
  name: string;
  /** `round` — игрок (аватар), `square` — команда (логотип). */
  shape?: "round" | "square";
  size?: "sm" | "md" | "lg";
  /** Что показать вместо картинки. Обычно монограмма — она уникальна и читается на 16px. */
  fallback?: React.ReactNode;
}) {
  const [broken, setBroken] = useState(false);
  const cls = `${styles.avatar} ${styles[shape]} ${styles[size]}`;
  if (!src || broken) {
    return fallback ? <span className={`${cls} ${styles.fallback}`} aria-hidden="true">{fallback}</span> : null;
  }
  return (
    <img
      className={cls}
      src={src}
      alt={name}
      loading="lazy"
      // `decoding=async` и фиксированный размер в CSS: картинка не должна двигать раскладку,
      // когда доедет, — иначе получаем ту же гонку позиции, что уронила CI на анимации секций.
      decoding="async"
      onError={() => setBroken(true)}
    />
  );
}
