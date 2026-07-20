/**
 * @caistech/webmcp-kit/react — the JSON-LD landing component.
 *
 * Server-component friendly (no hooks, no "use client"): drop it once in the public marketing
 * landing/layout and it emits the schema.org `<script type="application/ld+json">` block that AI
 * search + browser agents read to describe the product correctly.
 *
 *   import { AgentJsonLd } from "@caistech/webmcp-kit/react";
 *   import { agentConfig } from "@/agent-readiness.config";
 *   ...
 *   <AgentJsonLd config={agentConfig} />
 */

import { buildLandingJsonLd, type AgentReadinessConfig } from "./index.js";

export interface AgentJsonLdProps {
  config: AgentReadinessConfig;
}

/**
 * Renders the product's schema.org JSON-LD. Uses `dangerouslySetInnerHTML` (the standard Next.js
 * pattern for structured data) with `<` escaped to prevent the closing-tag break-out.
 */
export function AgentJsonLd({ config }: AgentJsonLdProps) {
  const json = JSON.stringify(buildLandingJsonLd(config)).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
