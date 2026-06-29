export interface NavLink {
  label: string;
  href: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export interface PageMeta {
  title: string;
  description?: string;
}
