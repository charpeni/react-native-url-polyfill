const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const path = require('path');

const reactNativeLib = path.resolve(__dirname, '../../..');

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  watchFolders: [reactNativeLib],
  resolver: {
    blockList: [
      new RegExp(`${reactNativeLib}/node_modules/react-native/.*`),
      new RegExp(`${reactNativeLib}/platforms/react-native/((?!0.72).).*`),
      new RegExp(`${reactNativeLib}/platforms/expo/.*`),
      new RegExp(path.resolve(__dirname, 'ios/.*')),
    ],
    extraNodeModules: {
      'react-native': path.resolve(__dirname, 'node_modules/react-native'),
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
