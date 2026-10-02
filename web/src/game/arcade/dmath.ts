// Детерминированная тригонометрия сима (M24). `Math.sin/cos/atan2/hypot` в JS «implementation-approximated»: V8 (Chrome,
// Node) и JavaScriptCore (Safari, WebView на iPhone) расходятся в последнем бите, а сим через сравнения расстояний
// разносит эту разницу — забег расходился за 2–5 минут, и реплей или дейлик с iPhone не воспроизводился на десктопе.
// Здесь только `+ − × ÷`, `Math.round` и `Math.sqrt`: они точны по IEEE 754 и дают один бит в любом движке.
// Точность — около 1e-12: для координат мира в тысячи пикселей это ниже любой разницы, видимой в игре.

const PI = Math.PI;
const HALF_PI = PI / 2;
const QUARTER_PI = PI / 4;
// tan(π/8) — граница второй редукции арктангенса.
const TAN_PI_8 = Math.SQRT2 - 1;

/** sin x при |x| ≤ π/2: ряд Тейлора до x¹⁷ (остаток < 2e-13). */
function sinCore(x: number): number {
  const x2 = x * x;
  return x * (1 + x2 * (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040 + x2 * (1 / 362880 + x2 * (-1 / 39916800 + x2 * (1 / 6227020800 + x2 * (-1 / 1307674368000 + x2 * (1 / 355687428096000)))))))));
}

/** sin x для любого x: сдвиг на целое число π (знак — по чётности), дальше ряд на [−π/2, π/2]. */
export function dsin(x: number): number {
  const k = Math.round(x / PI);
  const r = x - k * PI;
  const s = sinCore(r);
  return k % 2 === 0 ? s : -s;
}

/** cos x = sin(x + π/2). */
export function dcos(x: number): number {
  return dsin(x + HALF_PI);
}

/** atan t при 0 ≤ t ≤ tan(π/8): ряд до t²⁹ (остаток < 1e-13). */
function atanCore(t: number): number {
  const t2 = t * t;
  let sum = 0;
  for (let n = 29; n >= 1; n -= 2) sum = (n % 4 === 1 ? 1 : -1) / n + t2 * sum;
  return t * sum;
}

/** atan t при t ≥ 0: t > 1 — через π/2 − atan(1/t); t > tan(π/8) — через π/4 + atan((t − 1)/(t + 1)). */
function atanPos(t: number): number {
  if (t > 1) return HALF_PI - atanPos(1 / t);
  if (t > TAN_PI_8) return QUARTER_PI + atanCore((t - 1) / (t + 1));
  return atanCore(t);
}

/** atan2(y, x) с теми же четвертями, что у `Math.atan2` (atan2(0, 0) = 0). */
export function datan2(y: number, x: number): number {
  if (x === 0 && y === 0) return 0;
  if (x === 0) return y > 0 ? HALF_PI : -HALF_PI;
  const a = atanPos(Math.abs(y / x));
  if (x > 0) return y >= 0 ? a : -a;
  return y >= 0 ? PI - a : a - PI;
}

/** √(x² + y²) — через `Math.sqrt`, а не `Math.hypot` (у того в JS нет требования точности). */
export function dhypot(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}
