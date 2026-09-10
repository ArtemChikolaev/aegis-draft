import { describe, expect, it, vi } from "vitest";
import { useArcade } from "../src/state/arcadeStore.ts";

// Пресеты образа (T13.49, аудит: «сохранение всего образа на героя с переключателем „общий стиль для всех“»).
const base = () => ({ owned: ["trail_ember", "trail_frost", "aura_fire", "skin_jugg_bladesrunner"], equipped: {}, shared: {}, shards: 0, styles: {}, skins: {}, perHero: {}, perHeroLook: false });

describe("пресеты образа на героя", () => {
  it("общий образ: эффект виден у всех героев; с пресетами — только у своего, у остальных общий", () => {
    useArcade.setState({ cosmetics: base(), hero: "juggernaut" });
    const st = useArcade.getState();
    st.equip("trail", "trail_ember");
    expect(useArcade.getState().cosmetics.equipped.trail).toBe("trail_ember");
    st.setHero("axe");
    expect(useArcade.getState().cosmetics.equipped.trail).toBe("trail_ember"); // общий
    // Включаем пресеты у Axe: стартует с общего образа, дальше меняется только он.
    st.setPerHeroLook(true);
    expect(useArcade.getState().cosmetics.perHero.axe?.trail).toBe("trail_ember");
    st.equip("trail", "trail_frost");
    st.equip("aura", "aura_fire");
    expect(useArcade.getState().cosmetics.equipped.trail).toBe("trail_frost");
    expect(useArcade.getState().cosmetics.equipped.aura).toBe("aura_fire");
    expect(useArcade.getState().cosmetics.shared.trail).toBe("trail_ember"); // общий не тронут
    st.setHero("juggernaut");
    expect(useArcade.getState().cosmetics.equipped.trail).toBe("trail_ember"); // у Juggernaut пресета нет → общий
    expect(useArcade.getState().cosmetics.equipped.aura).toBeUndefined();
    // Выключили — снова общий у всех, пресет Axe остаётся в сейве.
    st.setPerHeroLook(false);
    st.setHero("axe");
    expect(useArcade.getState().cosmetics.equipped.trail).toBe("trail_ember");
    expect(useArcade.getState().cosmetics.perHero.axe?.trail).toBe("trail_frost");
    // Скин — всегда свой, независимо от режима.
    st.setHero("juggernaut");
    st.equip("skin", "skin_jugg_bladesrunner");
    expect(useArcade.getState().cosmetics.equipped.skin).toBe("skin_jugg_bladesrunner");
    st.setHero("axe");
    expect(useArcade.getState().cosmetics.equipped.skin).toBeUndefined();
  });

  it("сейв до пресетов: общий образ из старого equipped переезжает в shared; round trip через перезагрузку", async () => {
    localStorage.setItem("aegis-draft.arcade.cosmetics", JSON.stringify({ owned: ["trail_ember"], equipped: { trail: "trail_ember", skin: "skin_jugg_bladesrunner" }, shards: 3, styles: {}, skins: { juggernaut: "skin_jugg_bladesrunner" } }));
    vi.resetModules();
    let store = (await import("../src/state/arcadeStore.ts")).useArcade;
    let c = store.getState().cosmetics;
    expect(c.shared).toEqual({ trail: "trail_ember" });
    expect(c.perHeroLook).toBe(false);
    expect(c.equipped.trail).toBe("trail_ember");
    expect(c.equipped.skin).toBe("skin_jugg_bladesrunner");
    store.getState().setPerHeroLook(true);
    store.getState().equip("trail", null);
    expect(store.getState().cosmetics.equipped.trail).toBeUndefined();
    vi.resetModules();
    store = (await import("../src/state/arcadeStore.ts")).useArcade;
    c = store.getState().cosmetics;
    expect(c.perHeroLook).toBe(true);
    expect(c.perHero.juggernaut).toEqual({});
    expect(c.shared.trail).toBe("trail_ember");
    expect(c.equipped.trail).toBeUndefined();
  });
});
