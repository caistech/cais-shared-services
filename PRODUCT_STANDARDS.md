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
- [ ] **Password visibility toggle** (Eye/EyeOff, `lucide-react`) on every password input; `tabIndex={-1}` + `aria-label`.
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
- [ ] **Proactive + stage-aware**, not a passive button — the agent greets on arrival, asks the user's goal, and re-grounds its prompt per flow-stage (e.g. welcome → post-baseline → post-take), passing the user's measured state as per-session prompt overrides so it speaks about *this* user. Agent id is scaffolded into `voice.config.ts` (via the wizard's `buildVoiceConfig`/`renderVoiceConfigModule`), never a hand-set `NEXT_PUBLIC_*` env. *(Singify 2026-05-25.)*

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

## 9. CODICILS (other non-negotiables that bite)

- [ ] **Consequence clarity** — any irreversible (delete/kill), cost-incurring (real API discovery), or outreach-firing action names its consequence *before* the click and requires confirm + (for terminal) a reason. *(Cross-cut of UX-flow-first + the human-in-the-loop principle; reinforced by the 2026-05-25 cockpit naive-test.)*
- [ ] **Email sender** is `noreply@updates.corporateaisolutions.com` (the only Resend-verified subdomain). The bare apex is NOT verified. *(CLAUDE.md "EMAIL INFRASTRUCTURE".)*
- [ ] **`@caistech` shared-services first** — consume the hub package; never fork a generic helper into the repo. The fork-check (`cais-shared-services/scripts/check-shared-forks.mjs`, run by preflight) gates this. *(CLAUDE.md "@caistech SHARED-SERVICES FIRST".)*
- [ ] **Feature pre-flight** — `feature-manifests/<slug>.json` + `feature-preflight.mjs` before building; surface env/dashboard needs up front. *(CLAUDE.md "FEATURE PRE-FLIGHT RULE".)*
- [ ] **Supabase** — migrations idempotent + applied via CLI (not "paste this in the dashboard"); **RLS on every table**; service-role key never client-side; parameterised queries. *(CLAUDE.md "SUPABASE MIGRATIONS" + code standards.)*
- [ ] **No secrets in committed files / settings / logs.** *(CLAUDE.md security + the no-plaintext-secrets memory.)*
- [ ] **Vercel env vars → `sensitive`, production+preview only.** Any script/route that creates Vercel env vars marks secrets `type: "sensitive"` (non-readable) and targets **production+preview — never `development`**. The CAS + MMC Vercel teams have *Enforce Sensitive Environment Variables* on (2026-05-25), which force-marks prod/preview sensitive and **bans dev creates team-wide**; a plaintext secret is flagged "Needs Attention" (post-April-2026 breach). A PATCH can't convert `encrypted`→`sensitive` — **delete + recreate**. Don't read sensitive values back (they're non-readable) — source from `.env.local`. Public `NEXT_PUBLIC_*`/config: `plain`, still prod+preview only. *(project_vercel_sensitive_env_vars memory.)*
- [ ] **Address fields → Mapbox autocomplete; company/ABN fields → ABN lookup** — no plain text inputs for these. *(feedback memory.)*
- [ ] **Every UI makes the next action obvious — zero dead ends.** *(feedback_ux_flow_first.)*
- [ ] **Supabase Auth config is self-serve — never ask the user for a token.** `site_url`, redirect allow-list, SMTP, and email templates are set via the Management API using the token at `~/.supabase-token` (or `SUPABASE_MANAGEMENT_TOKEN` / `SUPABASE_ACCESS_TOKEN`) and `scripts/onboard-new-project.sh` / `configure-email-templates.sh`. Don't punt to "generate an access token" or "click the dashboard". *(Singify 2026-05-25; memory `supabase-management-token-on-disk`.)*
- [ ] **Content/IP acknowledgment** — any product where users create or share content built on third-party IP (karaoke backing, stock samples, someone's likeness) ships a `/terms` page (own-performance vs licensed-material, personal-use-only, takedown path) **and** an acknowledgment gate before save/share, recorded on the account at signup. *(Singify 2026-05-25.)*
- [ ] **Emotional register matches the product.** End-user/creative surfaces (singing, social, play) must feel alive — colour, energy, a clear "start here" — not a utilitarian grey form. Operator/admin tools stay matter-of-fact (§5), but for a consumer product a dull shell fails the "I want that" bar as surely as a missing feature. Run `/naive-tester` on a new consumer surface before calling it done — it catches dull / jargon-leak / dead-end issues a checklist misses. *(Singify 2026-05-25.)*

---

## 10. Where the authoritative prose lives

This is the portable checklist. The full prose (the *why*, the worked examples, the verification heuristics) is in `~/.claude/CLAUDE.md` under the named sections cited above. If this checklist and CLAUDE.md ever diverge, CLAUDE.md's prose is authoritative — re-sync this file. Companion portable docs in this repo: `BUSINESS_MODEL.md` (how the portfolio makes money), `MONETISATION_RULES.md` (the 15 monetisation rails), and `THIN_MVP_RUBRIC.md` (what goes in a thin validation MVP — note its §3 "Portfolio DNA is experience" overlaps this checklist: nav chrome + Settings + voice + responsive + explanatory headers belong in even the thinnest slice).

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
| **Auth on `/admin`** | ❌ **GAP** | `/admin/methodology` is **unauthenticated** (open 200). It exposes the pipeline and the real-outreach/cost Launch buttons to anyone with the URL. Highest-priority gap. |
| §4 Left navbar | ❌ GAP | Marketing `CorporateHeader` + `PipelineNav` + a cockpit top bar — not a persistent app left-navbar. |
| §4 Settings page + link | ❌ GAP | No `/settings`; no Settings link in the cockpit chrome. |
| §4 Sign Out every page | ⚠️ N/A→GAP | Moot while unauthenticated; required once auth is added. |
| §8 Team admin | ❌ absent | No org/member layer on the cockpit (single-operator today; shape not built). |

**Verdict:** the cockpit meets the *content* standards (explanatory headers, responsive, voice, consequence-clarity) but **not the authenticated-app-chrome standards — primarily because it has no auth at all.** The fix sequence: (1) auth-gate `/admin/*` (foundational — it fires real outreach + cost), (2) add the persistent left navbar + Settings + Sign Out, (3) `/settings` page, (4) team-admin shape if/when the cockpit gets more than one operator.
