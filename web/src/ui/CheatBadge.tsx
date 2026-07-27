import { useI18n } from "../i18n/I18nProvider.tsx";
import styles from "./CheatBadge.module.css";

/** Постоянная маркировка забега с Cheat Mode (R2.3). Висит и на этапе, и в Буткемпе: скриншот
 *  результата не должен выглядеть как обычное прохождение. */
export function CheatBadge() {
  const { t } = useI18n();
  return <em className={styles.badge} data-testid="cheat-badge">{t("cheat.badge")}</em>;
}
