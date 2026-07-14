#!/usr/bin/node
/* eslint-env node */

/**
 * Builds production Metro bundles and optimized bytecode for the standalone
 * Hermes shell. These desktop measurements do not represent device performance.
 *
 * Usage: node scripts/benchmark-hermes.js [samples]
 */

const {spawnSync} = require('node:child_process');
const {createRequire} = require('node:module');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const metro = require('metro');
const {getDefaultConfig} = require('metro-config');
const {
  BENCHMARKS,
  ITERATIONS_BY_BENCHMARK,
  MAX_ACCEPTABLE_RSD,
  formatStats,
  parseSamples,
  stats,
} = require('./benchmark-core');

const ROOT = path.resolve(__dirname, '..');
const PACKAGE_JSON = require(path.join(ROOT, 'package.json'));
const RESULT_PREFIX = '__RN_URL_BENCHMARK_RESULT__';
const SDK_ROOT = path.join(ROOT, 'node_modules/react-native/sdks/hermesc');

function executableName(name) {
  return process.platform === 'win32' ? `${name}.exe` : name;
}

function isExecutable(file) {
  try {
    fs.accessSync(
      file,
      process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK,
    );
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function discoverHermesBinaries() {
  const environmentHermes = process.env.HERMES_BIN;
  const environmentHermesc = process.env.HERMESC_BIN;
  if (environmentHermes || environmentHermesc) {
    if (
      !environmentHermes ||
      !environmentHermesc ||
      !isExecutable(environmentHermes) ||
      !isExecutable(environmentHermesc)
    ) {
      throw new Error(
        '`HERMES_BIN` and `HERMESC_BIN` must both name executable files.',
      );
    }
    return {hermes: environmentHermes, hermesc: environmentHermesc};
  }

  const preferredDirectory = {
    darwin: 'osx-bin',
    linux: 'linux64-bin',
    win32: 'win64-bin',
  }[process.platform];
  const directories = [];
  if (preferredDirectory) {
    directories.push(path.join(SDK_ROOT, preferredDirectory));
  }
  const platformPattern = {
    darwin: /(darwin|mac|osx)/i,
    linux: /linux/i,
    win32: /win/i,
  }[process.platform];
  if (platformPattern) {
    try {
      for (const entry of fs.readdirSync(SDK_ROOT, {withFileTypes: true})) {
        const directory = path.join(SDK_ROOT, entry.name);
        if (
          entry.isDirectory() &&
          platformPattern.test(entry.name) &&
          !directories.includes(directory)
        ) {
          directories.push(directory);
        }
      }
    } catch {
      // The actionable error below covers a missing React Native SDK directory.
    }
  }

  for (const directory of directories) {
    const hermes = path.join(directory, executableName('hermes'));
    const hermesc = path.join(directory, executableName('hermesc'));
    if (isExecutable(hermes) && isExecutable(hermesc)) {
      return {hermes, hermesc};
    }
  }

  throw new Error(
    `No standalone Hermes runtime/compiler pair was found for ${process.platform}/${process.arch} under ` +
      `\`${SDK_ROOT}\`. React Native may only bundle \`hermesc\` on this platform. ` +
      'Set `HERMES_BIN` and `HERMESC_BIN` to matching standalone binaries.',
  );
}

function runCommand(command, args, description) {
  const result = spawnSync(command, args, {encoding: 'utf8'});
  if (result.error || result.status !== 0) {
    const detail = result.error?.message || result.stderr || result.stdout;
    throw new Error(
      `${description} failed${detail ? `:\n${detail.trim()}` : ''}`,
    );
  }
  return result.stdout.trim();
}

function hermesVersion(hermes) {
  for (const argument of ['-version', '--version']) {
    const result = spawnSync(hermes, [argument], {encoding: 'utf8'});
    if (!result.error && result.status === 0) {
      return (result.stdout || result.stderr).trim();
    }
  }
  return 'unknown version';
}

function nodeModulePaths() {
  const paths = [path.join(ROOT, 'node_modules')];
  if (process.env.NODE_PATH) {
    paths.push(...process.env.NODE_PATH.split(path.delimiter).filter(Boolean));
  }
  return [...new Set(paths.map((entry) => path.resolve(entry)))];
}

function resolveOptionalPackage(packageName) {
  const requireFromRoot = createRequire(path.join(ROOT, 'package.json'));
  try {
    return requireFromRoot.resolve(packageName, {paths: nodeModulePaths()});
  } catch {
    return null;
  }
}

function optionalPackageVersion(packageName) {
  const packagePath = resolveOptionalPackage(`${packageName}/package.json`);
  return packagePath ? require(packagePath).version : 'unknown';
}

function loadEngines() {
  const engines = [
    {
      label: 'react-native-url-polyfill',
      name: 'react-native-url-polyfill',
      version: PACKAGE_JSON.version,
      modulePath: path.join(ROOT, 'js/URL.js'),
      isBaseline: true,
    },
  ];
  const notes = [];
  for (const {name, label} of [
    {
      name: 'whatwg-url-without-unicode',
      label: 'whatwg-url-without-unicode',
    },
    {name: 'whatwg-url-minimum', label: '(Expo) whatwg-url-minimum'},
  ]) {
    const modulePath = resolveOptionalPackage(name);
    if (modulePath) {
      engines.push({
        label,
        name,
        version: optionalPackageVersion(name),
        modulePath,
      });
    } else {
      notes.push(
        `\`${name}\` is unavailable. Run through \`yarn benchmark:hermes\` ` +
          'to install optional competitors temporarily.',
      );
    }
  }
  return {engines, notes};
}

async function bundleEngine(engine, temporaryDirectory) {
  const engineDirectory = path.join(
    temporaryDirectory,
    engine.name.replace(/[^a-z0-9-]/gi, '-'),
  );
  const stubDirectory = path.join(temporaryDirectory, 'react-native-stub');
  fs.mkdirSync(engineDirectory, {recursive: true});
  fs.mkdirSync(stubDirectory, {recursive: true});
  fs.writeFileSync(
    path.join(stubDirectory, 'package.json'),
    JSON.stringify({name: 'react-native', main: 'index.js'}),
  );
  fs.writeFileSync(
    path.join(stubDirectory, 'index.js'),
    'module.exports = {NativeModules: {}};\n',
  );

  const entryPath = path.join(engineDirectory, 'entry.js');
  const bundlePath = path.join(engineDirectory, 'benchmark.bundle.js');
  const executableBundlePath = path.join(
    engineDirectory,
    'benchmark-executable.bundle.js',
  );
  const bytecodePath = path.join(engineDirectory, 'benchmark.hbc');
  fs.writeFileSync(
    entryPath,
    "const runtime = require('benchmark-hermes-runtime');\n" +
      'runtime.installHostShims();\n' +
      "const implementation = require('benchmark-implementation');\n" +
      'runtime.runBenchmark(implementation, globalThis.__RN_URL_BENCHMARK_PAYLOAD__);\n',
  );

  const modulePaths = nodeModulePaths();
  const config = await getDefaultConfig(ROOT);
  config.projectRoot = ROOT;
  config.watchFolders = [ROOT, temporaryDirectory, ...modulePaths.slice(1)];
  config.resolver.extraNodeModules = {'react-native': stubDirectory};
  config.resolver.nodeModulesPaths = modulePaths;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const aliases = {
      'benchmark-hermes-runtime': path.join(
        __dirname,
        'benchmark-hermes-entry.js',
      ),
      'benchmark-implementation': engine.modulePath,
      'react-native': path.join(stubDirectory, 'index.js'),
    };
    if (aliases[moduleName]) {
      return {
        filePath: aliases[moduleName],
        type: 'sourceFile',
      };
    }
    return context.resolveRequest(context, moduleName, platform);
  };
  config.resolver.useWatchman = false;
  config.reporter = {update() {}};

  const previousNodeEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    await metro.runBuild(config, {
      bundleOut: bundlePath,
      dev: false,
      entry: entryPath,
      minify: false,
      platform: 'ios',
      sourceMap: false,
      unstable_transformProfile: 'hermes-stable',
    });
  } finally {
    if (previousNodeEnvironment === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnvironment;
    }
  }
  return {bundlePath, bytecodePath, executableBundlePath};
}

function compileEngine(hermesc, paths, payload) {
  fs.writeFileSync(
    paths.executableBundlePath,
    `globalThis.__RN_URL_BENCHMARK_PAYLOAD__ = ${JSON.stringify(payload)};\n` +
      fs.readFileSync(paths.bundlePath, 'utf8'),
  );
  runCommand(
    hermesc,
    [
      '-O',
      '-emit-binary',
      '-out',
      paths.bytecodePath,
      paths.executableBundlePath,
    ],
    'Hermes bytecode compilation',
  );
}

function runInHermes(binaries, paths, payload) {
  compileEngine(binaries.hermesc, paths, payload);
  const output = runCommand(
    binaries.hermes,
    ['-b', paths.bytecodePath],
    'Standalone Hermes execution',
  );
  const resultLine = output
    .split(/\r?\n/)
    .find((line) => line.startsWith(RESULT_PREFIX));
  if (!resultLine) {
    throw new Error(
      `Standalone Hermes returned no benchmark result${output ? `:\n${output}` : ''}`,
    );
  }
  return JSON.parse(resultLine.slice(RESULT_PREFIX.length));
}

async function prepareEngines(engines, binaries, temporaryDirectory, notes) {
  const supported = [];
  for (const engine of engines) {
    try {
      const paths = await bundleEngine(engine, temporaryDirectory);
      const probe = runInHermes(binaries, paths, {probe: true});
      const supportedBenchmarks = new Set(probe.supportedBenchmarks);
      const unsupportedBenchmarks = Object.keys(BENCHMARKS).filter(
        (label) => !supportedBenchmarks.has(label),
      );
      if (engine.isBaseline && unsupportedBenchmarks.length > 0) {
        throw new Error(
          `unsupported benchmark operations: ${unsupportedBenchmarks.join(', ')}`,
        );
      }
      if (supportedBenchmarks.size === 0) {
        throw new Error('no benchmark operations are supported');
      }
      if (unsupportedBenchmarks.length > 0) {
        notes.push(
          `\`${engine.name}\` does not implement these operations and reports n/a: ` +
            unsupportedBenchmarks.join(', '),
        );
      }
      supported.push({...engine, paths, supportedBenchmarks});
    } catch (error) {
      if (engine.isBaseline) {
        throw new Error(`Unable to prepare ${engine.label}: ${error.message}`);
      }
      notes.push(`\`${engine.name}\` is unsupported: ${error.message}`);
    }
  }
  return supported;
}

function printResults(engines, measurements, samples) {
  console.log(
    `\nStandalone Hermes benchmark: median-of-${samples}, fixed iterations per operation`,
  );
  console.log(
    '(desktop standalone-Hermes measurements are not device performance; lower is faster)',
  );
  console.log(
    '(each implementation/operation runs in an isolated Hermes process; ' +
      'cells show median ms [min-max, relative standard deviation])\n',
  );

  const nameColumn = 54;
  const numberColumn = 38;
  let header = 'Operation (iterations)'.padEnd(nameColumn);
  for (const engine of engines) {
    header += `  ${`${engine.label}@${engine.version} (ms)`.padEnd(numberColumn)}`;
  }
  console.log(header);
  console.log('-'.repeat(header.length));

  for (const label of Object.keys(BENCHMARKS)) {
    const iterations = ITERATIONS_BY_BENCHMARK[label];
    let row = `${label} (${iterations.toLocaleString()})`.padEnd(nameColumn);
    const results = engines.map((engine) => measurements[engine.name][label]);
    for (const result of results) {
      const cell = result ? formatStats(result, results[0].median) : 'n/a';
      row += `  ${cell.padEnd(numberColumn)}`;
    }
    console.log(row);
  }
  console.log('-'.repeat(header.length));
  console.log(`! indicates RSD above ${MAX_ACCEPTABLE_RSD}%.`);
  console.log(
    'Note: standalone Hermes exposes a millisecond clock, so very short rows may have coarse ranges.',
  );
}

async function main() {
  const samples = parseSamples(process.argv[2]);
  const binaries = discoverHermesBinaries();
  const version = hermesVersion(binaries.hermes);
  console.log(`Standalone Hermes:\n${version}`);
  console.log(`Samples: ${samples}`);

  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'react-native-url-hermes-benchmark-'),
  );
  try {
    const {engines, notes} = loadEngines();
    const supported = await prepareEngines(
      engines,
      binaries,
      temporaryDirectory,
      notes,
    );
    const measurements = {};
    for (const engine of supported) {
      measurements[engine.name] = {};
    }

    let operationIndex = 0;
    for (const label of Object.keys(BENCHMARKS)) {
      const iterations = ITERATIONS_BY_BENCHMARK[label];
      const offset = operationIndex % supported.length;
      const orderedEngines = supported
        .slice(offset)
        .concat(supported.slice(0, offset))
        .filter((engine) => engine.supportedBenchmarks.has(label));
      for (const engine of orderedEngines) {
        const measurement = runInHermes(binaries, engine.paths, {
          benchmark: label,
          iterations,
          samples,
        });
        measurements[engine.name][label] = stats(measurement.timings);
      }
      operationIndex++;
    }

    printResults(supported, measurements, samples);
    for (const note of notes) {
      console.log(`\nNote: ${note}`);
    }
    console.log('');
  } finally {
    fs.rmSync(temporaryDirectory, {recursive: true, force: true});
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
