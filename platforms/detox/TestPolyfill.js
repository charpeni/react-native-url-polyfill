import React from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';

import {runURLConformance} from '../../js/url-conformance';

function testCreateObjectURL() {
  let objectURL;

  try {
    objectURL = URL.createObjectURL({
      data: {
        blobId: 1,
        offset: 32,
      },
      size: 64,
    });
  } catch (e) {
    console.error(e);
  }

  return objectURL;
}

const PolyfillTests = () => {
  const conformance = React.useMemo(() => runURLConformance(URL), []);
  const conformancePassed = conformance.failed === 0;
  const polyfillDetected = Boolean(global.REACT_NATIVE_URL_POLYFILL);

  if (conformance.failed > 0) {
    console.error(
      'URL conformance failures',
      conformance.failures.slice(0, 10),
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      alwaysBounceVertical={false}>
      <View style={styles.header}>
        <Text style={styles.title}>URL Polyfill</Text>
        <Text style={styles.subtitle}>
          Validate that the React Native runtime is using the expected URL
          implementation.
        </Text>
      </View>

      <View style={styles.sectionContainer}>
        <Text style={styles.sectionTitle}>Package</Text>
        <View style={styles.card}>
          <Text
            style={[
              styles.statusBadge,
              polyfillDetected ? styles.successBadge : styles.failureBadge,
            ]}>
            {polyfillDetected ? 'Healthy' : 'Not detected'}
          </Text>
          <Text testID="url-polyfill-version" style={styles.sectionDescription}>
            {global.REACT_NATIVE_URL_POLYFILL ??
              'react-native-url-polyfill is not detected'}
          </Text>
        </View>
      </View>

      <View style={styles.sectionContainer}>
        <Text style={styles.sectionTitle}>Conformance</Text>
        <View style={styles.card}>
          <Text
            testID="url-conformance-result"
            style={[
              styles.sectionDescription,
              conformancePassed ? styles.successText : styles.failureText,
            ]}>
            {conformancePassed ? 'passed' : `failed: ${conformance.failed}`}
          </Text>
          <View style={styles.metricGrid}>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{conformance.passed}</Text>
              <Text style={styles.metricLabel}>Passed</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{conformance.skipped}</Text>
              <Text style={styles.metricLabel}>Skipped</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{conformance.knownFailed}</Text>
              <Text style={styles.metricLabel}>Known failed</Text>
            </View>
            <View style={styles.metricCard}>
              <Text
                style={[
                  styles.metricValue,
                  conformancePassed ? styles.successText : styles.failureText,
                ]}>
                {conformance.failed}
              </Text>
              <Text style={styles.metricLabel}>Failed</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.sectionContainer}>
        <Text style={styles.sectionTitle}>URL samples</Text>

        <View style={styles.resultCard}>
          <Text style={styles.resultLabel}>Relative URL</Text>
          <Text testID="url-test-1" style={styles.sectionDescription}>
            {new URL('dev', 'https://google.dev').href}
          </Text>
        </View>

        <View style={styles.resultCard}>
          <Text style={styles.resultLabel}>Absolute URL</Text>
          <Text testID="url-test-2" style={styles.sectionDescription}>
            {
              new URL(
                'https://facebook.github.io/react-native/img/header_logo.png',
              ).href
            }
          </Text>
        </View>

        <View style={styles.resultCard}>
          <Text style={styles.resultLabel}>Object URL</Text>
          <Text testID="url-test-3" style={styles.sectionDescription}>
            {testCreateObjectURL()}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#ffffff',
  },
  content: {
    backgroundColor: '#ffffff',
    paddingBottom: 32,
  },
  header: {
    backgroundColor: '#f3f3f3',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  title: {
    color: '#000000',
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 12,
  },
  subtitle: {
    color: '#333333',
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
  },
  sectionContainer: {
    marginTop: 32,
    paddingHorizontal: 24,
  },
  sectionTitle: {
    color: '#000000',
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#f3f3f3',
    borderColor: '#dddddd',
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  successBadge: {
    backgroundColor: '#dff6dd',
    color: '#067d4d',
  },
  failureBadge: {
    backgroundColor: '#fde7e9',
    color: '#d1242f',
  },
  sectionDescription: {
    color: '#333333',
    fontSize: 18,
    fontWeight: '400',
    lineHeight: 26,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginHorizontal: -4,
    marginTop: 12,
  },
  metricCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#dddddd',
    borderRadius: 8,
    borderWidth: 1,
    margin: 4,
    minWidth: 120,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  metricValue: {
    color: '#000000',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 2,
  },
  metricLabel: {
    color: '#333333',
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'center',
  },
  resultCard: {
    backgroundColor: '#f3f3f3',
    borderColor: '#dddddd',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    padding: 16,
  },
  resultLabel: {
    color: '#000000',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  successText: {
    color: '#067d4d',
    fontWeight: '600',
  },
  failureText: {
    color: '#d1242f',
    fontWeight: '600',
  },
});

export default PolyfillTests;
