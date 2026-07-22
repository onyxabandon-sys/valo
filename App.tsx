import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConvexProvider } from 'convex/react';
import { convexClient } from './src/data/convexClient';
import { RootNavigator } from './src/navigation/RootNavigator';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {convexClient ? (
          <ConvexProvider client={convexClient}>
            <RootNavigator />
          </ConvexProvider>
        ) : (
          <RootNavigator />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
