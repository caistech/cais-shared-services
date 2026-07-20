/**
 * @caistech/webmcp-kit — Agent-Readiness kit (PRODUCT_STANDARDS §11, Layer 1: DISCOVERABLE)
 *
 * One shared install so every portfolio product is discoverable + legible to AI search and
 * browser agents (the agent-web channel opened by Google I/O 2026 — WebMCP, auto-browse
 * Information Agents, native voice-to-structure). Before this, the pattern lived only in the
 * storefront-mcp repo it was born in and was never propagated; this package is the extraction.
 *
 * SCOPE (v0.1) = Layer 1 only, the cheap, experience-adjacent, Gate-1-appropriate signals:
 *   1. /llms.txt                 — what the product is + key URLs, agent-legible
 *   2. schema.org / JSON-LD      — SoftwareApplication (+ optional Organization) on the landing
 *   3. /.well-known/agent.json   — a lightweight agent descriptor
 * Layer 2 (WebMCP operability) + Layer 3 (remote MCP integration) are Tier-1 / post-Gate-2
 * concerns and are DEFERRED to future subpaths — do not over-build them into the validation slice.
 *
 * LANE-AWARE ("whose brand travels"): pass `provider` = the DISTRIBUTOR for a white-label
 * product, never a CAS identity. Omit it and the Organization node + manifest.provider are simply
 * left out (safe default for a single-brand CAS product).
 *
 * Zero runtime deps. This core entry imports NO React, so route handlers and Node scripts can use
 * the generators freely; the `<AgentJsonLd>` component lives on the `/react` subpath.
 *
 * Wiring (per consumer, ~4 tiny files — see README):
 *   app/llms.txt/route.ts            → export const GET = llmsTxtHandler(agentConfig)
 *   app/.well-known/agent.json/route.ts → export const GET = agentManifestHandler(agentConfig)
 *   <AgentJsonLd config={agentConfig} /> in the marketing landing (from "@caistech/webmcp-kit/react")
 *   agent-readiness.config.ts        → your AgentReadinessConfig
 */

/* ========================= CONFIG ========================= */

export interface KeyPage {
  /** Human title, e.g. "Pricing". */
  title: string;
  /** Absolute or root-relative URL, e.g. "/pricing" or a full URL. */
  url: string;
  /** One-line description for the llms.txt entry. */
  description?: string;
}

export interface Offer {
  /** e.g. "Free", "Pro". */
  name?: string;
  /** Numeric price as a string, e.g. "49". Omit for "free"/"contact us". */
  price?: string;
  /** ISO 4217, defaults to "AUD". */
  priceCurrency?: string;
  /** Free-text terms, e.g. "per user / month". */
  description?: string;
}

export interface Provider {
  /** The brand that owns/sells this product. For white-label, the DISTRIBUTOR — never CAS. */
  name: string;
  url?: string;
  /** Registered legal identifier surfaced in the manifest (e.g. an ABN). Optional. */
  legalId?: string;
}

export interface LlmsSection {
  /** e.g. "How it works". */
  heading: string;
  /** Markdown-ish body. */
  body: string;
}

export interface AgentReadinessConfig {
  /** Short product name, e.g. "TenderWatch". */
  name: string;
  /** Canonical production URL, no trailing slash, e.g. "https://tenderwatch-alpha.vercel.app". */
  url: string;
  /** One-to-two sentence description of what the product is + does. */
  description: string;
  /** Marketing title, e.g. "TenderWatch — AI-Powered Tender Intelligence". Defaults to `name`. */
  displayName?: string;
  /** schema.org SoftwareApplication category. Default "BusinessApplication". */
  applicationCategory?: string;
  /** schema.org operatingSystem. Default "Web". */
  operatingSystem?: string;
  /** Key pages an agent should know about (used in llms.txt + surfaced in the manifest). */
  keyPages?: KeyPage[];
  /** Pricing offers → schema.org offers. Omit for products that don't publish pricing. */
  offers?: Offer[];
  /** The selling brand. Lane-aware: distributor for white-label, CAS/entity otherwise. Optional. */
  provider?: Provider;
  /** Other canonical profiles (social, App Store, GitHub) → schema.org sameAs. */
  sameAs?: string[];
  /** Extra freeform sections appended to llms.txt. */
  llmsTxtSections?: LlmsSection[];
  /** Public contact email surfaced in llms.txt + the manifest. */
  contactEmail?: string;
}

/* ========================= INTERNAL HELPERS ========================= */

function trimUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Resolve a possibly root-relative page URL against the product's canonical origin. */
function absolute(base: string, url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${trimUrl(base)}${url.startsWith("/") ? "" : "/"}${url}`;
}

/* ========================= 1. llms.txt ========================= */

/**
 * Produce the text body of `/llms.txt` (the Answer.AI convention): an agent-legible summary of the
 * product + its key URLs. Deterministic — same config in, same bytes out.
 */
export function generateLlmsTxt(config: AgentReadinessConfig): string {
  const title = config.displayName ?? config.name;
  const lines: string[] = [];

  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`> ${config.description}`);
  lines.push("");
  lines.push(`Canonical URL: ${trimUrl(config.url)}`);
  if (config.provider) {
    lines.push(
      `Provider: ${config.provider.name}${config.provider.url ? ` (${config.provider.url})` : ""}`,
    );
  }
  if (config.contactEmail) lines.push(`Contact: ${config.contactEmail}`);
  lines.push("");

  if (config.keyPages && config.keyPages.length > 0) {
    lines.push("## Key pages");
    for (const page of config.keyPages) {
      const abs = absolute(config.url, page.url);
      lines.push(`- [${page.title}](${abs})${page.description ? `: ${page.description}` : ""}`);
    }
    lines.push("");
  }

  if (config.offers && config.offers.length > 0) {
    lines.push("## Pricing");
    for (const offer of config.offers) {
      const label = offer.name ?? "Plan";
      const price =
        offer.price != null
          ? `${offer.priceCurrency ?? "AUD"} ${offer.price}`
          : "see site";
      lines.push(`- ${label}: ${price}${offer.description ? ` — ${offer.description}` : ""}`);
    }
    lines.push("");
  }

  for (const section of config.llmsTxtSections ?? []) {
    lines.push(`## ${section.heading}`);
    lines.push(section.body.trim());
    lines.push("");
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/* ========================= 2. schema.org JSON-LD ========================= */

/** Build the schema.org `SoftwareApplication` node for the landing page. */
export function buildSoftwareApplicationJsonLd(
  config: AgentReadinessConfig,
): Record<string, unknown> {
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: config.displayName ?? config.name,
    description: config.description,
    url: trimUrl(config.url),
    applicationCategory: config.applicationCategory ?? "BusinessApplication",
    operatingSystem: config.operatingSystem ?? "Web",
  };

  if (config.sameAs && config.sameAs.length > 0) node.sameAs = config.sameAs;

  if (config.offers && config.offers.length > 0) {
    node.offers = config.offers.map((offer) => {
      const o: Record<string, unknown> = { "@type": "Offer" };
      if (offer.name) o.name = offer.name;
      if (offer.price != null) {
        o.price = offer.price;
        o.priceCurrency = offer.priceCurrency ?? "AUD";
      }
      if (offer.description) o.description = offer.description;
      return o;
    });
  }

  if (config.provider) {
    node.provider = buildOrganizationJsonLd(config.provider, { standalone: false });
  }

  return node;
}

/**
 * Build the schema.org `Organization` node for the selling brand. Lane-aware — pass the
 * distributor for a white-label product. `standalone: false` omits the `@context` so it can nest
 * inside another node.
 */
export function buildOrganizationJsonLd(
  provider: Provider,
  opts: { standalone?: boolean } = {},
): Record<string, unknown> {
  const node: Record<string, unknown> = {
    "@type": "Organization",
    name: provider.name,
  };
  if (opts.standalone !== false) node["@context"] = "https://schema.org";
  if (provider.url) node.url = provider.url;
  if (provider.legalId) node.identifier = provider.legalId;
  return node;
}

/**
 * The full JSON-LD payload for the landing page — a `@graph` of the SoftwareApplication (+ a
 * standalone Organization when a provider is set). This is what `<AgentJsonLd>` serialises.
 */
export function buildLandingJsonLd(config: AgentReadinessConfig): Record<string, unknown> {
  const app = buildSoftwareApplicationJsonLd(config);
  if (!config.provider) return app;
  // In a @graph the wrapper carries @context; strip it from the member nodes to avoid repetition.
  const org = buildOrganizationJsonLd(config.provider, { standalone: false });
  delete app["@context"];
  return { "@context": "https://schema.org", "@graph": [app, org] };
}

/* ========================= 3. /.well-known/agent.json ========================= */

/**
 * Build the `/.well-known/agent.json` descriptor. `capabilities` truthfully reflects the DISCOVERABLE-only
 * scope of v0.1 — `operable` / `integratable` flip on when Layers 2/3 are wired for a product.
 */
export function buildAgentManifest(config: AgentReadinessConfig): Record<string, unknown> {
  const base = trimUrl(config.url);
  const manifest: Record<string, unknown> = {
    schema_version: "0.1",
    name: config.name.toLowerCase().replace(/\s+/g, "-"),
    display_name: config.displayName ?? config.name,
    description: config.description,
    url: base,
    llms_txt: `${base}/llms.txt`,
    capabilities: {
      discoverable: true,
      operable: false,
      integratable: false,
    },
  };

  if (config.keyPages && config.keyPages.length > 0) {
    manifest.key_pages = config.keyPages.map((page) => ({
      title: page.title,
      url: absolute(config.url, page.url),
      ...(page.description ? { description: page.description } : {}),
    }));
  }
  if (config.contactEmail) manifest.contact = { email: config.contactEmail };
  if (config.provider) {
    manifest.provider = {
      name: config.provider.name,
      ...(config.provider.url ? { url: config.provider.url } : {}),
      ...(config.provider.legalId ? { legal_id: config.provider.legalId } : {}),
    };
  }

  return manifest;
}

/* ========================= NEXT.JS ROUTE HANDLERS ========================= */

const TEXT_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  // Agents + crawlers re-fetch infrequently; cache a day at the edge, allow stale-while-revalidate.
  "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
};

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
};

/**
 * GET handler for `app/llms.txt/route.ts`:
 *   export const GET = llmsTxtHandler(agentConfig)
 * Returns a web `Response` — works in any Next.js App Router / edge / node runtime.
 */
export function llmsTxtHandler(config: AgentReadinessConfig): () => Response {
  const body = generateLlmsTxt(config);
  return () => new Response(body, { status: 200, headers: TEXT_HEADERS });
}

/**
 * GET handler for `app/.well-known/agent.json/route.ts`:
 *   export const GET = agentManifestHandler(agentConfig)
 */
export function agentManifestHandler(config: AgentReadinessConfig): () => Response {
  const body = JSON.stringify(buildAgentManifest(config), null, 2);
  return () => new Response(body, { status: 200, headers: JSON_HEADERS });
}
