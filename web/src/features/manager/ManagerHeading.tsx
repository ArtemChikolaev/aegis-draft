// Файл на компонент (T12.5, 2026-09-02): раньше всё жило одним ManagerScreen.tsx на 1005 строк.
// Шапка экранов менеджера: организация/регион/сезон + подзаголовок фазы.
import { useI18n } from "../../i18n/I18nProvider.tsx";
import {
  
  
  
  
  
  type ManagerEngine,
} from "../../game/manager/engine.ts";
import { Eyebrow } from "../../ui/index.ts";

export function ManagerHeading({ engine, sub }: { engine: ManagerEngine | null; sub: string }) {
  const { t } = useI18n();
  return (
    <header className="screen-heading">
      <Eyebrow>{t("manager.eyebrow")}</Eyebrow>
      <h1>{engine ? engine.state.config.orgName : t("start.modeManager")}</h1>
      <p className="manager__sub">{sub}</p>
    </header>
  );
}

// ── Онбординг ────────────────────────────────────────────────────────────────
