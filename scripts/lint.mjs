import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const tscEntry = path.join(process.cwd(), "node_modules", "typescript", "bin", "tsc");
const tsc = spawnSync(process.execPath, [tscEntry, "--noEmit"], {
  cwd: process.cwd(),
  stdio: "inherit",
  shell: false
});

if (tsc.error) {
  console.error(tsc.error);
  process.exit(1);
}

if (tsc.status !== 0) {
  process.exit(tsc.status ?? 1);
}

const roots = ["app", "components", "src"];
const bannedPatterns = [
  {
    pattern: /dangerouslySetInnerHTML/g,
    message: "Do not render external/search HTML with dangerouslySetInnerHTML."
  },
  {
    pattern: /\[\^\\x00-\\x7F\]/g,
    message: "Do not strip non-ASCII characters; multilingual text must be preserved."
  },
  {
    pattern: /[�占濡硫沃]/g,
    message: "Possible mojibake or replacement character detected."
  }
];

const directJsonBodyRoutes = [
  path.normalize("app/api/local/context/query/route.ts"),
  path.normalize("app/api/local/search/hybrid/route.ts"),
  path.normalize("app/api/ai/web-answer/route.ts"),
  path.normalize("app/api/tools/web-search/route.ts"),
  path.normalize("app/api/ai/chat/route.ts"),
  path.normalize("app/api/ai/chat/stream/route.ts")
];

const failures = [];

for (const root of roots) {
  scanDirectory(path.join(process.cwd(), root));
}

for (const route of directJsonBodyRoutes) {
  const filePath = path.join(process.cwd(), route);
  if (!fs.existsSync(filePath)) continue;
  const source = fs.readFileSync(filePath, "utf8");
  if (/await\s+request\.json\s*\(/.test(source)) {
    failures.push(`${route}: use a safe one-read JSON body parser instead of direct request.json().`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log("lint passed");

function scanDirectory(dir) {
  if (!fs.existsSync(dir)) return;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      scanDirectory(fullPath);
      continue;
    }

    if (!/\.(ts|tsx|js|jsx|json|css|md)$/.test(entry.name)) continue;
    const source = fs.readFileSync(fullPath, "utf8");
    const relativePath = path.relative(process.cwd(), fullPath);

    for (const { pattern, message } of bannedPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(source)) {
        failures.push(`${relativePath}: ${message}`);
      }
    }
  }
}
