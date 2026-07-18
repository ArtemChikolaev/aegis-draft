import { useEffect, useId, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import type { PlayerProfile } from "../types/data.ts";
import styles from "./PlayerPicker.module.css";

const MAX_SUGGESTIONS = 8;
const MIN_QUERY = 2;

/** Prefix first, then contains. Stable input order keeps equally relevant nicknames predictable. */
export function findPlayerMatches(players: readonly PlayerProfile[], query: string, limit = MAX_SUGGESTIONS): PlayerProfile[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < MIN_QUERY || limit <= 0) return [];

  const starts: PlayerProfile[] = [];
  const contains: PlayerProfile[] = [];
  for (const player of players) {
    const nickname = player.nickname.toLowerCase();
    if (nickname.startsWith(needle)) starts.push(player);
    else if (nickname.includes(needle)) contains.push(player);
  }
  return [...starts, ...contains].slice(0, limit);
}

/**
 * Выбор про-игрока из ~5 тысяч. Обычный `<select>` тут нерабочий, а датасет слишком
 * большой, чтобы показывать список без запроса, — поэтому комбобокс: печатаешь ник,
 * получаешь до восьми совпадений. Список открывается только с двух символов: на одной
 * букве совпадений сотни, и это бесполезная стена.
 */
export function PlayerPicker({
  className,
  players,
  value,
  onPick,
  onClear,
  label,
  placeholder,
  clearLabel,
  shortQueryLabel,
  noResultsLabel,
  accountLabel,
}: {
  /** Размещение в сетке экрана задаёт вызывающий — примитив о чужой раскладке не знает. */
  className?: string;
  players: PlayerProfile[];
  value: PlayerProfile | null;
  onPick: (player: PlayerProfile) => void;
  onClear: () => void;
  label: string;
  placeholder: string;
  clearLabel: string;
  shortQueryLabel: string;
  noResultsLabel: string;
  accountLabel: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chosenRef = useRef<HTMLButtonElement>(null);
  const focusAfterPick = useRef(false);
  const focusAfterClear = useRef(false);
  const id = useId();
  const panelId = `${id}-panel`;

  const matches = useMemo(() => findPlayerMatches(players, query), [players, query]);
  const queryReady = query.trim().length >= MIN_QUERY;
  const activePlayer = activeIndex >= 0 ? matches[activeIndex] : undefined;

  const close = () => {
    setOpen(false);
    setActiveIndex(-1);
  };

  const pick = (player: PlayerProfile) => {
    focusAfterPick.current = true;
    setQuery("");
    close();
    onPick(player);
  };

  const clear = () => {
    focusAfterClear.current = true;
    onClear();
  };

  // Клик мимо закрывает список: без этого он висит поверх таблицы и мешает читать.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // После Enter фокус не должен пропасть вместе с input; после очистки возвращаем его в поиск.
  useEffect(() => {
    if (value && focusAfterPick.current) {
      focusAfterPick.current = false;
      chosenRef.current?.focus();
    } else if (!value && focusAfterClear.current) {
      focusAfterClear.current = false;
      inputRef.current?.focus();
    }
  }, [value]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      if (open) event.preventDefault();
      close();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) setOpen(true);
      if (matches.length === 0) return;
      setActiveIndex((current) => {
        if (current < 0) return event.key === "ArrowDown" ? 0 : matches.length - 1;
        return event.key === "ArrowDown"
          ? (current + 1) % matches.length
          : (current - 1 + matches.length) % matches.length;
      });
      return;
    }
    if (event.key === "Enter" && open && activePlayer) {
      event.preventDefault();
      pick(activePlayer);
    }
  };

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close();
  };

  if (value) {
    return (
      <div className={[styles.picker, className].filter(Boolean).join(" ")}>
        <button
          ref={chosenRef}
          type="button"
          className={`${styles.control} ${styles.chosen}`}
          onClick={clear}
          data-testid="player-clear"
          aria-label={`${clearLabel}: ${value.nickname}`}
        >
          <span className={styles.chosenName}>{value.nickname}</span>
          <span className={styles.clear} aria-hidden="true">×</span>
        </button>
      </div>
    );
  }

  return (
    <div className={[styles.picker, className].filter(Boolean).join(" ")} ref={boxRef} onBlur={onBlur}>
      <div className={styles.control}>
        <input
          ref={inputRef}
          className={styles.input}
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-activedescendant={open && activePlayer ? `${id}-option-${activePlayer.accountId}` : undefined}
          aria-label={label}
          autoComplete="off"
          value={query}
          placeholder={placeholder}
          data-testid="player-search"
          onChange={(event) => { setQuery(event.target.value); setOpen(true); setActiveIndex(0); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
      </div>
      {open && (
        <div className={styles.panel} id={panelId} role="listbox">
          {!queryReady ? <p className={styles.message} role="status">{shortQueryLabel}</p> : matches.length === 0 ? (
            <p className={styles.message} role="status">{noResultsLabel}</p>
          ) : (
            <ul className={styles.list}>
              {matches.map((player, index) => {
                const team = latestTeamName(player);
                return (
                  <li
                    key={player.accountId}
                    id={`${id}-option-${player.accountId}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => pick(player)}
                  >
                    <strong>{player.nickname}</strong>
                    <small>{team ? `${team} · ` : ""}{accountLabel} {player.accountId}</small>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function latestTeamName(player: PlayerProfile): string {
  const teams = player.teams ?? [];
  for (let index = teams.length - 1; index >= 0; index -= 1) {
    const name = teams[index]?.teamName?.trim();
    if (name) return name;
  }
  return "";
}
