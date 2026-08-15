import { useEffect, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { TournamentResult } from "../../game/tournament.ts";
import { Button, prefersReducedMotion } from "../../ui/index.ts";

/** Live-reveal финала сезона (T5.5 срез 6). Презентационная раскадровка ГОТОВОГО результата
 *  TournamentEngine: группы построчно → маршруты (верх/низ/вылет) → сетка по раундам →
 *  чемпион. Данные не считаются на лету — reload посреди reveal просто переиграет подачу.
 *  Тайминги — по мотивам классической подачи (T7.10); reduced-motion сразу показывает итог. */
export function FinaleReveal({ finale, orgName, done, onDone }: {
  finale: TournamentResult;
  orgName: string;
  /** Reveal уже доигран (или пропущен) — рисуем всё раскрытым. */
  done: boolean;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const rounds = [...finale.playoffRounds, { id: "grand-final", label: t("manager.finaleGF"), series: [finale.grandFinal] }];
  // Раскадровка: группы 9 шагов → маршруты 3 → раунды по одному → готово.
  const total = 9 + 3 + rounds.length;
  const [step, setStep] = useState(done || prefersReducedMotion() ? total : 0);

  useEffect(() => {
    if (step >= total) {
      if (!done) onDone();
      return;
    }
    const pace = step < 9 ? 200 : step < 12 ? 900 : 380;
    const timer = window.setTimeout(() => setStep((s) => s + 1), pace);
    return () => window.clearTimeout(timer);
  }, [step, total, done, onDone]);

  const groupRows = Math.min(9, step);
  const routeStep = Math.max(0, Math.min(3, step - 9)); // 1=верх, 2=низ, 3=вылет
  const roundsShown = Math.max(0, step - 12);
  const finished = step >= total;

  const routeClass = (route: "upper" | "lower" | "out") =>
    (route === "upper" && routeStep >= 1) || (route === "lower" && routeStep >= 2) || (route === "out" && routeStep >= 3)
      ? ` is-${route}`
      : "";

  return (
    <div className="manager__finale" data-testid="manager-finale-reveal">
      <div className="manager__finale-groups">
        {finale.groups.map((group) => (
          <div key={group.id} className="manager__finale-group">
            <em>{t("manager.finaleGroup", { id: group.id })}</em>
            {group.standings.slice(0, groupRows).map((row) => (
              <div key={row.team.id} className={`manager__finale-row${row.team.isUser ? " is-user" : ""}${routeClass(row.route)}`}>
                <span>{row.rank}</span>
                <strong>{row.team.name}</strong>
                <b>{row.wins}–{row.losses}</b>
              </div>
            ))}
          </div>
        ))}
      </div>
      {routeStep >= 1 && (
        <p className="manager__finale-route">
          {routeStep === 1 && `▲ ${t("manager.finaleUpper")}`}
          {routeStep === 2 && `▼ ${t("manager.finaleLower")}`}
          {routeStep >= 3 && `✖ ${t("manager.finaleOut")}`}
        </p>
      )}
      {roundsShown > 0 && (
        <div className="manager__finale-rounds">
          {rounds.slice(0, roundsShown).map((round) => (
            <div key={round.id} className="manager__finale-round">
              <em>{round.label}</em>
              {round.series.map((series) => (
                <div key={series.id} className="manager__bracket-match">
                  <span className={`${series.winnerId === series.teamA.id ? "is-winner" : ""}${series.teamA.isUser ? " is-user" : ""}`}>
                    {series.teamA.name} <b>{series.scoreA}</b>
                  </span>
                  <span className={`${series.winnerId === series.teamB.id ? "is-winner" : ""}${series.teamB.isUser ? " is-user" : ""}`}>
                    {series.teamB.name} <b>{series.scoreB}</b>
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {finished && (
        <p className="manager__finale-champion" data-testid="manager-finale-champion">
          🏆 {t("manager.finaleChampion", { name: finale.champion.name })}
          {finale.champion.isUser && <strong> — {orgName}!</strong>}
        </p>
      )}
      {!finished && (
        <div>
          <Button variant="secondary" data-testid="manager-finale-skip" onClick={() => setStep(total)}>
            {t("tournament.showResult")}
          </Button>
        </div>
      )}
    </div>
  );
}
