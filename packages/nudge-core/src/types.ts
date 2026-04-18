// ---------------------------------------------------------------------------
// Generic nudge types — domain-agnostic
// ---------------------------------------------------------------------------

/** Channel through which a nudge can be delivered */
export type NudgeChannel = "email" | "in_app" | "sms";

/** A single person who should receive a nudge */
export interface NudgeTarget {
  userId: string;
  email: string;
  fullName: string;
  orgId: string;
  /** Optional scoping key (project, workspace, etc.) */
  scopeId?: string;
}

/** Result returned by an evaluator — tells the cron handler what to do */
export interface NudgeResult {
  shouldFire: boolean;
  targets: NudgeTarget[];
  payload: Record<string, unknown>;
}

/**
 * Evaluator function signature.
 *
 * `TContext` is the domain-specific context your app provides
 * (org members, projects, admin client, etc.)
 */
export type EvaluatorFn<TContext = unknown> = (
  ctx: TContext,
) => Promise<NudgeResult>;

/**
 * Definition of a single nudge type — how it renders across channels.
 *
 * `TNudgeType` is the string-literal union your app defines (e.g. "N-01" | "N-02").
 */
export interface NudgeDefinition<TNudgeType extends string = string> {
  type: TNudgeType;
  channels: NudgeChannel[];
  subject: (payload: Record<string, unknown>) => string;
  bodyHtml: (
    payload: Record<string, unknown>,
    target: NudgeTarget,
  ) => string;
  ctaText: string;
  ctaUrl: (payload: Record<string, unknown>, target: NudgeTarget) => string;
  bypassFrequencyCap?: boolean;
}

// ---------------------------------------------------------------------------
// Nudge log row — the shape consumers must supply from their DB
// ---------------------------------------------------------------------------

export interface NudgeLogRow {
  id: string;
  user_id: string;
  nudge_type: string;
  channel: NudgeChannel;
  sent_at: string;
  actioned_at: string | null;
  snoozed_until: string | null;
  project_id?: string | null;
  payload?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Email builder types
// ---------------------------------------------------------------------------

export interface NudgeEmailParams {
  to: string;
  subject: string;
  greeting: string;
  bodyHtml: string;
  ctaText: string;
  ctaUrl: string;
}

export interface NudgeEmailConfig {
  /** Base URL for footer links (notification preferences, unsubscribe) */
  appUrl: string;
  /** Brand colour used for CTA button and logo block */
  brandColor?: string;
  /** Single-character or short string shown in the logo block */
  logoChar?: string;
  /** Footer text (company/legal line) */
  footerText?: string;
  /** Path for notification preferences (appended to appUrl) */
  prefsPath?: string;
}

/** Transport abstraction — lets consumers plug in Resend, Postmark, etc. */
export interface EmailTransport {
  send(params: {
    from: string;
    to: string;
    subject: string;
    html: string;
  }): Promise<void>;
}

// ---------------------------------------------------------------------------
// Cron handler types
// ---------------------------------------------------------------------------

export interface NudgeEmailContentFn<TNudgeType extends string = string> {
  (
    nudgeType: TNudgeType,
    target: NudgeTarget,
    payload: Record<string, unknown>,
  ): {
    subject: string;
    greeting: string;
    bodyHtml: string;
    ctaText: string;
    ctaUrl: string;
  } | null;
}

export interface CronHandlerConfig<
  TNudgeType extends string = string,
  TContext = unknown,
> {
  /** All evaluators keyed by nudge type */
  evaluators: Record<TNudgeType, EvaluatorFn<TContext>>;

  /** Channels per nudge type */
  channels: Record<TNudgeType, NudgeChannel[]>;

  /** Nudge types that bypass the 24h frequency cap */
  frequencyCapBypass?: TNudgeType[];

  /** Build the evaluation context for one org */
  buildContext: (orgId: string) => Promise<TContext>;

  /** Return all org IDs to evaluate */
  getOrgIds: () => Promise<string[]>;

  /** Batch-load recent nudge_log rows (last 24h) for all orgs at once */
  loadRecentNudgeLogs: () => Promise<NudgeLogRow[]>;

  /** Insert a nudge_log row after sending */
  insertNudgeLog: (row: {
    orgId: string;
    scopeId: string | null;
    nudgeType: TNudgeType;
    channel: NudgeChannel;
    userId: string;
    recipientEmail: string;
    payload: Record<string, unknown>;
  }) => Promise<void>;

  /** Render email content for a given nudge type (return null to skip email) */
  getEmailContent?: NudgeEmailContentFn<TNudgeType>;

  /** Send the email via your transport */
  sendEmail?: (params: NudgeEmailParams) => Promise<void>;

  /** Optional quiet-hours check — return true to suppress emails */
  isQuietHours?: () => boolean;

  /** Optional SMS dedup — nudge types to suppress when SMS is active */
  smsDedupTypes?: TNudgeType[];

  /** Check if user has an active SMS conversation */
  checkActiveSms?: (userId: string, orgId: string) => Promise<boolean>;
}

export interface CronResult {
  evaluated: number;
  fired: number;
  skipped: number;
  errors?: string[];
}
