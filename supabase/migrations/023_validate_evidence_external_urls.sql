-- Issue #157: prevent new unsafe external evidence URLs at the database boundary.
-- NOT VALID preserves legacy rows while enforcing the constraint for new writes.

ALTER TABLE evidence_attachments
  ADD CONSTRAINT evidence_external_url_https
  CHECK (
    external_url IS NULL
    OR (
      char_length(external_url) BETWEEN 1 AND 2048
      AND external_url = btrim(external_url)
      AND external_url ~* '^https://[^/?#[:space:]]+'
      AND external_url !~ '[[:space:][:cntrl:]]'
      AND external_url !~* '^https://[^/?#]*@'
    )
  ) NOT VALID;

COMMENT ON CONSTRAINT evidence_external_url_https ON evidence_attachments IS
  'New external evidence URLs must be credential-free HTTPS URLs; application validation additionally enforces provider and public-host rules.';
