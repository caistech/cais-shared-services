import { describe, it, expect } from "vitest";
import { getStaticMapUrl } from "../src/mapbox";

const TOKEN = "pk.test_token_for_unit_tests";

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
