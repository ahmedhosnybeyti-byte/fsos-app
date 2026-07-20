"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, LogOut, Menu, Search, X, Zap, type LucideIcon } from "lucide-react";
import { authApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { useTranslation } from "@/components/translation-provider";
import { MODULE_BADGE_CLASSES, type ModuleColorKey } from "@/lib/module-colors";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/types";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  // Per-module accent color for the nav icon badge (see lib/module-colors.ts).
  // Optional so any caller that hasn't been migrated yet still renders
  // (falls back to the "overview" blue) instead of breaking.
  colorKey?: ModuleColorKey;
  // Already-translated section header (e.g. "البيانات" / "Data") shown
  // above this item when it differs from the previous item's group.
  // Optional — items with no group (e.g. a standalone "Overview") render
  // with no heading above them. Caller resolves the string via
  // useTranslation() before building the array, same as `label`, so this
  // component stays decoupled from the dictionary system. Purely a
  // rendering hint, not used for routing/logic.
  group?: string;
}

export function AppShell({
  navItems,
  user,
  children,
}: {
  navItems: NavItem[];
  user?: User;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  async function handleLogout() {
    await authApi.logout();
    queryClient.clear();
    router.push("/login");
  }

  return (
    // dir="rtl" (or "ltr" in English — see translation-provider.tsx) is set
    // globally on <html>; a plain flex row already mirrors itself under RTL
    // per the CSS spec, so the sidebar renders on the correct side with
    // zero JSX reordering here. Spacing/border utilities use Tailwind's
    // logical-property variants (border-e/-s, ps-/pe-) so they flip too.
    <div className="flex min-h-screen bg-app-gradient">
      <aside className="glass-panel hidden w-64 shrink-0 flex-col border-e border-border md:flex">
        <div className="flex items-center gap-2 border-b border-border px-6 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm">
            <Zap className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">{t("shell.brand")}</p>
            <p className="truncate text-[11px] text-muted-foreground">{t("shell.tagline")}</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          <NavList navItems={navItems} pathname={pathname} />
        </nav>
        <div className="border-t border-border p-3">
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            {t("shell.logout")}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardHeader
          navItems={navItems}
          user={user}
          onLogout={handleLogout}
          mobileNavOpen={mobileNavOpen}
          onToggleMobileNav={() => setMobileNavOpen((v) => !v)}
        />

        {mobileNavOpen && (
          <div className="glass-panel border-b border-border p-3 md:hidden">
            <NavList navItems={navItems} pathname={pathname} onNavigate={() => setMobileNavOpen(false)} />
          </div>
        )}

        {/* min-w-0 is load-bearing: without it, a flex child with no
            intrinsic max-width (e.g. a wide <Table>) forces this whole
            column to grow past the viewport, and the ENTIRE shell
            (sidebar included) scrolls horizontally instead of the table's
            own overflow-x-auto wrapper (see components/ui/table.tsx)
            scrolling on its own. This is what "عايز سكرول بالعرض تحت جدول
            البيانات" was actually reporting — every dashboard page with a
            wide table was affected, not just Visit Efficiency/Team
            Performance. */}
        <main className="min-w-0 flex-1 overflow-y-auto p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}

function NavList({
  navItems,
  pathname,
  onNavigate,
}: {
  navItems: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  let lastGroup: string | undefined;
  return (
    <>
      {navItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const badgeClasses = MODULE_BADGE_CLASSES[item.colorKey ?? "overview"];
        const showHeading = item.group && item.group !== lastGroup;
        lastGroup = item.group;
        return (
          <div key={item.href}>
            {showHeading && (
              <p className="mb-1 mt-4 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70 first:mt-1">
                {item.group}
              </p>
            )}
            <Link
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-full px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-gradient-to-l from-primary to-primary/80 text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                  active ? "bg-white/20 text-primary-foreground" : badgeClasses,
                )}
              >
                <item.icon className="h-3.5 w-3.5" />
              </span>
              {item.label}
            </Link>
          </div>
        );
      })}
    </>
  );
}

function DashboardHeader({
  navItems,
  user,
  onLogout,
  mobileNavOpen,
  onToggleMobileNav,
}: {
  navItems: NavItem[];
  user?: User;
  onLogout: () => void;
  mobileNavOpen: boolean;
  onToggleMobileNav: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [resultsOpen, setResultsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Real (not decorative) quick-nav: Ctrl/Cmd+K focuses the search box,
  // typing filters the actual nav items by label, click/Enter navigates.
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setResultsOpen(false);
        setUserMenuOpen(false);
      }
    }
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return navItems.filter((item) => item.label.toLowerCase().includes(q)).slice(0, 8);
  }, [navItems, query]);

  const initials = (user?.fullName ?? "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <header className="glass-panel sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border px-4 md:px-6" ref={containerRef}>
      <Button variant="ghost" size="icon" className="shrink-0 md:hidden" onClick={onToggleMobileNav} aria-label="فتح القائمة">
        {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      <div className="relative flex-1 max-w-md">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setResultsOpen(true);
          }}
          onFocus={() => setResultsOpen(true)}
          placeholder={t("shell.searchPlaceholder")}
          className="h-10 w-full rounded-full border border-border bg-background/60 ps-9 pe-12 text-sm outline-none ring-primary/40 placeholder:text-muted-foreground focus:ring-2"
        />
        <kbd className="pointer-events-none absolute end-3 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground sm:block">
          ⌘K
        </kbd>

        {resultsOpen && query.trim() && (
          <div className="absolute top-12 z-40 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
            {matches.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">مفيش نتائج مطابقة</p>
            ) : (
              matches.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => {
                    setQuery("");
                    setResultsOpen(false);
                  }}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-secondary/60"
                >
                  <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md", MODULE_BADGE_CLASSES[item.colorKey ?? "overview"])}>
                    <item.icon className="h-3.5 w-3.5" />
                  </span>
                  {item.label}
                </Link>
              ))
            )}
          </div>
        )}
      </div>

      <div className="ms-auto flex shrink-0 items-center gap-1">
        <div className="hidden sm:flex sm:items-center sm:gap-1">
          <LanguageToggle />
          <ThemeToggle />
        </div>

        {user && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setUserMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-full py-1 ps-1 pe-2 hover:bg-secondary/60"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-xs font-semibold text-primary-foreground">
                {initials || "؟"}
              </span>
              <span className="hidden text-start sm:block">
                <span className="block text-sm font-medium leading-tight">{user.fullName}</span>
                <span className="block text-xs leading-tight text-muted-foreground">{user.role.name}</span>
              </span>
              <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" />
            </button>

            {userMenuOpen && (
              <div className="absolute end-0 top-12 z-40 w-56 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg">
                <div className="px-2.5 py-2 sm:hidden">
                  <p className="truncate text-sm font-medium">{user.fullName}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.role.name}</p>
                </div>
                <p className="hidden truncate px-2.5 py-1.5 text-xs text-muted-foreground sm:block">{user.email}</p>
                <div className="my-1 h-px bg-border sm:hidden" />
                <div className="flex items-center gap-2 px-2.5 py-1.5 sm:hidden">
                  <LanguageToggle />
                  <ThemeToggle />
                </div>
                <div className="my-1 h-px bg-border" />
                <button
                  type="button"
                  onClick={onLogout}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                >
                  <LogOut className="h-4 w-4" />
                  {t("shell.logout")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
