"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Map as LeafletMap, CircleMarker } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, Treemap, XAxis, YAxis } from "recharts";
import { HeatmapMap } from "@/components/heatmap/heatmap-map";
import type { Fsos360VisualizationData } from "@/lib/types";

const COLORS = ["#2563eb", "#0f766e", "#c2410c", "#7c3aed", "#be123c", "#0891b2", "#4d7c0f"];

function GeoPointsMap({ data }: { data: Extract<Fsos360VisualizationData, { kind: "geo-points" }> }) {
  const ref = useRef<HTMLDivElement>(null); const map = useRef<LeafletMap | null>(null); const markers = useRef<CircleMarker[]>([]);
  useEffect(() => { if (!ref.current || map.current) return; let cancelled = false; (async () => { const L = (await import("leaflet")).default; if (cancelled || !ref.current) return; const instance = L.map(ref.current).setView([21.6, 39.19], 9); L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", { attribution: "? OpenStreetMap ? CARTO", subdomains: "abcd", maxZoom: 20 }).addTo(instance); map.current = instance; })(); return () => { cancelled = true; map.current?.remove(); map.current = null; }; }, []);
  useEffect(() => { if (!map.current) return; let cancelled = false; (async () => { const L = (await import("leaflet")).default; if (cancelled || !map.current) return; markers.current.forEach((item) => item.remove()); markers.current = []; const max = Math.max(...data.points.map((point) => point.value), 1); const bounds: [number, number][] = []; data.points.forEach((point) => { const marker = L.circleMarker([point.latitude, point.longitude], { radius: Math.max(5, Math.min(18, 5 + (point.value / max) * 13)), color: "#ffffff", weight: 1.5, fillColor: "#2563eb", fillOpacity: 0.78 }).bindPopup(`<b>${point.customerName}</b>`).addTo(map.current!); markers.current.push(marker); bounds.push([point.latitude, point.longitude]); }); if (bounds.length) map.current.fitBounds(bounds, { padding: [28, 28] }); })(); return () => { cancelled = true; }; }, [data]);
  return <div ref={ref} className="h-[420px] w-full rounded-lg border border-border" />;
}

function TreemapTile(props: { x?: number; y?: number; width?: number; height?: number; index?: number; name?: string }) { const { x = 0, y = 0, width = 0, height = 0, index = 0, name = "" } = props; return <g><rect x={x} y={y} width={width} height={height} fill={COLORS[index % COLORS.length]} stroke="hsl(var(--card))" strokeWidth={2} />{width > 60 && height > 28 && <text x={x + width / 2} y={y + height / 2} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={11}>{name}</text>}</g>; }

export function Fsos360VisualizationCanvas({ data }: { data: Fsos360VisualizationData }) {
  const chart = useMemo(() => data.kind === "series" ? data.series : [], [data]);
  if (data.kind === "series") return <ResponsiveContainer width="100%" height={420}><LineChart data={chart}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} /><YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} /><Tooltip /><Legend /><Line type="monotone" dataKey="current" name="Current" stroke="#2563eb" strokeWidth={2.5} dot={false} /><Line type="monotone" dataKey="comparison" name="Comparison" stroke="#0f766e" strokeWidth={2} strokeDasharray="5 4" dot={false} /></LineChart></ResponsiveContainer>;
  if (data.kind === "categories") return <ResponsiveContainer width="100%" height={420}><BarChart data={data.items} margin={{ top: 16, right: 16, bottom: 64, left: 8 }}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="label" interval={0} angle={-35} textAnchor="end" height={72} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} /><YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} /><Tooltip /><Legend /><Bar dataKey="current" name="Current" fill="#2563eb" radius={[4, 4, 0, 0]} /><Bar dataKey="previous" name="Comparison" fill="#0f766e" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>;
  if (data.kind === "treemap") return <ResponsiveContainer width="100%" height={420}><Treemap data={data.items} dataKey="value" nameKey="label" content={<TreemapTile />}><Tooltip /></Treemap></ResponsiveContainer>;
  if (data.metric === "sales" || data.metric === "collections" || data.metric === "returns") return <HeatmapMap points={data.points.map((point) => ({ id: point.customerCode, label: point.customerName, lat: point.latitude, lon: point.longitude, value: point.value }))} maxValue={Math.max(...data.points.map((point) => point.value), 0)} />;
  return <GeoPointsMap data={data} />;
}
