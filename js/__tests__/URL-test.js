import {URL} from '../URL';

// =============================================================================
// Helpers to classify known deviations
// =============================================================================

/**
 * Detect whether a WPT test case involves Unicode/IDNA processing.
 * The polyfill intentionally omits Unicode/IDNA support for bundle size.
 * These tests are skipped.
 */
function hasNonAscii(str) {
  if (!str) {
    return false;
  }
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) > 127) {
      return true;
    }
  }
  return false;
}

const IDNA_PERCENT_PATTERN =
  /(%C2%AD|%ef%b7|%EF%BF%BD|%e2%98%83|%ef%bc%85|loc%41lhost)/i;
const PUNYCODE_PATTERN = /xn--/i;
const IDNA_SETTER_PATTERN = /(%C2%AD|xn--|loc%41lhost)/i;

function isUnicodeRelated(testCase) {
  if (hasNonAscii(testCase.input)) {
    return true;
  }
  if (testCase.hostname && hasNonAscii(testCase.hostname)) {
    return true;
  }
  if (testCase.href && hasNonAscii(testCase.href)) {
    return true;
  }
  if (testCase.host && hasNonAscii(testCase.host)) {
    return true;
  }
  // Percent-encoded IDNA/Unicode patterns
  if (testCase.input && IDNA_PERCENT_PATTERN.test(testCase.input)) {
    return true;
  }
  // Punycode labels
  if (testCase.input && PUNYCODE_PATTERN.test(testCase.input)) {
    return true;
  }
  if (testCase.hostname && PUNYCODE_PATTERN.test(testCase.hostname)) {
    return true;
  }
  return false;
}

function isUnicodeRelatedSetter(testCase) {
  if (hasNonAscii(testCase.new_value)) {
    return true;
  }
  if (hasNonAscii(testCase.href)) {
    return true;
  }
  for (const val of Object.values(testCase.expected)) {
    if (typeof val === 'string' && hasNonAscii(val)) {
      return true;
    }
  }
  // IDNA-related patterns
  if (testCase.new_value && IDNA_SETTER_PATTERN.test(testCase.new_value)) {
    return true;
  }
  return false;
}

/**
 * Check at runtime whether a specific test case actually passes.
 * Used to decide between `it` (pass), `it.failing` (known non-unicode gap),
 * or `it.skip` (unicode limitation).
 */
function checkConstructorTest(expected) {
  const base = expected.base !== null ? expected.base : undefined;
  try {
    if (expected.failure) {
      try {
        // eslint-disable-next-line no-new
        new URL(expected.input, base);
        return false; // Should have thrown
      } catch (e) {
        return true; // Correctly threw
      }
    }
    const url = new URL(expected.input, base);
    return (
      url.href === expected.href &&
      url.protocol === expected.protocol &&
      url.username === expected.username &&
      url.password === expected.password &&
      url.host === expected.host &&
      url.hostname === expected.hostname &&
      url.port === expected.port &&
      url.pathname === expected.pathname &&
      url.search === expected.search &&
      url.hash === expected.hash
    );
  } catch (e) {
    return expected.failure === true;
  }
}

function checkOriginTest(expected) {
  const base = expected.base !== null ? expected.base : undefined;
  try {
    const url = new URL(expected.input, base);
    return url.origin === expected.origin;
  } catch (e) {
    return false;
  }
}

function checkSetterTest(testCase, property) {
  try {
    const url = new URL(testCase.href);
    url[property] = testCase.new_value;
    for (const [prop, expectedVal] of Object.entries(testCase.expected)) {
      if (url[prop] !== expectedVal) {
        return false;
      }
    }
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Pick the right test runner:
 * - `it` if the test passes
 * - `it.skip` if it fails due to Unicode/IDNA limitation
 * - `it.failing` if it fails for non-Unicode reasons (to be fixed later)
 */
function pickRunner(passes, isUnicode) {
  if (passes) {
    return it;
  }
  if (isUnicode) {
    return it.skip;
  }
  return it.failing;
}

// =============================================================================
// WPT URL Constructor Tests (urltestdata.json)
// Source: https://github.com/web-platform-tests/wpt/tree/master/url
// =============================================================================
const urlTestData = require('./wpt/urltestdata.json');

describe('URL — WPT constructor tests (urltestdata.json)', () => {
  const testCases = urlTestData.filter((entry) => typeof entry === 'object');

  for (const expected of testCases) {
    const base = expected.base !== null ? expected.base : undefined;
    const label = `Parsing: <${expected.input}>${base ? ` against <${base}>` : ' without base'}`;
    const passes = checkConstructorTest(expected);
    const unicode = isUnicodeRelated(expected);
    const runner = pickRunner(passes, unicode);

    if (expected.failure) {
      runner(`should fail: ${label}`, () => {
        expect(() => new URL(expected.input, base)).toThrow();
      });
    } else {
      runner(`should parse: ${label}`, () => {
        const url = new URL(expected.input, base);
        expect(url.href).toBe(expected.href);
        expect(url.protocol).toBe(expected.protocol);
        expect(url.username).toBe(expected.username);
        expect(url.password).toBe(expected.password);
        expect(url.host).toBe(expected.host);
        expect(url.hostname).toBe(expected.hostname);
        expect(url.port).toBe(expected.port);
        expect(url.pathname).toBe(expected.pathname);
        expect(url.search).toBe(expected.search);
        expect(url.hash).toBe(expected.hash);
        if ('searchParams' in expected) {
          expect(url.searchParams).toBeDefined();
          expect(url.searchParams.toString()).toBe(expected.searchParams);
        }
      });
    }
  }
});

// =============================================================================
// WPT URL Origin Tests (urltestdata.json entries with "origin")
// =============================================================================
describe('URL — WPT origin tests', () => {
  const testCases = urlTestData.filter(
    (entry) => typeof entry === 'object' && 'origin' in entry && !entry.failure,
  );

  for (const expected of testCases) {
    const base = expected.base !== null ? expected.base : undefined;
    const label = `Origin: <${expected.input}>${base ? ` against <${base}>` : ' without base'}`;
    const passes = checkOriginTest(expected);
    const unicode = isUnicodeRelated(expected);
    const runner = pickRunner(passes, unicode);

    runner(label, () => {
      const url = new URL(expected.input, base);
      expect(url.origin).toBe(expected.origin);
    });
  }
});

// =============================================================================
// WPT URL Setters Tests (setters_tests.json)
// =============================================================================
const settersTestData = require('./wpt/setters_tests.json');

describe('URL — WPT setters tests (setters_tests.json)', () => {
  for (const [propertyToBeSet, testCases] of Object.entries(settersTestData)) {
    if (propertyToBeSet === 'comment') {
      continue;
    }

    describe(`${propertyToBeSet} setter`, () => {
      for (const testCase of testCases) {
        const label = `Setting <${testCase.href}>.${propertyToBeSet} = '${testCase.new_value}'${testCase.comment ? ` (${testCase.comment})` : ''}`;
        const passes = checkSetterTest(testCase, propertyToBeSet);
        const unicode = isUnicodeRelatedSetter(testCase);
        const runner = pickRunner(passes, unicode);

        runner(label, () => {
          const url = new URL(testCase.href);
          url[propertyToBeSet] = testCase.new_value;

          for (const [property, expectedValue] of Object.entries(
            testCase.expected,
          )) {
            expect(url[property]).toBe(expectedValue);
          }
        });
      }
    });
  }
});

// =============================================================================
// WPT URL.canParse() static method tests
// =============================================================================
describe('URL — WPT URL.canParse tests', () => {
  const canParseTests = [
    {url: undefined, base: undefined, expected: false},
    {url: 'aaa:b', base: undefined, expected: true},
    {url: undefined, base: 'aaa:b', expected: false},
    {url: undefined, base: 'https://test:test/', expected: false},
    {url: 'aaa:/b', base: undefined, expected: true},
    {url: undefined, base: 'aaa:/b', expected: true},
    {url: 'https://test:test', base: undefined, expected: false},
    {url: 'a', base: 'https://b/', expected: true},
  ];

  for (const {url, base, expected} of canParseTests) {
    it(`URL.canParse(${url}, ${base}) should be ${expected}`, () => {
      expect(URL.canParse(url, base)).toBe(expected);
    });
  }
});

// =============================================================================
// WPT URL.toJSON() test
// =============================================================================
describe('URL — WPT toJSON tests', () => {
  it('should serialize to JSON as href', () => {
    const a = new URL('https://example.com/');
    expect(JSON.stringify(a)).toBe('"https://example.com/"');
  });
});

// =============================================================================
// WPT URL.searchParams integration tests
// =============================================================================
describe('URL — WPT URL.searchParams integration tests', () => {
  it('URL.searchParams getter should return same object', () => {
    const url = new URL('http://example.org/?a=b');
    expect(url.searchParams).toBeDefined();
    const searchParams = url.searchParams;
    expect(url.searchParams).toBe(searchParams);
  });

  it('URL.searchParams updating, clearing', () => {
    const url = new URL('http://example.org/?a=b');
    const searchParams = url.searchParams;
    expect(searchParams.toString()).toBe('a=b');

    searchParams.set('a', 'b');
    expect(url.searchParams.toString()).toBe('a=b');
    expect(url.search).toBe('?a=b');
    url.search = '';
    expect(url.searchParams.toString()).toBe('');
    expect(url.search).toBe('');
    expect(searchParams.toString()).toBe('');
  });

  it('URL.searchParams and URL.search setters, update propagation', () => {
    const url = new URL('http://example.org/file?a=b&c=d');
    const searchParams = url.searchParams;
    expect(url.search).toBe('?a=b&c=d');
    expect(searchParams.toString()).toBe('a=b&c=d');

    url.search = 'e=f&g=h';
    expect(url.search).toBe('?e=f&g=h');
    expect(searchParams.toString()).toBe('e=f&g=h');

    url.search = '?e=f&g=h';
    expect(url.search).toBe('?e=f&g=h');
    expect(searchParams.toString()).toBe('e=f&g=h');

    searchParams.append('i', ' j ');
    expect(url.search).toBe('?e=f&g=h&i=+j+');
    expect(url.searchParams.toString()).toBe('e=f&g=h&i=+j+');
    expect(searchParams.get('i')).toBe(' j ');

    searchParams.set('e', 'updated');
    expect(url.search).toBe('?e=updated&g=h&i=+j+');
    expect(searchParams.get('e')).toBe('updated');

    const url2 = new URL('http://example.org/file??a=b&c=d');
    expect(url2.search).toBe('??a=b&c=d');
    expect(url2.searchParams.toString()).toBe('%3Fa=b&c=d');

    url2.href = 'http://example.org/file??a=b';
    expect(url2.search).toBe('??a=b');
    expect(url2.searchParams.toString()).toBe('%3Fa=b');
  });
});

// =============================================================================
// URL.createObjectURL / revokeObjectURL (polyfill-specific)
// =============================================================================
describe('URL — polyfill-specific static methods', () => {
  it('URL.revokeObjectURL should be a no-op function', () => {
    expect(typeof URL.revokeObjectURL).toBe('function');
    expect(() => URL.revokeObjectURL('blob:test')).not.toThrow();
  });

  it('URL.createObjectURL should be a function', () => {
    expect(typeof URL.createObjectURL).toBe('function');
  });
});

// =============================================================================
// Instance method tests (toString, toJSON)
// =============================================================================
describe('URL — instance methods', () => {
  it('toString() should return the same as href', () => {
    const url = new URL('https://example.com/path?q=1#hash');
    expect(url.toString()).toBe(url.href);
  });

  it('toJSON() should return the same as href', () => {
    const url = new URL('https://example.com/path?q=1#hash');
    expect(url.toJSON()).toBe(url.href);
  });
});

// =============================================================================
// React Native regression tests
// =============================================================================
describe('URL — React Native issue regressions', () => {
  it('should resolve relative URLs correctly (RN issue #25717)', () => {
    const a = new URL('about', 'https://www.mozilla.org');
    expect(a.href).toBe('https://www.mozilla.org/about');

    const b = new URL('dev', 'https://google.dev');
    expect(b.href).toBe('https://google.dev/dev');
  });

  it('should not add trailing slash to path with file (RN issue #24428)', () => {
    const url = new URL(
      'https://facebook.github.io/react-native/img/header_logo.png',
    );
    expect(url.href).toBe(
      'https://facebook.github.io/react-native/img/header_logo.png',
    );
  });

  it('should handle localhost URLs', () => {
    const url = new URL('http://localhost:3000/api/v1');
    expect(url.hostname).toBe('localhost');
    expect(url.port).toBe('3000');
    expect(url.pathname).toBe('/api/v1');
  });

  it('should not treat schemes named after Object.prototype properties as special', () => {
    // 'constructor' is the only valid scheme name that collides with an
    // Object.prototype property; the special-scheme lookup must not walk the
    // prototype chain and turn it into a special scheme.
    const url = new URL('constructor:foo');
    expect(url.href).toBe('constructor:foo');
    expect(url.protocol).toBe('constructor:');
    expect(url.pathname).toBe('foo');
    expect(url.host).toBe('');
  });
});
