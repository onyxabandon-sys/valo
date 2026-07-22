import React, { useEffect, useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Share, View } from 'react-native';
import { MainScreen } from '../screens/MainScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { LookupScreen } from '../screens/LookupScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { ReportScreen } from '../screens/ReportScreen';
import { SignupScreen } from '../screens/SignupScreen';
import { SlipScreen } from '../screens/SlipScreen';
import { VehicleFormScreen } from '../screens/VehicleFormScreen';
import { VehicleTypeScreen } from '../screens/VehicleTypeScreen';
import { userSeed, VEHICLE_RATES } from '../data/seed';
import { createTicket } from '../lib/appFlows';
import { buildReportExport } from '../lib/reportExport';
import { useAppStore } from '../store/useAppStore';
import { RootStackParamList } from './types';
import { SunmiNative } from '../native/SunmiBridge';
import { useCreateConvexTicket, useCreateOrganization, useDailyReport, useLocationById, useTicketByClientId, useUserByEmail } from '../data/convexHooks';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

function HomeTabs() {
  const store = useAppStore();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const reportResult: any = useDailyReport(store.user.locationId ?? '', todayStart.getTime(), Date.now());
  const reportTickets =
    reportResult?.tickets?.map((ticket: any) => ({
      id: ticket._id,
      ticketNumber: ticket.ticketNumber,
      vehicleType: ticket.vehicleType,
      vehicleNumber: ticket.vehicleNumber,
      amount: ticket.amount,
      createdAt: new Date(ticket.createdAt).toISOString(),
      locationName: userSeed.locationName,
      paymentStatus: 'paid' as const,
      paymentMethod: 'cash' as const,
    })) ?? [];
  const exportReport = async () => {
    const payload = buildReportExport({
      locationName: store.user.locationName,
      tickets: store.tickets,
      report: reportResult ? { count: reportResult.count, revenue: reportResult.revenue } : null,
      generatedAt: new Date().toISOString(),
    });

    await Share.share({
      title: payload.fileName,
      message: payload.csv,
    });
  };
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen
        name="Menu"
        children={({ navigation }) => (
          <MainScreen
            user={store.user}
            onCheckIn={() => navigation.navigate('VehicleTypes' as never)}
            onProfile={() => navigation.navigate('Profile' as never)}
            onHistory={() => navigation.navigate('Report' as never)}
            onLookup={() => navigation.navigate('Lookup' as never)}
          />
        )}
      />
      <Tab.Screen
        name="Report"
        children={({ navigation }) => (
          <ReportScreen
            tickets={store.tickets}
            report={reportResult ?? null}
            reportTickets={reportTickets}
            onExport={exportReport}
            onBack={() => navigation.navigate('Menu' as never)}
          />
        )}
      />
      <Tab.Screen
        name="Profile"
        children={() => (
          <ProfileScreen
            user={store.user}
            onLogout={() => {
              store.setAuthenticated(false);
              store.setGeneratedTicket(null);
              store.setBarcodeQuery('');
            }}
          />
        )}
      />
    </Tab.Navigator>
  );
}

function BootstrapGate() {
  const store = useAppStore();
  useEffect(() => {
    store.bootstrap();
    // Run once on mount so auth state does not reset after every store update.
  }, []);
  return null;
}

export function RootNavigator() {
  const store = useAppStore();
  const signedInUser: any = useUserByEmail(store.loginEmail);
  const signedInLocation: any = useLocationById(signedInUser?.locationId ?? '');
  const userLookupLoading = store.loginEmail.trim() !== '' && (signedInUser === undefined || (signedInUser?.locationId && signedInLocation === undefined));
  const ticketFromConvex: any = useTicketByClientId(store.barcodeQuery);
  const createConvexTicket = useCreateConvexTicket();
  const createOrganization = useCreateOrganization();
  const [signupLoading, setSignupLoading] = useState(false);

  const submitVehicle = async () => {
    try {
      if (!signedInUser?._id || !store.user.locationId) {
        store.setError('Your account is missing location access. Sign in again.');
        return false;
      }

      const ticket = createTicket({
        vehicleType: store.selectedVehicle,
        vehicleNumber: store.vehicleNumber,
        amount: Number(store.selectedAmount),
        existingCount: store.tickets.length,
        locationName: store.user.locationName,
      });
      await createConvexTicket({
        clientId: ticket.id,
        locationId: store.user.locationId as any,
        ticketNumber: ticket.ticketNumber,
        vehicleType: ticket.vehicleType as any,
        vehicleNumber: ticket.vehicleNumber,
        amount: ticket.amount,
        paymentStatus: 'paid',
        paymentMethod: 'cash',
        createdByUserId: signedInUser._id,
      });
      store.setGeneratedTicket(ticket);
      store.setBarcodeQuery(ticket.id);
      store.setTickets([ticket, ...store.tickets]);
      store.setError('');
      try {
        await SunmiNative.printSlip({
          ticketId: ticket.id,
          ticketNumber: ticket.ticketNumber,
          vehicleNumber: ticket.vehicleNumber,
          vehicleType: ticket.vehicleType,
          locationName: ticket.locationName,
          amount: ticket.amount,
          paymentStatus: ticket.paymentStatus,
          createdAt: ticket.createdAt,
          barcodeValue: ticket.id,
        });
      } catch {
        store.setError('Ticket created. Printing failed; open the slip to retry.');
      }
      return true;
    } catch (error) {
      store.setError(error instanceof Error && error.message === 'INVALID_VEHICLE_NUMBER' ? 'Enter a valid vehicle number.' : 'Could not create ticket. Try again.');
      return false;
    }
  };

  return (
    <NavigationContainer>
      <BootstrapGate />
      <Stack.Navigator key={store.authenticated ? 'app' : 'auth'} screenOptions={{ headerShown: false }}>
        {!store.authenticated ? (
          <>
            <Stack.Screen
              name="Login"
              children={({ navigation }) => (
                <LoginScreen
                  email={store.loginEmail}
                  password={store.loginPassword}
                  error={store.error}
                  isLoading={userLookupLoading}
                  onEmailChange={store.setLoginEmail}
                  onPasswordChange={store.setLoginPassword}
                  onLogin={() => {
                    if (userLookupLoading) {
                      return;
                    }
                    if (!signedInUser) {
                      store.setError('No account found for that email.');
                      return;
                    }
                    if (signedInUser.passwordHash !== store.loginPassword) {
                      store.setError('Invalid password.');
                      return;
                    }
                    store.setUser({
                      name: signedInUser.name,
                      email: signedInUser.email,
                      role: signedInUser.role,
                      locationId: signedInUser.locationId ?? undefined,
                      locationName: signedInLocation?.name ?? store.user.locationName,
                      locationAddress: signedInLocation?.address ?? store.user.locationAddress,
                      employeeId: signedInUser.employeeId ?? store.user.employeeId,
                      phone: signedInUser.phone ?? store.user.phone,
                      joinedAt: signedInUser.joinedAt ?? store.user.joinedAt,
                      gps: signedInUser.gps ?? store.user.gps,
                      status: signedInUser.status ?? store.user.status,
                    });
                    store.setError('');
                    store.setAuthenticated(true);
                    navigation.navigate('MainTabs');
                  }}
                  onSignup={() => navigation.navigate('Signup')}
                />
              )}
            />
            <Stack.Screen
              name="Signup"
              children={({ navigation }) => (
                <SignupScreen
                  email={store.signupEmail}
                  password={store.signupPassword}
                  confirmPassword={store.signupConfirm}
                  locationName={store.signupLocation}
                  code={store.signupCode}
                  error={store.error}
                  isLoading={signupLoading}
                  onEmailChange={store.setSignupEmail}
                  onPasswordChange={store.setSignupPassword}
                  onConfirmPasswordChange={store.setSignupConfirm}
                  onLocationChange={store.setSignupLocation}
                  onCodeChange={store.setSignupCode}
                  onSubmit={async () => {
                    if (signupLoading) {
                      return;
                    }
                    const email = store.signupEmail.trim().toLowerCase();
                    const locationName = store.signupLocation.trim();
                    const organizationCode = store.signupCode.trim();
                    if (!email || !locationName || !organizationCode || !store.signupPassword) {
                      store.setError('Fill in every field to create an account.');
                      return;
                    }
                    if (!email.includes('@')) {
                      store.setError('Enter a valid email address.');
                      return;
                    }
                    if (store.signupPassword !== store.signupConfirm) {
                      store.setError('Passwords do not match.');
                      return;
                    }
                    setSignupLoading(true);
                    try {
                      const result = await createOrganization({
                        email,
                        passwordHash: store.signupPassword,
                        locationName,
                        organizationCode,
                      });
                      if (!result.user || !result.location) {
                        store.setError('Could not create account. Try again.');
                        return;
                      }
                      store.setUser({
                        name: result.user.name,
                        email: result.user.email,
                        role: result.user.role,
                        locationId: result.user.locationId,
                        locationName: result.location.name,
                        locationAddress: result.location.address ?? locationName,
                        employeeId: store.user.employeeId,
                        phone: store.user.phone,
                        joinedAt: new Date().toLocaleDateString(),
                        gps: store.user.gps,
                        status: 'Active',
                      });
                      store.setLoginEmail(result.user.email);
                      store.setLoginPassword(store.signupPassword);
                      store.setTickets([]);
                      store.setGeneratedTicket(null);
                      store.setBarcodeQuery('');
                      store.setError('');
                      store.setAuthenticated(true);
                      navigation.navigate('MainTabs');
                    } catch (error) {
                      store.setError(error instanceof Error ? error.message : 'Could not create account. Try again.');
                    } finally {
                      setSignupLoading(false);
                    }
                  }}
                />
              )}
            />
          </>
        ) : (
          <>
            <Stack.Screen name="MainTabs" component={HomeTabs} />
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
                  onVehicleNumberChange={store.setVehicleNumber}
                  onAmountChange={store.setSelectedAmount}
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
                store.generatedTicket ? (
                  <SlipScreen
                    ticket={store.generatedTicket}
                    onPrint={async () => {
                      await SunmiNative.printSlip({
                        ticketId: store.generatedTicket!.id,
                        ticketNumber: store.generatedTicket!.ticketNumber,
                        vehicleNumber: store.generatedTicket!.vehicleNumber,
                        vehicleType: store.generatedTicket!.vehicleType,
                        locationName: store.generatedTicket!.locationName,
                        amount: store.generatedTicket!.amount,
                        paymentStatus: store.generatedTicket!.paymentStatus,
                        createdAt: store.generatedTicket!.createdAt,
                        barcodeValue: store.generatedTicket!.id,
                      });
                    }}
                    onNewSale={() => {
                      store.setGeneratedTicket(null);
                      store.setBarcodeQuery('');
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
            <Stack.Screen
              name="Report"
              children={({ navigation }) => (
                <ReportScreen
                  tickets={store.tickets}
                  report={null}
                  onBack={() => navigation.goBack()}
                />
              )}
            />
            <Stack.Screen
              name="Profile"
              children={() => (
                <ProfileScreen
                  user={store.user}
                  onLogout={() => {
                    store.setAuthenticated(false);
                    store.setGeneratedTicket(null);
                    store.setBarcodeQuery('');
                  }}
                />
              )}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
