import './js/ios10Fix';

import {name, version} from './package.json';

export * from './js/URL';
export * from './js/URLSearchParams';

export function setupURLPolyfill() {
  globalThis.REACT_NATIVE_URL_POLYFILL = `${name}@${version}`;

  globalThis.URL = require('./js/URL').URL;
  globalThis.URLSearchParams = require('./js/URLSearchParams').URLSearchParams;
}
