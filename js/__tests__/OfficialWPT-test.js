const exceptions = require('./wpt/exceptions.json');
const {
  cases,
  runWptFile,
  verifyChecksums,
} = require('../../scripts/wpt/run-wpt');

describe('official Web Platform Tests', () => {
  it('matches the pinned snapshot checksums', () => {
    verifyChecksums();
  });

  it.each(cases())(
    '$file$search',
    async (testCase) => {
      const result = await runWptFile(testCase);
      expect(result.status.status).toBe(result.status.OK);

      const prefix = `${testCase.file}${testCase.search}`;
      const expected = new Set(exceptions[prefix] || []);
      const failures = result.tests.filter((test) => test.status !== test.PASS);
      const unexpected = failures.filter((test) => !expected.has(test.name));
      const stale = [...expected].filter(
        (name) => !failures.some((test) => test.name === name),
      );

      expect({
        unexpected: unexpected.map((test) => ({
          name: test.name,
          message: test.message,
        })),
        stale,
      }).toEqual({unexpected: [], stale: []});
    },
    70000,
  );
});
