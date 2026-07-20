"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, CircleMarker } from "leaflet";
// Stylesheet import is safe statically (no `window` access at module load).
// The Leaflet JS itself is only ever imported inside useEffect — same
// SSR-safety reasoning as route-split-map.tsx / resolved-customers-map.tsx.
// On top of that, the copilot page loads this whole component through
// next/dynamic (ssr: false), so even this module costs nothing until the
// rep actually opens Discovery Mode.
import "leaflet/dist/leaflet.css";
import { useTranslation } from "@/components/translation-provider";
import type { VisitCopilotDiscoveryCustomer, VisitCopilotProspect, VisitCopilotProspectStatus } from "@/lib/types";

// Same color family as the other maps (route-split-map GROUP_COLORS):
// existing customers stay muted blue so the green/gold prospect signal
// pops; IGNORED keeps its gray but fades to near-transparent.
const EXISTING_COLOR = "#2980b9";
const STATUS_COLORS: Record<VisitCopilotProspectStatus, string> = {
  NEW: "#27ae60",
  VISITED: "#7f8c8d",
  IGNORED: "#7f8c8d",
  CONVERTED: "#f39c12",
};

export function DiscoveryMap({
  customers,
  prospects,
  onStartVisit,
  onIgnore,
  heightClassName = "h-[60vh]",
}: {
  customers: VisitCopilotDiscoveryCustomer[];
  prospects: VisitCopilotProspect[];
  onStartVisit: (id: string) => void;
  onIgnore: (id: string) => void;
  heightClassName?: string;
}) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<CircleMarker[]>([]);

  // The popup buttons live in imperative Leaflet DOM; refs keep the latest
  // callbacks reachable without making them marker-effect dependencies.
  const onStartVisitRef = useRef(onStartVisit);
  onStartVisitRef.current = onStartVisit;
  const onIgnoreRef = useRef(onIgnore);
  onIgnoreRef.current = onIgnore;

  // Map init + marker plotting in ONE effect, exactly like
  // resolved-customers-map.tsx and for the same reason: this component only
  // mounts once Discovery Mode opens with data already in hand, so a split
  // "init once / plot on change" pair races the async map creation and can
  // leave the markers effect bailed out forever.
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      if (!mapRef.current) {
        const map = L.map(containerRef.current).setView([21.6, 39.19], 10);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
        }).addTo(map);
        mapRef.current = map;
      }
      const map = mapRef.current;

      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      const bounds: [number, number][] = [];

      customers.forEach((c) => {
        const marker = L.circleMarker([c.lat, c.lon], {
          radius: 5,
          fillColor: EXISTING_COLOR,
          color: "#fff",
          weight: 1,
          fillOpacity: 0.45,
          opacity: 0.6,
        })
          .bindPopup(`<b>${c.name}</b> (${c.customerCode})<br>${c.channel}`)
          .addTo(map);
        markersRef.current.push(marker);
        bounds.push([c.lat, c.lon]);
      });

      prospects.forEach((p) => {
        const faded = p.status === "IGNORED";
        const marker = L.circleMarker([p.lat, p.lon], {
          radius: 8,
          fillColor: STATUS_COLORS[p.status],
          color: "#fff",
          weight: 1.5,
          fillOpacity: faded ? 0.25 : 0.9,
          opacity: faded ? 0.35 : 1,
        })
          // DOM-built popup (not an HTML string like the read-only maps)
          // because it carries two live action buttons; textContent keeps
          // the Google-sourced name/reason strings inert.
          .bindPopup(() => {
            const el = document.createElement("div");
            el.className = "space-y-1 text-sm";

            const name = document.createElement("p");
            name.className = "font-semibold";
            name.textContent = p.name;
            el.appendChild(name);

            const lines = [
              t("copilot.popupScore", { value: Math.round(p.priorityScore) }),
              t("copilot.popupExpected", { value: p.expectedOrderValue.toLocaleString() }),
              t("copilot.popupProbability", { value: Math.round(p.successProbability) }),
              t("copilot.popupDistance", { value: p.distanceKm.toLocaleString() }),
            ];
            lines.forEach((text) => {
              const line = document.createElement("p");
              line.className = "text-xs";
              line.textContent = text;
              el.appendChild(line);
            });

            const reason = document.createElement("p");
            reason.className = "max-w-[220px] text-xs text-muted-foreground";
            reason.textContent = p.reason;
            el.appendChild(reason);

            const row = document.createElement("div");
            row.className = "mt-1.5 flex gap-1.5";

            const startBtn = document.createElement("button");
            startBtn.type = "button";
            startBtn.className = "h-9 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground";
            startBtn.textContent = t("copilot.startVisit");
            startBtn.onclick = () => onStartVisitRef.current(p.id);
            row.appendChild(startBtn);

            if (p.status !== "IGNORED") {
              const ignoreBtn = document.createElement("button");
              ignoreBtn.type = "button";
              ignoreBtn.className = "h-9 rounded-md bg-secondary px-3 text-xs font-medium text-secondary-foreground";
              ignoreBtn.textContent = t("copilot.ignore");
              ignoreBtn.onclick = () => {
                marker.closePopup();
                onIgnoreRef.current(p.id);
              };
              row.appendChild(ignoreBtn);
            }

            el.appendChild(row);
            return el;
          })
          .addTo(map);
        markersRef.current.push(marker);
        bounds.push([p.lat, p.lon]);
      });

      if (bounds.length > 0) map.fitBounds(bounds, { padding: [32, 32] });
    })();

    return () => {
      cancelled = true;
    };
  }, [customers, prospects, t]);

  // Map teardown only on unmount — separate from the effect above so data
  // refetches don't destroy and recreate the map.
  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div>
      {/* Legend row ABOVE the map (spec) — same swatch style as resolved-customers-map. */}
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <LegendDot color={EXISTING_COLOR} faded label={t("copilot.legendExisting")} />
        <LegendDot color={STATUS_COLORS.NEW} label={t("copilot.legendNew")} />
        <LegendDot color={STATUS_COLORS.VISITED} label={t("copilot.legendVisited")} />
        <LegendDot color={STATUS_COLORS.IGNORED} faded label={t("copilot.legendIgnored")} />
        <LegendDot color={STATUS_COLORS.CONVERTED} label={t("copilot.legendConverted")} />
      </div>
      <div ref={containerRef} className={`${heightClassName} w-full rounded-lg border border-border`} />
    </div>
  );
}

function LegendDot({ color, label, faded }: { color: string; label: string; faded?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-3 w-3 rounded-full border border-white"
        style={{ background: color, opacity: faded ? 0.45 : 1 }}
      />
      {label}
    </span>
  );
}
