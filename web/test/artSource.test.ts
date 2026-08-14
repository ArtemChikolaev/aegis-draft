import { describe, expect, it } from "vitest";
import { heroArtSources, itemArtSources, teamArtSources } from "../src/ui/artSource.ts";

const isLocal = (url: string) => !url.startsWith("http");
const isCdn = (url: string) => url.startsWith("https://cdn.cloudflare.steamstatic.com") || url.startsWith("https://steamcdn-a.akamaihd.net");

describe("порядок источников", () => {
  it("зеркало идёт первым, CDN — запасным (иначе офлайн не увидит картинку)", () => {
    for (const sources of [heroArtSources("antimage"), itemArtSources("bfury")]) {
      expect(sources).toHaveLength(2);
      expect(isLocal(sources[0])).toBe(true);
      expect(isCdn(sources[1])).toBe(true);
    }
  });

  it("зеркало лежит под art/ и учитывает базу приложения", () => {
    expect(heroArtSources("antimage")[0]).toBe("/art/heroes/antimage.webp");
    expect(itemArtSources("bfury")[0]).toBe("/art/items/bfury.webp");
    expect(teamArtSources(15, undefined)[0]).toBe("/art/teams/15.webp");
  });
});

describe("логотип команды", () => {
  const cdnLogo = "https://steamcdn-a.akamaihd.net/apps/dota2/images/team_logos/15.png";

  it("id есть, ссылка есть — зеркало, затем ссылка из датасета", () => {
    expect(teamArtSources(15, cdnLogo)).toEqual(["/art/teams/15.webp", cdnLogo]);
  });

  it("зеркала для новой команды ещё нет — остаётся ссылка из датасета", () => {
    // Датасет обновляется кроном, зеркало — отдельным прогоном gen:art: между ними знак берётся с CDN.
    expect(teamArtSources(undefined, cdnLogo)).toEqual([cdnLogo]);
  });

  it("нет ни id, ни ссылки — источников нет, компонент покажет монограмму", () => {
    expect(teamArtSources(undefined, undefined)).toEqual([]);
  });
});

describe("пустые входы", () => {
  it("пустой слаг не даёт запроса вообще", () => {
    expect(heroArtSources("")).toEqual([]);
    expect(itemArtSources("")).toEqual([]);
  });
});
