import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const executable = (sql) => sql.replace(/^\s*--.*$/gm, "");

test("shared emission factors are readable by tenants but writable only by admins", async () => {
  const [migration, schema] = await Promise.all([
    read("../../supabase/migrations/028_emission_factors_reference_access.sql"),
    read("../../supabase/schema.sql"),
  ]);

  for (const source of [executable(migration), executable(schema)]) {
    assert.match(
      source,
      /ALTER TABLE (?:public\.)?emission_factors ENABLE ROW LEVEL SECURITY/,
      "RLS must be declared in the repository, not enabled by hand in production",
    );

    const policy = source.match(
      /CREATE POLICY "authenticated_read_emission_factors"[\s\S]*?;/,
    )?.[0];
    assert.ok(policy, "a read policy must exist or the carbon wizard finds no factors");
    assert.match(policy, /FOR SELECT/);
    assert.match(policy, /TO authenticated/);

    // Tenants must never be able to change the basis other tenants calculate on.
    assert.doesNotMatch(
      source,
      /CREATE POLICY[^;]*(?:FOR (?:INSERT|UPDATE|DELETE|ALL))[^;]*emission_factors/,
    );
    for (const role of ["PUBLIC", "anon"]) {
      assert.match(
        source,
        new RegExp(`REVOKE ALL ON (?:public\\.)?emission_factors FROM ${role}`),
      );
    }
    assert.match(
      source,
      /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER\s*\n?\s*ON (?:public\.)?emission_factors FROM authenticated/,
    );
    assert.match(
      source,
      /GRANT SELECT ON (?:public\.)?emission_factors TO authenticated/,
    );
  }
});

test("factor writes stay on the platform-admin path", async () => {
  const [service, admin] = await Promise.all([
    read("../../services/emissionFactorService.ts"),
    read("../../netlify/functions/admin.ts"),
  ]);

  // The browser may read reference data directly; it must never write it.
  const browserWrites = service.match(
    /from\(['"]emission_factors['"]\)\s*\.\s*(insert|update|delete|upsert)/g,
  );
  assert.equal(browserWrites, null, "the browser must not write emission factors");

  for (const action of ["create_emission_factor", "update_emission_factor", "delete_emission_factor"]) {
    assert.ok(
      admin.indexOf(`case '${action}'`) > admin.indexOf("await requireAdmin(authHeader)"),
      `${action} must sit behind platform-admin authentication`,
    );
  }
});
