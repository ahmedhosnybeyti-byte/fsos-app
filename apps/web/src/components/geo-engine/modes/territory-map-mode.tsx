"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { companiesApi } from "@/lib/api";
import { colorForRatio } from "../color-scale";
import { loadBoundaryIndex, resolveBoundaryAssetUrl, type BoundaryFeatureIndex } from "@/components/territory-intelligence/boundary-registry";
import { TerritoryMap, type TerritoryMapNode } from "@/components/territory-intelligence/territory-map";
import type { GeoPoint } from "@/lib/types";

// Geo Intelligence Engine — Territory/Choropleth mode (Phase 2). Per the
// client's explicit instruction (2026-07-22): do NOT generate approximate/
// convex-hull territory boundaries here — Territory Intelligence already
// has a real boundary system (real GeoJSON when available, an honest
// non-fake fallback shape otherwise, see boundary-registry.ts /
// territory-map.tsx). This mode is a thin adapter: convert this engine's
// city-grouped GeoPoint[] into the TerritoryMapNode[] shape that component
// already expects, and reuse it completely unchanged (via the new optional
// `colorForValue` prop added to it, so its own Territory Intelligence
// caller is unaffected).
//
// Unlike the other 3 modes, this one does NOT mount on GeoMapCanvas —
// TerritoryMap owns its own Leaflet map lifecycle already (a second,
// separate map instance). The engine's page.tsx swaps between "GeoMapCanvas
// + a Heat/Bubble/Cluster mode" and "this component" depending on the
// active mode, rather than trying to force TerritoryMap onto the shared
// canvas primitive — that migration is future work, not required to prove
// this mode's data pipeline works.
export function TerritoryMapMode({ points, onPointClick }: { points: GeoPoint[]; onPointClick?: (point: GeoPoint) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const companyProfileQuery = useQuery({ queryKey: ["companies", "profile"], queryFn: companiesApi.getProfile });
  const boundaryAssetUrl = resolveBoundaryAssetUrl(companyProfileQuery.data?.country);
  const boundaryIndexQuery = useQuery({
    queryKey: ["territory-boundary-index", boundaryAssetUrl],
    queryFn: () => (boundaryAssetUrl ? loadBoundaryIndex(boundaryAssetUrl) : Promise.resolve<BoundaryFeatureIndex>({ byName: new Map() })),
    enabled: companyProfileQuery.isSuccess,
  });

  const nodes: TerritoryMapNode[] = useMemo(
    () => points.map((p) => ({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, healthScore: null, metricValue: p.value, raw: undefined })),
    [points],
  );

  const maxValue = useMemo(() => nodes.reduce((m, n) => Math.max(m, n.metricValue), 0), [nodes]);

  return (
    <TerritoryMap
      nodes={nodes}
      isPolygonLevel
      activeMetric="healthScore"
      selectedNodeId={selectedId}
      onSelectNode={(id) => {
        setSelectedId(id);
        if (onPointClick) {
          const point = points.find((p) => p.id === id);
          if (point) onPointClick(point);
        }
      }}
      boundaryIndex={boundaryIndexQuery.data ?? null}
      colorForValue={(node) => colorForRatio(maxValue > 0 ? node.metricValue / maxValue : 0)}
    />
  );
}
