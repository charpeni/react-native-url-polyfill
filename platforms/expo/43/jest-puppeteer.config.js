const {withExpoPuppeteer} = require('jest-expo-puppeteer');

module.exports = withExpoPuppeteer({
  server: {
    port: 5001,
  },
});
