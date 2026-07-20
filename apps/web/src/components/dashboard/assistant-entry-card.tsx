import Link from "next/link";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/components/translation-provider";

// Replaces LaunchGptCard's external-redirect flow on the dashboard home —
// the assistant now lives natively in-app, so this is just a direct link,
// no launch code / copy step needed.
//
// Restyled per FSOS Design Constitution §4.1 (Intelligent Glow — AI =
// purple) and §7.6 (Murshidak visual identity: AI Purple + Crystal Glass +
// Intelligent Glow). This is an entry point only, not a live AI insight —
// so it deliberately does NOT use the §5.5 AI Card Decision→Reason→Action
// structure, which would require a real analysis result to populate
// honestly. Also renamed from the generic "المساعد" to the official
// product name "مرشدك" per Appendix §18.2 (Murshidak must never be
// referred to as a generic "AI Assistant" inside the product).
export function AssistantEntryCard() {
  const { t } = useTranslation();
  return (
    <div className="glass-card glow-ai-strong relative flex h-full flex-col justify-between gap-5 overflow-hidden p-7">
      {/* Same static Aurora-wash technique as the Hero, purple-only here
          (§3.5: purple = AI/Murshidak) so this card is unmistakably the
          screen's AI surface at a glance, not just another info card.
          Follow-up ("مرشدك يستحق يكون بطل الشاشة"): bigger wash + a second
          bloom in the opposite corner, so the card reads as lit from
          within rather than just tinted. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(320px circle at 88% -15%, hsl(var(--ai) / 0.22), transparent 65%), radial-gradient(260px circle at -10% 115%, hsl(var(--ai) / 0.14), transparent 60%)",
        }}
      />
      <div className="relative space-y-3">
        <div className="flex items-center gap-3">
          <span className="crystal-badge h-16 w-16 bg-ai/15 text-ai">
            <Bot className="h-7 w-7" />
          </span>
          <span className="rounded-full bg-ai/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-ai">AI</span>
        </div>
        <div className="space-y-1.5">
          <h3 className="text-xl font-semibold leading-none tracking-tight">{t("dashboard.aiCardTitle")}</h3>
          <p className="max-w-md text-sm text-muted-foreground">{t("dashboard.aiCardBody")}</p>
        </div>
      </div>
      <Button
        asChild
        size="lg"
        className="relative h-12 w-fit bg-ai px-8 text-base shadow-[0_0_28px_-6px_hsl(var(--ai)/0.6)] hover:bg-ai/90 hover:shadow-[0_0_40px_-6px_hsl(var(--ai)/0.75)] motion-safe:hover:-translate-y-0.5"
      >
        <Link href="/dashboard/assistant">{t("dashboard.aiCardCta")}</Link>
      </Button>
    </div>
  );
}
