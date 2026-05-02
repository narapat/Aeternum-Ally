-- Split free-text address into structured fields and add contact columns.

ALTER TABLE company_profiles
  ADD COLUMN IF NOT EXISTS address_street      text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS address_city        text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS address_state       text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS address_postal_code text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS address_country     text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact_email       text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact_phone       text NOT NULL DEFAULT '';
