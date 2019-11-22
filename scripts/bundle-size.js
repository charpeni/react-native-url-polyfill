const chalk = require('chalk');
const execa = require('execa');
const filesize = require('filesize');
const fs = require('fs');
const ora = require('ora');
const prependFile = require('prepend-file');
const tmp = require('tmp');

async function action(text, promise) {
  const spinner = ora(text).start();

  try {
    await promise;
    spinner.succeed();
  } catch (error) {
    spinner.fail();
  }
}

async function generateSourceMapExplorer(
  filename,
  sourceDirectory,
  outputDirectory,
) {
  const output = `${outputDirectory}/${filename}.html`;

  await execa(
    `source-map-explorer ${sourceDirectory}/${filename}.jsbundle --html > ${output}`,
    {shell: true},
  );

  return output;
}

(async () => {
  const {
    name: tempDirectory,
    removeCallback: clearTempDirectory,
  } = tmp.dirSync();

  await action(
    'Creating a React Native sample app',
    execa(
      `echo "y" | npx react-native-cli init BundleSize --directory ${tempDirectory}`,
      {
        shell: true,
      },
    ),
  );

  await action(
    'Bundling freshly initialized React Native app',
    execa(
      'npx',
      [
        'react-native-cli',
        'bundle',
        '--entry-file',
        'index.js',
        '--platform',
        'ios',
        '--dev',
        'false',
        '--bundle-output',
        'original.jsbundle',
        '--sourcemap-output',
        'original.map',
      ],
      {cwd: tempDirectory},
    ),
  );

  await action(
    'Packing react-native-url-polyfill',
    execa('yarn', ['pack', '--filename', 'react-native-url-polyfill.tgz']),
  );

  await action(
    'Adding react-native-url-polyfill',
    execa(
      'yarn',
      [
        'add',
        'react-native-url-polyfill@file:../react-native-url-polyfill.tgz',
      ],
      {cwd: tempDirectory},
    ),
  );

  await action(
    'Importing react-native-url-polyfill',
    new Promise((resolve, reject) =>
      prependFile(
        `${tempDirectory}/index.js`,
        `import 'react-native-url-polyfill';
  `,
        err => {
          if (err) {
            reject(err);
          }

          resolve();
        },
      ),
    ),
  );

  await action(
    'Bundling React Native app with react-native-url-polyfill',
    execa(
      'npx',
      [
        'react-native-cli',
        'bundle',
        '--entry-file',
        'index.js',
        '--platform',
        'ios',
        '--dev',
        'false',
        '--bundle-output',
        'withURLPolyfill.jsbundle',
        '--sourcemap-output',
        'withURLPolyfill.map',
      ],
      {cwd: tempDirectory},
    ),
  );

  await action(
    'Comparing size of bundles',
    new Promise(async (resolve, reject) => {
      const originalSize = await new Promise(statsResolve =>
        fs.stat(`${tempDirectory}/original.jsbundle`, [], (err, stats) => {
          if (err) {
            reject(err);
          }

          statsResolve(stats.size);
        }),
      );

      const polyfillSize = await new Promise(statsResolve =>
        fs.stat(
          `${tempDirectory}/withURLPolyfill.jsbundle`,
          [],
          (err, stats) => {
            if (err) {
              reject(err);
            }

            statsResolve(stats.size);
          },
        ),
      );

      resolve();

      setTimeout(() => {
        console.log(
          '📦 The original bundle is:',
          chalk.bold(filesize(originalSize)),
        );
        console.log(
          '📦 The bundle with react-native-url-polyfill is:',
          chalk.bold(filesize(polyfillSize)),
        );
        console.log(
          '⚖️  Therefore, react-native-url-polyfill adds',
          chalk.bold.red(filesize(polyfillSize - originalSize)),
          'to the JavaScript bundle',
        );
      });
    }),
  );

  await action(
    'Generating sources map explorer',
    new Promise(async (resolve, reject) => {
      const {name: sourceMapOutputDirectory} = tmp.dirSync();

      const originalOutput = await generateSourceMapExplorer(
        'original',
        tempDirectory,
        sourceMapOutputDirectory,
      );

      const withURLPolyfillOutput = await generateSourceMapExplorer(
        'withURLPolyfill',
        tempDirectory,
        sourceMapOutputDirectory,
      );

      resolve();

      setTimeout(() => {
        console.log(
          'Original source map explorer:',
          chalk.underline(originalOutput),
        );

        console.log(
          'With react-native-url-polyfill:',
          chalk.underline(withURLPolyfillOutput),
        );
      });
    }),
  );

  clearTempDirectory();
})();
