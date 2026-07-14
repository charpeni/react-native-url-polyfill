/* eslint-disable no-bitwise -- XOR keeps benchmark results observable. */

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
  'URL + searchParams roundtrip': (URL) => () => {
    const url = new URL('https://example.com/search?a=1&b=2&c=3');
    url.searchParams.append('d', '4');
    url.searchParams.set('a', 'z');
    return url.href.length;
  },
  'URL + searchParams repeated append': (URL) => () => {
    const url = new URL('https://example.com/search');
    for (let index = 0; index < 100; index++) {
      url.searchParams.append(`key${index}`, `value${index}`);
    }
    return url.href.length;
  },
};

function consume(value) {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    return value.length;
  }
  return value == null ? 0 : String(value).length;
}

function timeit(fn, iterations, samples, now) {
  const warmup = Math.min(iterations, WARMUP_ITERATIONS);
  let sink = 0;
  for (let i = 0; i < warmup; i++) {
    sink ^= consume(fn());
  }

  const timings = [];
  for (let run = 0; run < samples; run++) {
    const start = now();
    for (let i = 0; i < iterations; i++) {
      sink ^= consume(fn());
    }
    timings.push(now() - start);
  }
  return {timings, sink};
}

function parseSamples(value) {
  if (value === undefined) {
    return DEFAULT_SAMPLES;
  }
  if (!/^\d+$/.test(value) || Number(value) < 1) {
    throw new Error(
      `Invalid sample count \`${value}\`; expected a positive integer.`,
    );
  }
  return Number(value);
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

module.exports = {
  BENCHMARKS,
  ITERATIONS_BY_BENCHMARK,
  MAX_ACCEPTABLE_RSD,
  formatStats,
  parseSamples,
  stats,
  timeit,
};
