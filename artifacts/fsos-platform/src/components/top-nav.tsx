import { Bell, Search, Menu, Bot } from "lucide-react";
import { useLocation } from "wouter";
import { NAV_SECTIONS } from "@/lib/constants";

interface TopNavProps {
  onMobileMenuClick: () => void;
  onAiPanelToggle: () => void;
  aiPanelOpen: boolean;
}

function getBreadcrumb(path: string): { label: string; href: string }[] {
  const allItems = NAV_SECTIONS.flatMap((s) => s.items);
  const match = allItems.find((i) => i.href === path);
  if (!match) return [{ label: "Page", href: path }];
  return [{ label: match.label, href: match.href }];
}

export function TopNav({ onMobileMenuClick, onAiPanelToggle, aiPanelOpen }: TopNavProps) {
  const [location] = useLocation();
  const crumbs = getBreadcrumb(location);

  return (
    <header className="flex h-14 items-center gap-3 border-b border-border bg-card px-4 shrink-0">
      {/* Mobile hamburger */}
      <button
        onClick={onMobileMenuClick}
        className="sm:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-muted-foreground text-sm hidden sm:block">FSOS /</span>
        {crumbs.map((crumb) => (
          <span key={crumb.href} className="text-sm font-medium text-foreground truncate">
            {crumb.label}
          </span>
        ))}
      </div>

      {/* Search */}
      <div className="flex-1 max-w-sm mx-auto hidden md:flex">
        <div className="relative w-full">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            placeholder="Search…"
            className="w-full rounded-md border border-border bg-background pl-8 pr-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-shadow"
          />
        </div>
      </div>

      <div className="ml-auto flex items-center gap-1">
        {/* Notifications */}
        <button className="relative p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
        </button>

        {/* AI Panel toggle */}
        <button
          onClick={onAiPanelToggle}
          title="Toggle AI Assistant"
          className={[
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors",
            aiPanelOpen
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-accent",
          ].join(" ")}
        >
          <Bot className="h-4 w-4" />
          <span className="hidden sm:inline">AI</span>
        </button>

        {/* Divider */}
        <div className="mx-1 h-6 w-px bg-border" />

        {/* Avatar */}
        <button className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary hover:bg-primary/20 transition-colors">
          U
        </button>
      </div>
    </header>
  );
}
