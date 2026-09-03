// Файл на компонент (T12.5, 2026-09-02): раньше всё жило одним ManagerScreen.tsx на 1005 строк.
// Онбординг карьеры: регион, сложность, имя организации, Зал легенд.
import { useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/core.ts";
import { useManager } from "../../state/managerStore.ts";
import {
  MANAGER_INCOME,
  MANAGER_REGIONS,
  
  
  type ManagerDifficulty,
  type ManagerRegion,
  
} from "../../game/manager/economy.ts";
import { Button, Modal, OptionGroup, Surface, TextField } from "../../ui/index.ts";
import { ManagerHeading } from "./ManagerHeading.tsx";
import { HallModal } from "./HallModal.tsx";

export function Onboarding() {
  const { t } = useI18n();
  const startCareer = useManager((s) => s.startCareer);
  const engine = useManager((s) => s.engine);
  const resumable = useManager((s) => s.resumable);
  const hall = useManager((s) => s.hall);
  const [orgName, setOrgName] = useState("");
  const [region, setRegion] = useState<ManagerRegion>("weu");
  const [difficulty, setDifficulty] = useState<ManagerDifficulty>("normal");
  const [confirmNew, setConfirmNew] = useState(false);
  const [showHall, setShowHall] = useState(false);

  // Новая карьера поверх существующей стирает долгий сейв — только через confirm.
  const existing = engine ? engine.state.config.orgName : resumable?.orgName ?? null;
  const found = () => startCareer(orgName, region, difficulty);

  const regionOptions = MANAGER_REGIONS.map((value) => ({
    value,
    label: value.toUpperCase(),
    hint: t(`manager.region.${value}` as MessageKey),
  }));

  return (
    <>
      <ManagerHeading engine={null} sub={t("manager.onboardingSub")} />
      <Surface className="manager__panel">
        <label className="manager__field">
          <span className="manager__section">{t("manager.orgName")}</span>
          <TextField
            value={orgName}
            placeholder={t("manager.orgNamePlaceholder")}
            onChange={(event) => setOrgName(event.target.value)}
            maxLength={28}
            data-testid="manager-org-name"
          />
        </label>
        <OptionGroup title={t("manager.region")} soonLabel={t("common.soon")} options={regionOptions} value={region} onChange={(v) => setRegion(v as ManagerRegion)} columns={3} />
        <OptionGroup
          title={t("manager.difficulty")}
          soonLabel={t("common.soon")}
          options={(["easy", "normal", "hard"] as ManagerDifficulty[]).map((value) => ({
            value,
            label: t(`start.${value === "normal" ? "normal" : value}` as MessageKey),
            hint: t("manager.incomeHint", { n: MANAGER_INCOME[value] }),
          }))}
          value={difficulty}
          onChange={(v) => setDifficulty(v as ManagerDifficulty)}
        />
        <div>
          <Button
            variant="primary"
            data-testid="manager-found"
            disabled={orgName.trim().length < 2}
            onClick={() => (existing ? setConfirmNew(true) : found())}
          >
            {t("manager.found")} →
          </Button>
        </div>
      </Surface>
      {/* Зал открыт и до первой карьеры: пустой зал объясняет, что тут будет копиться. */}
      {hall.careers > 0 && (
        <div>
          <Button variant="secondary" data-testid="manager-hall-open" onClick={() => setShowHall(true)}>
            {t("manager.hallTitle")}
          </Button>
        </div>
      )}
      {showHall && <HallModal onClose={() => setShowHall(false)} />}
      {confirmNew && existing && (
        <Modal
          mark="A"
          title={t("manager.newOverTitle")}
          description={t("manager.newOverText", { org: existing })}
          labelledBy="manager-new-over-title"
          dismissLabel={t("common.close")}
          onClose={() => setConfirmNew(false)}
        >
          {({ close }) => (
            <>
              <Button variant="primaryInvert" onClick={close}>{t("tournament.leaveCancel")}</Button>
              <Button variant="danger" data-testid="manager-new-over-confirm" onClick={() => { found(); close(); }}>
                {t("manager.found")}
              </Button>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
