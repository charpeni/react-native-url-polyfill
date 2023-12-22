/** @type {import('jest-environment-puppeteer').JestPuppeteerConfig} */
module.exports = {
  server: {
    command: "yarn web",
    port: 19006,
    launchTimeout: 10000,
  },
};
