// Mobile floating draggable navigation menu with glassmorphism overlay.
// - Draggable FAB that snaps to nearest left/right edge on release.
// - Semi-transparent when idle, fully visible while interacting.
// - Tap to open a blurred overlay listing all nav items.
import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Menu, X, LogOut, Globe } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";

interface NavItem { to: string; label: string; icon: React.ComponentType<{ className?: string }> }

interface Props {
  navItems: NavItem[];
  title: string;
}

const FAB_SIZE = 56;
const MARGIN = 12;
const MOBILE_BOTTOM_CLEARANCE = 104;
const STORAGE_KEY = "floatingNav.pos";

export function FloatingNavMenu({ navItems, title }: Props) {
  const { t, lang, setLang } = useI18n();
  const { signOut, refCode } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [active, setActive] = useState(false); // recently interacted
  const dragInfo = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);
  const idleTimer = useRef<number | null>(null);

  const getViewportBounds = useCallback(() => {
    const viewport = window.visualViewport;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;
    const maxX = Math.max(MARGIN, width - FAB_SIZE - MARGIN);
    const maxY = Math.max(MARGIN, height - FAB_SIZE - MOBILE_BOTTOM_CLEARANCE);
    return { width, height, maxX, maxY };
  }, []);

  const clampPosition = useCallback((x: number, y: number) => {
    const { maxX, maxY } = getViewportBounds();
    return {
      x: Math.min(Math.max(MARGIN, x), maxX),
      y: Math.min(Math.max(MARGIN, y), maxY),
    };
  }, [getViewportBounds]);

  // Initial position: upper part of bottom-right safe area, restore from storage safely.
  useEffect(() => {
    const { width, maxY } = getViewportBounds();
    const fallback = { x: width - FAB_SIZE - MARGIN, y: maxY };

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        setPos(clampPosition(p.x, p.y));
        return;
      }
    } catch { /* noop */ }

    setPos(fallback);
  }, [clampPosition, getViewportBounds]);

  // Keep button visible on viewport/orientation changes.
  useEffect(() => {
    const syncPosition = () => {
      setPos((current) => {
        if (!current) return current;
        return clampPosition(current.x, current.y);
      });
    };

    window.addEventListener("resize", syncPosition);
    window.visualViewport?.addEventListener("resize", syncPosition);
    return () => {
      window.removeEventListener("resize", syncPosition);
      window.visualViewport?.removeEventListener("resize", syncPosition);
    };
  }, [clampPosition]);

  // Mark active briefly to reduce transparency
  const bumpActive = useCallback(() => {
    setActive(true);
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setActive(false), 2200);
  }, []);

  const snapToEdge = useCallback((x: number, y: number) => {
    const { width } = getViewportBounds();
    const snappedX = x + FAB_SIZE / 2 < width / 2 ? MARGIN : width - FAB_SIZE - MARGIN;
    const next = clampPosition(snappedX, y);
    setPos(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* noop */ }
  }, [clampPosition, getViewportBounds]);

  // Trigger haptic vibration if supported (mobile only). Silently no-ops elsewhere.
  const haptic = (pattern: number | number[]) => {
    try { navigator.vibrate?.(pattern); } catch { /* noop */ }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!pos) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragInfo.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y, moved: false };
    setDragging(true);
    bumpActive();
    haptic(10);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragInfo.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) > 5) {
      d.moved = true;
      haptic(15);
    }
    if (d.moved) {
      setPos(clampPosition(d.origX + dx, d.origY + dy));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragInfo.current;
    setDragging(false);
    dragInfo.current = null;
    if (!d) return;
    if (!d.moved) {
      setOpen((v) => {
        haptic(v ? 8 : [12, 30, 12]);
        return !v;
      });
    } else if (pos) {
      snapToEdge(pos.x, pos.y);
      haptic([8, 25, 8]);
    }
    bumpActive();
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  };

  const onLogout = async () => {
    setOpen(false);
    await signOut();
    navigate({ to: "/" });
  };

  if (!pos) return null;

  return (
    <>
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-[60] bg-background/40 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setOpen(false)}
        >
          <div
            className="absolute inset-x-4 top-1/2 -translate-y-1/2 max-h-[80vh] overflow-y-auto rounded-2xl border border-border/40 bg-background/70 backdrop-blur-xl shadow-2xl p-4 animate-in zoom-in-95 fade-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold truncate">{title}</div>
              <button
                onClick={() => setOpen(false)}
                className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-muted transition"
                aria-label="close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {refCode && (
              <div className="mb-3">
                <div className="text-xs text-muted-foreground mb-1">{t("common.ref_code")}</div>
                <Badge variant="outline" className="font-mono">{refCode}</Badge>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl border border-border/30 bg-card/50 hover:bg-accent hover:text-accent-foreground transition-all hover:scale-[1.02]"
                  activeProps={{ className: "bg-accent text-accent-foreground border-accent" }}
                >
                  <item.icon className="h-5 w-5" />
                  <span className="text-xs font-medium text-center leading-tight">{item.label}</span>
                </Link>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-border/30 flex gap-2">
              <button
                onClick={() => setLang(lang === "ar" ? "en" : "ar")}
                className="flex-1 h-10 rounded-lg border border-border/40 bg-card/50 hover:bg-muted flex items-center justify-center gap-2 text-sm transition"
              >
                <Globe className="h-4 w-4" /> {lang === "ar" ? "EN" : "AR"}
              </button>
              <button
                onClick={onLogout}
                className="flex-1 h-10 rounded-lg bg-destructive/90 hover:bg-destructive text-destructive-foreground flex items-center justify-center gap-2 text-sm transition"
              >
                <LogOut className="h-4 w-4" /> {t("common.logout")}
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          left: pos.x,
          top: pos.y,
          width: FAB_SIZE,
          height: FAB_SIZE,
          touchAction: "none",
          transition: dragging ? "opacity 150ms" : "left 250ms cubic-bezier(0.34,1.56,0.64,1), top 250ms cubic-bezier(0.34,1.56,0.64,1), opacity 250ms, transform 150ms",
        }}
        className={`lg:hidden fixed z-[70] rounded-full shadow-xl ring-1 ring-primary-foreground/20 flex items-center justify-center bg-primary/90 text-primary-foreground border border-primary-foreground/20 backdrop-blur-md active:scale-95 ${
          open || dragging || active ? "opacity-100" : "opacity-80"
        }`}
        aria-label="menu"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
    </>
  );
}
