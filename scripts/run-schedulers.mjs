// One-shot scheduler entrypoint for the scheduler-cron Railway service.
//
// This script is invoked by `npm run cron:schedulers` on a recurring cron
// schedule (see railway.cron.toml). It performs a single bounded pass of any
// scheduled maintenance work and then exits, rather than running as a
// long-lived process.
//
// Keep this script side-effect free by default so the cron service can start
// and complete successfully even before dedicated scheduled jobs are wired
// in. Add real scheduler tasks below as they are implemented.

async function runSchedulersOnce() {
  const startedAt = new Date().toISOString();
  console.log(`[cron:schedulers] run started at ${startedAt}`);

  // Scheduled maintenance tasks are registered here as they are implemented
  // (for example: expiring stale leases, retention cleanup, recovering
  // interrupted jobs). Each task should be independently bounded and should
  // not throw for expected/no-op conditions.
  const tasks = [];

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
