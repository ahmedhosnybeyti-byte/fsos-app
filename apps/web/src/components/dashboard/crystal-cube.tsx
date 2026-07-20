import type { LucideIcon } from "lucide-react";

// FSOS Design Constitution §3.2/§4.1 "Crystal Objects" — a real isometric,
// three-face pseudo-3D cube (top = brightest, left/right = progressively
// shaded), matching the "مجسمات بلورية، وليست أيقونات مسطحة" requirement
// far more literally than a flat icon in a tinted circle. Pure inline SVG
// (no image asset pipeline available in this environment — see the
// visual-elevation v3 follow-up note), colored entirely via `currentColor`
// so callers keep using the existing text-{token} pattern (text-primary,
// text-ai, ...) already used everywhere else on this screen. A small
// Lucide icon is overlaid on the top face for context, exactly like the
// reference (AI Crystal/Sales Cube/Geo Pin all carry a small glyph on
// their top face).
export function CrystalCube({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <div className={className}>
      <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id="cc-edge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0.9" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Right face — darkest */}
        <path d="M85 30 L50 50 L50 90 L85 70 Z" fill="currentColor" fillOpacity="0.35" />
        {/* Left face — mid */}
        <path d="M15 30 L50 50 L50 90 L15 70 Z" fill="currentColor" fillOpacity="0.6" />
        {/* Top face — brightest, catches the "light" */}
        <path d="M50 8 L86 29 L50 50 L14 29 Z" fill="currentColor" fillOpacity="0.95" />
        {/* Thin bright edges (§3.2) tracing the top face only */}
        <path d="M50 8 L86 29 L50 50 L14 29 Z" fill="none" stroke="url(#cc-edge)" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex items-start justify-center pt-[26%]">
        <Icon className="h-[26%] w-[26%] text-white drop-shadow-sm" strokeWidth={2.25} />
      </div>
    </div>
  );
}
