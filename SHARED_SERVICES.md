# Shared Services Catalog — what's available to consume (read before building)

> **Purpose.** This is the portfolio's **single capability index of the `@caistech/*` shared
> substrate.** Read it before building anything non-trivial, so you *consume* an existing shared
> service instead of re-forking one (the `@caistech`-first rule + the fork-check guard exist
> precisely to stop the second person rebuilding what the first already extracted). If a capability
> below covers your need, install and consume it — do not hand-roll a local copy.
>
> **It is auto-loaded every session** (imported by the global CLAUDE.md, the same mechanism that
> loads `BUSINESS_MODEL.md` + `PRODUCT_STANDARDS.md`), so every agent in any repo starts knowing
> what the substrate already offers.
>
> **Maintenance rule (non-negotiable).** When you **add a new `@caistech/*` package** or **extend an
> existing one with a notable capability**, update this catalog in the SAME change — a shared service
> that isn't listed here is invisible to every future session and *will* get re-forked. Keep entries
> one-line and capability-focused. Source of truth for each line is the package's own
> `package.json` description; regenerate the bulk of this file from those descriptions if it drifts.
>
> **Install:** registry is GitHub Packages (`@caistech:registry=https://npm.pkg.github.com`, token
> `NODE_AUTH_TOKEN`/`GITHUB_PACKAGES_TOKEN`). `npm install @caistech/<name>`. Consumers import the
> compiled `dist/`, never source. **Last updated:** 2026-06-17 (43 packages).

---

## Trust, security & compliance
| Package | Capability |
|---|---|
| `@caistech/platform-trust-middleware` | Next.js `withTrust` wrapper: rate limiting, permission checks, audit logging, metering. Connects to the Platform Trust Supabase service. |
| `@caistech/security-gate` | CaMeL pipeline, prompt-injection guardrails, red-team probes, kill switch, anomaly detection. Use for **any agentic system**. |
| `@caistech/agent-trust-score` | Agent trust-score scanner/grader/badge — static + behavioural checks (security, correctness, observability, reliability). |
| `@caistech/api-key-auth` | B2B public-API auth: opaque API keys, monthly quota + rollover, `X-RateLimit` headers, Stripe billing webhook. Deno-first (Supabase Edge) + Node. |
| `@caistech/security` | Legacy JS: permissions, PII classification, audit logging, consent, data retention. |
| `@caistech/portfolio-gate` | Portfolio Standard enforcement: `errorResponse` (R10), route/auth/session smoke tests, static audits (R3/R7/R8/R9/R11/R15 + responsive), a **live RLS audit** (`runRlsLiveAudit`/`audit-rls-live`, R9 — queries the running DB via the Supabase Management API and fails any public table that is RLS-off + anon-readable, so **Drizzle-push/dashboard schemas and prod drift can't hide from the static migration audit**; skips cleanly without a project ref + `SUPABASE_ACCESS_TOKEN`), and an `audit-all` runner. **v0.4.0+.** |
| `@caistech/sanctions-screen` | Multi-list sanctions screening (OFAC SDN, UN, AU DFAT, UK HMT, EU) — provider pattern, caching, fuzzy match. |
| `@caistech/business-registry` | Multi-country business-registry lookup (CN/VN/MY/AU formats + pluggable live providers). |
| `@caistech/cais-au-compliance-mcp` | MCP server exposing AU compliance tools (ABN, registry, sanctions, cert extraction). Thin adapter over the `@caistech/*` packages. |
| `@caistech/email-compliance` | **Australian Spam Act 2003 email compliance** — brand-configurable sender identity (name/ABN/postal/email/phone, `senderFromEnv`), consent-basis labelling (inferred vs express), and a prominent unsubscribe footer (HTML + text via `complianceFooterHtml`/`complianceFooterText`/`withComplianceFooter`), plus `assertCompliant()` — a guard that throws on a commercial send missing an ABN/unsubscribe. **Jurisdiction guard:** `assertJurisdictionAllowed()` + `SUPPORTED_OUTREACH_JURISDICTIONS` (AU only) **hard-block email outreach to non-AU contacts** until that country's compliance is set up (LinkedIn exempt — email only). **Consume in EVERY repo that sends email** (the PRODUCT_STANDARDS Spam Act gate); white-label products pass the DISTRIBUTOR's identity. |

## AI, models & extraction
| Package | Capability |
|---|---|
| `@caistech/ai-client` | Anthropic SDK + OpenRouter routing helper — the **consistent Claude client** init across the portfolio. Use instead of raw SDK setup. Config-only (you construct the SDK), so meter the Anthropic path yourself via `@caistech/usage-meter` `meterAnthropic(resp.usage, {model})`. |
| `@caistech/openrouter-client` | OpenRouter LLM client with retry + streaming. **Non-streaming `chatCompletion` auto-reports token usage** via `@caistech/usage-meter` (no-op unless `USAGE_INGEST_*` env is set). |
| `@caistech/usage-meter` | Per-product/per-API usage meter — fire-and-forget reporter to the cockpit `POST /api/ingest/usage` + Anthropic/OpenRouter usage adapters (`usageFromAnthropic`/`usageFromOpenRouter`, `meterAnthropic`/`meterOpenRouter`). Never throws, never blocks the LLM call; **NO-OP until `USAGE_INGEST_URL`/`USAGE_INGEST_TOKEN`/`USAGE_PRODUCT_SLUG` are set**. Feeds the Cost Dashboard's per-product analytics. |
| `@caistech/agents` | Legacy JS: agent provisioning, prompt templates, secure gateway. |
| `@caistech/extractors` | LLM content extractors — business profile from a website; business signals from LinkedIn/Facebook/Instagram. Inject any LLM. |
| `@caistech/cert-extractor` | OCR + structured entity extraction for certs/licences (ISO 9001, CodeMark, JAS-ANZ, mill certs). Bilingual; inject any vision LLM. |
| `@caistech/voice-validation-bridge` | Extracts validation-schema field suggestions from voice-interview transcripts via LLM. |

## Voice & language
| Package | Capability |
|---|---|
| `@caistech/elevenlabs-convai` | **The portfolio voice stack** — ElevenLabs Conversational AI: agent provisioning, webhook routes, the **full persistent-memory loop** (`handleStartConversation` recall, `handlePostCallWebhook` with an `onConversationComplete` distil seam, `handleSaveMemory`/`handleRecallMemory`, `distillConversationToMemory`), anonymous sessions (`mintAnonSessionToken`), and a React `VoiceWidget` (`/react`). **Building a voice agent? Follow `VOICE_MEMORY_STANDARD.md` and wire ALL THREE legs of the loop** (persist+distil, recall+inject, capture-as-you-go) — mounting only some gives storage, not memory (the Morgan/SayFix failure). **v0.4.2+: `DEFAULT_AGENT_LLM` = gpt-4.1-mini** (every agent inherits it — gpt-4o-mini dropped tool calls over long calls); **one-conversation voice + text** via opt-in `textInput`; `onReady(controls)` exposes `{ sendUserMessage, sendContextualUpdate }` for timed/system turns the agent speaks. Never build a parallel voice client — consume this. |
| `@caistech/elevenlabs-voice` | ElevenLabs TTS + STT wrappers for one-shot (non-conversational) voice ops. |
| `@caistech/language-config` | 80+ language definitions with TTS provider mapping (ElevenLabs/Google). |
| `@caistech/stt-noise-filter` | Strip ambient-noise descriptions from STT output (rule-based + LLM). |

## Discovery, enrichment & outreach
| Package | Capability |
|---|---|
| `@caistech/email-finder` | Multi-provider contact/email cascade (Hunter → Apollo → Hunter pattern) — best name+email for a domain, confidence-ordered. |
| `@caistech/hunter-email` | Hunter.io wrapper — email-finder, domain-search, email-verifier. |
| `@caistech/apollo-people` | Apollo.io wrapper — People Search (free) + People Enrichment (1 credit/reveal). |
| `@caistech/brave-search` | Brave Search API wrapper — web results for prospect discovery/research. |
| `@caistech/unipile-channels` | Unipile wrapper — LinkedIn (search/profile/posts/DM/connect), Gmail/Outlook send, hosted OAuth, account mgmt. |
| `@caistech/ghl-client` | Go High Level (GHL) CRM client — contacts, opportunities, workflows (native fetch). |
| `@caistech/nudge-core` | Generic nudge/notification infra — evaluator registry, frequency caps, email builder, cron handler. |
| `@caistech/cais-interview-agent` | MCP funnel interview — single-page form capturing email + triage outcome → `mcp_engagement` rows. |

## Data & geography
| Package | Capability |
|---|---|
| `@caistech/abn-lookup` | ABN validation, formatting, ABR lookup. Use for any AU business field. |
| `@caistech/mapbox` | Mapbox Geocoding v5 — forward/reverse, coordinate parsing, static maps (incl. satellite). AU-biased. Use for any address field. |
| `@caistech/db-schema` | Shared Supabase schema fragments (multi-tenancy, agents, audit, consent, storefront). ⚠️ not-yet-publishable (no migrations dir yet). |

## Domain SDKs
| Package | Capability |
|---|---|
| `@caistech/property-services-sdk` | Property intelligence — derive/assess/onboard. Wraps the property-services Supabase edge functions. The substrate for the property engine. |
| `@caistech/property-launch-kit` | Property-sale launch-page primitives — branded admin emails, notify-recipient mgmt, React cards. Used by f2k-projects. |
| `@caistech/coordination-sdk` | Cross-project issue tracking + multi-party coordination — Supabase-backed, evaluators, magic links, React hooks. |

## UI, reporting & embeds
| Package | Capability |
|---|---|
| `@caistech/corporate-components` | Shared React: the canonical **auth surface** (`AuthForm` — 5 modes, **theme-able** `light`/`dark` + `accent`, password visibility toggle, magic-link, **SSR-safe recovery routed through `/auth/callback`**; **v0.5.0+ adds `extraFields`** — product-specific signup fields (name/company/required-ToS-checkbox/custom-render widget like ABN-lookup) flow to `signUp` user_metadata, so even bespoke-field signups adopt the ONE component; only server-action signups that provision org/referral server-side stay a principled divergence), header, footer, explanatory page header (R3), trust scaffolding (R15), ABN lookup, address autocomplete, brand Tailwind palette + global CSS. **The R1 auth foundation every product adopts — never hand-roll login/signup/forgot/reset.** Tailwind v4 consumers must `@source` the package dist. Pairs with the canonical `/auth/callback` route (`verifyOtp` for `?token_hash=&type=`, `exchangeCodeForSession` for `?code=`) + setup flow (`@caistech/portfolio-env-sync` `auth_config` + `configure-email-templates.sh`). Reference migration: executorai; reference scaffold: `templates/cais-build-template-v2`. |
| `@caistech/next-auth` | Standard auth utilities for Next.js + Supabase. |
| `@caistech/report-generator` | Markdown → branded PDF (brand + disclaimer + watermark + page numbers). |
| `@caistech/sayfix-embed` | SayFix bug-reporting widget — GBTA-controlled service layer. Wire `<SayFixWidget repo="…" />` (root layout; `repo` MUST equal the SayFix `repos.github_repo`) per the PRODUCT_STANDARDS SayFix gate. **v0.3.0+ ships a compiled `dist/` + zero runtime deps (inlined SVG icons) → no `transpilePackages` needed; ≤0.2.0 shipped raw `src/index.ts` JSX and broke Next builds.** Rollout runbook: `SAYFIX_INTEGRATION_ROLLOUT.md`. |
| `@caistech/byok-setup` | BYOK key-onboarding wizard — reads `byok.config.json`, validates pasted keys, generates secrets, distributes to `.env.local` + Vercel. |
| `@caistech/spec-markers` | **Survey-marker drop-in for EXTERNAL pre-built products.** The methodology survey gate greps 14 `data-*` markers from a product's SSR'd landing HTML (no JS exec) to verdict it (RENOVATION/TEARDOWN/…). Factory-generated products plant them at build; a hand-built/external product (separate codebase, can't read the pipeline DB) installs this and drops `<SpecMarkers slug="x"/>` (async Server Component) on its public landing — it fetches the public `GET <pipeline>/api/public/spec-markers/<slug>` and SSRs the attrs. Marker MAPPING stays single-sourced in pipeline (thin renderer, no drift). Also `fetchSpecMarkers()` + `buildSurveyManifest()` (→ `public/survey-manifest.json`). ⚠️ the product's card needs `feasibility.why_now` set or survey P3 fails. |

## Portfolio operations (hub tooling, not product deps)
| Package | Capability |
|---|---|
| `@caistech/portfolio-env-sync` | Manifest-driven Vercel env audit + apply across all projects (`--apply`, `from_supabase`, `secrets:`, `auth_config`). |
| `@caistech/portfolio-migrator` | Dry-run-first CLI backfilling existing products onto the Portfolio Standard — inspect/plan/apply, never auto-pushes. |

---

*Not every `packages/*` dir is published (e.g. `site-intelligence`, `db-schema` are WIP/private). The
authoritative list is `packages/*/package.json` with `private` unset; this catalog tracks the
consumable substrate. When in doubt, `ls packages/` + read the target `package.json`.*
