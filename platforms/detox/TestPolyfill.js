import React from 'react';
import {Text} from 'react-native';

function testCreateObjectURL() {
  let objectURL;

  try {
    objectURL = URL.createObjectURL({
      data: {
        blobId: 1,
        offset: 32,
      },
      size: 64,
    });
  } catch (e) {
    console.error(e);
  }

  return objectURL;
}

const PolyfillTests = () => (
  <>
    <Text testID="url-polyfill-version">
      {global.REACT_NATIVE_URL_POLYFILL ??
        'react-native-url-polyfill is not detected'}
    </Text>
    <Text testID="url-test-1">{new URL('dev', 'https://google.dev').href}</Text>
    <Text testID="url-test-2">
      {
        new URL('https://facebook.github.io/react-native/img/header_logo.png')
          .href
      }
    </Text>
    <Text testID="url-test-3">{testCreateObjectURL()}</Text>
  </>
);

export default PolyfillTests;
