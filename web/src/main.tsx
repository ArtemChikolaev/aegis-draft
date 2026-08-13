import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.tsx";
import { AppProviders } from "./app/providers.tsx";
import { startConnectivityWatch } from "./state/connectivity.ts";
import "./debug/gameLog.ts";
import "./design/tokens.css";
import "./design/breakpoints.css";
import "./design/base.css";

// События сети слушаем до первого рендера: карточка режима, которому нужен интернет, обязана
// показать причину сразу, а не после того, как игрок туда ткнётся.
startConnectivityWatch();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
);
