/**
 * Metro configuration for React Native
 * https://github.com/facebook/react-native
 *
 * @format
 */

const path = require('path');

const reactNativeLib = path.resolve(__dirname, '../../..');

module.exports = {
  watchFolders: [reactNativeLib],
  resolver: {
    blockList: [
      new RegExp(`${reactNativeLib}/node_modules/react-native/.*`),
      new RegExp(`${reactNativeLib}/platforms/react-native/((?!0.66).).*`),
      new RegExp(path.resolve(__dirname, 'ios/.*')),
    ],
    extraNodeModules: {
      'react-native': path.resolve(__dirname, 'node_modules/react-native'),
    },
  },
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
};
