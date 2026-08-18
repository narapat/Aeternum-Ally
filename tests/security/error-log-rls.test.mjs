import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const POLICY_PATTERN = /CREATE POLICY "users_insert_errors"[\s\S]+?\n\s*\);/;

test("error log inserts require an authenticated user and tenant membership", async () => {
  const [migration, schema] = await Promise.all([
    readFile(new URL(
      "../../supabase/migrations/025_secure_error_log_inserts.sql",
      import.meta.url,
    ), "utf8"),
    readFile(new URL("../../supabase/schema.sql", import.meta.url), "utf8"),
  ]);

  assert.match(
    migration,
    /DROP POLICY IF EXISTS "users_insert_errors" ON public\.error_log/,
  );

  for (const source of [migration, schema]) {
    const policy = source.match(POLICY_PATTERN)?.[0];
    assert.ok(policy, "users_insert_errors policy must exist");
    assert.match(policy, /FOR INSERT\s+TO authenticated/);
    assert.match(policy, /auth\.uid\(\) IS NOT NULL/);
    assert.match(policy, /user_id = auth\.uid\(\)/);
    assert.match(policy, /source = 'client'/);
    assert.match(policy, /organization_id IS NULL/);
    assert.match(policy, /is_org_member\(organization_id\)/);
    assert.doesNotMatch(policy, /OR user_id IS NULL/);

    assert.match(source, /REVOKE INSERT ON (?:public\.)?error_log FROM PUBLIC, anon/);
    assert.match(source, /GRANT INSERT ON (?:public\.)?error_log TO authenticated/);
  }
});

test("the browser logger never submits anonymous or server-originated rows", async () => {
  const source = await readFile(
    new URL("../../services/errorLogService.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /if \(!user\) return/);
  assert.match(source, /user_id: user\.id/);
  assert.match(source, /source: "client"/);
  assert.doesNotMatch(source, /user_id: user\?\.id \?\? null/);
});
