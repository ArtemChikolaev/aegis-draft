import styles from "./TeamLogo.module.css";
import { teamArtSources, useArtSource } from "./artSource.ts";

// Логотип команды: своё зеркало `public/art/teams/<teamId>.webp` (T11.2), затем `logoUrl` с CDN
// Steam — схема данных ради зеркала не менялась, поэтому ссылка из датасета остаётся запасной.
//
// Почему только команда, без аватаров игроков: `avatarfull` у OpenDota — это аватар ПРОФИЛЯ Steam,
// то есть что игрок поставил себе на аккаунт. Проверка на десяти про (2026-08-04) дала настоящее
// фото ровно у одного: у остальных кот-мем, такса, силуэт волка, фрактал, персонажи аниме и
// обложка альбома. Как опознание игрока это не работает и вдобавок спорит с портретом героя,
// который смысл несёт. Поэтому аватары убраны целиком, а логотип остался: у команды знак и есть
// её опознание.
//
// Покрытие логотипов ~95%, но не 100%, поэтому фолбэк ПЕРВИЧЕН, а не аварийный: отсутствие знака —
// норма, и место под него обязано выглядеть законченным без картинки.
/** Монограмма команды для фолбэка: первые буквы слов, максимум две — «Team Falcons» → «TF».
 *  Живёт рядом с примитивом, а не в features: знак нужен и Буткемпу, и драфту, а тащить хелпер
 *  из одной фичи в другую значило бы связать их между собой. */
export function teamMonogram(teamName: string): string {
  const words = teamName.split(/[\s_-]+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2);
  return words[0][0] + words[1][0];
}

export function TeamLogo({ src, teamId, name, size = "sm", fallback }: {
  /** Ссылка с CDN (`logoUrl` из датасета). Запасной источник после зеркала. */
  src?: string;
  /** Команда в датасете — по нему собирается путь к зеркалу. Нет id и нет ссылки — сразу фолбэк. */
  teamId?: number;
  name: string;
  size?: "sm" | "md" | "lg";
  /** Что показать вместо картинки. Обычно монограмма — она уникальна и читается на 16px. */
  fallback?: React.ReactNode;
}) {
  const { src: current, onError } = useArtSource(teamArtSources(teamId, src));
  const cls = `${styles.logo} ${styles[size]}`;
  if (!current) {
    return fallback ? <span className={`${cls} ${styles.fallback}`} aria-hidden="true">{fallback}</span> : null;
  }
  return (
    <img
      className={cls}
      src={current}
      alt={name}
      loading="lazy"
      // `decoding=async` и фиксированный размер в CSS: картинка не должна двигать раскладку,
      // когда доедет, — иначе получаем ту же гонку позиции, что уронила CI на анимации секций.
      decoding="async"
      onError={onError}
    />
  );
}
