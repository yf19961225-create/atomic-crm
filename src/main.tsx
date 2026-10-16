import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { AppUpdate } from "./components/romiku/updates/AppUpdate";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppUpdate />
    <App />
    {import.meta.env.VITE_DEPLOYMENT_ENV === "preview" && (
      <div
        aria-label="Preview 数据源"
        className="pointer-events-none fixed bottom-2 right-2 z-50 rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-950 shadow"
      >
        PREVIEW · Supabase {import.meta.env.VITE_SUPABASE_PROJECT_REF}
      </div>
    )}
  </StrictMode>,
);
