import { beforeEach, describe, expect, it } from "vitest";
import { canGoBack, navigateBack } from "../src/state/navigation.ts";
import { useRun } from "../src/state/runStore.ts";
import { useShell } from "../src/state/shellStore.ts";

beforeEach(() => {
  useShell.setState({ view: "game" });
  useRun.setState({ selectedMode: null, phase: "start", startStep: "modes" });
});

describe("canGoBack", () => {
  it("корень (game, mode=null, start) → false: там Telegram Close", () => {
    expect(canGoBack()).toBe(false);
  });

  it("вид (settings/справочник) → true", () => {
    useShell.setState({ view: "settings" });
    expect(canGoBack()).toBe(true);
  });

  it("выбор варианта и конфиг → true", () => {
    useRun.setState({ startStep: "variants" });
    expect(canGoBack()).toBe(true);
    useRun.setState({ selectedMode: "run", startStep: "config" });
    expect(canGoBack()).toBe(true);
  });

  it("в самом забеге (mode выбран, draft) → false: там Close + closing-confirm, не Back", () => {
    useRun.setState({ selectedMode: "classic", phase: "draft" });
    expect(canGoBack()).toBe(false);
  });
});

describe("navigateBack", () => {
  it("из конфига возвращает в выбор Quick/Roguelite, сохраняя двухшаговую иерархию", () => {
    useRun.setState({ selectedMode: "run", startStep: "config", phase: "start" });
    navigateBack();
    expect(useRun.getState().selectedMode).toBeNull();
    expect(useRun.getState().startStep).toBe("variants");

    navigateBack();
    expect(useRun.getState().startStep).toBe("modes");
  });

  it("из preview недоступного режима возвращает в корень", () => {
    useRun.setState({ selectedMode: "manager", startStep: "modes", phase: "start" });
    navigateBack();
    expect(useRun.getState().selectedMode).toBeNull();
  });

  it("с вида (без window.history в node) уводит на игру, а не из приложения", () => {
    useShell.setState({ view: "settings" });
    navigateBack();
    expect(useShell.getState().view).toBe("game");
  });

  it("прямо открытый дочерний вид возвращает в settings", () => {
    useShell.setState({ view: "career" });
    navigateBack();
    expect(useShell.getState().view).toBe("settings");
  });

  it("в корне ничего не ломает (некуда идти)", () => {
    navigateBack();
    expect(useShell.getState().view).toBe("game");
    expect(useRun.getState().selectedMode).toBeNull();
  });
});
