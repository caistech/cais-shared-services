# Supabase Migrations via CLI

**Faster alternative to manual SQL editor**  
**Time:** ~3 minutes (vs 5 for manual)  
**Prerequisite:** Supabase CLI installed

---

## Option 1: Install & Use Supabase CLI (Recommended)

### Step 1: Install Supabase CLI

**On Windows (via npm):**
```bash
npm install -g supabase
```

**Verify installation:**
```bash
supabase --version
```

Expected output: `supabase-cli/X.X.X`

### Step 2: Authenticate with Supabase

```bash
supabase login
```

This opens a browser window. Log in with your Supabase account. It saves your session to `~/.supabase/credentials.json`.

### Step 3: Link the Project

```bash
cd C:\Users\denni\PycharmProjects\cais-shared-services

supabase link --project-ref tfgtfhwvrswjvkyeyvsp
```

**When prompted:**
- Enter your Supabase database password (same as you use to log in to Supabase dashboard)
- This creates `.supabase/config.toml` (don't commit this file)

### Step 4: Push Migrations

```bash
supabase db push
```

**What it does:**
1. Reads all `.sql` files in `supabase/migrations/`
2. Compares against what's already in the database
3. Runs only the NEW migrations (idempotent)
4. Creates `.supabase/migration_lock.json` to track applied migrations

**Expected output:**
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

### Step 5: Verify

```bash
# Check local migration status
supabase migration list

# Or directly query the database (if psql is installed)
supabase db info
```

---

## Option 2: Quick CLI One-Liner (If Already Logged In)

If you already have the CLI installed and linked:

```bash
cd cais-shared-services && supabase db push
```

That's it! Takes 10 seconds.

---

## Option 3: Manual SQL Editor (No CLI Needed)

If you don't want to install the CLI:

See: `EXECUTE_STEP1_NOW.md` for copy-paste SQL into browser

Time: 5 minutes

---

## Comparison

| Method | Time | Setup | Complexity | Idempotent |
|--------|------|-------|------------|-----------|
| CLI (`supabase db push`) | 3 min | ~2 min | Low | ✅ Yes |
| Manual SQL editor | 5 min | 0 min | Low | ✅ Yes |
| Supabase dashboard → SQL → Copy-paste | 5 min | 0 min | Medium | ✅ Yes |

---

## Troubleshooting

### Error: "supabase: command not found"
**Solution:** Install CLI with `npm install -g supabase`

### Error: "Not authenticated"
**Solution:** Run `supabase login` first

### Error: "Project ref not found"
**Solution:** Verify project ref is correct (`tfgtfhwvrswjvkyeyvsp`) and you have access

### Error: "Permission denied" on credentials file
**Solution:** This is normal on first run. The CLI creates `~/.supabase/credentials.json` automatically

### Error: "Migration version conflicts"
**Solution:** This shouldn't happen (using `IF NOT EXISTS`). Check `supabase/migration_lock.json` to see what's been applied.

---

## What Happens After `supabase db push`

1. CLI reads migrations in `supabase/migrations/` directory
2. Compares file timestamps against Supabase remote
3. Pushes only new migrations (in timestamp order)
4. Records applied migrations in `.supabase/migration_lock.json`
5. On next run, skips already-applied migrations (idempotent)

---

## Important: Don't Commit These Files

Add to `.gitignore`:
```
.supabase/
.env.local
```

These contain sensitive credentials and local state.

---

## After Migrations Are Pushed

Verify in Supabase dashboard:

1. Go to: https://supabase.com/dashboard/project/tfgtfhwvrswjvkyeyvsp
2. Click "SQL Editor"
3. Run verification query:
   ```sql
   SELECT tablename FROM pg_tables 
   WHERE schemaname='public' 
   ORDER BY tablename;
   ```
4. Should show: `product_validation_status` and `validation_events`

---

## Which Option to Use?

**I recommend:** **CLI option (Option 1)**
- Faster
- More reliable
- Version-controlled
- Works in CI/CD
- Standard practice

**Use manual SQL if:** You prefer not to install CLI (Option 3)

---

## Next Steps

After migrations are pushed, proceed to:

**Step 2: Set Vercel Environment Variables**

See: `PHASE_2_DEPLOYMENT_INSTRUCTIONS.md` Step 2

---

## References

- Supabase CLI docs: https://supabase.com/docs/reference/cli/supabase-db-push
- Installation: https://supabase.com/docs/guides/cli/getting-started

