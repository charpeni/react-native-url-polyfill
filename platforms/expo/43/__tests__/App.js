import 'expect-puppeteer';

import config from '../jest-puppeteer.config';

beforeEach(async () => {
  await page.goto(config.url);
  await page.waitForSelector('#root');
});

it('should have REACT_NATIVE_URL_POLYFILL', async () => {
  const {name, version} = require('../../../../package.json');

  await expect(page).toMatchElement('div[data-testid="url-polyfill-version"]', {
    text: `${name}@${version}`,
  });
});

it('should handle test 1', async () => {
  await expect(page).toMatchElement('div[data-testid="url-test-1"]', {
    text: 'https://google.dev/dev',
  });
});

it('should handle test 2', async () => {
  await expect(page).toMatchElement('div[data-testid="url-test-2"]', {
    text: 'https://facebook.github.io/react-native/img/header_logo.png',
  });
});
