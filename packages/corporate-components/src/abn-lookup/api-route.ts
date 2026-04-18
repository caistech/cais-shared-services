import { NextRequest, NextResponse } from "next/server";
import { lookupAbn, searchByName, isAbrError } from "@caistech/abn-lookup";

const ABR_GUID = process.env.ABR_GUID || "";

/**
 * ABN/Name lookup via ABR's official JSON API.
 *
 * Search by name:  GET /api/abn-lookup?name=corporate+ai
 * Lookup by ABN:   GET /api/abn-lookup?abn=12345678901
 */
export async function GET(req: NextRequest) {
  if (!ABR_GUID) {
    return NextResponse.json(
      { error: "ABR_GUID not configured — register free at abr.business.gov.au/Tools/WebServices" },
      { status: 500 }
    );
  }

  const name = req.nextUrl.searchParams.get("name")?.trim();
  const abn = req.nextUrl.searchParams.get("abn")?.replace(/\s/g, "");

  // ── Name search ──
  if (name && name.length >= 2) {
    const result = await searchByName(name, ABR_GUID);
    if (isAbrError(result)) {
      return NextResponse.json(result, { status: 500 });
    }
    return NextResponse.json({ results: result });
  }

  // ── ABN lookup ──
  if (abn && /^\d{11}$/.test(abn)) {
    const result = await lookupAbn(abn, ABR_GUID);
    if (isAbrError(result)) {
      return NextResponse.json(result, { status: 404 });
    }
    return NextResponse.json(result);
  }

  return NextResponse.json(
    { error: "Provide ?name=company+name (min 2 chars) or ?abn=12345678901" },
    { status: 400 }
  );
}
