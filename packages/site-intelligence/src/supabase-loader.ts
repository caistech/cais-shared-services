/**
 * Convenience loader that pulls GeoJSON datasets from a Supabase Storage bucket.
 *
 * This is the most common consumer pattern (both Checkpoint and MMCBuild use
 * Supabase Storage). For other backends (fs, S3, fetch), pass your own
 * GeoJSONLoader to createSiteIntel.
 */

import type { GeoJSONLoader } from "./loader.js";
import type { GeoJSONFeatureCollection } from "./geo-utils.js";

/**
 * Minimal Supabase client shape — accepts the real `@supabase/supabase-js`
 * client without importing it as a hard dep. Keeps the package light.
 */
export interface SupabaseStorageClient {
  storage: {
    from(bucket: string): {
      download(path: string): Promise<{
        data: Blob | null;
        error: { message: string } | null;
      }>;
    };
  };
}

export function createSupabaseLoader(opts: {
  client: SupabaseStorageClient;
  bucket: string;
  /** Optional logger; defaults to console */
  logger?: (level: "info" | "warn" | "error", message: string) => void;
}): GeoJSONLoader {
  const log = opts.logger ?? ((level, msg) => {
    if (level === "error") console.error(`[site-intel] ${msg}`);
    else if (level === "warn") console.warn(`[site-intel] ${msg}`);
    else console.log(`[site-intel] ${msg}`);
  });

  return async (datasetName: string): Promise<GeoJSONFeatureCollection | null> => {
    try {
      const { data, error } = await opts.client.storage
        .from(opts.bucket)
        .download(datasetName);
      if (error || !data) {
        log("error", `Failed to load ${datasetName}: ${error?.message ?? "no data"}`);
        return null;
      }
      const text = await data.text();
      const parsed = JSON.parse(text) as GeoJSONFeatureCollection;
      log("info", `Loaded ${parsed.features?.length ?? 0} features from ${datasetName}`);
      return parsed;
    } catch (e) {
      log("error", `Error loading ${datasetName}: ${(e as Error).message}`);
      return null;
    }
  };
}
