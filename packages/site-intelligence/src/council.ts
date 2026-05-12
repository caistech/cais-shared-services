/**
 * Derive council/LGA (Local Government Area) from lat/lng via GeoJSON point-in-polygon.
 */

import { findFeatureContainingPoint } from "./geo-utils";
import type { CachedLoader } from "./loader";

export const COUNCIL_DATASET = "council_clean.geojson";

export interface CouncilResult {
  council_name: string | null;
  council_code: string | null;
}

export async function deriveCouncil(
  loader: CachedLoader,
  lat: number,
  lng: number
): Promise<CouncilResult> {
  const data = await loader.load(COUNCIL_DATASET);
  if (!data) return { council_name: null, council_code: null };

  const feature = findFeatureContainingPoint(data, lat, lng);
  if (!feature) return { council_name: null, council_code: null };

  const props = feature.properties;
  const rawName =
    props?.lga_name ?? props?.LGA_NAME ?? props?.council_name ?? props?.name;
  const rawCode =
    props?.council_code ?? props?.LGA_CODE ?? props?.lga_code;

  const council_name = Array.isArray(rawName)
    ? (rawName[0] as string)
    : (rawName as string) ?? null;
  const council_code = Array.isArray(rawCode)
    ? (rawCode[0] as string)
    : (rawCode as string) ?? null;

  return { council_name, council_code };
}
