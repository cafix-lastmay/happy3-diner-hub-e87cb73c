// Persistent view-mode preference for staff/manager/owner dashboards.
// Applies as `data-view-mode` on <html> so global CSS in styles.css can
// force real layout changes (column counts, font sizes, sidebar visibility).
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ViewMode = "mobile" | "tablet" | "laptop";

const STORAGE_KEY = "cafix.view_mode";

interface Ctx {
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
}

const ViewModeCtx = createContext<Ctx>({ mode: "mobile", setMode: () => {} });

function applyAttr(mode: ViewMode) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-view-mode", mode);
}

export function ViewModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ViewMode>("mobile");

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      const initial: ViewMode = (v === "mobile" || v === "tablet" || v === "laptop") ? v : "mobile";
      setModeState(initial);
      applyAttr(initial);
    } catch { applyAttr("mobile"); }
  }, []);

  const setMode = (m: ViewMode) => {
    setModeState(m);
    applyAttr(m);
    try { localStorage.setItem(STORAGE_KEY, m); } catch { /* ignore */ }
  };

  return <ViewModeCtx.Provider value={{ mode, setMode }}>{children}</ViewModeCtx.Provider>;
}

export function useViewMode() { return useContext(ViewModeCtx); }

// Kept for backwards-compat with DashboardShell import; real layout work now
// happens via the global CSS rules keyed on html[data-view-mode].
export function viewModeContainerClass(_mode: ViewMode) {
  return "";
}
