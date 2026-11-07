// lage.config.js
const os = require('os');
const { loadOptionalCodegraph } = require('./scripts/detect-codegraph.cjs');

// Tokless/CodeGraph is optional. Lage's native graph and cache remain authoritative.
const optionalCodegraph = loadOptionalCodegraph();
if (process.env.LAGE_CODEGRAPH_VERBOSE === '1') {
  process.stderr.write(`[Lage] optional codegraph: ${optionalCodegraph.status}\n`);
}

const cpuCount = os.cpus().length;
// Leave 2 threads free for system/IDE on multi-core machines, minimum of 1.
// Ignore malformed, zero, and negative overrides so Lage always receives a valid value.
const requestedConcurrency = Number(process.env.LAGE_CONCURRENCY);
const concurrency = Number.isInteger(requestedConcurrency) && requestedConcurrency > 0
  ? requestedConcurrency
  : Math.max(1, cpuCount - 2);

const isProduction = process.env.NODE_ENV === 'production';

module.exports = {
  pipeline: {
    build: {
      type: "worker",
      options: {
        script: require.resolve("./lage-worker.js")
      },
      dependsOn: ["^build"],
      outputs: ["dist/**", "lib/**"]
    },
    dev: {
      type: "npmScript",
      dependsOn: isProduction ? ["^build"] : []
    },
    test: {
      type: "worker",
      options: {
        script: require.resolve("./lage-worker.js")
      },
      dependsOn: ["build"],
      // Tests use Redis/Postgres/Phase-backed state and must never be replayed.
      cache: false
    },
    "test:ci": {
      type: "npmScript",
      dependsOn: ["build"],
      // CI tests exercise external services and are intentionally non-cacheable.
      cache: false
    },
    "check-types": {
      type: "worker",
      options: {
        script: require.resolve("./lage-worker.js")
      },
      // Type checks consume generated declarations from dependency builds.
      dependsOn: ["^build"],
      outputs: [
        "dist/**/*.d.ts",
        "dist/**/*.d.ts.map",
        "node_modules/.cache/typescript/**",
        "node_modules/.tmp/tsconfig.node/**"
      ]
    }
  },
  concurrency,
  loggerOptions: {
    // Suppress multi-thread telemetry and progress bars on cache hits.
    reporter: "npmLog",
  },
};
