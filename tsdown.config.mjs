import {defineConfig} from 'tsdown';

export default defineConfig({
  entry: ['js/URL.ts', 'js/URLSearchParams.ts'],
  format: 'esm',
  platform: 'neutral',
  target: 'esnext',
  minify: true,
  dts: true,
  outDir: 'js',
  clean: [
    'js/URL.js',
    'js/URL.d.ts',
    'js/URLSearchParams.js',
    'js/URLSearchParams.d.ts',
    'js/*.mjs',
    'js/*.d.mts',
  ],
  deps: {
    neverBundle: ['react-native'],
  },
  outExtensions() {
    return {
      js: '.js',
      dts: '.d.ts',
    };
  },
});
