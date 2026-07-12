#!/usr/bin/node
/* eslint-env node */
/* eslint-disable no-bitwise -- XOR keeps benchmark results observable. */

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

const DEFAULT_SAMPLES = 10;
const WARMUP_ITERATIONS = 5000;
const MAX_ACCEPTABLE_RSD = 5;
const ITERATIONS_BY_BENCHMARK = {
  'URL construction (absolute)': 5000,
  'URL construction (relative + base)': 10000,
  'URL.canParse (valid)': 5000,
  'URL.canParse (invalid)': 100000,
  'URL.parse': 5000,
  'URL construction (percent-encoding)': 1500,
  'URL property getters': 150000,
  'URL setters': 30000,
  'URLSearchParams parse': 20000,
  'URLSearchParams percent-heavy stringify': 400,
  'URLSearchParams manipulate + stringify': 50000,
  'URLSearchParams repeated mutation': 500000,
  'URL + searchParams roundtrip': 20000,
  // Rebuilding the URL after each append is quadratic in the reference engines.
  'URL + searchParams repeated append': 15,
};

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
// Workloads
// -----------------------------------------------------------------------------

const ABSOLUTE_URLS = [
  'https://example.com/',
  'http://user:pass@example.com:8080/path/to/resource?a=1&b=2&c=3#section',
  'https://[2001:db8::1]:443/ipv6',
  'ftp://192.168.0.1/file.txt',
  'https://example.com/a/b/c/../../d/./e/f',
  'mailto:someone@example.com',
  'https://example.com/search?q=hello+world&lang=en-US&page=42',
  'file:///C:/Users/test/file.txt',
];

const RELATIVE_URLS = [
  ['../sibling', 'https://example.com/a/b/c'],
  ['//other.com/path', 'https://example.com/'],
  ['?newquery', 'https://example.com/page'],
  ['#anchor', 'https://example.com/page?q=1'],
  ['path/file', 'https://example.com/base/'],
];

const QUERIES = [
  'a=1&b=2&c=3&d=4&e=5',
  'name=John+Doe&email=john%40example.com&msg=Hello%2C+World%21',
  'key=' + 'x'.repeat(200) + '&other=value',
  'arr=1&arr=2&arr=3&arr=4&arr=5&arr=6',
];

/**
 * Each benchmark is a factory `(URL, URLSearchParams) => () => number`. The outer
 * call may allocate fixtures once; the returned function is what gets timed.
 * Returning a value gives the timing loop something observable to consume so
 * engines cannot prove the work is unused.
 */
const BENCHMARKS = {
  'URL construction (absolute)': (URL) => () => {
    let object = null;
    for (const input of ABSOLUTE_URLS) {
      object = new URL(input);
    }
    return object.protocol.length + object.pathname.length;
  },
  'URL construction (relative + base)': (URL) => () => {
    let object = null;
    for (const [input, base] of RELATIVE_URLS) {
      object = new URL(input, base);
    }
    return object.protocol.length + object.pathname.length;
  },
  'URL.canParse (valid)': (URL) => () => {
    let valid = false;
    for (const input of ABSOLUTE_URLS) {
      valid = URL.canParse(input);
    }
    return Number(valid);
  },
  'URL.canParse (invalid)': (URL) => () =>
    Number(URL.canParse('https://[invalid-host/')),
  'URL.parse': (URL) => () => {
    let object = null;
    for (const input of ABSOLUTE_URLS) {
      object = URL.parse(input);
    }
    return object.href.length;
  },
  'URL construction (percent-encoding)': (URL) => {
    const input = `https://example.com/${'路径 😀/'.repeat(100)}`;
    return () => new URL(input).href.length;
  },
  'URL property getters': (URL) => {
    const objects = ABSOLUTE_URLS.map((input) => new URL(input));
    return () => {
      let length = 0;
      for (const object of objects) {
        length += object.href.length;
        length += object.protocol.length;
        length += object.host.length;
        length += object.hostname.length;
        length += object.pathname.length;
        length += object.search.length;
        length += object.hash.length;
        length += object.origin.length;
      }
      return length;
    };
  },
  'URL setters': (URL) => {
    const object = new URL('https://example.com/path?q=1');
    return () => {
      object.protocol = 'http:';
      object.hostname = 'test.org';
      object.port = '9090';
      object.pathname = '/new/path';
      object.search = '?a=1&b=2';
      object.hash = '#top';
      return object.href.length;
    };
  },
  'URLSearchParams parse': (URL, URLSearchParams) => () => {
    let params = null;
    for (const query of QUERIES) {
      params = new URLSearchParams(query);
    }
    return params.toString().length;
  },
  'URLSearchParams percent-heavy stringify': (URL, URLSearchParams) => {
    const params = new URLSearchParams();
    for (let index = 0; index < 100; index++) {
      params.append(`键 ${index}`, '值 😀'.repeat(10));
    }
    return () => params.toString().length;
  },
  'URLSearchParams manipulate + stringify': (URL, URLSearchParams) => () => {
    const params = new URLSearchParams('a=1&b=2&c=3');
    params.append('d', '4');
    params.set('a', 'updated');
    params.delete('b');
    params.sort();
    return params.toString().length;
  },
  'URLSearchParams repeated mutation': (URL, URLSearchParams) => {
    const query = Array.from(
      {length: 100},
      (_, index) => `key${index}=${index}`,
    ).join('&');
    const params = new URLSearchParams(query);
    return () => {
      params.set('key50', 'updated');
      params.delete('missing');
      return params.size;
    };
  },
  'URL + searchParams roundtrip': (URL, URLSearchParams) => () => {
    const url = new URL('https://example.com/search?a=1&b=2&c=3');
    url.searchParams.append('d', '4');
    url.searchParams.set('a', 'z');
    return url.href.length;
  },
  'URL + searchParams repeated append': (URL, URLSearchParams) => () => {
    const url = new URL('https://example.com/search');
    for (let index = 0; index < 100; index++) {
      url.searchParams.append(`key${index}`, `value${index}`);
    }
    return url.href.length;
  },
};

// -----------------------------------------------------------------------------
// Timing
// -----------------------------------------------------------------------------

function consume(value) {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    return value.length;
  }
  return value == null ? 0 : String(value).length;
}

function timeit(fn, iterations, samples) {
  // Warmup so the JIT has settled before we measure.
  const warmup = Math.min(iterations, WARMUP_ITERATIONS);
  let sink = 0;
  for (let i = 0; i < warmup; i++) {
    sink ^= consume(fn());
  }

  const timings = [];
  for (let run = 0; run < samples; run++) {
    const start = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
      sink ^= consume(fn());
    }
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
    timings.push(elapsedMs);
  }
  return {timings, sink};
}

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

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function stats(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return {
    median: median(values),
    min: Math.min(...values),
    max: Math.max(...values),
    rsd: mean === 0 ? 0 : (Math.sqrt(variance) / mean) * 100,
  };
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
  const result = timeit(fn, payload.iterations, payload.samples);
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

function formatRatio(ms, baselineMs) {
  if (ms === baselineMs) {
    return 'baseline';
  }
  const ratio = ms / baselineMs;
  if (ratio > 1) {
    return `${ratio.toFixed(2)}x slower`;
  }
  return `${(1 / ratio).toFixed(2)}x faster`;
}

function formatStats(result, baselineMedian) {
  const unstable = result.rsd > MAX_ACCEPTABLE_RSD ? ' !' : '';
  return `${result.median.toFixed(1)} [${result.min.toFixed(
    1,
  )}-${result.max.toFixed(1)}, ${result.rsd.toFixed(1)}%] ${formatRatio(
    result.median,
    baselineMedian,
  )}${unstable}`;
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main() {
  if (process.argv[2] === '--worker') {
    await runWorker(JSON.parse(process.argv[3]));
    return;
  }

  const samples = Number.parseInt(process.argv[2], 10) || DEFAULT_SAMPLES;
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

main();
