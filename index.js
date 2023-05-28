require('./js/ios10Fix');
const {URL} = require('./js/URL');
const {URLSearchParams} = require('./js/URLSearchParams');
const {name, version} = require('./package.json');

function setupURLPolyfill() {
  global.REACT_NATIVE_URL_POLYFILL = `${name}@${version}`;

  global.URL = require('./js/URL').URL;
  global.URLSearchParams = require('./js/URLSearchParams').URLSearchParams;
}

module.exports = {
  URL,
  URLSearchParams,
  setupURLPolyfill,
};
