/**
 * @caistech/site-intelligence
 *
 * Australian site intelligence from lat/lng — NatHERS climate zone, AS4055 wind
 * region, LGA/council. Storage-agnostic core: callers provide a GeoJSON loader.
 * See ./supabase-loader for a Supabase Storage convenience adapter.
 */

import { CachedLoader, type GeoJSONLoader } from "./loader";
import { deriveClimateZone } from "./climate";
import { deriveWindRegion } from "./wind-region";
import { deriveCouncil } from "./council";

export interface SiteIntelResult {
  climate_zone: number | null;
  climate_zone_source: "geojson" | "latitude_approx" | null;
  wind_region: string | null;
  council_name: string | null;
  council_code: string | null;
  /** Reserved for future BAL/zoning enrichment */
  bal_rating: string | null;
  zoning: string | null;
}

/**
 * Site intelligence orchestrator — derives climate, wind, and council in
 * parallel. Returns null for any field that couldn't be resolved.
 *
 * @example
 * import { createSiteIntel } from "@caistech/site-intelligence";
 * import { createSupabaseLoader } from "@caistech/site-intelligence/supabase-loader";
 *
 * const intel = createSiteIntel({ loader: createSupabaseLoader({ client, bucket: "site-data" }) });
 * const result = await intel.derive(-33.8688, 151.2093);
 */
export function createSiteIntel(opts: { loader: GeoJSONLoader }) {
  const cached = new CachedLoader(opts.loader);

  return {
    cache: cached,
    async derive(lat: number, lng: number): Promise<SiteIntelResult> {
      const [climate, wind, council] = await Promise.all([
        deriveClimateZone(cached, lat, lng).catch(() => null),
        deriveWindRegion(cached, lat, lng).catch(() => ({ wind_region: null })),
        deriveCouncil(cached, lat, lng).catch(() => ({
          council_name: null,
          council_code: null,
        })),
      ]);
      return {
        climate_zone: climate?.climate_zone ?? null,
        climate_zone_source: climate?.source ?? null,
        wind_region: wind.wind_region,
        council_name: council.council_name,
        council_code: council.council_code,
        bal_rating: null,
        zoning: null,
      };
    },
    deriveClimate: (lat: number, lng: number) => deriveClimateZone(cached, lat, lng),
    deriveWind: (lat: number, lng: number) => deriveWindRegion(cached, lat, lng),
    deriveCouncil: (lat: number, lng: number) => deriveCouncil(cached, lat, lng),
  };
}

// Re-exports for advanced usage
export {
  pointInPolygon,
  pointInMultiPolygon,
  findFeatureContainingPoint,
  type GeoJSONFeature,
  type GeoJSONFeatureCollection,
  type Point,
} from "./geo-utils";
export { CachedLoader, type GeoJSONLoader } from "./loader";
export {
  deriveClimateZone,
  deriveClimateZoneFromLatitude,
  CLIMATE_DATASET,
  type ClimateResult,
} from "./climate";
export {
  deriveWindRegion,
  WIND_DATASET,
  type WindResult,
} from "./wind-region";
export {
  deriveCouncil,
  COUNCIL_DATASET,
  type CouncilResult,
} from "./council";
