// Файл на компонент (T12.5, 2026-09-02): раньше всё жило одним ManagerScreen.tsx на 1005 строк.
// Фаза контрактов: зарплаты, бюджет, подписания.
import { useMemo, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { Role } from "../../types/data.ts";
import { roleMessageKey } from "../../i18n/core.ts";
import { useManager } from "../../state/managerStore.ts";
import {
  
  
  
  
  
  type ManagerEngine,
} from "../../game/manager/engine.ts";
import { Button, OvrBadge, RoleTag, Surface } from "../../ui/index.ts";
import { ManagerHeading } from "./ManagerHeading.tsx";

export function Contracts({ engine }: { engine: ManagerEngine }) {
  const { t } = useI18n();
  const act = useManager((s) => s.act);
  const [picked, setPicked] = useState<number[]>([]);
  const s = engine.state;
  const income = engine.incomeK;
  const wages = s.candidates.filter((c) => picked.includes(c.candidate.player.accountId)).reduce((sum, c) => sum + c.salary, 0);
  const verdict = engine.validateRoster(picked);

  const toggle = (id: number) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const sorted = useMemo(
    () => [...s.candidates].sort((a, b) => b.salary - a.salary),
    [s.candidates],
  );

  // Гейт ролей как в 322-0: заполненная квота (1C/1M/1O/2S) гасит остальных кандидатов
  // этой роли — перебрать роль нельзя по построению, а не по сообщению об ошибке.
  const ROLE_QUOTA: Record<Role, number> = { safelane: 1, mid: 1, offlane: 1, support: 2 };
  const pickedByRole = new Map<Role, number>();
  for (const c of s.candidates) {
    if (picked.includes(c.candidate.player.accountId)) {
      const role = c.candidate.player.role;
      pickedByRole.set(role, (pickedByRole.get(role) ?? 0) + 1);
    }
  }
  const roleFull = (role: Role) => (pickedByRole.get(role) ?? 0) >= ROLE_QUOTA[role];

  return (
    <>
      <ManagerHeading engine={engine} sub={t("manager.contractsSub", { n: income })} />
      <Surface className="manager__panel">
        <h2 className="manager__section">{t("manager.contractsTitle")}</h2>
        <div className="manager__contract-list">
          {sorted.map((c) => {
            const id = c.candidate.player.accountId;
            const isPicked = picked.includes(id);
            const blocked = !isPicked && roleFull(c.candidate.player.role);
            return (
              <button
                key={id}
                type="button"
                className={`manager__contract${isPicked ? " is-selected" : ""}`}
                data-testid="manager-contract-row"
                disabled={blocked}
                onClick={() => toggle(id)}
              >
                <RoleTag role={c.candidate.player.role}>{t(roleMessageKey(c.candidate.player.role))}</RoleTag>
                <span className="manager__contract-name">
                  <strong>{c.candidate.player.nickname}</strong>
                  <small>{c.filler ? t("manager.filler") : c.candidate.teamName}</small>
                </span>
                <OvrBadge className="manager__contract-ovr" ovr={c.candidate.player.ovr} />
                <span className="manager__contract-salary">${c.salary}k{t("manager.perMonth")}</span>
              </button>
            );
          })}
        </div>
        <div className="manager__signbar" data-testid="manager-signbar">
          <span>
            {t("manager.signCount", { n: picked.length })} · ${wages}k / ${income}k
            {!verdict.ok && picked.length === 5 && (
              <em className="manager__sign-issue"> · {t(verdict.reason === "budget" ? "manager.issueBudget" : "manager.issueRoles")}</em>
            )}
          </span>
          <Button variant="primary" data-testid="manager-sign" disabled={!verdict.ok} onClick={() => act((e) => e.signRoster(picked))}>
            {t("manager.sign")} →
          </Button>
        </div>
      </Surface>
    </>
  );
}

// ── Сезон ────────────────────────────────────────────────────────────────────
