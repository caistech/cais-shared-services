/**
 * Daily nudge cron — sends day3 / day14 / day30 follow-ups for submissions
 * whose interview_completed_at has aged past the threshold and which don't
 * yet have a matching mcp_nudge row.
 *
 * Scheduled via vercel.json `crons` block. Vercel attaches an Authorization
 * header with `Bearer <CRON_SECRET>`; we verify before doing anything.
 *
 * Idempotency: mcp_nudge has a unique constraint on (install_id, nudge_kind).
 * If a row already exists, insert is a no-op — so even if the cron double-fires
 * we send each nudge at most once.
 */

import { Resend } from "resend";
import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";
import { buildNudge, NUDGE_OFFSET_DAYS, type NudgeKind } from "@/lib/nudge";

const FROM = "CAIS Interview Team <noreply@updates.corporateaisolutions.com>";
const KINDS: NudgeKind[] = ["day3", "day14", "day30"];
const BATCH_LIMIT = 50;

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not configured" }, { status: 503 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ ok: false, error: "RESEND_API_KEY not configured" }, { status: 503 });
  }

  const client = getServerSupabase();
  const resend = new Resend(resendKey);

  const summary: Record<NudgeKind, { sent: number; skipped: number; errors: string[] }> = {
    day3: { sent: 0, skipped: 0, errors: [] },
    day14: { sent: 0, skipped: 0, errors: [] },
    day30: { sent: 0, skipped: 0, errors: [] },
  };

  for (const kind of KINDS) {
    const days = NUDGE_OFFSET_DAYS[kind];
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Step 1: candidates — engagements with interview_completed_at older than cutoff.
    const { data: candidates, error: candErr } = await client
      .from("mcp_engagement")
      .select("install_id, interview_completed_at, routing, routing_payload")
      .not("interview_completed_at", "is", null)
      .lt("interview_completed_at", cutoff)
      .limit(BATCH_LIMIT * 4); // overfetch; we filter by already-sent next

    if (candErr) {
      summary[kind].errors.push(`candidates query: ${candErr.message}`);
      continue;
    }
    if (!candidates || candidates.length === 0) continue;

    // Step 2: filter out installs that already have this kind in mcp_nudge.
    const ids = candidates.map((c) => c.install_id);
    const { data: alreadySent, error: sentErr } = await client
      .from("mcp_nudge")
      .select("install_id")
      .in("install_id", ids)
      .eq("nudge_kind", kind);
    if (sentErr) {
      summary[kind].errors.push(`already-sent query: ${sentErr.message}`);
      continue;
    }
    const sentSet = new Set((alreadySent ?? []).map((r) => r.install_id as string));
    const dueRaw = candidates.filter((c) => !sentSet.has(c.install_id));
    const due = dueRaw.slice(0, BATCH_LIMIT);
    summary[kind].skipped = candidates.length - due.length;

    // Step 3: send + record.
    for (const row of due) {
      const payload = (row.routing_payload as {
        email?: string;
        free_text?: string;
        triggered_by_tool?: string | null;
      } | null) ?? {};
      const recipient = payload.email;
      if (!recipient) {
        summary[kind].errors.push(`install ${row.install_id} has no email in routing_payload; skipped`);
        // Record a row so we don't keep retrying.
        await client.from("mcp_nudge").insert({
          install_id: row.install_id,
          nudge_kind: kind,
          error_message: "no email in routing_payload",
        });
        continue;
      }
      const nudge = buildNudge(kind, {
        respondentEmail: recipient,
        freeText: payload.free_text ?? null,
        routing: (row.routing as "connexions" | "data_only" | null) ?? null,
        triggeredByTool: payload.triggered_by_tool ?? null,
      });
      try {
        const sendRes = await resend.emails.send({
          from: FROM,
          to: recipient,
          subject: nudge.subject,
          text: nudge.text,
        });
        if (sendRes.error) {
          summary[kind].errors.push(`${recipient}: ${sendRes.error.message}`);
          await client.from("mcp_nudge").insert({
            install_id: row.install_id,
            nudge_kind: kind,
            error_message: sendRes.error.message,
          });
          continue;
        }
        const { error: insErr } = await client.from("mcp_nudge").insert({
          install_id: row.install_id,
          nudge_kind: kind,
          resend_id: sendRes.data?.id ?? null,
        });
        if (insErr && !/duplicate key/i.test(insErr.message)) {
          summary[kind].errors.push(`record insert ${recipient}: ${insErr.message}`);
          continue;
        }
        summary[kind].sent += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        summary[kind].errors.push(`${recipient} send threw: ${message}`);
      }
    }
  }

  return NextResponse.json({ ok: true, summary, ranAt: new Date().toISOString() });
}
