import './js/ios10Fix';

export * from './js/URL';
export * from './js/URLSearchParams';

export function setupURLPolyfill() {
  globalThis.REACT_NATIVE_URL_POLYFILL = '<INJECT_VERSION>';

  globalThis.URL = require('./js/URL').URL;
  globalThis.URLSearchParams = require('./js/URLSearchParams').URLSearchParams;
}
