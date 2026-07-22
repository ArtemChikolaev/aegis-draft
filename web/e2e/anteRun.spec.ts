import { expect, test } from "@playwright/test";
import { completeDraft, gotoFreshApp, simulateAnteStageToOutcome, startClassicRun, startRogueliteRun } from "./helpers.ts";

// Roguelite Run (T5.7, срез 1): один драфт → цепочка этапов с растущим порогом; промах = конец.
test("roguelite run: этапы со статусом и завершением забега", async ({ page }) => {
  await gotoFreshApp(page);
  await startRogueliteRun(page);
  await completeDraft(page);

  // Проходим этапы, пока забег не завершится. Лестница = 5 этапов, +запас на цикл.
  let stagesPlayed = 0;
  for (let stage = 0; stage < 6; stage += 1) {
    // Статус этапа виден на протяжении всего забега (панель поля сверху).
    await expect(page.getByTestId("ante-status")).toBeVisible();
    await simulateAnteStageToOutcome(page);
    // Исход этапа объявляется баннером (пройден / победа / вылет).
    await expect(page.getByTestId("ante-result")).toBeVisible();
    stagesPlayed += 1;

    if (await page.getByTestId("tournament-complete").isVisible().catch(() => false)) break;
    // Забег продолжается — идём на следующий этап.
    await expect(page.getByTestId("ante-next-stage")).toBeVisible();
    await page.getByTestId("ante-next-stage").click();
    await expect(page.getByTestId("tournament-simulate")).toBeVisible();
  }

  // Забег обязан завершиться терминальным экраном за число этапов лестницы.
  await expect(page.getByTestId("tournament-complete")).toBeVisible();
  expect(stagesPlayed).toBeGreaterThanOrEqual(1);
  expect(stagesPlayed).toBeLessThanOrEqual(5);
  await expect(page.locator(".career-run").first()).toContainText(`Stage ${stagesPlayed}/5`);
});

// Quick Draft (classic) НЕ показывает ante-статус — режим не затронут.
test("quick draft не показывает ante-статус", async ({ page }) => {
  await gotoFreshApp(page);
  await startClassicRun(page);
  await completeDraft(page);
  await expect(page.getByTestId("tournament-simulate")).toBeVisible();
  await expect(page.getByTestId("ante-status")).toHaveCount(0);
});

// Resume восстанавливает ante-забег на том же этапе (сейв несёт mode + anteStageIndex).
test("roguelite run: resume восстанавливает ante-этап после перезагрузки", async ({ page }) => {
  await gotoFreshApp(page);
  await startRogueliteRun(page);
  await completeDraft(page);
  // Дошли до поля этапа 1 — ante активен.
  await expect(page.getByTestId("ante-status")).toContainText("Stage 1/5");
  await expect(page.getByTestId("tournament-simulate")).toBeVisible();

  // Перезагрузка (НЕ gotoFreshApp — сейв должен пережить), затем resume.
  await page.reload();
  await expect(page.getByTestId("resume-banner")).toBeVisible();
  await page.getByTestId("resume-continue").click();

  // Вернулись в тот же roguelite-этап: ante-состояние восстановлено детерминированным replay.
  await expect(page.getByTestId("ante-status")).toContainText("Stage 1/5");
  await expect(page.getByTestId("tournament-simulate")).toBeVisible();
});
