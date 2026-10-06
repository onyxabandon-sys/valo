import { expoClient } from '@better-auth/expo/client';
import { convexClient as convexAuthPlugin } from '@convex-dev/better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { twoFactorClient } from 'better-auth/client/plugins';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { CONVEX_SITE_URL } from '@env';

const AUTH_STORAGE_PREFIX = 'valetpos';

const expoStorage = {
  getItem: (name: string): string | null => {
    try {
      return SecureStore.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string) => {
    try {
      SecureStore.setItem(name, value);
    } catch {
      // Ignore persistence errors.
    }
  },
  deleteItemAsync: async (name: string) => {
    try {
      await SecureStore.deleteItemAsync(name);
    } catch {
      // Ignore persistence errors.
    }
  },
};

const APP_SCHEME = 'valetpos';

const originOverridePlugin = {
  id: 'native-origin-override',
  name: 'Native origin override',
  fetchPlugins: [
    {
      id: 'native-origin-override-fetch',
      name: 'Native origin override fetch',
      hooks: {
        onRequest(context: any) {
          if (Platform.OS === 'web') {
            return context;
          }

          const origin = `${APP_SCHEME}://`;
          const referer = `${origin}/`;
          if (!context.headers.has('origin')) {
            context.headers.set('origin', origin);
          }
          if (!context.headers.has('expo-origin')) {
            context.headers.set('expo-origin', origin);
          }
          if (!context.headers.has('referer')) {
            context.headers.set('referer', referer);
          }
          return context;
        },
      },
    },
  ],
};

export const authClient = createAuthClient({
  baseURL: CONVEX_SITE_URL,
  plugins: [
    convexAuthPlugin(),
    twoFactorClient(),
    expoClient({
      scheme: 'valetpos',
      storagePrefix: AUTH_STORAGE_PREFIX,
      storage: expoStorage,
    }),
    originOverridePlugin,
  ],
});
