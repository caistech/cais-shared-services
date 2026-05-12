/**
 * Derive AS4055 wind region (A, B, C, D, or sub-region like A2) from lat/lng.
 * GeoJSON-only — no fallback (wind region cannot be approximated from lat alone).
 */

import { findFeatureContainingPoint } from "./geo-utils";
import type { CachedLoader } from "./loader";

export const WIND_DATASET = "wind_regions.geojson";

export interface WindResult {
  wind_region: string | null;
}

export async function deriveWindRegion(
  loader: CachedLoader,
  lat: number,
  lng: number
): Promise<WindResult> {
  const data = await loader.load(WIND_DATASET);
  if (!data) return { wind_region: null };

  const feature = findFeatureContainingPoint(data, lat, lng);
  if (!feature) return { wind_region: null };

  const region =
    (feature.properties?.REGION as string) ??
    (feature.properties?.region as string) ??
    (feature.properties?.wind_region as string) ??
    null;
  return { wind_region: region };
}
