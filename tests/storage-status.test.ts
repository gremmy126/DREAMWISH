import assert from "node:assert/strict";
import { calculateStoragePercent } from "../src/lib/storage/storage-metrics";

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
