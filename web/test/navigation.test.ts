import { beforeEach, describe, expect, it } from "vitest";
import { canGoBack, navigateBack } from "../src/state/navigation.ts";
import { useRun } from "../src/state/runStore.ts";
import { useShell } from "../src/state/shellStore.ts";

beforeEach(() => {
  useShell.setState({ view: "game" });
  useRun.setState({ selectedMode: null, phase: "start" });
});

describe("canGoBack", () => {
  it("корень (game, mode=null, start) → false: там Telegram Close", () => {
    expect(canGoBack()).toBe(false);
  });

  it("вид (settings/справочник) → true", () => {
    useShell.setState({ view: "settings" });
    expect(canGoBack()).toBe(true);
  });

  it("экран деталей режима (mode выбран, забег не начат) → true", () => {
    useRun.setState({ selectedMode: "classic", phase: "start" });
    expect(canGoBack()).toBe(true);
  });

  it("в самом забеге (mode выбран, draft) → false: там Close + closing-confirm, не Back", () => {
    useRun.setState({ selectedMode: "classic", phase: "draft" });
    expect(canGoBack()).toBe(false);
  });
});

describe("navigateBack", () => {
  it("с экрана деталей режима возвращает в выбор режимов", () => {
    useRun.setState({ selectedMode: "classic", phase: "start" });
    navigateBack();
    expect(useRun.getState().selectedMode).toBeNull();
  });

  it("с вида (без window.history в node) уводит на игру, а не из приложения", () => {
    useShell.setState({ view: "settings" });
    navigateBack();
    expect(useShell.getState().view).toBe("game");
  });

  it("в корне ничего не ломает (некуда идти)", () => {
    navigateBack();
    expect(useShell.getState().view).toBe("game");
    expect(useRun.getState().selectedMode).toBeNull();
  });
});
