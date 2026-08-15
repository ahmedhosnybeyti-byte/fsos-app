import { haversineKm, type LatLon } from "../../route-planning/route-balancer.util";

// This is deliberately separate from provider-specific request construction:
// it is the final authority for which discovery results may be persisted and
// returned to the Visit Copilot screen.
export function isWithinDiscoveryRadius(center: LatLon, point: LatLon, radiusMeters: number): boolean {
  // Keep the inclusive boundary exact in intent while absorbing only
  // floating-point round-off (far below a millimetre), never a real place.
  return haversineKm(center, point) * 1000 <= radiusMeters + 0.000001;
}
