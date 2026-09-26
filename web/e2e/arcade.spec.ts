import { expect, test } from "@playwright/test";
import { gotoFreshApp } from "./helpers.ts";

/** Аркада (M13): вход в режим → забег тикает → карточка уровня выбирается → пауза → выход с confirm. */
test.describe("arcade", () => {
  test.setTimeout(120_000);
  test("забег стартует, уровень выбирается, пауза и выход работают", async ({ page }) => {
    await gotoFreshApp(page);
    await page.getByTestId("mode-arcade").click();
    await expect(page.getByTestId("arcade-hero")).toBeVisible();
    await page.getByTestId("arcade-seed").fill("e2e-arcade-1");
    await page.getByTestId("arcade-play").click();
    const clock = page.getByTestId("arcade-clock");
    await expect(clock).toBeVisible();
    // Держим движение, чтобы собирать опыт; первый уровень приходит в первую минуту.
    await page.keyboard.down("KeyD");
    await expect(clock).not.toHaveText("0:00", { timeout: 5000 });
    const levelUp = page.getByTestId("arcade-levelup");
    await expect(levelUp).toBeVisible({ timeout: 60_000 });
    await page.keyboard.up("KeyD");
    // Мир стоит, пока висит выбор: часы не идут.
    const frozen = await clock.textContent();
    await page.waitForTimeout(700);
    await expect(clock).toHaveText(frozen ?? "");
    await page.getByTestId("arcade-offer-0").click();
    await expect(levelUp).toHaveCount(0);
    await expect(clock).not.toHaveText(frozen ?? "", { timeout: 5000 });
    // Пауза по Escape и выход через подтверждение.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("arcade-paused")).toBeVisible();
    await page.getByRole("button", { name: /Leave run|Выйти из забега/ }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: /Leave run|Выйти из забега/ }).click();
    await expect(page.getByTestId("arcade-hero")).toBeVisible();
  });

  test("«Ещё раз» монтирует сцену заново: новый холст и кнопки итога без состояния прошлого забега", async ({ page }) => {
    await gotoFreshApp(page);
    await page.getByTestId("mode-arcade").click();
    await page.getByTestId("arcade-seed").fill("e2e-arcade-again");
    await page.getByTestId("arcade-play").click();
    await expect(page.getByTestId("arcade-clock")).toBeVisible();
    // Метка на холсте первого забега: перемонтированная сцена создаёт новый холст без неё.
    await page.evaluate("document.querySelector('.arcade__canvas').dataset.e2eRun = 'first'");
    // Конец забега без ожидания — через dev-хук сима.
    await page.evaluate("window.__arcadeSim().finish('dead')");
    const over = page.getByTestId("arcade-over");
    await expect(over).toBeVisible();
    const copy = page.getByTestId("arcade-copy-replay");
    await copy.click();
    await expect(copy).toHaveText(/Реплей скопирован|Replay copied/);
    await page.getByTestId("arcade-again").click();
    await expect(over).toHaveCount(0);
    await expect(page.getByTestId("arcade-clock")).toBeVisible();
    await expect(page.locator(".arcade__canvas")).not.toHaveAttribute("data-e2e-run", "first");
    await page.evaluate("window.__arcadeSim().finish('dead')");
    await expect(over).toBeVisible();
    await expect(copy).toHaveText(/Скопировать реплей|Copy replay/);
  });

  test("клавиатура: карточка уровня выбирается Enter, Tab двигает фокус, Esc в подтверждении выхода не снимает паузу", async ({ page }) => {
    await gotoFreshApp(page);
    await page.getByTestId("mode-arcade").click();
    await page.getByTestId("arcade-seed").fill("e2e-arcade-keys");
    await page.getByTestId("arcade-play").click();
    const clock = page.getByTestId("arcade-clock");
    await expect(clock).toBeVisible();
    await expect(page.getByTestId("arcade-loading")).toHaveCount(0, { timeout: 30_000 });
    // Уровень без ожидания — через dev-хук: опыт ровно до порога (carried — без множителей), сим открывает выбор.
    await page.evaluate("(() => { const s = window.__arcadeSim(); s.gainXp(s.player.xpNext - s.player.xp, true); })()");
    const levelUp = page.getByTestId("arcade-levelup");
    await expect(levelUp).toBeVisible();
    // Tab с карточки уводит фокус дальше по окну (раньше игра глотала Tab), сборка не открывается; Enter выбирает карточку.
    const offer = page.getByTestId("arcade-offer-0");
    await offer.focus();
    await page.keyboard.press("Tab");
    await expect(offer).not.toBeFocused();
    await expect(page.getByTestId("arcade-build")).toHaveCount(0);
    await offer.focus();
    await page.keyboard.press("Enter");
    await expect(levelUp).toHaveCount(0);
    // Пауза — Escape; «Выйти из забега» жмётся с клавиатуры и открывает подтверждение.
    await page.keyboard.press("Escape");
    const paused = page.getByTestId("arcade-paused");
    await expect(paused).toBeVisible();
    const leave = paused.getByRole("button", { name: /Leave run|Выйти из забега/ });
    await leave.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Escape закрывает только подтверждение: пауза остаётся, часы стоят.
    const frozen = await clock.textContent();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(paused).toBeVisible();
    await page.waitForTimeout(1200);
    await expect(clock).toHaveText(frozen ?? "");
    // Снова подтверждение: Tab ходит по кнопкам диалога, Enter на «Выйти» уводит на экран настройки.
    await leave.focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    const confirm = dialog.getByRole("button", { name: /Leave run|Выйти из забега/ });
    for (let i = 0; i < 4 && !(await confirm.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
    await expect(confirm).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("arcade-hero")).toBeVisible();
  });

  test("Blink: Shift и кнопка HUD тратят заряд, откат виден; кнопки HUD не вылезают за сцену", async ({ page }) => {
    await gotoFreshApp(page);
    await page.getByTestId("mode-arcade").click();
    await page.getByTestId("arcade-seed").fill("e2e-arcade-blink");
    await page.getByTestId("arcade-play").click();
    await expect(page.getByTestId("arcade-clock")).toBeVisible();
    const blink = page.getByTestId("arcade-blink");
    await expect(blink).toHaveAttribute("data-charges", "1");
    // Семь кнопок в строку на телефоне не влезали — R уезжал за край сцены; теперь двухрядный кластер.
    const stage = (await page.locator(".arcade__stage").boundingBox())!;
    for (const b of await page.locator(".arcade-hud__abilities > *").all()) {
      const r = (await b.boundingBox())!;
      expect(r.x).toBeGreaterThanOrEqual(stage.x - 0.5);
      expect(r.x + r.width).toBeLessThanOrEqual(stage.x + stage.width + 0.5);
    }
    await page.keyboard.down("KeyD");
    await page.keyboard.press("Shift");
    await page.keyboard.up("KeyD");
    await expect(blink).toHaveAttribute("data-charges", "0");
    await expect(blink.locator("em")).toBeVisible();
    // Заряд копится сам; окно уровня останавливает мир — закрываем его, если выпало.
    const levelUp = page.getByTestId("arcade-levelup");
    await expect.poll(async () => {
      if (await levelUp.isVisible()) await page.getByTestId("arcade-offer-0").click();
      return blink.getAttribute("data-charges");
    }, { timeout: 30_000 }).toBe("1");
    await blink.dispatchEvent("pointerdown");
    await expect(blink).toHaveAttribute("data-charges", "0");
  });

  test("выкуп поднимает героя за золото; проклятый предмет при другой порче не взять", async ({ page }) => {
    await gotoFreshApp(page);
    await page.getByTestId("mode-arcade").click();
    await page.getByTestId("arcade-seed").fill("e2e-arcade-buyback");
    await page.getByTestId("arcade-play").click();
    await expect(page.getByTestId("arcade-clock")).toBeVisible();
    // Смертельный урон при 900 золота: мир встаёт, открывается окно выкупа.
    await page.evaluate("(() => { const s = window.__arcadeSim(); s.player.gold = 900; s.player.hp = -5; })()");
    await expect(page.getByTestId("arcade-buyback")).toBeVisible();
    await page.getByTestId("arcade-buyback-buy").click();
    await expect(page.getByTestId("arcade-buyback")).toHaveCount(0);
    const st = await page.evaluate("(() => { const s = window.__arcadeSim(); return { hp: s.player.hp, max: s.player.stats.maxHp, over: !!s.over, buybacks: s.buybacks }; })()") as { hp: number; max: number; over: boolean; buybacks: number };
    expect(st.over).toBe(false);
    expect(st.buybacks).toBe(1);
    expect(st.hp).toBeGreaterThan(0);
    // Проклятый предмет у ног, на герое уже Долг — взять нельзя, кнопки выключены, объяснение видно.
    await page.evaluate(`(() => { const s = window.__arcadeSim(); const p = s.player; p.invulnUntil = s.tick + 1e6;
      s.groundLoot.push({ x: p.x + 10, y: p.y, until: s.tick + 6000, curse: "withering", item: { uid: "e2e-cursed", base: "boots_of_speed", slot: "boots", rarity: "exotic", tier: 1, affixes: [] } });
      p.curse = "debt"; p.debtLeft = 100; })()`);
    await expect.poll(() => page.evaluate("window.__arcadeSim().nearLoot?.kind ?? null")).toBe("ground");
    await page.keyboard.press("KeyG");
    await expect(page.getByTestId("arcade-loot-blocked")).toBeVisible();
    await expect(page.getByTestId("arcade-loot-equip")).toBeDisabled();
    await expect(page.getByTestId("arcade-loot-bag")).toBeDisabled();
  });

  test("фирменная пассивка героя видна в HUD", async ({ page }) => {
    await gotoFreshApp(page);
    await page.getByTestId("mode-arcade").click();
    // У Juggernaut (герой по умолчанию) пассивка заведена отдельной способностью, поэтому берём того,
    // у кого она именно фирменная — Shadow Fiend с душами.
    await page.getByTestId("arcade-hero-shadow_fiend").click();
    await page.getByTestId("arcade-seed").fill("e2e-arcade-sig");
    await page.getByTestId("arcade-play").click();
    await expect(page.getByTestId("arcade-clock")).toBeVisible();
    const chip = page.getByTestId("arcade-hud-signature");
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute("title", /Necromastery|Некромастерия/);
  });

  test("лавка: предмет раскрывается по тычку и показывает характеристики", async ({ page }) => {
    await gotoFreshApp(page);
    await page.getByTestId("mode-arcade").click();
    await page.getByTestId("arcade-seed").fill("e2e-arcade-shop");
    await page.getByTestId("arcade-play").click();
    await expect(page.getByTestId("arcade-clock")).toBeVisible();
    // Лавка приходит по касанию торговца — в тесте открываем её напрямую через dev-хук.
    await page.evaluate("(() => { const s = window.__arcadeSim(); s.player.gold = 9999; s.openShop(); })()");
    const shop = page.getByTestId("arcade-shop");
    await expect(shop).toBeVisible();
    await page.getByTestId("arcade-shop-0").click();
    const item = page.getByTestId("arcade-shop-item-0");
    await expect(item).toBeVisible();
    // До тычка характеристик нет, после — есть, и продажа отдельной кнопкой.
    await expect(page.getByTestId("arcade-shop-details-0")).toHaveCount(0);
    await item.click();
    const details = page.getByTestId("arcade-shop-details-0");
    await expect(details).toBeVisible();
    await expect(details.locator("li").first()).toBeVisible();
    await expect(page.getByTestId("arcade-shop-sell-0")).toBeVisible();
  });

  test("гардероб: облик открывается по герою, покупка и надевание работают", async ({ page }) => {
    await gotoFreshApp(page);
    await page.getByTestId("mode-arcade").click();
    // Тычок по НЕ выбранному герою только выбирает его, по уже выбранному — открывает гардероб.
    // Какой герой выбран на старте, зависит от сохранённого выбора, поэтому тычем второй раз только
    // если окно ещё не открылось (иначе второй клик уходит в подложку модалки).
    await page.getByTestId("arcade-hero-juggernaut").click();
    if ((await page.getByTestId("arcade-wardrobe").count()) === 0) await page.getByTestId("arcade-hero-juggernaut").click();
    const wardrobe = page.getByTestId("arcade-wardrobe");
    await expect(wardrobe).toBeVisible();
    await expect(page.getByTestId("arcade-wardrobe-look-base")).toBeVisible();
    // Часть слота покупается так же, как облик: тычок по некупленной миниатюре только выбирает её, покупает кнопка.
    await page.getByTestId("arcade-wardrobe-tab-parts").click();
    const part = page.getByTestId("arcade-wardrobe-part-bladesrunner");
    await part.click();
    await expect(part).toHaveAttribute("data-pending", "true");
    await expect(part).not.toHaveAttribute("data-owned", "true");
    await expect(part).not.toHaveAttribute("data-active", "true");
    await page.getByTestId("arcade-wardrobe-pending-buy").click();
    await expect(part).toHaveAttribute("data-active", "true");
    await expect(page.getByTestId("arcade-wardrobe-pending")).toHaveCount(0);
    await page.getByTestId("arcade-wardrobe-tab-looks").click();
    const arcana = page.getByTestId("arcade-wardrobe-look-skin_jugg_arcana");
    await expect(arcana).toBeVisible();
    await arcana.click();
    // В dev-сборке косметика бесплатна, поэтому кнопка покупки доступна сразу.
    const buy = page.getByTestId("arcade-wardrobe-buy");
    await expect(buy).toBeVisible();
    await buy.click();
    await expect(page.getByTestId("arcade-wardrobe-buy")).toHaveCount(0);
    // Самоцвет переключается и остаётся выбранным.
    const gem = page.getByTestId("arcade-wardrobe-style-gem4");
    await gem.click();
    await expect(gem).toHaveAttribute("data-active", "true");
  });
});
