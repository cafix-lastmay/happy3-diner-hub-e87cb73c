// Mobile-only top header bar (<768px): back, home, notifications, language, logout.
import { useRouter, useRouterState, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Home, LogOut, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/NotificationsBell";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ViewModeSwitcher } from "@/components/ViewModeSwitcher";
import { FeedbackDialog } from "@/components/FeedbackDialog";
import { useAuth, type Role } from "@/auth/AuthProvider";

const HOME_FOR_ROLE: Partial<Record<Role, string>> = {
  waiter: "/staff/orders",
  chef: "/staff/orders",
  cafeteria_admin: "/cafeteria/orders",
  owner: "/owner",
  manager: "/manager",
  marketer: "/marketer",
};

interface Props {
  /** Optional title shown centered in the header. */
  title?: string;
}

export function MobileHeader({ title }: Props) {
  const router = useRouter();
  const navigate = useNavigate();
  const { roles, signOut } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const role = (roles[0] as Role | undefined) ?? null;
  const home = (role && HOME_FOR_ROLE[role]) || "/";
  const isHome = pathname === home;

  const onLogout = async () => {
    await signOut();
    navigate({ to: "/" });
  };

  return (
    <header
      className="md:hidden sticky top-0 z-30 h-14 flex items-center justify-between gap-1 border-b border-border bg-background/95 backdrop-blur px-2"
      dir="rtl"
    >
      <div className="flex items-center gap-1">
        {!isHome && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="رجوع"
            onClick={() => router.history.back()}
          >
            <ArrowRight className="h-5 w-5" />
          </Button>
        )}
        <Button asChild variant="ghost" size="icon" aria-label="الرئيسية">
          <Link to={home}>
            <Home className="h-5 w-5" />
          </Link>
        </Button>
      </div>

      {title && (
        <h1 className="flex-1 text-center text-sm font-semibold truncate px-2">
          {title}
        </h1>
      )}

      <div className="flex items-center gap-0">
        <FeedbackDialog trigger={<Button variant="ghost" size="icon" aria-label="شكاوى واقتراحات"><MessageCircle className="h-5 w-5" /></Button>} />
        <ViewModeSwitcher />
        <ThemeToggle />
        <NotificationsBell />
        <LanguageSwitcher />
        <Button variant="ghost" size="icon" aria-label="تسجيل الخروج" onClick={onLogout}>
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
