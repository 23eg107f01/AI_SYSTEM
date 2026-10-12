import { useEffect, useState, type ReactNode } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Headphones,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  ShieldAlert,
  X,
} from "lucide-react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import type { AuthUser } from "../utils/auth";
import { Avatar, Badge, cn } from "./ui";

interface AppShellProps {
  user: AuthUser;
  children?: ReactNode;
}

interface NavigationItem {
  label: string;
  shortLabel?: string;
  to: string;
  icon: typeof LayoutDashboard;
  roles: AuthUser["role"][];
}

const navigationItems: NavigationItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, roles: ["manager", "admin"] },
  { label: "Tickets", shortLabel: "Support Chat", to: "/chat", icon: MessageSquareText, roles: ["customer"] },
  { label: "Tickets", to: "/tickets", icon: MessageSquareText, roles: ["agent", "manager", "admin"] },
  { label: "Escalations", to: "/agent", icon: ShieldAlert, roles: ["manager", "admin"] },
  { label: "Knowledge Base", to: "/admin", icon: BookOpen, roles: ["admin"] },
];

function getPageTitle(pathname: string, user: AuthUser): string {
  if (pathname === "/chat") return user.role === "customer" ? "Support tickets" : "Tickets";
  if (pathname === "/tickets" || pathname.startsWith("/tickets/")) return "Tickets";
  if (pathname === "/dashboard") return "Dashboard";
  if (pathname === "/agent") return "Escalations";
  if (pathname === "/admin") return "Knowledge Base";
  return "Support workspace";
}

function getInitials(email: string): string {
  const name = email.split("@")[0] || "User";
  return name.slice(0, 2).toUpperCase();
}

function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Link to="/dashboard" className={cn("flex min-w-0 items-center gap-3", collapsed && "justify-center")} aria-label="AI Support home">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm shadow-brand-600/25">
        <Headphones aria-hidden="true" className="h-4.5 w-4.5" strokeWidth={2.2} />
      </span>
      {!collapsed && <span className="truncate text-base font-bold tracking-tight text-slate-950">AI Support</span>}
    </Link>
  );
}

function Sidebar({
  user,
  collapsed,
  mobileOpen,
  onToggleCollapse,
  onCloseMobile,
}: {
  user: AuthUser;
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleCollapse: () => void;
  onCloseMobile: () => void;
}) {
  const visibleItems = navigationItems.filter((item) => item.roles.includes(user.role));

  return (
    <>
      {mobileOpen && <button aria-label="Close navigation menu" className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" onClick={onCloseMobile} />}
      <aside
        aria-label="Primary navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:translate-x-0",
          collapsed ? "lg:w-[76px]" : "lg:w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className={cn("flex h-16 items-center border-b border-slate-100 px-4", collapsed && "lg:justify-center lg:px-0")}>
          <Brand collapsed={collapsed} />
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close navigation menu"
            className="ml-auto rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 lg:hidden"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5" aria-label="Workspace sections">
          <p className={cn("mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400", collapsed && "lg:px-0 lg:text-center")}>
            {collapsed ? "•" : "Workspace"}
          </p>
          {visibleItems.map(({ label, shortLabel, to, icon: Icon }) => (
            <NavLink
              key={`${label}-${to}`}
              to={to}
              onClick={onCloseMobile}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                  collapsed && "lg:justify-center lg:px-0",
                  isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon aria-hidden="true" className={cn("h-[18px] w-[18px] shrink-0", isActive ? "text-brand-600" : "text-slate-400 group-hover:text-slate-600")} />
                  <span className={cn("truncate", collapsed && "lg:hidden")}>{shortLabel || label}</span>
                  {isActive && <span className={cn("ml-auto h-1.5 w-1.5 rounded-full bg-brand-600", collapsed && "lg:hidden")} />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className={cn("border-t border-slate-100 p-3", collapsed && "lg:px-2")}>
          <div className={cn("mb-3 flex items-center gap-3 rounded-lg bg-slate-50 p-2.5", collapsed && "lg:justify-center lg:bg-transparent lg:p-0")}>
            <Avatar name={getInitials(user.email)} size="sm" />
            <div className={cn("min-w-0", collapsed && "lg:hidden")}>
              <p className="truncate text-xs font-semibold text-slate-800">{user.email}</p>
              <p className="mt-0.5 text-[11px] capitalize text-slate-500">{user.role} access</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 lg:flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight aria-hidden="true" className="h-4 w-4" /> : <><ChevronLeft aria-hidden="true" className="h-4 w-4" /> Collapse sidebar</>}
          </button>
        </div>
      </aside>
    </>
  );
}

function UserMenu({ user }: { user: AuthUser }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-lg p-1.5 text-left hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <Avatar name={getInitials(user.email)} size="sm" />
        <span className="hidden max-w-40 truncate text-xs font-semibold text-slate-700 sm:block">{user.email}</span>
        <span className="hidden text-slate-400 sm:block">⌄</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 z-30 w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-1.5 shadow-elevated">
          <div className="border-b border-slate-100 px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-slate-800">{user.email}</p>
            <Badge variant="neutral" className="mt-1 capitalize">{user.role}</Badge>
          </div>
          <button type="button" role="menuitem" onClick={handleLogout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-error-700 hover:bg-error-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-500">
            <LogOut aria-hidden="true" className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function TopBar({ user, onOpenMenu }: { user: AuthUser; onOpenMenu: () => void }) {
  const location = useLocation();
  const title = getPageTitle(location.pathname, user);

  return (
    <header className="sticky top-0 z-30 flex min-w-0 h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={onOpenMenu} aria-label="Open navigation menu" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 lg:hidden">
          <Menu aria-hidden="true" className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-slate-950">{title}</p>
          <p className="hidden text-xs text-slate-500 sm:block">AI-assisted support operations</p>
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <div className="hidden items-center gap-2 rounded-full border border-success-100 bg-success-50 px-2.5 py-1.5 text-xs font-semibold text-success-700 md:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-success-600" /> Workspace active
        </div>
        <UserMenu user={user} />
      </div>
    </header>
  );
}

export default function AppShell({ user, children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileOpen]);

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar user={user} collapsed={collapsed} mobileOpen={mobileOpen} onToggleCollapse={() => setCollapsed((current) => !current)} onCloseMobile={() => setMobileOpen(false)} />
      <div className={cn("min-h-screen transition-[padding] duration-200 lg:pl-64", collapsed && "lg:pl-[76px]")}>
        <TopBar user={user} onOpenMenu={() => setMobileOpen(true)} />
        <main className="min-w-0 px-4 py-5 sm:px-6 sm:py-7 lg:px-8">{children || <Outlet />}</main>
      </div>
    </div>
  );
}
