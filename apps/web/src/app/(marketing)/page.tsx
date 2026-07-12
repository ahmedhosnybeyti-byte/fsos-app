import Link from "next/link";
import {
  ArrowRight,
  ShieldCheck,
  Building2,
  Users,
  CreditCard,
  UploadCloud,
  Sparkles,
  LineChart,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PricingSection } from "@/components/marketing/pricing-section";

const FEATURES = [
  {
    icon: Building2,
    title: "Company-scoped access",
    description: "Every company gets its own workspace, users, and Custom GPT — never shared, never mixed up.",
  },
  {
    icon: Users,
    title: "Role-based uploads",
    description: "Company, Manager, Supervisor, and Route Excel files map to the right analysis scope automatically.",
  },
  {
    icon: ShieldCheck,
    title: "Access control that's enforced, not assumed",
    description: "Subscription status is checked on every request — expired or suspended accounts are blocked instantly.",
  },
  {
    icon: Lock,
    title: "The GPT link is never freely usable",
    description: "A two-factor Action handshake verifies your subscription before your Custom GPT can analyze anything.",
  },
  {
    icon: UploadCloud,
    title: "Upload up to 5 Excel files",
    description: "Keep your Company, Manager, Supervisor, and Route data current — the GPT always reads the latest upload.",
  },
  {
    icon: CreditCard,
    title: "Trials, plans, and payments",
    description: "Trial, Basic, Professional, and Enterprise plans with clear payment and subscription status.",
  },
];

const WORKFLOW = [
  { step: "1", title: "Log in", description: "Authenticate to your company workspace." },
  { step: "2", title: "Subscription verified", description: "The platform confirms your plan is active before anything else." },
  { step: "3", title: "Upload files", description: "Upload the Excel file matching your role's analysis scope." },
  { step: "4", title: "Launch GPT", description: "Get a one-time access code for your company's Custom GPT." },
  { step: "5", title: "Access verified", description: "The GPT calls back to confirm your code and subscription are valid." },
  { step: "6", title: "AI analysis", description: "Your Custom GPT analyzes the exact dataset you uploaded." },
];

export default function LandingPage() {
  return (
    <>
      <section className="container flex flex-col items-center gap-6 py-24 text-center sm:py-32">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-3 py-1 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          The platform controls access. The AI is your Custom GPT.
        </span>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
          Secure the door to your company&apos;s <span className="text-primary">Custom ChatGPT</span>
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Field Sales OS manages users, subscriptions, and role-based Excel uploads, then verifies every single request
          before your Custom GPT is allowed to analyze anything.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button size="lg" asChild>
            <Link href="/register">
              Start your free trial <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/login">Log in</Link>
          </Button>
        </div>
      </section>

      <section id="features" className="border-t border-border/60 bg-secondary/10 py-24">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Built for controlled AI access</h2>
            <p className="mt-3 text-muted-foreground">
              Field Sales OS is not the AI — it&apos;s the access-control layer in front of it.
            </p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="rounded-lg border border-border bg-card p-6">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-primary/15 text-primary">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="workflow" className="container py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">How access is verified</h2>
          <p className="mt-3 text-muted-foreground">Six steps, every time — no shortcuts to the model.</p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {WORKFLOW.map((item) => (
            <div key={item.step} className="rounded-lg border border-border bg-card p-6">
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {item.step}
              </div>
              <h3 className="font-semibold">{item.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      <PricingSection />

      <section className="border-t border-border/60 bg-secondary/10">
        <div className="container flex flex-col items-center gap-6 py-24 text-center">
          <LineChart className="h-10 w-10 text-primary" />
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Ready to control access to your GPT?</h2>
          <p className="max-w-xl text-muted-foreground">
            Set up your company workspace in minutes and start your 14-day trial — no credit card required.
          </p>
          <Button size="lg" asChild>
            <Link href="/register">
              Start free trial <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
