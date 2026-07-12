"use client";

import type { AnalysisBlock } from "@/lib/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// The GPT decides WHAT to show by sending a block `type`; this registry is
// the only place that decides HOW it renders. Adding a new visualization —
// a real map, a proper chart library, whatever comes next — is one new
// entry here, nothing else in Analysis Studio changes. Payloads are
// intentionally read defensively (optional chaining, fallbacks): a
// malformed or unexpected payload degrades to an empty block, never a
// crash — the narrative text next to it is still a complete answer.

const MAX_TABLE_ROWS = 200;

function BlockFrame({ title, purpose, children }: { title?: string; purpose?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      {title && <h3 className="text-sm font-semibold">{title}</h3>}
      {children}
      {purpose && <p className="text-xs text-muted-foreground">{purpose}</p>}
    </div>
  );
}

function KpiCardsBlock({ block }: { block: AnalysisBlock }) {
  const payload = block.payload as { items?: { label: string; value: string | number; delta?: string }[] } | undefined;
  const items = payload?.items ?? [];
  if (items.length === 0) return null;

  return (
    <BlockFrame title={block.title} purpose={block.purpose}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((item, i) => (
          <div key={i} className="rounded-md border border-border bg-secondary/30 p-3">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="text-lg font-semibold tabular-nums">{item.value}</p>
            {item.delta && <p className="text-xs text-muted-foreground">{item.delta}</p>}
          </div>
        ))}
      </div>
    </BlockFrame>
  );
}

function TableBlock({ block }: { block: AnalysisBlock }) {
  const payload = block.payload as { columns?: { key: string; label: string }[]; rows?: Record<string, unknown>[] } | undefined;
  const columns = payload?.columns ?? [];
  const rows = payload?.rows ?? [];
  if (columns.length === 0) return null;

  return (
    <BlockFrame title={block.title} purpose={block.purpose}>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col.key}>{col.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.slice(0, MAX_TABLE_ROWS).map((row, i) => (
            <TableRow key={i}>
              {columns.map((col) => (
                <TableCell key={col.key}>{formatCell(row[col.key])}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length > MAX_TABLE_ROWS && (
        <p className="text-xs text-muted-foreground">Showing the first {MAX_TABLE_ROWS} of {rows.length} rows.</p>
      )}
    </BlockFrame>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  return String(value);
}

// Covers heat maps and any other geo/HTML visualization: the GPT sends
// rendered HTML, the platform never generates or interprets it — just
// isolates it. `sandbox="allow-scripts"` with NO `allow-same-origin` means
// this content cannot read our cookies/localStorage, cannot navigate the
// parent page, and runs with a null/opaque origin — the standard-safe way
// to render untrusted (here: AI-generated) HTML.
function HtmlArtifactBlock({ block }: { block: AnalysisBlock }) {
  const payload = block.payload as { html?: string } | undefined;
  const html = payload?.html;
  if (!html) return null;

  return (
    <BlockFrame title={block.title} purpose={block.purpose}>
      <iframe
        sandbox="allow-scripts"
        srcDoc={html}
        className="h-[420px] w-full rounded-md border border-border bg-white"
        title={block.title ?? block.type}
      />
    </BlockFrame>
  );
}

function UnsupportedBlock({ block }: { block: AnalysisBlock }) {
  return (
    <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
      This response included a &quot;{block.type}&quot; visualization this version of Analysis Studio doesn&apos;t know how to
      render yet.
    </div>
  );
}

const REGISTRY: Record<string, React.ComponentType<{ block: AnalysisBlock }>> = {
  KPICards: KpiCardsBlock,
  Table: TableBlock,
  SalesTable: TableBlock,
  LostSales: TableBlock,
  CrossSell: TableBlock,
  Collections: TableBlock,
  HtmlArtifact: HtmlArtifactBlock,
  HeatMap: HtmlArtifactBlock,
  GeoOpportunityMap: HtmlArtifactBlock,
};

export function AnalysisBlockRenderer({ block }: { block: AnalysisBlock }) {
  const Component = REGISTRY[block.type] ?? UnsupportedBlock;
  return <Component block={block} />;
}
