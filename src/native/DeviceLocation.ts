import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { DeviceLocationSnapshot } from '../types';

type NativeDeviceLocation = {
  getCurrentLocation(): Promise<DeviceLocationSnapshot>;
};

export type LoginLocationSnapshot = DeviceLocationSnapshot & { accuracy: number };

const nativeLocation = NativeModules.DeviceLocation as NativeDeviceLocation | undefined;

function locationCacheKey(deviceId: string) {
  return `valetpos.login-location.${deviceId}`;
}

export async function requestLoginLocation(): Promise<LoginLocationSnapshot> {
  if (Platform.OS !== 'android' || !nativeLocation) {
    throw new Error('LOCATION_UNAVAILABLE: This device cannot provide a foreground location fix.');
  }

  let permission = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  if (!permission) {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'Allow location to open Valet POS',
        message: 'Valet POS saves a fresh foreground location with this device assignment before opening.',
        buttonPositive: 'Allow location',
        buttonNegative: 'Not now',
      },
    );
    permission = result === PermissionsAndroid.RESULTS.GRANTED;
    if (!permission) {
      throw new Error('Location permission was denied. Open location settings, allow precise location, then retry.');
    }
  }
  if (!permission) throw new Error('Allow foreground location to finish sign-in, then try again.');

  try {
    const snapshot = await nativeLocation.getCurrentLocation();
    const capturedAt = Date.parse(snapshot.capturedAt);
    if (
      !Number.isFinite(snapshot.latitude) ||
      snapshot.latitude < -90 ||
      snapshot.latitude > 90 ||
      !Number.isFinite(snapshot.longitude) ||
      snapshot.longitude < -180 ||
      snapshot.longitude > 180 ||
      typeof snapshot.accuracy !== 'number' ||
      !Number.isFinite(snapshot.accuracy) ||
      snapshot.accuracy <= 0 ||
      snapshot.accuracy > 100 ||
      !Number.isSafeInteger(capturedAt)
    ) {
      throw new Error('The location fix is not accurate enough. Move to an open area and try again.');
    }
    return { ...snapshot, accuracy: snapshot.accuracy };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('The location fix is not accurate enough.')) throw error;
    const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
    if (code === 'LOCATION_PERMISSION_DENIED') throw new Error('Allow foreground location to finish sign-in, then try again.');
    if (code === 'LOCATION_PROVIDER_DISABLED' || code === 'LOCATION_TIMEOUT') {
      throw new Error('Turn on device location, move to an open area, and try again.');
    }
    throw new Error('A fresh location could not be read. Check device location and try again.');
  }
}

export async function saveLoginLocation(deviceId: string, accountEmail: string, location: LoginLocationSnapshot) {
  const value = JSON.stringify({ accountEmail: accountEmail.trim().toLowerCase(), location });
  await SecureStore.setItemAsync(locationCacheKey(deviceId), value);
}

export async function getLoginLocation(deviceId: string, accountEmail: string): Promise<DeviceLocationSnapshot | null> {
  const stored = await SecureStore.getItemAsync(locationCacheKey(deviceId)).catch(() => null);
  if (!stored) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== 'object' || parsed === null || !('accountEmail' in parsed) || !('location' in parsed)) return null;
    if (parsed.accountEmail !== accountEmail.trim().toLowerCase()) return null;
    const location = parsed.location;
    if (typeof location !== 'object' || location === null) return null;
    if (
      !('latitude' in location) || typeof location.latitude !== 'number' || !Number.isFinite(location.latitude) ||
      !('longitude' in location) || typeof location.longitude !== 'number' || !Number.isFinite(location.longitude) ||
      !('accuracy' in location) || typeof location.accuracy !== 'number' || !Number.isFinite(location.accuracy) ||
      !('capturedAt' in location) || typeof location.capturedAt !== 'string' || !Number.isFinite(Date.parse(location.capturedAt))
    ) return null;
    if (location.latitude < -90 || location.latitude > 90 || location.longitude < -180 || location.longitude > 180 || location.accuracy <= 0 || location.accuracy > 100) return null;
    return {
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      capturedAt: location.capturedAt,
    };
  } catch {
    return null;
  }
}

export async function clearLoginLocation(deviceId: string) {
  await SecureStore.deleteItemAsync(locationCacheKey(deviceId)).catch(() => undefined);
}

export async function requestReceiptLocation(): Promise<DeviceLocationSnapshot | null> {
  if (Platform.OS !== 'android' || !nativeLocation) return null;

  const permission = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    {
      title: 'Allow precise location',
      message: 'Valet POS saves the device location with each receipt for reporting.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    },
  );

  if (permission !== PermissionsAndroid.RESULTS.GRANTED) return null;

  try {
    return await nativeLocation.getCurrentLocation();
  } catch {
    return null;
  }
}
