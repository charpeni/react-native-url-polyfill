import 'expect-puppeteer';

jest.setTimeout(10000);

describe('App', () => {
  beforeEach(async () => {
    await page.goto('http://localhost:19006');
    await page.waitForSelector('#root');
  });
  
  // react-native-url-polyfill isn't applied on React Native Web
  it('should not have REACT_NATIVE_URL_POLYFILL', async () => {
    await expect(page).toMatchElement('div[data-testid="url-polyfill-version"]', {
      text: 'react-native-url-polyfill is not detected',
    });
  });
});
