#!/usr/bin/node
/* eslint-env node */
/* eslint-disable no-void -- `void expr` forces getter reads to run without
   letting the engine optimize the discarded result away. */

/**
 * Micro-benchmark for the `URL` / `URLSearchParams` polyfill.
 *
 * It always measures this repository's implementation (`js/URL.ts`, executed
 * directly through Node's type stripping — the source is restricted to
 * erasable TypeScript syntax) against Node's built-in `URL` as a stable,
 * always-available reference baseline.
 *
 * If `whatwg-url-without-unicode` (the package this polyfill replaced) is
 * installed, it is added as an extra column so you can reproduce the
 * old-vs-new comparison. It is no longer a dependency, so install it on the
 * side to include it:
 *
 *   npm install --no-save whatwg-url-without-unicode@8.0.0-3
 *   node scripts/benchmark.js
 *
 * Usage:
 *
 *   node scripts/benchmark.js [iterations]
 */

const {register} = require('node:module');
const {pathToFileURL} = require('node:url');
const {createRequire} = require('node:module');
const {spawnSync} = require('node:child_process');
const path = require('node:path');

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
 * Each benchmark is a factory `(URL, URLSearchParams) => () => void`. The outer
 * call may allocate fixtures once; the returned function is what gets timed.
 */
const BENCHMARKS = {
  'URL construction (absolute)': (URL) => () => {
    for (const input of ABSOLUTE_URLS) {
      // eslint-disable-next-line no-new
      new URL(input);
    }
  },
  'URL construction (relative + base)': (URL) => () => {
    for (const [input, base] of RELATIVE_URLS) {
      // eslint-disable-next-line no-new
      new URL(input, base);
    }
  },
  'URL property getters': (URL) => {
    const objects = ABSOLUTE_URLS.map((input) => new URL(input));
    return () => {
      for (const object of objects) {
        void object.href;
        void object.protocol;
        void object.host;
        void object.hostname;
        void object.pathname;
        void object.search;
        void object.hash;
        void object.origin;
      }
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
    };
  },
  'URLSearchParams parse': (URL, URLSearchParams) => () => {
    for (const query of QUERIES) {
      // eslint-disable-next-line no-new
      new URLSearchParams(query);
    }
  },
  'URLSearchParams manipulate + stringify': (URL, URLSearchParams) => () => {
    const params = new URLSearchParams('a=1&b=2&c=3');
    params.append('d', '4');
    params.set('a', 'updated');
    params.delete('b');
    params.sort();
    void params.toString();
  },
  'URL + searchParams roundtrip': (URL, URLSearchParams) => () => {
    const url = new URL('https://example.com/search?a=1&b=2&c=3');
    url.searchParams.append('d', '4');
    url.searchParams.set('a', 'z');
    void url.href;
  },
};

// -----------------------------------------------------------------------------
// Timing
// -----------------------------------------------------------------------------

function timeit(fn, iterations) {
  // Warmup so the JIT has settled before we measure.
  const warmup = Math.min(iterations, 5000);
  for (let i = 0; i < warmup; i++) {
    fn();
  }

  let best = Infinity;
  for (let run = 0; run < 5; run++) {
    const start = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
      fn();
    }
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
    if (elapsedMs < best) {
      best = elapsedMs;
    }
  }
  return best; // best-of-5, in milliseconds
}

// -----------------------------------------------------------------------------
// Engines under test
// -----------------------------------------------------------------------------

async function loadEngines() {
  const engines = [];

  const polyfill = await import(
    pathToFileURL(path.join(ROOT, 'js/URL.ts')).href
  );
  engines.push({
    label: 'polyfill',
    name: 'this polyfill (js/URL.ts)',
    URL: polyfill.URL,
    URLSearchParams: polyfill.URLSearchParams,
    isBaseline: true,
  });

  const nodeUrl = require('node:url');
  engines.push({
    label: 'node',
    name: "Node's built-in URL",
    URL: nodeUrl.URL,
    URLSearchParams: nodeUrl.URLSearchParams,
  });

  try {
    const require2 = createRequire(path.join(ROOT, 'package.json'));
    const old = require2('whatwg-url-without-unicode');
    engines.push({
      label: 'whatwg-url',
      name: 'whatwg-url-without-unicode',
      URL: old.URL,
      URLSearchParams: old.URLSearchParams,
    });
  } catch {
    console.log(
      'Note: `whatwg-url-without-unicode` is not installed, so the old ' +
        'implementation is\n' +
        '      excluded. To include it:\n\n' +
        '      npm install --no-save whatwg-url-without-unicode@8.0.0-3\n',
    );
  }

  return engines;
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main() {
  const iterations = Number.parseInt(process.argv[2], 10) || 50000;
  const engines = await loadEngines();

  // Sanity check: the polyfill must agree with the reference on a representative
  // URL, otherwise the columns are not measuring equivalent work.
  const probe = 'https://user:pass@example.com:8080/a/b/../c?x=1&y=2#frag';
  const reference = new engines[1].URL(probe).href;
  const polyfillHref = new engines[0].URL(probe).href;
  if (polyfillHref !== reference) {
    console.error(
      `Sanity check failed: polyfill href ${polyfillHref} !== ${reference}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `\nBenchmark: best-of-5, ${iterations.toLocaleString()} iterations each`,
  );
  console.log(
    '(each iteration processes the full input set for that operation; ' +
      'lower is faster)\n',
  );

  console.log('Columns:');
  for (const engine of engines) {
    console.log(`  ${engine.label.padEnd(12)} ${engine.name}`);
  }
  console.log('');

  const nameColumn = 40;
  const numberColumn = 16;

  let header = 'Operation'.padEnd(nameColumn);
  for (const engine of engines) {
    header += `${engine.label} (ms)`.padStart(numberColumn);
  }
  console.log(header);
  console.log('-'.repeat(header.length));

  const totals = engines.map(() => 0);

  for (const [label, factory] of Object.entries(BENCHMARKS)) {
    let row = label.padEnd(nameColumn);
    engines.forEach((engine, index) => {
      const fn = factory(engine.URL, engine.URLSearchParams);
      const ms = timeit(fn, iterations);
      totals[index] += ms;
      row += ms.toFixed(1).padStart(numberColumn);
    });
    console.log(row);
  }

  console.log('-'.repeat(header.length));
  let totalRow = 'total'.padEnd(nameColumn);
  for (const total of totals) {
    totalRow += total.toFixed(1).padStart(numberColumn);
  }
  console.log(totalRow);

  // Speedup summary relative to the polyfill.
  console.log('\nSpeedup vs polyfill (>1 means the polyfill is faster):');
  const polyfillTotal = totals[0];
  engines.forEach((engine, index) => {
    if (engine.isBaseline) {
      return;
    }
    const ratio = totals[index] / polyfillTotal;
    const verdict =
      ratio > 1
        ? `${ratio.toFixed(2)}x slower`
        : `${(1 / ratio).toFixed(2)}x faster`;
    console.log(`  ${engine.name.padEnd(30)} ${verdict} than the polyfill`);
  });
  console.log('');
}

main();
