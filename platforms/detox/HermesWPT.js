import React from 'react';
import {Linking, Text, View} from 'react-native';

import {runHermesWptCase} from './generated/hermes-wpt';

function caseFromURL(url) {
  const match = url?.match(/^wpt:\/\/run\?case=([^&]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export default function HermesWPT({fallback}) {
  const [state, setState] = React.useState({status: 'loading'});

  React.useEffect(() => {
    let active = true;
    Linking.getInitialURL()
      .then((url) => {
        const testCase = caseFromURL(url);
        if (!testCase) {
          if (active) {
            setState({status: 'inactive'});
          }
          return;
        }
        if (!global.HermesInternal) {
          if (active) {
            setState({
              status: 'failed',
              testCase,
              message: 'The React Native runtime is not Hermes',
            });
          }
          return;
        }
        return runHermesWptCase(testCase).then((result) => {
          if (!active) {
            return;
          }
          const passed =
            result.harnessStatus === 0 &&
            result.unexpected.length === 0 &&
            result.stale.length === 0;
          setState({
            status: passed ? 'passed' : 'failed',
            testCase,
            message: passed ? '' : JSON.stringify(result),
          });
        });
      })
      .catch((error) => {
        if (active) {
          setState({status: 'failed', message: error.stack || error.message});
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (state.status === 'inactive') {
    return fallback;
  }
  if (state.status === 'loading') {
    return null;
  }

  return (
    <View>
      <Text testID="hermes-wpt-engine">Hermes</Text>
      <Text testID="hermes-wpt-case">{state.testCase}</Text>
      <Text testID="hermes-wpt-result">{state.status}</Text>
      {state.message ? (
        <Text testID="hermes-wpt-failures">{state.message}</Text>
      ) : null}
    </View>
  );
}
