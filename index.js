import packageJson from './package.json';
import {URL} from './js/URL';
import {URLSearchParams} from './js/URLSearchParams';

export * from './js/URL';
export * from './js/URLSearchParams';

export function setupURLPolyfill() {
  globalThis.REACT_NATIVE_URL_POLYFILL = `${packageJson.name}@${packageJson.version}`;

  globalThis.URL = URL;
  globalThis.URLSearchParams = URLSearchParams;
}
