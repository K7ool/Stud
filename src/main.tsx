import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { useSettingsStore } from "./stores/settings";

useSettingsStore.getState().applyTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
