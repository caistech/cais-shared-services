/**
 * Derive NatHERS climate zone (1-8) from lat/lng.
 *
 * Resolution order:
 *   1. GeoJSON point-in-polygon (precise)
 *   2. Latitude-based approximation fallback (lossy but always available)
 *
 * Property fallbacks accommodate datasets with varying field naming —
 * climate_description, CLIMATE_DESCRIPTION, zone, ZONE, climate_zone — all map
 * to the same canonical number.
 */

import { findFeatureContainingPoint } from "./geo-utils";
import type { CachedLoader } from "./loader";

export const CLIMATE_DATASET = "climate_clean.geojson";

/** Latitude-based fallback approximation for AU climate zones 1-8 */
export function deriveClimateZoneFromLatitude(lat: number): number {
  if (lat > -12) return 1;
  if (lat > -20) return 2;
  if (lat > -23.5) return 3;
  if (lat > -27) return 4;
  if (lat > -31) return 5;
  if (lat > -35) return 6;
  if (lat > -39) return 7;
  return 8;
}

function parseZoneFromProperties(properties: Record<string, unknown>): number | null {
  const desc =
    (properties?.climate_description as string) ??
    (properties?.CLIMATE_DESCRIPTION as string) ??
    (properties?.zone as string) ??
    (properties?.ZONE as string) ??
    (properties?.climate_zone as string) ??
    null;
  if (!desc) return null;
  const match = String(desc).match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

export interface ClimateResult {
  climate_zone: number;
  source: "geojson" | "latitude_approx";
}

export async function deriveClimateZone(
  loader: CachedLoader,
  lat: number,
  lng: number
): Promise<ClimateResult> {
  const data = await loader.load(CLIMATE_DATASET);
  if (data) {
    const feature = findFeatureContainingPoint(data, lat, lng);
    if (feature) {
      const zone = parseZoneFromProperties(feature.properties);
      if (zone && zone >= 1 && zone <= 8) {
        return { climate_zone: zone, source: "geojson" };
      }
    }
  }
  return {
    climate_zone: deriveClimateZoneFromLatitude(lat),
    source: "latitude_approx",
  };
}
