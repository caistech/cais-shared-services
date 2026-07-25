-- @caistech/attribution — database-enforced first-touch immutability.
--
-- Generalised from F2K-Projects migration 0063. The application layer decides WHO the referrer is;
-- this makes that decision permanent. An application-only rule is one forgotten code path (an
-- admin screen, a bulk import, a support script) away from silently reassigning a commission.
--
-- Once set, the attribution columns cannot change. NULL → value is allowed (that's the first
-- write). value → different value raises. An override is possible but must be DELIBERATE and is
-- always logged.
--
-- Idempotent; safe to re-run. Adjust the table/column names to your schema.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Columns (template — replace `your_subject_table`)
-- ─────────────────────────────────────────────────────────────────────────────

-- ALTER TABLE your_subject_table
--     ADD COLUMN IF NOT EXISTS referrer_id     UUID,
--     ADD COLUMN IF NOT EXISTS referrer_org_id UUID,
--     ADD COLUMN IF NOT EXISTS first_touch_at  TIMESTAMPTZ,
--     -- The self-reported fallback for someone who arrived with no link ("who told you about us?").
--     -- Deliberately NOT protected below: it is a hint for a human to act on, not an attribution.
--     ADD COLUMN IF NOT EXISTS referral_source_text TEXT;
--
-- CREATE INDEX IF NOT EXISTS your_subject_table_referrer_idx ON your_subject_table(referrer_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The immutability guard
--
-- Override paths, both requiring intent:
--   - request header  x-allow-attribution-override: true   (API)
--   - session var     app.allow_attribution_override = 'true'  (psql / scripts)
--
-- Every permitted override writes an audit row, so a reassignment is never silent even if the
-- calling code forgets to log it. Actor and reason come from x-actor-email / x-audit-reason.
--
-- REQUIRES an `audit_log` table with (actor_id, actor_email, action, entity_type, entity_id,
-- field_changed, old_value, new_value, reason, details). Drop the INSERT if you have none — but
-- then an override leaves no trace, which rather defeats the point.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION enforce_attribution_immutability()
RETURNS TRIGGER AS $$
DECLARE
  v_protected   TEXT[] := ARRAY['referrer_id', 'referrer_org_id', 'first_touch_at'];
  v_key         TEXT;
  v_old         JSONB := to_jsonb(OLD);
  v_new         JSONB := to_jsonb(NEW);
  v_override    BOOLEAN := FALSE;
  v_headers     JSONB;
  v_actor_email TEXT;
  v_reason      TEXT;
BEGIN
  BEGIN
    v_override := COALESCE(NULLIF(current_setting('app.allow_attribution_override', TRUE), ''), 'false')::BOOLEAN;
  EXCEPTION WHEN OTHERS THEN
    v_override := FALSE;
  END;

  BEGIN
    v_headers := current_setting('request.headers', TRUE)::JSONB;
  EXCEPTION WHEN OTHERS THEN
    v_headers := NULL;
  END;
  IF v_headers IS NOT NULL THEN
    IF lower(COALESCE(v_headers->>'x-allow-attribution-override', '')) = 'true' THEN
      v_override := TRUE;
    END IF;
    v_actor_email := NULLIF(v_headers->>'x-actor-email', '');
    v_reason      := NULLIF(v_headers->>'x-audit-reason', '');
  END IF;
  v_actor_email := COALESCE(v_actor_email, NULLIF(current_setting('app.actor_email', TRUE), ''));
  v_reason      := COALESCE(v_reason, NULLIF(current_setting('app.audit_reason', TRUE), ''));

  FOREACH v_key IN ARRAY v_protected LOOP
    -- Only columns the table actually has, that were already set, and are now being changed.
    IF v_old ? v_key
       AND (v_old ->> v_key) IS NOT NULL
       AND (v_old ->> v_key) IS DISTINCT FROM (v_new ->> v_key) THEN
      IF NOT v_override THEN
        RAISE EXCEPTION
          'Attribution is first-touch immutable: % cannot be changed once set (row %). Admin override required.',
          v_key, OLD.id
          USING ERRCODE = 'check_violation';
      END IF;

      INSERT INTO audit_log (
        actor_id, actor_email, action, entity_type, entity_id,
        field_changed, old_value, new_value, reason, details
      ) VALUES (
        NULL,
        COALESCE(v_actor_email, 'system'),
        'attribution_override',
        TG_TABLE_NAME,
        NEW.id,
        v_key,
        v_old -> v_key,
        v_new -> v_key,
        v_reason,
        jsonb_build_object('table', TG_TABLE_NAME)
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION enforce_attribution_immutability IS
  'BEFORE UPDATE guard: blocks changes to referrer_id / referrer_org_id / first_touch_at once set (first-touch wins). NULL->value allowed. A change requires x-allow-attribution-override:true (or the app.allow_attribution_override session var) and is written to audit_log as attribution_override.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Attach it (template — one trigger per attributed table)
-- ─────────────────────────────────────────────────────────────────────────────

-- DROP TRIGGER IF EXISTS trg_attribution_immutable ON public.your_subject_table;
-- CREATE TRIGGER trg_attribution_immutable
--   BEFORE UPDATE ON public.your_subject_table
--   FOR EACH ROW EXECUTE FUNCTION enforce_attribution_immutability();
