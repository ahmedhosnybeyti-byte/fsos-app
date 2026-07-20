import Link from "next/link";
import { Zap } from "lucide-react";

// Crystal AI Design Language (auth surfaces) — the login/register screens
// are the product's first impression, so the shared layout carries the
// same cinematic backdrop + starfield as the app shell, and the brand
// mark uses the crystal-badge treatment. Pages themselves render as the
// screen's single glass-hero element.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-4 py-12">
      <div aria-hidden className="dashboard-cinematic-bg pointer-events-none fixed inset-0 -z-10" />
      <div aria-hidden className="dashboard-starfield pointer-events-none fixed inset-0 -z-10 hidden opacity-60 dark:block" />
      <Link href="/" className="rise-in flex items-center gap-3 font-semibold">
        <span className="crystal-badge h-11 w-11 bg-primary/15 text-primary drop-shadow-[0_0_20px_hsl(var(--primary)/0.45)]">
          <Zap className="h-5 w-5" />
        </span>
        <span className="text-lg">Field Sales OS</span>
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
