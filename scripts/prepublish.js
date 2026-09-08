#!/usr/bin/node
const fs = require('node:fs');

const packageJson = require('../package.json');
const path = require.resolve('../index.js');

fs.writeFileSync(
  path,
  fs
    .readFileSync(path, 'utf8')
    .replace('<INJECT_VERSION>', `${packageJson.name}@${packageJson.version}`),
);
