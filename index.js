import {polyfillGlobal} from 'react-native/Libraries/Utilities/PolyfillFunctions';

import {name, version} from './package.json';

global.REACT_NATIVE_URL_POLYFILL = `${name}@${version}`;

polyfillGlobal('URL', () => require('./js/URL').URL);
polyfillGlobal(
  'URLSearchParams',
  () => require('./js/URLSearchParams').URLSearchParams,
);
polyfillGlobal('Buffer', () => require('buffer').Buffer);
