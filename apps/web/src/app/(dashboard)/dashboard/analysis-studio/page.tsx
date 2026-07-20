"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Trash2 } from "lucide-react";
import { analysisStudioApi } from "@/lib/api";
import { LaunchGptCard } from "@/components/dashboard/launch-gpt-card";
import { AnalysisBlockRenderer } from "@/components/analysis-studio/registry";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

const POLL_INTERVAL_MS = 4000;

// Analysis Studio is a presentation layer, not a dashboard — there is
// nothing to look at until the Custom GPT (still the analysis brain; this
// page never calls a model itself) chooses to mirror an answer here via
// POST /gpt/render. No permanent charts, no pre-built widgets: the feed is
// empty until the AI puts something in it, and shows exactly what it sent,
// nothing more.
export default function AnalysisStudioPage() {
  const [viewStartTime, setViewStartTime] = useState<number>(0);
  const feedEndRef = useRef<HTMLDivElement>(null);

  const { data: events } = useQuery({
    queryKey: ["analysis-studio", "events"],
    queryFn: analysisStudioApi.listEvents,
    refetchInterval: POLL_INTERVAL_MS,
  });

  const visibleEvents = useMemo(
    () => (events ?? []).filter((e) => new Date(e.createdAt).getTime() >= viewStartTime),
    [events, viewStartTime],
  );

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [visibleEvents.length]);

  return (
    <div className="relative space-y-6">
      <div aria-hidden className="dashboard-cinematic-bg pointer-events-none fixed inset-0 -z-10" />
      <div aria-hidden className="dashboard-starfield pointer-events-none fixed inset-0 -z-10 hidden opacity-60 dark:block" />

      <div className="rise-in flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="crystal-badge hidden h-14 w-14 shrink-0 bg-ai/15 text-ai drop-shadow-[0_0_24px_hsl(var(--ai)/0.5)] sm:flex">
            <Sparkles className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">استوديو التحليل</h1>
            <p className="max-w-xl text-muted-foreground">
              اسأل الـ Custom GPT بتاعك سؤال عادي زي ما انت متعود. لما إجابته تتضمن جدول أو رسم بياني أو خريطة، هتظهر هنا
              كمان — مفيش حاجة بتتعرض إلا لو الذكاء الاصطناعي طلب كده.
            </p>
          </div>
        </div>
        {visibleEvents.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setViewStartTime(Date.now())}>
            <Trash2 className="h-4 w-4" /> مسح العرض
          </Button>
        )}
      </div>

      <div className="rise-in rise-d1">
        <LaunchGptCard />
      </div>

      {visibleEvents.length === 0 ? (
        <Card className="glass-card rise-in rise-d2">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="crystal-badge h-14 w-14 bg-ai/15 text-ai drop-shadow-[0_0_24px_hsl(var(--ai)/0.5)]">
              <Sparkles className="h-6 w-6" />
            </span>
            <p className="text-sm text-muted-foreground">مفيش حاجة هنا لسه. شغّل الـ GPT بتاعك فوق، اسأله حاجة، وإجابته هتظهر في العرض ده.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {visibleEvents.map((event) => (
            <Card key={event.id} className="glass-card glow-ai rise-in">
              <CardContent className="space-y-4 pt-6">
                <p className="text-xs text-muted-foreground">{formatDate(event.createdAt)}</p>
                {event.content.narrative && <p className="text-sm leading-relaxed">{event.content.narrative}</p>}
                {event.content.blocks.map((block) => (
                  <AnalysisBlockRenderer key={block.id} block={block} />
                ))}
              </CardContent>
            </Card>
          ))}
          <div ref={feedEndRef} />
        </div>
      )}
    </div>
  );
}
