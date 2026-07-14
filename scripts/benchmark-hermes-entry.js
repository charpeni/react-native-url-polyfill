/* eslint-disable no-bitwise -- UTF-8 decoding uses bit masks. */

const {BENCHMARKS, timeit} = require('./benchmark-core');

const RESULT_PREFIX = '__RN_URL_BENCHMARK_RESULT__';
class TextEncoderShim {
  encode(value = '') {
    const bytes = [];
    for (const character of String(value)) {
      const point = character.codePointAt(0);
      if (point <= 0x7f) {
        bytes.push(point);
      } else if (point <= 0x7ff) {
        bytes.push(0xc0 | (point >> 6), 0x80 | (point & 0x3f));
      } else if (point <= 0xffff) {
        bytes.push(
          0xe0 | (point >> 12),
          0x80 | ((point >> 6) & 0x3f),
          0x80 | (point & 0x3f),
        );
      } else {
        bytes.push(
          0xf0 | (point >> 18),
          0x80 | ((point >> 12) & 0x3f),
          0x80 | ((point >> 6) & 0x3f),
          0x80 | (point & 0x3f),
        );
      }
    }
    return new Uint8Array(bytes);
  }
}

class TextDecoderShim {
  decode(input = new Uint8Array()) {
    let output = '';
    for (let index = 0; index < input.length; ) {
      const first = input[index++];
      let point;
      if (first <= 0x7f) {
        point = first;
      } else if (first <= 0xdf) {
        point = ((first & 0x1f) << 6) | (input[index++] & 0x3f);
      } else if (first <= 0xef) {
        point =
          ((first & 0x0f) << 12) |
          ((input[index++] & 0x3f) << 6) |
          (input[index++] & 0x3f);
      } else {
        point =
          ((first & 0x07) << 18) |
          ((input[index++] & 0x3f) << 12) |
          ((input[index++] & 0x3f) << 6) |
          (input[index++] & 0x3f);
      }
      output += String.fromCodePoint(point);
    }
    return output;
  }
}

function installHostShims() {
  if (typeof globalThis.TextEncoder === 'undefined') {
    globalThis.TextEncoder = TextEncoderShim;
  }
  if (typeof globalThis.TextDecoder === 'undefined') {
    globalThis.TextDecoder = TextDecoderShim;
  }
}

function runBenchmark(implementation, payload) {
  const probe = 'https://user:pass@example.com:8080/a/b/../c?x=1&y=2#frag';
  const expected = 'https://user:pass@example.com:8080/a/c?x=1&y=2#frag';
  const actual = new implementation.URL(probe).href;
  if (actual !== expected) {
    throw new Error(`Sanity check failed: ${actual} !== ${expected}`);
  }

  if (payload.probe) {
    const supportedBenchmarks = [];
    for (const [label, factory] of Object.entries(BENCHMARKS)) {
      try {
        factory(implementation.URL, implementation.URLSearchParams)();
        supportedBenchmarks.push(label);
      } catch {
        // Optional implementations may predate individual URL APIs.
      }
    }
    globalThis.print(RESULT_PREFIX + JSON.stringify({supportedBenchmarks}));
    return;
  }

  const factory = BENCHMARKS[payload.benchmark];
  if (!factory) {
    throw new Error(`Unknown benchmark: ${payload.benchmark}`);
  }

  const fn = factory(implementation.URL, implementation.URLSearchParams);
  const result = timeit(fn, payload.iterations, payload.samples, Date.now);
  globalThis.print(RESULT_PREFIX + JSON.stringify(result));
}

module.exports = {installHostShims, runBenchmark};
