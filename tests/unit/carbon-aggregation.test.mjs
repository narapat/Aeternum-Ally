import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMonthlyTrend,
  countableForYear,
  sourcesOnEstimate,
} from "../../services/carbonAggregation.ts";

const SOURCES = [
  { id: "elec", scope: "2" },
  { id: "fleet", scope: "1" },
];

const entry = (source_id, basis, period_start, period_end, kg) => ({
  id: `${source_id}-${period_start}-${basis}`,
  organization_id: "org",
  source_id,
  basis,
  period_start,
  period_end,
  activity_data: kg,
  calculated_emissions_kgco2e: kg,
  notes: null,
  created_by: null,
  created_at: period_start,
  updated_at: period_start,
});

const total = (entries) =>
  entries.reduce((sum, e) => sum + e.calculated_emissions_kgco2e, 0);

test("a Carbon Quest estimate counts when nothing has been measured", () => {
  const entries = [entry("elec", "estimate", "2026-01-01", "2026-12-31", 12_000)];

  assert.equal(total(countableForYear(entries, 2026)), 12_000);
  assert.deepEqual([...sourcesOnEstimate(entries, 2026)], ["elec"]);
});

test("measurements replace the estimate for that source instead of adding to it", () => {
  // The regression: the wizard's annualised 12 000 plus twelve real months
  // used to total 24 000 for a company that emitted 12 000.
  const entries = [
    entry("elec", "estimate", "2026-01-01", "2026-12-31", 12_000),
    ...Array.from({ length: 12 }, (_, m) => {
      const mm = String(m + 1).padStart(2, "0");
      const last = new Date(2026, m + 1, 0).getDate();
      return entry("elec", "actual", `2026-${mm}-01`, `2026-${mm}-${last}`, 1_000);
    }),
  ];

  assert.equal(total(countableForYear(entries, 2026)), 12_000, "not 24 000");
  assert.equal(sourcesOnEstimate(entries, 2026).size, 0);
});

test("a partly measured year keeps the estimate only for untouched sources", () => {
  const entries = [
    entry("elec", "estimate", "2026-01-01", "2026-12-31", 12_000),
    entry("fleet", "estimate", "2026-01-01", "2026-12-31", 6_000),
    entry("elec", "actual", "2026-01-01", "2026-01-31", 900),
  ];

  // Measured electricity (900) + still-estimated fleet (6 000).
  assert.equal(total(countableForYear(entries, 2026)), 6_900);
  assert.deepEqual([...sourcesOnEstimate(entries, 2026)], ["fleet"]);
});

test("the monthly trend never plots an estimate as a January spike", () => {
  const entries = [
    entry("elec", "estimate", "2026-01-01", "2026-12-31", 12_000),
    entry("elec", "actual", "2026-03-01", "2026-03-31", 1_000),
  ];

  const trend = buildMonthlyTrend(entries, SOURCES, 2026);
  const january = trend.find(p => p.month === "Jan");
  const march = trend.find(p => p.month === "Mar");

  assert.equal(january.total, 0, "the annualised figure must not land in January");
  assert.equal(march.scope2, 1, "1 000 kg renders as 1 tonne in March");
  assert.equal(trend.reduce((s, p) => s + p.total, 0), 1);
});

test("entries are scoped to their own year", () => {
  const entries = [
    entry("elec", "actual", "2025-12-01", "2025-12-31", 500),
    entry("elec", "actual", "2026-01-01", "2026-01-31", 700),
  ];

  assert.equal(total(countableForYear(entries, 2026)), 700);
  assert.equal(total(countableForYear(entries, 2025)), 500);
});

test("an overlapping entry is detected so the user can be warned, not blocked", async () => {
  const { overlappingEntries } = await import("../../services/carbonAggregation.ts");

  const feb = entry("elec", "actual", "2026-02-01", "2026-02-28", 900);
  const mar = entry("elec", "actual", "2026-03-01", "2026-03-31", 800);
  const febEstimate = entry("elec", "estimate", "2026-02-01", "2026-02-28", 950);
  const otherSource = entry("fleet", "actual", "2026-02-01", "2026-02-28", 400);
  const entries = [feb, mar, febEstimate, otherSource];

  // Same source, same basis, overlapping period.
  assert.deepEqual(
    overlappingEntries(entries, "elec", "actual", "2026-02-10", "2026-02-20").map(e => e.id),
    [feb.id],
  );

  // A different basis or a different source is not a duplicate.
  assert.equal(overlappingEntries(entries, "elec", "actual", "2026-04-01", "2026-04-30").length, 0);
  assert.equal(overlappingEntries(entries, "fleet", "actual", "2026-03-01", "2026-03-31").length, 0);

  // A period spanning both months overlaps both of that source's actuals.
  assert.equal(
    overlappingEntries(entries, "elec", "actual", "2026-02-15", "2026-03-15").length,
    2,
  );

  // Editing an entry must not flag it against itself.
  assert.equal(
    overlappingEntries(entries, "elec", "actual", "2026-02-01", "2026-02-28", feb.id).length,
    0,
  );

  // Adjacent periods do not overlap.
  assert.equal(overlappingEntries([feb], "elec", "actual", "2026-03-01", "2026-03-31").length, 0);
});
