// Чтение статического JSON Аркады (меты листов, индексы листов и звуков) с различением «файла нет» и «сеть упала».
// Раньше любой сбой `fetch` запоминался как отсутствие до перезагрузки страницы: один потерянный пакет — и герой весь
// забег без листа либо вся сессия без звуков Dota (аудит 2026-09-19). Теперь «нет» — только подтверждённое сервером
// 404/410; сетевая ошибка, 5xx и оборванное тело повторяются с бэк-оффом, а после исчерпания попыток вызывающий
// получает `error` и сам решает, когда пробовать снова (кэшировать это как «нет» нельзя).
export type Fetched<T> = { kind: "ok"; value: T } | { kind: "missing" } | { kind: "error" };

/** Паузы между попытками, мс: всего попыток — на одну больше. */
export const RETRY_DELAYS: readonly number[] = [400, 1200];

const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

export async function fetchJsonRetry<T>(url: string, delays: readonly number[] = RETRY_DELAYS, wait: (ms: number) => Promise<void> = sleep): Promise<Fetched<T>> {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(url);
      if (r.ok) return { kind: "ok", value: (await r.json()) as T };
      if (r.status === 404 || r.status === 410) return { kind: "missing" };
    } catch {
      /* сеть или битое тело — повторяем */
    }
    if (attempt >= delays.length) return { kind: "error" };
    await wait(delays[attempt]);
  }
}

/** Пауза перед новой серией попыток после сетевого сбоя, мс. */
export const RETRY_COOLDOWN = 8000;

/**
 * Лениво читаемый JSON-индекс (звуки Dota): `value` — null, пока не прочитан. 404 — индекса нет, берётся `empty`
 * (окончательно); сетевой сбой после повторов значением НЕ становится — следующий `load()` после паузы пробует снова.
 * Раньше единичный сбой `fetch` подставлял пустой индекс, и звуки Dota молчали до перезагрузки страницы.
 */
export class LazyJson<T> {
  value: T | null = null;
  private job: Promise<void> | null = null;
  private retryAt = 0;
  private waiters: (() => void)[] = [];
  constructor(private readonly url: string, private readonly empty: T) {}

  /** Начать чтение, если значения ещё нет, чтение не идёт и пауза после сбоя вышла. Дёшево — можно звать из кадра. */
  load(): void {
    if (this.value !== null || this.job || typeof fetch === "undefined" || Date.now() < this.retryAt) return;
    this.job = fetchJsonRetry<T>(this.url).then((got) => {
      this.job = null;
      if (got.kind === "error") { this.retryAt = Date.now() + RETRY_COOLDOWN; return; }
      this.value = got.kind === "ok" ? got.value : this.empty;
      for (const cb of this.waiters.splice(0)) cb();
    });
  }

  /** Выполнить, когда индекс прочитан (сразу, если уже есть); переживает неудачные серии попыток. */
  whenReady(cb: () => void): void {
    if (this.value !== null) { cb(); return; }
    this.waiters.push(cb);
    this.load();
  }
}
