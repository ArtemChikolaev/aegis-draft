import { expect, test } from "@playwright/test";
import { completeDraft, gotoFreshApp, simulateAnteStageToOutcome, startClassicRun, startRogueliteRun, startRogueliteSeed } from "./helpers.ts";

// Seed, проходящий этап 1 жадным авто-драфтом (completeDraft) с большим запасом (место 1) —
// Буткемп достигается детерминированно. Подобран под текущие ante-константы (см. историю).
const CAMP_SEED = "camp-e2e-3";

// Roguelite Run (T5.7 срез 1 + T5.2 срез 2): драфт → этап → Буткемп (reward/market) → следующий
// этап; растущий порог, промах = конец.
test("roguelite run: этапы через Буткемп и завершение забега", async ({ page }) => {
  // До 5 этапов × (reveal турнира + Буткемп) — на медленном CI-mobile не влезает в 30с.
  // Фикс-seed делает число этапов детерминированным, slow() утраивает бюджет.
  test.slow();
  await gotoFreshApp(page);
  await startRogueliteSeed(page, CAMP_SEED);
  await completeDraft(page);

  let stagesPlayed = 0;
  for (let stage = 0; stage < 6; stage += 1) {
    await expect(page.getByTestId("ante-status")).toBeVisible();
    await simulateAnteStageToOutcome(page);
    await expect(page.getByTestId("ante-result")).toBeVisible();
    stagesPlayed += 1;

    if (await page.getByTestId("tournament-complete").isVisible().catch(() => false)) break;
    // Этап пройден → в Буткемп → следующий этап.
    await expect(page.getByTestId("ante-to-camp")).toBeVisible();
    await page.getByTestId("ante-to-camp").click();
    await expect(page.getByTestId("camp-screen")).toBeVisible();
    await page.getByTestId("camp-next-stage").click();
    await expect(page.getByTestId("tournament-simulate")).toBeVisible();
  }

  await expect(page.getByTestId("tournament-complete")).toBeVisible();
  expect(stagesPlayed).toBeGreaterThanOrEqual(1);
  expect(stagesPlayed).toBeLessThanOrEqual(5);
  await expect(page.locator(".career-run").first()).toContainText(`Stage ${stagesPlayed}/5`);
});

// Экономика Буткемпа: reward (выбор 1 из 3) и покупка на рынке двигают Team OVR, баланс не в минус.
test("roguelite run: Буткемп — reward и покупка меняют команду", async ({ page }) => {
  await gotoFreshApp(page);
  await startRogueliteSeed(page, CAMP_SEED);
  await completeDraft(page);
  await simulateAnteStageToOutcome(page);

  // Фиксированный seed гарантирует проход этапа 1 → Буткемп.
  await expect(page.getByTestId("ante-to-camp")).toBeVisible();
  await page.getByTestId("ante-to-camp").click();
  await expect(page.getByTestId("camp-screen")).toBeVisible();

  // Reward: выбрать первую карту золота, баланс растёт.
  const goldBefore = Number(await page.getByTestId("camp-gold").innerText());
  await page.getByTestId("camp-reward").getByRole("button").first().click();
  await expect(page.getByTestId("camp-gold")).not.toHaveText(String(goldBefore));

  // Market: если есть доступная покупка — купить, золото списывается и не уходит в минус.
  const buyButtons = page.getByTestId("camp-market").getByRole("button", { name: /^(Buy|Купить)$/ });
  const count = await buyButtons.count();
  for (let i = 0; i < count; i += 1) {
    const btn = buyButtons.nth(i);
    if (!(await btn.isEnabled())) continue;
    const beforeBuy = Number(await page.getByTestId("camp-gold").innerText());
    await btn.click();
    const afterBuy = Number(await page.getByTestId("camp-gold").innerText());
    expect(afterBuy).toBeLessThan(beforeBuy);
    expect(afterBuy).toBeGreaterThanOrEqual(0);
    break;
  }

  // Следующий этап играется с усиленным полем.
  await page.getByTestId("camp-next-stage").click();
  await expect(page.getByTestId("tournament-simulate")).toBeVisible();
});

// Quick Draft (classic) НЕ показывает ante-статус и Буткемп — режим не затронут.
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
  await expect(page.getByTestId("ante-status")).toContainText("Stage 1/5");
  await expect(page.getByTestId("tournament-simulate")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("resume-banner")).toBeVisible();
  await page.getByTestId("resume-continue").click();

  await expect(page.getByTestId("ante-status")).toContainText("Stage 1/5");
  await expect(page.getByTestId("tournament-simulate")).toBeVisible();
});

// Resume восстанавливает Буткемп (валюта/покупки) при перезагрузке во время camp.
test("roguelite run: resume восстанавливает Буткемп после перезагрузки", async ({ page }) => {
  await gotoFreshApp(page);
  await startRogueliteSeed(page, CAMP_SEED);
  await completeDraft(page);
  await simulateAnteStageToOutcome(page);

  await expect(page.getByTestId("ante-to-camp")).toBeVisible();
  await page.getByTestId("ante-to-camp").click();
  await expect(page.getByTestId("camp-screen")).toBeVisible();
  const gold = await page.getByTestId("camp-gold").innerText();

  // Перезагрузка во время Буткемпа → resume должен вернуть в camp с той же валютой.
  await page.reload();
  await expect(page.getByTestId("resume-banner")).toBeVisible();
  await page.getByTestId("resume-continue").click();

  await expect(page.getByTestId("camp-screen")).toBeVisible();
  await expect(page.getByTestId("camp-gold")).toHaveText(gold);
});
