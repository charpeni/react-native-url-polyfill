import {URL, URLSearchParams} from '../URL';

describe('WebIDL bindings', () => {
  it.each([
    ['URL.parse', () => URL.parse()],
    ['URL.canParse', () => URL.canParse()],
    ['URLSearchParams.append', () => new URLSearchParams().append()],
    ['URLSearchParams.delete', () => new URLSearchParams().delete()],
    ['URLSearchParams.get', () => new URLSearchParams().get()],
    ['URLSearchParams.getAll', () => new URLSearchParams().getAll()],
    ['URLSearchParams.has', () => new URLSearchParams().has()],
    ['URLSearchParams.set', () => new URLSearchParams().set()],
    ['URLSearchParams.forEach', () => new URLSearchParams().forEach()],
  ])('%s rejects missing required arguments', (name, invoke) => {
    expect(invoke).toThrow(TypeError);
  });

  it('distinguishes omitted arguments from explicit undefined', () => {
    const params = new URLSearchParams();
    params.append(undefined, undefined);

    expect(params.get(undefined)).toBe('undefined');
    expect(URL.parse(undefined, undefined)).toBeNull();
    expect(URL.canParse(undefined, undefined)).toBe(false);
  });

  it('exposes WebIDL function lengths', () => {
    expect(URL).toHaveLength(1);
    expect(URL.parse).toHaveLength(1);
    expect(URL.canParse).toHaveLength(1);
    expect(URLSearchParams).toHaveLength(0);
    expect(URLSearchParams.prototype.append).toHaveLength(2);
    expect(URLSearchParams.prototype.delete).toHaveLength(1);
    expect(URLSearchParams.prototype.get).toHaveLength(1);
    expect(URLSearchParams.prototype.getAll).toHaveLength(1);
    expect(URLSearchParams.prototype.has).toHaveLength(1);
    expect(URLSearchParams.prototype.set).toHaveLength(2);
    expect(URLSearchParams.prototype.sort).toHaveLength(0);
    expect(URLSearchParams.prototype.forEach).toHaveLength(1);
  });

  it('converts URL arguments in WebIDL order and propagates coercion errors', () => {
    const order = [];
    const url = {
      toString: () => {
        order.push('url');
        return '/path';
      },
    };
    const base = {
      toString: () => {
        order.push('base');
        return 'https://example.com/';
      },
    };

    expect(new URL(url, base).href).toBe('https://example.com/path');
    expect(order).toEqual(['url', 'base']);

    const error = new Error('coercion failed');
    const invalid = {
      toString() {
        throw error;
      },
    };
    expect(() => URL.parse(invalid)).toThrow(error);
    expect(() => URL.canParse(invalid)).toThrow(error);

    let conversions = 0;
    const invalidURL = {
      toString() {
        conversions++;
        return 'not a URL';
      },
    };
    expect(() => new URL(invalidURL)).toThrow(TypeError);
    expect(conversions).toBe(1);
  });

  it('rejects symbols for every USVString binding', () => {
    const symbol = Symbol('value');
    const params = new URLSearchParams();

    expect(() => new URL(symbol)).toThrow(TypeError);
    expect(() => URL.parse(symbol)).toThrow(TypeError);
    expect(() => URL.canParse(symbol)).toThrow(TypeError);
    expect(() => new URLSearchParams(symbol)).toThrow(TypeError);
    expect(() => params.append(symbol, '')).toThrow(TypeError);
    expect(() => params.delete(symbol)).toThrow(TypeError);
    expect(() => params.get(symbol)).toThrow(TypeError);
    expect(() => params.getAll(symbol)).toThrow(TypeError);
    expect(() => params.has(symbol)).toThrow(TypeError);
    expect(() => params.set(symbol, '')).toThrow(TypeError);

    for (const property of [
      'href',
      'protocol',
      'username',
      'password',
      'host',
      'hostname',
      'port',
      'pathname',
      'search',
      'hash',
    ]) {
      const instance = new URL('https://example.com/');
      expect(() => {
        instance[property] = symbol;
      }).toThrow(TypeError);
    }
  });

  it('rejects malformed sequence initializers', () => {
    expect(() => new URLSearchParams([{0: 'a', 1: 'b', length: 2}])).toThrow(
      TypeError,
    );
    expect(() => new URLSearchParams({[Symbol.iterator]: 1, a: 'b'})).toThrow(
      TypeError,
    );
    expect(() => new URLSearchParams([null])).toThrow(TypeError);
  });

  it('converts every inner sequence value before validating its length', () => {
    const converted = [];
    const value = (name) => ({
      toString() {
        converted.push(name);
        return name;
      },
    });

    expect(
      () =>
        new URLSearchParams([
          [value('first'), value('second'), value('third')],
        ]),
    ).toThrow(TypeError);
    expect(converted).toEqual(['first', 'second', 'third']);
  });

  it('converts optional values once before delete and has algorithms', () => {
    const params = new URLSearchParams('a=1&a=1');
    let conversions = 0;
    const value = {
      toString() {
        conversions++;
        return '1';
      },
    };

    expect(params.has('a', value)).toBe(true);
    expect(conversions).toBe(1);
    params.delete('a', value);
    expect(conversions).toBe(2);
  });

  it('validates and invokes forEach callbacks through the callable itself', () => {
    expect(() => new URLSearchParams().forEach(null)).toThrow(TypeError);

    const params = new URLSearchParams('a=1');
    const callback = jest.fn();
    callback.call = null;
    const thisArg = {};
    params.forEach(callback, thisArg);

    expect(callback).toHaveBeenCalledWith('1', 'a', params);
    expect(callback.mock.instances[0]).toBe(thisArg);
  });

  it('rejects forged URL and URLSearchParams receivers', () => {
    const url = new URL('https://example.com/?a=1');
    const hrefGetter = Object.getOwnPropertyDescriptor(
      URL.prototype,
      'href',
    ).get;
    const hrefSetter = Object.getOwnPropertyDescriptor(
      URL.prototype,
      'href',
    ).set;

    expect(() => hrefGetter.call({_url: url._url})).toThrow(TypeError);
    expect(() => hrefSetter.call({_url: url._url}, url.href)).toThrow(
      TypeError,
    );
    expect(() => URL.prototype.toString.call({_url: url._url})).toThrow(
      TypeError,
    );
    expect(() =>
      URLSearchParams.prototype.get.call({_list: [['a', '1']]}, 'a'),
    ).toThrow(TypeError);
    expect(() =>
      URLSearchParams.prototype.append.call({_list: []}, 'a', '1'),
    ).toThrow(TypeError);
  });

  it('keeps implementation slots hidden', () => {
    expect(Object.keys(new URL('https://example.com/?a=1'))).toEqual([]);
    expect(Object.keys(new URLSearchParams('a=1'))).toEqual([]);
  });

  it('exposes branded URLSearchParams iterators', () => {
    const iterator = new URLSearchParams('a=1').entries();
    const next = iterator.next;
    const prototype = Object.getPrototypeOf(iterator);
    const intrinsicIteratorPrototype = Object.getPrototypeOf(
      Object.getPrototypeOf([][Symbol.iterator]()),
    );

    expect(Object.prototype.toString.call(iterator)).toBe(
      '[object URLSearchParams Iterator]',
    );
    expect(() => next.call({})).toThrow(TypeError);
    expect(iterator[Symbol.iterator]()).toBe(iterator);
    expect(Object.getPrototypeOf(prototype)).toBe(intrinsicIteratorPrototype);
    expect(Object.hasOwn(prototype, 'constructor')).toBe(false);
    expect(Object.getOwnPropertyDescriptor(prototype, 'next').enumerable).toBe(
      true,
    );
  });

  it('exposes WebIDL toStringTag data properties', () => {
    for (const [prototype, value] of [
      [URL.prototype, 'URL'],
      [URLSearchParams.prototype, 'URLSearchParams'],
    ]) {
      expect(
        Object.getOwnPropertyDescriptor(prototype, Symbol.toStringTag),
      ).toEqual({
        value,
        writable: false,
        enumerable: false,
        configurable: true,
      });
    }
  });
});
