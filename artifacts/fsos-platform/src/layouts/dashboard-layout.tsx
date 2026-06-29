import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { AppSidebar } from "@/components/app-sidebar";
import { TopNav } from "@/components/top-nav";
import { AiPanel } from "@/components/ai-panel";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAiPanel } from "@/hooks/use-ai-panel";
import { cn } from "@/lib/utils";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { collapsed, toggleCollapsed, mobileOpen, toggleMobile, closeMobile } = useSidebar(false);
  const aiPanel = useAiPanel(true);

  // Close mobile sidebar on outside click
  useEffect(() => {
    if (!mobileOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeMobile(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [mobileOpen, closeMobile]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 sm:hidden"
          onClick={closeMobile}
          aria-hidden
        />
      )}

      {/* Sidebar — desktop (always visible) */}
      <div className="hidden sm:flex">
        <AppSidebar collapsed={collapsed} onToggle={toggleCollapsed} />
      </div>

      {/* Sidebar — mobile (slide-in) */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 sm:hidden transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <AppSidebar collapsed={false} onToggle={closeMobile} onNavClick={closeMobile} />
      </div>

      {/* Main column */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopNav
          onMobileMenuClick={toggleMobile}
          onAiPanelToggle={aiPanel.toggle}
          aiPanelOpen={aiPanel.open}
        />

        {/* Content row */}
        <div className="flex flex-1 overflow-hidden">
          {/* Main content */}
          <main className="flex-1 overflow-y-auto p-6">
            {children}
          </main>

          {/* Right panel — AI Assistant */}
          {aiPanel.open && (
            <div className="hidden lg:flex">
              <AiPanel onClose={aiPanel.close} />
            </div>
          )}
        </div>
      </div>

      <Toaster />
    </div>
  );
}
