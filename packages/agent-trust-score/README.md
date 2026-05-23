# @caistech/agent-trust-score

Trust-score scanner, grader, and badge generator for AI agent projects.
"Snyk for agentic AI" — runs static + behavioural checks across four
dimensions and returns a weighted grade A–D plus a list of findings.

## Dimensions

| Dimension | Weight | Criteria |
|---|---|---|
| Agent Safety | 40% | Prompt injection, social engineering, jailbreak, function-call abuse, tool poisoning |
| Code Security | 25% | Secrets, dep vulns, RLS coverage, audit trail, secure defaults |
| Cost Governance | 20% | Rate limits, token budgets, cost caps, model selection |
| Compliance | 15% | PII handling, consent capture, retention policy, audit log |

## Install

```bash
npm install @caistech/agent-trust-score
```

`@caistech/security-gate` is an optional peer — install it if you want
to run the behavioural probes (Layer 2). Static-only scans don't need it.

## Usage — scan a project

```ts
import { scanProject } from "@caistech/agent-trust-score";

const report = await scanProject({
  projectRoot: "/path/to/your/project",
  projectSlug: "your-product",
  projectId: "<your-platform-trust-project-uuid>",
  // Optional — point at YOUR trust-grader host so badge_url and
  // report_url come back as absolute URLs. Omit to get relative paths
  // you can prepend your own host to at render time.
  graderUrl: "https://your-grader.example.com",
});

console.log(report.overall_grade);   // "A" | "A-" | ... | "D"
console.log(report.overall_score);   // 0–100
console.log(report.badge_url);       // absolute when graderUrl set, relative otherwise
console.log(report.findings);        // CriterionResult[] for fails + partials
```

## Usage — grade an existing result set

```ts
import { calculateGrade } from "@caistech/agent-trust-score";

const report = calculateGrade(
  criterionResults,
  "your-product",
  "https://your-grader.example.com", // optional — omit for relative URLs
);
```

## BYOK note

This package ships **no default grader host**. Consumers running their
own trust-grader pass `graderUrl` (or `ScanConfig.graderUrl`) explicitly.
Consumers without a grader get relative `/badge/<slug>` and
`/report/<slug>/<date>` paths in the returned report and resolve them
at render time against whatever host they prefer.

The CAS-hosted `https://platform-trust.vercel.app` is no longer baked
into the package as a default. If you genuinely want to use it, pass it
explicitly:

```ts
scanProject({ ..., graderUrl: "https://platform-trust.vercel.app" });
```

## Standalone checkers

The four dimension checkers are exported individually:

```ts
import {
  checkAgentSafety,
  checkCodeSecurity,
  checkCostGovernance,
  checkCompliance,
} from "@caistech/agent-trust-score";

const safetyResults = checkAgentSafety("/path/to/project");
```

## Badge rendering

```ts
import { renderBadge, renderExpiredBadge } from "@caistech/agent-trust-score";

const svg = renderBadge({ grade: "A-", score: 91, project_slug: "your-product" });
```
