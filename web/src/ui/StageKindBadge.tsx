import { useI18n } from "../i18n/I18nProvider.tsx";
import type { MessageKey } from "../i18n/core.ts";
import type { StageKind } from "../game/anteRun.ts";
import styles from "./StageKindBadge.module.css";

/** Подпись есть не у каждого типа этапа: у `regular` метка «обычный» была бы шумом, а у `boss`
 *  своя панель с именем и правилом. Решение «показывать ли» живёт здесь, а не в каждом экране. */
function messageKey(kind: StageKind | undefined): MessageKey | null {
  if (kind === "elite") return "ante.kindElite";
  if (kind === "playoffCheck") return "ante.kindPlayoffCheck";
  return null;
}

/** Тип этапа сезона (R6.1): Elite играется усиленным полем, Playoff Check — поднятым порогом.
 *  Elite маркируем цветом опасности: его сложность целиком в силе поля, и ничего другого, что о
 *  ней предупредит, на экране нет. */
export function StageKindBadge({ kind }: { kind: StageKind | undefined }) {
  const { t } = useI18n();
  const key = messageKey(kind);
  if (!key) return null;
  return (
    <span className={styles.badge} data-testid="stage-kind" data-stage-kind={kind}>
      {t(key)}
    </span>
  );
}
