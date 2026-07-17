import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("sucrase/register/ts");

const moduleLoader = require("node:module");
const originalResolve = moduleLoader._resolveFilename;
moduleLoader._resolveFilename = function resolveProjectAlias(request, parent, isMain, options) {
  const mapped = request.startsWith("@/") ? path.join(process.cwd(), request.slice(2)) : request;
  return originalResolve.call(this, mapped, parent, isMain, options);
};

const { createAutomationWorker } = require(path.join(process.cwd(), "src/lib/automation/queue/worker-entry.ts"));
const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => controller.abort());

createAutomationWorker()
  .run(controller.signal)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[automation-worker] stopped", error);
    process.exit(1);
  });
