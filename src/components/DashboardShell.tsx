// Shared dashboard shell with sidebar nav (desktop) + floating draggable menu (mobile).
import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Coffee, LogOut, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { FloatingNavMenu } from "@/components/FloatingNavMenu";
import { NotificationsBell } from "@/components/NotificationsBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useI18n } from "@/i18n/I18nProvider";
import { useAuth } from "@/auth/AuthProvider";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { TrialBalanceCard } from "@/components/cafeteria/TrialBalanceCard";
import { CafeteriaGraceBanner, CafeteriaBlockGate } from "@/components/cafeteria/CafeteriaGracePanel";
import { GlobalServiceCallsBanner } from "@/components/GlobalServiceCallsBanner";
import { TableCallsBanner } from "@/components/TableCallsBanner";
import { ViewModeSwitcher } from "@/components/ViewModeSwitcher";
import { useViewMode, viewModeContainerClass } from "@/components/ViewModeContext";
import { Footer } from "@/components/Footer";

import { BottomNav, BOTTOM_NAV_ROLES } from "@/components/layouts/BottomNav";
import { MobileHeader } from "@/components/layouts/MobileHeader";

interface NavItem { to: string; label: string; icon: React.ComponentType<{ className?: string }> }

interface Props {
  title: string;
  navItems: NavItem[];
  children: ReactNode;
  /** Show the cafeteria trial+balance summary card at the top (cafeteria_admin pages). */
  showTrialCard?: boolean;
}

export function DashboardShell({ title, navItems, children, showTrialCard }: Props) {
  const { t } = useI18n();
  const { signOut, refCode, roles } = useAuth();
  const navigate = useNavigate();
  const primaryRole = roles[0] ?? null;
  const hasBottomNav = !!primaryRole && BOTTOM_NAV_ROLES.has(primaryRole);
  const [tabletNavOpen, setTabletNavOpen] = useState(false);
  usePushNotifications();

  const onLogout = async () => {
    await signOut();
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen bg-background">
      <div>
        {/* Sidebar — desktop only (fixed; main offset via lg:ms-[260px]) */}
        <aside className="hidden lg:flex lg:fixed lg:inset-y-0 lg:w-[260px] bg-sidebar text-sidebar-foreground border-e border-sidebar-border lg:flex-col">
          <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <Coffee className="h-4 w-4" />
            </div>
            <span className="font-bold">{title}</span>
          </div>
          <nav className="flex-1 space-y-1 p-4">
            <div className="flex flex-col gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors whitespace-nowrap"
                  activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
          {refCode && (
            <div className="border-t border-sidebar-border p-4">
              <div className="text-xs text-sidebar-foreground/60 mb-1">{t("common.ref_code")}</div>
              <Badge variant="outline" className="border-sidebar-primary/50 bg-sidebar-primary/10 text-sidebar-primary font-mono">
                {refCode}
              </Badge>
            </div>
          )}
        </aside>

        {/* Main */}
        <div className="lg:ms-[260px] flex flex-col min-h-screen">
          {/* Mobile top bar (< 768px) */}
          <MobileHeader title={title} />
          {/* Tablet top bar with hamburger (768–1023) */}
          <header className="hidden md:flex lg:hidden sticky top-0 z-30 h-14 items-center justify-between gap-2 border-b border-border bg-background/80 backdrop-blur px-4">
            <Sheet open={tabletNavOpen} onOpenChange={setTabletNavOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72">
                <SheetHeader>
                  <SheetTitle className="text-right flex items-center gap-2">
                    <Coffee className="h-4 w-4" /> {title}
                  </SheetTitle>
                </SheetHeader>
                <nav className="mt-4 flex flex-col gap-1">
                  {navItems.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setTabletNavOpen(false)}
                      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                      activeProps={{ className: "bg-accent text-accent-foreground" }}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  ))}
                </nav>
                {refCode && (
                  <div className="mt-4 border-t border-border pt-4">
                    <div className="text-xs text-muted-foreground mb-1">{t("common.ref_code")}</div>
                    <Badge variant="outline" className="font-mono">{refCode}</Badge>
                  </div>
                )}
              </SheetContent>
            </Sheet>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <NotificationsBell />
              <LanguageSwitcher />
              <Button variant="ghost" size="sm" onClick={onLogout} className="gap-2">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </header>

          {/* Desktop top bar (hidden on mobile to free vertical space) */}
          <header className="hidden lg:flex sticky top-0 z-30 h-16 items-center justify-end gap-2 border-b border-border bg-background/80 backdrop-blur px-4">
            <ThemeToggle />
            <NotificationsBell />
            <LanguageSwitcher />
            <Button variant="ghost" size="sm" onClick={onLogout} className="gap-2">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">{t("common.logout")}</span>
            </Button>
          </header>
          <GlobalServiceCallsBanner />
          <main className="flex-1 p-4 md:p-6 lg:p-8 pb-[calc(70px+env(safe-area-inset-bottom))] md:pb-6 lg:pb-8">
            {showTrialCard && <TrialBalanceCard />}
            {showTrialCard && <CafeteriaGraceBanner />}
            {showTrialCard ? <CafeteriaBlockGate>{children}</CafeteriaBlockGate> : children}
          </main>
          
          <Footer />
        </div>
      </div>

      {/* Mobile floating draggable menu — only when role has no dedicated bottom nav */}
      {!hasBottomNav && <FloatingNavMenu navItems={navItems} title={title} />}

      {/* Mobile bottom navigation (role-based, < 768px only) */}
      <BottomNav role={primaryRole} />
    </div>
  );
}
