// Живой смок feel-слоя roguelite (R15.1–R15.3): секвенция «этап пройден», ghost-exit покупки,
// анимации reveal (FLIP/печать/вспышка своего матча) — через getAnimations, не стили
// (правило скилла game-feel-juice). Гоняется против уже работающего dev-сервера:
//   npx tsx scripts/verify_feel_r15.ts [origin]   (по умолчанию http://localhost:5273)
import { chromium } from "@playwright/test";
import { completeDraft, gotoFreshApp, startRogueliteSeed } from "../e2e/helpers.ts";

const origin = process.argv[2] ?? "http://localhost:5273";

const sample = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.getAnimations().map((a) => {
    const name = (a as CSSAnimation).animationName;
    if (name) return name;
    const kf = (a.effect as KeyframeEffect | null)?.getKeyframes?.() ?? [];
    return kf.some((k) => k.transform != null) ? "waapi-transform" : "waapi";
  }));

const run = async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: origin });
  const page = await context.newPage();
  const seen = new Set<string>();
  let sampling = true;
  const sampler = (async () => {
    while (sampling) {
      try { for (const n of await sample(page)) seen.add(n); } catch { /* navigation */ }
      await new Promise((r) => setTimeout(r, 120));
    }
  })();

  await gotoFreshApp(page);
  await startRogueliteSeed(page, "cheat-e2e-1", { cheatMode: true });
  await completeDraft(page);

  // Этап 1 играем ВЖИВУЮ, чтобы поймать reveal-анимации (FLIP, вспышку своего матча, печать).
  await page.getByTestId("tournament-simulate").click();
  let userFlashRows = 0;
  let userRows = 0;
  const probe = (async () => {
    for (let i = 0; i < 400; i++) {
      const [flash, user] = await page.evaluate(() => [
        document.querySelectorAll(".group-result--user-win, .group-result--user-loss").length,
        document.querySelectorAll(".group-result.is-user").length,
      ]).catch(() => [0, 0]);
      userFlashRows = Math.max(userFlashRows, flash);
      userRows = Math.max(userRows, user);
      if (await page.getByTestId("ante-to-camp").isVisible().catch(() => false)) break;
      await new Promise((r) => setTimeout(r, 100));
    }
  })();
  await page.getByTestId("ante-to-camp").waitFor({ timeout: 120_000 });
  await probe;
  console.log("user rows seen:", userRows, "with outcome flash:", userFlashRows);

  // R15.2: секвенция «этап пройден».
  await page.getByTestId("ante-to-camp").click();
  const celebration = page.getByTestId("camp-celebration");
  const celebrationShown = await celebration.isVisible().catch(() => false);
  const celebrationText = celebrationShown ? await celebration.innerText() : "<none>";
  if (celebrationShown) for (const n of await sample(page)) seen.add(n);
  await page.keyboard.press("Escape");
  const celebrationGone = await celebration.waitFor({ state: "detached", timeout: 3_000 }).then(() => true, () => false);

  // R15.1: ghost-exit покупки + пульс рейла (покупка карточной награды кладёт карту в рейл).
  await page.getByTestId("camp-section-market").click();
  const buy = page.getByTestId("camp-pack").getByRole("button", { name: /^(Buy|Купить)$/ }).first();
  await buy.click();
  let sawLeaving = false;
  for (let i = 0; i < 12 && !sawLeaving; i++) {
    sawLeaving = (await page.locator("[data-leaving]").count()) > 0;
    for (const n of await sample(page)) seen.add(n);
    await new Promise((r) => setTimeout(r, 40));
  }
  const leavingGone = await page.locator("[data-leaving]").count() === 0
    || await page.waitForFunction(() => document.querySelectorAll("[data-leaving]").length === 0, undefined, { timeout: 2_000 }).then(() => true, () => false);

  sampling = false;
  await sampler;
  console.log(JSON.stringify({
    celebrationShown,
    celebrationGoneOnEscape: celebrationGone,
    celebrationText: celebrationText.replace(/\n+/g, " · ").slice(0, 160),
    ghostSeen: sawLeaving,
    ghostGone: leavingGone,
    animationsSeen: [...seen].sort(),
  }, null, 2));
  await browser.close();
};

run().catch((e) => { console.error(e); process.exit(1); });
