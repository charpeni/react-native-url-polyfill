import {URLSearchParams} from '../URLSearchParams';
import {URL} from '../URL';

// =============================================================================
// WPT URLSearchParams Constructor Tests
// Ported from: https://github.com/web-platform-tests/wpt/tree/master/url
// =============================================================================
describe('URLSearchParams — WPT constructor tests', () => {
  it('Basic URLSearchParams construction', () => {
    let params = new URLSearchParams();
    expect(params + '').toBe('');
    params = new URLSearchParams('');
    expect(params + '').toBe('');
    params = new URLSearchParams('a=b');
    expect(params + '').toBe('a=b');
    params = new URLSearchParams(params);
    expect(params + '').toBe('a=b');
  });

  it('URLSearchParams constructor, no arguments', () => {
    const params = new URLSearchParams();
    expect(params.toString()).toBe('');
  });

  it('URLSearchParams constructor, remove leading "?"', () => {
    const params = new URLSearchParams('?a=b');
    expect(params.toString()).toBe('a=b');
  });

  it('URLSearchParams constructor, empty string as argument', () => {
    const params = new URLSearchParams('');
    expect(params).not.toBeNull();
  });

  it('URLSearchParams constructor, {} as argument', () => {
    const params = new URLSearchParams({});
    expect(params + '').toBe('');
  });

  it('URLSearchParams constructor, string.', () => {
    let params = new URLSearchParams('a=b');
    expect(params).not.toBeNull();
    expect(params.has('a')).toBe(true);
    expect(params.has('b')).toBe(false);

    params = new URLSearchParams('a=b&c');
    expect(params).not.toBeNull();
    expect(params.has('a')).toBe(true);
    expect(params.has('c')).toBe(true);

    params = new URLSearchParams('&a&&& &&&&&a+b=& c&m%c3%b8%c3%b8');
    expect(params).not.toBeNull();
    expect(params.has('a')).toBe(true);
    expect(params.has('a b')).toBe(true);
    expect(params.has(' ')).toBe(true);
    expect(params.has('c')).toBe(false);
    expect(params.has(' c')).toBe(true);
    expect(params.has('m\u00f8\u00f8')).toBe(true);

    params = new URLSearchParams('id=0&value=%');
    expect(params).not.toBeNull();
    expect(params.has('id')).toBe(true);
    expect(params.has('value')).toBe(true);
    expect(params.get('id')).toBe('0');
    expect(params.get('value')).toBe('%');

    params = new URLSearchParams('b=%2sf%2a');
    expect(params).not.toBeNull();
    expect(params.has('b')).toBe(true);
    expect(params.get('b')).toBe('%2sf*');

    params = new URLSearchParams('b=%2%2af%2a');
    expect(params).not.toBeNull();
    expect(params.has('b')).toBe(true);
    expect(params.get('b')).toBe('%2*f*');

    params = new URLSearchParams('b=%%2a');
    expect(params).not.toBeNull();
    expect(params.has('b')).toBe(true);
    expect(params.get('b')).toBe('%*');
  });

  it('URLSearchParams constructor, object (copy is independent).', () => {
    const seed = new URLSearchParams('a=b&c=d');
    const params = new URLSearchParams(seed);
    expect(params).not.toBeNull();
    expect(params.get('a')).toBe('b');
    expect(params.get('c')).toBe('d');
    expect(params.has('d')).toBe(false);
    // The name-value pairs are copied when created; later updates
    // should not be observable.
    seed.append('e', 'f');
    expect(params.has('e')).toBe(false);
    params.append('g', 'h');
    expect(seed.has('g')).toBe(false);
  });

  it('Parse +', () => {
    let params = new URLSearchParams('a=b+c');
    expect(params.get('a')).toBe('b c');
    params = new URLSearchParams('a+b=c');
    expect(params.get('a b')).toBe('c');
  });

  it('Parse encoded +', () => {
    const testValue = '+15555555555';
    const params = new URLSearchParams();
    params.set('query', testValue);
    const newParams = new URLSearchParams(params.toString());

    expect(params.toString()).toBe('query=%2B15555555555');
    expect(params.get('query')).toBe(testValue);
    expect(newParams.get('query')).toBe(testValue);
  });

  it('Parse space', () => {
    let params = new URLSearchParams('a=b c');
    expect(params.get('a')).toBe('b c');
    params = new URLSearchParams('a b=c');
    expect(params.get('a b')).toBe('c');
  });

  it('Parse %20', () => {
    let params = new URLSearchParams('a=b%20c');
    expect(params.get('a')).toBe('b c');
    params = new URLSearchParams('a%20b=c');
    expect(params.get('a b')).toBe('c');
  });

  it('Parse \\0', () => {
    let params = new URLSearchParams('a=b\0c');
    expect(params.get('a')).toBe('b\0c');
    params = new URLSearchParams('a\0b=c');
    expect(params.get('a\0b')).toBe('c');
  });

  it('Parse %00', () => {
    let params = new URLSearchParams('a=b%00c');
    expect(params.get('a')).toBe('b\0c');
    params = new URLSearchParams('a%00b=c');
    expect(params.get('a\0b')).toBe('c');
  });

  it('Parse \\u2384 (COMPOSITION SYMBOL)', () => {
    let params = new URLSearchParams('a=b\u2384');
    expect(params.get('a')).toBe('b\u2384');
    params = new URLSearchParams('a\u2384b=c');
    expect(params.get('a\u2384b')).toBe('c');
  });

  it('Parse %e2%8e%84 (COMPOSITION SYMBOL)', () => {
    let params = new URLSearchParams('a=b%e2%8e%84');
    expect(params.get('a')).toBe('b\u2384');
    params = new URLSearchParams('a%e2%8e%84b=c');
    expect(params.get('a\u2384b')).toBe('c');
  });

  it('Parse \\uD83D\\uDCA9 (PILE OF POO)', () => {
    let params = new URLSearchParams('a=b\uD83D\uDCA9c');
    expect(params.get('a')).toBe('b\uD83D\uDCA9c');
    params = new URLSearchParams('a\uD83D\uDCA9b=c');
    expect(params.get('a\uD83D\uDCA9b')).toBe('c');
  });

  it('Parse %f0%9f%92%a9 (PILE OF POO)', () => {
    let params = new URLSearchParams('a=b%f0%9f%92%a9c');
    expect(params.get('a')).toBe('b\uD83D\uDCA9c');
    params = new URLSearchParams('a%f0%9f%92%a9b=c');
    expect(params.get('a\uD83D\uDCA9b')).toBe('c');
  });

  it('Constructor with sequence of sequences of strings', () => {
    let params = new URLSearchParams([]);
    expect(params).not.toBeNull();
    params = new URLSearchParams([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(params.get('a')).toBe('b');
    expect(params.get('c')).toBe('d');
    expect(() => new URLSearchParams([[1]])).toThrow(TypeError);
    expect(() => new URLSearchParams([[1, 2, 3]])).toThrow(TypeError);
  });

  const constructTests = [
    {
      input: {'+': '%C2'},
      output: [['+', '%C2']],
      name: 'object with +',
    },
    {
      input: {c: 'x', a: '?'},
      output: [
        ['c', 'x'],
        ['a', '?'],
      ],
      name: 'object with two keys',
    },
    {
      input: [
        ['c', 'x'],
        ['a', '?'],
      ],
      output: [
        ['c', 'x'],
        ['a', '?'],
      ],
      name: 'array with two keys',
    },
  ];

  for (const val of constructTests) {
    it(`Construct with ${val.name}`, () => {
      const params = new URLSearchParams(val.input);
      let i = 0;
      for (const param of params) {
        expect(param).toEqual(val.output[i]);
        i++;
      }
    });
  }
});

// =============================================================================
// WPT URLSearchParams.append() Tests
// =============================================================================
describe('URLSearchParams — WPT append tests', () => {
  it('Append same name', () => {
    const params = new URLSearchParams();
    params.append('a', 'b');
    expect(params + '').toBe('a=b');
    params.append('a', 'b');
    expect(params + '').toBe('a=b&a=b');
    params.append('a', 'c');
    expect(params + '').toBe('a=b&a=b&a=c');
  });

  it('Append empty strings', () => {
    const params = new URLSearchParams();
    params.append('', '');
    expect(params + '').toBe('=');
    params.append('', '');
    expect(params + '').toBe('=&=');
  });

  it('Append null', () => {
    const params = new URLSearchParams();
    params.append(null, null);
    expect(params + '').toBe('null=null');
    params.append(null, null);
    expect(params + '').toBe('null=null&null=null');
  });

  it('Append multiple', () => {
    const params = new URLSearchParams();
    params.append('first', 1);
    params.append('second', 2);
    params.append('third', '');
    params.append('first', 10);
    expect(params.has('first')).toBe(true);
    expect(params.get('first')).toBe('1');
    expect(params.get('second')).toBe('2');
    expect(params.get('third')).toBe('');
    params.append('first', 10);
    expect(params.get('first')).toBe('1');
  });
});

// =============================================================================
// WPT URLSearchParams.delete() Tests
// =============================================================================
describe('URLSearchParams — WPT delete tests', () => {
  it('Delete basics', () => {
    let params = new URLSearchParams('a=b&c=d');
    params.delete('a');
    expect(params + '').toBe('c=d');
    params = new URLSearchParams('a=a&b=b&a=a&c=c');
    params.delete('a');
    expect(params + '').toBe('b=b&c=c');
    params = new URLSearchParams('a=a&=&b=b&c=c');
    params.delete('');
    expect(params + '').toBe('a=a&b=b&c=c');
    params = new URLSearchParams('a=a&null=null&b=b');
    params.delete(null);
    expect(params + '').toBe('a=a&b=b');
    params = new URLSearchParams('a=a&undefined=undefined&b=b');
    params.delete(undefined);
    expect(params + '').toBe('a=a&b=b');
  });

  it('Deleting appended multiple', () => {
    const params = new URLSearchParams();
    params.append('first', 1);
    expect(params.has('first')).toBe(true);
    expect(params.get('first')).toBe('1');
    params.delete('first');
    expect(params.has('first')).toBe(false);
    params.append('first', 1);
    params.append('first', 10);
    params.delete('first');
    expect(params.has('first')).toBe(false);
  });

  it('Deleting all params removes ? from URL', () => {
    const url = new URL('http://example.com/?param1&param2');
    url.searchParams.delete('param1');
    url.searchParams.delete('param2');
    expect(url.href).toBe('http://example.com/');
    expect(url.search).toBe('');
  });

  it('Removing non-existent param removes ? from URL', () => {
    const url = new URL('http://example.com/?');
    url.searchParams.delete('param1');
    expect(url.href).toBe('http://example.com/');
    expect(url.search).toBe('');
  });
});

// =============================================================================
// WPT URLSearchParams.get() Tests
// =============================================================================
describe('URLSearchParams — WPT get tests', () => {
  it('Get basics', () => {
    let params = new URLSearchParams('a=b&c=d');
    expect(params.get('a')).toBe('b');
    expect(params.get('c')).toBe('d');
    expect(params.get('e')).toBe(null);
    params = new URLSearchParams('a=b&c=d&a=e');
    expect(params.get('a')).toBe('b');
    params = new URLSearchParams('=b&c=d');
    expect(params.get('')).toBe('b');
    params = new URLSearchParams('a=&c=d&a=e');
    expect(params.get('a')).toBe('');
  });

  it('More get() basics', () => {
    const params = new URLSearchParams('first=second&third&&');
    expect(params).not.toBeNull();
    expect(params.has('first')).toBe(true);
    expect(params.get('first')).toBe('second');
    expect(params.get('third')).toBe('');
    expect(params.get('fourth')).toBe(null);
  });
});

// =============================================================================
// WPT URLSearchParams.getAll() Tests
// =============================================================================
describe('URLSearchParams — WPT getAll tests', () => {
  it('getAll() basics', () => {
    let params = new URLSearchParams('a=b&c=d');
    expect(params.getAll('a')).toEqual(['b']);
    expect(params.getAll('c')).toEqual(['d']);
    expect(params.getAll('e')).toEqual([]);
    params = new URLSearchParams('a=b&c=d&a=e');
    expect(params.getAll('a')).toEqual(['b', 'e']);
    params = new URLSearchParams('=b&c=d');
    expect(params.getAll('')).toEqual(['b']);
    params = new URLSearchParams('a=&c=d&a=e');
    expect(params.getAll('a')).toEqual(['', 'e']);
  });

  it('getAll() multiples', () => {
    const params = new URLSearchParams('a=1&a=2&a=3&a');
    expect(params.has('a')).toBe(true);
    let matches = params.getAll('a');
    expect(matches.length).toBe(4);
    expect(matches).toEqual(['1', '2', '3', '']);
    params.set('a', 'one');
    expect(params.get('a')).toBe('one');
    matches = params.getAll('a');
    expect(matches.length).toBe(1);
    expect(matches).toEqual(['one']);
  });
});

// =============================================================================
// WPT URLSearchParams.has() Tests
// =============================================================================
describe('URLSearchParams — WPT has tests', () => {
  it('Has basics', () => {
    let params = new URLSearchParams('a=b&c=d');
    expect(params.has('a')).toBe(true);
    expect(params.has('c')).toBe(true);
    expect(params.has('e')).toBe(false);
    params = new URLSearchParams('a=b&c=d&a=e');
    expect(params.has('a')).toBe(true);
    params = new URLSearchParams('=b&c=d');
    expect(params.has('')).toBe(true);
    params = new URLSearchParams('null=a');
    expect(params.has(null)).toBe(true);
  });

  it('has() following delete()', () => {
    const params = new URLSearchParams('a=b&c=d&&');
    params.append('first', 1);
    params.append('first', 2);
    expect(params.has('a')).toBe(true);
    expect(params.has('c')).toBe(true);
    expect(params.has('first')).toBe(true);
    expect(params.has('d')).toBe(false);
    params.delete('first');
    expect(params.has('first')).toBe(false);
  });
});

// =============================================================================
// WPT URLSearchParams.set() Tests
// =============================================================================
describe('URLSearchParams — WPT set tests', () => {
  it('Set basics', () => {
    let params = new URLSearchParams('a=b&c=d');
    params.set('a', 'B');
    expect(params + '').toBe('a=B&c=d');
    params = new URLSearchParams('a=b&c=d&a=e');
    params.set('a', 'B');
    expect(params + '').toBe('a=B&c=d');
    params.set('e', 'f');
    expect(params + '').toBe('a=B&c=d&e=f');
  });

  it('URLSearchParams.set', () => {
    const params = new URLSearchParams('a=1&a=2&a=3');
    expect(params.has('a')).toBe(true);
    expect(params.get('a')).toBe('1');
    params.set('first', 4);
    expect(params.has('a')).toBe(true);
    expect(params.get('a')).toBe('1');
    params.set('a', 4);
    expect(params.has('a')).toBe(true);
    expect(params.get('a')).toBe('4');
  });
});

// =============================================================================
// WPT URLSearchParams.sort() Tests
// =============================================================================
describe('URLSearchParams — WPT sort tests', () => {
  const sortTests = [
    {
      input: 'z=b&a=b&z=a&a=a',
      output: [
        ['a', 'b'],
        ['a', 'a'],
        ['z', 'b'],
        ['z', 'a'],
      ],
    },
    {
      input: '\uFFFD=x&\uFFFC&\uFFFD=a',
      output: [
        ['\uFFFC', ''],
        ['\uFFFD', 'x'],
        ['\uFFFD', 'a'],
      ],
    },
    {
      input: 'z=z&a=a&z=y&a=b&z=x&a=c&z=w&a=d&z=v&a=e&z=u&a=f&z=t&a=g',
      output: [
        ['a', 'a'],
        ['a', 'b'],
        ['a', 'c'],
        ['a', 'd'],
        ['a', 'e'],
        ['a', 'f'],
        ['a', 'g'],
        ['z', 'z'],
        ['z', 'y'],
        ['z', 'x'],
        ['z', 'w'],
        ['z', 'v'],
        ['z', 'u'],
        ['z', 't'],
      ],
    },
    {
      input: 'bbb&bb&aaa&aa=x&aa=y',
      output: [
        ['aa', 'x'],
        ['aa', 'y'],
        ['aaa', ''],
        ['bb', ''],
        ['bbb', ''],
      ],
    },
    {
      input: 'z=z&=f&=t&=x',
      output: [
        ['', 'f'],
        ['', 't'],
        ['', 'x'],
        ['z', 'z'],
      ],
    },
    {
      input: 'a\uD83C\uDF08&a\uD83D\uDCA9',
      output: [
        ['a\uD83C\uDF08', ''],
        ['a\uD83D\uDCA9', ''],
      ],
    },
  ];

  for (const val of sortTests) {
    // Determine at load time whether this sort test passes
    const checkSort = (() => {
      const p = new URLSearchParams(val.input);
      p.sort();
      const actual = [...p];
      return JSON.stringify(actual) === JSON.stringify(val.output);
    })();
    const runner = checkSort ? it : it.failing;

    runner(`Parse and sort: ${val.input}`, () => {
      const params = new URLSearchParams(val.input);
      params.sort();
      let i = 0;
      for (const param of params) {
        expect(param).toEqual(val.output[i]);
        i++;
      }
    });

    runner(`URL parse and sort: ${val.input}`, () => {
      const url = new URL('?' + val.input, 'https://example/');
      url.searchParams.sort();
      const params = new URLSearchParams(url.search);
      let i = 0;
      for (const param of params) {
        expect(param).toEqual(val.output[i]);
        i++;
      }
    });
  }

  it('Sorting non-existent params removes ? from URL', () => {
    const url = new URL('http://example.com/?');
    url.searchParams.sort();
    expect(url.href).toBe('http://example.com/');
    expect(url.search).toBe('');
  });
});

// =============================================================================
// WPT URLSearchParams stringifier / toString() Tests
// =============================================================================
describe('URLSearchParams — WPT stringifier tests', () => {
  it('Serialize space', () => {
    const params = new URLSearchParams();
    params.append('a', 'b c');
    expect(params + '').toBe('a=b+c');
    params.delete('a');
    params.append('a b', 'c');
    expect(params + '').toBe('a+b=c');
  });

  it('Serialize empty value', () => {
    const params = new URLSearchParams();
    params.append('a', '');
    expect(params + '').toBe('a=');
    params.append('a', '');
    expect(params + '').toBe('a=&a=');
    params.append('', 'b');
    expect(params + '').toBe('a=&a=&=b');
    params.append('', '');
    expect(params + '').toBe('a=&a=&=b&=');
    params.append('', '');
    expect(params + '').toBe('a=&a=&=b&=&=');
  });

  it('Serialize empty name', () => {
    const params = new URLSearchParams();
    params.append('', 'b');
    expect(params + '').toBe('=b');
    params.append('', 'b');
    expect(params + '').toBe('=b&=b');
  });

  it('Serialize empty name and value', () => {
    const params = new URLSearchParams();
    params.append('', '');
    expect(params + '').toBe('=');
    params.append('', '');
    expect(params + '').toBe('=&=');
  });

  it('Serialize +', () => {
    const params = new URLSearchParams();
    params.append('a', 'b+c');
    expect(params + '').toBe('a=b%2Bc');
    params.delete('a');
    params.append('a+b', 'c');
    expect(params + '').toBe('a%2Bb=c');
  });

  it('Serialize =', () => {
    const params = new URLSearchParams();
    params.append('=', 'a');
    expect(params + '').toBe('%3D=a');
    params.append('b', '=');
    expect(params + '').toBe('%3D=a&b=%3D');
  });

  it('Serialize &', () => {
    const params = new URLSearchParams();
    params.append('&', 'a');
    expect(params + '').toBe('%26=a');
    params.append('b', '&');
    expect(params + '').toBe('%26=a&b=%26');
  });

  it('Serialize *-._', () => {
    const params = new URLSearchParams();
    params.append('a', '*-._');
    expect(params + '').toBe('a=*-._');
    params.delete('a');
    params.append('*-._', 'c');
    expect(params + '').toBe('*-._=c');
  });

  it('Serialize %', () => {
    const params = new URLSearchParams();
    params.append('a', 'b%c');
    expect(params + '').toBe('a=b%25c');
    params.delete('a');
    params.append('a%b', 'c');
    expect(params + '').toBe('a%25b=c');

    const params2 = new URLSearchParams('id=0&value=%');
    expect(params2 + '').toBe('id=0&value=%25');
  });

  it('Serialize \\0', () => {
    const params = new URLSearchParams();
    params.append('a', 'b\0c');
    expect(params + '').toBe('a=b%00c');
    params.delete('a');
    params.append('a\0b', 'c');
    expect(params + '').toBe('a%00b=c');
  });

  it('Serialize \\uD83D\\uDCA9 (PILE OF POO)', () => {
    const params = new URLSearchParams();
    params.append('a', 'b\uD83D\uDCA9c');
    expect(params + '').toBe('a=b%F0%9F%92%A9c');
    params.delete('a');
    params.append('a\uD83D\uDCA9b', 'c');
    expect(params + '').toBe('a%F0%9F%92%A9b=c');
  });

  it('URLSearchParams.toString', () => {
    let params;
    params = new URLSearchParams('a=b&c=d&&e&&');
    expect(params.toString()).toBe('a=b&c=d&e=');
    params = new URLSearchParams('a = b &a=b&c=d%20');
    expect(params.toString()).toBe('a+=+b+&a=b&c=d+');
    // The lone '=' _does_ survive the roundtrip.
    params = new URLSearchParams('a=&a=b');
    expect(params.toString()).toBe('a=&a=b');

    params = new URLSearchParams('b=%2sf%2a');
    expect(params.toString()).toBe('b=%252sf*');

    params = new URLSearchParams('b=%2%2af%2a');
    expect(params.toString()).toBe('b=%252*f*');

    params = new URLSearchParams('b=%%2a');
    expect(params.toString()).toBe('b=%25*');
  });

  it('URLSearchParams connected to URL', () => {
    const url = new URL('http://www.example.com/?a=b,c');
    const params = url.searchParams;

    expect(url.toString()).toBe('http://www.example.com/?a=b,c');
    expect(params.toString()).toBe('a=b%2Cc');

    params.append('x', 'y');

    expect(url.toString()).toBe('http://www.example.com/?a=b%2Cc&x=y');
    expect(params.toString()).toBe('a=b%2Cc&x=y');
  });

  it('URLSearchParams must not do newline normalization', () => {
    const url = new URL('http://www.example.com/');
    const params = url.searchParams;

    params.append('a\nb', 'c\rd');
    params.append('e\n\rf', 'g\r\nh');

    expect(params.toString()).toBe('a%0Ab=c%0Dd&e%0A%0Df=g%0D%0Ah');
  });
});

// =============================================================================
// WPT URLSearchParams.forEach() Tests
// =============================================================================
describe('URLSearchParams — WPT forEach tests', () => {
  it('ForEach Check', () => {
    const params = new URLSearchParams('a=1&b=2&c=3');
    const keys = [];
    const values = [];
    params.forEach((value, key) => {
      keys.push(key);
      values.push(value);
    });
    expect(keys).toEqual(['a', 'b', 'c']);
    expect(values).toEqual(['1', '2', '3']);
  });

  it('For-of Check (search change during iteration)', () => {
    const a = new URL('http://a.b/c?a=1&b=2&c=3&d=4');
    const b = a.searchParams;
    const c = [];
    for (const i of b) {
      a.search = 'x=1&y=2&z=3';
      c.push(i);
    }
    expect(c[0]).toEqual(['a', '1']);
    expect(c[1]).toEqual(['y', '2']);
    expect(c[2]).toEqual(['z', '3']);
  });

  it('empty', () => {
    const a = new URL('http://a.b/c');
    const b = a.searchParams;
    const seen = [];
    for (const i of b) {
      seen.push(i);
    }
    expect(seen).toEqual([]);
  });
});

// =============================================================================
// WPT URLSearchParams.size Tests
// =============================================================================
describe('URLSearchParams — WPT size tests', () => {
  it("URLSearchParams's size and deletion", () => {
    const params = new URLSearchParams('a=1&b=2&a=3');
    expect(params.size).toBe(3);

    params.delete('a');
    expect(params.size).toBe(1);
  });

  it("URLSearchParams's size and addition", () => {
    const params = new URLSearchParams('a=1&b=2&a=3');
    expect(params.size).toBe(3);

    params.append('b', '4');
    expect(params.size).toBe(4);
  });

  it("URLSearchParams's size when obtained from a URL", () => {
    const url = new URL('http://localhost/query?a=1&b=2&a=3');
    expect(url.searchParams.size).toBe(3);

    url.searchParams.delete('a');
    expect(url.searchParams.size).toBe(1);

    url.searchParams.append('b', 4);
    expect(url.searchParams.size).toBe(2);
  });

  it("URLSearchParams's size when obtained from a URL and using .search", () => {
    const url = new URL('http://localhost/query?a=1&b=2&a=3');
    expect(url.searchParams.size).toBe(3);

    url.search = '?';
    expect(url.searchParams.size).toBe(0);
  });
});

// =============================================================================
// WPT iteration (keys, values, entries, Symbol.iterator) Tests
// =============================================================================
describe('URLSearchParams — iteration tests', () => {
  it('entries() should iterate over key/value pairs', () => {
    const params = new URLSearchParams('a=1&b=2&c=3');
    const entries = Array.from(params.entries());
    expect(entries).toEqual([
      ['a', '1'],
      ['b', '2'],
      ['c', '3'],
    ]);
  });

  it('keys() should iterate over keys', () => {
    const params = new URLSearchParams('a=1&b=2&c=3');
    const keys = Array.from(params.keys());
    expect(keys).toEqual(['a', 'b', 'c']);
  });

  it('values() should iterate over values', () => {
    const params = new URLSearchParams('a=1&b=2&c=3');
    const values = Array.from(params.values());
    expect(values).toEqual(['1', '2', '3']);
  });

  it('Symbol.iterator should work with for...of', () => {
    const params = new URLSearchParams('a=1&b=2');
    const result = [];
    for (const pair of params) {
      result.push(pair);
    }
    expect(result).toEqual([
      ['a', '1'],
      ['b', '2'],
    ]);
  });

  it('should work with spread operator', () => {
    const params = new URLSearchParams('a=1&b=2');
    expect([...params]).toEqual([
      ['a', '1'],
      ['b', '2'],
    ]);
  });
});

// =============================================================================
// MDN examples (for additional completeness)
// =============================================================================
describe('URLSearchParams — MDN examples', () => {
  it('should pass the basic usage example', () => {
    const paramsString = 'q=URLUtils.searchParams&topic=api';
    const searchParams = new URLSearchParams(paramsString);

    expect(searchParams.has('topic')).toBe(true);
    expect(searchParams.get('topic')).toBe('api');
    expect(searchParams.getAll('topic')).toEqual(['api']);
    expect(searchParams.get('foo')).toBe(null);
    searchParams.append('topic', 'webdev');
    expect(searchParams.toString()).toBe(
      'q=URLUtils.searchParams&topic=api&topic=webdev',
    );
    searchParams.set('topic', 'More webdev');
    expect(searchParams.toString()).toBe(
      'q=URLUtils.searchParams&topic=More+webdev',
    );
    searchParams.delete('topic');
    expect(searchParams.toString()).toBe('q=URLUtils.searchParams');
  });

  it('should handle object construction', () => {
    const paramsObj = {foo: 'bar', baz: 'bar'};
    const searchParams = new URLSearchParams(paramsObj);
    expect(searchParams.toString()).toBe('foo=bar&baz=bar');
    expect(searchParams.has('foo')).toBe(true);
    expect(searchParams.get('foo')).toBe('bar');
  });

  it('should handle duplicate search parameters', () => {
    const paramStr = 'foo=bar&foo=baz';
    const searchParams = new URLSearchParams(paramStr);
    expect(searchParams.toString()).toBe('foo=bar&foo=baz');
    expect(searchParams.has('foo')).toBe(true);
    expect(searchParams.get('foo')).toBe('bar');
    expect(searchParams.getAll('foo')).toEqual(['bar', 'baz']);
  });

  it('should not parse full URLs (no URL parsing)', () => {
    const paramsString1 = 'http://example.com/search?query=%40';
    const searchParams1 = new URLSearchParams(paramsString1);

    expect(searchParams1.has('query')).toBe(false);
    expect(searchParams1.has('http://example.com/search?query')).toBe(true);
    expect(searchParams1.get('query')).toBe(null);
    expect(searchParams1.get('http://example.com/search?query')).toBe('@');
  });

  it('should strip leading "?" from query string', () => {
    const params = new URLSearchParams('?query=value');
    expect(params.has('query')).toBe(true);
  });

  it('should handle empty value vs no value', () => {
    const emptyVal = new URLSearchParams('foo=&bar=baz');
    expect(emptyVal.get('foo')).toBe('');
    const noEquals = new URLSearchParams('foo&bar=baz');
    expect(noEquals.get('foo')).toBe('');
    expect(noEquals.toString()).toBe('foo=&bar=baz');
  });
});
