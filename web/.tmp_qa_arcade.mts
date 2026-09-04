import { chromium } from "playwright";
const OUT = "/private/tmp/claude-501/-Users-Shared-Coding-aegis-draft/1d9a862b-1f68-461c-b81e-a5d7ff4d2bc0/scratchpad";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto("http://localhost:5273/");
await page.evaluate(() => localStorage.clear());
await page.goto("http://localhost:5273/");
await page.getByTestId("mode-arcade").click();
await page.getByTestId("arcade-seed").fill("qa-1");
await page.getByTestId("arcade-play").click();
await page.waitForSelector("[data-testid=arcade-clock]");
const start = Date.now();
let picks = 0;
// Кайт по квадрату: держим клавишу 1.5 с, меняем направление; карточки уровня берём первой.
const keys = ["KeyD", "KeyS", "KeyA", "KeyW"];
let i = 0;
while (Date.now() - start < 90_000) {
  const offer = page.getByTestId("arcade-offer-0");
  if (await offer.count()) { await offer.click(); picks++; continue; }
  if (await page.getByTestId("arcade-over").count()) break;
  await page.keyboard.down(keys[i % 4]);
  await page.waitForTimeout(1200);
  await page.keyboard.up(keys[i % 4]);
  i++;
  if (i % 5 === 0) {
    const clock = await page.getByTestId("arcade-clock").textContent();
    console.log("clock", clock, "picks", picks);
    await page.screenshot({ path: `${OUT}/arcade_${i}.png` });
  }
}
const over = await page.getByTestId("arcade-over").count();
console.log("over?", over, "picks", picks, await page.getByTestId("arcade-clock").textContent());
await page.screenshot({ path: `${OUT}/arcade_end.png` });
if (over) console.log(await page.locator(".arcade-result").innerText());
console.log("errors", errors);
await browser.close();
