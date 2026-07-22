// Состояние ОБОЛОЧКИ: какой экран приложения открыт. Сознательно отдельно от runStore —
// по границе из CLAUDE.md (mode shell ≠ RunConfig ≠ engine): уход на страницу настроек
// или в справочник не трогает забег, забег остаётся в своём сторе и возвращается как был.
//
// Роутера нет и не заводим: static-first, деплой под сабпуть (GitHub Pages), а видов
// единицы. Синхронизируемся с location.hash — тогда работает кнопка «назад» браузера
// (на телефоне это единственный способ выйти со страницы) и ссылку можно переслать.
import { create } from "zustand";

export type AppView = "game" | "settings" | "heroes" | "teammates" | "career";

const VIEWS: AppView[] = ["settings", "heroes", "teammates", "career"];

/** hash → вид. Незнакомый хеш = игра, а не 404: ссылка из будущей версии не должна ломать. */
export function viewFromHash(hash: string): AppView {
  const name = hash.replace(/^#\/?/, "");
  return VIEWS.includes(name as AppView) ? (name as AppView) : "game";
}

function hashForView(view: AppView): string {
  return view === "game" ? "" : `#/${view}`;
}

/** Новый экран не должен наследовать scrollY длинного справочника/турнирной страницы. */
function scrollToViewStart() {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

interface ShellStore {
  view: AppView;
  setView: (view: AppView) => void;
  /** Прямой вход без внутренней истории: заменить текущий URL родительским экраном. */
  replaceView: (view: AppView) => void;
  /** Синхронизация из адресной строки (кнопка «назад»). */
  syncFromHash: () => void;
}

export const useShell = create<ShellStore>((set, get) => ({
  view: typeof window === "undefined" ? "game" : viewFromHash(window.location.hash),

  setView(view) {
    if (get().view === view) return;
    const from = get().view;
    set({ view });
    if (typeof window === "undefined") return;
    const next = hashForView(view);
    // Именно pushState: каждый переход — запись в истории, иначе «назад» уводит из приложения.
    // В state кладём метку: по ней кнопка «назад» Telegram отличает «есть куда возвращаться
    // внутри приложения» от «открыли сразу этот экран по ссылке» (src/tma/useTelegramShell).
    window.history.pushState({ aegisView: view, aegisFrom: from }, "", next || window.location.pathname + window.location.search);
    scrollToViewStart();
  },

  replaceView(view) {
    if (get().view === view) return;
    set({ view });
    if (typeof window === "undefined") return;
    const next = hashForView(view);
    // Прямо открытый дочерний экран не имеет внутреннего predecessor. Replace не создаёт
    // цикл heroes → settings → heroes при следующем Back.
    window.history.replaceState({ aegisView: view, aegisFrom: null }, "", next || window.location.pathname + window.location.search);
    scrollToViewStart();
  },

  syncFromHash() {
    if (typeof window === "undefined") return;
    set({ view: viewFromHash(window.location.hash) });
    scrollToViewStart();
  },
}));
