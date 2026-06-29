import { APP_NAME } from "@/lib/constants";

export default function Home() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
      <div className="text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          Platform Foundation Ready
        </div>

        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Welcome to{" "}
          <span className="text-primary">{APP_NAME}</span>
        </h1>

        <p className="mt-4 text-lg text-muted-foreground max-w-xl mx-auto">
          A clean React + TypeScript + Vite frontend foundation, ready for your features.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-3 max-w-2xl mx-auto">
          {FEATURE_CARDS.map((card) => (
            <div
              key={card.title}
              className="rounded-xl border border-border bg-card p-5 text-left shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="mb-3 h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-lg">
                {card.icon}
              </div>
              <h3 className="font-semibold text-foreground text-sm">{card.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{card.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const FEATURE_CARDS = [
  {
    icon: "⚡",
    title: "Vite + React",
    description: "Blazing-fast HMR and optimized builds with React 18 and TypeScript.",
  },
  {
    icon: "🎨",
    title: "Tailwind + shadcn/ui",
    description: "Full UI component library with a cohesive design system and dark mode support.",
  },
  {
    icon: "📦",
    title: "Clean Structure",
    description: "Pages, layouts, components, hooks, types, and lib folders — all organized.",
  },
];
