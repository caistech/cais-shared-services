# MICROSOFT GRAPH CONNECTOR — the canonical setup shape (OneDrive, SharePoint, and why not mail)

> **What this is.** The Microsoft twin of `GOOGLE_WORKSPACE_CONNECTOR.md`: the app-registration
> shape, the console steps in order, the scope set and its tiers, the silent-failure traps, and what
> can and cannot be automated. Read it before writing any Graph integration, and before clicking
> anything in the Entra portal — one of the choices below is expensive to change afterwards.
>
> **Why it exists.** Roughly two thirds of the portfolio's known contact base runs on Microsoft
> rather than Google, measured by MX record across every known non-internal user. A Drive-only
> product gives those owners nothing. The first implementation is the orchestrator's
> `src/connectors/microsoft.ts` (files only, no mail), and everything below was learned building it.
>
> **Severity: auth-pattern.** A refresh token here is standing access to a business's entire
> document store. The traps in §5 are silent — every one of them looks like a working integration
> until a customer says something stopped.
>
> **Confidence.** ⚠️ The console steps and the admin-consent behaviour in §2 and §6 are from general
> knowledge and have **not been walked end to end against a live tenant**. Microsoft moves this
> portal. Treat §2 as a checklist to verify rather than gospel; the code-level facts in §3–§5 come
> from an implementation and are firmer. Update the confidence line when someone has actually done it.
>
> **Last updated:** 2026-08-16.

---

## 0. The decision to get right BEFORE you click anything

**Which Microsoft account you sign in with becomes the app's home tenant.**

Publisher Verification — the thing that stops every client seeing an "unverified publisher" warning,
and that many M365 tenants require before they will consent at all — binds to a Partner Center
account linked to *that* tenant. Sign in with a personal Microsoft account and Entra silently creates
a default directory for it. Everything works, right up until verification, at which point the app is
in the wrong place and the fix is re-registering.

So: register under the tenant belonging to the entity that will be the published publisher. If that
tenant does not exist yet, that is a decision to make deliberately rather than to default into.

**One app, many consents.** As with Google, you do NOT create an app registration per client. One
multi-tenant registration serves every customer; each of their tenants consents to it. A connector
requiring per-client console work taxes every future client forever — `CONNECTOR_POLICY.md` §A names
that as a deferral trigger.

---

## 1. What Microsoft charges for this, versus Google

The single most useful thing to know when planning, and the reason Microsoft may be the cheaper
platform to be on:

| | Google | Microsoft |
|---|---|---|
| Identity check | Brand verification (2–3 days) | Publisher Verification (Partner Center + verified MPN ID) |
| Security assessment | **CASA, mandatory for restricted scopes** — paid third-party lab, annual | **Believed NOT required** for plain Graph API access; M365 Certification is optional |
| The real gate | Scope tier — restricted scopes force the assessment for every tenant | **Tenant admin consent policy** — many orgs block unverified third-party apps by default |
| Failure mode when unprepared | Verification refused | The owner sees "needs admin approval" and cannot proceed alone |

⚠️ The "no mandatory assessment" reading is the load-bearing commercial assumption and is **not
verified**. Confirm it before planning a budget around it.

Our ICP helps with the admin-consent gate: a 60–70-year-old owner of an SME is usually his own tenant
admin. It will not help inside a larger client.

---

## 2. The console steps, in order

**entra.microsoft.com** → **App registrations** → **New registration**.

1. **Name** — appears on the consent screen. This is the equivalent of Google's app name, and the
   owner reads it while deciding whether to trust you.
2. **Supported account types** — ⚠️ **"Accounts in any organizational directory and personal
   Microsoft accounts"**. This is the load-bearing choice. It makes the app multi-tenant and matches
   the `common` authority endpoint. Choose single-tenant and *no client can ever connect* — only your
   own organisation, which will look like the integration working perfectly in testing.
3. **Redirect URI** — platform **Web**, the exact callback URL. Must match the value the code sends,
   character for character.
4. **Overview → Application (client) ID** → this is `MICROSOFT_CLIENT_ID`.
5. **Certificates & secrets → New client secret** → copy the **Value** column → this is
   `MICROSOFT_CLIENT_SECRET`.
   - ⚠️ Shown **once**. Navigate away and it is unrecoverable; you would add a second secret.
   - ⚠️ Do not copy the "Secret ID" — that is not it, and it looks just as much like a credential.
   - ⚠️ **It expires. 24 months maximum, and the portal default is shorter.** See §5.1.
6. **API permissions → Microsoft Graph → Delegated** — add the scopes from §3.
7. **Branding** — logo, home page, terms and privacy URLs. The same URLs the Google registration
   uses; there is no reason for them to differ, and a difference is a discrepancy a reviewer notices.

**Redirect URIs and authorised domains:** keep production-only ones on the app you intend to submit
for verification. A `localhost` redirect or a `*.vercel.app` preview host on a registration under
review invites questions, and preview hosts on a domain you do not own cannot be verified at all.
(That exact problem is live on the Google side — see the Kira CASA register.)

---

## 3. The scope set, and the tiers that follow from it

Delegated permissions. Requested at runtime via the `scope` parameter on the v2.0 endpoint; the
registered list mainly drives admin consent and the review screen.

| Scope | Purpose | Admin consent? |
|---|---|---|
| `openid` `profile` `email` | Identity | No |
| **`offline_access`** | **The refresh token. See §5.2** | No |
| `User.Read` | Which account consented | No |
| `Files.Read` | His own OneDrive, read | No |
| `Files.ReadWrite` | His own OneDrive, read + write | No |
| `Files.ReadWrite.All` | Everything he can reach, incl. shared files + SharePoint | Believed no |
| `Sites.Read.All` | SharePoint document libraries directly | **Believed YES** — avoid |
| `Mail.*` | — | **Never requested. See §4** |

### The tiers cannot mirror Google's, and must not pretend to

Google's `DriveAccess` is `full | readonly | picked`, where `picked` (`drive.file`) reaches only
files the owner explicitly hands over. **Graph has no delegated per-file scope.** The narrowest thing
Microsoft will grant is the owner's whole OneDrive.

So the canonical Microsoft tiers are named for what they actually grant:

- **`readonly`** — his own OneDrive, read. Cannot file anything back.
- **`readwrite`** — his own OneDrive, read and write. **The default**, because it is the least
  privilege that can still return finished work to him.
- **`all`** — additionally files shared with him and the company SharePoint. Much wider than it
  sounds inside a tenant with SharePoint, and must be labelled that way.

⚠️ **Do not build a shared consent form that maps one vocabulary onto the other.** A tier called
`picked` on Microsoft would promise per-file access over a grant covering everything — the exact
class of defect where a page said "Drive" and the vendor asked for the address book. The type guard
should **reject** the other platform's vocabulary rather than mapping it, so a cross-platform ticket
falls to the safe default instead of quietly granting more than the word implies.

### The tenant/audience setting belongs behind a flag

`common` accepts work and personal accounts and is right for every deployment currently foreseeable.
But a bare `MICROSOFT_TENANT` env var looks like a helpful thing to fill in, and setting it to a
tenant GUID **silently restricts the app to one organisation** — every other client's consent then
fails with a Microsoft error about their account not existing in the directory, which reads as their
problem rather than yours.

So gate it: `MICROSOFT_TENANT_OVERRIDE` must be exactly `true` before `MICROSOFT_TENANT` is read at
all. Anything else — unset, empty, `false`, `TRUE`, a typo — is `common`, because **the safe state
should be the one you fall into by accident** (the `STRIPE_LIVE_MODE` shape). Enabling the override
with no tenant set should **throw**, not fall back to `common`: falling back is *broader* than what
was asked for. Read it at call time, never at module scope.

---

## 4. Why mail is not in the scope set

Two reasons, and the second is Microsoft-specific and easily missed.

1. **`Mail.Send` routes around the compliance path.** Everything outbound goes through the sender
   identity, the Spam Act footer, the suppression store, the AU-only jurisdiction guard and the
   approval gate. Same argument as `gmail.send`.
2. **⚠️ THERE IS NO DRAFT-ONLY PERMISSION.** Creating a draft requires `Mail.ReadWrite`, which also
   reads the entire mailbox. Gmail has `gmail.compose`, which stops short of read; Graph has no
   equivalent. So a Microsoft mailbox tier offering `none | draft | read` would really be
   `none | read | read`, and an owner choosing "just drafts" would be granting everything.

If mail is ever added, the consent surface must say that in those words — or it must not be offered.

**Write the repo-wide guard BEFORE any Graph mail path exists.** A guard naming Gmail specifically
will pass a Graph send on day one. The assertion wanted is *"nothing in this repository sends mail
outside the compliance path"*, and it should cover `sendMail`, `messages/{id}/send`, `Mail.Send`,
`Mail.ReadWrite`, `Mail.Read`, and the `SMTP.Send` / `IMAP.AccessAsUser` back doors. Reference
implementation: `orchestrator/src/connectors/graph-no-send.test.ts`.

---

## 5. The silent-failure traps

Every one of these looks like a working integration until it doesn't.

### 5.1 The client secret expires, and nothing announces it
24 months maximum. When it lapses, every Microsoft connection stops and the only signal is a
customer mentioning it. This is the same shape as the expired `NODE_AUTH_TOKEN` that made a
production deploy fail silently for a month. **Diary the expiry the day the secret is created**, and
prefer a health check that actually exercises a refresh over one that checks the variable is set.

### 5.2 `offline_access` IS the refresh token
There is no `access_type=offline`. Omit the scope and you receive an access token, **no refresh
token**, and a connection that dies within the hour reading as "not connected" — with nothing in the
logs, because nothing failed.

### 5.3 ⚠️ Refresh tokens ROTATE — the opposite of Google
Microsoft returns a **new** refresh token on nearly every refresh and invalidates the previous one.
Google usually returns none and you keep the one you hold, so the Google client's
`...(tok.refresh_token ? {…} : {})` guard is correct *there* and **fatal here**: the row would keep a
token Microsoft has already retired, and the connection dies at the next refresh with an
`invalid_grant` nobody traces back to that line.

Persist whatever comes back, **before** the access token is used, and treat a failed persist as
fatal rather than proceeding — you have already spent a single-use token, so returning it buys one
request and loses the connection permanently. Same discipline as Xero, not Google.

### 5.4 Granted scopes come back WITHOUT the resource prefix
Request `https://graph.microsoft.com/Files.Read` and the token response says `Files.Read`. A
read-back comparing against the requested strings matches nothing, so **every connection reads as
declined**. Compare on the trailing segment.

### 5.5 OData escaping is not Drive escaping
`search(q='…')` and `$filter` are OData: a single quote is escaped by **doubling** it, and a
backslash is an ordinary character. Drive uses a backslash. "O'Brien Plumbing" is not an exotic
trading name, and using the wrong rule leaves the query string unterminated.

### 5.6 ⚠️ Office files have bytes but not text
The most valuable case, and the one Google does better. A Google Doc has no bytes and must be
exported — but it exports to `text/plain`, so reading an owner's existing quotes is one call. A
`.docx` is the opposite: real bytes you can download, and **no text conversion at all** (Graph
converts to PDF only).

So *"read his existing documents so she writes in his format"* — usually the whole reason for the
connector — **does not work on Microsoft** without a text extractor. Degrade honestly (return null,
tell the user which files can and cannot be opened) rather than failing the run. Do **not** grow a
parser inside a connector: `SHARED_SERVICES.md` names "Document text extraction (PDF/docx/xlsx →
text)" as an open extraction candidate that must not be forked per product.

### 5.7 There is no HTML → docx conversion on upload either
Drive converts uploaded HTML into a native Google Doc. Graph does not, and posting HTML bytes named
`.docx` produces a file Word refuses to open. Writing genuine `.docx` needs an OOXML writer, which
does not belong in a connector. Writing `.html` is the honest compromise — Word opens and edits it,
OneDrive previews it, and the property that matters holds: the document is his, in his storage,
editable without us.

### 5.8 Folder creation conflict behaviour
Use `conflictBehavior: 'fail'` and re-read on 409, not `'replace'` (which deletes a folder and its
contents) and not `'rename'` (which silently accumulates "Kira 1", "Kira 2"). Addressing by path
(`/root:/Name:`) is a single call that returns the folder or 404s, so there is no query to escape.

---

## 6. What can and cannot be automated

**Cannot** (portal or human, at least today): the app registration itself, the account/tenant choice,
the client secret, Publisher Verification, and Partner Center enrolment. Budget human time.

**Can:** everything after the credentials exist — env distribution (`@caistech/portfolio-env-sync`,
sensitive + production/preview only), the consent flow, granted-scope read-back, connection status,
and the compliance guards.

**Cannot be automated away, and must not be skipped:** testing against a **real client tenant**
early. Admin-consent policy is invisible from your own tenant, where you are the admin. Discovering
it during a demo is the avoidable version of this.

---

## 7. Where the reference implementation lives

`orchestrator/src/connectors/microsoft.ts` — the client, mirroring `google.ts` by name and shape per
the SHARED_SERVICES build-alike rule, with every vendor divergence commented as one.
`microsoft-consent-copy.ts` derives the owner-facing claims from the scopes so the copy cannot drift.
`graph-no-send.test.ts` holds the mail perimeter. `app/api/connect/microsoft/{route,callback}` are
the consent pair. `orchestrator/.env.example` documents the variables.

**Extraction status:** `SHARED_SERVICES.md` already names `@caistech/google-workspace` as an open
extraction candidate with two divergent implementations. The Microsoft client is deliberately built
to the same shape so a combined package is a lift rather than a rewrite — **do not let a third
implementation diverge.**
