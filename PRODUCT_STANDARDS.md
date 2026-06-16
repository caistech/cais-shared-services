# Product Standards — the non-negotiable build DNA (pre-ship checklist)

> **What this is.** The portable, scannable checklist of every non-negotiable product/UI/build
> directive every active repo + every new page must meet. It is the **accessible home** of these
> standards: the authoritative prose lives in the machine-local `~/.claude/CLAUDE.md`, which
> teammates / cloud agents / other machines can't read — this file lives in the repo so anyone
> with a clone has them. Each item cites its CLAUDE.md source.
>
> **How to use.** Run the §0 60-second gate before claiming any page/surface "done". Run the full
> list before shipping a new product or a major revamp. "Looks fine on my screen" is not a check —
> every item has a concrete verification.
>
> **Severity.** These are auth-pattern severity: missing one is a **bug, not a polish item.**
> **Last updated:** 2026-05-25.

---

## 0. The 60-second per-page gate (run on every new page/surface)

- [ ] **Explanatory header** at the top — answers *what is this / what do I do here / why does it matter* (§5).
- [ ] **Responsive** — open at 375px and 1440px; every goal completes; no horizontal scroll; primary action works with a thumb (§1).
- [ ] **Touch targets ≥44px, base text ≥16px** on mobile (§1).
- [ ] If it's behind auth: **persistent left navbar present, with Settings + Sign Out** (§4).
- [ ] If it has nuanced input: the **voice agent** is reachable from the chrome (§6).
- [ ] Any **irreversible / cost-incurring / outreach-firing action** states its consequence *before* the click and requires confirm (§9 — codicil).
- [ ] If the surface **sends any commercial email** (campaign, newsletter, acknowledgement, outreach): it carries the **Spam Act footer** (sender + ABN + prominent unsubscribe + consent basis) via `@caistech/email-compliance`, and the send path calls `assertCompliant()` (§9 — codicil).
- [ ] **Browser tab title** is the product name, not "Create Next App" (§7).

If any box is unchecked, the page is not done.

---

## 0.5 Before sign-off: run quality-gate testers (MANDATORY on every build / update)

Before signing off on **any new build or build update** — a new product, a new feature, or a revamp of an existing surface — run the relevant **quality-gate testers** against the live (or preview) URL. These are independent human-eyes sweeps that catch what per-page self-checks miss. **Any blocking finding (❌ severity) is a release-blocking issue, same severity as a bug — nothing ships with an open blocker.**

### Testers that surface issues (all products with dual-auth portals)

Every tester that surfaces findings — **`/naive-tester`, `/voice-auditor`, `/gtm-auditor`, `/qa`, `/design-review`, `/devex-review` — must test BOTH admin and user portals** if the product has them (§8.5). The tester runs once with sequential sections (Landing → User Path → Admin Path → Cross-Path Issues for naive-tester; Voice Placement in User Surfaces + Voice Placement in Admin Surfaces for voice-auditor, etc.). **One report per tester, not two.** This ensures:

- Voice agent placement in both portals is *required* (not "nice to have" in user-only)
- GTM distribution loop works end-to-end (both user and admin pathways create next-user signals)
- Visual design + DX consistency applies across both portals
- QA testing validates both access paths work

### Primary tester: `/naive-tester`

Walks the product as a real human persona **and** cross-checks every UI-observable item in this checklist, closing with a **Standards Check** (✅ / ❌ / — per item). **Any ❌ is a release-blocking finding.**

For public-facing or multi-surface builds run the relevant personas (`auto` picks them) — at minimum a domain-operator pass plus Mobile Marcus for anything mobile-reachable. For dual-auth portals, one run covers Landing → User → Admin → Cross-Path; the tester flags cross-access vulns (user reaching admin, etc.) as Findings. *(Wired 2026-05-25 — naive-tester consumes PRODUCT_STANDARDS.md.)*

---

## 1. RESPONSIVE DESIGN (every UI, every viewport)
*Source: CLAUDE.md "RESPONSIVE DESIGN RULE".*

- [ ] Single responsive build (no mobile/desktop fork); works ≤414px **and** ≥1280px, sensible tablet transition.
- [ ] Framework responsive prefixes (Tailwind `sm:`/`md:`/`lg:`), fluid containers (`w-full`, `grid-cols-1 md:grid-cols-N`) — no fixed non-reflowing widths.
- [ ] Mobile-first base styles; breakpoints scale up.
- [ ] **Touch targets ≥44×44px**; no tiny adjacent icon buttons.
- [ ] **Typography ≥16px base on mobile** (prevents iOS zoom); nothing <12px; line length capped on laptop.
- [ ] **Tables/grids have an explicit mobile strategy** — `overflow-x-auto` in a bordered container, OR collapse to stacked cards ≤`md`. Naked off-screen overflow is a fail.
- [ ] **Nav collapses to hamburger/drawer/bottom-bar** on mobile; reachable with a thumb.
- [ ] Forms full-width on mobile; labels wrap; multi-column collapses to one ≤`md`; submit full-width on mobile.
- [ ] Images `max-width:100% / height:auto`; `next/image` with `sizes`.
- [ ] Modals full-screen on mobile, centred on laptop.
- [ ] 3D/canvas/voice viewers size off the parent; touch + mouse both work.
- [ ] **Verified in both viewports** (devtools or `/browse`) before "done".

## 2. AUTH PAGE PATTERN (every page with a password field)
*Source: CLAUDE.md "AUTH PAGE PATTERN".*

- [ ] **Forgot-password** link on every login page → working reset flow (forgot → email → reset page calling the provider's update-password).
- [ ] **Password visibility toggle** (Eye/EyeOff, `lucide-react`) on every password input; `tabIndex={-1}` + `aria-label`. Use ONE shared component (`@caistech/corporate-components` `PasswordInput`, or a registry-free local mirror) — never hand-roll the toggle per page; login/signup/reset/change all consume the same component. *(mmcbuild 2026-05-25: reset had it inline, login/signup missing — unified onto one `PasswordInput`.)*
- [ ] **Working magic-link** wired to the provider's OTP method. If "magic link doesn't work" — check SMTP config (Resend custom SMTP) before the code.

## 3. AUTH SMOKE-TEST (on every memory save in a repo with auth)
*Source: CLAUDE.md "AUTH SMOKE-TEST ON EVERY MEMORY SAVE".*

- [ ] Sign-up path executes end-to-end. [ ] Login lands the right surface. [ ] Forgot-password rotates the credential. [ ] Magic-link lands a session (auth callback allowlisted in middleware).

## 4. AUTHENTICATED-APP CHROME + SETTINGS (every repo with a full auth flow)
*Source: CLAUDE.md "AUTHENTICATED-APP CHROME + SETTINGS PAGE RULE".*

- [ ] **Persistent left-side navbar on every authenticated route** (not just the dashboard); collapses to a drawer on mobile with the *same* items; active-route indicator.
- [ ] Items: product surfaces first; **Settings + Sign Out anchored at the bottom**.
- [ ] **`/settings` page reachable in one click**, with an explanatory header and these sections: **Profile** (name/email/phone/company/title, per-section save), **Password** (uses the visibility-toggle field; rotates cleanly), **Notifications** (≥1 category toggle), **Account** (sign-out-everywhere + delete-account with confirm-by-typing-email, hard delete + cascade).
- [ ] **`profiles` table** keyed by `auth.users.id` (first/last/phone/company/job_title/email_marketing_opt_in/created/updated), `on_auth_user_created` trigger, RLS (own row select+update).
- [ ] Per-section save (no "Save All"); optimistic + rollback; phone uses an international input.

## 5. UI EXPLANATORY HEADER (every page + standalone panel)
*Source: CLAUDE.md "UI EXPLANATORY HEADER RULE".*

- [ ] Top of the surface (above forms/tables), 1–3 sentences, answering **what it is / what to do / why it matters**.
- [ ] Operator-facing, matter-of-fact; no emoji, no exclamation, no "Welcome to…".
- [ ] Embedded panels get their own (denser) header. Empty states keep the header.

## 6. VOICE AI (every UI-bearing product)
*Source: CLAUDE.md "VOICE AI STANDARD RULE".*

- [ ] Voice agent surface reachable from the main chrome (header/sidebar/FAB), ≤3 clicks from any page.
- [ ] Consumes **`@caistech/elevenlabs-convai`** (server) + its React `VoiceWidget` (`/react` subpath) — never a per-project re-implementation.
- [ ] **BYOK** — runs on the user's ElevenLabs key, not the operator's.
- [ ] Consistent persona (canonical voice/opening/signature) across the portfolio.
- [ ] ≥1 product-native use-case (not just "ask the docs").
- [ ] **In-context clarifier** wired wherever input has nuance a label can't convey (discussion-style, context-aware of the surface + the user's draft).
- [ ] Webhook provisioning uses the corrected workspace-create-then-bind shape (`bindWorkspaceWebhook` in `@caistech/elevenlabs-convai` ≥0.3.3) — never the deprecated inline `platform_settings.webhook`. Allowlist set on every public agent.
- [ ] **Proactive + stage-aware**, not a passive button — the agent greets on arrival, asks the user's goal, and re-grounds its prompt per flow-stage (e.g. welcome → post-baseline → post-take), passing only the *just-happened* event's trigger as a per-session override (the agent *pulls* the authoritative values per `VOICE_MEMORY_STANDARD.md`) so it speaks about *this* user. Agent id is scaffolded into `voice.config.ts` (via the wizard's `buildVoiceConfig`/`renderVoiceConfigModule`), never a hand-set `NEXT_PUBLIC_*` env. *(Singify 2026-05-25.)*
- [ ] **Conversation length capped + a spoken wrap-up warning.** Set `conversation_config.conversation.max_duration_seconds` — ElevenLabs defaults to **600s (10 min)**, too short for a discovery/coaching call, so `@caistech/elevenlabs-convai`'s `createAgent` defaults to **1200s (20 min)** (override via `CreateAgentOptions.maxDurationSeconds`). A bare cap is a **hard cut mid-sentence** — give a heads-up. The agent has **no clock** (an LLM can't reliably track real elapsed time, so a prompt line like "warn at 18 min" won't fire), and the hub widget exposes only connection status — **not** a way to push a message into a live call, so **don't fork it.** The reliable trigger comes from the **browser** (it knows when the call connected via `onConnect`). The build (4 pieces, designed cross-session 2026-06-08):
  1. **Browser timer from `onConnect`** — the exact elapsed-time source.
  2. **Time signal folded into a tool the agent already calls** (e.g. `get_intake_progress` / `save_field`): when the timer sees < 2 min left, the tool's return string carries *"time's almost up — gently tell the user 'about 2 minutes to go' and wrap up"*; the agent speaks it on its next tool call (it calls them constantly). This is how she actually says it without touching the widget.
  3. **Visual "~2 min left" banner** — always-on backstop, fires on the timer no matter what.
  4. **Prompt nudge (needs re-provision)** so the agent paces and honours the wrap signal.
  Ensure the hard cut still fires `persistSession` (nothing lost). Existing live agents need a one-time PATCH for a new cap; a package default only changes *future* agents after republish.
- [ ] **Persistent memory meets the Voice Memory Standard** — full rules + the *why* + the Singify worked example in **`VOICE_MEMORY_STANDARD.md`** (the rubric `/voice-auditor` loads). The floor: the loop runs end-to-end (recall→distil→persist→recall, scoped by function — full for coaching, pull-only OK for a transient clarifier); **the agent PULLS state, the operator never reads it in** (overrides carry only the just-happened *trigger*, never the values — the agent pulls those); **storage ≠ memory**; works off results, never raw artifacts; identity **server-derived at connect** (`conversation_id`, never `user_id`); **every convai webhook verifies its HMAC** (secret captured-at-creation, stored sensitive, unverified → 401); memory lives in the product's own Supabase with RLS + delete-cascade + TTL + a user memory surface; the agent **degrades-don't-fake** on recall failure; persist is idempotent; the loop is observable.
- [ ] **Placement audited by `/voice-auditor`** (MANDATORY before sign-off) — run the voice-placement auditor (repo scan + optional live pass) to map every surface into *required / could-add-value / not-needed* × *guide-clarifier / coaching*, name the `@caistech/elevenlabs-convai` integration shape per Required surface, and set the repo's `voice_agent_status`. **For products with dual-auth portals (§8.5), audit both User surfaces AND Admin surfaces** — the voice agent placement gate applies to both (e.g., "is voice clarifier required on admin's user-management form?"). One `/voice-auditor` report with sections for Landing → User Voice Placement → Admin Voice Placement → Required Surfaces Analysis. **A Required surface in either portal shipped without voice is a finding.** The gate is **behavioural, not presence-only** — a live pass must show the memory loop *working* (the "welcome-back" recall actually fires + is observable), not merely that routes/tables exist. *(voice-auditor skill, 2026-05-25; mirrors the §0.5 naive-tester gate; dual-portal update 2026-05-28.)*
- [ ] **Voice-presence signal is integration-shape-aware — don't grade an SDK widget against the CDN rubric.** For surfaces consuming the hub `@caistech/elevenlabs-convai/react` `VoiceWidget` (and the in-context clarifier), "voice present" = the **SDK launcher** renders (`.convai-launch` / `.convai-btn`, e.g. "Ask about this") → clicking opens `.convai-panel` with its header → it connects via WebRTC, or shows the text fallback when there's no mic (degrade-don't-fake) → no console errors. The `<elevenlabs-convai>` element + CDN `convai-widget/index.js` script are the signature of a **raw CDN-embed** integration ONLY — checking for them against an SDK widget is a false negative (cost the Pipeline-Gate cockpit a bogus voice ❌, 2026-05-27). *(corporate-ai-solutions cockpit, 2026-05-27.)*

## 7. SCAFFOLD METADATA (every Next.js deploy)
*Source: CLAUDE.md "SCAFFOLD-TIME METADATA CUSTOMIZATION".*

- [ ] Root metadata from `portfolio-manifest.yaml`: `title`=display_name, description, `openGraph.*`, `twitter.card=summary_large_image`, `icons.icon`.
- [ ] **No deployed `<title>` reads "Create Next App" / empty / "Next.js".** Favicon is not the default feather.
- [ ] `curl -sL <url> | grep -oiE '<title>[^<]*</title>'` contains the product name.

## 8. TEAM ADMIN (every repo with public exposure)
*Source: CLAUDE.md "TEAM ADMIN RULE".*

- [ ] `organisations` + `organisation_members` tables; signup auto-creates a personal org (n=1 ok); RLS.
- [ ] Three roles only: **owner / admin / member**.
- [ ] **`/admin`** (owner+admin only) with Members / Usage / Billing / Tenancy / Organisation sections (hide the ones that don't apply, don't blank them).
- [ ] Invite flow (signed single-use token, 14-day expiry, Resend email); pending invites + revoke.
- [ ] Per-user usage attribution on metered rows. Manifest carries `team_admin_status`.

## 8.5 DUAL-AUTH PORTAL (admin control panel + user functional UI)
*Source: CLAUDE.md "DUAL-AUTH PORTAL CONFIGURATION".*

Every product with an auth gate ships **two separate auth flows and UIs from day one**: one for **admins** (operators managing the product) and one for **users** (end consumers). Same person can have both roles, but they log in through different entry points and see completely different UIs.

- [ ] **Landing page** (`/welcome` or `/`) explains the product to visitors and has **two distinct CTAs**: "Admin Login" and "User Sign Up/Login" (or "Start as User"), each routing to its own auth flow.
- [ ] **User auth flow** (`/login` → `/today` or equivalent authenticated route): standard signup/login/forgot-password/magic-link tabs; takes users to the **functional product UI** (what they came for).
- [ ] **Admin auth flow** (`/admin/login` → `/admin` or equivalent dashboard): same auth tabs, but **gates access via `ADMIN_EMAILS` allowlist**; rejected logins are non-admins, and the reject happens at callback (post-auth), not at the form level. Takes admins to the **control panel** (product management, user management, metrics, permissions, billing).
- [ ] **Auth middleware segregates the two**: `/pipeline/*` routes require standard auth (anyone with an account); `/admin/*` routes require BOTH standard auth AND `ADMIN_EMAILS` allowlist match (checked via middleware or API gate).
- [ ] **Both flows have full auth pattern** (§2): forgot-password link, password visibility toggle, working magic-link. Both link to password-reset pages scoped to their flow (`/password-reset` and `/admin/password-reset`).
- [ ] **Landing page is public** — no auth gate, no redirect to login. Visitors read the marketing message and choose their path.
- [ ] **Admin and user both see their own navbar** (§4) — same auth chrome (Settings + Sign Out) but different sidebar/menu items reflecting their role.
- [ ] **Cross-access protection** — users cannot navigate to `/admin/*` (401 / redirect); admins can navigate to `/today` / user routes (because they *are* users too, unless deliberately restricted). The standard pattern: user paths are open, admin paths are gated, so an admin *can* see both; a user can see neither admin paths nor the admin landing cta.

**Testing (naive-tester):**
- One naive-tester run covering both portals in a single report (not two separate reports), with sections for Landing → User Path → Admin Path → Cross-path Issues (if a user can somehow reach admin, or vice versa). *(Codified 2026-05-25.)*
- **The User Path MUST be walked with the NON-admin identity** (`QA_TEST_USER_EMAIL`, never the admin-allowlisted account) and MUST assert the user flow reaches a **real user home distinct from `/admin`** — a signup/login that bounces into the `/admin` gate, dead-ends on an admin login the user can't pass, or a landing that markets a "Start as User" product with no authenticated user area behind it is a **release-blocking FAIL** (the "facade"). This is enforced as **readiness check #43 (CONDITIONAL-HARD, `applies_when: dual-auth`)** — it blocks Launch when a dual-auth product's user flow dead-ends. *(Codified 2026-06-14 after pipeline shipped a user-signup→`/admin` dead-end that passed validation because the tester ran as an admin-allowlisted account and no check asserted user-dest ≠ admin-dest.)*

---

## 9. CODICILS (other non-negotiables that bite)

- [ ] **Consequence clarity** — any irreversible (delete/kill), cost-incurring (real API discovery), or outreach-firing action names its consequence *before* the click and requires confirm + (for terminal) a reason. *(Cross-cut of UX-flow-first + the human-in-the-loop principle; reinforced by the 2026-05-25 cockpit naive-test.)*
- [ ] **Email sender** is `noreply@updates.corporateaisolutions.com` (the only Resend-verified subdomain). The bare apex is NOT verified. *(CLAUDE.md "EMAIL INFRASTRUCTURE".)*
- [ ] **Australian Spam Act 2003 compliance on EVERY commercial email — non-negotiable, all repos.** Any commercial electronic message (cold outreach, campaigns, newsletters, registration acknowledgements, nurture sends) MUST satisfy the three pillars: **(1) consent** — express (opted in) or inferred (a conspicuously-published business address, messaged about its function), with the basis stated to the reader; **(2) identification** — the sender's name **+ ABN** + a reply-capable postal address + contact email, valid ≥30 days; **(3) a functional, prominent unsubscribe**, honoured within 5 business days. **Wire `@caistech/email-compliance`** — `complianceFooterHtml`/`complianceFooterText`/`withComplianceFooter` for the footer and **`assertCompliant()` in the send path** so a non-compliant commercial send throws (missing ABN or unsubscribe = hard error). Brand-configurable: **a white-label / distributor product carries the DISTRIBUTOR's identity + ABN, never a CAS one** (the "whose brand travels" gate). Transactional, recipient-initiated mail (password reset, receipt) is not "commercial" and may omit the unsubscribe — but still carries the identification footer. **Registration/opt-in acknowledgements** must record the consent (timestamp + that they agreed to receive further info about the offer) and state that basis in the email. Removal/opt-out requests are honoured by flipping the prospect to an `unsubscribed`/suppressed state the send query excludes (durable against list re-import), never just a one-off delete. *(Codified 2026-06-16 from the f2k employer-campaign + the WA Mining Club removal; package `@caistech/email-compliance`.)*
- [ ] **Custom SMTP (Resend) is the STANDARD on every auth-bearing product — the Supabase built-in mailer is NEVER acceptable past the first smoke test.** Three things must all be true, set self-serve via the Management API (`~/.supabase-token`), never by asking the operator or "click the dashboard":
  1. **Custom SMTP configured + enabled** — `smtp_host=smtp.resend.com`, port 465, user `resend`, password = the Resend API key, `smtp_admin_email` = the verified subdomain sender above. (Built-in caps ~2–4/hr and sends from a Supabase address — fails real use.)
  2. **`rate_limit_email_sent` raised off the default `2`/hr** (e.g. 30). This is a SEPARATE Supabase Auth knob from the SMTP config — switching to custom SMTP does **not** raise it, so "SMTP is set up but I'm hitting rate limits" = this value is still 2. (corporate-ai-solutions cockpit `tfgtfhwvrswjvkyeyvsp` bit by exactly this, 2026-06-07: SMTP correct, limit still 2 → raised to 30.) `smtp_max_frequency` (per-address min interval, default 60s) is the secondary throttle.
  3. **Branded, user-friendly email templates** (confirm-signup, magic-link, reset, invite, email-change) — set via `configure-email-templates.sh`, NOT the bland Supabase defaults. Product name + sender voice, not "Confirm your signup".
  **Setup trigger:** the feature pre-flight / onboarding (`scripts/onboard-new-project.sh`) must check all three and surface the gap up front; the §3 auth smoke-test must FAIL (not warn) if email is still running on the built-in mailer or the rate limit is still 2. *(Codified 2026-06-07 from the cockpit rate-limit incident; prose home → CLAUDE.md "EMAIL INFRASTRUCTURE".)*
- [ ] **`@caistech` shared-services first** — consume the hub package; never fork a generic helper into the repo. The fork-check (`cais-shared-services/scripts/check-shared-forks.mjs`, run by preflight) gates this. *(CLAUDE.md "@caistech SHARED-SERVICES FIRST".)*
- [ ] **Feature pre-flight** — `feature-manifests/<slug>.json` + `feature-preflight.mjs` before building; surface env/dashboard needs up front. *(CLAUDE.md "FEATURE PRE-FLIGHT RULE".)*
- [ ] **Supabase** — migrations idempotent + applied via CLI (not "paste this in the dashboard"); **RLS on every table**; service-role key never client-side; parameterised queries. *(CLAUDE.md "SUPABASE MIGRATIONS" + code standards.)*
- [ ] **Verify the CLI link == the INTENDED ref before EVERY `db push` — there are multiple LIVE DBs, not one shared.** The portfolio runs **three separate Supabase instances**; the CLI's `supabase/.temp/project-ref` can point at the wrong *live* one, and a migration pushed to the wrong live DB **may not error — it just lands in the wrong place** (or errors `relation … does not exist` if the table is cockpit-only). Canonical ref-map:
  - **`tfgtfhwvrswjvkyeyvsp` = Cockpit + cais-shared-services** (same instance; shared-services reads cockpit tables same-instance). Owns `product_validation_status`, methodology cards, `portfolio_manifest`. **← every cockpit migration + backfill targets THIS ref.**
  - **`azelomanmlywwzbpkksy` = InvestorPilot** (its OWN separate instance — NOT the cockpit).
  - **easy-claude-code = its own instance again** (separate).
  Drift-repair runbook: `cat supabase/.temp/project-ref` → confirm it equals the intended ref (for cockpit work: `tfgtfhwvrswjvkyeyvsp`, **never** `azelomanmlywwzbpkksy`) → if wrong, `supabase link --project-ref <intended>` → re-verify → only then `db push`. The 2026-06-05 "stale ref" scare was not stale: the CLI was linked to `azelomanmlywwzbpkksy` (InvestorPilot) while pushing cockpit migrations. **Always print the linked ref as part of any pre-push pause.** *(CONNECTOR_INVENTORY_V2 topology correction, 2026-06-05.)*
- [ ] **No secrets in committed files / settings / logs.** *(CLAUDE.md security + the no-plaintext-secrets memory.)*
- [ ] **Vercel env vars → `sensitive`, production+preview only.** Any script/route that creates Vercel env vars marks secrets `type: "sensitive"` (non-readable) and targets **production+preview — never `development`**. The CAS + MMC Vercel teams have *Enforce Sensitive Environment Variables* on (2026-05-25), which force-marks prod/preview sensitive and **bans dev creates team-wide**; a plaintext secret is flagged "Needs Attention" (post-April-2026 breach). A PATCH can't convert `encrypted`→`sensitive` — **delete + recreate**. Don't read sensitive values back (they're non-readable) — source from `.env.local`. Public `NEXT_PUBLIC_*`/config: `plain`, still prod+preview only. *(project_vercel_sensitive_env_vars memory.)*
- [ ] **DB dumps / data exports never committed** — `dump-*.sql` and any data export is gitignored, treated as PII, and deleted after the restore verifies. Migrate a Supabase project between orgs via `pg_dump`/restore (a copy), **not** "Transfer project," when the source environment must be retained. Storage files and `auth.users` migrate as *separate* steps (Storage API + `--schema auth`), not via the public-schema dump. **Full runbook: `SUPABASE_MIGRATION_PLAYBOOK.md`.** *(mmcbuild CAS→MMC migration, 2026-05-25.)*
- [ ] **Live credentials exchanged over a secure channel** (password manager / WhatsApp / encrypted) — never plain email. Applies to DB passwords, API keys, service-role keys. *(mmcbuild migration, 2026-05-25.)*
- [ ] **Client/distributor handover ships a key self-serve kit** — manifest-driven wizard (`byok.config.json` → generated `.env.restore.local.example` → a `vercel-env-restore` push script) + an env-cutover doc with a who-fills-what split; the recipient populates their own keys (clean billing boundary), no operator-key handover. **Full standard: `CLIENT_HANDOVER_KIT.md`.** *(mmcbuild CAS→MMC migration, 2026-05-25.)*
- [ ] **Address fields → Mapbox autocomplete; company/ABN fields → ABN lookup** — no plain text inputs for these. *(feedback memory.)*
- [ ] **Every UI makes the next action obvious — zero dead ends.** *(feedback_ux_flow_first.)*
- [ ] **Anti-bot honeypots must be autofill-safe and must NEVER silently drop / block a real submission.** A hidden honeypot field must be named **autofill-neutral** — never `website_url` / `company_url` / `email` / `name` / `phone` / `address` / `url` / `company` (browsers + password managers autofill those into the hidden field and trip the trap on a genuine user). Use a meaningless name like **`hp_field`**, plus off-screen + `aria-hidden` + `tabIndex={-1}` + `autocomplete="off"`. The **primary** bot signal should be a **time-trap** (form submitted in < ~2.5s = bot) — it has zero autofill false-positives; the honeypot is secondary. **Two forbidden failure modes** (both lose/refuse a real lead): (a) **client** — a filled honeypot that shows a fake "success" screen and *skips the API call* (silent data loss, the worst case); (b) **server** — `z.string().max(0)` on the honeypot, which **400s** a real user whose browser autofilled it. Server honeypot must **accept any value** (`z.string().optional()`) and **silently no-op** when filled. *(f2k 2026-06-15: developer-onboarding's off-screen `company_url` + client fake-success silently ate a real developer lead — Vercel logs showed only 1 of the developer's 3 reported submissions ever reached the server; f2k's developer/funder/employer/buyer forms swept to `hp_field` + time-trap; portfolio-wide sweep pending.)*
- [ ] **Supabase Auth config is self-serve — never ask the user for a token.** `site_url`, redirect allow-list, SMTP, and email templates are set via the Management API using the token at `~/.supabase-token` (or `SUPABASE_MANAGEMENT_TOKEN` / `SUPABASE_ACCESS_TOKEN`) and `scripts/onboard-new-project.sh` / `configure-email-templates.sh`. Don't punt to "generate an access token" or "click the dashboard". *(Singify 2026-05-25; memory `supabase-management-token-on-disk`.)*
- [ ] **Content/IP acknowledgment** — any product where users create or share content built on third-party IP (karaoke backing, stock samples, someone's likeness) ships a `/terms` page (own-performance vs licensed-material, personal-use-only, takedown path) **and** an acknowledgment gate before save/share, recorded on the account at signup. *(Singify 2026-05-25.)*
- [ ] **Emotional register matches the product.** End-user/creative surfaces (singing, social, play) must feel alive — colour, energy, a clear "start here" — not a utilitarian grey form. Operator/admin tools stay matter-of-fact (§5), but for a consumer product a dull shell fails the "I want that" bar as surely as a missing feature. Run `/naive-tester` on a new consumer surface before calling it done — it catches dull / jargon-leak / dead-end issues a checklist misses. *(Singify 2026-05-25.)*
- [ ] **Automated-tester auth — a real QA account, never a backdoor.** Every repo with an auth gate ships the means for automated testers (`/naive-tester`, `/qa`, `/benchmark`) to authenticate *as a real account*: a **persistent, email-confirmed QA `owner` account** (password in the password manager — never committed, never pasted into a report); a **`docs/TESTING.md`** documenting **Mode A** (type the real login form — this also *tests* the auth path, the default) and **Mode B** (inject a real session cookie to skip the flaky form for deep surface testing); and the shared **session-minter** (`cais-shared-services/scripts/qa-session.mjs` — emits the `@supabase/ssr` cookie, auto-matched to the repo's installed `@supabase/ssr` version: `base64-` for ≥0.5, URL-encoded JSON for <0.5 — a mismatch is silently rejected; consume it, don't fork). **Magic-link-only products (no password field — `signInWithOtp` logins) are the canonical hard case** and use the SAME minter's **`--magic-link` mode**: it mints the real QA session via the service-role `admin.generate_link` → `verify` (needs `QA_TEST_USER_EMAIL` + `SUPABASE_SERVICE_ROLE_KEY`; no email round-trip, no PKCE/redirect-allowlist dependency) — the password grant cannot serve these. To ALSO exercise email delivery, request the link from the real form and read it from a **dedicated, API-readable QA mailbox — never the operator's personal inbox** — then navigate it in the same browser context. **Preview deploys behind Vercel deployment protection** additionally need a **Protection-Bypass-for-Automation** token (the app login is unreachable otherwise — a `vercel.com/login` 401 wall). One-time provisioning per repo (record in `docs/TESTING.md`): create the email-confirmed QA `owner` account, add its email to the admin allowlist (e.g. `ADMIN_EMAILS`), and allowlist `localhost` + the preview `/auth/callback` in the provider's redirect list. **No route or flag may skip authentication** — a test auth-bypass is a critical vulnerability, same severity as an unguarded endpoint. Testers TYPE creds (never DOM-inject — React ignores injected values) and work around the `/browse` daemon by warm-chaining + saving/reloading auth state. *(mmcbuild split QA, 2026-05-25; magic-link canon added 2026-05-25 from the corporate-ai-solutions cockpit naive-test — magic-link-only login + Vercel preview SSO + un-allowlisted localhost callback blocked every other path.)*
- [ ] **Pipeline intake WIP gate — no new product until the board is triaged.** No new product or operator-originated idea is admitted to the methodology cockpit (`/admin/methodology`) while any card is **untriaged** (not in-research-or-beyond and not terminally decided — incl. "thin-MVP-ready but research never launched"). Hard block at the intake API + disabled UI with a "drain the backlog first" banner; a friction-ful **reasoned, logged override**; the always-on ideation agent's deposits land in an inbox that does not count. *Stop starting, start finishing.* Full rule + the *why*: `MONETISATION_RULES.md` **Rule 16**; pipeline framing: `BUSINESS_MODEL.md` §4 (Gate 0). *(Codified 2026-05-25.)*
- [ ] **Single-operator deferral trigger** *(when-relevant rule)*. A single-operator internal tool MAY defer the **§8 team-admin org/member layer** and the **full §4 Settings Profile/Notifications sections + the `profiles` table** (auth + persistent nav + Sign Out + a lean Settings are still required). But these become **REQUIRED the moment**: (a) a **second operator** needs access, or (b) the surface gains **public / customer exposure**. The deferral is a *conscious, tracked* decision — record it in the surface's audit + `team_admin_status` in `portfolio-manifest.yaml` — **never a permanent skip.** When the trigger fires, build the org/member layer + the full settings page **before** the second user is onboarded (retrofitting after they're in is the failure mode the TEAM ADMIN rule exists to prevent). *(Codified 2026-05-25 from the methodology cockpit: single-operator → auth-gate + chrome + lean Settings shipped; team-admin + full Profile/Notifications queued behind this trigger.)*
- [ ] **Bounded admin-agent scope — agents never fire destructive admin actions.** The dedicated
  admin-agent (§9.5) walks the SAFE, idempotent admin checks ONLY: **VT_A1–VT_A4** (Admin Portal
  Access, Settings Profile, Settings Password, Settings Notifications). **VT_A5 (Sign Out
  Everywhere)** and **VT_A6 (Delete Account)** are **operator-verified, never agent-run.** The agent
  must NEVER click any control labelled (case-insensitive, incl. near-variants): "Delete account /
  Delete my account / Close account / Remove account", "Sign out everywhere / Sign out of all
  sessions / Sign out all devices / Revoke all sessions". If a goal prompt implies "test
  everything", these two are the explicit exception. The operator walks VT_A5/VT_A6 by hand and
  records them (`status: pass|fail`, source `operator`) — they MUST NOT be left unknown (unknown
  depresses the score identically to fail). Because the producer simply does NOT observe them, the
  recorder skips them cleanly (it maps na→na and never fabricates a pass — submit-validation-
  results.mjs, 2026-05-31 fix). Document the denylist by on-screen label in each product's
  `docs/TESTING.md`; enforce mechanically where the tester supports it, not by prompt alone.
  *(Codified 2026-06-04: VALIDATION_TEST_PLAN Part A4 walked Delete Account against the operator
  admin — replaced by a dedicated admin-agent for A1–A4 + operator-verified A5/A6.)*
- [ ] **SayFix integration** — every product has `@caistech/sayfix-embed` wired in:
  - [ ] **Widget** — `<SayFixWidget repo="xxx" />` in the main layout (floating button)
  - [ ] **Admin setup** — repo added to SayFix admin (`/admin`) with ownership type
  - [ ] **Stakeholder invites** — admins can invite stakeholders via SayFix admin
  - [ ] **SayFix env** — `GITHUB_TOKEN` with `repo` scope added to SayFix Vercel (not per-product)
  - [ ] **Audit gate** — product in SayFix repos + token configured before release.
  - *(CLAUDE.md "Bug Knowledge Base Protocol" + this spec.)*

- [ ] **Dual-portal tester coverage** *(for products with dual-auth, §8.5)*. Every tester that surfaces findings (`/naive-tester`, `/voice-auditor`, `/gtm-auditor`, `/qa`, `/design-review`, `/devex-review`) must cover **both admin and user portals** in a single report (not two separate reports). This ensures:
  - **Voice agent placement** is checked in both user-facing and admin surfaces — required surfaces in *either* portal shipped without voice is a finding.
  - **GTM distribution loop** is validated end-to-end (both user signup and admin onboarding create next-user signals).
  - **Design consistency & DX** applies to both portals (visual debt / poor interaction patterns in admin is as much a problem as in user-facing).
  - **QA coverage** validates auth segregation (users can't reach admin; admins can reach both; cross-access vulns are blocked).
  - **Accessibility & responsiveness** apply uniformly across both surfaces.

  Report structure per tester: **Naive-tester:** Landing → User Path → Admin Path → Cross-Path Issues. **Voice-auditor:** User Voice Placement + Admin Voice Placement. **GTM-auditor:** User Distribution + Admin Distribution. **QA:** User Flows + Admin Flows + Cross-Path Auth. Similar structure for `/design-review` and `/devex-review`. One tester run, one report, both portals. *(Codified 2026-05-28.)*

---

## 9.5. STANDARD ADMIN + TEST ACCOUNTS (scaffold-time provisioning)

Every product with an auth gate ships **four standard accounts** — two human-operator admins,
one dedicated admin-AGENT, one non-admin user-agent — so QA runs without per-project setup AND
so autonomous testers can walk BOTH portals (§8.5) without ever driving a real operator account.
Provisioned at scaffold time, constant across products, reused every run (NOT regenerated per run).

**Human-operator admins (FULL access — used BY HAND only, NEVER handed to an agent):**
- `dennis@corporateaisolutions.com` — primary operator
- `mcmdennis@gmail.com` — backup operator

**Dedicated admin-AGENT (the agent's admin identity — NEW):**
- `dennis+qaadmin@factory2key.com.au`  *(set to whatever you provision; a plus-alias on a real,
  deliverable domain so the auth-email checks can pass)* — in `ADMIN_EMAILS`, reaches `/admin`,
  drives the autonomous admin-portal checks **VT_A1–VT_A4 ONLY** (Portal Access, Settings Profile,
  Settings Password, Settings Notifications). It is SEPARATE from the two operator admins so no
  agent run ever touches a real operator account. Its destructive actions — **VT_A5 (Sign Out
  Everywhere) and VT_A6 (Delete Account)** — are OUT of agent scope (see the §9 codicil
  "Bounded admin-agent scope").

**Non-admin user-agent (the agent's user identity):**
- `dennis@factory2key.com.au` — NOT in `ADMIN_EMAILS`; drives VT_B1–VT_B5 and the
  blocked-from-`/admin` check (VT_B2). `QA_TEST_USER_EMAIL` resolves to this address.

**Configuration:**
- `ADMIN_EMAILS` contains the two operator admins **and** the admin-agent. The user-agent is NEVER
  in `ADMIN_EMAILS`.
- INVARIANT: admin-agent ∈ `ADMIN_EMAILS`; `dennis@factory2key.com.au` ∉ `ADMIN_EMAILS`.
  A user/test identity in the admin set fails VT_B2 AND is a real security defect.
- Adding the admin-agent as a THIRD entry does not break VT_D1 (a presence check on the two
  operators, not an exact-count).
- Both operators + the admin-agent live in `portfolio-manifest.yaml` `shared: → admin_users`.

**Canonical credential variable names (portfolio-wide — one scheme, two identities, each an
email + password):**
- user-agent → `QA_TEST_USER_EMAIL` / `QA_TEST_USER_PASSWORD`
- admin-agent → `QA_TEST_ADMIN_EMAIL` / `QA_TEST_ADMIN_PASSWORD`

These four are the single set every repo's workflows, `docs/TESTING.md`, and testers consume.
(Supersedes the older `QA_OWNER_PASSWORD` / `QA_USER_PASSWORD` / `QA_TEST_EMAIL` / `TEST_USER_EMAIL`
fragments — locked 2026-06-13.) Propagated to GitHub Actions secrets across the portfolio by
`cais-shared-services/scripts/sync-qa-secrets.mjs` (the bridge until repos migrate into the
`caistech` org and inherit org-level secrets). Supplied to runs via env, never committed, never
pasted into a report. Operator-admin passwords are NEVER exposed to any agent session.

**Why four, not three:** the prior three-account default (two operators + one non-admin test user)
predated the requirement that every product ship an `/admin` dashboard (§8.5). With only a
non-admin identity, the admin-portal checks VT_A1–A4 can never resolve — they sit permanently
unknown and depress the score. The dedicated admin-agent closes that without ever risking an
operator account (the prior plan walked Delete Account against `dennis@corporateaisolutions.com`).

**Per-project opt-out (rare):** `--custom-admins "e1,e2"` overrides operator defaults; document any
override in the product's `docs/TESTING.md`. The admin-agent + user-agent pair is NOT optional for
any product with an `/admin` portal.
--

## 10. Where the authoritative prose lives

This is the portable checklist. The full prose (the *why*, the worked examples, the verification heuristics) is in `~/.claude/CLAUDE.md` under the named sections cited above. If this checklist and CLAUDE.md ever diverge, CLAUDE.md's prose is authoritative — re-sync this file. Companion portable docs in this repo: `BUSINESS_MODEL.md` (how the portfolio makes money), `MONETISATION_RULES.md` (the 15 monetisation rails), `THIN_MVP_RUBRIC.md` (what goes in a thin validation MVP — note its §3 "Portfolio DNA is experience" overlaps this checklist: nav chrome + Settings + voice + responsive + explanatory headers belong in even the thinnest slice), `CLIENT_HANDOVER_KIT.md` (the key/env self-serve standard for handing a product to a client / distributor / self-host operator), `SUPABASE_MIGRATION_PLAYBOOK.md` (the runbook for migrating a Supabase project's data between orgs), `VOICE_MEMORY_STANDARD.md` (the persistent voice-agent memory & state floor — rules 1–20; the rubric `/voice-auditor` loads), and `GATE_READINESS_CRITERIA.md` (the objective thin-MVP / Gate-1 test — catalogues every check the canonicals run, mapped to verification method + thin-MVP relevance; seeds THIN_MVP_RUBRIC v2 + the cockpit `readiness_criteria` table).

---

## 11. AGENT-READINESS (every product with a public web surface)
*Source: Google I/O 2026 agent-web shift — WebMCP (Chrome origin trial), auto-browse Information Agents, native voice-to-structure. Scored by gate-readiness check **#42** (CONDITIONAL-WEIGHTED, `public-web`) + the `/gtm-auditor` Agent-Readiness dimension.*

AI search and browser agents are now a real traffic + distribution channel. A product an agent can't *find*, *read*, or *drive* is invisible/inoperable to it. Three layers, gated differently — only Layer 1 is a Gate-1 readiness check; Layers 2–3 are Tier-1 / distribution concerns (don't over-build pre-GO):

- [ ] **Layer 1 — DISCOVERABLE (Gate-1, check #42).** `/llms.txt` (what the product is + key URLs in agent-legible form), **schema.org / JSON-LD** structured metadata on the landing page, and a `/.well-known/` agent manifest — so AI search + Information Agents find the product and describe it *correctly*. Cheap, experience-adjacent → belongs in even a thin MVP. **Verify (AUTO):** `curl -s <url>/llms.txt` returns content; landing HTML contains a `<script type="application/ld+json">` block; `/.well-known/` manifest resolves.
- [ ] **Layer 2 — OPERABLE (Tier-1, post-Gate-2 — DEFER at Gate 1).** Key end-user actions (sign up, create-the-core-thing, the product's main verb) exposed as **WebMCP tools** so a browser agent can drive the white-label app. Scale-ish; build it with the Tier-1 platform, *not* in the validation slice (treating it as Gate-1 is the over-build failure P4 guards).
- [ ] **Layer 3 — INTEGRATABLE (distribution — BizModel §5 D3).** Optional **remote MCP server** so the product is a tool *inside other agents* — the agent-era "output creates the next user" loop. This is **D3 distribution-leverage evidence**, surfaced by `/gtm-auditor`'s Agent-Readiness dimension, not a readiness checkbox.

**Substrate:** don't hand-roll per product. The shared `@caistech/webmcp-kit` (the promoted `storefront-mcp`) is the intended one-install path for Layers 1–3 across the portfolio — consume it (the `@caistech`-first rule), and add the repo to `/gtm-auditor`'s Agent-Readiness scan.

**Lane-aware:** *whose* brand/manifest travels follows the same gate as the rest of GTM — a white-label distributor product exposes the **distributor's** agent surface, never a CAS-branded one.

---

## Appendix — applied audit: methodology cockpit (`/admin/methodology`, 2026-05-25)

First use of this checklist, against the cockpit shipped this session.

| Standard | Status | Note |
|---|---|---|
| §1 Responsive | ✅ | Fixed 2026-05-25 (stacked cards ≤md, 44px targets, 16px text). |
| §5 Explanatory header | ✅ | List + detail both have one (detail added 2026-05-25). |
| §6 Voice agent | ✅ | `VoiceAgent.tsx` ("Talk to Morgan") present on the chrome. |
| §7 Scaffold metadata | ✅ (site) | CAS metadata customised. |
| §9 Consequence clarity | ✅ | Launch buttons now state the consequence + confirm + gating (2026-05-25). |
| **Auth on `/admin`** | ✅ | **Fixed 2026-05-25.** `middleware.ts` matcher extended to `/admin/:path*`; unauth → `/pipeline/login` (verified 307); operator allowlist via `ADMIN_EMAILS` (defaults to the operator email). |
| §4 Left navbar | ✅ | **Fixed 2026-05-25.** `src/app/admin/layout.tsx` + `AdminNav` — persistent sticky left rail on `md:`+, collapses to a 44px hamburger → drawer on mobile; Methodology + Settings + Sign Out (bottom); active-route indicator. |
| §4 Settings page + link | ✅ | **Fixed 2026-05-25.** `/admin/settings` (Account / Password with Eye-toggle / Sign-out-everywhere), explanatory header, reachable from the nav. Profile + Notifications deferred (single-operator tool). |
| §4 Sign Out every page | ✅ | **Fixed 2026-05-25.** In the persistent nav (every `/admin` route) + on Settings. |
| §8 Team admin | ❌ deferred | No org/member layer (single-operator today; shape not built). Build when the cockpit gets >1 operator — see TEAM ADMIN rule. |

**Verdict (updated 2026-05-25):** the cockpit now meets the content standards **and** the authenticated-app-chrome standards. `/admin/*` is auth-gated with an operator allowlist (exposure closed), and has a persistent left navbar + Settings + Sign Out. **Remaining:** team-admin org/member shape (§8) — deferred while single-operator; and the full Settings Profile/Notifications sections + a `profiles` table — deferred as overkill for an internal single-operator tool. Both are intentional deferrals, not gaps.

---

## Appendix — applied audit: Singify studio (`singify-platform`, 2026-05-25)

Second worked example — a **consumer** (end-user) product, single-user validation slice (no multi-tenant pre-Gate-2).

| Standard | Status | Note |
|---|---|---|
| §0 per-page gate | ✅ | Explanatory headers, responsive, real titles, voice-in-chrome all present. |
| §1 Responsive | ✅ | Verified 375 + 1280 via `/browse` — studio + landing reflow, 44px targets, 16px text. |
| §2 Auth page pattern | ✅ | `/login` + `/signup` + `/auth/forgot-password` + `/auth/reset-password`; shared `PasswordInput` visibility toggle; forgot-password + magic-link wired. |
| §3 Auth smoke-test | ✅ | 4 paths smoke-tested 2026-05-25: signup+confirm+trigger OK (records `tos_accepted_at`), login OK (session), reset dispatch OK, magic-link path OK (hit the built-in-email ~3–4/hr **rate limit** → Resend is the upgrade). |
| §4 Chrome + Settings | 🟡 | Persistent nav (sidebar/drawer) + Sign in/out ✅; `/settings` has the canonical section shape + a working reset-profile action, but Profile/Password/Notifications are "with accounts" stubs — wire to real `updateUser`/`profiles` next. |
| §5 Explanatory header | ✅ | Every surface (studio, settings, terms, auth cards). |
| §6 Voice AI | ✅ | Chrome-level `VoiceWidget`, **proactive + stage-aware** (greet → post-baseline → post-take), `voice.config.ts`, BYOK, `@caistech/elevenlabs-convai`. |
| §7 Scaffold metadata | 🟡 | `<title>`/description customised (not "Create Next App"); OG image + manifest-driven favicon not yet set. |
| §8 Team admin | ❌ deferred | Single-user slice; multi-tenant/distributor layer is post-Gate-2 (build-override + THIN_MVP_RUBRIC — no scale infra pre-GO). |
| §9 content/IP ack | ✅ | `/terms` + acceptance gate before save/share + recorded on the account at signup. |
| §9 `@caistech`-first | ✅ | Consumes `elevenlabs-convai` (+ `/react` widget); fork-check clean. |
| §9 Supabase + self-serve auth config | ✅ | Migrations via CLI (pooler), RLS on, Auth config set via the Management API (`~/.supabase-token`) — no token asked of the operator. |
| §9 emotional register | ✅ | Fun redesign (gradients, karaoke stage, energy); `/naive-tester` run before "done". |

**Verdict:** the Singify single-user validation slice meets the content, responsive, voice, auth-pattern, auth-smoke-test, and content/IP standards. Intentional deferrals (not gaps), all post-Gate-2 / platform-tier or polish: §8 team-admin, the full §4 Settings Profile/Notifications forms, §7 OG image + favicon, and **Resend email** (built-in is rate-limited — magic-link hit it in the smoke test; wire Resend before real users per the EMAIL INFRASTRUCTURE rule).
