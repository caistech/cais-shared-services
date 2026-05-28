# Push Migrations via CLI — Step by Step

**Fastest way to apply migrations**  
**Time:** 3 minutes total

---

## Quick Start (If You Have CLI Already Installed)

### Just Run:

```bash
cd C:\Users\denni\PycharmProjects\cais-shared-services
supabase db push
```

Done! Migrations applied.

**Verify:**
```bash
supabase migration list
```

---

## Full Setup (If CLI Not Installed)

### Step 1: Install Supabase CLI

```bash
npm install -g supabase
```

**Verify:**
```bash
supabase --version
```

Should show: `supabase-cli/1.X.X` (or higher)

### Step 2: Authenticate

```bash
supabase login
```

A browser window opens. Log in with your Supabase account. Close when done.

### Step 3: Link Your Project

```bash
cd C:\Users\denni\PycharmProjects\cais-shared-services

supabase link --project-ref tfgtfhwvrswjvkyeyvsp
```

When prompted, enter your Supabase database password.

### Step 4: Push Migrations

```bash
supabase db push
```

**Expected output:**
```
Applying migration 20260528_product_validation_status...
✓ Applied
Applying migration 20260528_validation_events...
✓ Applied
```

### Step 5: Verify

```bash
supabase migration list
```

Should show both migrations as "applied":
```
[
  {
    "version": 20260528000000,
    "name": "20260528_product_validation_status",
    "status": "applied"
  },
  {
    "version": 20260528000001,
    "name": "20260528_validation_events", 
    "status": "applied"
  }
]
```

---

## Check Current Status

Before pushing, see what migrations are pending:

```bash
supabase db pull
```

This downloads the current remote state (useful for seeing what's already been applied).

---

## Alternative: Manual SQL (No CLI)

If you prefer not to install CLI:

1. Go to: https://supabase.com/dashboard/project/tfgtfhwvrswjvkyeyvsp/sql/new
2. Follow: `EXECUTE_STEP1_NOW.md`

Time: 5 minutes

---

## Why CLI is Better

✅ Faster (3 min vs 5 min)  
✅ Version-controlled (migrations tracked)  
✅ Idempotent (can run multiple times safely)  
✅ Works in CI/CD pipelines  
✅ Standard practice for teams  

---

## Troubleshooting

**"supabase: command not found"**
→ Install: `npm install -g supabase`

**"Not authenticated"**
→ Run: `supabase login`

**"Can't connect to project"**
→ Verify project ref: `tfgtfhwvrswjvkyeyvsp`

**"Permission denied"**
→ Make sure you have access to the Supabase project

---

## After Migrations Applied

Go directly to Step 2:

**Set Vercel Environment Variables**

Details: `PHASE_2_DEPLOYMENT_INSTRUCTIONS.md` Step 2

---

## Pick Your Path

**Option A (Recommended):** Use CLI
```bash
npm install -g supabase
supabase login
cd cais-shared-services
supabase link --project-ref tfgtfhwvrswjvkyeyvsp
supabase db push
```
**Time:** 3 minutes

**Option B:** Use SQL Editor
→ Go to `EXECUTE_STEP1_NOW.md`
**Time:** 5 minutes

---

Ready? Pick one and go!

