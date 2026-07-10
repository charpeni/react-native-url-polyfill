import React from 'react';
import {SafeAreaView, StatusBar, useColorScheme} from 'react-native';

import HermesWPT from '../../detox/HermesWPT';
import TestPolyfill from '../../detox/TestPolyfill';

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaView>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <HermesWPT fallback={<TestPolyfill />} />
    </SafeAreaView>
  );
}

export default App;
