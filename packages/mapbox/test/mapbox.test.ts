import { describe, it, expect } from "vitest";
import {
  getStaticMapUrl,
  extractSuburb,
  extractPostcode,
  extractState,
  featureToGeocodedAddress,
} from "../src/mapbox";
import type { MapboxFeature } from "../src/mapbox-types";

const TOKEN = "pk.test_token_for_unit_tests";

// Fixtures mirror real AU Mapbox v5 responses (verified live 2026-07-09).
// A suburb comes back as a `place` feature whose context is ONLY [region, country] —
// the pre-fix extractors searched context for a place/locality and returned null.
const suburbFeature: MapboxFeature = {
  id: "place.123",
  type: "Feature",
  place_type: ["place"],
  text: "Geraldton",
  place_name: "Geraldton, Western Australia, Australia",
  center: [114.61, -28.77],
  geometry: { type: "Point", coordinates: [114.61, -28.77] },
  context: [
    { id: "region.1", text: "Western Australia", short_code: "AU-WA" },
    { id: "country.1", text: "Australia" },
  ],
  properties: {},
};

const addressFeature: MapboxFeature = {
  id: "address.456",
  type: "Feature",
  place_type: ["address"],
  text: "Marine Terrace",
  place_name: "12 Marine Terrace, Geraldton Western Australia 6530, Australia",
  center: [114.6, -28.78],
  geometry: { type: "Point", coordinates: [114.6, -28.78] },
  context: [
    { id: "postcode.1", text: "6530" },
    { id: "place.1", text: "Geraldton" },
    { id: "region.1", text: "Western Australia", short_code: "AU-WA" },
    { id: "country.1", text: "Australia" },
  ],
  properties: {},
};

describe("address extractors", () => {
  it("suburb pick (place feature) → its own text, not null (the bug)", () => {
    expect(extractSuburb(suburbFeature)).toBe("Geraldton");
  });

  it("suburb pick has no single postcode (inherent) but resolves state", () => {
    expect(extractPostcode(suburbFeature)).toBeNull();
    expect(extractState(suburbFeature)).toBe("WA");
  });

  it("street-address pick → suburb + postcode + state from context", () => {
    expect(extractSuburb(addressFeature)).toBe("Geraldton");
    expect(extractPostcode(addressFeature)).toBe("6530");
    expect(extractState(addressFeature)).toBe("WA");
  });

  it("featureToGeocodedAddress fills every field for a suburb pick", () => {
    const a = featureToGeocodedAddress(suburbFeature);
    expect(a.suburb).toBe("Geraldton");
    expect(a.state).toBe("WA");
    expect(a.latitude).toBe(-28.77);
    expect(a.longitude).toBe(114.61);
  });

  it("falls back to the id prefix when place_type is absent", () => {
    const noType = { ...suburbFeature, place_type: undefined } as unknown as MapboxFeature;
    expect(extractSuburb(noType)).toBe("Geraldton");
  });
});

describe("getStaticMapUrl", () => {
  it("returns empty string when no token resolves", () => {
    const url = getStaticMapUrl(-33.86, 150.93, { token: "" });
    expect(url).toBe("");
  });

  it("defaults to streets-v12 + retina @2x (backwards compat)", () => {
    const url = getStaticMapUrl(-33.86, 150.93, { token: TOKEN });
    expect(url).toContain("/styles/v1/mapbox/streets-v12/static/");
    expect(url).toContain("@2x?");
    expect(url).toContain("access_token=" + TOKEN);
  });

  it("templates satellite-streets-v12 style into URL path", () => {
    const url = getStaticMapUrl(-33.86, 150.93, {
      token: TOKEN,
      style: "satellite-streets-v12",
      retina: false,
      width: 640,
      height: 400,
    });
    expect(url).toContain("/styles/v1/mapbox/satellite-streets-v12/static/");
    expect(url).not.toContain("@2x");
    expect(url).toContain("640x400?");
  });

  it("supports satellite-v9 style", () => {
    const url = getStaticMapUrl(-33.86, 150.93, {
      token: TOKEN,
      style: "satellite-v9",
      retina: false,
    });
    expect(url).toContain("/styles/v1/mapbox/satellite-v9/static/");
  });

  it("retina=false omits @2x", () => {
    const url = getStaticMapUrl(-33.86, 150.93, {
      token: TOKEN,
      retina: false,
    });
    expect(url).not.toContain("@2x");
  });

  it("retina=true at width 800 throws (would request 1600 from a 1280-cap API)", () => {
    expect(() =>
      getStaticMapUrl(-33.86, 150.93, {
        token: TOKEN,
        retina: true,
        width: 800,
        height: 600,
      })
    ).toThrow(/retina=true requires width\*2/);
  });

  it("retina=true at default 600x300 does not throw (1200 ≤ 1280)", () => {
    expect(() =>
      getStaticMapUrl(-33.86, 150.93, { token: TOKEN, retina: true })
    ).not.toThrow();
  });

  it("encodes negative lat correctly (Australian coords)", () => {
    const url = getStaticMapUrl(-33.860937, 150.930105, {
      token: TOKEN,
      retina: false,
    });
    expect(url).toContain("150.930105,-33.860937");
  });

  it("respects zoom override", () => {
    const url = getStaticMapUrl(-33.86, 150.93, {
      token: TOKEN,
      zoom: 18,
      retina: false,
    });
    expect(url).toMatch(/,18,0\//);
  });

  it("explicit token overrides env", () => {
    const url = getStaticMapUrl(-33.86, 150.93, { token: "pk.explicit_override" });
    expect(url).toContain("access_token=pk.explicit_override");
  });
});
