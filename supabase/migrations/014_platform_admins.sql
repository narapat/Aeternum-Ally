-- Migration 014: platform_admins table
-- Stores Platform Admin accounts (separate from tenant users / org_members).
-- RLS is NOT enabled — all access goes through the Netlify admin.ts function
-- using the service-role key.  No tenant-side code ever touches this table.

CREATE TABLE IF NOT EXISTS public.platform_admins (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text        NOT NULL UNIQUE,
  is_active   boolean     NOT NULL DEFAULT true,
  created_by  uuid        REFERENCES public.platform_admins(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for fast email lookups on every admin request
CREATE INDEX IF NOT EXISTS idx_platform_admins_email ON public.platform_admins(email);

-- Note: the first admin row is seeded at runtime by admin.ts when
-- PLATFORM_ADMIN_EMAIL is set and the table is empty.
-- No seed SQL here so the email stays out of version control.
