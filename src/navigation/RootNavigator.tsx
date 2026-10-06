import React, { useEffect, useRef, useState } from 'react';
import { useConvexAuth } from 'convex/react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, Linking, Text, TouchableOpacity, View } from 'react-native';
import * as ExpoNetwork from 'expo-network';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MainScreen } from '../screens/MainScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { DeviceAccessScreen } from '../screens/DeviceAccessScreen';
import { LookupScreen } from '../screens/LookupScreen';
import { ReportScreen } from '../screens/ReportScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { SlipScreen } from '../screens/SlipScreen';
import { VehicleFormScreen } from '../screens/VehicleFormScreen';
import { VehicleTypeScreen } from '../screens/VehicleTypeScreen';
import { userSeed, VEHICLE_RATES } from '../data/seed';
import { createReceipt, createTicket } from '../lib/appFlows';
import { useAppStore } from '../store/useAppStore';
import { RootStackParamList } from './types';
import { SunmiNative } from '../native/SunmiBridge';
import { Receipt } from '../types';
import { clearStoredReceiptLocations, StoredReceiptPayload, toStoredReceiptPayload, ValetDatabase } from '../native/ValetDatabase';
import { getDeviceId } from '../data/deviceIdentity';
import {
  useRecordActiveSession,
  useMarkSessionLoggedOut,
  useDeviceAccessStatus,
  useRequestDeviceAccessCode,
  useVerifyDeviceAccessCode,
  useCompleteDeviceLogin,
  useRevokeDeviceAccess,
  useUpsertReceiptMetadata,
  useCreateConvexTicket,
  useCurrentProfile,
  useBeginRollingReportSnapshot,
  useCreateRollingReportSnapshot,
  useReportSnapshotHistory,
  useTicketByClientId,
  useUpdateReceiptPrintStatus,
} from '../data/convexHooks';
import { authClient } from '../data/authClient';
import { AppIcon } from '../ui/AppIcon';
import { colors } from '../ui/tokens';
import { clearLoginLocation, requestLoginLocation, saveLoginLocation } from '../native/DeviceLocation';
import { usePostHog } from 'posthog-react-native';
import {
  captureSafeLog,
  captureSessionStarted,
  captureTicketCreated,
  syncAnonymousAnalyticsSession,
  type AnalyticsSessionState,
} from '../analytics/telemetry';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

function AuthStatusScreen({
  title,
  message,
  actionLabel,
  isChecking,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  isChecking?: boolean;
  onAction?: () => void;
}) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: colors.ink }}>
      <View style={{ width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cobalt }}>
        {isChecking ? <ActivityIndicator color="#FFFFFF" /> : <AppIcon name="shield-key-outline" color="#FFFFFF" size={34} />}
      </View>
      <Text style={{ color: '#FFFFFF', fontSize: 24, fontWeight: '800', marginTop: 20, textAlign: 'center' }}>{title}</Text>
      <Text style={{ color: '#AAB6CA', fontSize: 15, lineHeight: 22, marginTop: 10, textAlign: 'center' }}>{message}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.88}
          disabled={isChecking}
          onPress={onAction}
          style={{ minWidth: 160, alignItems: 'center', marginTop: 24, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16, backgroundColor: colors.cobalt }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '800' }}>
            {isChecking ? 'Checking...' : actionLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error('OPERATION_TIMEOUT')), timeoutMs);
  });
  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function getAuthErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code) return code;
  }
  return fallback;
}

function HomeTabs({ onCreateReportSnapshot }: { onCreateReportSnapshot: (args: { deviceId: string; requestId: string }) => Promise<{ _id: string; reportDate: string }> }) {
  const store = useAppStore();
  const markSessionLoggedOut = useMarkSessionLoggedOut();
  const revokeDeviceAccess = useRevokeDeviceAccess();
  const insets = useSafeAreaInsets();
  const reportHistory = useReportSnapshotHistory();
  const reportRequestId = useRef<string | null>(null);
  const createReportSnapshot = async () => {
    const deviceId = await getDeviceId();
    reportRequestId.current ??= `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
    const result = await onCreateReportSnapshot({ deviceId, requestId: reportRequestId.current });
    reportRequestId.current = null;
    return result;
  };
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.cobalt,
        tabBarInactiveTintColor: colors.muted,
        tabBarShowLabel: false,
        tabBarItemStyle: {
          flex: 1,
          height: 60,
          alignItems: 'center',
          justifyContent: 'center',
        },
        tabBarIconStyle: {
          marginTop: 0,
        },
        tabBarStyle: {
          position: 'absolute',
          left: 14,
          right: 14,
          bottom: Math.max(insets.bottom, 10),
          height: 86,
          paddingHorizontal: 8,
          backgroundColor: colors.surface,
          borderColor: colors.line,
          borderWidth: 1,
          borderTopWidth: 1,
          borderRadius: 28,
          shadowColor: colors.ink,
          shadowOpacity: 0.14,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 10 },
          elevation: 14,
        },
      }}
    >
      <Tab.Screen
        name="Menu"
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size, focused }) => (
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: focused ? colors.cobaltSoft : 'transparent',
              }}
            >
              <AppIcon name={focused ? 'view-dashboard' : 'view-dashboard-outline'} color={color} size={size} />
            </View>
          ),
        }}
        children={({ navigation }) => (
          <MainScreen
            user={store.user}
            onCheckIn={() => navigation.getParent()?.navigate('VehicleTypes' as never)}
            onHistory={() => navigation.navigate('Report' as never)}
            onLookup={() => navigation.getParent()?.navigate('Lookup' as never)}
          />
        )}
      />
      <Tab.Screen
        name="Report"
        options={{
          tabBarLabel: 'Reports',
          tabBarIcon: ({ color, size, focused }) => (
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: focused ? colors.cobaltSoft : 'transparent',
              }}
            >
              <AppIcon name={focused ? 'chart-box' : 'chart-box-outline'} color={color} size={size} />
            </View>
          ),
        }}
        children={({ navigation }) => (
          <ReportScreen
            snapshots={reportHistory.results}
            historyStatus={reportHistory.status}
            onLoadMore={() => reportHistory.loadMore(30)}
            onCreateSnapshot={createReportSnapshot}
            onBack={() => navigation.navigate('Menu' as never)}
          />
        )}
      />
      <Tab.Screen
        name="Profile"
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, size, focused }) => (
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: focused ? colors.cobaltSoft : 'transparent',
              }}
            >
              <AppIcon name="account-tie" color={color} size={size} />
            </View>
          ),
        }}
        children={() => (
          <ProfileScreen
            user={store.user}
            onLogout={async () => {
              const deviceId = await getDeviceId();
              await ValetDatabase.saveSession(deviceId, store.user.email, false);
              await markSessionLoggedOut({ deviceId, accountEmail: store.user.email }).catch(() => undefined);
              await revokeDeviceAccess();
              await clearLoginLocation(deviceId);
              const result = await authClient.signOut();
              if (result.error) throw new Error(result.error.message ?? 'Could not sign out. Try again.');
              clearAuthenticatedState(store);
            }}
          />
        )}
      />
    </Tab.Navigator>
  );
}

function clearAuthenticatedState(store: ReturnType<typeof useAppStore.getState>) {
  store.setAuthenticated(false);
  store.setGeneratedTicket(null);
  store.setGeneratedReceipt(null);
  store.setBarcodeQuery('');
  store.setLoginPassword('');
  store.setError('');
}

function BootstrapGate() {
  const store = useAppStore();
  useEffect(() => {
    store.bootstrap();
    // Run once on mount so auth state does not reset after every store update.
  }, []);
  return null;
}

type RootNavigatorProps = {
  onReady?: () => void;
};

export function RootNavigator({ onReady }: RootNavigatorProps) {
  const posthog = usePostHog();
  const store = useAppStore();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const [deviceAccessNow, setDeviceAccessNow] = useState(() => Date.now());
  const deviceAccess = useDeviceAccessStatus(isAuthenticated, deviceAccessNow);
  const signedInUser = useCurrentProfile(isAuthenticated);
  const deviceAccessExpiresAt = deviceAccess && 'expiresAt' in deviceAccess ? deviceAccess.expiresAt ?? null : null;
  const signedInUserKey = signedInUser
    ? [
        signedInUser.id,
        signedInUser.name,
        signedInUser.email,
        signedInUser.role,
        signedInUser.locationId,
        signedInUser.organizationCode,
        signedInUser.organizationName,
        signedInUser.locationName,
        signedInUser.locationAddress,
        signedInUser.createdAt,
      ].join('\u001f')
    : '';
  const userLookupLoading = isAuthenticated && signedInUser === undefined;
  const authenticatedProfile = isAuthenticated && !userLookupLoading && Boolean(signedInUser);
  const ticketFromConvex = useTicketByClientId(store.barcodeQuery);
  const createConvexTicket = useCreateConvexTicket();
  const updateReceiptPrintStatus = useUpdateReceiptPrintStatus();
  const beginRollingReportSnapshot = useBeginRollingReportSnapshot();
  const createRollingReportSnapshot = useCreateRollingReportSnapshot();
  const recordActiveSession = useRecordActiveSession();
  const requestDeviceAccessCode = useRequestDeviceAccessCode();
  const verifyDeviceAccessCode = useVerifyDeviceAccessCode();
  const completeDeviceLogin = useCompleteDeviceLogin();
  const revokeDeviceAccess = useRevokeDeviceAccess();
  const upsertReceiptMetadata = useUpsertReceiptMetadata();
  const [loginLoading, setLoginLoading] = useState(false);
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [submittingVehicle, setSubmittingVehicle] = useState(false);
  const [startupRecovery, setStartupRecovery] = useState(false);
  const [startupErrorMessage, setStartupErrorMessage] = useState('');
  const [authGraceExpired, setAuthGraceExpired] = useState(false);
  const [accessBusy, setAccessBusy] = useState(false);
  const [accessLogoutBusy, setAccessLogoutBusy] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [accessError, setAccessError] = useState('');
  const [accessMessage, setAccessMessage] = useState('');
  const syncingReceipts = useRef(false);
  const analyticsSession = useRef<AnalyticsSessionState>({ current: null });
  const trackedRouteName = useRef<string | undefined>(undefined);
  const accessApproved = deviceAccess?.status === 'approved';
  const accessLoading = isAuthenticated && deviceAccess === undefined;
  const showAuthenticatedApp = Boolean(authenticatedProfile && accessApproved && signedInUser?.role === 'attendant');
  const showingAuthLoading = (authLoading || userLookupLoading || accessLoading) && !showAuthenticatedApp;

  useEffect(() => {
    if (authLoading || isAuthenticated) return;
    let cancelled = false;
    void getDeviceId().then(async deviceId => {
      if (cancelled) return;
      await clearLoginLocation(deviceId);
      await clearStoredReceiptLocations();
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || deviceAccessExpiresAt === null) return;
    const timeout = setTimeout(
      () => setDeviceAccessNow(Date.now()),
      Math.max(0, deviceAccessExpiresAt - Date.now() + 1),
    );
    return () => clearTimeout(timeout);
  }, [deviceAccessExpiresAt, isAuthenticated]);

  useEffect(() => {
    if (authLoading || userLookupLoading) return;
    const sessionStarted = syncAnonymousAnalyticsSession(
      posthog,
      analyticsSession.current,
      isAuthenticated && accessApproved && signedInUser?.role === 'attendant',
      signedInUser?.id,
    );
    if (sessionStarted) captureSessionStarted(posthog);
  }, [accessApproved, authLoading, isAuthenticated, posthog, signedInUser?.id, userLookupLoading]);

  useEffect(() => {
    if (!authLoading) {
      setAuthGraceExpired(false);
      return;
    }
    const timeout = setTimeout(() => setAuthGraceExpired(true), 4_000);
    return () => clearTimeout(timeout);
  }, [authLoading]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      if (store.authenticated) store.setAuthenticated(false);
      return;
    }
    if (userLookupLoading) return;
    if (!signedInUser) {
      if (store.authenticated) store.setAuthenticated(false);
      return;
    }
    const nextUser = {
      name: signedInUser.name,
      email: signedInUser.email.trim().toLowerCase(),
      role: signedInUser.role,
      locationId: signedInUser.locationId ?? undefined,
      organizationCode: signedInUser.organizationCode?.toUpperCase() ?? '',
      organizationName: signedInUser.organizationName ?? '',
      locationName: signedInUser.locationName ?? '',
      locationAddress: signedInUser.locationAddress ?? 'Not provided',
      employeeId: signedInUser.id,
      phone: signedInUser.phoneNumber ?? 'Not provided',
      joinedAt: new Date(signedInUser.createdAt).toLocaleDateString(),
      gps: 'Not configured',
      status: 'Active',
    } as const;
    if (JSON.stringify(store.user) !== JSON.stringify(nextUser)) {
      store.setUser(nextUser);
    }
    const authenticated = Boolean(signedInUser?.role === 'attendant' && accessApproved);
    if (store.authenticated !== authenticated) {
      store.setAuthenticated(authenticated);
    }
  }, [accessApproved, authLoading, isAuthenticated, signedInUserKey]);

  useEffect(() => {
    if (!isAuthenticated || !accessApproved || !signedInUser?.email) return;
    let cancelled = false;
    void getDeviceId()
      .then(deviceId => {
        if (cancelled) return;
        void ValetDatabase.saveSession(deviceId, signedInUser.email.trim().toLowerCase(), true);
        return recordActiveSession({
          deviceId,
          accountEmail: signedInUser.email.trim().toLowerCase(),
          lastActivityTimestamp: Date.now(),
        });
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [accessApproved, isAuthenticated, recordActiveSession, signedInUser?.email]);

  useEffect(() => {
    if (!authLoading) {
      onReady?.();
    }
  }, [authLoading, onReady]);

  useEffect(() => {
    if (!showingAuthLoading || startupRecovery || showAuthenticatedApp) return;
    let cancelled = false;
    const detectNetworkError = async () => {
      let message = 'Unable to contact secure services. Check your network and retry.';
      try {
        const networkState = await ExpoNetwork.getNetworkStateAsync();
        if (networkState.isConnected === false) {
          message = 'No network connection detected. Check Wi-Fi or mobile data.';
        } else if (networkState.isInternetReachable === false) {
          message = 'Connected to a network but internet is not reachable.';
        }
      } catch {
        // Keep the default message.
      }
      if (!cancelled) {
        setStartupErrorMessage(message);
        setStartupRecovery(true);
      }
    };
    const timer = setTimeout(() => {
      void detectNetworkError();
    }, 12_000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [showingAuthLoading, showAuthenticatedApp, startupRecovery]);

  useEffect(() => {
    if (!showingAuthLoading && startupRecovery) {
      setStartupRecovery(false);
      setStartupErrorMessage('');
    }
  }, [showingAuthLoading, startupRecovery]);

  const syncStoredReceipt = async (stored: StoredReceiptPayload) => {
    try {
      const result = await withTimeout(createConvexTicket({
        clientId: stored.clientId,
        vehicleType: stored.vehicleType,
        vehicleNumber: stored.vehicleNumber,
        receiptNumber: stored.receiptNumber,
        issuedAt: new Date(stored.issuedAt).getTime(),
        printStatus: stored.printStatus,
        reprintCount: stored.reprintCount,
        deviceId: stored.deviceId,
      }), 15_000);
      await withTimeout(upsertReceiptMetadata({
        receiptId: stored.clientId,
        deviceId: stored.deviceId,
        accountEmail: stored.accountEmail,
        timestamp: new Date(stored.issuedAt).getTime(),
        lamportClock: new Date(stored.issuedAt).getTime(),
        lastMutationId: stored.clientId,
      }), 15_000);
      await withTimeout(updateReceiptPrintStatus({
        clientId: stored.clientId,
        printStatus: stored.printStatus,
        reprintCount: stored.reprintCount,
      }), 15_000);
      await ValetDatabase.markSynced(stored.receiptId, result.ticketId, result.receiptId);
      return true;
    } catch (error) {
      captureSafeLog(posthog, 'receipt_sync_failed', { operation: 'retry_pending_receipt' });
      const message = error instanceof Error ? error.message : 'Synchronization failed';
      await ValetDatabase.markSyncFailed(stored.receiptId, message);
      return false;
    }
  };

  useEffect(() => {
    if (!store.authenticated) return;
    const locationId = store.user.locationId;
    if (!locationId) return;
    const drainPendingReceipts = () => {
      if (syncingReceipts.current) return;
      syncingReceipts.current = true;
      void Promise.resolve().then(async () => {
        if (!store.user.employeeId) return;
        const deviceId = await getDeviceId();
        const receipts = await ValetDatabase.listPendingReceipts(locationId, store.user.employeeId, deviceId, store.user.email, 20);
        for (const receipt of receipts) {
          await syncStoredReceipt(receipt);
        }
      }).catch(() => undefined).finally(() => {
        syncingReceipts.current = false;
      });
    };
    drainPendingReceipts();
    // Retry periodically for offline receipts, but avoid generating a Convex
    // function call every 30 seconds while the app is idle.
    const retryInterval = setInterval(drainPendingReceipts, 120_000);
    return () => clearInterval(retryInterval);
  }, [store.authenticated, store.user.locationId, store.user.employeeId, store.user.email]);

  const createReportSnapshot = async (args: { deviceId: string; requestId: string }) => {
    const locationId = store.user.locationId;
    const employeeId = store.user.employeeId;
    const accountEmail = store.user.email.trim().toLowerCase();
    if (!locationId || !employeeId || !accountEmail) {
      throw new Error('Your assigned location is missing. Sign out and sign in again before creating a report.');
    }
    const networkState = await ExpoNetwork.getNetworkStateAsync();
    if (networkState.isConnected === false || networkState.isInternetReachable === false) {
      throw new Error('Connect to the internet before creating a report so offline receipts can sync first.');
    }
    let snapshotRequest: Awaited<ReturnType<typeof beginRollingReportSnapshot>>;
    try {
      snapshotRequest = await withTimeout(beginRollingReportSnapshot(args), 15_000);
    } catch (error) {
      throw new Error(getAuthErrorMessage(error, 'The report could not be started. Check your connection and retry.'));
    }
    for (let batchNumber = 0; batchNumber < 100; batchNumber += 1) {
      const pending = await ValetDatabase.listPendingReceipts(locationId, employeeId, args.deviceId, accountEmail, 20);
      if (pending.length === 0) break;
      for (const receipt of pending) {
        if (!await syncStoredReceipt(receipt)) {
          throw new Error('Some offline receipts could not sync. Check the connection and retry the report.');
        }
      }
    }
    const remaining = await ValetDatabase.listPendingReceipts(locationId, employeeId, args.deviceId, accountEmail, 1);
    if (remaining.length > 0) {
      throw new Error('More than 2,000 receipts are waiting to sync. Let receipt sync finish, then retry the report.');
    }
    try {
      return await withTimeout(createRollingReportSnapshot({
        deviceId: args.deviceId,
        requestId: snapshotRequest.requestId,
      }), 120_000);
    } catch (error) {
      throw new Error(getAuthErrorMessage(error, 'The report could not be saved. Check your connection and retry.'));
    }
  };

  const printReceipt = async (receiptOverride?: Receipt, isReprint = false) => {
    const receipt = receiptOverride ?? store.generatedReceipt;
    if (!receipt) {
      store.setError('No receipt is available to print.');
      return false;
    }

    try {
      const result = await withTimeout(SunmiNative.printSlip({
        receiptId: receipt.id,
        receiptNumber: receipt.receiptNumber,
        organizationCode: receipt.organizationCode,
        organizationName: receipt.organizationName,
        vehicleNumber: receipt.vehicleNumber,
        vehicleType: receipt.vehicleType,
        vehicleRate: receipt.vehicleRate,
        issuedAt: receipt.issuedAt,
        barcodeValue: receipt.barcodeValue,
      }), 12_000);
      if (!result.success) {
        throw new Error('PRINTER_REJECTED');
      }
      const reprintCount = receipt.reprintCount + (isReprint ? 1 : 0);
      await ValetDatabase.updatePrintStatus(receipt.id, 'printed', isReprint);
      store.setGeneratedReceipt({ ...receipt, printStatus: 'printed', reprintCount });
      const ticketClientId = store.generatedTicket?.id;
      if (isReprint && ticketClientId && signedInUser?.id) {
        void updateReceiptPrintStatus({
          clientId: ticketClientId,
          printStatus: 'printed',
          reprintCount,
        }).catch(async error => {
          const message = error instanceof Error ? error.message : 'Print status synchronization failed';
          await ValetDatabase.markSyncFailed(receipt.id, message);
        });
      }
      store.setError('');
      return true;
    } catch (error) {
      await ValetDatabase.updatePrintStatus(receipt.id, 'failed', false).catch(() => undefined);
      store.setGeneratedReceipt({ ...receipt, printStatus: 'failed' });
      const nativeMessage = error instanceof Error ? error.message : String(error);
      const nativeCode = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code ?? '') : '';
      const failure = `${nativeCode} ${nativeMessage}`;
      captureSafeLog(posthog, 'receipt_print_failed', {
        failure_category: failure.includes('OUT_OF_PAPER')
          ? 'out_of_paper'
          : failure.includes('COVER_OPEN')
            ? 'cover_open'
            : failure.includes('OVERHEATED')
              ? 'overheated'
              : failure.includes('SUNMI_PRINT_TIMEOUT')
                ? 'timeout'
                : 'device_or_printer_error',
      });
      let displayMessage = 'Receipt saved. Printing failed; check the printer and retry.';
      if (failure.includes('SUNMI_PRINT_TIMEOUT')) {
        displayMessage = 'Receipt saved. Print confirmation timed out; check the paper before retrying to avoid a duplicate.';
      } else if (failure.includes('SUNMI_BIND_FAILED') || failure.includes('SUNMI_PRINTER_DISCONNECTED')) {
        displayMessage = 'Receipt saved. SUNMI printer service is not connected. Restart the printer service or reboot the device, then retry.';
      } else if (failure.includes('OUT_OF_PAPER')) {
        displayMessage = 'Receipt saved. The SUNMI printer is out of paper.';
      } else if (failure.includes('COVER_OPEN')) {
        displayMessage = 'Receipt saved. Close the SUNMI printer cover, then retry.';
      } else if (failure.includes('OVERHEATED')) {
        displayMessage = 'Receipt saved. The SUNMI printer is overheated. Let it cool down, then retry.';
      } else if (failure.includes('HARDWARE_ERROR') || failure.includes('NOT_FOUND')) {
        displayMessage = `Receipt saved. SUNMI printer hardware error: ${nativeMessage}`;
      }
      store.setError(displayMessage);
      return false;
    }
  };

  const submitVehicle = async () => {
    if (submittingVehicle) return false;
    setSubmittingVehicle(true);
    try {
      if (!signedInUser?.id || !store.user.locationId) {
        store.setError('Your account is missing location access. Sign in again.');
        return false;
      }

      const ticket = createTicket({
        vehicleType: store.selectedVehicle,
        vehicleNumber: store.vehicleNumber,
        existingCount: store.tickets.length,
        locationName: store.user.locationName,
      });
      const receipt = createReceipt({ ticket, organizationCode: store.user.organizationCode, organizationName: store.user.organizationName });
      const deviceId = await getDeviceId();
      const storedReceipt = toStoredReceiptPayload({
        ticket,
        receipt,
        user: store.user,
        operatorId: signedInUser.id,
        deviceId,
      });
      await ValetDatabase.saveReceipt(storedReceipt);
      captureTicketCreated(posthog, ticket.vehicleType);
      store.setGeneratedTicket(ticket);
      store.setGeneratedReceipt(receipt);
      store.setBarcodeQuery(ticket.id);
      store.setTickets([ticket, ...store.tickets]);
      store.setError('');
      // Local persistence is the completion point for an offline sale. Do not
      // keep the user on the form while printer or network work is pending.
      void (async () => {
        const printed = await printReceipt(receipt);
        await syncStoredReceipt({
          ...storedReceipt,
          printStatus: printed ? 'printed' : 'failed',
        });
      })();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message === 'INVALID_VEHICLE_NUMBER') {
        store.setError('Enter a valid vehicle number.');
      } else if (message === 'LOCATION_REQUIRED') {
        store.setError('Turn on device location and allow precise location before creating a receipt.');
      } else {
        store.setError('Could not create ticket. Try again.');
      }
      return false;
    } finally {
      setSubmittingVehicle(false);
    }
  };

  return (
    <>
      <BootstrapGate />
      {startupRecovery ? (
        <AuthStatusScreen
          title="Connection issue"
          message={startupErrorMessage || 'Unable to contact secure services. Check your network and retry.'}
          actionLabel="Retry"
          onAction={() => {
            setStartupErrorMessage('');
            setStartupRecovery(false);
          }}
        />
      ) : showingAuthLoading && !authGraceExpired ? (
        <AuthStatusScreen
          title="Starting Valet POS"
          message="Restoring the secure production session."
          isChecking
        />
      ) : (
        <NavigationContainer
          ref={navigationRef}
          onReady={() => {
            const routeName = navigationRef.getCurrentRoute()?.name;
            if (routeName) {
              trackedRouteName.current = routeName;
              posthog.screen(routeName);
            }
          }}
          onStateChange={() => {
            const routeName = navigationRef.getCurrentRoute()?.name;
            if (routeName && routeName !== trackedRouteName.current) {
              trackedRouteName.current = routeName;
              posthog.screen(routeName);
            }
          }}
        >
      <Stack.Navigator key={showAuthenticatedApp ? 'app' : 'auth'} screenOptions={{ headerShown: false }}>
        {!showAuthenticatedApp ? (
          isAuthenticated && deviceAccess && deviceAccess.status !== 'approved' ? (
            <Stack.Screen
              name="DeviceAccess"
              children={() => (
                <DeviceAccessScreen
                  ownerEmail={deviceAccess.status === 'notRequested' || deviceAccess.status === 'pending' ? deviceAccess.ownerEmail : null}
                  deliveryChannel={deviceAccess.status === 'notRequested' || deviceAccess.status === 'pending' ? deviceAccess.deliveryChannel : 'email-manual-whatsapp-fallback'}
                  codeSent={deviceAccess.status === 'pending' && deviceAccess.codeSent}
                  locationRequired={deviceAccess.status === 'locationRequired'}
                  expiresAt={deviceAccess.status === 'pending' ? deviceAccess.expiresAt : undefined}
                  busy={accessBusy}
                  logoutBusy={accessLogoutBusy}
                  code={accessCode}
                  error={accessError}
                  message={accessMessage}
                  onCodeChange={value => { setAccessCode(value); setAccessError(''); }}
                  onRequestCode={async () => {
                    if (accessBusy) return;
                    setAccessBusy(true);
                    setAccessError('');
                    setAccessMessage('');
                    try {
                      const deviceId = await getDeviceId();
                      const result = await requestDeviceAccessCode({ deviceId });
                      setAccessMessage(result.channel === 'whatsapp'
                        ? 'One-time code sent to the WhatsApp number on your approved account.'
                        : `Fallback code sent to ${result.ownerEmail}. The owner must forward it to you in a one-to-one WhatsApp chat; Brevo is not sending it directly to WhatsApp.`);
                    } catch (error) {
                      setAccessError(error instanceof Error ? error.message : 'Could not send the approval code. Check your connection and try again.');
                    } finally {
                      setAccessBusy(false);
                    }
                  }}
                  onVerifyCode={async () => {
                    if (accessBusy || accessCode.length !== 8) return;
                    setAccessBusy(true);
                    setAccessError('');
                    setAccessMessage('');
                    try {
                      const deviceId = await getDeviceId();
                      const result = await verifyDeviceAccessCode({ code: accessCode, deviceId });
                      if (!result.approved) {
                        setAccessError(result.message);
                        return;
                      }
                      setAccessCode('');
                      setAccessMessage('Code approved. Capture your foreground location to finish sign-in.');
                    } catch (error) {
                      setAccessError(error instanceof Error ? error.message : 'Could not verify the approval code. Try again.');
                    } finally {
                      setAccessBusy(false);
                    }
                  }}
                  onCompleteLocation={async () => {
                    if (accessBusy) return;
                    setAccessBusy(true);
                    setAccessError('');
                    setAccessMessage('');
                    let deviceId = '';
                    try {
                      deviceId = await getDeviceId();
                      const accountEmail = signedInUser?.email.trim().toLowerCase() ?? '';
                      if (!accountEmail) throw new Error('ACCOUNT_EMAIL_MISSING: Sign out and sign in again.');
                      const location = await requestLoginLocation();
                      await saveLoginLocation(deviceId, accountEmail, location);
                      await completeDeviceLogin({
                        deviceId,
                        location: {
                          latitude: location.latitude,
                          longitude: location.longitude,
                          accuracy: location.accuracy,
                          capturedAt: Date.parse(location.capturedAt),
                        },
                      });
                      setAccessMessage('Location saved. Finishing secure sign-in…');
                    } catch (error) {
                      if (deviceId) await clearLoginLocation(deviceId);
                      setAccessError(error instanceof Error ? error.message : 'Location could not be saved. Try again or sign out.');
                    } finally {
                      setAccessBusy(false);
                    }
                  }}
                  onOpenSettings={() => { void Linking.openSettings().catch(() => setAccessError('Open Android Settings, choose Apps, then Valet POS and allow precise location.')); }}
                  onLogout={async () => {
                    if (accessLogoutBusy) return;
                    setAccessLogoutBusy(true);
                    setAccessError('');
                    try {
                      await revokeDeviceAccess();
                      const deviceId = await getDeviceId();
                      await clearLoginLocation(deviceId);
                      const result = await authClient.signOut();
                      if (result.error) throw new Error(result.error.message ?? 'Could not sign out. Try again.');
                      clearAuthenticatedState(store);
                    } catch (error) {
                      setAccessError(error instanceof Error ? error.message : 'Could not safely remove this sign-in. Check your connection and try again.');
                    } finally {
                      setAccessLogoutBusy(false);
                    }
                  }}
                />
              )}
            />
          ) : <>
            <Stack.Screen
              name="Login"
              children={() => (
                <LoginScreen
                  email={store.loginEmail}
                  password={store.loginPassword}
                  error={store.error}
                  isLoading={loginLoading}
                  twoFactorRequired={twoFactorRequired}
                  twoFactorCode={twoFactorCode}
                  onTwoFactorCodeChange={setTwoFactorCode}
                  onEmailChange={store.setLoginEmail}
                  onPasswordChange={store.setLoginPassword}
                  onLogin={async () => {
                    if (loginLoading) return;
                    const email = store.loginEmail.trim().toLowerCase();
                    const password = store.loginPassword;
                    if (!email.includes('@') || !password) {
                      store.setError('Enter your email address and password.');
                      return;
                    }
                    setLoginLoading(true);
                    store.setError('');
                    try {
                      const result = await withTimeout(authClient.signIn.email({ email, password }), 15_000);
                      if (result.error) {
                        store.setError(getAuthErrorMessage(result.error, 'Sign in failed. Check your credentials.'));
                      } else if (result.data && 'twoFactorRedirect' in result.data && result.data.twoFactorRedirect === true) {
                        setTwoFactorRequired(true);
                        setTwoFactorCode('');
                      }
                    } catch (error) {
                      store.setError(error instanceof Error && error.message === 'OPERATION_TIMEOUT'
                        ? 'Secure sign-in is unreachable. Connect this device to the internet and try again.'
                        : getAuthErrorMessage(error, 'Sign in failed. Check your connection.'));
                    } finally {
                      setLoginLoading(false);
                    }
                  }}
                  onVerifyTwoFactor={async (code, useBackupCode) => {
                    if (loginLoading) return;
                    const normalizedCode = code.trim();
                    if (!normalizedCode) {
                      store.setError(useBackupCode ? 'Enter a backup code.' : 'Enter the code from your authenticator app.');
                      return;
                    }
                    setLoginLoading(true);
                    store.setError('');
                    try {
                      const result = await withTimeout(
                        useBackupCode
                          ? authClient.twoFactor.verifyBackupCode({ code: normalizedCode })
                          : authClient.twoFactor.verifyTotp({ code: normalizedCode, trustDevice: false }),
                        15_000,
                      );
                      if (result.error) {
                        store.setError(getAuthErrorMessage(result.error, 'That code was not accepted. Try again.'));
                      } else {
                        setTwoFactorRequired(false);
                        setTwoFactorCode('');
                      }
                    } catch (error) {
                      store.setError(getAuthErrorMessage(error, 'Could not verify the code. Check your connection and try again.'));
                    } finally {
                      setLoginLoading(false);
                    }
                  }}
                />
              )}
            />
          </>
        ) : (
          <>
            <Stack.Screen name="MainTabs">
              {() => <HomeTabs onCreateReportSnapshot={createReportSnapshot} />}
            </Stack.Screen>
            <Stack.Screen
              name="VehicleTypes"
              children={({ navigation }) => (
                <VehicleTypeScreen
                  selectedVehicle={store.selectedVehicle}
                  onContinue={vehicle => {
                    store.setSelectedVehicle(vehicle);
                    store.setSelectedAmount(VEHICLE_RATES[vehicle].toFixed(2));
                    navigation.navigate('VehicleForm');
                  }}
                  onBack={() => navigation.goBack()}
                />
              )}
            />
            <Stack.Screen
              name="VehicleForm"
              children={({ navigation }) => (
                <VehicleFormScreen
                  vehicleType={store.selectedVehicle}
                  vehicleNumber={store.vehicleNumber}
                  amount={store.selectedAmount}
                  locationName={store.user.locationName}
                  error={store.error}
                  isSubmitting={submittingVehicle}
                  onVehicleNumberChange={store.setVehicleNumber}
                  onSubmit={async () => {
                    if (await submitVehicle()) {
                      navigation.navigate('Slip');
                    }
                  }}
                  onBack={() => navigation.goBack()}
                />
              )}
            />
            <Stack.Screen
              name="Slip"
              children={({ navigation }) =>
                store.generatedReceipt ? (
                  <SlipScreen
                    receipt={store.generatedReceipt}
                    error={store.error}
                    onPrint={() => {
                      void printReceipt(undefined, true);
                    }}
                    onNewSale={() => {
                      store.setGeneratedTicket(null);
                      store.setGeneratedReceipt(null);
                      store.setBarcodeQuery('');
                      store.setVehicleNumber('');
                      store.setError('');
                      navigation.navigate('MainTabs');
                    }}
                  />
                ) : (
                  <View />
                )
              }
            />
            <Stack.Screen
              name="Lookup"
              children={({ navigation }) => (
                <LookupScreen
                  query={store.barcodeQuery}
                  ticket={
                    ticketFromConvex
                      ? {
                          id: ticketFromConvex._id,
                          ticketNumber: ticketFromConvex.ticketNumber,
                          vehicleType: ticketFromConvex.vehicleType,
                          vehicleNumber: ticketFromConvex.vehicleNumber,
                          amount: ticketFromConvex.amount,
                          createdAt: new Date(ticketFromConvex.createdAt).toISOString(),
                          locationName: userSeed.locationName,
                          paymentStatus: 'paid',
                          paymentMethod: ticketFromConvex.paymentMethod,
                        }
                      : null
                  }
                  onQueryChange={store.setBarcodeQuery}
                  onBack={() => navigation.goBack()}
                />
              )}
            />
          </>
        )}
      </Stack.Navigator>
        </NavigationContainer>
      )}
    </>
  );
}
