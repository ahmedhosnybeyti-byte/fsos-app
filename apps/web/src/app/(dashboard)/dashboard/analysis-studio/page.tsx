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
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analysis Studio</h1>
          <p className="max-w-xl text-muted-foreground">
            Ask your Custom GPT a question as usual. When its answer includes a table, chart, or map, it shows up here
            too — nothing renders unless the AI asks for it.
          </p>
        </div>
        {visibleEvents.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setViewStartTime(Date.now())}>
            <Trash2 className="h-4 w-4" /> Clear view
          </Button>
        )}
      </div>

      <LaunchGptCard />

      {visibleEvents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Sparkles className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nothing here yet. Launch your GPT above, ask it something, and its answer will appear in this feed.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {visibleEvents.map((event) => (
            <Card key={event.id}>
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
