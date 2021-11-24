/* eslint-env detox/detox, jest */

describe('URL Polyfill', () => {
  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('should have REACT_NATIVE_URL_POLYFILL', async () => {
    const {name, version} = require('../../../../package.json');

    await expect(element(by.id('url-polyfill-version'))).toHaveText(
      `${name}@${version}`,
    );
  });

  it('should handle test 1', async () => {
    await expect(element(by.id('url-test-1'))).toHaveText(
      'https://google.dev/dev',
    );
  });

  it('should handle test 2', async () => {
    await expect(element(by.id('url-test-2'))).toHaveText(
      'https://facebook.github.io/react-native/img/header_logo.png',
    );
  });

  it('should handle test 3', async () => {
    await expect(element(by.id('url-test-3'))).toHaveText(
      'blob:1?offset=32&size=64',
    );
  });
});
