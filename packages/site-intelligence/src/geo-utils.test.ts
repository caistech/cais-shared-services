import { describe, it, expect } from "vitest";
import {
  pointInPolygon,
  pointInMultiPolygon,
  findFeatureContainingPoint,
  type GeoJSONFeatureCollection,
} from "./geo-utils.js";
import { CachedLoader, type GeoJSONLoader } from "./loader.js";
import { deriveClimateZoneFromLatitude, deriveClimateZone } from "./climate.js";
import { deriveCouncil } from "./council.js";
import { deriveWindRegion } from "./wind-region.js";

// Simple square polygon around Sydney CBD for testing
// Coords roughly: lng [151.0, 151.4], lat [-34.0, -33.7]
const sydneySquare: number[][][] = [
  [
    [151.0, -34.0],
    [151.4, -34.0],
    [151.4, -33.7],
    [151.0, -33.7],
    [151.0, -34.0],
  ],
];

describe("pointInPolygon", () => {
  it("returns true for point inside polygon", () => {
    expect(pointInPolygon([151.2093, -33.8688], sydneySquare)).toBe(true);
  });

  it("returns false for point outside polygon", () => {
    // Melbourne
    expect(pointInPolygon([144.9631, -37.8136], sydneySquare)).toBe(false);
  });

  it("returns false for point just outside (boundary tolerance check)", () => {
    expect(pointInPolygon([150.99, -33.85], sydneySquare)).toBe(false);
  });
});

describe("pointInMultiPolygon", () => {
  it("returns true if point is in any constituent polygon", () => {
    const tasSquare: number[][][] = [
      [
        [147.0, -43.0],
        [147.5, -43.0],
        [147.5, -42.5],
        [147.0, -42.5],
        [147.0, -43.0],
      ],
    ];
    // Sydney + Hobart as MultiPolygon
    const multi = [sydneySquare, tasSquare];
    // Hobart
    expect(pointInMultiPolygon([147.3, -42.7], multi)).toBe(true);
    // Sydney
    expect(pointInMultiPolygon([151.2, -33.85], multi)).toBe(true);
    // Melbourne — in neither
    expect(pointInMultiPolygon([144.9631, -37.8136], multi)).toBe(false);
  });
});

describe("findFeatureContainingPoint", () => {
  const fc: GeoJSONFeatureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: sydneySquare },
        properties: { name: "Sydney" },
      },
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [144.5, -38.0],
              [145.5, -38.0],
              [145.5, -37.5],
              [144.5, -37.5],
              [144.5, -38.0],
            ],
          ],
        },
        properties: { name: "Melbourne" },
      },
    ],
  };

  it("returns the matching feature", () => {
    const f = findFeatureContainingPoint(fc, -33.8688, 151.2093);
    expect(f?.properties?.name).toBe("Sydney");
  });

  it("returns null when no feature matches", () => {
    // Brisbane — outside both
    expect(findFeatureContainingPoint(fc, -27.4705, 153.026)).toBe(null);
  });

  it("handles null/missing features array gracefully", () => {
    expect(findFeatureContainingPoint({ type: "FeatureCollection", features: [] }, 0, 0)).toBe(null);
  });
});

describe("CachedLoader", () => {
  it("caches results — second call doesn't re-invoke loader", async () => {
    let calls = 0;
    const loader: GeoJSONLoader = async () => {
      calls += 1;
      return { type: "FeatureCollection", features: [] };
    };
    const cached = new CachedLoader(loader);
    await cached.load("test.geojson");
    await cached.load("test.geojson");
    expect(calls).toBe(1);
  });

  it("dedupes concurrent loads", async () => {
    let calls = 0;
    const loader: GeoJSONLoader = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 10));
      return { type: "FeatureCollection", features: [] };
    };
    const cached = new CachedLoader(loader);
    await Promise.all([cached.load("a.geojson"), cached.load("a.geojson"), cached.load("a.geojson")]);
    expect(calls).toBe(1);
  });

  it("invalidate() clears cache", async () => {
    let calls = 0;
    const loader: GeoJSONLoader = async () => {
      calls += 1;
      return { type: "FeatureCollection", features: [] };
    };
    const cached = new CachedLoader(loader);
    await cached.load("x.geojson");
    cached.invalidate("x.geojson");
    await cached.load("x.geojson");
    expect(calls).toBe(2);
  });
});

describe("deriveClimateZoneFromLatitude", () => {
  it("Darwin → zone 1", () => expect(deriveClimateZoneFromLatitude(-12.4634)).toBe(2)); // boundary
  it("Cairns (-16.92) → zone 2", () => expect(deriveClimateZoneFromLatitude(-16.92)).toBe(2));
  it("Brisbane (-27.47) → zone 4 (boundary)", () => expect(deriveClimateZoneFromLatitude(-27.47)).toBe(5));
  it("Sydney (-33.87) → zone 6", () => expect(deriveClimateZoneFromLatitude(-33.87)).toBe(6));
  it("Melbourne (-37.81) → zone 7", () => expect(deriveClimateZoneFromLatitude(-37.81)).toBe(7));
  it("Hobart (-42.88) → zone 8", () => expect(deriveClimateZoneFromLatitude(-42.88)).toBe(8));
});

describe("deriveClimateZone — fallback path", () => {
  it("falls back to latitude when loader returns null", async () => {
    const loader = new CachedLoader(async () => null);
    const result = await deriveClimateZone(loader, -33.87, 151.21);
    expect(result.source).toBe("latitude_approx");
    expect(result.climate_zone).toBe(6);
  });

  it("uses geojson when feature found and zone parseable", async () => {
    const loader = new CachedLoader(async () => ({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Polygon", coordinates: sydneySquare },
          properties: { climate_description: "zone 5" },
        },
      ],
    }));
    const result = await deriveClimateZone(loader, -33.87, 151.21);
    expect(result.source).toBe("geojson");
    expect(result.climate_zone).toBe(5);
  });

  it("ignores out-of-range zone numbers from geojson", async () => {
    const loader = new CachedLoader(async () => ({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Polygon", coordinates: sydneySquare },
          properties: { zone: "99" },
        },
      ],
    }));
    const result = await deriveClimateZone(loader, -33.87, 151.21);
    expect(result.source).toBe("latitude_approx");
  });
});

describe("deriveWindRegion", () => {
  it("returns null when loader returns null", async () => {
    const loader = new CachedLoader(async () => null);
    expect(await deriveWindRegion(loader, -33.87, 151.21)).toEqual({ wind_region: null });
  });

  it("extracts region from REGION property", async () => {
    const loader = new CachedLoader(async () => ({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Polygon", coordinates: sydneySquare },
          properties: { REGION: "A2" },
        },
      ],
    }));
    expect(await deriveWindRegion(loader, -33.87, 151.21)).toEqual({ wind_region: "A2" });
  });
});

describe("deriveCouncil", () => {
  it("returns null pair when loader returns null", async () => {
    const loader = new CachedLoader(async () => null);
    expect(await deriveCouncil(loader, -33.87, 151.21)).toEqual({
      council_name: null,
      council_code: null,
    });
  });

  it("handles array-valued name + code properties", async () => {
    const loader = new CachedLoader(async () => ({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Polygon", coordinates: sydneySquare },
          properties: { lga_name: ["City of Sydney"], council_code: ["NSW17200"] },
        },
      ],
    }));
    expect(await deriveCouncil(loader, -33.87, 151.21)).toEqual({
      council_name: "City of Sydney",
      council_code: "NSW17200",
    });
  });
});
