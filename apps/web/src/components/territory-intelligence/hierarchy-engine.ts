"use client";

// Generic, N-level, config-driven drill-down engine for Territory
// Intelligence. The client mandated a Country -> Region -> City -> District
// -> Route -> Customer drill-down; FSOS's real data only cleanly supports
// City -> Customer without inventing data or new backend endpoints (client
// explicitly approved this scoped-down V1), ON THE CONDITION that the engine
// itself is generic — not hardcoded to 2 levels — so more levels (Region,
// District, Route, ...) can be inserted later purely via config (a new
// HierarchyLevelDef + its fetchNodes), with no changes to this file, the map
// component, or the drill-path state machine below.
//
// This file intentionally does NOT special-case "city" or "customer"
// anywhere except inside buildTerritoryHierarchyLevels, which is the one
// place V1's concrete 2-level config lives. useTerritoryHierarchy itself only
// ever talks in terms of `levels[currentLevelIndex]` / `drillPath`.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { heatmapApi } from "@/lib/api";
import type { TerritorySummaryItem } from "@/lib/types";
import type { TranslationKey } from "@/lib/i18n/dictionaries";

export interface HierarchyLevelNode {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** 0-100 or null — drives default polygon/marker color at this level, if this level has one. City level: healthScore. Customer level: null (customers don't have a health score). */
  healthScore: number | null;
  /** A generic secondary metric for display (sales value, customer count, etc.) — level-specific meaning, just carried through for the UI to label appropriately. */
  metricValue: number;
  /** Only present for levels whose nodes are genuine territory polygons (not point-level leaves like Customer) — the raw TerritorySummaryItem this node was built from, so the panel/UI can show full detail without a second lookup. Undefined for leaf/point levels. */
  raw?: unknown;
}

export interface HierarchyLevelDef {
  /** Stable machine key, e.g. "city", "customer". Future levels: "route", "district", "region", "country". */
  key: string;
  /** Translation key for this level's breadcrumb/UI label (e.g. "territoryIntelligence.levelCity"). */
  labelKey: TranslationKey;
  /** Whether nodes at this level render as filled polygons (true) or point markers (false) on the map — Customer-level nodes are single points, not areas. */
  isPolygonLevel: boolean;
  /** Fetch this level's nodes. `parentId` is the id of the node drilled into at the PARENT level (undefined for the root level). */
  fetchNodes: (parentId: string | undefined, parentName: string | undefined) => Promise<HierarchyLevelNode[]>;
}

// V1 concrete config: City (polygon, from already-fetched territory summary
// data — not re-fetched) -> Customer (point, from the existing heatmap
// endpoint scoped to the drilled-into city's name). Adding a level between
// or after these is purely additive: insert another HierarchyLevelDef here
// (or splice one into the array at the call site) with its own fetchNodes.
export function buildTerritoryHierarchyLevels(cityTerritories: TerritorySummaryItem[]): HierarchyLevelDef[] {
  return [
    {
      key: "city",
      labelKey: "territoryIntelligence.levelCity",
      isPolygonLevel: true,
      fetchNodes: async () =>
        cityTerritories.map((t) => ({
          id: t.id,
          name: t.name,
          lat: t.lat,
          lon: t.lon,
          healthScore: t.healthScore,
          metricValue: t.opportunityValueSar,
          raw: t,
        })),
    },
    {
      key: "customer",
      labelKey: "territoryIntelligence.levelCustomer",
      isPolygonLevel: false,
      fetchNodes: async (_parentId, parentName) => {
        if (!parentName) return [];
        const result = await heatmapApi.query({ metric: "sales", scopeField: "City", scopeValues: [parentName] });
        return result.points.map((p) => ({
          id: p.id,
          name: p.label,
          lat: p.lat,
          lon: p.lon,
          healthScore: null,
          metricValue: p.value,
        }));
      },
    },
  ];
}

export interface DrillPathEntry {
  levelIndex: number;
  nodeId: string;
  nodeName: string;
}

export interface UseTerritoryHierarchyResult {
  drillPath: DrillPathEntry[];
  currentLevel: HierarchyLevelDef;
  nodes: HierarchyLevelNode[];
  isLoading: boolean;
  isError: boolean;
  drillInto: (nodeId: string, nodeName: string) => void;
  goToLevel: (index: number) => void;
  canDrillDeeper: boolean;
}

// The reusable "engine" — the orchestrator's page.tsx calls this with
// buildTerritoryHierarchyLevels(citySummaryData) once city data has loaded,
// and drives the map/breadcrumb/panel off its return value. No breadcrumb UI
// lives here (that belongs to the sibling component being built in
// parallel) — this hook is purely the state machine + data fetch.
export function useTerritoryHierarchy(levels: HierarchyLevelDef[]): UseTerritoryHierarchyResult {
  const [drillPath, setDrillPath] = useState<DrillPathEntry[]>([]);

  // Clamp so a drillPath left over from a config with more levels (or any
  // out-of-range state) never indexes past the end of a shorter `levels`
  // array — defensive, since `levels` can change identity across renders
  // (e.g. while city data is still loading, buildTerritoryHierarchyLevels
  // may be called with an empty/partial array upstream).
  const rawIndex = drillPath.length;
  const currentLevelIndex = Math.min(rawIndex, Math.max(levels.length - 1, 0));
  const currentLevel = levels[currentLevelIndex] as HierarchyLevelDef;

  const parentEntry = drillPath.at(-1);
  const parentId = parentEntry?.nodeId;
  const parentName = parentEntry?.nodeName;

  const query = useQuery({
    queryKey: ["territory-hierarchy", currentLevelIndex, parentEntry?.nodeId],
    queryFn: () => currentLevel.fetchNodes(parentId, parentName),
    enabled: Boolean(currentLevel),
  });

  const nodes = useMemo(() => query.data ?? [], [query.data]);

  const canDrillDeeper = currentLevelIndex + 1 < levels.length;

  function drillInto(nodeId: string, nodeName: string) {
    if (!canDrillDeeper) return;
    setDrillPath((prev) => [...prev, { levelIndex: currentLevelIndex + 1, nodeId, nodeName }]);
  }

  function goToLevel(index: number) {
    setDrillPath((prev) => prev.slice(0, Math.max(index, 0)));
  }

  return {
    drillPath,
    currentLevel,
    nodes,
    isLoading: query.isLoading,
    isError: query.isError,
    drillInto,
    goToLevel,
    canDrillDeeper,
  };
}
