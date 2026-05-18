/**
 * Resend welcome email — fires on interview completion.
 *
 * Sender domain MUST be `updates.corporateaisolutions.com` (the only
 * Resend-verified domain for Corporate AI Solutions). Display name
 * "CAIS Interview Team" — never just "noreply".
 */

import { Resend } from "resend";

const FROM = "CAIS Interview Team <noreply@updates.corporateaisolutions.com>";

export async function sendWelcomeEmail(
  recipient: string,
  data: { freeText: string; routing: "connexions" | "data_only"; triggeredByTool: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY missing; skipping send");
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }
  const resend = new Resend(apiKey);

  const routingLabel =
    data.routing === "connexions"
      ? "We'll be in touch about the Connexions Platform Trust Sprint."
      : "We'll review what you shared and reach out if there's something to follow up on.";

  const subject = "Thanks for telling us about your project";
  const text = [
    "Hi,",
    "",
    "Thanks for taking a minute to share what you're building on top of the CAIS AU Compliance MCP.",
    "",
    `What you told us: "${data.freeText.slice(0, 500)}"`,
    "",
    routingLabel,
    "",
    data.triggeredByTool
      ? `(For context — the prompt that led you here was triggered by your use of the '${data.triggeredByTool}' tool.)`
      : "",
    "",
    "—",
    "Corporate AI Solutions",
    "Sydney, AU",
  ]
    .filter((l) => l !== "")
    .join("\n");

  try {
    const res = await resend.emails.send({
      from: FROM,
      to: recipient,
      subject,
      text,
    });
    if (res.error) {
      console.error("[email] resend error", res.error);
      return { ok: false, error: res.error.message };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[email] send failed", message);
    return { ok: false, error: message };
  }
}
