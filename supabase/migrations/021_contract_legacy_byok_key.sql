-- ============================================================
-- 021 - Remove the browser-readable legacy BYOK key column
-- ============================================================
-- Production application code must use organization_ai_secrets before this
-- migration is applied. Migration 020 created and initially backfilled it.

BEGIN;

-- Recover only missing secret rows. Never overwrite a credential that was
-- rotated through the server-only endpoint after migration 020 was applied.
INSERT INTO organization_ai_secrets (organization_id, byok_api_key)
SELECT organization_id, byok_api_key
FROM organization_ai_settings
WHERE NULLIF(trim(byok_api_key), '') IS NOT NULL
ON CONFLICT (organization_id) DO NOTHING;

-- Fail before dropping the legacy column if an enabled BYOK configuration
-- would be left without a server-only credential.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM organization_ai_settings settings
    LEFT JOIN organization_ai_secrets secrets
      ON secrets.organization_id = settings.organization_id
    WHERE settings.use_byok = true
      AND secrets.organization_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'Cannot remove legacy BYOK credentials while an enabled organization has no server-only secret';
  END IF;
END;
$$;

ALTER TABLE organization_ai_settings
  DROP COLUMN IF EXISTS byok_api_key;

COMMENT ON COLUMN organization_ai_settings.use_byok
  IS 'When true the server uses the organization credential stored in organization_ai_secrets';

COMMIT;
