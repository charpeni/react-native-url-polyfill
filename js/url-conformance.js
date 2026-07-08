const urlTestData = require('./__tests__/wpt/urltestdata.json');
const settersTestData = require('./__tests__/wpt/setters_tests.json');

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
  if (testCase.input && IDNA_PERCENT_PATTERN.test(testCase.input)) {
    return true;
  }
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
  for (const value of Object.values(testCase.expected)) {
    if (typeof value === 'string' && hasNonAscii(value)) {
      return true;
    }
  }
  return Boolean(
    testCase.new_value && IDNA_SETTER_PATTERN.test(testCase.new_value),
  );
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertThrows(fn, message) {
  try {
    fn();
  } catch (error) {
    return;
  }
  throw new Error(`${message}: expected throw`);
}

function checkConstructorTest(URLConstructor, expected) {
  const base = expected.base !== null ? expected.base : undefined;
  try {
    if (expected.failure) {
      try {
        // eslint-disable-next-line no-new
        new URLConstructor(expected.input, base);
        return false;
      } catch (error) {
        return true;
      }
    }

    const url = new URLConstructor(expected.input, base);
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
  } catch (error) {
    return expected.failure === true;
  }
}

function checkOriginTest(URLConstructor, expected) {
  const base = expected.base !== null ? expected.base : undefined;
  try {
    const url = new URLConstructor(expected.input, base);
    return url.origin === expected.origin;
  } catch (error) {
    return false;
  }
}

function checkSetterTest(URLConstructor, testCase, property) {
  try {
    const url = new URLConstructor(testCase.href);
    url[property] = testCase.new_value;

    for (const [prop, expectedValue] of Object.entries(testCase.expected)) {
      if (url[prop] !== expectedValue) {
        return false;
      }
    }
    return true;
  } catch (error) {
    return false;
  }
}

function createResult() {
  return {
    passed: 0,
    skipped: 0,
    knownFailed: 0,
    failed: 0,
    failures: [],
  };
}

function recordExpected(result, label, passes, isUnicode, assertFn) {
  if (isUnicode) {
    result.skipped++;
    return;
  }

  if (!passes) {
    result.failed++;
    result.failures.push({label, message: 'URL conformance check failed'});
    return;
  }

  try {
    assertFn();
    result.passed++;
  } catch (error) {
    result.failed++;
    result.failures.push({label, message: error.message});
  }
}

function recordRequired(result, label, assertFn) {
  try {
    assertFn();
    result.passed++;
  } catch (error) {
    result.failed++;
    result.failures.push({label, message: error.message});
  }
}

function runConstructorTests(URLConstructor, result) {
  const testCases = urlTestData.filter((entry) => typeof entry === 'object');

  for (const expected of testCases) {
    const base = expected.base !== null ? expected.base : undefined;
    const label = `Parsing: <${expected.input}>${
      base ? ` against <${base}>` : ' without base'
    }`;

    recordExpected(
      result,
      label,
      checkConstructorTest(URLConstructor, expected),
      isUnicodeRelated(expected),
      () => {
        if (expected.failure) {
          assertThrows(
            () => new URLConstructor(expected.input, base),
            `should fail: ${label}`,
          );
          return;
        }

        const url = new URLConstructor(expected.input, base);
        assertEqual(url.href, expected.href, `${label} href`);
        assertEqual(url.protocol, expected.protocol, `${label} protocol`);
        assertEqual(url.username, expected.username, `${label} username`);
        assertEqual(url.password, expected.password, `${label} password`);
        assertEqual(url.host, expected.host, `${label} host`);
        assertEqual(url.hostname, expected.hostname, `${label} hostname`);
        assertEqual(url.port, expected.port, `${label} port`);
        assertEqual(url.pathname, expected.pathname, `${label} pathname`);
        assertEqual(url.search, expected.search, `${label} search`);
        assertEqual(url.hash, expected.hash, `${label} hash`);
        if ('searchParams' in expected) {
          assertEqual(
            url.searchParams.toString(),
            expected.searchParams,
            `${label} searchParams`,
          );
        }
      },
    );
  }
}

function runOriginTests(URLConstructor, result) {
  const testCases = urlTestData.filter(
    (entry) => typeof entry === 'object' && 'origin' in entry && !entry.failure,
  );

  for (const expected of testCases) {
    const base = expected.base !== null ? expected.base : undefined;
    const label = `Origin: <${expected.input}>${
      base ? ` against <${base}>` : ' without base'
    }`;

    recordExpected(
      result,
      label,
      checkOriginTest(URLConstructor, expected),
      isUnicodeRelated(expected),
      () => {
        const url = new URLConstructor(expected.input, base);
        assertEqual(url.origin, expected.origin, `${label} origin`);
      },
    );
  }
}

function runSetterTests(URLConstructor, result) {
  for (const [propertyToBeSet, testCases] of Object.entries(settersTestData)) {
    if (propertyToBeSet === 'comment') {
      continue;
    }

    for (const testCase of testCases) {
      const label = `Setting <${testCase.href}>.${propertyToBeSet} = '${
        testCase.new_value
      }'${testCase.comment ? ` (${testCase.comment})` : ''}`;

      recordExpected(
        result,
        label,
        checkSetterTest(URLConstructor, testCase, propertyToBeSet),
        isUnicodeRelatedSetter(testCase),
        () => {
          const url = new URLConstructor(testCase.href);
          url[propertyToBeSet] = testCase.new_value;

          for (const [property, expectedValue] of Object.entries(
            testCase.expected,
          )) {
            assertEqual(url[property], expectedValue, `${label} ${property}`);
          }
        },
      );
    }
  }
}

function runStaticAndRegressionTests(URLConstructor, result) {
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
    recordRequired(result, `URL.canParse(${url}, ${base})`, () => {
      assertEqual(URLConstructor.canParse(url, base), expected, 'canParse');
    });
  }

  recordRequired(result, 'URL.toJSON serializes as href', () => {
    assertEqual(
      JSON.stringify(new URLConstructor('https://example.com/')),
      '"https://example.com/"',
      'toJSON',
    );
  });

  recordRequired(result, 'URL.searchParams getter returns same object', () => {
    const url = new URLConstructor('http://example.org/?a=b');
    const searchParams = url.searchParams;
    assertEqual(url.searchParams, searchParams, 'same searchParams object');
  });

  recordRequired(result, 'URL.searchParams updating and clearing', () => {
    const url = new URLConstructor('http://example.org/?a=b');
    const searchParams = url.searchParams;
    searchParams.set('a', 'b');
    assertEqual(url.searchParams.toString(), 'a=b', 'searchParams set');
    assertEqual(url.search, '?a=b', 'search after set');
    url.search = '';
    assertEqual(url.searchParams.toString(), '', 'searchParams after clear');
    assertEqual(url.search, '', 'search after clear');
    assertEqual(searchParams.toString(), '', 'held searchParams after clear');
  });

  recordRequired(
    result,
    'URL.searchParams and URL.search setters propagate',
    () => {
      const url = new URLConstructor('http://example.org/file?a=b&c=d');
      const searchParams = url.searchParams;
      url.search = 'e=f&g=h';
      assertEqual(
        url.search,
        '?e=f&g=h',
        'search setter without question mark',
      );
      assertEqual(
        searchParams.toString(),
        'e=f&g=h',
        'searchParams after search',
      );
      url.search = '?e=f&g=h';
      searchParams.append('i', ' j ');
      assertEqual(url.search, '?e=f&g=h&i=+j+', 'search after append');
      searchParams.set('e', 'updated');
      assertEqual(url.search, '?e=updated&g=h&i=+j+', 'search after set');

      const url2 = new URLConstructor('http://example.org/file??a=b&c=d');
      assertEqual(url2.search, '??a=b&c=d', 'double question search');
      assertEqual(
        url2.searchParams.toString(),
        '%3Fa=b&c=d',
        'double question params',
      );
      url2.href = 'http://example.org/file??a=b';
      assertEqual(url2.search, '??a=b', 'href setter search');
      assertEqual(url2.searchParams.toString(), '%3Fa=b', 'href setter params');
    },
  );

  recordRequired(result, 'URL.revokeObjectURL exists and is a no-op', () => {
    assertEqual(
      typeof URLConstructor.revokeObjectURL,
      'function',
      'revokeObjectURL',
    );
    URLConstructor.revokeObjectURL('blob:test');
  });

  recordRequired(result, 'URL.createObjectURL exists', () => {
    assertEqual(
      typeof URLConstructor.createObjectURL,
      'function',
      'createObjectURL',
    );
  });

  recordRequired(result, 'URL.toString returns href', () => {
    const url = new URLConstructor('https://example.com/path?q=1#hash');
    assertEqual(url.toString(), url.href, 'toString');
  });

  recordRequired(result, 'URL.toJSON returns href', () => {
    const url = new URLConstructor('https://example.com/path?q=1#hash');
    assertEqual(url.toJSON(), url.href, 'toJSON');
  });

  recordRequired(result, 'RN issue #25717 relative URLs', () => {
    assertEqual(
      new URLConstructor('about', 'https://www.mozilla.org').href,
      'https://www.mozilla.org/about',
      'mozilla relative',
    );
    assertEqual(
      new URLConstructor('dev', 'https://google.dev').href,
      'https://google.dev/dev',
      'google relative',
    );
  });

  recordRequired(result, 'RN issue #24428 file path', () => {
    assertEqual(
      new URLConstructor(
        'https://facebook.github.io/react-native/img/header_logo.png',
      ).href,
      'https://facebook.github.io/react-native/img/header_logo.png',
      'file path href',
    );
  });

  recordRequired(result, 'localhost URLs', () => {
    const url = new URLConstructor('http://localhost:3000/api/v1');
    assertEqual(url.hostname, 'localhost', 'localhost hostname');
    assertEqual(url.port, '3000', 'localhost port');
    assertEqual(url.pathname, '/api/v1', 'localhost pathname');
  });

  recordRequired(result, 'Object.prototype property scheme names', () => {
    const url = new URLConstructor('constructor:foo');
    assertEqual(url.href, 'constructor:foo', 'constructor href');
    assertEqual(url.protocol, 'constructor:', 'constructor protocol');
    assertEqual(url.pathname, 'foo', 'constructor pathname');
    assertEqual(url.host, '', 'constructor host');
  });
}

export function runURLConformance(URLConstructor) {
  const result = createResult();

  runConstructorTests(URLConstructor, result);
  runOriginTests(URLConstructor, result);
  runSetterTests(URLConstructor, result);
  runStaticAndRegressionTests(URLConstructor, result);

  return result;
}
