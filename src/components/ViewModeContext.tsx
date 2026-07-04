// Persistent view-mode preference for staff/manager/owner dashboards.
// Choices: "mobile" (single column, ~448px), "tablet" (~768px), "laptop" (full width).
// Stored in localStorage per-device. Default: "mobile".
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ViewMode = "mobile" | "tablet" | "laptop";

const STORAGE_KEY = "cafix.view_mode";

interface Ctx {
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
}

const ViewModeCtx = createContext<Ctx>({ mode: "mobile", setMode: () => {} });

export function ViewModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ViewMode>("mobile");

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "mobile" || v === "tablet" || v === "laptop") setModeState(v);
    } catch { /* ignore */ }
  }, []);

  const setMode = (m: ViewMode) => {
    setModeState(m);
    try { localStorage.setItem(STORAGE_KEY, m); } catch { /* ignore */ }
  };

  return <ViewModeCtx.Provider value={{ mode, setMode }}>{children}</ViewModeCtx.Provider>;
}

export function useViewMode() { return useContext(ViewModeCtx); }

export function viewModeContainerClass(mode: ViewMode) {
  if (mode === "mobile") return "max-w-md mx-auto";
  if (mode === "tablet") return "max-w-3xl mx-auto";
  return ""; // laptop: full width
}
