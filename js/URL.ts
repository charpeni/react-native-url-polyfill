/**
 * A self-contained implementation of the WHATWG URL Standard
 * (https://url.spec.whatwg.org/) for `URL` and `URLSearchParams`.
 *
 * This implementation intentionally omits Unicode/IDNA host processing
 * (punycode encoding, hostname mapping and normalization such as fullwidth
 * characters) to keep the bundle size small. Non-ASCII hostnames are passed
 * through as-is instead of being converted with IDNA's domain-to-ASCII.
 * Everything else follows the specification, including the basic URL parser
 * state machine, IPv4/IPv6 parsing, percent-encoding sets, and the
 * application/x-www-form-urlencoded format.
 *
 * The source is TypeScript restricted to erasable syntax (type annotations
 * only, no enums or namespaces), so it can be executed directly by Node.js
 * via type stripping. The published package ships the compiled JavaScript.
 */

import {NativeModules} from 'react-native';

const FAILURE = Symbol('failure');
type Failure = typeof FAILURE;

// =============================================================================
// UTF-8 encoding and decoding
// =============================================================================
/* eslint-disable no-bitwise */

/**
 * UTF-8 encode a string into an array of bytes. Lone surrogates are replaced
 * with U+FFFD, matching WebIDL's USVString conversion.
 */
function utf8Encode(string: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < string.length; i++) {
    let codePoint = string.codePointAt(i) as number;
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
      codePoint = 0xfffd;
    } else if (codePoint > 0xffff) {
      i++;
    }
    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }
  return bytes;
}

/**
 * UTF-8 decode an array of bytes into a string, emitting U+FFFD for invalid
 * sequences (https://encoding.spec.whatwg.org/#utf-8-decoder).
 */
function utf8Decode(bytes: number[]): string {
  let output = '';
  let codePoint = 0;
  let bytesSeen = 0;
  let bytesNeeded = 0;
  let lowerBoundary = 0x80;
  let upperBoundary = 0xbf;

  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (bytesNeeded === 0) {
      if (byte <= 0x7f) {
        output += String.fromCharCode(byte);
      } else if (byte >= 0xc2 && byte <= 0xdf) {
        bytesNeeded = 1;
        codePoint = byte & 0x1f;
      } else if (byte >= 0xe0 && byte <= 0xef) {
        if (byte === 0xe0) {
          lowerBoundary = 0xa0;
        }
        if (byte === 0xed) {
          upperBoundary = 0x9f;
        }
        bytesNeeded = 2;
        codePoint = byte & 0xf;
      } else if (byte >= 0xf0 && byte <= 0xf4) {
        if (byte === 0xf0) {
          lowerBoundary = 0x90;
        }
        if (byte === 0xf4) {
          upperBoundary = 0x8f;
        }
        bytesNeeded = 3;
        codePoint = byte & 0x7;
      } else {
        output += '�';
      }
      continue;
    }
    if (byte < lowerBoundary || byte > upperBoundary) {
      codePoint = 0;
      bytesNeeded = 0;
      bytesSeen = 0;
      lowerBoundary = 0x80;
      upperBoundary = 0xbf;
      output += '�';
      i--;
      continue;
    }
    lowerBoundary = 0x80;
    upperBoundary = 0xbf;
    codePoint = (codePoint << 6) | (byte & 0x3f);
    bytesSeen++;
    if (bytesSeen === bytesNeeded) {
      output += String.fromCodePoint(codePoint);
      codePoint = 0;
      bytesNeeded = 0;
      bytesSeen = 0;
    }
  }
  if (bytesNeeded !== 0) {
    output += '�';
  }
  return output;
}
/* eslint-enable no-bitwise */

// =============================================================================
// Percent-encoding and decoding
// =============================================================================

function isASCIIDigit(c: string | undefined): boolean {
  const code = c?.charCodeAt(0) ?? -1;
  return code >= 0x30 && code <= 0x39;
}

function isASCIIAlpha(c: string | undefined): boolean {
  const code = c?.charCodeAt(0) ?? -1;
  return (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);
}

function isASCIIAlphanumeric(c: string | undefined): boolean {
  const code = c?.charCodeAt(0) ?? -1;
  return (
    (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a)
  );
}

function isASCIIHexDigit(c: string | undefined): boolean {
  const code = c?.charCodeAt(0) ?? -1;
  return (
    (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x46) ||
    (code >= 0x61 && code <= 0x66)
  );
}

// Percent-encode sets (https://url.spec.whatwg.org/#percent-encoded-bytes),
// expressed as 128-entry lookup tables over the ASCII code points. Every code
// point outside ASCII (>= 0x80) is in every set, so the membership check in
// the parser's per-code-point hot path is a single range test plus an indexed
// load. Each set is built from its spec base set plus extra code points
// (single values or inclusive `[from, to]` ranges).
type PercentEncodeSet = Uint8Array;

function percentEncodeSet(
  base: PercentEncodeSet | null,
  ...codePoints: Array<number | [number, number]>
): PercentEncodeSet {
  const table = new Uint8Array(0x80);
  if (base !== null) {
    table.set(base);
  }
  for (const entry of codePoints) {
    if (typeof entry === 'number') {
      table[entry] = 1;
    } else {
      for (let codePoint = entry[0]; codePoint <= entry[1]; codePoint++) {
        table[codePoint] = 1;
      }
    }
  }
  return table;
}

const C0_CONTROL_SET = percentEncodeSet(null, [0x00, 0x1f], 0x7f);
const FRAGMENT_SET = percentEncodeSet(
  C0_CONTROL_SET,
  0x20,
  0x22,
  0x3c,
  0x3e,
  0x60,
);
const QUERY_SET = percentEncodeSet(
  C0_CONTROL_SET,
  0x20,
  0x22,
  0x23,
  0x3c,
  0x3e,
);
const SPECIAL_QUERY_SET = percentEncodeSet(QUERY_SET, 0x27);
const PATH_SET = percentEncodeSet(QUERY_SET, 0x3f, 0x5e, 0x60, 0x7b, 0x7d);
const USERINFO_SET = percentEncodeSet(
  PATH_SET,
  0x2f,
  0x3a,
  0x3b,
  0x3d,
  0x40,
  [0x5b, 0x5e],
  0x7c,
);

const HEX_DIGITS = '0123456789ABCDEF';

function percentEncodeByte(byte: number): string {
  return '%' + HEX_DIGITS[Math.floor(byte / 16)] + HEX_DIGITS[byte % 16];
}

/**
 * UTF-8 percent-encode a single code point (given as a string) using the
 * provided percent-encode set.
 */
function utf8PercentEncode(
  codePointString: string,
  set: PercentEncodeSet,
): string {
  const codePoint = codePointString.codePointAt(0) as number;
  if (codePoint < 0x80 && set[codePoint] === 0) {
    return codePointString;
  }
  if (codePoint < 0x80) {
    return percentEncodeByte(codePoint);
  }
  if (codePoint < 0x800) {
    return (
      percentEncodeByte(0xc0 + Math.floor(codePoint / 64)) +
      percentEncodeByte(0x80 + (codePoint % 64))
    );
  }
  if (codePoint < 0x10000) {
    return (
      percentEncodeByte(0xe0 + Math.floor(codePoint / 4096)) +
      percentEncodeByte(0x80 + (Math.floor(codePoint / 64) % 64)) +
      percentEncodeByte(0x80 + (codePoint % 64))
    );
  }
  return (
    percentEncodeByte(0xf0 + Math.floor(codePoint / 262144)) +
    percentEncodeByte(0x80 + (Math.floor(codePoint / 4096) % 64)) +
    percentEncodeByte(0x80 + (Math.floor(codePoint / 64) % 64)) +
    percentEncodeByte(0x80 + (codePoint % 64))
  );
}

/**
 * UTF-8 percent-encode every code point of a string using the provided
 * percent-encode set.
 */
function utf8PercentEncodeString(
  string: string,
  set: PercentEncodeSet,
): string {
  // Fast path: scan for the first code unit that needs encoding; most
  // strings have none and are returned unchanged.
  let start = 0;
  while (start < string.length) {
    const code = string.charCodeAt(start);
    if (code >= 0x80 || set[code] === 1) {
      break;
    }
    start++;
  }
  if (start === string.length) {
    return string;
  }
  let output = string.slice(0, start);
  for (const codePointString of string.slice(start)) {
    output += utf8PercentEncode(codePointString, set);
  }
  return output;
}

/**
 * The numeric value of an ASCII hex digit byte, or -1.
 */
function hexDigitValue(byte: number): number {
  if (byte >= 0x30 && byte <= 0x39) {
    return byte - 0x30;
  }
  if (byte >= 0x41 && byte <= 0x46) {
    return byte - 0x41 + 10;
  }
  if (byte >= 0x61 && byte <= 0x66) {
    return byte - 0x61 + 10;
  }
  return -1;
}

/**
 * Percent-decode an array of bytes into another array of bytes.
 */
function percentDecodeBytes(bytes: number[]): number[] {
  const output: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte === 0x25 && i + 2 < bytes.length) {
      const high = hexDigitValue(bytes[i + 1]);
      const low = hexDigitValue(bytes[i + 2]);
      if (high !== -1 && low !== -1) {
        output.push(high * 16 + low);
        i += 2;
        continue;
      }
    }
    output.push(byte);
  }
  return output;
}

/**
 * UTF-8 encode a string, percent-decode the bytes, and UTF-8 decode the
 * result back into a string.
 */
function percentDecodeString(string: string): string {
  // Fast path: an ASCII string with no '%' decodes to itself (the UTF-8
  // round-trip is only observable for non-ASCII input and lone surrogates).
  let needsDecoding = false;
  for (let i = 0; i < string.length; i++) {
    const code = string.charCodeAt(i);
    if (code === 0x25 || code >= 0x80) {
      needsDecoding = true;
      break;
    }
  }
  if (!needsDecoding) {
    return string;
  }
  return utf8Decode(percentDecodeBytes(utf8Encode(string)));
}

// =============================================================================
// Host parsing and serialization
// (https://url.spec.whatwg.org/#host-representation)
//
// Hosts are stored in their serialized string form (domain, opaque host,
// empty host, dotted-quad IPv4, or bracketed IPv6). IPv4/IPv6 addresses are
// parsed to their numeric form for validation and normalization, then
// serialized once at parse time — getters read the record without
// re-serializing (https://url.spec.whatwg.org/#host-serializing).
// =============================================================================

type Host = string;

// https://url.spec.whatwg.org/#forbidden-host-code-point: U+0000, TAB, LF,
// CR, SPACE, #, /, :, <, >, ?, @, [, \, ], ^, |. The forbidden domain code
// points additionally include the remaining C0 controls, %, and U+007F.
const FORBIDDEN_HOST_CODE_POINTS = /[\0\t\n\r #/:<>?@[\\\]^|]/;
// eslint-disable-next-line no-control-regex -- C0 controls are intentional.
const FORBIDDEN_DOMAIN_CODE_POINTS = /[\0-\x1f\x7f %#/:<>?@[\\\]^|]/;

function containsForbiddenHostCodePoint(string: string): boolean {
  return FORBIDDEN_HOST_CODE_POINTS.test(string);
}

function containsForbiddenDomainCodePoint(string: string): boolean {
  return FORBIDDEN_DOMAIN_CODE_POINTS.test(string);
}

/**
 * A minimal substitute for IDNA's domain-to-ASCII: ASCII-lowercase the domain
 * and pass everything else through unchanged. This is the "without Unicode"
 * trade-off — no punycode encoding or Unicode normalization is performed, so
 * non-ASCII domains are not converted (and are left as-is in the host).
 *
 * U+FFFD is rejected like IDNA does: it only appears here when the host
 * percent-decoded to invalid UTF-8.
 */
function domainToASCII(domain: string): string | Failure {
  if (domain.includes('�')) {
    return FAILURE;
  }
  // Fast path: for all-ASCII domains (the norm), `toLowerCase` is exactly
  // "lowercase A-Z only".
  let ascii = true;
  for (let i = 0; i < domain.length; i++) {
    if (domain.charCodeAt(i) >= 0x80) {
      ascii = false;
      break;
    }
  }
  if (ascii) {
    return domain.toLowerCase();
  }
  let output = '';
  for (const c of domain) {
    output += c >= 'A' && c <= 'Z' ? c.toLowerCase() : c;
  }
  return output;
}

/**
 * https://url.spec.whatwg.org/#ipv4-number-parser
 * Returns the parsed number or FAILURE.
 */
function parseIPv4Number(input: string): number | Failure {
  if (input === '') {
    return FAILURE;
  }
  let radix = 10;
  if (input.length >= 2 && (input.startsWith('0x') || input.startsWith('0X'))) {
    input = input.substring(2);
    radix = 16;
  } else if (input.length >= 2 && input[0] === '0') {
    input = input.substring(1);
    radix = 8;
  }
  if (input === '') {
    return 0;
  }
  const validationRegex =
    radix === 16 ? /^[0-9A-Fa-f]+$/ : radix === 8 ? /^[0-7]+$/ : /^[0-9]+$/;
  if (!validationRegex.test(input)) {
    return FAILURE;
  }
  return parseInt(input, radix);
}

/**
 * https://url.spec.whatwg.org/#ends-in-a-number-checker
 */
function endsInANumber(input: string): boolean {
  if (input === '') {
    return false;
  }
  // The last dot-delimited label, ignoring a single trailing dot.
  let end = input.length;
  if (input.charCodeAt(end - 1) === 0x2e /* '.' */) {
    if (end === 1) {
      return false;
    }
    end--;
  }
  const start = input.lastIndexOf('.', end - 1) + 1;
  // Fast reject: every form the IPv4 number parser accepts starts with an
  // ASCII digit ("0x"/"0" prefixes included). This skips the substring
  // allocation for typical domains.
  const first = input.charCodeAt(start);
  if (!(first >= 0x30 && first <= 0x39)) {
    return false;
  }
  const last = input.slice(start, end);
  if (/^[0-9]+$/.test(last)) {
    return true;
  }
  return parseIPv4Number(last) !== FAILURE;
}

/**
 * https://url.spec.whatwg.org/#concept-ipv4-parser
 * Returns the address as a number, or FAILURE.
 */
function parseIPv4(input: string): number | Failure {
  const parts = input.split('.');
  if (parts[parts.length - 1] === '' && parts.length > 1) {
    parts.pop();
  }
  if (parts.length > 4) {
    return FAILURE;
  }
  const numbers: number[] = [];
  for (const part of parts) {
    const result = parseIPv4Number(part);
    if (result === FAILURE) {
      return FAILURE;
    }
    numbers.push(result);
  }
  for (let i = 0; i < numbers.length - 1; i++) {
    if (numbers[i] > 255) {
      return FAILURE;
    }
  }
  if (numbers[numbers.length - 1] >= 256 ** (5 - numbers.length)) {
    return FAILURE;
  }
  let ipv4 = numbers.pop() as number;
  for (let counter = 0; counter < numbers.length; counter++) {
    ipv4 += numbers[counter] * 256 ** (3 - counter);
  }
  return ipv4;
}

function serializeIPv4(address: number): string {
  return (
    (address >>> 24) +
    '.' +
    ((address >>> 16) & 0xff) +
    '.' +
    ((address >>> 8) & 0xff) +
    '.' +
    (address & 0xff)
  );
}

/**
 * https://url.spec.whatwg.org/#concept-ipv6-parser
 * Returns the address as an array of eight 16-bit pieces, or FAILURE.
 */
function parseIPv6(input: string): number[] | Failure {
  const address = [0, 0, 0, 0, 0, 0, 0, 0];
  let pieceIndex = 0;
  let compress: number | null = null;
  let pointer = 0;

  if (input[pointer] === ':') {
    if (input[pointer + 1] !== ':') {
      return FAILURE;
    }
    pointer += 2;
    pieceIndex++;
    compress = pieceIndex;
  }

  while (pointer < input.length) {
    if (pieceIndex === 8) {
      return FAILURE;
    }
    if (input[pointer] === ':') {
      if (compress !== null) {
        return FAILURE;
      }
      pointer++;
      pieceIndex++;
      compress = pieceIndex;
      continue;
    }
    let value = 0;
    let length = 0;
    while (length < 4 && isASCIIHexDigit(input[pointer])) {
      value = value * 0x10 + parseInt(input[pointer], 16);
      pointer++;
      length++;
    }
    if (input[pointer] === '.') {
      if (length === 0) {
        return FAILURE;
      }
      pointer -= length;
      if (pieceIndex > 6) {
        return FAILURE;
      }
      let numbersSeen = 0;
      while (pointer < input.length) {
        let ipv4Piece: number | null = null;
        if (numbersSeen > 0) {
          if (input[pointer] === '.' && numbersSeen < 4) {
            pointer++;
          } else {
            return FAILURE;
          }
        }
        if (!isASCIIDigit(input[pointer])) {
          return FAILURE;
        }
        while (isASCIIDigit(input[pointer])) {
          const number = parseInt(input[pointer], 10);
          if (ipv4Piece === null) {
            ipv4Piece = number;
          } else if (ipv4Piece === 0) {
            return FAILURE;
          } else {
            ipv4Piece = ipv4Piece * 10 + number;
          }
          if (ipv4Piece > 255) {
            return FAILURE;
          }
          pointer++;
        }
        address[pieceIndex] =
          address[pieceIndex] * 0x100 + (ipv4Piece as number);
        numbersSeen++;
        if (numbersSeen === 2 || numbersSeen === 4) {
          pieceIndex++;
        }
      }
      if (numbersSeen !== 4) {
        return FAILURE;
      }
      break;
    } else if (input[pointer] === ':') {
      pointer++;
      if (pointer === input.length) {
        return FAILURE;
      }
    } else if (pointer < input.length) {
      return FAILURE;
    }
    address[pieceIndex] = value;
    pieceIndex++;
  }

  if (compress !== null) {
    let swaps = pieceIndex - compress;
    pieceIndex = 7;
    while (pieceIndex !== 0 && swaps > 0) {
      const temp = address[compress + swaps - 1];
      address[compress + swaps - 1] = address[pieceIndex];
      address[pieceIndex] = temp;
      pieceIndex--;
      swaps--;
    }
  } else if (pieceIndex !== 8) {
    return FAILURE;
  }
  return address;
}

function serializeIPv6(address: number[]): string {
  let output = '';

  // Find the longest sequence of zero pieces (longer than one piece).
  let compress: number | null = null;
  let maxLength = 1;
  let currentStart: number | null = null;
  let currentLength = 0;
  for (let i = 0; i < 8; i++) {
    if (address[i] === 0) {
      if (currentStart === null) {
        currentStart = i;
      }
      currentLength++;
      if (currentLength > maxLength) {
        maxLength = currentLength;
        compress = currentStart;
      }
    } else {
      currentStart = null;
      currentLength = 0;
    }
  }

  let ignore0 = false;
  for (let pieceIndex = 0; pieceIndex < 8; pieceIndex++) {
    if (ignore0 && address[pieceIndex] === 0) {
      continue;
    }
    ignore0 = false;
    if (compress === pieceIndex) {
      output += pieceIndex === 0 ? '::' : ':';
      ignore0 = true;
      continue;
    }
    output += address[pieceIndex].toString(16);
    if (pieceIndex !== 7) {
      output += ':';
    }
  }
  return output;
}

/**
 * https://url.spec.whatwg.org/#concept-opaque-host-parser
 */
function parseOpaqueHost(input: string): string | Failure {
  if (containsForbiddenHostCodePoint(input.replace(/%/g, ''))) {
    return FAILURE;
  }
  return utf8PercentEncodeString(input, C0_CONTROL_SET);
}

/**
 * https://url.spec.whatwg.org/#concept-host-parser
 */
function parseHost(input: string, isOpaque: boolean): Host | Failure {
  if (input[0] === '[') {
    if (input[input.length - 1] !== ']') {
      return FAILURE;
    }
    const address = parseIPv6(input.substring(1, input.length - 1));
    if (address === FAILURE) {
      return FAILURE;
    }
    return '[' + serializeIPv6(address) + ']';
  }
  if (isOpaque) {
    return parseOpaqueHost(input);
  }
  const domain = percentDecodeString(input);
  const asciiDomain = domainToASCII(domain);
  if (asciiDomain === FAILURE) {
    return FAILURE;
  }
  if (containsForbiddenDomainCodePoint(asciiDomain)) {
    return FAILURE;
  }
  if (endsInANumber(asciiDomain)) {
    const address = parseIPv4(asciiDomain);
    if (address === FAILURE) {
      return FAILURE;
    }
    return serializeIPv4(address);
  }
  return asciiDomain;
}

// =============================================================================
// URL records and the basic URL parser
// (https://url.spec.whatwg.org/#url-representation)
// =============================================================================

// A null prototype is required for correctness: schemes are looked up with
// `in`, and a plain object literal would inherit `Object.prototype`, wrongly
// treating the scheme "constructor" as special.
const SPECIAL_SCHEMES: {readonly [scheme: string]: number | null | undefined} =
  Object.assign(Object.create(null), {
    ftp: 21,
    file: null,
    http: 80,
    https: 443,
    ws: 80,
    wss: 443,
  });

interface URLRecord {
  scheme: string;
  username: string;
  password: string;
  host: Host | null;
  port: number | null;
  /**
   * A list of path segments, or a plain string for URLs with an opaque path
   * (https://url.spec.whatwg.org/#url-opaque-path).
   */
  path: string[] | string;
  query: string | null;
  fragment: string | null;
}

function isSpecial(url: URLRecord): boolean {
  // Direct comparisons instead of a `in SPECIAL_SCHEMES` lookup: this runs in
  // the parser hot path, and comparing against interned literals is cheaper
  // than a property lookup.
  const {scheme} = url;
  return (
    scheme === 'https' ||
    scheme === 'http' ||
    scheme === 'ws' ||
    scheme === 'wss' ||
    scheme === 'ftp' ||
    scheme === 'file'
  );
}

function defaultPort(scheme: string): number | null | undefined {
  return SPECIAL_SCHEMES[scheme];
}

function createURLRecord(): URLRecord {
  return {
    scheme: '',
    username: '',
    password: '',
    host: null,
    port: null,
    path: [],
    query: null,
    fragment: null,
  };
}

function hasOpaquePath(url: URLRecord): url is URLRecord & {path: string} {
  return typeof url.path === 'string';
}

function includesCredentials(url: URLRecord): boolean {
  return url.username !== '' || url.password !== '';
}

function cannotHaveUsernamePasswordPort(url: URLRecord): boolean {
  return url.host === null || url.host === '' || url.scheme === 'file';
}

function isWindowsDriveLetter(string: string): boolean {
  return (
    string.length === 2 &&
    isASCIIAlpha(string[0]) &&
    (string[1] === ':' || string[1] === '|')
  );
}

function isNormalizedWindowsDriveLetter(string: string): boolean {
  return string.length === 2 && isASCIIAlpha(string[0]) && string[1] === ':';
}

/**
 * https://url.spec.whatwg.org/#start-with-a-windows-drive-letter
 */
function startsWithWindowsDriveLetter(
  input: string[],
  pointer: number,
): boolean {
  const length = input.length - pointer;
  return (
    length >= 2 &&
    isWindowsDriveLetter(input[pointer] + input[pointer + 1]) &&
    (length === 2 ||
      input[pointer + 2] === '/' ||
      input[pointer + 2] === '\\' ||
      input[pointer + 2] === '?' ||
      input[pointer + 2] === '#')
  );
}

/**
 * https://url.spec.whatwg.org/#shorten-a-urls-path
 */
function shortenPath(url: URLRecord): void {
  // This is only ever called with a list path (never an opaque path).
  const path = url.path as string[];
  if (path.length === 0) {
    return;
  }
  if (
    url.scheme === 'file' &&
    path.length === 1 &&
    isNormalizedWindowsDriveLetter(path[0])
  ) {
    return;
  }
  path.pop();
}

/**
 * https://url.spec.whatwg.org/#potentially-strip-trailing-spaces-from-an-opaque-path
 */
function potentiallyStripTrailingSpacesFromOpaquePath(url: URLRecord): void {
  if (!hasOpaquePath(url)) {
    return;
  }
  if (url.fragment !== null || url.query !== null) {
    return;
  }
  url.path = (url.path as string).replace(/ +$/, '');
}

function isSingleDot(buffer: string): boolean {
  if (buffer === '.') {
    return true;
  }
  return buffer.length === 3 && buffer.toLowerCase() === '%2e';
}

function isDoubleDot(buffer: string): boolean {
  if (buffer === '..') {
    return true;
  }
  if (buffer.length !== 4 && buffer.length !== 6) {
    return false;
  }
  const lowered = buffer.toLowerCase();
  return lowered === '.%2e' || lowered === '%2e.' || lowered === '%2e%2e';
}

// Parser states.
const SCHEME_START = 1;
const SCHEME = 2;
const NO_SCHEME = 3;
const SPECIAL_RELATIVE_OR_AUTHORITY = 4;
const PATH_OR_AUTHORITY = 5;
const RELATIVE = 6;
const RELATIVE_SLASH = 7;
const SPECIAL_AUTHORITY_SLASHES = 8;
const SPECIAL_AUTHORITY_IGNORE_SLASHES = 9;
const AUTHORITY = 10;
const HOST = 11;
const HOSTNAME = 12;
const PORT = 13;
const FILE = 14;
const FILE_SLASH = 15;
const FILE_HOST = 16;
const PATH_START = 17;
const PATH = 18;
const OPAQUE_PATH = 19;
const QUERY = 20;
const FRAGMENT = 21;

/**
 * The basic URL parser (https://url.spec.whatwg.org/#concept-basic-url-parser).
 *
 * Returns a URL record, or FAILURE. When `url` and `stateOverride` are given,
 * the passed record is modified in place (used by the URL setters).
 */
function parseURL(
  rawInput: string,
  base: URLRecord | null = null,
  url: URLRecord | null = null,
  stateOverride: number | null = null,
): URLRecord | Failure {
  return parseURLFromUSVString(toUSVString(rawInput), base, url, stateOverride);
}

function parseURLFromUSVString(
  input: string,
  base: URLRecord | null = null,
  url: URLRecord | null = null,
  stateOverride: number | null = null,
): URLRecord | Failure {
  if (url === null) {
    url = createURLRecord();
    // Remove leading and trailing C0 controls and spaces. The regexes only
    // run when the first/last code unit needs trimming: an unanchored `...$`
    // pattern otherwise scans (and fails) at every position.
    if (input.length > 0 && input.charCodeAt(0) <= 0x20) {
      input = input.replace(/^[\0- ]+/, '');
    }
    if (input.length > 0 && input.charCodeAt(input.length - 1) <= 0x20) {
      input = input.replace(/[\0- ]+$/, '');
    }
  }
  // Remove all ASCII tabs and newlines.
  input = input.replace(/[\t\n\r]/g, '');

  let state = stateOverride !== null ? stateOverride : SCHEME_START;
  let buffer = '';
  let atSignSeen = false;
  let insideBrackets = false;
  let passwordTokenSeen = false;

  // Iterate over code points; each entry is a full code point as a string.
  // `split('')` splits by code unit — only fall back to the (slower)
  // iterator-based `Array.from` when surrogates make the two differ.
  const codePoints = /[\uD800-\uDFFF]/.test(input)
    ? Array.from(input)
    : input.split('');

  for (let pointer = 0; pointer <= codePoints.length; pointer++) {
    const c = pointer < codePoints.length ? codePoints[pointer] : undefined;

    switch (state) {
      case SCHEME_START: {
        if (c !== undefined && isASCIIAlpha(c)) {
          buffer += c.toLowerCase();
          state = SCHEME;
        } else if (stateOverride === null) {
          state = NO_SCHEME;
          pointer--;
        } else {
          return FAILURE;
        }
        break;
      }

      case SCHEME: {
        if (
          c !== undefined &&
          (isASCIIAlphanumeric(c) || c === '+' || c === '-' || c === '.')
        ) {
          buffer += c.toLowerCase();
        } else if (c === ':') {
          if (stateOverride !== null) {
            const bufferIsSpecial = buffer in SPECIAL_SCHEMES;
            if (isSpecial(url) !== bufferIsSpecial) {
              return url;
            }
            if (
              (includesCredentials(url) || url.port !== null) &&
              buffer === 'file'
            ) {
              return url;
            }
            if (url.scheme === 'file' && url.host === '') {
              return url;
            }
          }
          url.scheme = buffer;
          if (stateOverride !== null) {
            if (url.port === defaultPort(url.scheme)) {
              url.port = null;
            }
            return url;
          }
          buffer = '';
          if (url.scheme === 'file') {
            state = FILE;
          } else if (
            isSpecial(url) &&
            base !== null &&
            base.scheme === url.scheme
          ) {
            state = SPECIAL_RELATIVE_OR_AUTHORITY;
          } else if (isSpecial(url)) {
            state = SPECIAL_AUTHORITY_SLASHES;
          } else if (codePoints[pointer + 1] === '/') {
            state = PATH_OR_AUTHORITY;
            pointer++;
          } else {
            url.path = '';
            state = OPAQUE_PATH;
          }
        } else if (stateOverride === null) {
          buffer = '';
          state = NO_SCHEME;
          pointer = -1;
        } else {
          return FAILURE;
        }
        break;
      }

      case NO_SCHEME: {
        if (base === null || (hasOpaquePath(base) && c !== '#')) {
          return FAILURE;
        }
        if (hasOpaquePath(base) && c === '#') {
          url.scheme = base.scheme;
          url.path = base.path;
          url.query = base.query;
          url.fragment = '';
          state = FRAGMENT;
        } else if (base.scheme !== 'file') {
          state = RELATIVE;
          pointer--;
        } else {
          state = FILE;
          pointer--;
        }
        break;
      }

      case SPECIAL_RELATIVE_OR_AUTHORITY: {
        if (c === '/' && codePoints[pointer + 1] === '/') {
          state = SPECIAL_AUTHORITY_IGNORE_SLASHES;
          pointer++;
        } else {
          state = RELATIVE;
          pointer--;
        }
        break;
      }

      case PATH_OR_AUTHORITY: {
        if (c === '/') {
          state = AUTHORITY;
        } else {
          state = PATH;
          pointer--;
        }
        break;
      }

      case RELATIVE: {
        // The RELATIVE state is only reachable when a base URL exists.
        const baseRecord = base as URLRecord;
        url.scheme = baseRecord.scheme;
        if (c === '/' || (c === '\\' && isSpecial(url))) {
          state = RELATIVE_SLASH;
        } else {
          url.username = baseRecord.username;
          url.password = baseRecord.password;
          url.host = baseRecord.host;
          url.port = baseRecord.port;
          url.path = baseRecord.path.slice();
          url.query = baseRecord.query;
          if (c === '?') {
            url.query = '';
            state = QUERY;
          } else if (c === '#') {
            url.fragment = '';
            state = FRAGMENT;
          } else if (c !== undefined) {
            url.query = null;
            shortenPath(url);
            state = PATH;
            pointer--;
          }
        }
        break;
      }

      case RELATIVE_SLASH: {
        // The RELATIVE_SLASH state is only reachable when a base URL exists.
        const baseRecord = base as URLRecord;
        if ((c === '/' || c === '\\') && isSpecial(url)) {
          state = SPECIAL_AUTHORITY_IGNORE_SLASHES;
        } else if (c === '/') {
          state = AUTHORITY;
        } else {
          url.username = baseRecord.username;
          url.password = baseRecord.password;
          url.host = baseRecord.host;
          url.port = baseRecord.port;
          state = PATH;
          pointer--;
        }
        break;
      }

      case SPECIAL_AUTHORITY_SLASHES: {
        if (c === '/' && codePoints[pointer + 1] === '/') {
          state = SPECIAL_AUTHORITY_IGNORE_SLASHES;
          pointer++;
        } else {
          state = SPECIAL_AUTHORITY_IGNORE_SLASHES;
          pointer--;
        }
        break;
      }

      case SPECIAL_AUTHORITY_IGNORE_SLASHES: {
        if (c !== '/' && c !== '\\') {
          state = AUTHORITY;
          pointer--;
        }
        break;
      }

      case AUTHORITY: {
        if (c === '@') {
          if (atSignSeen) {
            buffer = '%40' + buffer;
          }
          atSignSeen = true;
          for (const codePointString of buffer) {
            if (codePointString === ':' && !passwordTokenSeen) {
              passwordTokenSeen = true;
              continue;
            }
            const encoded = utf8PercentEncode(codePointString, USERINFO_SET);
            if (passwordTokenSeen) {
              url.password += encoded;
            } else {
              url.username += encoded;
            }
          }
          buffer = '';
        } else if (
          c === undefined ||
          c === '/' ||
          c === '?' ||
          c === '#' ||
          (c === '\\' && isSpecial(url))
        ) {
          if (atSignSeen && buffer === '') {
            return FAILURE;
          }
          pointer -= Array.from(buffer).length + 1;
          buffer = '';
          state = HOST;
        } else {
          buffer += c;
        }
        break;
      }

      case HOST:
      case HOSTNAME: {
        if (stateOverride !== null && url.scheme === 'file') {
          pointer--;
          state = FILE_HOST;
        } else if (c === ':' && !insideBrackets) {
          if (buffer === '') {
            return FAILURE;
          }
          if (stateOverride === HOSTNAME) {
            return url;
          }
          const host = parseHost(buffer, !isSpecial(url));
          if (host === FAILURE) {
            return FAILURE;
          }
          url.host = host;
          buffer = '';
          state = PORT;
        } else if (
          c === undefined ||
          c === '/' ||
          c === '?' ||
          c === '#' ||
          (c === '\\' && isSpecial(url))
        ) {
          pointer--;
          if (isSpecial(url) && buffer === '') {
            return FAILURE;
          }
          if (
            stateOverride !== null &&
            buffer === '' &&
            (includesCredentials(url) || url.port !== null)
          ) {
            return url;
          }
          const host = parseHost(buffer, !isSpecial(url));
          if (host === FAILURE) {
            return FAILURE;
          }
          url.host = host;
          buffer = '';
          state = PATH_START;
          if (stateOverride !== null) {
            return url;
          }
        } else {
          if (c === '[') {
            insideBrackets = true;
          } else if (c === ']') {
            insideBrackets = false;
          }
          buffer += c;
        }
        break;
      }

      case PORT: {
        if (c !== undefined && isASCIIDigit(c)) {
          buffer += c;
        } else if (
          c === undefined ||
          c === '/' ||
          c === '?' ||
          c === '#' ||
          (c === '\\' && isSpecial(url)) ||
          stateOverride !== null
        ) {
          if (buffer !== '') {
            const port = parseInt(buffer, 10);
            if (port > 2 ** 16 - 1) {
              return FAILURE;
            }
            url.port = port === defaultPort(url.scheme) ? null : port;
            buffer = '';
          }
          if (stateOverride !== null) {
            return url;
          }
          state = PATH_START;
          pointer--;
        } else {
          return FAILURE;
        }
        break;
      }

      case FILE: {
        url.scheme = 'file';
        url.host = '';
        if (c === '/' || c === '\\') {
          state = FILE_SLASH;
        } else if (base !== null && base.scheme === 'file') {
          url.host = base.host;
          url.path = base.path.slice();
          url.query = base.query;
          if (c === '?') {
            url.query = '';
            state = QUERY;
          } else if (c === '#') {
            url.fragment = '';
            state = FRAGMENT;
          } else if (c !== undefined) {
            url.query = null;
            if (!startsWithWindowsDriveLetter(codePoints, pointer)) {
              shortenPath(url);
            } else {
              url.path = [];
            }
            state = PATH;
            pointer--;
          }
        } else {
          state = PATH;
          pointer--;
        }
        break;
      }

      case FILE_SLASH: {
        if (c === '/' || c === '\\') {
          state = FILE_HOST;
        } else {
          if (base !== null && base.scheme === 'file') {
            url.host = base.host;
            if (
              !startsWithWindowsDriveLetter(codePoints, pointer) &&
              isNormalizedWindowsDriveLetter(base.path[0] || '')
            ) {
              (url.path as string[]).push(base.path[0]);
            }
          }
          state = PATH;
          pointer--;
        }
        break;
      }

      case FILE_HOST: {
        if (
          c === undefined ||
          c === '/' ||
          c === '\\' ||
          c === '?' ||
          c === '#'
        ) {
          pointer--;
          if (stateOverride === null && isWindowsDriveLetter(buffer)) {
            state = PATH;
          } else if (buffer === '') {
            url.host = '';
            if (stateOverride !== null) {
              return url;
            }
            state = PATH_START;
          } else {
            let host = parseHost(buffer, !isSpecial(url));
            if (host === FAILURE) {
              return FAILURE;
            }
            if (host === 'localhost') {
              host = '';
            }
            url.host = host;
            if (stateOverride !== null) {
              return url;
            }
            buffer = '';
            state = PATH_START;
          }
        } else {
          buffer += c;
        }
        break;
      }

      case PATH_START: {
        if (isSpecial(url)) {
          state = PATH;
          if (c !== '/' && c !== '\\') {
            pointer--;
          }
        } else if (stateOverride === null && c === '?') {
          url.query = '';
          state = QUERY;
        } else if (stateOverride === null && c === '#') {
          url.fragment = '';
          state = FRAGMENT;
        } else if (c !== undefined) {
          state = PATH;
          if (c !== '/') {
            pointer--;
          }
        } else if (stateOverride !== null && url.host === null) {
          (url.path as string[]).push('');
        }
        break;
      }

      case PATH: {
        if (
          c === undefined ||
          c === '/' ||
          (c === '\\' && isSpecial(url)) ||
          (stateOverride === null && (c === '?' || c === '#'))
        ) {
          if (isDoubleDot(buffer)) {
            shortenPath(url);
            if (c !== '/' && !(c === '\\' && isSpecial(url))) {
              (url.path as string[]).push('');
            }
          } else if (isSingleDot(buffer)) {
            if (c !== '/' && !(c === '\\' && isSpecial(url))) {
              (url.path as string[]).push('');
            }
          } else {
            if (
              url.scheme === 'file' &&
              url.path.length === 0 &&
              isWindowsDriveLetter(buffer)
            ) {
              buffer = buffer[0] + ':';
            }
            (url.path as string[]).push(buffer);
          }
          buffer = '';
          if (c === '?') {
            url.query = '';
            state = QUERY;
          } else if (c === '#') {
            url.fragment = '';
            state = FRAGMENT;
          }
        } else {
          buffer += utf8PercentEncode(c, PATH_SET);
        }
        break;
      }

      case OPAQUE_PATH: {
        if (c === '?') {
          url.query = '';
          state = QUERY;
        } else if (c === '#') {
          url.fragment = '';
          state = FRAGMENT;
        } else if (c !== undefined) {
          if (
            c === ' ' &&
            (codePoints[pointer + 1] === '?' || codePoints[pointer + 1] === '#')
          ) {
            url.path = (url.path as string) + '%20';
          } else {
            url.path =
              (url.path as string) + utf8PercentEncode(c, C0_CONTROL_SET);
          }
        }
        break;
      }

      case QUERY: {
        if ((stateOverride === null && c === '#') || c === undefined) {
          const inSet = isSpecial(url) ? SPECIAL_QUERY_SET : QUERY_SET;
          url.query =
            (url.query as string) + utf8PercentEncodeString(buffer, inSet);
          buffer = '';
          if (c === '#') {
            url.fragment = '';
            state = FRAGMENT;
          }
        } else if (c !== undefined) {
          buffer += c;
        }
        break;
      }

      case FRAGMENT: {
        if (c !== undefined) {
          url.fragment =
            (url.fragment as string) + utf8PercentEncode(c, FRAGMENT_SET);
        }
        break;
      }
    }
  }

  return url;
}

/**
 * https://url.spec.whatwg.org/#url-serializing
 */
function serializeURL(url: URLRecord, excludeFragment = false): string {
  let output = url.scheme + ':';
  if (url.host !== null) {
    output += '//';
    if (includesCredentials(url)) {
      output += url.username;
      if (url.password !== '') {
        output += ':' + url.password;
      }
      output += '@';
    }
    output += url.host;
    if (url.port !== null) {
      output += ':' + url.port;
    }
  } else if (!hasOpaquePath(url) && url.path.length > 1 && url.path[0] === '') {
    // Prevent the start of the path from being parsed back as an authority.
    output += '/.';
  }
  output += serializePath(url);
  if (url.query !== null) {
    output += '?' + url.query;
  }
  if (!excludeFragment && url.fragment !== null) {
    output += '#' + url.fragment;
  }
  return output;
}

function serializePath(url: URLRecord): string {
  if (hasOpaquePath(url)) {
    return url.path;
  }
  let output = '';
  for (const segment of url.path as string[]) {
    output += '/' + segment;
  }
  return output;
}

/**
 * https://url.spec.whatwg.org/#concept-url-origin
 * Returns the serialization of the URL's origin ("null" for opaque origins).
 */
function serializeOrigin(url: URLRecord): string {
  switch (url.scheme) {
    case 'blob': {
      const pathURL = parseURL(serializePath(url));
      if (pathURL === FAILURE) {
        return 'null';
      }
      if (
        pathURL.scheme === 'http' ||
        pathURL.scheme === 'https' ||
        pathURL.scheme === 'file'
      ) {
        return serializeOrigin(pathURL);
      }
      return 'null';
    }
    case 'ftp':
    case 'http':
    case 'https':
    case 'ws':
    case 'wss': {
      let output = url.scheme + '://' + url.host;
      if (url.port !== null) {
        output += ':' + url.port;
      }
      return output;
    }
    default:
      return 'null';
  }
}

// =============================================================================
// application/x-www-form-urlencoded
// (https://url.spec.whatwg.org/#application/x-www-form-urlencoded)
// =============================================================================

/**
 * Parse an application/x-www-form-urlencoded string into a list of
 * name-value pairs.
 */
function decodeUrlencodedComponent(string: string): string {
  // Fast path: an ASCII component with no '+' and no '%' decodes to itself;
  // one scan replaces the `replace` + `percentDecodeString` passes.
  let needsDecoding = false;
  for (let i = 0; i < string.length; i++) {
    const code = string.charCodeAt(i);
    if (code === 0x2b || code === 0x25 || code >= 0x80) {
      needsDecoding = true;
      break;
    }
  }
  if (!needsDecoding) {
    return string;
  }
  return percentDecodeString(string.replace(/\+/g, ' '));
}

function parseUrlencoded(input: string): Array<[string, string]> {
  const output: Array<[string, string]> = [];
  for (const sequence of String(input).split('&')) {
    if (sequence === '') {
      continue;
    }
    const equalsIndex = sequence.indexOf('=');
    const name =
      equalsIndex === -1 ? sequence : sequence.substring(0, equalsIndex);
    const value = equalsIndex === -1 ? '' : sequence.substring(equalsIndex + 1);
    output.push([
      decodeUrlencodedComponent(name),
      decodeUrlencodedComponent(value),
    ]);
  }
  return output;
}

function serializeUrlencodedComponent(value: string): string {
  // Fast path: strings made only of identity code points (and spaces, which
  // just become '+') skip the UTF-8 encode/percent-encode byte loop.
  if (/^[ *\-.0-9A-Z_a-z]*$/.test(value)) {
    return value.includes(' ') ? value.replace(/ /g, '+') : value;
  }
  let output = '';
  for (const byte of utf8Encode(value)) {
    if (byte === 0x20) {
      output += '+';
    } else if (
      byte === 0x2a ||
      byte === 0x2d ||
      byte === 0x2e ||
      (byte >= 0x30 && byte <= 0x39) ||
      (byte >= 0x41 && byte <= 0x5a) ||
      byte === 0x5f ||
      (byte >= 0x61 && byte <= 0x7a)
    ) {
      output += String.fromCharCode(byte);
    } else {
      output += percentEncodeByte(byte);
    }
  }
  return output;
}

/**
 * Serialize a list of name-value pairs into an
 * application/x-www-form-urlencoded string.
 */
function serializeUrlencoded(list: Array<[string, string]>): string {
  let output = '';
  for (const [name, value] of list) {
    if (output !== '') {
      output += '&';
    }
    output +=
      serializeUrlencodedComponent(name) +
      '=' +
      serializeUrlencodedComponent(value);
  }
  return output;
}

// =============================================================================
// URLSearchParams
// (https://url.spec.whatwg.org/#interface-urlsearchparams)
// =============================================================================

type SearchParamsIteratorKind = 'key' | 'value' | 'pair';

interface SearchParamsIteratorInternals {
  params: URLSearchParams;
  kind: SearchParamsIteratorKind;
  index: number;
}

const SEARCH_PARAMS_ITERATOR_INTERNALS = new WeakMap<
  object,
  SearchParamsIteratorInternals
>();

class URLSearchParamsIterator {
  constructor(params: URLSearchParams, kind: SearchParamsIteratorKind) {
    SEARCH_PARAMS_ITERATOR_INTERNALS.set(this, {params, kind, index: 0});
  }

  next(): IteratorResult<string | [string, string]> {
    const internals = SEARCH_PARAMS_ITERATOR_INTERNALS.get(this);
    if (internals === undefined) {
      throw new TypeError('Illegal invocation');
    }
    const list = getSearchParamsInternals(internals.params).list;
    if (internals.index >= list.length) {
      return {value: undefined, done: true};
    }
    const [name, value] = list[internals.index++];
    return {
      value:
        internals.kind === 'key'
          ? name
          : internals.kind === 'value'
            ? value
            : [name, value],
      done: false,
    };
  }
}

const ITERATOR_PROTOTYPE = Object.getPrototypeOf(
  Object.getPrototypeOf([][Symbol.iterator]()),
);
Object.setPrototypeOf(URLSearchParamsIterator.prototype, ITERATOR_PROTOTYPE);
delete (URLSearchParamsIterator.prototype as {constructor?: Function})
  .constructor;
Object.defineProperty(URLSearchParamsIterator.prototype, 'next', {
  ...Object.getOwnPropertyDescriptor(URLSearchParamsIterator.prototype, 'next'),
  enumerable: true,
});
Object.defineProperty(URLSearchParamsIterator.prototype, Symbol.toStringTag, {
  value: 'URLSearchParams Iterator',
  configurable: true,
});

type URLSearchParamsInit =
  | string
  | URLSearchParams
  | Iterable<readonly [string, string]>
  | ReadonlyArray<readonly string[]>
  | Record<string, string>;

interface SearchParamsInternals {
  list: Array<[string, string]>;
  urlObject: URL | null;
  urlQueryIsSerialized: boolean;
}

const SEARCH_PARAMS_INTERNALS = new WeakMap<object, SearchParamsInternals>();

function getSearchParamsInternals(value: object): SearchParamsInternals {
  const internals = SEARCH_PARAMS_INTERNALS.get(value);
  if (internals === undefined) {
    throw new TypeError('Illegal invocation');
  }
  return internals;
}

function toUSVString(value: unknown): string {
  if (typeof value === 'symbol') {
    throw new TypeError('Cannot convert a Symbol value to a string');
  }
  const string = String(value);
  if (!/[\uD800-\uDFFF]/.test(string)) {
    return string;
  }
  let result = '';

  for (let i = 0; i < string.length; i++) {
    const codeUnit = string.charCodeAt(i);
    if (codeUnit < 0xd800 || codeUnit > 0xdfff) {
      result += string[i];
      continue;
    }
    if (
      codeUnit <= 0xdbff &&
      i + 1 < string.length &&
      string.charCodeAt(i + 1) >= 0xdc00 &&
      string.charCodeAt(i + 1) <= 0xdfff
    ) {
      result += string[i] + string[++i];
    } else {
      result += '\uFFFD';
    }
  }

  return result;
}

function requireArguments(
  operation: string,
  actual: number,
  required: number,
): void {
  if (actual < required) {
    throw new TypeError(
      `${operation} requires at least ${required} argument${required === 1 ? '' : 's'}, but only ${actual} present`,
    );
  }
}

export class URLSearchParams {
  constructor(init?: URLSearchParamsInit | null) {
    const internals: SearchParamsInternals = {
      list: [],
      urlObject: null,
      urlQueryIsSerialized: false,
    };
    SEARCH_PARAMS_INTERNALS.set(this, internals);

    if (init === undefined || init === null) {
      return;
    }
    if (typeof init === 'object' || typeof init === 'function') {
      const iterator = (init as Iterable<unknown>)[Symbol.iterator];
      if (iterator !== undefined && iterator !== null) {
        if (typeof iterator !== 'function') {
          throw new TypeError('URLSearchParams initializer is not iterable');
        }
        for (const pair of init as Iterable<Iterable<string>>) {
          if (
            pair === null ||
            pair === undefined ||
            typeof pair[Symbol.iterator] !== 'function'
          ) {
            throw new TypeError(
              "Failed to construct 'URLSearchParams': parameter 1 sequence's element is not iterable.",
            );
          }
          const entry = Array.from(pair, toUSVString);
          if (entry.length !== 2) {
            throw new TypeError(
              "Failed to construct 'URLSearchParams': parameter 1 sequence's element does not contain exactly two elements.",
            );
          }
          internals.list.push([entry[0], entry[1]]);
        }
      } else {
        const record = init as Record<string, unknown>;
        const entries = new Map<string, string>();
        for (const key of Object.keys(record)) {
          entries.set(toUSVString(key), toUSVString(record[key]));
        }
        internals.list = Array.from(entries);
      }
    } else {
      let string = toUSVString(init);
      if (string[0] === '?') {
        string = string.substring(1);
      }
      internals.list = parseUrlencoded(string);
    }
  }

  /**
   * https://url.spec.whatwg.org/#concept-urlsearchparams-update
   * @internal
   */
  _update(): void {
    const internals = getSearchParamsInternals(this);
    if (internals.urlObject === null) {
      return;
    }
    const url = getURLRecord(internals.urlObject);
    const serialization = serializeUrlencoded(internals.list);
    url.query = serialization === '' ? null : serialization;
    internals.urlQueryIsSerialized = true;
    if (serialization === '') {
      potentiallyStripTrailingSpacesFromOpaquePath(url);
    }
  }

  get size(): number {
    return getSearchParamsInternals(this).list.length;
  }

  append(name: string, value: string): void {
    const internals = getSearchParamsInternals(this);
    requireArguments('URLSearchParams.append', arguments.length, 2);
    name = toUSVString(name);
    value = toUSVString(value);
    internals.list.push([name, value]);
    if (internals.urlObject === null) {
      return;
    }
    if (!internals.urlQueryIsSerialized) {
      this._update();
      return;
    }
    const url = getURLRecord(internals.urlObject);
    const serialization =
      serializeUrlencodedComponent(name) +
      '=' +
      serializeUrlencodedComponent(value);
    url.query =
      url.query === null ? serialization : url.query + '&' + serialization;
  }

  delete(name: string, value?: string): void {
    const internals = getSearchParamsInternals(this);
    const list = internals.list;
    requireArguments('URLSearchParams.delete', arguments.length, 1);
    name = toUSVString(name);
    const normalizedValue =
      value === undefined ? undefined : toUSVString(value);
    let writeIndex = 0;
    let deleted = false;
    for (let readIndex = 0; readIndex < list.length; readIndex++) {
      const pair = list[readIndex];
      if (
        pair[0] !== name ||
        (normalizedValue !== undefined && pair[1] !== normalizedValue)
      ) {
        list[writeIndex++] = pair;
      } else {
        deleted = true;
      }
    }
    if (!deleted) {
      if (internals.urlObject !== null) {
        this._update();
      }
      return;
    }
    list.length = writeIndex;
    this._update();
  }

  get(name: string): string | null {
    const list = getSearchParamsInternals(this).list;
    requireArguments('URLSearchParams.get', arguments.length, 1);
    name = toUSVString(name);
    for (const [pairName, value] of list) {
      if (pairName === name) {
        return value;
      }
    }
    return null;
  }

  getAll(name: string): string[] {
    const list = getSearchParamsInternals(this).list;
    requireArguments('URLSearchParams.getAll', arguments.length, 1);
    name = toUSVString(name);
    const output: string[] = [];
    for (const [pairName, value] of list) {
      if (pairName === name) {
        output.push(value);
      }
    }
    return output;
  }

  has(name: string, value?: string): boolean {
    const list = getSearchParamsInternals(this).list;
    requireArguments('URLSearchParams.has', arguments.length, 1);
    name = toUSVString(name);
    const normalizedValue =
      value === undefined ? undefined : toUSVString(value);
    for (const [pairName, pairValue] of list) {
      if (
        pairName === name &&
        (normalizedValue === undefined || pairValue === normalizedValue)
      ) {
        return true;
      }
    }
    return false;
  }

  set(name: string, value: string): void {
    const internals = getSearchParamsInternals(this);
    const list = internals.list;
    requireArguments('URLSearchParams.set', arguments.length, 2);
    name = toUSVString(name);
    value = toUSVString(value);
    let firstMatch = -1;
    for (let index = 0; index < list.length; index++) {
      if (list[index][0] === name) {
        firstMatch = index;
        break;
      }
    }

    if (firstMatch === -1) {
      list.push([name, value]);
      this._update();
      return;
    }

    const previousValue = list[firstMatch][1];
    let writeIndex = firstMatch + 1;
    for (let readIndex = writeIndex; readIndex < list.length; readIndex++) {
      const pair = list[readIndex];
      if (pair[0] !== name) {
        list[writeIndex++] = pair;
      }
    }
    if (
      writeIndex === list.length &&
      previousValue === value &&
      internals.urlObject === null
    ) {
      return;
    }
    list[firstMatch][1] = value;
    list.length = writeIndex;
    this._update();
  }

  sort(): void {
    const list = getSearchParamsInternals(this).list;
    // Stable sort by name, comparing UTF-16 code units.
    list.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    this._update();
  }

  forEach(
    callback: (
      value: string,
      name: string,
      searchParams: URLSearchParams,
    ) => void,
    thisArg?: unknown,
  ): void {
    const list = getSearchParamsInternals(this).list;
    requireArguments('URLSearchParams.forEach', arguments.length, 1);
    if (typeof callback !== 'function') {
      throw new TypeError('URLSearchParams.forEach callback must be callable');
    }
    for (let i = 0; i < list.length; i++) {
      Reflect.apply(callback, thisArg, [list[i][1], list[i][0], this]);
    }
  }

  keys(): IterableIterator<string> {
    getSearchParamsInternals(this);
    return new URLSearchParamsIterator(this, 'key') as IterableIterator<string>;
  }

  values(): IterableIterator<string> {
    getSearchParamsInternals(this);
    return new URLSearchParamsIterator(
      this,
      'value',
    ) as IterableIterator<string>;
  }

  entries(): IterableIterator<[string, string]> {
    getSearchParamsInternals(this);
    return new URLSearchParamsIterator(this, 'pair') as IterableIterator<
      [string, string]
    >;
  }

  [Symbol.iterator](): IterableIterator<[string, string]> {
    return this.entries();
  }

  toString(): string {
    return serializeUrlencoded(getSearchParamsInternals(this).list);
  }
}

export interface URLSearchParams {
  readonly [Symbol.toStringTag]: 'URLSearchParams';
}

// =============================================================================
// URL (https://url.spec.whatwg.org/#url-class)
// =============================================================================

// React Native blob support: compute the blob URL prefix from the native blob
// module, if available.
let BLOB_URL_PREFIX: string | null = null;

const NativeBlobModule = NativeModules.BlobModule;

if (
  NativeBlobModule &&
  typeof NativeBlobModule.getConstants().BLOB_URI_SCHEME === 'string'
) {
  const constants = NativeBlobModule.getConstants();
  BLOB_URL_PREFIX = constants.BLOB_URI_SCHEME + ':';
  if (typeof constants.BLOB_URI_HOST === 'string') {
    BLOB_URL_PREFIX += `//${constants.BLOB_URI_HOST}/`;
  }
}

/**
 * The shape of React Native's `Blob`, which carries a reference to
 * natively-stored data rather than the bytes themselves.
 */
interface BlobLike {
  data: {blobId: string; offset: number};
  size: number;
}

const URL_RECORDS = new WeakMap<object, URLRecord>();
const URL_SEARCH_PARAMS = new WeakMap<object, URLSearchParams | null>();

function getURLRecord(value: object): URLRecord {
  const url = URL_RECORDS.get(value);
  if (url === undefined) {
    throw new TypeError('Illegal invocation');
  }
  return url;
}

function parseURLWithBase(
  input: string,
  base: string | undefined,
): URLRecord | Failure {
  let parsedBase: URLRecord | null = null;
  if (base !== undefined) {
    const result = parseURLFromUSVString(base);
    if (result === FAILURE) {
      return FAILURE;
    }
    parsedBase = result;
  }
  return parseURLFromUSVString(input, parsedBase);
}

export class URL {
  constructor(url: string | URL, base?: string | URL) {
    requireArguments('URL constructor', arguments.length, 1);
    const urlString = toUSVString(url);
    let parsedBase: URLRecord | Failure | null = null;
    if (base !== undefined) {
      const baseString = toUSVString(base);
      parsedBase = parseURLFromUSVString(baseString);
      if (parsedBase === FAILURE) {
        throw new TypeError(`Invalid base URL: ${baseString}`);
      }
    }
    const parsedURL = parseURLFromUSVString(urlString, parsedBase);
    if (parsedURL === FAILURE) {
      throw new TypeError(`Invalid URL: ${urlString}`);
    }
    URL_RECORDS.set(this, parsedURL);
    URL_SEARCH_PARAMS.set(this, null);
  }

  static parse(url: string | URL, base?: string | URL): URL | null {
    requireArguments('URL.parse', arguments.length, 1);
    const urlString = toUSVString(url);
    const baseString = base === undefined ? undefined : toUSVString(base);
    try {
      return new URL(urlString, baseString);
    } catch {
      return null;
    }
  }

  static canParse(url: string | URL, base?: string | URL): boolean {
    requireArguments('URL.canParse', arguments.length, 1);
    const urlString = toUSVString(url);
    const baseString = base === undefined ? undefined : toUSVString(base);
    return parseURLWithBase(urlString, baseString) !== FAILURE;
  }

  /*
   * To allow Blobs be accessed via `content://` URIs,
   * you need to register `BlobProvider` as a ContentProvider in your app's `AndroidManifest.xml`:
   *
   * ```xml
   * <manifest>
   *   <application>
   *     <provider
   *       android:name="com.facebook.react.modules.blob.BlobProvider"
   *       android:authorities="@string/blob_provider_authority"
   *       android:exported="false"
   *     />
   *   </application>
   * </manifest>
   * ```
   * And then define the `blob_provider_authority` string in `res/values/strings.xml`.
   * Use a dotted name that's entirely unique to your app:
   *
   * ```xml
   * <resources>
   *   <string name="blob_provider_authority">your.app.package.blobs</string>
   * </resources>
   * ```
   */
  static createObjectURL(blob: BlobLike): string {
    if (BLOB_URL_PREFIX === null) {
      throw new Error('Cannot create URL for blob!');
    }
    return `${BLOB_URL_PREFIX}${blob.data.blobId}?offset=${blob.data.offset}&size=${blob.size}`;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static revokeObjectURL(url: string): void {
    // Do nothing.
  }

  /** @internal */
  _updateSearchParams(): void {
    const url = getURLRecord(this);
    const searchParams = URL_SEARCH_PARAMS.get(this);
    if (searchParams !== null && searchParams !== undefined) {
      const searchParamsInternals = getSearchParamsInternals(searchParams);
      searchParamsInternals.list = parseUrlencoded(url.query || '');
      searchParamsInternals.urlQueryIsSerialized = false;
    }
  }

  get href(): string {
    return serializeURL(getURLRecord(this));
  }

  set href(value: string) {
    getURLRecord(this);
    const string = toUSVString(value);
    const parsedURL = parseURL(string);
    if (parsedURL === FAILURE) {
      throw new TypeError(`Invalid URL: ${string}`);
    }
    URL_RECORDS.set(this, parsedURL);
    this._updateSearchParams();
  }

  get origin(): string {
    return serializeOrigin(getURLRecord(this));
  }

  get protocol(): string {
    return getURLRecord(this).scheme + ':';
  }

  set protocol(value: string) {
    const url = getURLRecord(this);
    parseURL(toUSVString(value) + ':', null, url, SCHEME_START);
  }

  get username(): string {
    return getURLRecord(this).username;
  }

  set username(value: string) {
    const url = getURLRecord(this);
    const string = toUSVString(value);
    if (cannotHaveUsernamePasswordPort(url)) {
      return;
    }
    url.username = utf8PercentEncodeString(string, USERINFO_SET);
  }

  get password(): string {
    return getURLRecord(this).password;
  }

  set password(value: string) {
    const url = getURLRecord(this);
    const string = toUSVString(value);
    if (cannotHaveUsernamePasswordPort(url)) {
      return;
    }
    url.password = utf8PercentEncodeString(string, USERINFO_SET);
  }

  get host(): string {
    const url = getURLRecord(this);
    if (url.host === null) {
      return '';
    }
    return url.port !== null ? url.host + ':' + url.port : url.host;
  }

  set host(value: string) {
    const url = getURLRecord(this);
    const string = toUSVString(value);
    if (hasOpaquePath(url)) {
      return;
    }
    parseURL(string, null, url, HOST);
  }

  get hostname(): string {
    return getURLRecord(this).host ?? '';
  }

  set hostname(value: string) {
    const url = getURLRecord(this);
    const string = toUSVString(value);
    if (hasOpaquePath(url)) {
      return;
    }
    parseURL(string, null, url, HOSTNAME);
  }

  get port(): string {
    const {port} = getURLRecord(this);
    return port === null ? '' : String(port);
  }

  set port(value: string) {
    const url = getURLRecord(this);
    const string = toUSVString(value);
    if (cannotHaveUsernamePasswordPort(url)) {
      return;
    }
    if (string === '') {
      url.port = null;
    } else {
      parseURL(string, null, url, PORT);
    }
  }

  get pathname(): string {
    return serializePath(getURLRecord(this));
  }

  set pathname(value: string) {
    const url = getURLRecord(this);
    const string = toUSVString(value);
    if (hasOpaquePath(url)) {
      return;
    }
    url.path = [];
    parseURL(string, null, url, PATH_START);
  }

  get search(): string {
    const {query} = getURLRecord(this);
    return query === null || query === '' ? '' : '?' + query;
  }

  set search(value: string) {
    const url = getURLRecord(this);
    let string = toUSVString(value);
    if (string === '') {
      url.query = null;
      this._updateSearchParams();
      potentiallyStripTrailingSpacesFromOpaquePath(url);
      return;
    }
    if (string[0] === '?') {
      string = string.substring(1);
    }
    url.query = '';
    parseURL(string, null, url, QUERY);
    this._updateSearchParams();
  }

  get searchParams(): URLSearchParams {
    const url = getURLRecord(this);
    let searchParams = URL_SEARCH_PARAMS.get(this);
    if (searchParams === null) {
      searchParams = new URLSearchParams();
      const searchParamsInternals = getSearchParamsInternals(searchParams);
      searchParamsInternals.list = parseUrlencoded(url.query || '');
      searchParamsInternals.urlObject = this;
      URL_SEARCH_PARAMS.set(this, searchParams);
    }
    return searchParams as URLSearchParams;
  }

  get hash(): string {
    const {fragment} = getURLRecord(this);
    return fragment === null || fragment === '' ? '' : '#' + fragment;
  }

  set hash(value: string) {
    const url = getURLRecord(this);
    let string = toUSVString(value);
    if (string === '') {
      url.fragment = null;
      potentiallyStripTrailingSpacesFromOpaquePath(url);
      return;
    }
    if (string[0] === '#') {
      string = string.substring(1);
    }
    url.fragment = '';
    parseURL(string, null, url, FRAGMENT);
  }

  toString(): string {
    return serializeURL(getURLRecord(this));
  }

  toJSON(): string {
    return serializeURL(getURLRecord(this));
  }
}

export interface URL {
  readonly [Symbol.toStringTag]: 'URL';
}

Object.defineProperty(URLSearchParams.prototype, Symbol.toStringTag, {
  value: 'URLSearchParams',
  configurable: true,
});

Object.defineProperty(URL.prototype, Symbol.toStringTag, {
  value: 'URL',
  configurable: true,
});

function setFunctionLength(fn: Function, length: number): void {
  Object.defineProperty(fn, 'length', {value: length});
}

function setFunctionName(fn: Function, name: string): void {
  Object.defineProperty(fn, 'name', {value: name});
}

function setAccessorNames(prototype: object, property: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
  if (descriptor?.get) {
    setFunctionName(descriptor.get, `get ${property}`);
  }
  if (descriptor?.set) {
    setFunctionName(descriptor.set, `set ${property}`);
  }
}

setFunctionLength(URL, 1);
setFunctionLength(URL.parse, 1);
setFunctionLength(URL.canParse, 1);
setFunctionLength(URLSearchParams, 0);
setFunctionLength(URLSearchParams.prototype.delete, 1);
setFunctionLength(URLSearchParams.prototype.has, 1);
setFunctionLength(URLSearchParams.prototype.forEach, 1);
setFunctionName(URLSearchParams.prototype.delete, 'delete');

for (const property of ['parse', 'canParse']) {
  Object.defineProperty(URL, property, {
    ...Object.getOwnPropertyDescriptor(URL, property),
    enumerable: true,
  });
}

for (const property of [
  'href',
  'origin',
  'protocol',
  'username',
  'password',
  'host',
  'hostname',
  'port',
  'pathname',
  'search',
  'searchParams',
  'hash',
  'toString',
  'toJSON',
]) {
  setAccessorNames(URL.prototype, property);
  Object.defineProperty(URL.prototype, property, {
    ...Object.getOwnPropertyDescriptor(URL.prototype, property),
    enumerable: true,
  });
}

for (const property of [
  'size',
  'append',
  'delete',
  'get',
  'getAll',
  'has',
  'set',
  'sort',
  'forEach',
  'keys',
  'values',
  'entries',
  'toString',
]) {
  setAccessorNames(URLSearchParams.prototype, property);
  Object.defineProperty(URLSearchParams.prototype, property, {
    ...Object.getOwnPropertyDescriptor(URLSearchParams.prototype, property),
    enumerable: true,
  });
}

Object.defineProperty(URLSearchParams.prototype, Symbol.iterator, {
  ...Object.getOwnPropertyDescriptor(URLSearchParams.prototype, 'entries'),
  value: URLSearchParams.prototype.entries,
  enumerable: false,
});
