// Детерминированный ГПСЧ для воспроизводимых забегов (скилл scoring-model: детерминизм по сиду).
// Один и тот же сид ⇒ одна и та же последовательность паков (нужно для дейликов и шеринга).

/** xmur3 — хеш строки в 32-битный сид. */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** mulberry32 — быстрый PRNG из 32-битного состояния. */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Детерминированный источник случайности, инициализируемый строковым сидом. */
export class Rng {
  readonly seed: string;
  private next01: () => number;
  constructor(seed: string) {
    this.seed = seed;
    const seedFn = xmur3(seed);
    this.next01 = mulberry32(seedFn());
  }
  /** float в [0,1). */
  float(): number {
    return this.next01();
  }
  /** целое в [0, n). */
  int(n: number): number {
    return Math.floor(this.float() * n);
  }
  /** случайный элемент массива. */
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }
  /** копия массива, перемешанная по Фишеру–Йетсу (детерминированно). */
  shuffle<T>(arr: readonly T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}
