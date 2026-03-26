#!/usr/bin/node
/* eslint-env node */
const crypto = require('node:crypto');
const https = require('node:https');
const {Buffer} = require('node:buffer');
const fs = require('node:fs');
const path = require('node:path');

const WPT_DIR = path.resolve(__dirname, '..', 'js', '__tests__', 'wpt');
const CHECKSUMS_PATH = path.join(WPT_DIR, 'checksums.json');

const BASE_URL = 'https://wpt.live/url';

/**
 * Test data files consumed directly by our Jest tests.
 * New entries in these files are picked up automatically — no manual porting
 * needed.
 */
const DATA_FILES = [
  'resources/urltestdata.json',
  'resources/setters_tests.json',
];

/**
 * WPT JavaScript test files that have been manually ported to Jest in
 * `URLSearchParams-test.js` (and partially in `URL-test.js` for canParse,
 * toJSON, and searchParams integration).
 *
 * When these files change upstream, the update script warns that they need
 * manual review to port any new or modified tests.
 */
const REFERENCE_FILES = [
  'url-constructor.any.js',
  'url-origin.any.js',
  'url-searchparams.any.js',
  'url-setters.any.js',
  'url-setters-stripping.any.js',
  'url-statics-canparse.any.js',
  'url-statics-parse.any.js',
  'url-tojson.any.js',
  'urlencoded-parser.any.js',
  'urlsearchparams-append.any.js',
  'urlsearchparams-constructor.any.js',
  'urlsearchparams-delete.any.js',
  'urlsearchparams-foreach.any.js',
  'urlsearchparams-get.any.js',
  'urlsearchparams-getall.any.js',
  'urlsearchparams-has.any.js',
  'urlsearchparams-set.any.js',
  'urlsearchparams-size.any.js',
  'urlsearchparams-sort.any.js',
  'urlsearchparams-stringifier.any.js',
];

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function download(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

function loadChecksums() {
  try {
    return JSON.parse(fs.readFileSync(CHECKSUMS_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveChecksums(checksums) {
  fs.writeFileSync(CHECKSUMS_PATH, JSON.stringify(checksums, null, 2) + '\n');
}

async function main() {
  fs.mkdirSync(WPT_DIR, {recursive: true});

  const previousChecksums = loadChecksums();
  const newChecksums = {};

  const allFiles = [
    ...DATA_FILES.map((f) => ({
      url: `${BASE_URL}/${f}`,
      dest: path.join(WPT_DIR, path.basename(f)),
      isReference: false,
    })),
    ...REFERENCE_FILES.map((f) => ({
      url: `${BASE_URL}/${f}`,
      dest: path.join(WPT_DIR, f),
      isReference: true,
    })),
  ];

  console.log(`Downloading ${allFiles.length} files from ${BASE_URL}...\n`);

  const changedReferenceFiles = [];

  const results = await Promise.allSettled(
    allFiles.map(async ({url, dest, isReference}) => {
      const data = await download(url);
      fs.writeFileSync(dest, data);
      return {dest, data, isReference};
    }),
  );

  let ok = 0;
  let failed = 0;

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const {dest, data, isReference} = result.value;
      const name = path.basename(dest);
      const hash = sha256(data);
      newChecksums[name] = hash;

      const changed =
        name in previousChecksums && previousChecksums[name] !== hash;
      const isNew = !(name in previousChecksums);
      const status = changed ? ' (changed)' : isNew ? ' (new)' : '';

      console.log(
        `  OK  ${name} (${(data.length / 1024).toFixed(1)} KB)${status}`,
      );

      if (isReference && changed) {
        changedReferenceFiles.push(name);
      }

      ok++;
    } else {
      console.error(`  FAIL  ${result.reason.message}`);
      failed++;
    }
  }

  saveChecksums(newChecksums);

  console.log(`\nDone: ${ok} downloaded, ${failed} failed.`);

  if (failed > 0) {
    process.exit(1);
  }

  if (changedReferenceFiles.length > 0) {
    console.log('\n⚠ The following reference files changed upstream:');
    console.log('  These are manually ported — review the diff and update');
    console.log('  URLSearchParams-test.js (or URL-test.js) accordingly.\n');
    for (const name of changedReferenceFiles) {
      console.log(`    ${name}`);
    }
    console.log(
      '\n  Tip: use `git diff js/__tests__/wpt/<file>` to see what changed.',
    );
  }

  console.log('\nRun `yarn test` to check for new passing or failing tests.');
}

main();
