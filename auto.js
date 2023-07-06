import {Platform} from 'react-native';

import {setupURLPolyfill} from './index';

if (Platform.OS !== 'web') {
  setupURLPolyfill();
}
