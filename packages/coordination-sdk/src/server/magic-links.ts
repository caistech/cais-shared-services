// @caistech/coordination-sdk — Magic link management
import { createHash, randomBytes } from "crypto";
import { getCoordinationServiceClient } from "../client.js";
import type { MagicLink, Participant, Issue, ParticipantRole } from "../types/index.js";

const db = () => getCoordinationServiceClient();

const MAGIC_LINK_EXPIRY_DAYS = 7;

/**
 * The permission model, exported so a consumer can enforce it server-side rather than re-deriving
 * it (and eventually disagreeing with the magic link it issued).
 */
export const ROLE_ACTIONS: Record<ParticipantRole, string[]> = {
  admin: ["comment", "upload", "approve", "reject", "view"],
  internal: ["comment", "upload", "view"],
  engineer: ["comment", "upload", "approve", "reject", "view"],
  certifier: ["comment", "upload", "approve", "reject", "view"],
  supplier: ["comment", "upload", "view"],
  client: ["comment", "view"],
  // The referring party. `view_status` WITHOUT `view` is deliberate and load-bearing: an introducer
  // sees that their referral is progressing — status, stage, score movement — and never its
  // contents. Granting `view` here would hand a commercial third party the subject's material.
  // Enforce it server-side too; an allowed_actions list is a statement of intent, not a boundary.
  introducer: ["view_status"],
  broker: ["view_status"],
};

/** What this role may do. Unknown roles fall back to `view` only. */
export function allowedActionsFor(role: ParticipantRole): string[] {
  return ROLE_ACTIONS[role] ?? ["view"];
}

/**
 * May this role see the subject's CONTENTS (documents, comments, transcripts), as opposed to just
 * its status?
 *
 * Call this at every content-serving boundary. A referring party — introducer, broker — returns
 * false: they see that things are moving, never what was said. Deny-by-default: a role that somehow
 * has neither `view` nor `view_status` gets nothing.
 */
export function canViewContent(role: ParticipantRole): boolean {
  return allowedActionsFor(role).includes("view");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Generate a magic link for a participant on an issue */
export async function createMagicLink(
  participantId: string,
  issueId: string
): Promise<{ token: string; url: string }> {
  // Get participant role for action permissions
  const { data: participant } = await db()
    .from("participants")
    .select("role")
    .eq("id", participantId)
    .single();
  if (!participant) throw new Error("Participant not found");

  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + MAGIC_LINK_EXPIRY_DAYS);

  const allowedActions = ROLE_ACTIONS[participant.role as ParticipantRole] ?? ["view"];

  const { error } = await db()
    .from("magic_links")
    .insert({
      token_hash: tokenHash,
      participant_id: participantId,
      issue_id: issueId,
      allowed_actions: allowedActions,
      expires_at: expiresAt.toISOString(),
    } as never);

  if (error) throw new Error(`Failed to create magic link: ${error.message}`);

  // Build URL — the consuming project hosts the magic link page
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = `${baseUrl}/coordination/magic/${token}`;

  return { token, url };
}

/** Resolve a magic link token — returns participant, issue, and allowed actions */
export async function resolveToken(token: string): Promise<{
  participant: Participant;
  issue: Issue;
  allowedActions: string[];
  expired: boolean;
  revoked: boolean;
} | null> {
  const tokenHash = hashToken(token);

  const { data, error } = await db()
    .from("magic_links")
    .select("*, participant:participants(*), issue:issues(*)")
    .eq("token_hash", tokenHash)
    .single();

  if (error || !data) return null;

  const now = new Date();
  const expired = new Date(data.expires_at) < now;
  const revoked = data.revoked_at !== null;

  // Update last_used_at
  await db()
    .from("magic_links")
    .update({ last_used_at: now.toISOString() } as never)
    .eq("token_hash", tokenHash);

  return {
    participant: data.participant as Participant,
    issue: data.issue as Issue,
    allowedActions: data.allowed_actions as string[],
    expired,
    revoked,
  };
}

/** Revoke all magic links for a participant on an issue */
export async function revokeMagicLinks(
  participantId: string,
  issueId: string
): Promise<void> {
  await db()
    .from("magic_links")
    .update({ revoked_at: new Date().toISOString() } as never)
    .eq("participant_id", participantId)
    .eq("issue_id", issueId)
    .is("revoked_at", null);
}
