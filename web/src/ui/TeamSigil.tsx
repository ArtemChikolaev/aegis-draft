import styles from "./TeamSigil.module.css";

/** Знак команды: монограмма («DW») в плашке цвета опознания.
 *
 *  Зачем: имена ботов собираются из общих префиксов и существительных и намеренно похожи
 *  («Ranked Techies» / «Ranked Goblins»); на live-симуляции 18 однотипных строк глазом не
 *  разобрать. Монограмма уникальна в пределах поля (game/tournament.ts это гарантирует),
 *  цвет — второй, быстрый признак.
 *
 *  Цвет здесь — ОПОЗНАНИЕ, а не оценка: палитра --sigil-N лежит вне tier-шкалы силы.
 *  Презентационный примитив: props — строка и индекс, тип из game/ намеренно не импортируется.
 */
export function TeamSigil({ monogram, color, className }: {
  monogram: string;
  /** Индекс палитры (0..4) или "user" — своя команда идёт акцентом темы. */
  color: number | "user";
  className?: string;
}) {
  const tone = color === "user" ? styles.user : styles[`c${color}` as keyof typeof styles];
  return (
    <span className={[styles.sigil, tone, className].filter(Boolean).join(" ")} aria-hidden="true">
      {monogram}
    </span>
  );
}
