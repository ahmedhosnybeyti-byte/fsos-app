import {
  LayoutDashboard,
  BarChart3,
  FileText,
  Users,
  Settings,
  Bell,
  Shield,
  FolderOpen,
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
    title: "Main",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
      { label: "Analytics", href: "/analytics", icon: BarChart3 },
      { label: "Reports", href: "/reports", icon: FileText },
    ],
  },
  {
    title: "Management",
    items: [
      { label: "Users", href: "/users", icon: Users },
      { label: "Projects", href: "/projects", icon: FolderOpen },
      { label: "Compliance", href: "/compliance", icon: Shield },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Notifications", href: "/notifications", icon: Bell },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];
