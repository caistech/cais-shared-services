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
- [ ] **Browser tab title** is the product name, not "Create Next App" (§7).

If any box is unchecked, the page is not done.

---

## 0.5 Before sign-off: run `/naive-tester` (MANDATORY on every build / update)

Before signing off on **any new build or build update** — a new product, a new feature, or a revamp of an existing surface — run the **`/naive-tester`** skill against the live (or preview) URL. It walks the product as a real human persona **and** cross-checks every UI-observable item in this checklist, closing with a **Standards Check** (✅ / ❌ / — per item). **Any ❌ is a release-blocking finding, same severity as a bug — nothing ships with an open ❌.**

This is the catch-all that stops items in this checklist being silently missed: the per-page §0 gate is the author's self-check; `/naive-tester` is the independent human-eyes sweep before "done." It loads *this file* as its rubric, so the two never drift. For public-facing or multi-surface builds run the relevant personas (`auto` picks them) — at minimum a domain-operator pass plus Mobile Marcus for anything mobile-reachable. 

**For products with dual-auth portals (§8.5):** Run `/naive-tester` once, with sections for Landing → User Path → Admin Path → Cross-Path Issues. One report, not two — the tester walks both flows sequentially and flags any cross-access bugs (user reaching admin, admin excluded from user surfaces, etc.) in a single report. *(Wired 2026-05-25 — naive-tester consumes PRODUCT_STANDARDS.md.)*

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
- [ ] **Persistent memory meets the Voice Memory Standard** — full rules + the *why* + the Singify worked example in **`VOICE_MEMORY_STANDARD.md`** (the rubric `/voice-auditor` loads). The floor: the loop runs end-to-end (recall→distil→persist→recall, scoped by function — full for coaching, pull-only OK for a transient clarifier); **the agent PULLS state, the operator never reads it in** (overrides carry only the just-happened *trigger*, never the values — the agent pulls those); **storage ≠ memory**; works off results, never raw artifacts; identity **server-derived at connect** (`conversation_id`, never `user_id`); **every convai webhook verifies its HMAC** (secret captured-at-creation, stored sensitive, unverified → 401); memory lives in the product's own Supabase with RLS + delete-cascade + TTL + a user memory surface; the agent **degrades-don't-fake** on recall failure; persist is idempotent; the loop is observable.
- [ ] **Placement audited by `/voice-auditor`** (MANDATORY before sign-off) — run the voice-placement auditor (repo scan + optional live pass) to map every surface into *required / could-add-value / not-needed* × *guide-clarifier / coaching*, name the `@caistech/elevenlabs-convai` integration shape per Required surface, and set the repo's `voice_agent_status`. **A Required surface shipped without voice is a finding.** The gate is **behavioural, not presence-only** — a live pass must show the memory loop *working* (the "welcome-back" recall actually fires + is observable), not merely that routes/tables exist. *(voice-auditor skill, 2026-05-25; mirrors the §0.5 naive-tester gate.)*
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

---

## 9. CODICILS (other non-negotiables that bite)

- [ ] **Consequence clarity** — any irreversible (delete/kill), cost-incurring (real API discovery), or outreach-firing action names its consequence *before* the click and requires confirm + (for terminal) a reason. *(Cross-cut of UX-flow-first + the human-in-the-loop principle; reinforced by the 2026-05-25 cockpit naive-test.)*
- [ ] **Email sender** is `noreply@updates.corporateaisolutions.com` (the only Resend-verified subdomain). The bare apex is NOT verified. *(CLAUDE.md "EMAIL INFRASTRUCTURE".)*
- [ ] **`@caistech` shared-services first** — consume the hub package; never fork a generic helper into the repo. The fork-check (`cais-shared-services/scripts/check-shared-forks.mjs`, run by preflight) gates this. *(CLAUDE.md "@caistech SHARED-SERVICES FIRST".)*
- [ ] **Feature pre-flight** — `feature-manifests/<slug>.json` + `feature-preflight.mjs` before building; surface env/dashboard needs up front. *(CLAUDE.md "FEATURE PRE-FLIGHT RULE".)*
- [ ] **Supabase** — migrations idempotent + applied via CLI (not "paste this in the dashboard"); **RLS on every table**; service-role key never client-side; parameterised queries. *(CLAUDE.md "SUPABASE MIGRATIONS" + code standards.)*
- [ ] **No secrets in committed files / settings / logs.** *(CLAUDE.md security + the no-plaintext-secrets memory.)*
- [ ] **Vercel env vars → `sensitive`, production+preview only.** Any script/route that creates Vercel env vars marks secrets `type: "sensitive"` (non-readable) and targets **production+preview — never `development`**. The CAS + MMC Vercel teams have *Enforce Sensitive Environment Variables* on (2026-05-25), which force-marks prod/preview sensitive and **bans dev creates team-wide**; a plaintext secret is flagged "Needs Attention" (post-April-2026 breach). A PATCH can't convert `encrypted`→`sensitive` — **delete + recreate**. Don't read sensitive values back (they're non-readable) — source from `.env.local`. Public `NEXT_PUBLIC_*`/config: `plain`, still prod+preview only. *(project_vercel_sensitive_env_vars memory.)*
- [ ] **DB dumps / data exports never committed** — `dump-*.sql` and any data export is gitignored, treated as PII, and deleted after the restore verifies. Migrate a Supabase project between orgs via `pg_dump`/restore (a copy), **not** "Transfer project," when the source environment must be retained. Storage files and `auth.users` migrate as *separate* steps (Storage API + `--schema auth`), not via the public-schema dump. **Full runbook: `SUPABASE_MIGRATION_PLAYBOOK.md`.** *(mmcbuild CAS→MMC migration, 2026-05-25.)*
- [ ] **Live credentials exchanged over a secure channel** (password manager / WhatsApp / encrypted) — never plain email. Applies to DB passwords, API keys, service-role keys. *(mmcbuild migration, 2026-05-25.)*
- [ ] **Client/distributor handover ships a key self-serve kit** — manifest-driven wizard (`byok.config.json` → generated `.env.restore.local.example` → a `vercel-env-restore` push script) + an env-cutover doc with a who-fills-what split; the recipient populates their own keys (clean billing boundary), no operator-key handover. **Full standard: `CLIENT_HANDOVER_KIT.md`.** *(mmcbuild CAS→MMC migration, 2026-05-25.)*
- [ ] **Address fields → Mapbox autocomplete; company/ABN fields → ABN lookup** — no plain text inputs for these. *(feedback memory.)*
- [ ] **Every UI makes the next action obvious — zero dead ends.** *(feedback_ux_flow_first.)*
- [ ] **Supabase Auth config is self-serve — never ask the user for a token.** `site_url`, redirect allow-list, SMTP, and email templates are set via the Management API using the token at `~/.supabase-token` (or `SUPABASE_MANAGEMENT_TOKEN` / `SUPABASE_ACCESS_TOKEN`) and `scripts/onboard-new-project.sh` / `configure-email-templates.sh`. Don't punt to "generate an access token" or "click the dashboard". *(Singify 2026-05-25; memory `supabase-management-token-on-disk`.)*
- [ ] **Content/IP acknowledgment** — any product where users create or share content built on third-party IP (karaoke backing, stock samples, someone's likeness) ships a `/terms` page (own-performance vs licensed-material, personal-use-only, takedown path) **and** an acknowledgment gate before save/share, recorded on the account at signup. *(Singify 2026-05-25.)*
- [ ] **Emotional register matches the product.** End-user/creative surfaces (singing, social, play) must feel alive — colour, energy, a clear "start here" — not a utilitarian grey form. Operator/admin tools stay matter-of-fact (§5), but for a consumer product a dull shell fails the "I want that" bar as surely as a missing feature. Run `/naive-tester` on a new consumer surface before calling it done — it catches dull / jargon-leak / dead-end issues a checklist misses. *(Singify 2026-05-25.)*
- [ ] **Automated-tester auth — a real QA account, never a backdoor.** Every repo with an auth gate ships the means for automated testers (`/naive-tester`, `/qa`, `/benchmark`) to authenticate *as a real account*: a **persistent, email-confirmed QA `owner` account** (password in the password manager — never committed, never pasted into a report); a **`docs/TESTING.md`** documenting **Mode A** (type the real login form — this also *tests* the auth path, the default) and **Mode B** (inject a real session cookie to skip the flaky form for deep surface testing); and the shared **session-minter** (`cais-shared-services/scripts/qa-session.mjs` — emits the `@supabase/ssr` cookie, auto-matched to the repo's installed `@supabase/ssr` version: `base64-` for ≥0.5, URL-encoded JSON for <0.5 — a mismatch is silently rejected; consume it, don't fork). **Magic-link-only products (no password field — `signInWithOtp` logins) are the canonical hard case** and use the SAME minter's **`--magic-link` mode**: it mints the real QA session via the service-role `admin.generate_link` → `verify` (needs `QA_TEST_EMAIL` + `SUPABASE_SERVICE_ROLE_KEY`; no email round-trip, no PKCE/redirect-allowlist dependency) — the password grant cannot serve these. To ALSO exercise email delivery, request the link from the real form and read it from a **dedicated, API-readable QA mailbox — never the operator's personal inbox** — then navigate it in the same browser context. **Preview deploys behind Vercel deployment protection** additionally need a **Protection-Bypass-for-Automation** token (the app login is unreachable otherwise — a `vercel.com/login` 401 wall). One-time provisioning per repo (record in `docs/TESTING.md`): create the email-confirmed QA `owner` account, add its email to the admin allowlist (e.g. `ADMIN_EMAILS`), and allowlist `localhost` + the preview `/auth/callback` in the provider's redirect list. **No route or flag may skip authentication** — a test auth-bypass is a critical vulnerability, same severity as an unguarded endpoint. Testers TYPE creds (never DOM-inject — React ignores injected values) and work around the `/browse` daemon by warm-chaining + saving/reloading auth state. *(mmcbuild split QA, 2026-05-25; magic-link canon added 2026-05-25 from the corporate-ai-solutions cockpit naive-test — magic-link-only login + Vercel preview SSO + un-allowlisted localhost callback blocked every other path.)*
- [ ] **Pipeline intake WIP gate — no new product until the board is triaged.** No new product or operator-originated idea is admitted to the methodology cockpit (`/admin/methodology`) while any card is **untriaged** (not in-research-or-beyond and not terminally decided — incl. "thin-MVP-ready but research never launched"). Hard block at the intake API + disabled UI with a "drain the backlog first" banner; a friction-ful **reasoned, logged override**; the always-on ideation agent's deposits land in an inbox that does not count. *Stop starting, start finishing.* Full rule + the *why*: `MONETISATION_RULES.md` **Rule 16**; pipeline framing: `BUSINESS_MODEL.md` §4 (Gate 0). *(Codified 2026-05-25.)*
- [ ] **Single-operator deferral trigger** *(when-relevant rule)*. A single-operator internal tool MAY defer the **§8 team-admin org/member layer** and the **full §4 Settings Profile/Notifications sections + the `profiles` table** (auth + persistent nav + Sign Out + a lean Settings are still required). But these become **REQUIRED the moment**: (a) a **second operator** needs access, or (b) the surface gains **public / customer exposure**. The deferral is a *conscious, tracked* decision — record it in the surface's audit + `team_admin_status` in `portfolio-manifest.yaml` — **never a permanent skip.** When the trigger fires, build the org/member layer + the full settings page **before** the second user is onboarded (retrofitting after they're in is the failure mode the TEAM ADMIN rule exists to prevent). *(Codified 2026-05-25 from the methodology cockpit: single-operator → auth-gate + chrome + lean Settings shipped; team-admin + full Profile/Notifications queued behind this trigger.)*

---

## 9.5. STANDARD ADMIN + TEST USER ACCOUNTS (scaffold-time provisioning)

Every product with an auth gate ships **pre-configured with three standard accounts** — two permanent admins and one permanent test user — so that QA, development, and monitoring can run without per-project setup. These accounts are provisioned at scaffold time and remain constant across all products.

**Permanent Admin Accounts (both have FULL operator access):**
- `dennis@corporateaisolutions.com` — Dennis (primary operator)
- `mcmdennis@gmail.com` — Dennis alt (backup operator)

**Permanent Test User (non-admin):**
- `dennis@factory2key.com.au` — Test/QA account (can access product surfaces but not `/admin/*`)

**Configuration:**
- Add both admin emails to the **`ADMIN_EMAILS` environment variable** (colon or comma-separated, depending on project) at scaffold time. This populates the allowlist in `middleware.ts` (or equivalent auth gate) so unauth requests → `/login`.
- The test user is a **regular authenticated user** — not on the admin list, so they cannot access `/admin/*` routes. Use this account for QA, user-flow testing, and monitoring.
- Both admins' emails are in `portfolio-manifest.yaml` under a new **`shared:` → `admin_users`** block so every product bootstrap script can auto-populate `ADMIN_EMAILS` (when environment-sync / onboarding scripts run).

**Why this matters:**
- **Eliminates per-project setup waste** — no more "add an admin email here, create a test account there" for every new product.
- **Enables cross-product automation** — `/naive-tester`, `/qa`, and monitoring agents can run using the same `dennis@factory2key.com.au` credentials across all products.
- **Reduces onboarding friction** — a new product is immediately testable without manual account creation.

**Implementation:**
1. **Scaffold script** (`scripts/onboard-new-project.sh` or equivalent) calls `configure-admin-accounts.sh <project-slug>` after the project is created.
2. **`configure-admin-accounts.sh`** (new script in cais-shared-services/scripts):
   - Reads `portfolio-manifest.yaml` for `shared: admin_users`
   - Sets `ADMIN_EMAILS` on Vercel (via `vercel env add`) with both admin emails
   - Sets `ADMIN_EMAILS` in `.env.local` for local development
   - Creates Supabase Auth invites for both admin emails (auto-verified links)
   - Logs each step so the operator knows what happened
3. **Test user `dennis@factory2key.com.au`** is created via the same Supabase invite flow but is NOT added to `ADMIN_EMAILS`, so it's a regular user for QA purposes.

**Per-project opt-out (rare):**
If a product has custom admin requirements (e.g., only one admin, or different admins), the bootstrap script allows `--custom-admins "email1,email2"` to override the defaults. Document the override in the product's `docs/TESTING.md`.

---

## 10. Where the authoritative prose lives

This is the portable checklist. The full prose (the *why*, the worked examples, the verification heuristics) is in `~/.claude/CLAUDE.md` under the named sections cited above. If this checklist and CLAUDE.md ever diverge, CLAUDE.md's prose is authoritative — re-sync this file. Companion portable docs in this repo: `BUSINESS_MODEL.md` (how the portfolio makes money), `MONETISATION_RULES.md` (the 15 monetisation rails), `THIN_MVP_RUBRIC.md` (what goes in a thin validation MVP — note its §3 "Portfolio DNA is experience" overlaps this checklist: nav chrome + Settings + voice + responsive + explanatory headers belong in even the thinnest slice), `CLIENT_HANDOVER_KIT.md` (the key/env self-serve standard for handing a product to a client / distributor / self-host operator), `SUPABASE_MIGRATION_PLAYBOOK.md` (the runbook for migrating a Supabase project's data between orgs), `VOICE_MEMORY_STANDARD.md` (the persistent voice-agent memory & state floor — rules 1–20; the rubric `/voice-auditor` loads), and `GATE_READINESS_CRITERIA.md` (the objective thin-MVP / Gate-1 test — catalogues every check the canonicals run, mapped to verification method + thin-MVP relevance; seeds THIN_MVP_RUBRIC v2 + the cockpit `readiness_criteria` table).

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
