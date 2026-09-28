import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./global.css";
import "./i18n";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";

// No browser context menu (Reload / Inspect / Save as…) in the desktop app.
// Text fields keep theirs so copy/paste and spell-check suggestions still work.
document.addEventListener('contextmenu', e => {
  const el = e.target as HTMLElement | null;
  const editable = el?.closest('input, textarea, [contenteditable="true"]');
  if (!editable) e.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
