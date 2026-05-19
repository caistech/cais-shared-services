/**
 * Shared type definitions for the portfolio-migrator CLI.
 *
 * The migrator runs in three phases — inspect, plan, apply — and every phase
 * shares the same `Gap` / `Migration` vocabulary so output is consistent
 * across `inspect`, `plan`, `apply`, and `status`.
 */

/**
 * A single Portfolio Standard rule (R1 … R18). The string is the rule
 * identifier used in `foundation/PORTFOLIO_STANDARD.md`.
 */
export type RuleId =
  | 'R1'
  | 'R2'
  | 'R3'
  | 'R6'
  | 'R9'
  | 'R10'
  | 'R11'
  | 'R12'
  | 'R13'
  | 'R14'
  | 'R15';

/**
 * Severity flag a `Gap` carries. `fail` blocks ship; `warn` is informational.
 */
export type GapSeverity = 'fail' | 'warn' | 'info';

/**
 * A single inspection finding — something the target repo doesn't comply
 * with against the Portfolio Standard.
 */
export interface Gap {
  /** Rule this gap violates. */
  rule: RuleId;
  /** Stable id used to look up the migration that closes this gap. */
  migrationId: MigrationId;
  /** One-line description of what's missing. */
  message: string;
  /** Severity flag. */
  severity: GapSeverity;
  /** Repo-relative file path that triggered the gap (if any). */
  file?: string;
  /** 1-indexed line number (if any). */
  line?: number;
  /** Extra free-form detail (matched text, expected version, etc.). */
  detail?: string;
}

/**
 * Identifier for a v0.1 migration. Each migration closes one or more gaps.
 * Identifiers are stable across versions — new migrations append.
 */
export type MigrationId =
  | 'install-portfolio-gate'
  | 'scaffold-routes-config'
  | 'scaffold-auth-config'
  | 'scaffold-gate-workflow'
  | 'upgrade-corporate-components'
  | 'swap-auth-pages-to-authform'
  | 'vendor-identity-scrub'
  | 'vendor-identity-env-defaults'
  | 'add-resend-from-email-example'
  | 'add-explanatory-header-note'
  | 'rls-using-true-note';

/**
 * One step of the proposed migration plan. Either a `patch` (mechanical
 * change the migrator can safely apply) or a `note` (human-judgment
 * required — the migrator emits the change for review but never applies it
 * automatically).
 */
export type MigrationStep =
  | {
      kind: 'patch';
      id: MigrationId;
      rule: RuleId;
      title: string;
      description: string;
      /** Files to write / create. Each entry overwrites the destination. */
      files: ProposedFile[];
      /** Files to modify in place via a string-replace. */
      replacements?: ProposedReplacement[];
      /** Optional shell command that should run AFTER files are written. */
      followUpCommand?: string;
    }
  | {
      kind: 'note';
      id: MigrationId;
      rule: RuleId;
      title: string;
      description: string;
      /** Markdown body shown to the user describing what they need to do. */
      body: string;
      /**
       * Optional file content to suggest — gets embedded in the markdown
       * for review; never written to the working tree.
       */
      suggestedFiles?: ProposedFile[];
    };

/**
 * A file the migrator wants to write. `content` is the literal bytes; the
 * migrator only ever creates or overwrites whole files. Surgical edits go
 * through `replacements` instead.
 */
export interface ProposedFile {
  /** Repo-relative path. */
  path: string;
  /** Whole-file content to write. */
  content: string;
  /** If true, only write if the file doesn't already exist. Default false. */
  ifMissing?: boolean;
}

/**
 * An in-place string replacement. Used for vendor-identity scrubbing and
 * package.json version bumps where the existing file should be preserved
 * except for one specific span.
 */
export interface ProposedReplacement {
  /** Repo-relative path. Must exist. */
  path: string;
  /** Exact string to find (literal, not regex). */
  find: string;
  /** Replacement value. */
  replace: string;
  /** Replace every occurrence (default false — only the first). */
  replaceAll?: boolean;
  /** One-line description shown in the plan markdown. */
  description: string;
}

/**
 * Aggregate output of the `inspect` command. Persisted to disk as both
 * a JSON file (for tooling) and a markdown file (for human review).
 */
export interface InspectionReport {
  /** Repo absolute path that was inspected. */
  repoPath: string;
  /** ISO8601 timestamp the inspection ran. */
  timestamp: string;
  /** Detected package name (from package.json), if any. */
  packageName?: string;
  /** Detected framework — currently only 'next' or 'unknown'. */
  framework: 'next' | 'unknown';
  /** Every gap found in the repo. */
  gaps: Gap[];
  /** Compliance summary across all 11 v0.1 rules. */
  compliance: ComplianceSummary;
}

/**
 * Per-rule pass/fail breakdown. `passed` is a hard yes/no; `gapsCount` is
 * the number of Gap entries the inspection produced for that rule.
 */
export interface ComplianceSummary {
  /** Total rules checked (always 11 in v0.1). */
  rulesChecked: number;
  /** Rules that passed (no fail-severity gaps). */
  rulesPassed: number;
  /** 0–100 compliance percentage. */
  percentage: number;
  /** Per-rule breakdown. */
  perRule: Array<{
    rule: RuleId;
    passed: boolean;
    gapsCount: number;
    description: string;
  }>;
}

/**
 * The full plan emitted by `plan` — written to disk as a `.patch` companion
 * to a `.md` summary. The `apply` command consumes this JSON to know what
 * to do.
 */
export interface MigrationPlan {
  /** Repo absolute path the plan targets. */
  repoPath: string;
  /** ISO8601 timestamp the plan was generated. */
  timestamp: string;
  /** Inspection that drove the plan. */
  inspection: InspectionReport;
  /** Ordered list of steps. Apply executes in order. */
  steps: MigrationStep[];
}

/**
 * Outcome of running `apply` against a single step.
 */
export interface ApplyOutcome {
  step: MigrationStep;
  kind: 'applied' | 'skipped' | 'error' | 'note-deferred';
  reason?: string;
  filesWritten?: string[];
}
