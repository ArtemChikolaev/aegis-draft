// Связность: есть ли НАСТОЯЩИЙ интернет прямо сейчас. Нужна режимам, которым сеть обязательна
// по смыслу (Arena — PRD §5.12); одиночная игра от неё не зависит и никогда ей не гейтится.
//
// Почему не `navigator.onLine`: он валиден ТОЛЬКО как отрицательный сигнал. В самолётном Wi-Fi и
// за любым captive-portal он `true` при отсутствии интернета — ровно тот случай, с которого
// началась веха M11. Отсюда правило (ADR 0003): `false` ⇒ офлайн и в сеть не ходим вовсе,
// `true` ⇒ не доказано ничего, нужен пробник.
//
// Живёт в state/, а не в data/api/: это состояние приложения (его читают экраны), а сам HTTP —
// в `data/api` (`pingHealth`). Стор своей проверки сети не изобретает и не знает про fetch.
import { create } from "zustand";
import { isApiConfigured, pingHealth } from "../data/api/index.ts";

/** Вердикт. `unknown` — «проверить нечем»: браузер говорит, что сеть есть, но пробника нет
 *  (API не сконфигурен). Это НЕ «онлайн»: обещать связь, которую не проверяли, нельзя. */
export type Connectivity = "online" | "offline" | "unknown";

/** Потолок ожидания пробника. Молчащий сервер должен давать вердикт, а не вечный спиннер. */
export const PROBE_TIMEOUT_MS = 3000;
/** Насколько свежий вердикт переиспользуется без повторного запроса. */
const FRESH_MS = 15_000;

export interface ProbeDeps {
  onLine: () => boolean;
  /** Запрос, доказывающий связь. `null` — проверять нечем ⇒ вердикт `unknown`. */
  probe: ((signal: AbortSignal) => Promise<boolean>) | null;
  timeoutMs?: number;
}

/** Чистое ядро проверки: вся политика здесь, поэтому тестируется без сети и без браузера. */
export async function probeConnectivity(deps: ProbeDeps): Promise<Connectivity> {
  const { onLine, probe, timeoutMs = PROBE_TIMEOUT_MS } = deps;
  if (!onLine()) return "offline";
  if (!probe) return "unknown";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return (await probe(controller.signal)) ? "online" : "offline";
  } catch {
    // Сетевой сбой, отказ и обрыв по таймауту неразличимы для вызывающего и значат одно.
    return "offline";
  } finally {
    clearTimeout(timer);
  }
}

function browserDeps(): ProbeDeps {
  return {
    onLine: () => (typeof navigator === "undefined" ? true : navigator.onLine),
    // Пока API не задан (VITE_API_BASE пуст), проверять нечем: своя статика ответила бы из
    // кэша и доказала бы несуществующую связь. Честный вердикт в этом случае — `unknown`.
    probe: isApiConfigured() ? (signal) => pingHealth(signal) : null,
  };
}

interface ConnectivityStore {
  /** Последний вердикт. Во время повторной проверки НЕ сбрасывается — иначе экран мигал бы
   *  между «нет соединения» и обычным состоянием на каждом ретрае. */
  status: Connectivity;
  /** Идёт ли проверка прямо сейчас (для состояния кнопки «проверить снова»). */
  checking: boolean;
  /** Время последнего вердикта (мс). 0 — не проверяли ни разу. */
  checkedAt: number;
  /** Проверить связь. Свежий вердикт переиспользуется; `force` — игнорировать свежесть. */
  check: (options?: { force?: boolean }) => Promise<Connectivity>;
}

export const useConnectivity = create<ConnectivityStore>((set, get) => {
  // Параллельные вызовы (эффект экрана + событие `online`) не должны плодить запросы.
  let inFlight: Promise<Connectivity> | null = null;
  return {
    // Синхронно, по образцу флагов TMA: `navigator.onLine === false` — единственный сигнал,
    // которому верим без запроса, и он обязан быть виден на ПЕРВОМ кадре. Иначе карточка режима
    // сначала обещает «Скоро», а переобувается уже после того, как игрок в неё ткнул.
    // `checkedAt` при этом 0: вердикт не подтверждён пробником, вход в режим его перепроверит.
    status: typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "unknown",
    checking: false,
    checkedAt: 0,

    check(options) {
      const { status, checkedAt } = get();
      if (!options?.force && checkedAt > 0 && Date.now() - checkedAt < FRESH_MS) {
        return Promise.resolve(status);
      }
      if (inFlight) return inFlight;
      set({ checking: true });
      inFlight = (async () => {
        try {
          const next = await probeConnectivity(browserDeps());
          set({ status: next, checkedAt: Date.now() });
          return next;
        } finally {
          set({ checking: false });
          inFlight = null;
        }
      })();
      return inFlight;
    },
  };
});

let watching = false;

/** Подписка на события браузера. Идемпотентна (StrictMode/HMR монтируют дважды).
 *  `offline` — единственный сигнал, которому верим без запроса; `online` требует перепроверки. */
export function startConnectivityWatch(): void {
  if (watching || typeof window === "undefined") return;
  watching = true;
  window.addEventListener("offline", () => {
    useConnectivity.setState({ status: "offline", checkedAt: Date.now() });
  });
  window.addEventListener("online", () => {
    void useConnectivity.getState().check({ force: true });
  });
  document.addEventListener("visibilitychange", () => {
    // Возврат на вкладку — типичный момент смены сети (вышли из самолётного режима).
    if (document.visibilityState === "visible") void useConnectivity.getState().check();
  });
}
