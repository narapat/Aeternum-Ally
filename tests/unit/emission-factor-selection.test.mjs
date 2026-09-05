import assert from "node:assert/strict";
import test from "node:test";

import { selectBestFactor } from "../../services/emissionFactorSelection.ts";

const factor = (region, year, value, source = "IPCC") => ({
  id: `${region}-${year}`,
  fuel_type: "Diesel",
  scope: "1",
  unit: "L",
  kgco2e_per_unit: value,
  source,
  year,
  region,
});

test("the most specific geography wins", () => {
  const factors = [factor("Global", 2021, 2.68), factor("EU", 2021, 2.6), factor("Germany", 2021, 2.5)];

  assert.equal(selectBestFactor(factors, "Germany").region, "Germany");
  assert.equal(selectBestFactor(factors, "France").region, "EU", "via region membership");
  assert.equal(selectBestFactor(factors, "Brazil").region, "Global", "no country or region match");
});

test("a figure uses the factor that applied in its reporting year", () => {
  const factors = [factor("Global", 2021, 2.68), factor("Global", 2026, 2.40)];

  // The regression: selection took the newest publication regardless of
  // period, so adding a 2026 factor silently restated an already-reported
  // 2024 figure.
  assert.equal(selectBestFactor(factors, "Brazil", 2024).year, 2021);
  assert.equal(selectBestFactor(factors, "Brazil", 2026).year, 2026);
  assert.equal(selectBestFactor(factors, "Brazil").year, 2026, "no year given: newest");
});

test("period filtering does not override geography", () => {
  const factors = [
    factor("Global", 2026, 2.40),
    factor("Thailand", 2020, 2.71),
    factor("Thailand", 2024, 2.70),
  ];

  const chosen = selectBestFactor(factors, "Thailand", 2024);
  assert.equal(chosen.region, "Thailand");
  assert.equal(chosen.year, 2024, "newest Thai factor that applied in 2024");

  assert.equal(selectBestFactor(factors, "Thailand", 2022).year, 2020);
});

test("a period earlier than any published factor still calculates", () => {
  const factors = [factor("Global", 2021, 2.68)];

  const chosen = selectBestFactor(factors, "Brazil", 2015);
  assert.equal(chosen.year, 2021, "fall back rather than refuse to calculate");
});

test("no candidates yields nothing rather than a wrong number", () => {
  assert.equal(selectBestFactor([], "Thailand", 2024), null);
});
