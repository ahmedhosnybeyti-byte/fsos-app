import { useState } from "react";
import {
  MapPin, Crosshair, Keyboard, Building2, Star, TrendingUp,
  Package, AlertTriangle, ChevronRight, Check, Navigation,
  Zap, Target, Users, ShoppingCart, Camera, Clipboard,
  RefreshCw, CheckCircle2, ArrowRight, Signal, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────
interface NearbyCustomer {
  id: number; name: string; distance: string; distKm: number;
  classification: "A" | "B" | "C"; territory: string; type: string;
  revenueMtd: number; mapX: string; mapY: string;
}

// ── Mock data ──────────────────────────────────────────────────────────────
const NEARBY: NearbyCustomer[] = [
  { id: 1, name: "Carrefour – Marina Mall",   distance: "0.3 km", distKm: 0.3, classification: "A", territory: "Dubai North", type: "Hypermarket",    revenueMtd: 145200, mapX: "50%", mapY: "27%" },
  { id: 2, name: "Spinneys – Marina Walk",    distance: "0.8 km", distKm: 0.8, classification: "A", territory: "Dubai North", type: "Supermarket",    revenueMtd: 89500,  mapX: "66%", mapY: "36%" },
  { id: 3, name: "Al Maya – Dubai Marina",    distance: "1.2 km", distKm: 1.2, classification: "B", territory: "Dubai North", type: "Supermarket",    revenueMtd: 42300,  mapX: "35%", mapY: "60%" },
  { id: 4, name: "Zoom Convenience – JBR",    distance: "1.9 km", distKm: 1.9, classification: "C", territory: "Dubai North", type: "Convenience",    revenueMtd: 12100,  mapX: "57%", mapY: "70%" },
  { id: 5, name: "Waitrose – JBR Walk",       distance: "2.1 km", distKm: 2.1, classification: "A", territory: "Dubai North", type: "Premium Super",  revenueMtd: 78600,  mapX: "76%", mapY: "52%" },
];

const FIRST_ORDER = [
  { sku: "HPC-001", name: "Ariel Liquid 2L",            category: "Laundry",       qty: 4, unit: "cases", reason: "#1 seller within 500m radius — carried by all 3 Class-A neighbours.",     confidence: 94, value: 2240 },
  { sku: "BEV-012", name: "Nescafé Classic 200g",        category: "Beverages",     qty: 3, unit: "cases", reason: "High velocity in this zone. Current gap vs. territory Nescafé target.",  confidence: 89, value: 1620 },
  { sku: "DAI-003", name: "Almarai UHT Full Cream 1L",   category: "Dairy",         qty: 2, unit: "cases", reason: "Dairy gap detected — no Almarai distribution within 400m radius.",       confidence: 85, value: 960  },
  { sku: "HPC-004", name: "Head & Shoulders 400ml",      category: "Personal Care", qty: 2, unit: "cases", reason: "Low competitor presence in personal care. Shelf gap opportunity.",       confidence: 78, value: 1080 },
  { sku: "SNK-007", name: "Lay's Max 180g",              category: "Snacks",        qty: 3, unit: "cases", reason: "Q3 summer promo momentum. Adjacent stores report +40% uplift.",          confidence: 72, value: 600  },
];

const STRATEGY = [
  { id: 1, icon: Users,       color: "text-blue-500",    bg: "bg-blue-500/10",    label: "Introduction",        action: "Introduce yourself and present the مرشدك partnership program",         note: "Reference 3 nearby Class-A partners: Carrefour Marina, Spinneys, Waitrose" },
  { id: 2, icon: ShoppingCart,color: "text-emerald-500", bg: "bg-emerald-500/10", label: "Lead SKU",            action: "Open with Ariel Liquid 2L — highest demand in this zone",            note: "Use 'All your neighbours carry it' proof point. Confidence: 94%" },
  { id: 3, icon: Package,     color: "text-violet-500",  bg: "bg-violet-500/10",  label: "Bundle Pitch",        action: "Present Nescafé Classic + Almarai bundle as a category starter pack",  note: "Combined order value: AED 2,580 · Basket affinity score: 0.89" },
  { id: 4, icon: Clipboard,   color: "text-amber-500",   bg: "bg-amber-500/10",   label: "Competitor Audit",    action: "Capture competitor shelf data — Persil? Nescafé pricing? Facings?",    note: "Use مرشدك shelf audit form. Record brand, facings, and retail price" },
  { id: 5, icon: Camera,      color: "text-pink-500",    bg: "bg-pink-500/10",    label: "Store Photos",        action: "Capture 3 store photos: entrance, main shelf, competitor section",     note: "Required for new customer file. Flag any planogram opportunities." },
  { id: 6, icon: Target,      color: "text-primary",     bg: "bg-primary/10",     label: "Commitment",          action: "Agree on next visit date and collect buyer contact information",         note: "Target: follow-up within 3–5 business days. Aim for a second order." },
];

const STEPS = [
  { id: 1, label: "Location" },
  { id: 2, label: "Nearby" },
  { id: 3, label: "AI Analysis" },
  { id: 4, label: "First Order" },
  { id: 5, label: "Strategy" },
];

// ── Utilities ──────────────────────────────────────────────────────────────
const CLS_BADGE: Record<string, string> = {
  A: "bg-amber-500/20 text-amber-700 border-amber-500/30",
  B: "bg-blue-500/15 text-blue-700 border-blue-500/25",
  C: "bg-muted text-muted-foreground border-border",
};

function ClassBadge({ cls }: { cls: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-bold", CLS_BADGE[cls])}>
      <Star className="h-2.5 w-2.5" />{cls}
    </span>
  );
}

// ── Tactical Map ──────────────────────────────────────────────────────────
function TacticalMap({ step, showPins }: { step: number; showPins: boolean }) {
  return (
    <div className="relative w-full h-56 rounded-xl overflow-hidden bg-slate-950 border border-slate-800 select-none">
      {/* Grid */}
      <div className="absolute inset-0" style={{
        backgroundImage: "linear-gradient(rgba(71,85,105,0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(71,85,105,0.25) 1px, transparent 1px)",
        backgroundSize: "36px 36px",
      }} />
      {/* Zone rings */}
      {[140, 96, 52].map((r, i) => (
        <div key={i} className="absolute rounded-full border border-blue-500/10 pointer-events-none"
          style={{ width: r * 2, height: r * 2, left: `calc(50% - ${r}px)`, top: `calc(50% - ${r}px)` }} />
      ))}
      {/* Range labels */}
      <span className="absolute text-[9px] text-blue-400/40 font-mono" style={{ left: "calc(50% + 54px)", top: "calc(50% - 6px)" }}>0.5km</span>
      <span className="absolute text-[9px] text-blue-400/30 font-mono" style={{ left: "calc(50% + 98px)", top: "calc(50% - 6px)" }}>1km</span>

      {/* Nearby pins */}
      {showPins && NEARBY.map((c) => (
        <div key={c.id} className="absolute flex flex-col items-center gap-0.5 pointer-events-none"
          style={{ left: c.mapX, top: c.mapY, transform: "translate(-50%, -100%)" }}>
          <div className={cn(
            "px-1.5 py-0.5 rounded text-[9px] font-bold border whitespace-nowrap",
            c.classification === "A" ? "bg-amber-500/80 text-white border-amber-400/50" :
            c.classification === "B" ? "bg-blue-500/80 text-white border-blue-400/50" :
            "bg-slate-600/80 text-white border-slate-500/50"
          )}>{c.name.split("–")[0].trim()}</div>
          <div className={cn("h-2 w-0.5",
            c.classification === "A" ? "bg-amber-500" : c.classification === "B" ? "bg-blue-500" : "bg-slate-500"
          )} />
          <div className={cn("h-2 w-2 rounded-full",
            c.classification === "A" ? "bg-amber-500" : c.classification === "B" ? "bg-blue-500" : "bg-slate-500"
          )} />
        </div>
      ))}

      {/* Current location */}
      <div className="absolute" style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}>
        <div className="relative flex items-center justify-center">
          <div className="absolute h-8 w-8 rounded-full border-2 border-blue-400/40 animate-ping" />
          <div className="absolute h-5 w-5 rounded-full border border-blue-400/60" />
          <div className="h-3 w-3 rounded-full bg-blue-500 shadow-lg shadow-blue-500/50" />
        </div>
      </div>

      {/* Corner HUD */}
      <div className="absolute top-2.5 left-2.5 text-[9px] font-mono text-blue-400/60 leading-relaxed">
        <div>25.0765°N</div>
        <div>55.1316°E</div>
        {step >= 2 && <div className="text-emerald-400/70 mt-0.5">{NEARBY.length} outlets</div>}
      </div>
      <div className="absolute top-2.5 right-2.5 flex items-center gap-1 text-[9px] font-mono text-emerald-400/70">
        <Signal className="h-3 w-3" /> GPS LOCK
      </div>
      <div className="absolute bottom-2.5 right-2.5 text-[9px] font-mono text-slate-500">مرشدك GEO · Dubai North</div>
    </div>
  );
}

// ── Step 1: Location ──────────────────────────────────────────────────────
function Step1({ onNext }: { onNext: () => void }) {
  const [method, setMethod] = useState<"gps" | "manual" | null>(null);
  const [loading, setLoading] = useState(false);
  const [captured, setCaptured] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [lat, setLat] = useState("25.0765");
  const [lng, setLng] = useState("55.1316");

  function handleGps() {
    setMethod("gps");
    setLoading(true);
    setTimeout(() => { setLoading(false); setCaptured(true); }, 1800);
  }

  function handleManualConfirm() {
    if (lat && lng) setCaptured(true);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-foreground">Capture Customer Location</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Pinpoint the customer location to unlock AI geo intelligence for this visit.</p>
      </div>

      {/* Store name */}
      <div>
        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Store Name</label>
        <input
          value={storeName}
          onChange={(e) => setStoreName(e.target.value)}
          placeholder="e.g. Al Madina Supermarket – Marina"
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Method selector */}
      <div>
        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Capture Method</label>
        <div className="grid grid-cols-3 gap-3">
          {[
            { key: "gps",    icon: Crosshair, label: "Use GPS",    sub: "Auto-detect" },
            { key: "pin",    icon: MapPin,    label: "Map Pin",    sub: "Tap to place" },
            { key: "manual", icon: Keyboard,  label: "Manual",     sub: "Enter coords" },
          ].map(({ key, icon: Icon, label, sub }) => (
            <button
              key={key}
              onClick={() => { setMethod(key as "gps" | "manual"); if (key === "gps") handleGps(); }}
              className={cn(
                "flex flex-col items-center gap-2 p-3 rounded-xl border transition-all",
                method === key
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              <div className="text-center">
                <div className="text-xs font-semibold">{label}</div>
                <div className="text-[10px] opacity-70">{sub}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Map */}
      <TacticalMap step={captured ? 2 : 1} showPins={false} />

      {/* GPS state */}
      {method === "gps" && loading && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
          <RefreshCw className="h-5 w-5 text-primary animate-spin" />
          <div>
            <p className="text-sm font-semibold text-foreground">Acquiring GPS signal…</p>
            <p className="text-xs text-muted-foreground">Connecting to device GPS · Accuracy: ±3m</p>
          </div>
        </div>
      )}

      {/* Manual coords */}
      {method === "manual" && !captured && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Manual Coordinates</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Latitude</label>
              <input value={lat} onChange={(e) => setLat(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Longitude</label>
              <input value={lng} onChange={(e) => setLng(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
          </div>
          <button onClick={handleManualConfirm}
            className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
            Confirm Location
          </button>
        </div>
      )}

      {/* Captured state */}
      {captured && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
          <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Location captured</p>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">{lat}°N, {lng}°E · Dubai Marina, Dubai · ±3m accuracy</p>
            <p className="text-xs text-emerald-600 mt-1">AI Geo engine initialised · Scanning {NEARBY.length} nearby outlets</p>
          </div>
        </div>
      )}

      <button
        disabled={!captured || !storeName.trim()}
        onClick={onNext}
        className={cn(
          "w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all",
          captured && storeName.trim()
            ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/25"
            : "bg-muted text-muted-foreground cursor-not-allowed"
        )}
      >
        Scan Nearby Customers <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Step 2: Nearby ─────────────────────────────────────────────────────────
function Step2({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const sorted = [...NEARBY].sort((a, b) => a.distKm - b.distKm);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-foreground">Nearby Customers Detected</h2>
        <p className="text-sm text-muted-foreground mt-0.5">مرشدك identified {NEARBY.length} active outlets within 2.5km of your location.</p>
      </div>

      <TacticalMap step={2} showPins />

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {[["A", "bg-amber-500"], ["B", "bg-blue-500"], ["C", "bg-slate-500"]].map(([cls, bg]) => (
          <div key={cls} className="flex items-center gap-1.5">
            <div className={cn("h-2.5 w-2.5 rounded-full", bg)} />
            Class {cls}
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-blue-500 ring-2 ring-blue-400/40" />
          You
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30 px-4 py-2 border-b border-border">
          <div className="pr-4">Dist.</div>
          <div>Customer</div>
          <div className="px-4">Class</div>
          <div className="px-4">Territory</div>
          <div className="text-right">MTD Rev.</div>
        </div>
        {sorted.map((c) => (
          <div key={c.id} className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-0 items-center px-4 py-3 border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
            <div className="pr-4">
              <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-primary">
                <Navigation className="h-3 w-3" />{c.distance}
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{c.name}</p>
              <p className="text-[10px] text-muted-foreground">{c.type}</p>
            </div>
            <div className="px-4"><ClassBadge cls={c.classification} /></div>
            <div className="px-4 text-xs text-muted-foreground">{c.territory}</div>
            <div className="text-right text-xs font-bold text-foreground">AED {(c.revenueMtd / 1000).toFixed(0)}k</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3.5">
        <Zap className="h-4 w-4 text-primary shrink-0" />
        <p className="text-xs text-foreground">3 Class-A accounts within 1km — <span className="font-semibold text-primary">high-value zone confirmed.</span> AI is analysing purchasing patterns for this area.</p>
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="px-4 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">Back</button>
        <button onClick={onNext} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/25">
          Run AI Geo Analysis <Zap className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Step 3: AI Analysis ───────────────────────────────────────────────────
function Step3({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const cards = [
    {
      icon: Users, color: "text-emerald-600", bg: "bg-emerald-500/10", border: "border-emerald-500/20",
      title: "Nearest Successful Customers",
      content: (
        <div className="space-y-1.5">
          {NEARBY.filter(c => c.classification === "A").map(c => (
            <div key={c.id} className="flex items-center justify-between text-xs">
              <span className="text-foreground font-medium">{c.name}</span>
              <span className="text-emerald-600 font-bold">AED {(c.revenueMtd / 1000).toFixed(0)}k/mo</span>
            </div>
          ))}
          <div className="pt-1.5 border-t border-border text-xs text-muted-foreground">
            Avg MTD: <span className="font-semibold text-foreground">AED 104k</span> · Visit freq: <span className="font-semibold text-foreground">3×/week</span>
          </div>
        </div>
      ),
    },
    {
      icon: Package, color: "text-blue-600", bg: "bg-blue-500/10", border: "border-blue-500/20",
      title: "Top Selling Products in Area",
      content: (
        <div className="space-y-1.5">
          {["Ariel Liquid 2L", "Nescafé Classic 200g", "Almarai UHT 1L", "Head & Shoulders 400ml"].map((p, i) => (
            <div key={p} className="flex items-center gap-2 text-xs">
              <span className="h-4 w-4 rounded-full bg-blue-500/20 text-blue-700 text-[9px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
              <span className="text-foreground">{p}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      icon: ShoppingCart, color: "text-violet-600", bg: "bg-violet-500/10", border: "border-violet-500/20",
      title: "Recommended Starter Order",
      content: (
        <div className="space-y-2">
          <div className="text-2xl font-black text-foreground">AED 6,500</div>
          <div className="text-xs text-muted-foreground">Estimated starter order value · 5 SKUs</div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full w-[72%] rounded-full bg-violet-500" />
          </div>
          <div className="text-[10px] text-muted-foreground">72% confidence based on zone benchmarks</div>
        </div>
      ),
    },
    {
      icon: TrendingUp, color: "text-amber-600", bg: "bg-amber-500/10", border: "border-amber-500/20",
      title: "Expected Opportunity Level",
      content: (
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-foreground">82</span>
            <span className="text-sm text-muted-foreground">/ 100</span>
            <span className="ml-auto text-xs font-bold text-amber-600 bg-amber-500/15 border border-amber-500/25 px-2 py-0.5 rounded-full">HIGH</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full w-[82%] rounded-full bg-gradient-to-r from-amber-400 to-amber-600" />
          </div>
          <div className="text-xs text-muted-foreground">+14% vs. similar zone benchmarks</div>
        </div>
      ),
    },
    {
      icon: Shield, color: "text-emerald-600", bg: "bg-emerald-500/10", border: "border-emerald-500/20",
      title: "Risk Indicators",
      content: (
        <div className="space-y-1.5">
          {[
            { ok: true,  text: "Stable trade zone — JBR Walk commercial corridor" },
            { ok: true,  text: "No active exclusivity agreements detected in area" },
            { ok: true,  text: "3 Class-A active accounts confirm zone viability" },
            { ok: false, text: "Moderate competitor presence — Persil (2 stores)" },
          ].map((r, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              {r.ok
                ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                : <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />}
              <span className={r.ok ? "text-foreground" : "text-amber-600"}>{r.text}</span>
            </div>
          ))}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">AI Geo Intelligence</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Contextual analysis of {NEARBY.length} nearby accounts, zone benchmarks, and territory data.</p>
        </div>
        <span className="shrink-0 flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> LIVE
        </span>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.title} className={cn("rounded-xl border p-4 space-y-3", card.bg, card.border)}>
              <div className="flex items-center gap-2">
                <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center", card.bg)}>
                  <Icon className={cn("h-4 w-4", card.color)} />
                </div>
                <p className="text-sm font-bold text-foreground">{card.title}</p>
              </div>
              {card.content}
            </div>
          );
        })}
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="px-4 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">Back</button>
        <button onClick={onNext} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/25">
          Generate First Order Recommendation <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Step 4: First Order ───────────────────────────────────────────────────
function Step4({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const total = FIRST_ORDER.reduce((s, p) => s + p.value, 0);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-foreground">Suggested First Order</h2>
        <p className="text-sm text-muted-foreground mt-0.5">AI-generated starter SKU list based on zone performance, nearby accounts, and product gaps.</p>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        {/* Header */}
        <div className="hidden sm:grid sm:grid-cols-[1fr_auto_auto_auto] gap-0 px-4 py-2 bg-muted/30 border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <div>Product</div>
          <div className="px-4 text-center">Qty</div>
          <div className="px-4 text-center">Confidence</div>
          <div className="text-right">Est. Value</div>
        </div>

        {FIRST_ORDER.map((p, i) => (
          <div key={p.sku} className={cn(
            "p-4 border-b border-border last:border-0 hover:bg-muted/20 transition-colors",
          )}>
            <div className="sm:grid sm:grid-cols-[1fr_auto_auto_auto] sm:items-center gap-0">
              {/* Product info */}
              <div className="mb-2 sm:mb-0">
                <div className="flex items-center gap-2">
                  <span className="h-5 w-5 rounded bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                  <p className="text-sm font-semibold text-foreground">{p.name}</p>
                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{p.category}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 ml-7 leading-relaxed">{p.reason}</p>
              </div>

              {/* Qty */}
              <div className="sm:px-4 sm:text-center flex items-center gap-2 sm:flex-col sm:gap-0.5 mb-2 sm:mb-0">
                <span className="sm:hidden text-[10px] text-muted-foreground w-20">Quantity:</span>
                <span className="text-sm font-bold text-foreground">{p.qty} {p.unit}</span>
              </div>

              {/* Confidence */}
              <div className="sm:px-4 sm:text-center sm:flex sm:flex-col sm:items-center sm:gap-1 flex items-center gap-3 mb-2 sm:mb-0">
                <span className="sm:hidden text-[10px] text-muted-foreground w-20">Confidence:</span>
                <div className="flex flex-col items-center gap-1 flex-1 sm:flex-none sm:w-16">
                  <span className={cn("text-xs font-bold", p.confidence >= 85 ? "text-emerald-600" : p.confidence >= 75 ? "text-amber-600" : "text-muted-foreground")}>
                    {p.confidence}%
                  </span>
                  <div className="w-full sm:w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className={cn("h-full rounded-full", p.confidence >= 85 ? "bg-emerald-500" : p.confidence >= 75 ? "bg-amber-500" : "bg-muted-foreground")}
                      style={{ width: `${p.confidence}%` }} />
                  </div>
                </div>
              </div>

              {/* Value */}
              <div className="sm:text-right flex items-center gap-2 sm:flex-col sm:gap-0">
                <span className="sm:hidden text-[10px] text-muted-foreground w-20">Est. Value:</span>
                <span className="text-sm font-bold text-foreground">AED {p.value.toLocaleString()}</span>
              </div>
            </div>
          </div>
        ))}

        {/* Total row */}
        <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-t border-border">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShoppingCart className="h-4 w-4 text-primary" />
            Total Starter Order
          </div>
          <div className="text-right">
            <div className="text-lg font-black text-primary">AED {total.toLocaleString()}</div>
            <div className="text-[10px] text-muted-foreground">{FIRST_ORDER.length} SKUs · Based on zone benchmarks</div>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="px-4 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">Back</button>
        <button onClick={onNext} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/25">
          Generate Visit Strategy <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Step 5: Strategy ──────────────────────────────────────────────────────
function Step5({ onBack, onComplete }: { onBack: () => void; onComplete: () => void }) {
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
        <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        </div>
        <div>
          <h2 className="text-xl font-black text-foreground">Customer Created</h2>
          <p className="text-sm text-muted-foreground mt-1">Al Madina Supermarket has been added to your territory. First visit has been scheduled.</p>
        </div>
        <div className="w-full max-w-sm rounded-xl border border-border bg-card p-4 text-left space-y-2">
          {[
            ["Customer Code", "NEW-DXB-0047"],
            ["Territory",     "Dubai North"],
            ["First Visit",   "Jun 30, 2026 · 09:00 AM"],
            ["Starter Order", "AED 6,500 · 5 SKUs"],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{k}</span>
              <span className="font-semibold text-foreground">{v}</span>
            </div>
          ))}
        </div>
        <button onClick={onComplete} className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors">
          Go to Customer 360
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-foreground">Visit Strategy</h2>
        <p className="text-sm text-muted-foreground mt-0.5">AI-generated field action plan. Follow this sequence to maximise your first visit outcome.</p>
      </div>

      {/* Strategy steps */}
      <div className="space-y-3">
        {STRATEGY.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={s.id} className="flex gap-4">
              {/* Step number + line */}
              <div className="flex flex-col items-center shrink-0">
                <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center font-black text-sm border-2", s.bg, "border-border")}>
                  <Icon className={cn("h-4 w-4", s.color)} />
                </div>
                {i < STRATEGY.length - 1 && <div className="w-0.5 flex-1 bg-border mt-1.5 min-h-[16px]" />}
              </div>

              {/* Content */}
              <div className="flex-1 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn("text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded", s.color, s.bg)}>
                    Step {s.id} · {s.label}
                  </span>
                </div>
                <p className="text-sm font-semibold text-foreground">{s.action}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{s.note}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* CTA area */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Schedule First Visit</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Visit Date</label>
            <input type="date" defaultValue="2026-06-30"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Visit Time</label>
            <input type="time" defaultValue="09:00"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="px-4 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">Back</button>
        <button
          onClick={() => setDone(true)}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/25"
        >
          <CheckCircle2 className="h-4 w-4" /> Create Customer & Schedule Visit
        </button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────
export default function NewCustomer() {
  const [step, setStep] = useState(1);
  const next = () => setStep((s) => Math.min(s + 1, 5));
  const back = () => setStep((s) => Math.max(s - 1, 1));

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Page title */}
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <MapPin className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-black text-foreground">New Customer — Geo Intelligence</h1>
        </div>
        <p className="text-sm text-muted-foreground">مرشدك uses location intelligence to build your visit strategy before you even enter the store.</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center text-xs font-black border-2 transition-all",
                step > s.id  ? "bg-primary border-primary text-primary-foreground" :
                step === s.id ? "bg-primary/10 border-primary text-primary" :
                "bg-muted border-border text-muted-foreground"
              )}>
                {step > s.id ? <Check className="h-4 w-4" /> : s.id}
              </div>
              <span className={cn(
                "mt-1 text-[10px] font-medium whitespace-nowrap hidden sm:block",
                step === s.id ? "text-primary" : step > s.id ? "text-emerald-600" : "text-muted-foreground"
              )}>{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn("flex-1 h-0.5 mx-2 transition-colors", step > s.id ? "bg-primary" : "bg-border")} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        {step === 1 && <Step1 onNext={next} />}
        {step === 2 && <Step2 onNext={next} onBack={back} />}
        {step === 3 && <Step3 onNext={next} onBack={back} />}
        {step === 4 && <Step4 onNext={next} onBack={back} />}
        {step === 5 && <Step5 onBack={back} onComplete={() => setStep(1)} />}
      </div>

      {/* Footer note */}
      <p className="text-center text-[11px] text-muted-foreground">
        مرشدك Geo Intelligence · Location data is processed on-device and never shared externally.
      </p>
    </div>
  );
}
