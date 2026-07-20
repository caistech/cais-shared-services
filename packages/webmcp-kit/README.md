# @caistech/webmcp-kit

Agent-Readiness kit — the one-install path that makes a portfolio product discoverable and legible
to AI search + browser agents (**PRODUCT_STANDARDS §11 Layer 1: DISCOVERABLE**). This is the
extraction of the pattern that previously lived only in `storefront-mcp`; it was never propagated,
so as of 2026-07-12 **0 of 26 audited products served an `llms.txt`** and only the origin repo had a
`.well-known` manifest. This package fixes that once, for everyone.

## Scope

**v0.1 = Layer 1 only** — the cheap, experience-adjacent, Gate-1-appropriate signals:

1. `/llms.txt` — agent-legible summary + key URLs
2. schema.org **JSON-LD** (`SoftwareApplication` + optional `Organization`) on the landing
3. `/.well-known/agent.json` — a lightweight agent descriptor

**Deferred (do NOT over-build into a validation slice):** Layer 2 (WebMCP operability — key actions
as agent tools) and Layer 3 (remote MCP integration) are Tier-1 / post-Gate-2 concerns and will land
as future subpaths (`/webmcp`, `/mcp`).

## Lane-awareness ("whose brand travels")

Pass `provider` = the **distributor** for a white-label product, never a CAS identity. Omit it and
the `Organization` node + `manifest.provider` are simply left out (safe default for a single-brand
CAS product).

## Install

```bash
npm install @caistech/webmcp-kit
```

## Wiring (4 tiny files per consumer)

**1. `agent-readiness.config.ts`** (repo root or `src/`) — your config:

```ts
import type { AgentReadinessConfig } from "@caistech/webmcp-kit";

export const agentConfig: AgentReadinessConfig = {
  name: "TenderWatch",
  displayName: "TenderWatch — AI-Powered Tender Intelligence",
  url: "https://tenderwatch-alpha.vercel.app",
  description: "AI-powered discovery + matching of Australian government tenders...",
  keyPages: [
    { title: "Pricing", url: "/pricing", description: "Free and Pro tiers" },
    { title: "Sign up", url: "/signup" },
  ],
  offers: [{ name: "Pro", price: "49", priceCurrency: "AUD", description: "per user / month" }],
  // Lane-aware: distributor for white-label, else the operating entity.
  provider: { name: "Global Buildtech Australia Pty Ltd", legalId: "ABN 54 672 395 685" },
  contactEmail: "dennis@corporateaisolutions.com",
};
```

**2. `app/llms.txt/route.ts`:**

```ts
import { llmsTxtHandler } from "@caistech/webmcp-kit";
import { agentConfig } from "@/agent-readiness.config";
export const GET = llmsTxtHandler(agentConfig);
export const dynamic = "force-static";
```

**3. `app/.well-known/agent.json/route.ts`:**

```ts
import { agentManifestHandler } from "@caistech/webmcp-kit";
import { agentConfig } from "@/agent-readiness.config";
export const GET = agentManifestHandler(agentConfig);
export const dynamic = "force-static";
```

**4. `<AgentJsonLd config={agentConfig} />`** in the public marketing landing (Server Component):

```tsx
import { AgentJsonLd } from "@caistech/webmcp-kit/react";
import { agentConfig } from "@/agent-readiness.config";

export default function Landing() {
  return (
    <>
      <AgentJsonLd config={agentConfig} />
      {/* ...page... */}
    </>
  );
}
```

## Verify

```bash
curl -s https://<your-url>/llms.txt
curl -s https://<your-url>/.well-known/agent.json | jq .
curl -s https://<your-url>/ | grep -o 'application/ld+json'
```

Then run `/gtm-auditor` — the Agent-Readiness stream scores these as D3 distribution evidence.

## API

| Export | Purpose |
|---|---|
| `generateLlmsTxt(config)` | → the `/llms.txt` body string |
| `buildLandingJsonLd(config)` | → the landing JSON-LD object (`SoftwareApplication` [+ `Organization`]) |
| `buildSoftwareApplicationJsonLd(config)` / `buildOrganizationJsonLd(provider)` | individual nodes |
| `buildAgentManifest(config)` | → the `/.well-known/agent.json` object |
| `llmsTxtHandler(config)` / `agentManifestHandler(config)` | Next.js route `GET` handler factories |
| `AgentJsonLd` (`/react`) | the `<script type="application/ld+json">` server component |

Zero runtime deps; `react` is an optional peer (only the `/react` subpath needs it).
