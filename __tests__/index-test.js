import * as PolyfillFunctions from 'react-native/Libraries/Utilities/PolyfillFunctions';

jest.mock('react-native/Libraries/Utilities/PolyfillFunctions', () => ({
  polyfillGlobal: jest.fn(),
}));

describe('Index', function () {
  it('should apply Buffer polyfill', () => {
    require('../index');

    expect(PolyfillFunctions.polyfillGlobal).toBeCalledTimes(1);
    expect(PolyfillFunctions.polyfillGlobal).toBeCalledWith(
      'Buffer',
      expect.any(Function),
    );
  });

  it("shouldn't apply URL and URLSearchParams on import", () => {
    expect(global.REACT_NATIVE_URL_POLYFILL).toBeUndefined();

    require('../index');

    expect(PolyfillFunctions.polyfillGlobal).toBeCalledTimes(1); // For Buffer
    expect(global.REACT_NATIVE_URL_POLYFILL).toBeUndefined();
  });

  it('should export setupURLPolyfill', () => {
    const imports = require('../index');

    expect(imports.setupURLPolyfill).toBeDefined();
  });

  it('should export URL', () => {
    const imports = require('../index');

    expect(imports.URL).toBeDefined();
  });

  it('should export URLSearchParams', () => {
    const imports = require('../index');

    expect(imports.URLSearchParams).toBeDefined();
  });
});
