import { lookupAbn, searchByName, isAbrError } from "@caistech/abn-lookup";

/**
 * ABN / entity-name lookup against the ABR's official JSON API.
 *
 * This is the CANONICAL route handler. It was previously duplicated per
 * product (corporate-components' own api-route.ts, DealFindrs, BucketLyst) —
 * three copies of the same twenty lines, which is what the "convergent shape,
 * then extract" rule exists to stop. Consume this instead of writing another.
 *
 * FRAMEWORK-AGNOSTIC ON PURPOSE: it takes a web-standard `Request` and returns
 * a `Response`, so the shared package does NOT need `next` as a dependency.
 * A Next.js App Router route handler satisfies that signature exactly:
 *
 *   // app/api/abn-lookup/route.ts
 *   export { GET } from "@caistech/corporate-components/abn-lookup";
 *
 * The ABR GUID is a credential and stays server-side. Register free at
 * abr.business.gov.au/Tools/WebServices.
 *
 * RESPONSE CONTRACT
 *   unconfigured  200 { configured: false }   <- degrade, never 500
 *   ?name=…       200 { results: AbrNameSearchResult[] }
 *   ?abn=… found  200 AbrLookupResult (abn, entityName, entityType, …)
 *   ?abn=… absent 404 { error }
 *   neither       400 { error }
 *
 * The unconfigured case is deliberately a 200 rather than the 500 the original
 * returned: a missing GUID is an operator configuration gap, not the
 * applicant's fault, and it must not break a form they are halfway through.
 * The caller checks `configured` and simply shows nothing extra — it must
 * never invent or guess an entity name (degrade-don't-fake).
 */

export interface AbnLookupRouteOptions {
  /** Override the ABR GUID. Defaults to process.env.ABR_GUID. */
  guid?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function createAbnLookupRoute(options: AbnLookupRouteOptions = {}) {
  async function GET(req: Request): Promise<Response> {
    const guid = options.guid ?? process.env.ABR_GUID ?? "";
    if (!guid) return json({ configured: false });

    const url = new URL(req.url);
    const name = url.searchParams.get("name")?.trim();
    const abn = url.searchParams.get("abn")?.replace(/\s/g, "");

    try {
      if (name && name.length >= 2) {
        const result = await searchByName(name, guid);
        if (isAbrError(result)) return json({ configured: true, error: result.error }, 502);
        return json({ configured: true, results: result });
      }

      if (abn && /^\d{11}$/.test(abn)) {
        const result = await lookupAbn(abn, guid);
        if (isAbrError(result)) return json({ configured: true, found: false }, 404);
        return json({ configured: true, found: true, ...result });
      }

      return json(
        { error: "Provide ?name=company+name (min 2 chars) or ?abn=12345678901" },
        400
      );
    } catch {
      // An ABR outage must never block the form the caller is rendering.
      return json({ configured: true, error: "ABR unavailable" }, 502);
    }
  }

  return { GET };
}

/** Convenience handler using process.env.ABR_GUID. */
export const { GET } = createAbnLookupRoute();
