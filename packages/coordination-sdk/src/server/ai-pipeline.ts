// @caistech/coordination-sdk — AI-tailored communication pipeline
// Generates role-specific emails per participant using Claude
// Parallel calls, retry with fallback to generic template

import { getCoordinationServiceClient } from "../client";
import type { Issue, Participant, ParticipantRole, IssueComment, IssueActivityLog } from "../types";
import { createMagicLink } from "./magic-links";

const db = () => getCoordinationServiceClient();

// ---------- Role-specific system prompts ----------

const ROLE_PROMPTS: Record<ParticipantRole, string> = {
  admin: "", // admin doesn't receive tailored emails
  internal: "", // internal doesn't receive tailored emails
  engineer: `You are writing an email update to an independent structural engineer involved in a construction project.
Frame the communication technically: reference relevant Australian Standards (AS 4100, NCC/BCA), specific structural findings, required calculations, and sign-off requirements.
Be precise about what engineering review or action is needed. Use professional engineering language.`,

  certifier: `You are writing an email update to a building certifier involved in a construction project.
Frame the communication around compliance: reference relevant BCA/NCC clauses, required evidence and documentation, what has been resolved, and what compliance gaps remain.
Focus on what the certifier needs to see to proceed with certification.`,

  supplier: `You are writing an email update to a supplier/manufacturer involved in a construction project.
Frame the communication around actions: what needs to be provided (revised drawings, test certificates, remediation proposals), in what format, by when.
Be direct about deliverables. Don't include engineering justification unless needed for context.`,

  client: `You are writing an email update to the property owner/client about their construction project.
Frame the communication around progress: what's been done, what's being addressed, timeline impact, and what's next.
Keep it non-technical. Reassure without over-promising. Focus on outcomes, not process.`,
};

// ---------- Types ----------

interface TailoredEmail {
  participantId: string;
  participant: Participant;
  subject: string;
  bodyHtml: string;
  magicLinkUrl: string;
  status: "sent" | "failed" | "fallback";
  fallbackUsed: boolean;
}

interface SendUpdateOptions {
  issueId: string;
  participantIds: string[];
  customMessage?: string;
}

// ---------- Main function ----------

export async function sendTailoredUpdate(
  options: SendUpdateOptions
): Promise<TailoredEmail[]> {
  const { issueId, participantIds, customMessage } = options;

  // Gather issue context
  const [issueRes, commentsRes, activityRes] = await Promise.all([
    db().from("issues").select("*").eq("id", issueId).single(),
    db().from("issue_comments").select("*, participant:participants(name, role)")
      .eq("issue_id", issueId).order("created_at", { ascending: false }).limit(5),
    db().from("issue_activity_log").select("*")
      .eq("issue_id", issueId).order("created_at", { ascending: false }).limit(10),
  ]);

  if (issueRes.error || !issueRes.data) {
    throw new Error(`Issue not found: ${issueRes.error?.message}`);
  }
  const issue = issueRes.data as Issue;

  // Get participants
  const { data: participants } = await db()
    .from("participants")
    .select("*")
    .in("id", participantIds);

  if (!participants || participants.length === 0) {
    throw new Error("No participants found");
  }

  // Build context string for Claude
  const contextStr = buildIssueContext(
    issue,
    (commentsRes.data ?? []) as unknown as { content: string; participant: { name: string; role: string } }[],
    (activityRes.data ?? []) as unknown as IssueActivityLog[],
    customMessage
  );

  // Generate tailored emails in parallel (eng review decision #12)
  const results = await Promise.all(
    (participants as Participant[]).map((participant) =>
      generateAndSendEmail(participant, issue, contextStr)
    )
  );

  return results;
}

// ---------- Generate + send for one participant ----------

async function generateAndSendEmail(
  participant: Participant,
  issue: Issue,
  contextStr: string
): Promise<TailoredEmail> {
  const rolePrompt = ROLE_PROMPTS[participant.role];

  // Admin and internal don't get AI-tailored emails
  if (!rolePrompt) {
    return {
      participantId: participant.id,
      participant,
      subject: "",
      bodyHtml: "",
      magicLinkUrl: "",
      status: "sent",
      fallbackUsed: false,
    };
  }

  // Generate magic link
  const { url: magicLinkUrl } = await createMagicLink(
    participant.id,
    issue.id
  );

  let subject: string;
  let bodyHtml: string;
  let fallbackUsed = false;
  let status: "sent" | "failed" | "fallback" = "sent";

  try {
    const generated = await callClaude(rolePrompt, contextStr, participant, issue);
    subject = generated.subject;
    bodyHtml = generated.bodyHtml;
  } catch (firstError) {
    // Retry once after 30s
    try {
      await new Promise((r) => setTimeout(r, 30000));
      const generated = await callClaude(rolePrompt, contextStr, participant, issue);
      subject = generated.subject;
      bodyHtml = generated.bodyHtml;
    } catch {
      // Fallback to generic template
      subject = `Action Required: ${issue.title}`;
      bodyHtml = buildGenericEmail(participant, issue);
      fallbackUsed = true;
      status = "fallback";
    }
  }

  // Send via Resend
  try {
    await sendViaResend(participant.email, subject, bodyHtml, magicLinkUrl);
  } catch {
    status = "failed";
  }

  // Log to ai_communications
  await db()
    .from("ai_communications")
    .insert({
      issue_id: issue.id,
      participant_id: participant.id,
      role_framing: participant.role,
      generated_text: bodyHtml,
      status,
      fallback_used: fallbackUsed,
    } as never);

  // Log activity
  await db()
    .from("issue_activity_log")
    .insert({
      issue_id: issue.id,
      participant_id: participant.id,
      activity_type: "email_sent",
      description: `AI-tailored update sent to ${participant.name} (${participant.role})${fallbackUsed ? " — generic fallback used" : ""}`,
    } as never);

  return {
    participantId: participant.id,
    participant,
    subject,
    bodyHtml,
    magicLinkUrl,
    status,
    fallbackUsed,
  };
}

// ---------- Claude API call ----------

async function callClaude(
  rolePrompt: string,
  contextStr: string,
  participant: Participant,
  issue: Issue
): Promise<{ subject: string; bodyHtml: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: rolePrompt,
      messages: [
        {
          role: "user",
          content: `Generate an email update for ${participant.name} (${participant.role}${participant.company ? `, ${participant.company}` : ""}) about this issue:

${contextStr}

Return ONLY a JSON object with two fields:
- "subject": a concise email subject line (no prefix like "Re:" or "FW:")
- "bodyHtml": the email body as clean HTML (use <p>, <strong>, <ul>/<li> only — no <html>/<head>/<body> tags)

Keep the email concise (2-4 paragraphs max). Address the recipient by first name. Be direct about what action they need to take.`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text ?? "";

  // Parse JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in Claude response");

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    subject: parsed.subject ?? `Update: ${issue.title}`,
    bodyHtml: parsed.bodyHtml ?? parsed.body_html ?? text,
  };
}

// ---------- Helpers ----------

function buildIssueContext(
  issue: Issue,
  comments: { content: string; participant: { name: string; role: string } }[],
  activities: IssueActivityLog[],
  customMessage?: string
): string {
  let ctx = `ISSUE: ${issue.title}
STATUS: ${issue.status}
CRITICALITY: ${issue.criticality}
DUE DATE: ${issue.due_date ?? "None"}
NEXT ACTION: ${issue.next_action ?? "None specified"}

DESCRIPTION:
${issue.description ?? "No description"}`;

  if (comments.length > 0) {
    ctx += `\n\nRECENT COMMENTS:`;
    for (const c of comments) {
      ctx += `\n- ${c.participant?.name ?? "Unknown"} (${c.participant?.role ?? ""}): ${c.content}`;
    }
  }

  if (customMessage) {
    ctx += `\n\nADDITIONAL CONTEXT FROM PROJECT COORDINATOR:\n${customMessage}`;
  }

  return ctx;
}

function buildGenericEmail(participant: Participant, issue: Issue): string {
  const firstName = participant.name.split(" ")[0];
  return `<p>Hi ${firstName},</p>
<p>There is an update on <strong>${issue.title}</strong> that requires your attention.</p>
<p><strong>Status:</strong> ${issue.status.replace("_", " ")}<br>
<strong>Priority:</strong> ${issue.criticality}<br>
${issue.due_date ? `<strong>Due:</strong> ${new Date(issue.due_date + "T00:00:00").toLocaleDateString()}<br>` : ""}
${issue.next_action ? `<strong>Action needed:</strong> ${issue.next_action}` : ""}</p>
<p>Please use the link below to respond.</p>`;
}

async function sendViaResend(
  to: string,
  subject: string,
  bodyHtml: string,
  magicLinkUrl: string
): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.warn("RESEND_API_KEY not set — skipping email send");
    return;
  }

  const fullHtml = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      ${bodyHtml}
      <div style="margin-top: 24px; padding: 16px; background: #f8f9fa; border-radius: 8px;">
        <a href="${magicLinkUrl}" style="display: inline-block; padding: 10px 24px; background: #333; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px;">View & Respond</a>
        <p style="margin-top: 8px; font-size: 12px; color: #666;">This link is secure and valid for 7 days. No login required.</p>
      </div>
      <p style="margin-top: 24px; font-size: 11px; color: #999;">Powered by Corporate AI Solutions Coordination Hub</p>
    </div>`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Coordination Hub <updates@corporateaisolutions.com>",
      to,
      subject,
      html: fullHtml,
    }),
  });
}
