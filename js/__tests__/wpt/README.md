# Web Platform Tests (WPT) for URL and URLSearchParams

This directory contains test data and reference files from the
[Web Platform Tests](https://github.com/web-platform-tests/wpt/tree/master/url)
project — the canonical spec-compliance test suite for the
[WHATWG URL Standard](https://url.spec.whatwg.org/).

## Contents

### Test data (consumed by Jest)

These JSON files are loaded by `js/__tests__/URL-test.js` and iterated over to
generate one Jest test per entry:

| File                 | Description                                       | Test count |
| -------------------- | ------------------------------------------------- | ---------- |
| `urltestdata.json`   | URL constructor parsing tests (success + failure) | ~878       |
| `setters_tests.json` | URL property setter tests (protocol, host, etc.)  | ~278       |

### Reference files (not executed)

The `*.any.js` files are the original WPT JavaScript test files. They are **not
run by Jest** (excluded via `testPathIgnorePatterns` in `package.json`). They
are kept here as reference so you can compare the original WPT test logic
against the Jest translations in `URL-test.js` and `URLSearchParams-test.js`.

### Checksums

`checksums.json` stores SHA-256 hashes of every downloaded file. The update
script uses these to detect which files changed upstream and warn when
manually-ported reference files need review (see [Drift detection](#drift-detection)
below).

## How tests are generated

The Jest test files do not contain hand-written test cases for every URL. Instead
they loop over the JSON data at module load time:

```js
const urlTestData = require('./wpt/urltestdata.json');

for (const expected of testCases) {
  it(`Parsing: <${expected.input}>`, () => {
    const url = new URL(expected.input, base);
    expect(url.href).toBe(expected.href);
    // ...all other properties
  });
}
```

Each JSON entry becomes one Jest `it()` call. This means updating the JSON files
automatically adds, removes, or updates tests — no code changes needed.

## How failures are classified

Each test case is evaluated at load time to determine its current status:

- **`it`** — the test passes against the polyfill.
- **`it.skip`** — the test fails due to Unicode/IDNA limitations. The polyfill
  uses `whatwg-url-without-unicode` which intentionally strips IDNA/Unicode
  support (hostname lowercasing, punycode encoding, fullwidth character
  normalization, etc.) to reduce bundle size. These tests are structurally
  impossible to pass without replacing the dependency.
- **`it.failing`** — the test fails for non-Unicode reasons (e.g., missing
  `URLSearchParams.sort()`, `.size`, newer spec behaviors). These document the
  expected spec behavior and serve as a todo list. When the implementation is
  fixed, Jest will **automatically flag** these tests (a `.failing` test that
  starts passing causes Jest to fail), prompting you to convert them to regular
  `it` tests.

The classification is automatic — the `pickRunner()` helper in `URL-test.js`
runs each test case against the polyfill and checks `isUnicodeRelated()` to
choose the right annotation.

## Updating the test data

To pull the latest test data from WPT:

```bash
yarn update-wpt
```

This runs `scripts/update-wpt.js`, which downloads all files from
[wpt.live](https://wpt.live/url/) (a mirror that always serves the latest
`master` branch of the WPT repository).

After updating, run the tests:

```bash
yarn test
```

What to expect:

- **New passing tests** appear automatically as regular `it` tests.
- **New Unicode-related failures** are auto-detected and get `it.skip`.
- **New non-Unicode failures** become `it.failing` — they pass in the suite
  (since they're expected to fail) but show up in the test count as a signal
  that new spec behaviors need implementation work.
- **Removed tests** disappear automatically since the loop only generates tests
  for entries present in the JSON.

## Drift detection

The test data files (`urltestdata.json`, `setters_tests.json`) are fully
automatic — new entries are picked up by Jest with no code changes. But the
URLSearchParams tests (and a few URL tests like `canParse`, `toJSON`,
`searchParams` integration) are **manually ported** from the `*.any.js`
reference files. If the spec adds a new feature or test upstream, we need to
know about it.

The update script tracks this via `checksums.json`. On each run it:

1. Downloads all files.
2. Computes SHA-256 hashes and compares them against the stored checksums.
3. If a **reference file** (`*.any.js`) changed, it prints a warning:

```
⚠ The following reference files changed upstream:
  These are manually ported — review the diff and update
  URLSearchParams-test.js (or URL-test.js) accordingly.

    urlsearchparams-sort.any.js
    urlsearchparams-size.any.js
```

You can then use `git diff js/__tests__/wpt/<file>` to see exactly what changed
and port the new tests.

Data file changes (`urltestdata.json`, `setters_tests.json`) don't produce
warnings because they are consumed automatically — just run `yarn test` after
updating.

## Source URLs

All files are downloaded from:

- `https://wpt.live/url/resources/urltestdata.json`
- `https://wpt.live/url/resources/setters_tests.json`
- `https://wpt.live/url/<filename>.any.js`

The upstream source repository is:
https://github.com/web-platform-tests/wpt/tree/master/url
