// Шеринг забега ссылкой (T3.12, закрывает хвост T3.9). Ссылка несёт УСЛОВИЯ забега, а не его
// результат: seed + config + версии. Получатель открывает её и получает ТЕ ЖЕ паки, но драфтит
// сам — это «челлендж по сиду» в духе Balatro, а не запись чужого прохождения.
//
// Границы (game-state-architecture): здесь только кодек и проверка совместимости. Ничего не
// стартует и не трогает сторы — решение «что делать со ссылкой» принимает runStore/UI, потому
// что там же живёт незавершённый забег, который нельзя молча затереть.
//
// Формат данных сознательно тот же, что у сейва (state/runPersist.SavedRun): и там, и там
// вопрос один — «воспроизводим ли забег на этом датасете». Проверку версий не дублируем.
import type { RunConfig } from "../game/packs.ts";
import type { RunMode } from "./runPersist.ts";

/** Полезная нагрузка ссылки. Ключи короткие: попадают в URL. */
export interface RunLink {
  v: 1;
  /** schemaVersion датасета на момент создания ссылки. */
  s: number;
  /** ratingModelVersion на момент создания ссылки. */
  r: string;
  mode: RunMode;
  config: RunConfig;
  seed: string;
}

/** Почему ссылка не воспроизводима. Разные причины — разные объяснения игроку. */
export type RunLinkIssue = "schema" | "model";

/** Результат проверки кода, вставленного на экране настроек (T3.14). */
export type RunLinkInputIssue = "invalid" | RunLinkIssue | "mode" | "config";

export interface RunLinkInputValidation {
  link: RunLink | null;
  issue: RunLinkInputIssue | null;
}

const HASH_PREFIX = "#/run=";
/** Поле не должно превращаться в неограниченный base64/JSON-парсер. Реальная ссылка
 *  сейчас короче 500 символов; 2048 оставляет большой запас для будущих полей. */
export const MAX_RUN_LINK_INPUT_LENGTH = 2048;
/** JSON не умеет Infinity (Easy = бесконечные рероллы): stringify даёт null, и забег
 *  восстанавливается с нулём рероллов. Та же грабля уже поймана в runPersist —
 *  кодируем явным сторожевым числом. */
const INFINITE_REROLLS = -1;

function encodeRerolls(rerolls: number): number {
  return Number.isFinite(rerolls) ? rerolls : INFINITE_REROLLS;
}

function decodeRerolls(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  if (value === INFINITE_REROLLS) return Infinity;
  return value === 0 || value === 1 || value === 2 ? value : null;
}

/** base64url без паддинга — безопасен в hash, не требует percent-encoding. */
function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): string | null {
  try {
    const padded = text.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export function encodeRunLink(link: RunLink): string {
  const payload = {
    v: link.v,
    s: link.s,
    r: link.r,
    m: link.mode,
    d: link.config.draftStyle,
    f: link.config.format,
    n: encodeRerolls(link.config.rerolls),
    c: link.config.scoring,
    a: link.config.allocation,
    // Хардкор пишем только когда включён — короче ссылка, и старые ссылки читаются как false.
    ...(link.config.hardMode ? { h: 1 } : {}),
    seed: link.seed,
  };
  return toBase64Url(JSON.stringify(payload));
}

/** Разбор полезной нагрузки. Любая кривизна → null: битая ссылка не должна ронять приложение. */
export function decodeRunLink(encoded: string): RunLink | null {
  const json = fromBase64Url(encoded);
  if (!json) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!raw || raw.v !== 1) return null;
  const rerolls = decodeRerolls(raw.n);
  const seed = typeof raw.seed === "string" && raw.seed.trim() ? raw.seed : null;
  if (rerolls === null || !seed) return null;
  if (typeof raw.s !== "number" || !Number.isInteger(raw.s) || raw.s < 1 || typeof raw.r !== "string" || !raw.r) return null;
  if (raw.m !== "classic" && raw.m !== "manager" && raw.m !== "tournament") return null;
  if (raw.d !== "team" && raw.d !== "mixed") return null;
  if (raw.c !== "event" && raw.c !== "peak") return null;
  if (raw.a !== "auto" && raw.a !== "manual") return null;
  if (raw.f !== "last_1y" && raw.f !== "last_2y" && raw.f !== "last_5y" && raw.f !== "valve_legacy") return null;
  if (raw.h !== undefined && raw.h !== 1) return null;
  return {
    v: 1,
    s: raw.s,
    r: raw.r,
    mode: raw.m,
    seed,
    config: {
      draftStyle: raw.d,
      format: raw.f as RunConfig["format"],
      rerolls,
      scoring: raw.c,
      allocation: raw.a,
      // Ключ только когда хардкор включён — симметрично кодеру. Иначе декодер ДОБАВЛЯЛ бы
      // hardMode:false в конфиг, которого там не было, и round-trip переставал быть точным.
      ...(raw.h === 1 ? { hardMode: true } : {}),
    },
  };
}

export function runLinkHash(link: RunLink): string {
  return HASH_PREFIX + encodeRunLink(link);
}

/** Полный URL для копирования. Держит сабпуть деплоя (GitHub Pages) и существующий query. */
export function runLinkUrl(link: RunLink, origin: string, pathname: string): string {
  return `${origin}${pathname}${runLinkHash(link)}`;
}

/** Ссылка ли это на забег. Незнакомый хеш — не ссылка, и это не ошибка (см. viewFromHash). */
export function runLinkFromHash(hash: string): RunLink | null {
  if (!hash.startsWith(HASH_PREFIX)) return null;
  return decodeRunLink(hash.slice(HASH_PREFIX.length));
}

/**
 * Разобрать ввод на экране настроек: принимаем как короткий код, так и целиком
 * скопированную ссылку. Это тот же payload T3.12 — отдельного типа seed/хранилища нет.
 */
export function runLinkFromInput(input: string): RunLink | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > MAX_RUN_LINK_INPUT_LENGTH) return null;
  let encoded = trimmed;
  if (trimmed.startsWith(HASH_PREFIX)) {
    encoded = trimmed.slice(HASH_PREFIX.length);
  } else if (trimmed.includes(HASH_PREFIX)) {
    try {
      const url = new URL(trimmed);
      if ((url.protocol !== "https:" && url.protocol !== "http:") || !url.hash.startsWith(HASH_PREFIX)) return null;
      encoded = url.hash.slice(HASH_PREFIX.length);
    } catch {
      return null;
    }
  }
  // В полноценной ссылке после payload ничего быть не должно. Ранний guard также не даёт
  // atob молча принять base64-префикс от строки с пробелами/параметрами.
  if (!encoded || /[\s#?&]/.test(encoded)) return null;
  return decodeRunLink(encoded);
}

/** Убрать ссылку из адресной строки после того, как её обработали. Единственная функция
 *  здесь с побочным эффектом — иначе перезагрузка страницы снова показывала бы уже
 *  отвеченное предложение, а «назад» возвращал в него же. replaceState, не pushState:
 *  запись в истории не нужна, мы не переходили на новый экран. */
export function clearRunLinkHash(): void {
  if (typeof window === "undefined") return;
  if (!window.location.hash.startsWith(HASH_PREFIX)) return;
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}

/**
 * Воспроизводима ли ссылка на текущем датасете.
 *
 * Намеренно НЕ сверяем `dataBuiltAt`, в отличие от сейва: датасет пересобирается кроном
 * ежедневно, и по builtAt любая присланная ссылка протухала бы за сутки. Значимо только то,
 * что меняет паки и счёт: версия схемы данных и версия модели рейтингов.
 */
export function runLinkIssue(
  link: RunLink,
  schemaVersion: number,
  ratingModelVersion: string,
): RunLinkIssue | null {
  if (link.s !== schemaVersion) return "schema";
  if (link.r !== ratingModelVersion) return "model";
  return null;
}

/** hardMode до T3.10 был опциональным; отсутствие ключа и false — один и тот же конфиг. */
export function runConfigsMatch(left: RunConfig, right: RunConfig): boolean {
  return left.draftStyle === right.draftStyle
    && left.format === right.format
    && left.rerolls === right.rerolls
    && left.scoring === right.scoring
    && left.allocation === right.allocation
    && (left.hardMode ?? false) === (right.hardMode ?? false);
}

/**
 * Полная проверка введённого кода для StartScreen. Порядок причин намеренный:
 * сперва целостность, затем версии (забег в принципе невоспроизводим), затем режим/настройки.
 * Пустой ввод — штатный случайный запуск, поэтому это не ошибка.
 */
export function validateRunLinkInput(
  input: string,
  mode: RunMode,
  config: RunConfig,
  schemaVersion: number,
  ratingModelVersion: string,
): RunLinkInputValidation {
  if (!input.trim()) return { link: null, issue: null };
  const link = runLinkFromInput(input);
  if (!link) return { link: null, issue: "invalid" };
  const versionIssue = runLinkIssue(link, schemaVersion, ratingModelVersion);
  if (versionIssue) return { link, issue: versionIssue };
  if (link.mode !== mode) return { link, issue: "mode" };
  if (!runConfigsMatch(link.config, config)) return { link, issue: "config" };
  return { link, issue: null };
}
