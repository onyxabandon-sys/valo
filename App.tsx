import React, { useCallback, useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet, Text, View } from 'react-native';
import { ConvexBetterAuthProvider, type AuthClient } from '@convex-dev/better-auth/react';
import { PostHogErrorBoundary, PostHogProvider, PostHogSurveyProvider } from 'posthog-react-native';
import {
  POSTHOG_API_KEY,
  POSTHOG_ENVIRONMENT,
  POSTHOG_HOST,
  POSTHOG_SESSION_REPLAY_ENABLED,
  POSTHOG_SURVEYS_ENABLED,
} from '@env';
import { convexClient } from './src/data/convexClient';
import { authClient } from './src/data/authClient';
import { RootNavigator } from './src/navigation/RootNavigator';
import { LaunchScreen } from './src/screens/LaunchScreen';
import { redactPostHogEvent } from './src/analytics/telemetry';

export default function App() {
  const posthogApiKey = POSTHOG_API_KEY?.trim() ?? '';
  const posthogHost = POSTHOG_HOST?.trim() ?? '';
  const expectedEnvironment = __DEV__ ? 'development' : 'production';
  const configuredEnvironment = POSTHOG_ENVIRONMENT?.trim();
  const posthogEnvironment = expectedEnvironment;
  const posthogConfigured = /^phc_[A-Za-z0-9._-]+$/.test(posthogApiKey)
    && posthogHost === 'https://us.i.posthog.com'
    && (!configuredEnvironment || configuredEnvironment === expectedEnvironment);
  const sessionReplayEnabled = posthogConfigured && POSTHOG_SESSION_REPLAY_ENABLED === 'true';
  const surveysEnabled = posthogConfigured && POSTHOG_SURVEYS_ENABLED === 'true';
  const [isLaunching, setIsLaunching] = useState(true);
  const [isAppReady, setIsAppReady] = useState(false);
  const finishLaunch = useCallback(() => setIsLaunching(false), []);
  const markAppReady = useCallback(() => setIsAppReady(true), []);

  useEffect(() => {
    const timeout = setTimeout(() => setIsAppReady(true), 2_500);
    return () => clearTimeout(timeout);
  }, []);

  if (!convexClient) {
    return (
      <View style={styles.configurationError}>
        <Text style={styles.configurationTitle}>Configuration required</Text>
        <Text style={styles.configurationText}>A valid Convex deployment URL is required to start Valet POS.</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PostHogProvider
          apiKey={posthogApiKey || 'disabled'}
          autocapture={{ captureScreens: false, captureTouches: false }}
          options={{
            host: posthogConfigured ? posthogHost : 'https://us.i.posthog.com',
            disabled: !posthogConfigured,
            personProfiles: 'never',
            before_send: event => redactPostHogEvent(event, posthogEnvironment),
            enableSessionReplay: sessionReplayEnabled,
            ...(sessionReplayEnabled ? {
              sessionReplayConfig: {
                maskAllTextInputs: false,
                maskAllImages: false,
                maskAllSandboxedViews: true,
                captureLog: false,
                captureNetworkTelemetry: false,
                // Touch coordinates can reveal codes entered on a known keypad layout.
                captureTouches: false,
              },
            } : {}),
            errorTracking: {
              autocapture: {
                uncaughtExceptions: true,
                unhandledRejections: true,
                console: false,
                nativeCrashes: false,
                androidNdkCrashes: false,
              },
              exceptionSteps: { enabled: false },
            },
            logs: {
              serviceName: 'valet-pos',
              serviceVersion: '1.0.0',
              environment: posthogEnvironment,
              rateCap: { maxLogs: 100, windowMs: 60_000 },
              beforeSend: record => {
                if (record.body === 'receipt_sync_failed') {
                  return { ...record, attributes: { operation: 'retry_pending_receipt' } };
                }
                if (record.body === 'receipt_print_failed') {
                  const category = record.attributes?.failure_category;
                  const allowedCategories = new Set([
                    'out_of_paper', 'cover_open', 'overheated', 'timeout', 'device_or_printer_error',
                  ]);
                  return allowedCategories.has(String(category))
                    ? { ...record, attributes: { failure_category: category } }
                    : null;
                }
                return null;
              },
            },
          }}
        >
          <PostHogErrorBoundary
            fallback={() => (
              <View style={styles.configurationError}>
                <Text style={styles.configurationTitle}>Valet POS needs to restart</Text>
                <Text style={styles.configurationText}>Close and reopen the app. If this continues, contact your administrator.</Text>
              </View>
            )}
          >
            <PostHogSurveyProvider autoPresentSurveys={surveysEnabled && !isLaunching}>
              <ConvexBetterAuthProvider
                client={convexClient}
                // The provider's type omits the official Expo storage plugin. The client
                // still implements every method the provider consumes (session, token,
                // and getSession), so keep the compatibility cast at this one boundary.
                authClient={authClient as unknown as AuthClient}
              >
                <View
                  accessibilityElementsHidden={isLaunching}
                  importantForAccessibility={isLaunching ? 'no-hide-descendants' : 'auto'}
                  style={styles.appContent}
                >
                  <RootNavigator onReady={markAppReady} />
                </View>
              </ConvexBetterAuthProvider>
            </PostHogSurveyProvider>
          </PostHogErrorBoundary>
        </PostHogProvider>
        {isLaunching ? <LaunchScreen readyToExit={isAppReady} onFinished={finishLaunch} /> : null}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  appContent: { flex: 1 },
  configurationError: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#0F172A' },
  configurationTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginBottom: 8 },
  configurationText: { color: '#CBD5E1', fontSize: 15, lineHeight: 22, textAlign: 'center' },
});
