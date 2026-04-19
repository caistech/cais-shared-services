// @caistech/coordination-sdk — Magic link management
import { createHash, randomBytes } from "crypto";
import { getCoordinationServiceClient } from "../client";
import type { MagicLink, Participant, Issue, ParticipantRole } from "../types";

const db = () => getCoordinationServiceClient();

const MAGIC_LINK_EXPIRY_DAYS = 7;

const ROLE_ACTIONS: Record<ParticipantRole, string[]> = {
  admin: ["comment", "upload", "approve", "reject", "view"],
  internal: ["comment", "upload", "view"],
  engineer: ["comment", "upload", "approve", "reject", "view"],
  certifier: ["comment", "upload", "approve", "reject", "view"],
  supplier: ["comment", "upload", "view"],
  client: ["comment", "view"],
};

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
