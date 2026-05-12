/**
 * Ray-casting point-in-polygon for GeoJSON Polygon and MultiPolygon geometries.
 * Pure functions — no I/O, no caching. Originally from F2K-Checkpoint, refactored
 * via MMCBuild, now consolidated here as the canonical implementation.
 */

export type Point = [number, number]; // [lng, lat]
type Ring = number[][];
type Polygon = Ring[];
type MultiPolygon = Polygon[];

/** Ray-casting algorithm for a single polygon (array of rings) */
export function pointInPolygon(point: Point, polygon: Polygon): boolean {
  const [lng, lat] = point;
  let inside = false;

  for (const ring of polygon) {
    let intersections = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];

      if (
        yi > lat !== yj > lat &&
        lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
      ) {
        intersections++;
      }
    }
    if (intersections % 2 === 1) {
      inside = !inside;
    }
  }

  return inside;
}

/** Check if point is in a MultiPolygon */
export function pointInMultiPolygon(point: Point, multiPolygon: MultiPolygon): boolean {
  for (const polygon of multiPolygon) {
    if (pointInPolygon(point, polygon)) return true;
  }
  return false;
}

export interface GeoJSONFeature {
  type: "Feature";
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: Polygon | MultiPolygon;
  };
  properties: Record<string, unknown>;
}

export interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

/** Find the first feature containing the given point */
export function findFeatureContainingPoint(
  geojson: GeoJSONFeatureCollection,
  lat: number,
  lng: number
): GeoJSONFeature | null {
  if (!geojson?.features) return null;
  const point: Point = [lng, lat];

  for (const feature of geojson.features) {
    const geometry = feature.geometry;
    if (!geometry) continue;
    try {
      if (geometry.type === "Polygon") {
        if (pointInPolygon(point, geometry.coordinates as Polygon)) return feature;
      } else if (geometry.type === "MultiPolygon") {
        if (pointInMultiPolygon(point, geometry.coordinates as MultiPolygon)) return feature;
      }
    } catch {
      continue;
    }
  }

  return null;
}
