import assert from "node:assert/strict";
import { calculateStoragePercent } from "../src/lib/storage/storage-metrics";

test("calculateStoragePercent shows non-zero usage below one percent accurately", () => {
  assert.deepEqual(calculateStoragePercent(512, 1024 * 1024), {
    label: "<1%",
    widthPercent: 1
  });
});

test("calculateStoragePercent shows zero only when storage is empty", () => {
  assert.deepEqual(calculateStoragePercent(0, 1024 * 1024), {
    label: "0%",
    widthPercent: 0
  });
});
