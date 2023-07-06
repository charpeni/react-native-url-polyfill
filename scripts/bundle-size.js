#!/usr/bin/node
const util = require('node:util');
const exec = util.promisify(require('node:child_process').exec);
const {spawn} = require('node:child_process');
const fs = require('node:fs');
const {nanoid} = require('nanoid');

const {name, version} = require('../package.json');

/**
 * We can't simply provide the generated tarball to `react-native-bundle-scale`, because
 * Yarn will cache it based on the name of the tarball, and subsequent runs of this script
 * will always result in the same output even though the content may have changed.
 *
 * That's why we need to rename the tarball with something unique.
 */
(async () => {
  await exec('npm pack');

  const tarballName = `${name}-${nanoid()}`;
  await exec(`mv ${name}-${version}.tgz ${tarballName}.tgz`);

  const childProcess = spawn(
    'npx',
    [
      'react-native-bundle-scale',
      JSON.stringify({
        'react-native-url-polyfill': `file:${__dirname}/../${tarballName}.tgz`,
      }),
      '--packages-as-json',
      '--debug',
    ],
    {stdio: 'inherit'},
  );

  childProcess.on('close', () => {
    fs.unlinkSync(`${tarballName}.tgz`);
  });
})();
