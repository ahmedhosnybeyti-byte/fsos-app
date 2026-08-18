import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-[#070b14] px-5 py-10 text-slate-50">
      <div aria-hidden className="dashboard-cinematic-bg pointer-events-none absolute inset-0 -z-10 opacity-90" />
      <div aria-hidden className="dashboard-starfield pointer-events-none absolute inset-0 -z-10 opacity-50" />

      <section className="glass-hero rise-in relative w-full max-w-xl px-7 py-14 text-center sm:px-12 sm:py-16">
        <div aria-hidden className="hero-aurora pointer-events-none absolute inset-0" />
        <div className="relative z-10 flex flex-col items-center">
          <span className="crystal-badge mb-7 h-12 w-12 bg-primary/15 text-primary shadow-[0_0_28px_-4px_hsl(var(--primary)/0.7)]">
            <Sparkles className="h-5 w-5" />
          </span>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Murshidak</h1>
          <p className="mt-4 text-base text-slate-300 sm:text-lg">AI-powered field sales intelligence</p>
          <div className="mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Button size="lg" asChild className="shadow-[0_0_32px_-6px_hsl(var(--primary)/0.7)]">
              <Link href="/register">
                Start free trial <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="border-white/20 bg-white/[0.03] text-slate-100 hover:bg-white/10 hover:text-white">
              <Link href="/login">Log in</Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
