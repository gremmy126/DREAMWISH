// One-shot scheduler entrypoint for the scheduler-cron Railway service.
//
// This script is invoked by `npm run cron:schedulers` on a recurring cron
// schedule (see railway.cron.toml). It performs a single bounded pass of any
// scheduled maintenance work and then exits, rather than running as a
// long-lived process.
//
// NOTE: file-based stores (DATA_DIR) are per-service on Railway. The deep
// research maintenance below is fully effective when this script runs on the
// same filesystem as the web service (local single-host deployments); on a
// separate cron service it safely no-ops against an empty store. The web
// service also performs the same recovery lazily on every research API call,
// so cron is a defense-in-depth pass, not the only recovery path.

import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("sucrase/register/ts");

function requireProjectModule(relativePath) {
  const moduleLoader = require("node:module");
  const originalResolve = moduleLoader._resolveFilename;
  moduleLoader._resolveFilename = function resolveProjectAlias(request, parent, isMain, options) {
    const mapped = request.startsWith("@/") ? path.join(process.cwd(), request.slice(2)) : request;
    return originalResolve.call(this, mapped, parent, isMain, options);
  };
  try {
    return require(path.join(process.cwd(), relativePath));
  } finally {
    moduleLoader._resolveFilename = originalResolve;
  }
}

async function recoverStalledDeepResearchJobs() {
  const repository = requireProjectModule("src/lib/deep-research/deep-research.repository.ts");
  const recovered = await repository.recoverStaleResearchJobs({});
  console.log(`[cron:schedulers] deep-research: recovered ${recovered} stalled job(s) to paused`);
}

async function cleanupExpiredDeepResearchJobs() {
  const repository = requireProjectModule("src/lib/deep-research/deep-research.repository.ts");
  const removed = await repository.cleanupOldResearchJobs();
  console.log(`[cron:schedulers] deep-research: removed ${removed} expired job(s)`);
}

async function runDueAutomationScenarios() {
  const scheduler = requireProjectModule("src/lib/automation/scenario-scheduler.ts");
  const summary = await scheduler.runDueScenarios();
  console.log(
    `[cron:schedulers] automation: checked ${summary.checked}, executed ${summary.executed}, failures ${summary.failures}`
  );
}

async function runSchedulersOnce() {
  const startedAt = new Date().toISOString();
  console.log(`[cron:schedulers] run started at ${startedAt}`);

  // Each task must be independently bounded and must not throw for
  // expected/no-op conditions.
  const tasks = [
    recoverStalledDeepResearchJobs,
    cleanupExpiredDeepResearchJobs,
    runDueAutomationScenarios
  ];

  const results = await Promise.allSettled(tasks.map((task) => task()));
  const failures = results.filter((result) => result.status === "rejected");

  for (const failure of failures) {
    console.error("[cron:schedulers] task failed", failure.reason);
  }

  const finishedAt = new Date().toISOString();
  console.log(`[cron:schedulers] run finished at ${finishedAt} (${tasks.length} task(s), ${failures.length} failure(s))`);

  return failures.length === 0;
}

runSchedulersOnce()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error("[cron:schedulers] run failed", error);
    process.exit(1);
  });
