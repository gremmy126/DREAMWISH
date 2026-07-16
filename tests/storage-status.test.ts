import assert from "node:assert/strict";
import { calculateStoragePercent, formatStoragePercentLabel } from "../src/lib/storage/storage-metrics";

test("calculateStoragePercent shows non-zero usage below one percent without a less-than marker", () => {
  assert.deepEqual(calculateStoragePercent(512, 1024 * 1024), {
    label: "0.05%",
    widthPercent: 1
  });
});

test("calculateStoragePercent shows zero only when storage is empty", () => {
  assert.deepEqual(calculateStoragePercent(0, 1024 * 1024), {
    label: "0.00%",
    widthPercent: 0
  });
});

test("calculateStoragePercent always uses two decimals and preserves numeric width", () => {
  assert.deepEqual(calculateStoragePercent(1234, 10000), {
    label: "12.34%",
    widthPercent: 12.34
  });
});

test("calculateStoragePercent clamps over-quota usage to one hundred percent", () => {
  assert.deepEqual(calculateStoragePercent(150, 100), {
    label: "100.00%",
    widthPercent: 100
  });
});

test("tiny non-zero usage never renders as 0.00% against a 10GiB quota", () => {
  const quota = 10 * 1024 * 1024 * 1024;
  const result = calculateStoragePercent(100 * 1024, quota);
  assert.ok(result);
  assert.notEqual(result.label, "0.00%");
  assert.match(result.label, /^0\.\d{4}%$/u);
  assert.equal(result.widthPercent, 1);
});

test("tiny usage label grows as usage grows", () => {
  const quota = 10 * 1024 * 1024 * 1024;
  const small = calculateStoragePercent(1024 * 1024, quota);
  const larger = calculateStoragePercent(200 * 1024 * 1024, quota);
  assert.ok(small && larger);
  assert.notEqual(small.label, larger.label);
  assert.ok(parseFloat(larger.label) > parseFloat(small.label));
});

test("formatStoragePercentLabel floors sub-display usage instead of rounding to zero", () => {
  assert.equal(formatStoragePercentLabel(0), "0.00%");
  assert.equal(formatStoragePercentLabel(0.000000009), "0.0001%");
  assert.equal(formatStoragePercentLabel(0.0049), "0.0049%");
  assert.equal(formatStoragePercentLabel(0.01), "0.01%");
  assert.equal(formatStoragePercentLabel(42.5), "42.50%");
});
