"use server";

import { redirect } from "next/navigation";
import { getServerSupabase, isUuid } from "@/lib/supabase";
import { sendWelcomeEmail, sendOperatorNotification } from "@/lib/email";

const CONNEXIONS_INTAKE_URL =
  process.env.CONNEXIONS_INTAKE_URL ?? "https://connexions-silk.vercel.app/p/platform-trust-sprint-intake";

export interface SubmitState {
  ok: boolean;
  error?: string;
}

export async function submitInterview(
  _prev: SubmitState,
  form: FormData,
): Promise<SubmitState> {
  const installId = (form.get("install_id") as string | null)?.trim() ?? "";
  const email = (form.get("email") as string | null)?.trim() ?? "";
  const triage = (form.get("triage") as string | null)?.trim() ?? "";
  const freeText = (form.get("free_text") as string | null)?.trim() ?? "";
  const triggeredByTool = (form.get("trigger") as string | null)?.trim() || null;
  const mcp = (form.get("mcp") as string | null)?.trim() || "au-compliance";

  if (!isUuid(installId)) {
    return { ok: false, error: "Missing or invalid install id. Re-open the link from your MCP client." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  if (triage !== "for_someone_else" && triage !== "for_self") {
    return { ok: false, error: "Pick one of the two options." };
  }
  if (freeText.length < 5 || freeText.length > 2000) {
    return { ok: false, error: "Tell us a sentence or two about what you're building (5–2000 chars)." };
  }

  const routing: "connexions" | "data_only" = triage === "for_someone_else" ? "connexions" : "data_only";
  const now = new Date().toISOString();

  const client = getServerSupabase();

  // Ensure install row exists. The MCP server usually creates it on first
  // recordCall, but if a user opens the URL before any tool call lands,
  // upsert defensively.
  await client
    .from("mcp_install")
    .upsert({ install_id: installId, mcp_name: mcp }, { onConflict: "install_id", ignoreDuplicates: true });

  const { error: upErr } = await client.from("mcp_engagement").upsert(
    {
      install_id: installId,
      interview_started_at: now,
      interview_completed_at: now,
      routing,
      routing_payload: {
        email,
        free_text: freeText,
        triggered_by_tool: triggeredByTool,
        mcp,
        triage,
      },
    },
    { onConflict: "install_id" },
  );

  if (upErr) {
    console.error("[interview] mcp_engagement upsert failed", upErr.message);
    return { ok: false, error: "Couldn't save your response. Please try again in a moment." };
  }

  // Fire-and-forget welcome + operator notification; don't block the redirect
  // on Resend latency.
  void sendWelcomeEmail(email, { freeText, routing, triggeredByTool });
  void sendOperatorNotification({
    installId,
    respondentEmail: email,
    routing,
    triageLabel: triage === "for_someone_else" ? "for someone else" : "for myself",
    freeText,
    triggeredByTool,
    mcp,
  });

  if (routing === "connexions") {
    const params = new URLSearchParams({ source: "cais-mcp-interview", install_id: installId });
    redirect(`${CONNEXIONS_INTAKE_URL}?${params.toString()}`);
  }
  redirect("/thank-you");
}
