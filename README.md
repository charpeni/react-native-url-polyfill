# React Native URL Polyfill

<img height="125" src="https://user-images.githubusercontent.com/7189823/69501658-06047600-0ed5-11ea-8f54-952bf1afd68c.png" alt="Library's logo" align="right">

[![Version](https://badge.fury.io/js/react-native-url-polyfill.svg)](https://www.npmjs.org/package/react-native-url-polyfill)
[![Monthly Downloads](https://img.shields.io/npm/dm/react-native-url-polyfill)](https://www.npmjs.org/package/react-native-url-polyfill)
[![CircleCI Status](https://circleci.com/gh/charpeni/react-native-url-polyfill.svg?style=shield)](https://circleci.com/gh/charpeni/react-native-url-polyfill)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/charpeni/react-native-url-polyfill/blob/main/LICENSE)

A lightweight and trustworthy URL polyfill for React Native, based on the WHATWG [URL Standard](https://url.spec.whatwg.org/) optimized for React Native.

<br />

- **Lightweight**. Uses a forked version of [`whatwg-url`](https://github.com/jsdom/whatwg-url) ([`whatwg-url-without-unicode`](https://github.com/charpeni/whatwg-url)) where Unicode support has been stripped out—Going down from [372 KB](https://bundlephobia.com/result?p=whatwg-url@8.0.0) to [40.9 KB](https://bundlephobia.com/result?p=whatwg-url-without-unicode@8.0.0-3).
- **Trustworthy**. Follows the URL Standard spec, and relies on unit tests and Detox e2e tests within [React Native](https://github.com/facebook/react-native).
- **Blob support**. Supports React Native's Blob without additional steps.
- **Hermes support**. Supports [Hermes](https://github.com/facebook/hermes), a JavaScript engine optimized for running React Native.
- **Expo support**. Supports [Expo](https://expo.dev/).
- **Web support**. Most of the time, this polyfill isn't useful on web and therefore using `react-native-url-polyfill/auto` will be no-op on web.

> [!IMPORTANT]
> As mentioned above, Unicode support has been stripped out to keep this polyfill lightweight on mobile. Therefore, [non-ASCII characters](https://unicode.org/reports/tr46/) aren't supported in the hostname.

## Why do we need this?

React Native does include [a polyfill for `URL`](https://github.com/facebook/react-native/blob/8c0c860e38f57e18296f689e47dfb4a54088c260/Libraries/Blob/URL.js#L115-L222), but this polyfill is homemade—in order to keep it light-weight—and was initially created to handle specific use cases.

Meanwhile, React Native has grown around that polyfill, then some unexpected errors have arisen.

> [!NOTE]
> Known issues (non-exhaustive) with React Native's URL are:
>
> - URL cannot handle "localhost" domain for base url [react-native#26019](https://github.com/facebook/react-native/issues/26019).
> - URL implementation should add a trailing slash to the base [react-native#25717](https://github.com/facebook/react-native/issues/25717).
> - URL incorrectly adds trailing slash [react-native#24428](https://github.com/facebook/react-native/issues/24428).
> - Creating an instance of URL like: `new URL('http://facebook.com')` throws an exception [react-native#16434](https://github.com/facebook/react-native/issues/16434).

That's why you may need this external dependency. If you use [`URL`](https://developer.mozilla.org/en-US/docs/Web/API/URL) within your app, you should look at the installation steps below!

Unfortunately, adding `react-native-url-polyfill` to React Native source code would mean adding 📦 **73.9 KB** (as of RN 0.81) to the JavaScript bundle, that's why it's not included by default.

## Installation

First, you need to install the polyfill, which can be done with [Yarn](https://yarnpkg.com/), [npm](https://www.npmjs.com/), and others.

```bash
yarn add react-native-url-polyfill
```

Then, the polyfill can be used in multiple ways. Pick your preferred option.

> [!TIP]
> To verify if the polyfill has been correctly applied, you can check if the global variable `REACT_NATIVE_URL_POLYFILL` contains the current package and version like: `react-native-url-polyfill@CURRENT_VERSION`.

### Option 1 (_Simple_)

Locate your JavaScript entry-point file, commonly called `index.js` at the root of your React Native project.

Then, import `react-native-url-polyfill/auto` at the top of your entry-point file, the polyfill will be automatically applied.

```javascript
import 'react-native-url-polyfill/auto';
```

### Option 2 (_Flexible_)

If you want to apply the polyfill when you're ready, you can import `setupURLPolyfill` and call it yourself.

```javascript
import { setupURLPolyfill } from 'react-native-url-polyfill';

setupURLPolyfill();
```

### Option 3 (_Convenient_ / ponyfill)

If you prefer not to apply this polyfill over React Native's default `URL`, you can still import those classes manually when you want them.

```javascript
import { URL, URLSearchParams } from 'react-native-url-polyfill';

const url = new URL('https://github.com');
const searchParams = new URLSearchParams('q=GitHub');
```

## License

react-native-url-polyfill is [MIT licensed](LICENSE).
