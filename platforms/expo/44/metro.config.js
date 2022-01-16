// Learn more https://docs.expo.io/guides/customizing-metro
const {getDefaultConfig} = require('expo/metro-config');
const path = require('path');

const defaultConfig = getDefaultConfig(__dirname);
const reactNativeLib = path.resolve(__dirname, '../../..');

module.exports = {
  ...defaultConfig,
  watchFolders: [...defaultConfig?.watchFolders, reactNativeLib],
  resolver: {
    blockList: [
      new RegExp(`${reactNativeLib}/node_modules/react-native/.*`),
      new RegExp(`${reactNativeLib}/platforms/expo/((?!44).).*`),
      new RegExp(`${reactNativeLib}/platforms/react-native/.*`),
      new RegExp(path.resolve(__dirname, 'ios/.*')),
    ],
    extraNodeModules: {
      'react-native': path.resolve(__dirname, 'node_modules/react-native'),
    },
  },
};
