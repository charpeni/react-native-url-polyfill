import './js/ios10Fix';

import packageJson from './package.json';

export * from './js/URL';
export * from './js/URLSearchParams';

export function setupURLPolyfill() {
  globalThis.REACT_NATIVE_URL_POLYFILL = `${packageJson.name}@${packageJson.version}`;

  globalThis.URL = require('./js/URL').URL;
  globalThis.URLSearchParams = require('./js/URLSearchParams').URLSearchParams;
}
