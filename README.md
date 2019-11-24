<p align="center">
  <img height="60" src="https://user-images.githubusercontent.com/7189823/69501658-06047600-0ed5-11ea-8f54-952bf1afd68c.png" alt="Library's logo">
</p>

<h3 align="center">
  React Native URL Polyfill
</h3>

<p align="center">
  A light and trustworthy URL polyfill for React Native
</p>

<p align="center">
  <a href="https://www.npmjs.org/package/react-native-url-polyfill">
    <img src="https://badge.fury.io/js/react-native-url-polyfill.svg" alt="Current npm package version." />
  </a>
  <a href="https://circleci.com/gh/charpeni/react-native-url-polyfill">
    <img src="https://circleci.com/gh/charpeni/react-native-url-polyfill.svg?style=shield" alt="Current CircleCI build status." />
  </a>
  <a href="https://circleci.com/gh/charpeni/react-native-url-polyfill">
    <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs welcome!" />
  </a>
  <a href="https://github.com/charpeni/react-native-url-polyfill/blob/master/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="React Native URL Polyfill is released under the MIT license." />
  </a>
</p>

<hr />

react-native-url-polyfill is a full implementation of the WHATWG [URL Standard](https://url.spec.whatwg.org/) that has been optimized for React Native.

- **Trustworthy**. Follows closely the URL Standard spec, and relys on unit tests and Detox e2e tests within [React Native](https://github.com/facebook/react-native).
- **Light**. Instead of using directly `whatwg-url`, this polyfill uses a forked version ([`whatwg-url-without-unicode`](https://github.com/charpeni/whatwg-url)) that has been stripped of unicode support — Going down from [353 kB](https://bundlephobia.com/result?p=whatwg-url@7.0.0) to [54 kB](https://bundlephobia.com/result?p=whatwg-url-without-unicode@7.0.0).
- **Blog support**. Supports React Native's Blob without additional steps.

## Why do we need this?

React Native does include a polyfill for `URL`, but this polyfill is homemade — in order to keep it light-weight — and was initially created to handle specific use cases.

Meanwhile, React Native has grown around that polyfill, then some unexpected errors have arisen.

>Known issues with React Native's URL are:
>
>- URL cannot handle "localhost" domain for base url [react-native#26019](https://github.com/facebook/react-native/issues/26019).
>- URL implementation should add a trailing slash to the base [react-native#25717](https://github.com/facebook/react-native/issues/25717).
>- URL incorrectly adds trailing slash [react-native#24428](https://github.com/facebook/react-native/issues/24428).
>- Creating an instance of URL like: `new URL('http://facebook.com')` throws an exception [react-native#16434](https://github.com/facebook/react-native/issues/16434).

Unfortunately, adding this polyfill to React Native will means adding 📦 **84.78 kB** to the JavaScript bundle, even if you don't use `URL` because 🚇 [Metro](https://github.com/facebook/metro) doesn't support [optional imports](https://github.com/react-native-community/discussions-and-proposals/issues/120).

That's why you may need this external dependency. So, if you use `URL` within your app, you probably want to take a look at the installation steps!

## Installation

## License
