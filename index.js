import './js/ios10Fix';

import {name, version} from './package.json';

export * from './js/URL';
export * from './js/URLSearchParams';

export function setupURLPolyfill() {
  global.REACT_NATIVE_URL_POLYFILL = `${name}@${version}`;

  global.URL = require('./js/URL').URL;
  global.URLSearchParams = require('./js/URLSearchParams').URLSearchParams;
}
