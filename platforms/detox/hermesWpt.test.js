/* global by, device, element, waitFor */
const {cases} = require('../../scripts/wpt/run-wpt');

const describeOnAndroid =
  device.getPlatform() === 'android' ? describe : describe.skip;

describeOnAndroid('official WPT on Hermes', () => {
  it.each(cases())(
    '$file$search',
    async ({file, search}) => {
      const testCase = `${file}${search}`;
      await device.launchApp({
        newInstance: true,
        url: `wpt://run?case=${encodeURIComponent(testCase)}`,
      });
      await waitFor(element(by.id('hermes-wpt-result')))
        .toExist()
        .withTimeout(70000);
      const result = await element(by.id('hermes-wpt-result')).getAttributes();
      if (result.text !== 'passed') {
        const failures = await element(
          by.id('hermes-wpt-failures'),
        ).getAttributes();
        throw new Error(`Hermes WPT failed: ${failures.text}`);
      }
      await expect(element(by.id('hermes-wpt-engine'))).toHaveText('Hermes');
      await expect(element(by.id('hermes-wpt-case'))).toHaveText(testCase);
    },
    90000,
  );
});
