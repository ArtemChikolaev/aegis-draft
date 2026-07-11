import { useState } from "react";
import { useRun } from "../state/runStore.ts";
import type { RunConfig, DraftStyle, Scoring, Allocation } from "../game/packs.ts";
import type { Format } from "../types/data.ts";

interface Opt<T> {
  value: T;
  label: string;
  hint?: string;
  soon?: boolean;
}

const DRAFT: Opt<DraftStyle>[] = [
  { value: "team", label: "Team Packs", hint: "Пак = ростер команды. Берёшь одного игрока." },
  { value: "mixed", label: "Mixed Draft", hint: "5 игроков из разных команд. Порядок 1→5." },
];
const FORMAT: Opt<Format>[] = [
  { value: "last_1y", label: "Последний год" },
  { value: "last_2y", label: "2 года", hint: "Standard" },
  { value: "last_5y", label: "5 лет" },
  { value: "valve_legacy", label: "Valve Legacy", hint: "Все TI + Valve Major" },
];
const DIFFICULTY: Opt<number>[] = [
  { value: 0, label: "Hard", hint: "0 рерроллов" },
  { value: 1, label: "Normal", hint: "1 реролл" },
  { value: 2, label: "Smurfing", hint: "2 реролла" },
  { value: Infinity, label: "Easy", hint: "∞ рерроллов" },
];
const SCORING: Opt<Scoring>[] = [
  { value: "event", label: "Event Rating", hint: "Форма на событии" },
  { value: "peak", label: "Peak Rating", hint: "Career-best (окно)", soon: true },
];
const ALLOCATION: Opt<Allocation>[] = [
  { value: "auto", label: "Automatic", hint: "Герой матчится под игрока" },
  { value: "manual", label: "Manual", hint: "Раздаёшь героев сам", soon: true },
];

function Group<T>(props: {
  title: string;
  options: Opt<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <section className="group">
      <h3 className="group__title">{props.title}</h3>
      <div className="group__opts">
        {props.options.map((o) => (
          <button
            key={String(o.value)}
            className={`opt ${o.value === props.value ? "opt--on" : ""} ${o.soon ? "opt--soon" : ""}`}
            onClick={() => onSelect(o, props.onChange)}
          >
            <span className="opt__label">
              {o.label}
              {o.soon && <span className="opt__badge">SOON</span>}
            </span>
            {o.hint && <span className="opt__hint">{o.hint}</span>}
          </button>
        ))}
      </div>
    </section>
  );
}

function onSelect<T>(o: Opt<T>, onChange: (v: T) => void) {
  if (o.soon) return; // ещё не реализовано
  onChange(o.value);
}

export function StartScreen() {
  const start = useRun((s) => s.start);
  const formats = useRun((s) => s.data?.manifest.formats ?? []);
  const [cfg, setCfg] = useState<RunConfig>({
    draftStyle: "team",
    format: "last_2y",
    rerolls: 1,
    scoring: "event",
    allocation: "auto",
  });

  const set = <K extends keyof RunConfig>(k: K, v: RunConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));
  const formatAvailable = (f: Format) => formats.includes(f);

  const onStart = () => {
    const seed = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    start(cfg, seed);
  };

  return (
    <main className="start">
      <p className="tagline">Собери ростер всех времён. Пройди International всухую.</p>

      <Group title="Draft Style" options={DRAFT} value={cfg.draftStyle} onChange={(v) => set("draftStyle", v)} />
      <Group
        title="Format"
        options={FORMAT.map((o) => ({ ...o, soon: !formatAvailable(o.value) }))}
        value={cfg.format}
        onChange={(v) => set("format", v)}
      />
      <Group title="Difficulty" options={DIFFICULTY} value={cfg.rerolls} onChange={(v) => set("rerolls", v)} />
      <Group title="Scoring" options={SCORING} value={cfg.scoring} onChange={(v) => set("scoring", v)} />
      <Group title="Player — Hero Allocation" options={ALLOCATION} value={cfg.allocation} onChange={(v) => set("allocation", v)} />

      <button className="start__btn" onClick={onStart}>Start Run</button>
      {!formatAvailable(cfg.format) && (
        <p className="muted small">Этот формат ещё не наполнен в текущем датасете. Выбери доступный (без бейджа SOON).</p>
      )}
    </main>
  );
}
