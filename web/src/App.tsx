import { useEffect } from "react";
import { useRun } from "./state/runStore.ts";
import { StartScreen } from "./ui/StartScreen.tsx";
import { DraftScreen } from "./ui/DraftScreen.tsx";
import { ResultScreen } from "./ui/ResultScreen.tsx";

export function App() {
  const phase = useRun((s) => s.phase);
  const error = useRun((s) => s.error);
  const loadData = useRun((s) => s.loadData);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <div className="app">
      <header className="app__brand">
        <span className="brand-322">322</span>
        <span className="brand-dash">—</span>
        <span className="brand-0">0</span>
        <span className="brand-name">· Aegis Draft</span>
      </header>

      {error && <div className="banner banner--error">Ошибка: {error}</div>}

      {phase === "loading" && <div className="center muted">Загрузка данных…</div>}
      {phase === "start" && <StartScreen />}
      {phase === "draft" && <DraftScreen />}
      {phase === "result" && <ResultScreen />}
    </div>
  );
}
