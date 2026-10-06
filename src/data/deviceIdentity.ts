import * as SecureStore from 'expo-secure-store';

const DEVICE_ID_KEY = 'valetpos.device-id';
let cachedDeviceId: string | null = null;

function createDeviceId() {
  return `device_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
}

/** Stable non-secret identifier used for sync ownership and diagnostics. */
export async function getDeviceId() {
  if (cachedDeviceId) return cachedDeviceId;
  const stored = await SecureStore.getItemAsync(DEVICE_ID_KEY).catch(() => null);
  if (stored) {
    cachedDeviceId = stored;
    return stored;
  }
  const next = createDeviceId();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, next).catch(() => undefined);
  cachedDeviceId = next;
  return next;
}
