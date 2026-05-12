/**
 * GeoJSON loader abstraction.
 *
 * The package is STORAGE-AGNOSTIC at its core. Callers provide a loader — a
 * function that returns a GeoJSONFeatureCollection for a given dataset name.
 * The package handles caching + concurrency (one in-flight load at a time).
 *
 * The bundled `supabase-loader` (./supabase-loader) is a convenience adapter
 * for Supabase Storage. Use a different loader for fs, fetch, S3, etc.
 */

import type { GeoJSONFeatureCollection } from "./geo-utils";

export type GeoJSONLoader = (datasetName: string) => Promise<GeoJSONFeatureCollection | null>;

/**
 * Wraps a loader with per-dataset caching + de-duped concurrent loads.
 * Each cached dataset is held for the lifetime of the cache instance.
 */
export class CachedLoader {
  private cache = new Map<string, GeoJSONFeatureCollection>();
  private inflight = new Map<string, Promise<GeoJSONFeatureCollection | null>>();

  constructor(private readonly loader: GeoJSONLoader) {}

  async load(datasetName: string): Promise<GeoJSONFeatureCollection | null> {
    const cached = this.cache.get(datasetName);
    if (cached) return cached;

    const pending = this.inflight.get(datasetName);
    if (pending) return pending;

    const load = (async () => {
      try {
        const data = await this.loader(datasetName);
        if (data) this.cache.set(datasetName, data);
        return data;
      } finally {
        this.inflight.delete(datasetName);
      }
    })();
    this.inflight.set(datasetName, load);
    return load;
  }

  /** Clear cached datasets — useful for tests or after updates */
  invalidate(datasetName?: string): void {
    if (datasetName) this.cache.delete(datasetName);
    else this.cache.clear();
  }
}
