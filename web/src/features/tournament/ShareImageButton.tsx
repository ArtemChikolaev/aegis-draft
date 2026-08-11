import { useState } from "react";
import { roleMessageKey, type MessageKey } from "../../i18n/core.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { useRun } from "../../state/runStore.ts";
import { difficultyLabel } from "../../state/careerStore.ts";
import { Button } from "../../ui/index.ts";
import { useHeroName } from "../draft/heroes.ts";
import { configKeys } from "../career/CareerRunCard.tsx";
import { renderShareCard, resolveShareTheme, shareCardPlayers, shareFileName } from "./shareImage.ts";

/** «Сохранить картинку» на итоге забега (T7.1). Карточка 1200×630: команда, место, пятёрка
 *  с героями, разбивка счёта, сид. На устройствах с share sheet (мобила) — нативный шеринг,
 *  иначе — скачивание PNG. */
export function ShareImageButton() {
  const { t } = useI18n();
  const snapshot = useRun((s) => s.snapshot);
  const tournament = useRun((s) => s.tournament);
  const config = useRun((s) => s.config);
  const seed = useRun((s) => s.seed);
  const teamName = useRun((s) => s.teamName);
  const heroName = useHeroName();
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle");

  if (!snapshot?.score || !tournament || !config || !seed) return null;
  const score = snapshot.score;

  const save = async () => {
    if (state === "busy") return;
    setState("busy");
    try {
      const blob = await renderShareCard(
        {
          brand: "AEGIS DRAFT",
          configLine: configKeys({
            format: config.format,
            difficulty: difficultyLabel(config.rerolls),
            scoring: config.scoring,
            draftStyle: config.draftStyle,
          }).map((key) => t(key)).join(" · "),
          teamName: teamName.trim() || t("team.placeholder"),
          placement: t(`tournament.place.${tournament.userPlacement}` as MessageKey),
          ovrLabel: t("common.teamOvr"),
          baseLabel: t("common.base"),
          synergyLabel: t("common.heroSynergy"),
          chemistryLabel: t("common.chemistry"),
          teamOvr: score.teamOvr,
          base: score.base,
          heroSynergy: score.heroSynergy,
          chemistry: score.chemistry,
          players: shareCardPlayers(snapshot.roster, score.assignment.byPlayer, heroName, (role) =>
            t(roleMessageKey(role)),
          ),
          seedLine: `${t("common.seed")} ${seed}`,
          host: window.location.host,
        },
        resolveShareTheme(document.documentElement),
      );

      const fileName = shareFileName(seed);
      const file = new File([blob], fileName, { type: "image/png" });
      // Share sheet — только там, где он есть и принимает файлы (мобила/TMA). Отказ юзера
      // (AbortError) — не ошибка; истёкшая активация и прочее — падаем в скачивание.
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
          setState("done");
          window.setTimeout(() => setState("idle"), 2000);
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            setState("idle");
            return;
          }
          // NotAllowedError и др. — молча продолжаем скачиванием.
        }
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      // revoke не сразу: Safari может не успеть начать скачивание.
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setState("done");
      window.setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("failed");
      window.setTimeout(() => setState("idle"), 2500);
    }
  };

  const label =
    state === "busy" ? t("share.imageBusy")
    : state === "done" ? t("share.imageSaved")
    : state === "failed" ? t("share.imageFailed")
    : t("share.image");

  return (
    <Button variant="secondary" data-testid="share-image" onClick={save} disabled={state === "busy"}>
      {label}
    </Button>
  );
}
