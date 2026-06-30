import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  Crosshair,
  Bot,
  UserPlus,
  TrendingUp,
  Route,
  Settings,
  type LucideIcon,
} from "lucide-react";

export const APP_NAME = "FSOS Platform";
export const APP_VERSION = "0.1.0";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Sales",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
      { label: "Customer 360", href: "/customers", icon: Users },
      { label: "Daily Mission", href: "/daily-mission", icon: Crosshair },
      { label: "Daily Visit Plan", href: "/visits", icon: CalendarCheck },
      { label: "AI Assistant", href: "/ai-assistant", icon: Bot },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "New Customer", href: "/new-customer", icon: UserPlus },
      { label: "Executive Report", href: "/executive-report", icon: TrendingUp },
      { label: "Route Analysis", href: "/route-analysis", icon: Route },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];
