/**
 * Framework-agnostic ABR (Australian Business Register) API client.
 * Handles JSONP stripping, URL construction, and response parsing.
 * Used by both Next.js API routes and standalone Vercel functions.
 */

export interface AbrLookupResult {
  abn: string;
  abnStatus: string;
  entityName: string;
  entityType: string;
  acn: string;
  businessNames: string[];
  state: string;
  postcode: string;
}

export interface AbrNameSearchResult {
  abn: string;
  name: string;
  nameType: string;
  state: string;
  postcode: string;
  score: number;
  isCurrent: boolean;
}

export interface AbrError {
  error: string;
}

function stripJsonp(text: string): string {
  return text.replace(/^cb\(/, "").replace(/\)$/, "");
}

/**
 * Look up a business by ABN.
 * Returns business details or an error.
 */
export async function lookupAbn(
  abn: string,
  guid: string
): Promise<AbrLookupResult | AbrError> {
  const cleaned = abn.replace(/\s/g, "");
  if (!/^\d{11}$/.test(cleaned)) {
    return { error: "ABN must be 11 digits" };
  }

  try {
    const url = `https://abr.business.gov.au/json/AbnDetails.aspx?abn=${cleaned}&callback=cb&guid=${guid}`;
    const res = await fetch(url);
    const text = await res.text();
    const data = JSON.parse(stripJsonp(text));

    if (data.Message && !data.Abn) {
      return { error: data.Message };
    }
    if (!data.Abn) {
      return { error: "ABN not found" };
    }

    const businessNames: string[] = [];
    if (Array.isArray(data.BusinessName)) {
      for (const b of data.BusinessName) {
        if (typeof b === "string" && b) businessNames.push(b);
        else if (b?.organisationName) businessNames.push(b.organisationName);
      }
    }

    return {
      abn: data.Abn,
      abnStatus: data.AbnStatus || "",
      entityName: data.EntityName || "",
      entityType: data.EntityTypeName || "",
      acn: data.Acn || "",
      businessNames,
      state: data.AddressState || "",
      postcode: data.AddressPostcode || "",
    };
  } catch {
    return { error: "Failed to look up ABN" };
  }
}

/**
 * Search for businesses by name.
 * Returns up to maxResults matching businesses.
 */
export async function searchByName(
  name: string,
  guid: string,
  maxResults: number = 8
): Promise<AbrNameSearchResult[] | AbrError> {
  if (!name || name.trim().length < 2) {
    return { error: "Name must be at least 2 characters" };
  }

  try {
    const url = `https://abr.business.gov.au/json/MatchingNames.aspx?name=${encodeURIComponent(name)}&maxResults=${maxResults}&callback=cb&guid=${guid}`;
    const res = await fetch(url);
    const text = await res.text();
    const data = JSON.parse(stripJsonp(text));

    if (!data.Names || data.Names.length === 0) {
      return [];
    }

    return data.Names.map(
      (n: {
        Abn: string;
        Name: string;
        NameType: string;
        State: string;
        Postcode: string;
        Score: number;
        IsCurrent: boolean;
      }) => ({
        abn: n.Abn,
        name: n.Name,
        nameType: n.NameType,
        state: n.State,
        postcode: n.Postcode,
        score: n.Score,
        isCurrent: n.IsCurrent,
      })
    );
  } catch {
    return { error: "Name search failed" };
  }
}

/** Type guard to check if result is an error */
export function isAbrError(
  result: AbrLookupResult | AbrNameSearchResult[] | AbrError
): result is AbrError {
  return "error" in result;
}
