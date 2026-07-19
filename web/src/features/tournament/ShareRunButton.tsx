import { useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { useRun } from "../../state/runStore.ts";
import { runLinkUrl } from "../../state/runLink.ts";
import { Button } from "../../ui/index.ts";

/** «Скопировать ссылку» на итоге забега (T3.9 → T3.12). Ссылка кодирует условия забега:
 *  config + seed + версии данных. Получатель играет ТЕ ЖЕ паки и собирает свой состав. */
export function ShareRunButton() {
  const { t } = useI18n();
  const config = useRun((s) => s.config);
  const seed = useRun((s) => s.seed);
  const mode = useRun((s) => s.selectedMode);
  const manifest = useRun((s) => s.data?.manifest);
  const [copied, setCopied] = useState(false);

  if (!config || !seed || !manifest) return null;

  const url = runLinkUrl(
    { v: 1, s: manifest.schemaVersion, r: manifest.ratingModelVersion, mode: mode ?? "classic", config, seed },
    window.location.origin,
    window.location.pathname,
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API нет или запрещён (не-https, отказ в правах) — не роняем экран.
      // Ссылка всё равно доступна: она уже в адресной строке после нажатия.
      window.history.replaceState(null, "", url);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button variant="secondary" data-testid="share-run" onClick={copy}>
      {copied ? t("link.copied") : t("link.copy")}
    </Button>
  );
}
