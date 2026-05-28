# 5-Product Validation Test Plan — Admin Portal + User Portal (2026-05-28)

**Objective:** Validate that Phase 2 is production-ready by testing both admin (`/admin/*`) and user-facing surfaces across 5 representative products. Each product gets tested with:
1. **Admin Portal** — admin user (`dennis@corporateaisolutions.com`) accessing `/admin/*` surfaces
2. **User Portal** — test user (`dennis@factory2key.com.au`) accessing product surfaces
3. **Auth flows** — signup/login/password-reset/magic-link on each product

**Test Products (representative of Lane 1, BYOK-free, and internal):**
- **Singify** (Lane 1 Paid SaaS, consumer/creator product)
- **Deal-Findrs** (Lane 1 Paid SaaS, operator/discovery product)
- **Connexions** (Lane 1 Paid SaaS, operator/outreach product)
- **Kira** (Lane 1 Paid SaaS, operator/research product)
- **LaunchReady** (Lane 1 Paid SaaS, operator/launch product)

**Test Duration:** 1-2 hours per product (30-40 mins if using session-minter cookie injection; 60+ mins if typing full auth flows).

---

## Part A: Standard Admin User Tests (same for all 5 products)

**Login as:** `dennis@corporateaisolutions.com` (admin email)  
**Access:** `/admin/*` routes (should not be blocked by auth gate)

### A1. Admin Portal Access (Auth Gate Verification)
- [ ] Navigate to `https://<product-url>/admin/` or `/admin/pipeline` (or equivalent admin surface)
- [ ] Confirm page loads (no 401/403 redirect to login)
- [ ] Confirm navbar or breadcrumb shows "Admin" context
- [ ] **Expected:** Admin can view admin dashboard without additional auth steps

### A2. Settings Page (Per PRODUCT_STANDARDS.md §4)
- [ ] Click "Settings" in persistent nav (should be present on every admin page)
- [ ] **Profile section:** Verify first-name, last-name, email, phone, company fields are rendered
- [ ] **Password section:** Verify "Current Password", "New Password", "Confirm Password" fields with Eye visibility toggle
- [ ] **Notifications section:** Verify toggles for email categories (transactional, product updates, marketing)
- [ ] Update one field (e.g., phone number) → click Save → verify success toast
- [ ] **Expected:** Settings form saves without errors and reflects the change on next reload

### A3. Sign Out Everywhere (Account Security)
- [ ] In Settings, find "Sign Out Everywhere" or "Revoke Sessions" button
- [ ] Click it and confirm prompt ("This will sign you out on all devices")
- [ ] Confirm page redirects to login (`/pipeline/login` or equivalent)
- [ ] Try to visit `/admin/*` again → should redirect to login (session revoked)
- [ ] **Expected:** All sessions are killed; user must re-login

### A4. Delete Account (Destructive Action)
- [ ] In Settings, find "Delete Account" button (typically in Account or Danger Zone section)
- [ ] Click it and confirm prompt (may require typing email to confirm)
- [ ] Confirm API call succeeds (200 OK, or redirect to post-deletion surface)
- [ ] Try to login with the deleted account → should fail with "User not found" or "Invalid credentials"
- [ ] **Expected:** Account is hard-deleted from Supabase `auth.users` and `public.profiles`; profile rows cascade-cleaned

---

## Part B: Standard Test User Tests (same for all 5 products)

**Login as:** `dennis@factory2key.com.au` (non-admin test user)  
**Access:** Product user surfaces (should be allowed); `/admin/*` (should be blocked)

### B1. User Portal Access (Auth Gate Verification)
- [ ] Navigate to product home page (e.g., `/`, `/dashboard`, `/app`)
- [ ] Confirm page loads (not redirected to login for authenticated pages)
- [ ] Confirm persistent left navbar is present (per PRODUCT_STANDARDS.md §4)
- [ ] **Expected:** Test user can access product without restriction

### B2. Admin Denial (Non-Admin User Blocked)
- [ ] Try to navigate to `/admin/` or `/admin/pipeline` or equivalent admin route
- [ ] Confirm 401/403 redirect to login or "Not Authorized" error page
- [ ] **Expected:** Non-admin users cannot reach admin surfaces

### B3. Settings Page (Per PRODUCT_STANDARDS.md §4)
- [ ] Click "Settings" in persistent nav (should be present)
- [ ] Verify same sections as A2 (Profile, Password, Notifications)
- [ ] Update profile field (e.g., job title) → click Save → verify success
- [ ] Update password (Current + New + Confirm) → click Save → verify success and re-login works
- [ ] Toggle a notification preference → click Save → verify it persists
- [ ] **Expected:** Test user can update their own profile/password/preferences; all changes persist

### B4. Sign Out (Session Cleanup)
- [ ] Click "Sign Out" in persistent nav (or via Settings)
- [ ] Confirm redirect to login page (`/pipeline/login` or equivalent)
- [ ] Try to visit product page → should redirect to login
- [ ] **Expected:** Session is cleared; user must re-login to access product

### B5. Product Feature Navigation (Sanity Check)
- [ ] After re-login, navigate to the product's primary feature surfaces (e.g., Studio in Singify, Lots in Deal-Findrs, Interviews in Connexions)
- [ ] Verify each surface loads and renders without console errors
- [ ] Spot-check one key interaction (e.g., click a button, open a modal, update a field)
- [ ] **Expected:** Product surfaces are functional; no broken routes, missing components, or 500 errors

---

## Part C: Auth Flow Tests (both users, all 5 products)

**Test with:** Fresh browser session or incognito window (to avoid pre-existing session cookies)

### C1. Signup Flow
- [ ] Navigate to `/pipeline/login` or product login page
- [ ] Click "Sign Up" tab (or link)
- [ ] Fill in Email, Password, Confirm Password
- [ ] Verify **password visibility toggle (Eye icon)** is present and functional
- [ ] Submit form → confirm redirect to confirmation-pending or login page
- [ ] Check email (Resend mailbox or test email service)
  - [ ] Confirm email received from `noreply@updates.corporateaisolutions.com`
  - [ ] Confirm display name is product-specific (e.g., "Singify", "Deal-Findrs")
  - [ ] Click confirmation link → confirm redirect and session established
- [ ] **Expected:** New user account is created, email is confirmed, user is logged in

### C2. Login Flow
- [ ] Navigate to login page
- [ ] Fill in Email and Password (use existing test account or newly signed-up account)
- [ ] Verify **password visibility toggle** works
- [ ] Submit form → confirm redirect to dashboard/home
- [ ] **Expected:** Existing user can log in and reaches the product surface

### C3. Forgot Password Flow
- [ ] Navigate to login page
- [ ] Click "Forgot Password" link (should be visible per PRODUCT_STANDARDS.md §2)
- [ ] Enter email and submit
- [ ] Confirm success message (e.g., "Check your email for reset link")
- [ ] Check email for reset link from `noreply@updates.corporateaisolutions.com`
- [ ] Click reset link → confirm redirect to password-reset page
- [ ] Enter new password (with visibility toggle) → submit
- [ ] Confirm success message (e.g., "Password updated") or redirect to login
- [ ] Try login with new password → confirm it works
- [ ] **Expected:** Password reset flow is end-to-end functional

### C4. Magic Link Flow (if supported by product)
- [ ] Navigate to login page
- [ ] Look for "Sign In with Magic Link" button or tab
- [ ] If present:
  - [ ] Enter email and click "Send Magic Link"
  - [ ] Confirm email received from `noreply@updates.corporateaisolutions.com`
  - [ ] Click magic-link URL → confirm session is established without entering password
- [ ] **Expected:** Magic-link auth (if present) works without errors

---

## Part D: Standard User Provisioning (Scaffold Verification)

**During product scaffold/onboarding (one-time per product):**

### D1. Admin Accounts Provisioned
- [ ] Verify `ADMIN_EMAILS` environment variable on Vercel includes:
  - [ ] `dennis@corporateaisolutions.com`
  - [ ] `mcmdennis@gmail.com`
- [ ] Verify `.env.local` (dev) includes the same `ADMIN_EMAILS`
- [ ] Confirm both admin emails have Supabase Auth accounts (created via invite or signup)

### D2. Test User Provisioned
- [ ] Verify `TEST_USER_EMAIL` is set (should be `dennis@factory2key.com.au`)
- [ ] Confirm test user has a Supabase Auth account
- [ ] Confirm test user is **NOT** on the admin allowlist (ADMIN_EMAILS)
- [ ] Confirm test user can login but cannot access `/admin/*` routes

### D3. Settings & Profiles Table
- [ ] Verify `public.profiles` table exists with schema: `first_name`, `last_name`, `email`, `phone`, `company`, `job_title`, `created_at`, `updated_at`
- [ ] Verify `on_auth_user_created` trigger populates `profiles` row for new signups
- [ ] Verify RLS: users can select+update their own row; admins can see all
- [ ] **Expected:** Every new signup gets a `profiles` row; Settings page can read/update it

---

## Part E: Readiness Scorecard (After Running A–D)

**For each product, rate:**

| Criterion | Status | Notes |
|---|---|---|
| **Admin access** | ✅/⚠️/❌ | Both admins can access `/admin/*` without auth gate blocking them |
| **Admin Settings** | ✅/⚠️/❌ | Admin can update profile/password/notifications |
| **Admin Sign Out** | ✅/⚠️/❌ | "Sign Out Everywhere" revokes all sessions |
| **Test user access** | ✅/⚠️/❌ | Test user can access product surfaces |
| **Test user blocked from admin** | ✅/⚠️/❌ | Test user gets 401/403 at `/admin/*` |
| **Signup flow** | ✅/⚠️/❌ | Email confirmation works; password visibility toggle present |
| **Login flow** | ✅/⚠️/❌ | Existing user can login; password visibility toggle works |
| **Forgot password** | ✅/⚠️/❌ | Reset email delivered; reset link works; new password accepted |
| **Magic link** (if applicable) | ✅/⚠️/❌ | Magic-link email delivered; link logs user in |
| **Persistent nav** | ✅/⚠️/❌ | Settings + Sign Out present on every authenticated page |
| **Profiles table** | ✅/⚠️/❌ | Table exists; trigger fires on signup; RLS enforced |
| **Email infrastructure** | ✅/⚠️/❌ | All emails from `noreply@updates.corporateaisolutions.com`; display name product-specific |

---

## Part F: Test Execution Log

**Template for logging each product test:**

```
Product: [Singify / Deal-Findrs / Connexions / Kira / LaunchReady]
Test Date: 2026-05-28
Tester: [Name]
Test Duration: [HH:MM]

Part A (Admin): [✅/⚠️/❌] [Notes]
Part B (Test User): [✅/⚠️/❌] [Notes]
Part C (Auth): [✅/⚠️/❌] [Notes]
Part D (Scaffold): [✅/⚠️/❌] [Notes]

Issues Found:
1. [Issue] — Severity: [Critical/High/Medium/Low] — Repro: [Steps]
2. [Issue] — Severity: [Critical/High/Medium/Low] — Repro: [Steps]

Overall Readiness: [Ready for production / Blocked on X / Deferred to Phase 2.1]
```

---

## Part G: Approval Gate

**All 5 products must achieve:**
- ✅ All Part A (Admin) tests passing
- ✅ All Part B (Test User) tests passing
- ✅ All Part C (Auth) tests passing
- ✅ All Part D (Scaffold) tests passing
- ✅ Part E scorecard: **no ❌ marks** (⚠️ requires documented mitigation + ticket)

**Go/No-Go Decision:**
- **GO** → Begin 7-day production monitoring (PHASE_2_PRODUCTION_MONITORING.md)
- **NO-GO** → Fix blockers and re-test before Gate 2 (validation outreach)

---

## Appendix: Using Session-Minter for Faster Auth Testing

**To speed up login testing, use the shared session-minter script:**

```bash
# Generate admin session cookie
node cais-shared-services/scripts/qa-session.mjs \
  --email dennis@corporateaisolutions.com \
  --supabase-url <URL> \
  --service-role-key <KEY>

# Generate test user session cookie
node cais-shared-services/scripts/qa-session.mjs \
  --email dennis@factory2key.com.au \
  --supabase-url <URL> \
  --service-role-key <KEY>

# For magic-link-only products
node cais-shared-services/scripts/qa-session.mjs \
  --email dennis@factory2key.com.au \
  --magic-link \
  --supabase-url <URL> \
  --service-role-key <KEY>
```

Then inject the cookie via `/browse` or browser DevTools to skip the manual login form and move directly to Part B testing.

---

## Success Criteria

**After all 5 products pass validation:**

1. Dennis approves the scorecard (no blocking issues)
2. All admin + test user accounts are provisioned across all 5 products
3. Auth flows (signup/login/reset/magic-link) are working end-to-end on each product
4. Settings page allows profile/password/notification updates
5. Persistent navbar with Sign Out is functional
6. Test user is correctly blocked from `/admin/*` routes
7. Resend email infrastructure is delivering from the canonical sender address

**Outcome:** Phase 2 is validated ready for 7-day production monitoring. Proceed to PHASE_2_PRODUCTION_MONITORING.md.

