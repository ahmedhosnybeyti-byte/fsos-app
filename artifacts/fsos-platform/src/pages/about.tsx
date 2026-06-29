import { APP_NAME, APP_VERSION } from "@/lib/constants";

export default function About() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">About</h1>
        <p className="mt-3 text-muted-foreground">
          {APP_NAME} — v{APP_VERSION}
        </p>

        <div className="mt-8 space-y-6">
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">Stack</h2>
            <ul className="space-y-2">
              {STACK_ITEMS.map((item) => (
                <li key={item.name} className="flex items-start gap-3">
                  <span className="mt-0.5 h-5 w-5 rounded bg-primary/10 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0">
                    {item.abbr}
                  </span>
                  <div>
                    <span className="text-sm font-medium text-foreground">{item.name}</span>
                    <span className="text-sm text-muted-foreground"> — {item.description}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">Folder Structure</h2>
            <pre className="rounded-lg bg-muted px-4 py-3 text-xs text-foreground font-mono overflow-x-auto leading-relaxed">
{`src/
├── components/
│   └── ui/          # shadcn/ui primitives
├── hooks/           # Custom React hooks
├── layouts/         # Page layout wrappers
├── lib/             # Utilities & constants
├── pages/           # Route-level page components
├── types/           # Shared TypeScript types
├── App.tsx          # Root router
├── index.css        # Global styles & theme
└── main.tsx         # Entry point`}
            </pre>
          </section>
        </div>
      </div>
    </div>
  );
}

const STACK_ITEMS = [
  { abbr: "R", name: "React 18", description: "UI library with concurrent features" },
  { abbr: "T", name: "TypeScript", description: "Type-safe JavaScript" },
  { abbr: "V", name: "Vite", description: "Next-gen frontend tooling" },
  { abbr: "TW", name: "Tailwind CSS v4", description: "Utility-first styling" },
  { abbr: "UI", name: "shadcn/ui", description: "Accessible component primitives" },
  { abbr: "W", name: "Wouter", description: "Lightweight client-side routing" },
];
