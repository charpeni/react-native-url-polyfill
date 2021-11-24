/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 * @flow
 */

import React from 'react';
import {SafeAreaView, Text, StatusBar} from 'react-native';

const App: () => React$Node = () => {
  return (
    <>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView>
        <Text testID="url-polyfill-version">
          {global.REACT_NATIVE_URL_POLYFILL}
        </Text>
        <Text testID="url-test-1">
          {new URL('dev', 'https://google.dev').href}
        </Text>
        <Text testID="url-test-2">
          {
            new URL(
              'https://facebook.github.io/react-native/img/header_logo.png',
            ).href
          }
        </Text>
        <Text testID="url-test-3">
          {URL.createObjectURL({
            data: {
              blobId: 1,
              offset: 32,
            },
            size: 64,
          })}
        </Text>
      </SafeAreaView>
    </>
  );
};

export default App;
