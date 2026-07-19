import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/core.ts";
import {
  MAX_RUN_LINK_INPUT_LENGTH,
  type RunLinkInputValidation,
} from "../../state/runLink.ts";
import { TextField } from "../../ui/index.ts";
import styles from "./SeedField.module.css";

const ISSUE_MESSAGES: Record<NonNullable<RunLinkInputValidation["issue"]>, MessageKey> = {
  invalid: "seed.invalid",
  schema: "seed.schemaMismatch",
  model: "seed.modelMismatch",
  mode: "seed.modeMismatch",
  config: "seed.configMismatch",
};

export function SeedField({
  value,
  validation,
  expectedSettings,
  onChange,
}: {
  value: string;
  validation: RunLinkInputValidation;
  expectedSettings?: string;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const hasValue = value.trim().length > 0;
  const valid = hasValue && validation.link !== null && validation.issue === null;
  const tone = validation.issue ? "error" : valid ? "success" : "default";
  const statusId = "run-seed-status";

  return (
    <section className={styles.card} data-testid="seed-card">
      <label className={styles.label} htmlFor="run-seed-input">{t("common.seed")}</label>
      <p className={styles.description}>{t("seed.description")}</p>
      <TextField
        id="run-seed-input"
        data-testid="seed-input"
        type="text"
        variant="invert"
        tone={tone}
        value={value}
        maxLength={MAX_RUN_LINK_INPUT_LENGTH}
        placeholder={t("seed.placeholder")}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-invalid={validation.issue ? true : undefined}
        aria-describedby={hasValue ? statusId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {hasValue && (
        <div
          id={statusId}
          className={`${styles.status} ${valid ? styles.success : styles.error}`}
          data-testid="seed-status"
          role={validation.issue ? "alert" : "status"}
          aria-live="polite"
        >
          <span aria-hidden="true">{valid ? "✓" : "!"}</span>
          <p>{valid ? t("seed.valid") : t(ISSUE_MESSAGES[validation.issue ?? "invalid"])}</p>
          {validation.issue === "config" && expectedSettings && <small>{expectedSettings}</small>}
        </div>
      )}
    </section>
  );
}
