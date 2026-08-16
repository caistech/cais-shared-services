# GOOGLE WORKSPACE CONNECTOR — the canonical setup shape (Drive · Gmail · Contacts)

> **What this is.** The one runbook for connecting a tenant's Google account to a portfolio product:
> which scopes, which publishing mode, the console steps in order, the traps that fail silently, and
> — the question everybody asks first — **what can and cannot be automated.**
>
> **Why it exists.** Kira's Drive connector was built on 2026-07-30/31 and every non-obvious decision
> in it was discovered the expensive way: a redirect URI that differed only by scheme, a refresh
> token that carries scopes forever, a consent screen that lets a user untick the permission the
> whole feature depends on, and a Drive full of PDFs a Drive connector cannot read. F2K-Checkpoint
> had already solved half of it in a different shape. This is that knowledge written once.
>
> **Severity: auth-pattern.** These tokens are standing access to a business's documents, mail and
> contacts. A mistake here is not a bug, it is an incident.
>
> **Last updated:** 2026-07-31.

---

## 0. The decider — read this before planning any client onboarding

> **You do NOT create a Google Cloud project per client. One app, many consents.**

This is the single most common wrong assumption, and it inverts the entire onboarding cost model.

OAuth is designed so that **one registered application** is consented to by **many users**. Slack,
Notion, Zapier and every other integration work this way: their customers do not create Google Cloud
projects, do not enable APIs, and never see a client secret. They click *Connect*, read a consent
screen, and click *Allow*.

So the honest cost model is:

| | Per client | One-time |
|---|---|---|
| **Client's work** | one click + consent | none |
| **Our work** | **zero** | create the app, then pass Google verification |

**The client never needs a Google Cloud API key, and there is nothing for us to automate per client
— because there is nothing per client to do.** Friction is already at the floor for the tenant; the
one-time cost is ours and it is verification (§6).

**The one exception is brand.** The consent screen shows the *app owner's* name — "**Kira** wants
access to your Google Drive". For a white-label or distributor product where the DISTRIBUTOR's name
must appear, that distributor needs their own Google Cloud app, because the consent screen is the
most visible instance of the "whose brand travels" gate (`PRODUCT_STANDARDS` §9). That is the only
case where §3's console steps are handed to somebody outside the portfolio — and it is what the rest
of this document is for.

---

## 1. What can and cannot be automated

Asked and answered once, so nobody re-scopes it hopefully.

| Step | Automatable? | How |
|---|---|---|
| Create a GCP project | ✅ | Cloud Resource Manager API |
| Enable Drive / Gmail / People APIs | ✅ | Service Usage API |
| **Create the OAuth consent screen** | ❌ | Console only. No public API. |
| **Create the OAuth client (id + secret)** | ❌ | Console only. `gcloud alpha iap oauth-clients` is Identity-Aware Proxy, a different thing — it does not create general web-app clients. |
| **Submit for verification** | ❌ | Console form + a demo video + a security assessment |
| Register redirect URIs | ❌ | Part of the client, so console only |
| **A tenant connecting their account** | ✅ | This is just OAuth — already zero-touch |
| **Verifying somebody's console work** | ✅ | See below — this is the automation actually worth building |

**Do not design a flow that depends on creating OAuth clients programmatically.** It is not a gap
Google has left open by accident; a client secret that could be minted by an API would be a client
secret an API could steal.

### The automation that IS worth building: a setup preflight

The console work can't be done for the operator, but it can be **checked**, and checking is where the
time actually goes. Google's authorize endpoint answers a bad configuration distinctly from a good
one *without any consent round trip*: build the consent URL and inspect the response.

- Redirect URI not registered → an error redirect.
- Registered → a redirect to the sign-in/consent screen.

That is precisely how the Kira `http` vs `https` mismatch was diagnosed in minutes rather than by
staring at a console: both URLs were built, `https` was rejected, `http` was accepted, which proved
what was registered without guessing. A wizard step that runs this and reports *"your redirect URI
isn't registered — check the scheme"* removes the single most common failure in §5.

---

## 2. Scopes — the canonical set

Ask for these and nothing else. Every restricted scope is separately justified at verification, so
each extra one costs real time.

> ⛔ **THREE ROWS BELOW ARE DISPUTED — CONFIRM AGAINST GOOGLE'S LIVE RESTRICTED-SCOPE LIST BEFORE
> SUBMITTING.** Flagged 2026-08-15 from the orchestrator's shipped implementation, which disagrees
> with this table. A paid third-party **CASA security assessment** rides on the answer, so this is a
> money-and-schedule question rather than a documentation nit.
>
> | Scope | This table | The implementation / current read |
> |---|---|---|
> | **`gmail.drafts.create`** | listed, "sensitive" | ⚠️ **Probably does not exist.** Gmail publishes `compose`, `send`, `insert`, `modify`, `readonly`, `metadata`, `labels`, `settings.*`. `orchestrator/src/connectors/google.ts` states outright that **there is no draft-only scope** — `gmail.compose` is the narrowest that can create a draft, **and it also permits sending**. A submission justifying a non-existent scope gets bounced, and the "structurally cannot send" claim in the row is the opposite of true. |
> | **`gmail.send`** | "sensitive" | Likely **correct**. Google's split runs on *reading*: `readonly`/`metadata`/`modify`/`insert`/`mail.google.com` restricted; `compose` and `send` sensitive. |
> | **`contacts.readonly` / `.other.readonly`** | **restricted** | `orchestrator/src/connectors/google-contacts.ts` says merely **sensitive** — *"they add nothing to the verification burden that Drive does not already carry."* |
>
> **Why the contacts row is the expensive one.** If contacts is *sensitive*, then a
> `drive.file` + `contacts.*` + `gmail.compose` app carries **no restricted scopes at all** — fast,
> cheap verification, no CASA. Only `drive` / `drive.readonly` / `gmail.readonly` cross that line. And
> since **verification reviews the UNION** of everything the app *can* request, offering wide Drive or
> mailbox-read *as an option* buys the assessment for every tenant, including those who choose neither.
>
> ⚠️ **Do not resolve this from either document.** The disagreement was found by an agent that then
> got the classification wrong in *both* directions inside one session. Google's live list is the only
> authority; reconcile this table to it once, and correct the row rather than adding a note.

| Scope | Why | Class |
|---|---|---|
| `openid`, `userinfo.email`, `userinfo.profile` | Know WHICH account consented, so a wrong-account connect is detectable | basic |
| `drive` | Read + write. Needed only to save finished documents back | **restricted** |
| `drive.readonly` | Read everything. The recommended default | **restricted** |
| `drive.file` | Only files the user picks. Least privilege | non-sensitive |
| `gmail.readonly` | Read Sent mail — where a tenant's ISSUED documents actually are (§4) | **restricted** |
| `gmail.send` | Send as the tenant, from their real address | sensitive ⛔ |
| `gmail.compose` | Create a draft in their Gmail. ⚠️ **Also permits sending** — there is no draft-only scope, so the send guard must be in the CODE (see `orchestrator/src/connectors/gmail-draft.ts` and its repo-wide `gmail-no-send.test.ts`) | sensitive ⛔ |
| `contacts.readonly` | Resolve "Roger at Quantum Surveys" to an address | **restricted** ⛔ |
| `contacts.other.readonly` | The auto-saved-from-email list, where infrequent contacts live | **restricted** ⛔ |

**Offer all three Drive scopes** if the product lets the owner choose their access level — a scope
absent from the consent screen makes that option fail at Google rather than in your code.

### Never request

- **`https://mail.google.com/`** — its only addition over the three Gmail scopes above is *permanent
  deletion*, which bypasses Trash entirely. In an agentic system, where an LLM chooses which tools to
  call, the token's capability is the only real bound — prompt instructions are not a security
  boundary. It is also the most scrutinised scope Google has, and on the consent screen it reads
  *"read, compose, send, and permanently delete all your email"*, which for a privacy-sensitive ICP
  ends the conversation.
- `gmail.modify` where the three narrower scopes suffice. If archiving is genuinely needed, this is
  the correct step up — it can trash but not permanently delete, so recoverability survives.
- `docs` (legacy duplicate of `drive`), `drive.metadata*` (already implied), `drive.photos.readonly`,
  `drive.apps*`, `drive.scripts`, `drive.activity*`, `drive.appdata`.
- Every People API `profile.*` / `user.*` / `directory.readonly` — birthday, gender, street address.

---

## 3. Console setup, in order

Order matters: the console blocks later steps until earlier ones exist.

1. **Enable the APIs** — Google Drive API, Gmail API, **People API** (contacts live here; there is no
   "Contacts API"). Skipping this fails much later as an unexplained 403.
2. **Branding** — app name (**what users read on the consent screen** — use the product name, not an
   internal project slug), support email, developer contact, home page, and **privacy policy + terms
   URLs**. The legal links are mandatory for verification and a submission without them is rejected.
3. **Audience** — Internal or External (§6).
4. **Data Access** — the §2 scopes. The console's scope table is mis-sorted (`gmail.readonly` files
   under *Google Drive API*), so use the **Pasted Scopes** box with full URLs rather than hunting.
5. **Clients → Create client → Web application.** Leave JavaScript origins empty; the flow is
   server-side. Register the callback URI, plus a localhost one for development.

---

## 4. Where a tenant's own documents actually are

A finding worth more than the plumbing: **searching a business's Drive for "quote" mostly returns
quotes their SUPPLIERS sent them.** In the Kira case, 15 quote-named files were nearly all inbound —
subcontractors, manufacturers, trades. Learning a format from those teaches the product to write
like the client's air-conditioning contractor.

Two consequences for any format-learning or precedent-matching feature:

- **Filter to issued-by-us** — author, the entity named as issuer, folder location. Folder structure
  is usually a stronger signal than filename.
- **Prefer Sent mail.** `gmail.readonly` over the Sent folder is unambiguous: those are things this
  business sent. It solves the inbound/outbound problem for free.

**And the files are not readable by a Drive connector alone.** In the same sample: 16 PDFs, 7 xlsx,
3 Google Sheets, 2 docx, 1 Google Doc. A Drive client reads Google-native formats (via **export**,
not download) and plain text — four of thirty-three. Everything else needs a document extractor, and
that belongs in `@caistech/dataroom-core`'s ingest subpath, not forked per product.

**Access is not comprehension.** Budget them as separate pieces of work.

---

## 5. The traps — each one fails silently

1. **Redirect URI is compared as a literal string.** Scheme, host, path, trailing slash. `http` vs
   `https` is the classic, and Google *will* save an `http` URI for a non-localhost host even though
   its own policy forbids it — so the console looks correct and consent fails. **Localhost is the one
   exemption**; keep it `http`. And check the port matches the framework's actual dev port.
2. **A refresh token is issued once.** Without `access_type=offline` **and** `prompt=consent` you get
   an hour of access and then silence. On later refreshes Google omits `refresh_token` entirely, so
   writing the absence nulls a working credential and the connection dies at the next expiry with
   nothing in the logs. **Only ever persist a refresh token you actually received.**
3. **Scopes are frozen at consent.** Adding a scope in the console does NOT upgrade an existing
   token — that is a security property, not an inconvenience, or any app you ever authorised could
   widen its own access tomorrow. The user must re-consent. (Adding a scope to an already-*verified*
   app also triggers re-verification for it, so settle the final scope set before submitting.)
4. **The user can untick scopes on the consent screen.** Asking for Drive is not receiving it. Read
   the granted scope back from the token response, and if the essential one is missing, **save
   nothing** — a connection row without it shows green on every screen while every read returns empty.
5. **Google-native files have no bytes.** `alt=media` fails on Docs/Sheets/Slides; they must be
   **exported**. This is the usual reason an integration returns nothing for exactly the documents
   that matter.
6. **Shared Drives are invisible by default.** Set `supportsAllDrives` and `includeItemsFromAllDrives`
   on every call. For a business, the shared drive is often where all the real work lives.
7. **A shared drive created by a personal account is still reachable** by a Workspace account that is
   a member — access flows through membership, so who created it does not decide who can read it.

---

## 6. Publishing mode — and the trap in the middle row

| Mode | Who can connect | Verification | Refresh tokens |
|---|---|---|---|
| **Internal** | Only the Workspace domain that owns the project | Never | Stable |
| **External + Testing** | Any Google account, ≤100 test users | Not needed | **Expire after 7 days** |
| **External + Published** | Anyone | **Required** for restricted scopes | Stable |

**That middle row is the trap.** Testing mode looks like the obvious way to trial with outside users,
and it silently breaks any scheduled ingest weekly.

**Recommended sequence:** build and prove on **Internal** against the operator's own Workspace —
stable tokens, no verification, no test-user list. Move to External and start verification only when
there is something worth putting in front of a client, by which time the scope set is settled and it
is one review round instead of two.

**Verification is the real schedule risk**, not the code. Restricted scopes require justification per
scope, a demo video, and a third-party security assessment (CASA). Budget weeks and real money, and
start it before you need it.

---

## 6.5 Onboarding a CLIENT — who does what

Written because the question keeps being asked as *"how do we get the client's Google credentials?"*,
and the answer is that in the normal case **there are none to get.** One app, many consents: the
client authorises OUR app against THEIR account. They never create a Cloud project, an OAuth client,
or a secret, and no credential of theirs is ever sent to us or held by us.

Two scenarios. Almost every client is Scenario A.

---

### Scenario A — the default: the client consents to our app

**Client-side work: one click, about thirty seconds, no console, no IT involvement.**

| # | Who | Work | When |
|---|---|---|---|
| 1 | **Us, once ever** | Cloud project, consent screen, OAuth client, scope set (§2), verification (§6) | Before the first client |
| 2 | **Us, per client** | Nothing. The tenant row is auto-provisioned on first use | — |
| 3 | **Client** | Click *Connect Google*, choose the right account, tick the permissions, done | At onboarding |
| 4 | **Us** | Confirm the connection reports the access we expected — granted, not requested | Immediately after |

**The two things that actually go wrong here are both the client's choice at the consent screen**,
and neither announces itself afterwards:

- **The wrong Google account.** Owners are routinely signed into several. Connecting the wrong one is
  not a visible failure — it is a Drive with none of their documents in it. `login_hint` is passed to
  pre-select, which is why setup asks which address they use for the business rather than assuming
  the one they signed up with.
- **A permission unticked.** Google lets them decline individual scopes and still complete the flow,
  so a connection can read "connected" while granting nothing useful. Always read back the GRANTED
  scope and show it. Kira's Settings states Drive access level, Gmail, and contacts separately for
  exactly this reason: a declined contacts scope is otherwise invisible in use, felt only as the
  product being forgetful, with a remedy nobody would think to try.

#### Copy-paste instructions for the client

> **Connecting your Google account**
>
> 1. Open **Settings → Connected accounts** and click **Connect Google**.
> 2. **Choose the Google account you use for the business.** If you have more than one, this matters
>    — pick the one your work documents and email live in.
> 3. You will see a list of permissions. **Leave them all ticked.** If you untick one, that part
>    simply will not work, and it will not be obvious which.
> 4. Click **Continue**. You will land back on the Settings page.
> 5. Check that it says the account you expected, and that Drive, Gmail and Contacts are listed.
>
> You are not giving anyone a password, and you can disconnect at any time — from that same page, or
> from your Google account under Security → Third-party apps.
>
> **If you see a screen saying the app is not verified**, stop and tell us rather than clicking
> through: it means you have reached a build that is not ready for you yet.

---

### Scenario B — the client insists on their own Cloud project

Rare, and worth pushing back on before agreeing: it moves the console work, the verification, and the
ongoing maintenance onto someone who does it once and never again. Legitimate reasons are data
residency, their own API quota, an internal policy against third-party OAuth apps, or a white-label
deployment they own and operate (the `CLIENT_HANDOVER_KIT` case).

**Their work is console-only and cannot be automated** (§1) — no API creates a consent screen or
mints an OAuth client, deliberately.

| # | Who | Work |
|---|---|---|
| 1 | **Client** | Create a Cloud project |
| 2 | **Client** | Enable Drive, Gmail and **People** APIs (contacts live in People; there is no "Contacts API") |
| 3 | **Client** | Configure the consent screen: app name, support email, developer contact, **and the privacy policy + terms URLs** — mandatory for verification, and a submission without them is rejected |
| 4 | **Client** | Add the §2 scopes via the **Pasted Scopes** box, not the picker — the console's scope table is mis-sorted and omits several, including both contacts scopes |
| 5 | **Client** | Create a **Web application** client. Leave JavaScript origins empty; the flow is server-side |
| 6 | **Client** | Register the exact redirect URI we give them, character for character |
| 7 | **Client** | Send us the client ID and secret **over a password manager or an encrypted channel — never plain email** |
| 8 | **Client** | Choose Internal or External, and if External, own the verification (§6) — weeks, plus a paid third-party security assessment for restricted scopes |
| 9 | **Us** | Set the two env vars, run the preflight (§1), confirm the redirect URI is registered before anyone tries to connect |

**Tell them about the verification cost at step 1, not step 8.** Restricted scopes (`drive`,
`drive.readonly`, `gmail.readonly`) require a demo video, per-scope justification and a CASA security
assessment. A client who wanted "their own project for control" often stops wanting it once that is
priced. **If they proceed, ask whether `drive.file` will do** — it is non-sensitive, needs no
assessment, and covers any flow where the user picks the files. It is the difference between
connecting this month and connecting next quarter.

---

### What we never ask a client for

- A Google password, or a "service account for their Drive". Neither is how this works, and being
  asked for either is a phishing signature — say so plainly, because they may be right to be wary.
- Their client secret over email or chat. Password manager or encrypted channel (`PRODUCT_STANDARDS`
  §9), same as any live credential.
- Anything at all in Scenario A beyond the consent click.

---

## 7. Reference implementations

- **Multi-tenant, per-owner consent** — Kira / orchestrator: `src/connectors/google.ts`,
  `app/api/connect/google/*`, tokens in a `connections` table (RLS on, service-role only), tenant
  asserted by an **HMAC-signed ticket** minted by the authenticated app rather than a `?tenant=`
  query parameter, since `/api/*` must sit outside session middleware for the callback to work.
- **Single-identity ingest** — F2K-Checkpoint: `src/lib/drive/client.ts`, one refresh token minted by
  a script and held in env. Correct for one company's own mailbox; wrong for multi-tenant.

⚠️ **These are two implementations of the same capability, which is the extraction trigger.**
`@caistech/google-workspace` (Drive + Gmail + Contacts, sharing one OAuth client) is an open
shared-services candidate; Checkpoint's is the more mature client to extract from. Build any third
one to the same shape (`SHARED_SERVICES.md` build-alike rule) rather than a divergent design.

---

**One line:** *one app and many consents — so client friction is already one click; the console work
cannot be automated but it can be verified, and the traps that bite are the redirect string, the
refresh token you only get once, and the scopes frozen at the moment somebody clicked Allow.*
