#!/usr/bin/node
/* eslint-env node */
const crypto = require('node:crypto');
const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');

const WPT_DIR = path.resolve(__dirname, '..', 'js', '__tests__', 'wpt');
const LOCK_PATH = path.join(WPT_DIR, 'wpt.lock.json');
const CHECKSUMS_PATH = path.join(WPT_DIR, 'checksums.json');
const lock = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));

const SUPPORT_FILES = {
  'common/subset-tests-by-key.js': 'support/subset-tests-by-key.js',
  'interfaces/url.idl': 'interfaces/url.idl',
  'resources/idlharness.js': 'support/idlharness.js',
  'resources/testharness.js': 'support/testharness.js',
  'resources/webidl2/lib/webidl2.js': 'support/WebIDLParser.js',
  'url/resources/setters_tests.json': 'setters_tests.json',
  'url/resources/urltestdata-javascript-only.json':
    'urltestdata-javascript-only.json',
  'url/resources/urltestdata.json': 'urltestdata.json',
};

function download(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https
      .get(url, {headers}, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode} for ${url}`));
          response.resume();
          return;
        }
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
        response.on('error', reject);
      })
      .on('error', reject);
  });
}

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function validateInventory() {
  const url = `https://api.github.com/repos/web-platform-tests/wpt/contents/url?ref=${lock.revision}`;
  const entries = JSON.parse(
    (
      await download(url, {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'react-native-url-polyfill-wpt-updater',
      })
    ).toString('utf8'),
  );
  const upstream = entries
    .filter((entry) => entry.type === 'file' && entry.name.endsWith('.any.js'))
    .map((entry) => entry.name)
    .sort();
  const accounted = [...lock.tests, ...Object.keys(lock.excluded)].sort();

  if (JSON.stringify(upstream) !== JSON.stringify(accounted)) {
    throw new Error(
      `Upstream WPT inventory changed.\nExpected: ${accounted.join(', ')}\nActual: ${upstream.join(', ')}`,
    );
  }
}

async function main() {
  await validateInventory();

  const files = {
    ...SUPPORT_FILES,
    ...Object.fromEntries(lock.tests.map((file) => [`url/${file}`, file])),
  };
  const checksums = {};

  for (const [upstreamPath, destination] of Object.entries(files)) {
    const url = `https://raw.githubusercontent.com/web-platform-tests/wpt/${lock.revision}/${upstreamPath}`;
    const data = await download(url);
    const output = path.join(WPT_DIR, destination);
    fs.mkdirSync(path.dirname(output), {recursive: true});
    fs.writeFileSync(output, data);
    checksums[destination] = sha256(data);
    console.log(`Updated ${destination}`);
  }

  fs.writeFileSync(CHECKSUMS_PATH, `${JSON.stringify(checksums, null, 2)}\n`);
  console.log(`\nPinned WPT revision: ${lock.revision}`);
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
