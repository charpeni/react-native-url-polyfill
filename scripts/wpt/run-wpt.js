/* eslint-env node */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const babel = require('@babel/core');

const ROOT = path.resolve(__dirname, '..', '..');
const WPT_DIR = path.join(ROOT, 'js', '__tests__', 'wpt');
const SOURCE_PATH = path.join(ROOT, 'js', 'URL.ts');
const implementationRequire = createRequire(SOURCE_PATH);
let transformedImplementation;

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function verifyChecksums() {
  const lock = JSON.parse(read(path.join(WPT_DIR, 'wpt.lock.json')));
  const checksums = JSON.parse(read(path.join(WPT_DIR, 'checksums.json')));
  const missing = lock.tests.filter(
    (file) => !Object.prototype.hasOwnProperty.call(checksums, file),
  );
  const mismatches = [];

  for (const [file, expected] of Object.entries(checksums)) {
    const actual = crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(WPT_DIR, file)))
      .digest('hex');
    if (actual !== expected) {
      mismatches.push(file);
    }
  }

  if (missing.length || mismatches.length) {
    throw new Error(
      [
        missing.length && `Missing checksums: ${missing.join(', ')}`,
        mismatches.length && `Checksum mismatches: ${mismatches.join(', ')}`,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
}

function implementationSource() {
  if (transformedImplementation === undefined) {
    transformedImplementation = babel.transformSync(read(SOURCE_PATH), {
      filename: SOURCE_PATH,
      babelrc: false,
      configFile: false,
      plugins: [
        require.resolve('@babel/plugin-transform-typescript'),
        require.resolve('@babel/plugin-transform-modules-commonjs'),
      ],
      sourceMaps: 'inline',
    }).code;
  }
  return transformedImplementation;
}

function metadata(source) {
  const values = {};
  for (const match of source.matchAll(/^\/\/ META: ([^=]+)=(.*)$/gm)) {
    (values[match[1]] ||= []).push(match[2]);
  }
  return values;
}

function resourcePath(request, testFile) {
  const base = new global.URL(`https://wpt.test/url/${testFile}`);
  const pathname = new global.URL(request, base).pathname;
  const resources = {
    '/common/subset-tests-by-key.js': 'support/subset-tests-by-key.js',
    '/interfaces/url.idl': 'interfaces/url.idl',
    '/resources/WebIDLParser.js': 'support/WebIDLParser.js',
    '/resources/idlharness.js': 'support/idlharness.js',
  };

  if (pathname.startsWith('/url/resources/')) {
    return path.join(WPT_DIR, path.basename(pathname));
  }
  if (resources[pathname]) {
    return path.join(WPT_DIR, resources[pathname]);
  }
  throw new Error(`Unmapped WPT resource: ${request} (${pathname})`);
}

function mappedFetch(testFile) {
  return async (request) => {
    const value = typeof request === 'string' ? request : request.url;
    const file = resourcePath(value, testFile);
    const body = read(file);
    return {
      ok: true,
      status: 200,
      json: async () => JSON.parse(body),
      text: async () => body,
    };
  };
}

function installImplementation(context) {
  context.module = {exports: {}};
  context.exports = context.module.exports;
  context.require = (id) =>
    id === 'react-native' ? {NativeModules: {}} : implementationRequire(id);
  vm.runInContext(implementationSource(), context, {filename: SOURCE_PATH});
  const implementation = context.exports;
  if (!implementation.URL || !implementation.URLSearchParams) {
    throw new Error(
      `Failed to load URL implementation: ${Object.keys(implementation).join(', ')}`,
    );
  }
  context.URL = implementation.URL;
  context.URLSearchParams = implementation.URLSearchParams;
  delete context.module;
  delete context.exports;
  delete context.require;
}

function installDOMException(context) {
  vm.runInContext(
    `class DOMException extends Error {}
     const names = [
       'INDEX_SIZE_ERR', 'DOMSTRING_SIZE_ERR', 'HIERARCHY_REQUEST_ERR',
       'WRONG_DOCUMENT_ERR', 'INVALID_CHARACTER_ERR', 'NO_DATA_ALLOWED_ERR',
       'NO_MODIFICATION_ALLOWED_ERR', 'NOT_FOUND_ERR', 'NOT_SUPPORTED_ERR',
       'INUSE_ATTRIBUTE_ERR', 'INVALID_STATE_ERR', 'SYNTAX_ERR',
       'INVALID_MODIFICATION_ERR', 'NAMESPACE_ERR', 'INVALID_ACCESS_ERR',
       'VALIDATION_ERR', 'TYPE_MISMATCH_ERR', 'SECURITY_ERR', 'NETWORK_ERR',
       'ABORT_ERR', 'URL_MISMATCH_ERR', 'QUOTA_EXCEEDED_ERR', 'TIMEOUT_ERR',
       'INVALID_NODE_TYPE_ERR', 'DATA_CLONE_ERR'
     ];
     names.forEach((name, index) => {
       Object.defineProperty(DOMException, name, {value: index + 1, enumerable: true});
       Object.defineProperty(DOMException.prototype, name, {
         enumerable: true,
         get() {
           if (!(this instanceof DOMException)) throw new TypeError('Illegal invocation');
           return index + 1;
         }
       });
     });
     globalThis.DOMException = DOMException;`,
    context,
  );
}

async function runWptFile({file, search = ''}) {
  const testPath = path.join(WPT_DIR, file);
  const source = read(testPath);
  const meta = metadata(source);
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    AbortController,
    Request,
    Response,
    FormData,
    location: {pathname: `/url/${file}`, search},
  };
  const context = vm.createContext(sandbox, {name: file});
  vm.runInContext('globalThis.self = globalThis', context);
  context.fetch = mappedFetch(file);
  installDOMException(context);
  installImplementation(context);

  vm.runInContext(read(path.join(WPT_DIR, 'support/testharness.js')), context, {
    filename: '/resources/testharness.js',
  });
  const completion = new Promise((resolve) => {
    context.__complete = resolve;
    vm.runInContext(
      'add_completion_callback((tests, status) => __complete({' +
        'tests: tests.map(test => test.structured_clone()), ' +
        'status: status.structured_clone()}))',
      context,
    );
  });

  for (const script of meta.script || []) {
    vm.runInContext(read(resourcePath(script, file)), context, {
      filename: script,
    });
  }
  vm.runInContext(
    "Object.defineProperty(self, 'URL', {enumerable: false});" +
      "Object.defineProperty(self, 'URLSearchParams', {enumerable: false});",
    context,
  );
  vm.runInContext(source, context, {filename: `/url/${file}`});

  let timeout;
  try {
    return await Promise.race([
      completion,
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`WPT runner timed out: ${file}`)),
          65000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function cases() {
  const lock = JSON.parse(read(path.join(WPT_DIR, 'wpt.lock.json')));
  return lock.tests.flatMap((file) => {
    const variants = metadata(read(path.join(WPT_DIR, file))).variant;
    return variants?.length
      ? variants.map((search) => ({file, search}))
      : [{file, search: ''}];
  });
}

module.exports = {cases, runWptFile, verifyChecksums};
