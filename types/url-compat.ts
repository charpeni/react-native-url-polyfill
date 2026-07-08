/**
 * Compile-time compatibility tests. This file is never executed and is not
 * part of the published package — it is only type-checked (`yarn type-check`)
 * to guarantee that this polyfill's types stay interchangeable with the types
 * of Node.js's built-in `URL` and of `whatwg-url` (via `@types/whatwg-url`).
 *
 * Every assignment below is an assertion: if the polyfill's API surface
 * drifts from the reference implementations, `tsc` fails.
 */

import {URL as NodeURL, URLSearchParams as NodeURLSearchParams} from 'node:url';
import {
  URL as WhatwgURL,
  URLSearchParams as WhatwgURLSearchParams,
} from 'whatwg-url';

import {URL, URLSearchParams} from '../js/URL';

declare const url: URL;
declare const searchParams: URLSearchParams;

// -----------------------------------------------------------------------------
// The polyfill's instances must be usable anywhere Node's built-ins are
// expected. This covers every property and method of the built-in types,
// including getter/setter types, `searchParams`, iteration, and `toJSON`.
// -----------------------------------------------------------------------------

export const urlIsNodeCompatible: InstanceType<typeof NodeURL> = url;

export const searchParamsIsNodeCompatible: InstanceType<
  typeof NodeURLSearchParams
> = searchParams;

// Static members must match too.
export const canParseIsNodeCompatible: typeof NodeURL.canParse = URL.canParse;
export const parseIsNodeCompatible: (
  url: string,
  base?: string,
) => InstanceType<typeof NodeURL> | null = URL.parse;

// -----------------------------------------------------------------------------
// The same interchangeability must hold with `whatwg-url` (the reference
// implementation this polyfill replaced, in its `whatwg-url-without-unicode`
// build).
// -----------------------------------------------------------------------------

export const urlIsWhatwgCompatible: WhatwgURL = url;

export const searchParamsIsWhatwgCompatible: WhatwgURLSearchParams =
  searchParams;
