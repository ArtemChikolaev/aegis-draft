// Детерминированная математика игровой логики (M24 — сим Аркады, M25 — и драфтовые режимы). `Math.sin/cos/atan2/hypot/
// log/exp/pow` в JS «implementation-approximated»: V8 (Chrome, Node) и JavaScriptCore (Safari, WebView на iPhone) расходятся
// в последнем бите, а сравнения разносят эту разницу — забег Аркады расходился за 2–5 минут, исход матча турнира или
// зарплата Manager могли отличаться между устройствами. Здесь только `+ − × ÷`, `Math.round` и `Math.sqrt`: они точны по
// IEEE 754 и дают один бит в любом движке. Точность — около 1e-12, ниже любой видимой в игре разницы.

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

const LN2 = 0.6931471805599453;
const LN10 = 2.302585092994046;

/** ln x при x > 0: x = m·2^e (m ∈ [1, 2)) — умножения на 2 и ½ точны, ln m = 2·atanh((m − 1)/(m + 1)) рядом (z < ⅓). */
export function dlog(x: number): number {
  if (!(x > 0)) return x === 0 ? -Infinity : NaN;
  if (x === Infinity) return Infinity;
  let e = 0, m = x;
  while (m >= 2) { m *= 0.5; e++; }
  while (m < 1) { m *= 2; e--; }
  const z = (m - 1) / (m + 1), z2 = z * z;
  let sum = 0;
  for (let n = 41; n >= 1; n -= 2) sum = 1 / n + z2 * sum;
  return 2 * z * sum + e * LN2;
}

/** e^x: x = k·ln2 + r (|r| ≤ ½ln2), e^r — рядом Тейлора, 2^k — точными умножениями на 2 (или ½). */
export function dexp(x: number): number {
  if (x !== x) return NaN;
  if (x > 709) return Infinity;
  if (x < -745) return 0;
  const k = Math.round(x / LN2);
  const r = x - k * LN2;
  let term = 1, sum = 1;
  for (let n = 1; n <= 22; n++) { term *= r / n; sum += term; }
  const f = k > 0 ? 2 : 0.5;
  for (let i = 0, n = Math.abs(k); i < n; i++) sum *= f;
  return sum;
}

/** x^y при x ≥ 0 (0^y — как у Math.pow для y ≥ 0); отрицательное основание игровой логике не нужно — NaN. */
export function dpow(x: number, y: number): number {
  if (y === 0) return 1;
  if (x === 0) return y > 0 ? 0 : Infinity;
  if (x < 0) return NaN;
  if (x === 10) return dexp(y * LN10);
  return dexp(y * dlog(x));
}

/** ⌈log₂ n⌉ для n ≥ 1 — наименьшее k, при котором 2^k ≥ n (размер сетки, число раундов); целочисленно. */
export function ceilLog2(n: number): number {
  let k = 0;
  for (let p = 1; p < n; p *= 2) k++;
  return k;
}

/** x^n при целом n — умножениями (возведение квадратами), а не `**`: у того в JS тоже нет требования точности. */
export function ipow(x: number, n: number): number {
  let r = 1, b = x, k = Math.abs(n);
  while (k > 0) {
    if (k % 2 === 1) r *= b;
    b *= b;
    k = Math.floor(k / 2);
  }
  return n < 0 ? 1 / r : r;
}
