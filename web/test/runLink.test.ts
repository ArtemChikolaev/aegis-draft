import { describe, expect, it } from "vitest";
import {
  decodeRunLink,
  encodeRunLink,
  runLinkFromHash,
  runLinkHash,
  runLinkIssue,
  runLinkUrl,
  type RunLink,
} from "../src/state/runLink.ts";
import { defaultRunConfig } from "./helpers/packs.ts";

const base: RunLink = {
  v: 1,
  s: 1,
  r: "v1.11.0",
  mode: "classic",
  config: { ...defaultRunConfig },
  seed: "abc-123",
};

describe("runLink: ссылка на забег", () => {
  it("round-trip сохраняет конфиг и seed", () => {
    const decoded = decodeRunLink(encodeRunLink(base));
    expect(decoded).toEqual(base);
  });

  it("round-trip через hash", () => {
    expect(runLinkFromHash(runLinkHash(base))).toEqual(base);
  });

  it("кодирование детерминировано — одна и та же ссылка на один и тот же забег", () => {
    expect(encodeRunLink(base)).toBe(encodeRunLink({ ...base, config: { ...base.config } }));
  });

  it("Easy переживает round-trip: Infinity не превращается в 0 рероллов", () => {
    // JSON.stringify(Infinity) === "null" — грабля, уже поймана в runPersist.
    const easy: RunLink = { ...base, config: { ...base.config, rerolls: Infinity } };
    const decoded = decodeRunLink(encodeRunLink(easy));
    expect(decoded?.config.rerolls).toBe(Infinity);
  });

  it("hardMode переживает round-trip в обе стороны", () => {
    const hard = decodeRunLink(encodeRunLink({ ...base, config: { ...base.config, hardMode: true } }));
    expect(hard?.config.hardMode).toBe(true);
    // Выключенный хардкор в ссылку не пишется и обратно приходит как «не задан» — это то же
    // самое по смыслу (RunConfig.hardMode опционален), зато ссылка короче.
    const soft = decodeRunLink(encodeRunLink({ ...base, config: { ...base.config, hardMode: false } }));
    expect(soft?.config.hardMode ?? false).toBe(false);
  });

  it("все оси конфига переживают round-trip", () => {
    for (const draftStyle of ["team", "mixed"] as const) {
      for (const allocation of ["auto", "manual"] as const) {
        for (const rerolls of [0, 1, 2, Infinity]) {
          const link: RunLink = { ...base, config: { ...base.config, draftStyle, allocation, rerolls } };
          const decoded = decodeRunLink(encodeRunLink(link));
          expect(decoded?.config, `${draftStyle}/${allocation}/${rerolls}`).toEqual(link.config);
        }
      }
    }
  });

  it("не-ASCII переживает round-trip (btoa сам по себе умеет только Latin1)", () => {
    // Голый btoa(JSON.stringify(...)) бросает InvalidCharacterError на кириллице/эмодзи —
    // на этом споткнулся упрощённый хелпер в e2e. Кодек идёт через TextEncoder, поэтому
    // держит любой UTF-8: имена команд и ники бывают какими угодно.
    const exotic: RunLink = { ...base, r: "v1.12.0-тест", seed: "сид-🎲-测试" };
    expect(decodeRunLink(encodeRunLink(exotic))).toEqual(exotic);
  });

  it("битая ссылка не роняет приложение, а даёт null", () => {
    for (const bad of ["", "не-base64!!", "eyJ2Ijo5OTl9", toGarbage(), runLinkHash(base)]) {
      expect(() => decodeRunLink(bad)).not.toThrow();
    }
    expect(decodeRunLink("не-base64!!")).toBeNull();
    // Валидный base64 с чужим payload — тоже null, а не полузаполненный конфиг.
    expect(decodeRunLink(btoa(JSON.stringify({ v: 1, hello: "world" })))).toBeNull();
    // Версия из будущего не притворяется совместимой.
    expect(decodeRunLink(btoa(JSON.stringify({ v: 2, seed: "x" })))).toBeNull();
  });

  it("чужой хеш — не ссылка на забег (роутинг оболочки не ломается)", () => {
    for (const hash of ["", "#/settings", "#/heroes", "#/", "#run=abc"]) {
      expect(runLinkFromHash(hash), hash).toBeNull();
    }
  });

  it("URL держит сабпуть деплоя", () => {
    const url = runLinkUrl(base, "https://example.github.io", "/aegis-draft/");
    expect(url.startsWith("https://example.github.io/aegis-draft/#/run=")).toBe(true);
    expect(runLinkFromHash(url.slice(url.indexOf("#")))).toEqual(base);
  });

  it("совместимость: расходятся версии — называем причину, а не молчим", () => {
    expect(runLinkIssue(base, 1, "v1.11.0")).toBeNull();
    expect(runLinkIssue(base, 2, "v1.11.0")).toBe("schema");
    expect(runLinkIssue(base, 1, "v1.10.0")).toBe("model");
    // Схема важнее модели: без неё данные вообще другой формы.
    expect(runLinkIssue(base, 2, "v1.10.0")).toBe("schema");
  });

  it("builtAt НЕ влияет на совместимость (иначе ссылка живёт меньше суток)", () => {
    // Датасет пересобирается кроном ежедневно; значимы только schema и модель рейтингов.
    expect(runLinkIssue(base, 1, "v1.11.0")).toBeNull();
  });
});

function toGarbage(): string {
  return String.fromCharCode(0, 1, 2);
}
