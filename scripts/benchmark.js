#!/usr/bin/node
/* eslint-env node */
/**
 * Micro-benchmark for the `URL` / `URLSearchParams` polyfill.
 *
 * It measures this repository's default `tsdown` build (`js/URL.js`) against
 * comparable userland URL implementations.
 *
 * If `whatwg-url` or `whatwg-url-minimum` are installed, they are added as
 * extra columns so you can compare against them. They are not dependencies, so
 * run them on the side to include them:
 *
 *   npx --yes --loglevel error --package whatwg-url --package whatwg-url-minimum \
 *     -- sh -c 'NODE_PATH="${PATH%%/node_modules/.bin*}/node_modules" node scripts/benchmark.js "$@"' sh
 *
 * Usage:
 *
 *   node scripts/benchmark.js [samples]
 */

const {register} = require('node:module');
const {pathToFileURL} = require('node:url');
const {createRequire} = require('node:module');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {
  BENCHMARKS,
  ITERATIONS_BY_BENCHMARK,
  MAX_ACCEPTABLE_RSD,
  formatStats,
  parseSamples,
  stats,
  timeit,
} = require('./benchmark-core');

// Loading `js/URL.ts` (an ES module in a package without `"type": "module"`)
// triggers one-time notices from Node's module loader thread (module-syntax
// reparsing, type stripping), which a main-thread warning filter cannot
// intercept. Re-exec once with `--no-warnings` so the benchmark output stays
// clean. These are load-time notices only and do not affect any measurement.
if (!process.env.RN_URL_BENCHMARK_CHILD) {
  const result = spawnSync(
    process.execPath,
    ['--no-warnings', __filename, ...process.argv.slice(2)],
    {stdio: 'inherit', env: {...process.env, RN_URL_BENCHMARK_CHILD: '1'}},
  );
  process.exit(result.status ?? 0);
}

// `js/URL.ts` is authored as an ES module and imports `react-native` (only for
// `NativeModules`, used by the blob helpers). Node has no such module, so we
// register a resolve hook that stubs it out. This lets us benchmark the actual
// committed file with no source transformation.
const stubLoader = `
  export async function resolve(specifier, context, next) {
    if (specifier === 'react-native') {
      return {
        url: 'data:text/javascript,export const NativeModules = {};',
        shortCircuit: true,
      };
    }
    return next(specifier, context);
  }
`;
register(
  'data:text/javascript,' + encodeURIComponent(stubLoader),
  pathToFileURL('./'),
);

const ROOT = path.resolve(__dirname, '..');
const PACKAGE_JSON = require(path.join(ROOT, 'package.json'));
const POLYFILL_PATH = fs.existsSync(path.join(ROOT, 'js/URL.js'))
  ? path.join(ROOT, 'js/URL.js')
  : path.join(ROOT, 'js/URL.ts');

// -----------------------------------------------------------------------------
// Engines under test
// -----------------------------------------------------------------------------

async function loadEngines({quiet = false} = {}) {
  const engines = [];

  const builtPolyfill = await import(pathToFileURL(POLYFILL_PATH).href);
  engines.push({
    label: 'react-native-url-polyfill',
    name: 'react-native-url-polyfill',
    version: PACKAGE_JSON.version,
    URL: builtPolyfill.URL,
    URLSearchParams: builtPolyfill.URLSearchParams,
    isBaseline: true,
  });

  const require2 = createRequire(path.join(ROOT, 'package.json'));
  for (const {packageName, installName, label} of [
    {
      packageName: 'whatwg-url',
      installName: 'whatwg-url',
      label: 'whatwg-url',
    },
    {
      packageName: 'whatwg-url-minimum',
      installName: 'whatwg-url-minimum',
      label: '(Expo) whatwg-url-minimum',
    },
  ]) {
    try {
      const competitor = loadOptionalPackage(require2, packageName);
      engines.push({
        label,
        name: packageName,
        version: loadOptionalPackageVersion(require2, packageName),
        URL: competitor.URL,
        URLSearchParams: competitor.URLSearchParams,
      });
    } catch {
      if (!quiet) {
        console.log(
          `Note: \`${packageName}\` is not installed, so it is excluded. ` +
            'To include it:\n\n' +
            `      npx --yes --loglevel error --package ${installName} ` +
            '-- sh -c ' +
            '\'NODE_PATH="${PATH%%/node_modules/.bin*}/node_modules" ' +
            'node scripts/benchmark.js "$@"\' sh\n',
        );
      }
    }
  }

  return engines;
}

function loadOptionalPackageVersion(require2, packageName) {
  try {
    return loadOptionalPackage(require2, `${packageName}/package.json`).version;
  } catch {
    return 'unknown';
  }
}

function loadOptionalPackage(require2, packageName) {
  try {
    return require2(packageName);
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') {
      throw error;
    }
  }

  const nodePath = process.env.NODE_PATH;
  if (!nodePath) {
    return require2(packageName);
  }

  const paths = nodePath.split(path.delimiter).filter(Boolean);
  const resolved = require2.resolve(packageName, {paths});
  return require2(resolved);
}

async function runWorker(payload) {
  const engines = await loadEngines({quiet: true});
  const engine = engines.find(
    (candidate) => candidate.label === payload.engine,
  );
  const factory = BENCHMARKS[payload.benchmark];
  if (!engine || !factory) {
    throw new Error('Invalid benchmark worker payload');
  }
  const fn = factory(engine.URL, engine.URLSearchParams);
  const result = timeit(
    fn,
    payload.iterations,
    payload.samples,
    () => Number(process.hrtime.bigint()) / 1e6,
  );
  process.stdout.write(JSON.stringify(result));
}

function runInWorker(engine, benchmark, iterations, samples) {
  const result = spawnSync(
    process.execPath,
    [
      '--no-warnings',
      __filename,
      '--worker',
      JSON.stringify({
        engine: engine.label,
        benchmark,
        iterations,
        samples,
      }),
    ],
    {
      encoding: 'utf8',
      env: {...process.env, RN_URL_BENCHMARK_CHILD: '1'},
    },
  );
  if (result.status !== 0) {
    throw new Error(
      result.stderr || result.stdout || 'Benchmark worker failed',
    );
  }
  return JSON.parse(result.stdout);
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main() {
  if (process.argv[2] === '--worker') {
    await runWorker(JSON.parse(process.argv[3]));
    return;
  }

  const samples = parseSamples(process.argv[2]);
  const engines = await loadEngines();

  // Sanity check: the polyfill must agree with the reference on a representative
  // URL, otherwise the columns are not measuring equivalent work.
  const probe = 'https://user:pass@example.com:8080/a/b/../c?x=1&y=2#frag';
  const reference = new (require('node:url').URL)(probe).href;
  const polyfillHref = new engines[0].URL(probe).href;
  if (polyfillHref !== reference) {
    console.error(
      `Sanity check failed: polyfill href ${polyfillHref} !== ${reference}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `\nBenchmark: median-of-${samples}, fixed iterations per operation`,
  );
  console.log(
    '(each operation uses the fixed count shown in its row; lower is faster)',
  );
  console.log(
    '(each engine/operation is measured in an isolated worker process; ' +
      'cells show median ms [min-max, relative standard deviation])\n',
  );

  const nameColumn = 54;
  const numberColumn = 38;

  let header = 'Operation (iterations)'.padEnd(nameColumn);
  for (const engine of engines) {
    header += `  ${`${engine.label}@${engine.version} (ms)`.padEnd(
      numberColumn,
    )}`;
  }
  console.log(header);
  console.log('-'.repeat(header.length));

  const highlySkewedRows = [];
  let operationIndex = 0;
  for (const label of Object.keys(BENCHMARKS)) {
    const iterations = ITERATIONS_BY_BENCHMARK[label];
    let row = `${label} (${iterations.toLocaleString()})`.padEnd(nameColumn);
    const rowResults = new Array(engines.length);
    const offset = operationIndex % engines.length;
    const orderedEngines = engines
      .slice(offset)
      .concat(engines.slice(0, offset));

    for (const engine of orderedEngines) {
      const index = engines.indexOf(engine);
      const measurement = runInWorker(engine, label, iterations, samples);
      const result = stats(measurement.timings);
      rowResults[index] = result;
    }

    rowResults.forEach((result) => {
      row += `  ${formatStats(result, rowResults[0].median).padEnd(
        numberColumn,
      )}`;
    });
    console.log(row);
    if (
      rowResults.some((result) => result.median / rowResults[0].median >= 100)
    ) {
      highlySkewedRows.push({label, iterations, results: rowResults});
    }
    operationIndex++;
  }

  console.log('-'.repeat(header.length));
  console.log(`! indicates RSD above ${MAX_ACCEPTABLE_RSD}%.`);
  if (highlySkewedRows.length > 0) {
    console.log('\nPer-operation medians for highly skewed rows (us/op):');
    for (const {label, iterations, results} of highlySkewedRows) {
      console.log(
        `${label}: ${results
          .map((result) => ((result.median * 1000) / iterations).toFixed(3))
          .join(' / ')}`,
      );
    }
  }
  console.log(
    '\nNote: each operation uses one fixed iteration count shared by all ' +
      'engines, so cells are directly comparable within a row.',
  );
  console.log('');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
