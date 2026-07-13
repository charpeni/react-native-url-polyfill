describe('Index', function () {
  it("shouldn't apply URL and URLSearchParams on import", () => {
    expect(global.REACT_NATIVE_URL_POLYFILL).toBeUndefined();

    require('../index');

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

  it('should reserialize the URL when deleting a missing search parameter', () => {
    const {URL} = require('../index');
    const url = new URL('https://example.com/?a=%20');

    url.searchParams.delete('missing');

    expect(url.search).toBe('?a=+');
  });

  it('should reserialize the URL when setting a search parameter to its value', () => {
    const {URL} = require('../index');
    const url = new URL('https://example.com/?a=%20');

    url.searchParams.set('a', ' ');

    expect(url.search).toBe('?a=+');
  });

  it('should remove duplicate search parameters when setting a value', () => {
    const {URLSearchParams} = require('../index');
    const params = new URLSearchParams('a=1&b=2&a=3&c=4');

    params.set('a', 'updated');

    expect(params.toString()).toBe('a=updated&b=2&c=4');
  });
});
