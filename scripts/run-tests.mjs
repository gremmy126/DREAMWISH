import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("sucrase/register/ts");

const tests = [];

globalThis.test = (name, fn) => {
  tests.push({ name, fn });
};

function findTestFiles(dir) {
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return findTestFiles(fullPath);
      return entry.isFile() && entry.name.endsWith(".test.ts") ? [fullPath] : [];
    })
    .sort();
}

for (const file of findTestFiles(path.join(process.cwd(), "tests"))) {
  require(file);
}

let failed = 0;

for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok - ${name}`);
    console.error(error);
  }
}

if (failed > 0) {
  console.error(`${failed} test(s) failed.`);
  process.exit(1);
}

console.log(`${tests.length} test(s) passed.`);
