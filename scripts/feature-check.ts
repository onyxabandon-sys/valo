import assert from 'node:assert/strict';
import { strFromU8, unzipSync } from 'fflate';
import { convexSchema } from '../src/data/convexSchema';
import { localDatabase } from '../src/data/localDatabase';
import { initialTickets, userSeed, VEHICLE_RATES } from '../src/data/seed';
import { createReceipt, createTicket } from '../src/lib/appFlows';
import { getDailyReportWindow, getLocalDateKey } from '../src/lib/dailyReport';
import { buildReportExport } from '../src/lib/reportExport';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isValidEmail, isValidPassword, isValidVehicleNumber, normalizeVehicleNumber } from '../src/lib/validation';
import { Ticket } from '../src/types';

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 't_feature_test',
    ticketNumber: '1-9999',
    vehicleType: 'Car',
    vehicleNumber: 'MH12AB1234',
    amount: 100,
    createdAt: '2026-07-16T00:00:00.000Z',
    locationName: userSeed.locationName,
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    ...overrides,
  };
}

function getConvexExportBlock(source: string, name: string) {
  const start = source.indexOf(`export const ${name} =`);
  assert.notEqual(start, -1, `Expected Convex export ${name}`);
  const next = source.indexOf('\nexport const ', start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

function run() {
  const reportScreen = readFileSync(path.join(process.cwd(), 'src', 'screens', 'ReportScreen.tsx'), 'utf8');
  const mainScreen = readFileSync(path.join(process.cwd(), 'src', 'screens', 'MainScreen.tsx'), 'utf8');
  const profileScreen = readFileSync(path.join(process.cwd(), 'src', 'screens', 'ProfileScreen.tsx'), 'utf8');
  const rootNavigator = readFileSync(path.join(process.cwd(), 'src', 'navigation', 'RootNavigator.tsx'), 'utf8');
  const deviceAccessScreen = readFileSync(path.join(process.cwd(), 'src', 'screens', 'DeviceAccessScreen.tsx'), 'utf8');
  const deviceAccessBackend = readFileSync(path.join(process.cwd(), 'convex', 'deviceAccess.ts'), 'utf8');
  const reportsBackend = readFileSync(path.join(process.cwd(), 'convex', 'reports.ts'), 'utf8');
  const deviceAccessStatusQuery = getConvexExportBlock(deviceAccessBackend, 'getMyStatus');
  const adminBackend = readFileSync(path.join(process.cwd(), 'convex', 'admin.ts'), 'utf8');
  const authBackend = readFileSync(path.join(process.cwd(), 'convex', 'auth.ts'), 'utf8');
  const authGuards = readFileSync(path.join(process.cwd(), 'convex', 'lib', 'auth.ts'), 'utf8');
  localDatabase.reset(initialTickets);

  assert.equal(isValidEmail('user@example.com'), true);
  assert.equal(isValidEmail('bad-email'), false);
  assert.equal(isValidPassword('LongPassw0rd'), true);
  assert.equal(isValidPassword('Passw0rd'), false);
  assert.equal(isValidPassword('short1'), false);
  assert.equal(isValidVehicleNumber('MH12AB1234'), true);
  assert.equal(isValidVehicleNumber('ABC-123'), true);
  assert.equal(isValidVehicleNumber('LEA 12 3456'), true);
  assert.equal(normalizeVehicleNumber(' lea  12-3456 '), 'LEA-12-3456');
  assert.equal(isValidVehicleNumber('ABC/123'), false);
  assert.equal(isValidVehicleNumber('-ABC123'), false);
  assert.equal(isValidVehicleNumber('x'), false);

  const leapDay = getDailyReportWindow('2024-02-29');
  assert.equal(new Date(leapDay.from).getDate(), 29);
  assert.equal(new Date(leapDay.to).getDate(), 1);
  assert.equal(new Date(leapDay.to).getMonth(), 2);
  assert.equal(getLocalDateKey(new Date(leapDay.from)), '2024-02-29');
  assert.throws(() => getDailyReportWindow('2024-02-30'), /INVALID_REPORT_DATE/);
  assert.throws(() => getDailyReportWindow('not-a-date'), /INVALID_REPORT_DATE/);

  const before = localDatabase.listTickets().length;
  localDatabase.addTicket(makeTicket({ id: 't_added' }));
  assert.equal(localDatabase.listTickets().length, before + 1);
  assert.equal(localDatabase.findTicketById('t_added')?.vehicleNumber, 'MH12AB1234');
  assert.equal(localDatabase.listPendingSync().length, 1);
  localDatabase.markSynced('t_added');
  assert.equal(localDatabase.listPendingSync().length, 0);

  const report = localDatabase.getDailyReport();
  assert.equal(report.count, before + 1);
  assert.ok(report.total > 0);

  assert.equal(VEHICLE_RATES.Car, 100);
  assert.equal(VEHICLE_RATES.Bike, 50);

  assert.ok('users' in convexSchema);
  assert.ok('locations' in convexSchema);
  assert.ok('tickets' in convexSchema);
  assert.equal(convexSchema.tickets.paymentMethod, 'cash');

  const seeded = initialTickets.every(ticket => ticket.paymentStatus === 'paid' && ticket.paymentMethod === 'cash');
  assert.equal(seeded, true);

  const generated = createTicket({
    vehicleType: 'Bike',
    vehicleNumber: 'MH12AB1234',
    existingCount: before + 1,
  });
  assert.equal(generated.vehicleType, 'Bike');
  assert.equal(generated.amount, 50);
  assert.equal(generated.vehicleNumber, 'MH12AB1234');
  assert.equal(generated.paymentStatus, 'paid');

  const generatedWithSeparators = createTicket({
    vehicleType: 'Car',
    vehicleNumber: ' lea 12 3456 ',
    existingCount: before + 2,
  });
  assert.equal(generatedWithSeparators.vehicleNumber, 'LEA-12-3456');
  assert.equal(generatedWithSeparators.amount, 100);

  const receipt = createReceipt({ ticket: generated, organizationCode: 'org-001' });
  assert.equal(receipt.organizationCode, 'ORG-001');
  assert.equal(receipt.vehicleNumber, generated.vehicleNumber);
  assert.equal(receipt.vehicleType, 'Bike');
  assert.equal(receipt.vehicleRate, 50);
  assert.equal(receipt.barcodeValue, receipt.receiptNumber);
  assert.equal(receipt.printStatus, 'pending');
  assert.equal(receipt.reprintCount, 0);

  const exportPayload = buildReportExport({
    locationName: userSeed.locationName,
    tickets: [],
    rows: [{
      receiptNumber: receipt.receiptNumber,
      barcodeValue: receipt.barcodeValue,
      organizationCode: receipt.organizationCode,
      organizationName: userSeed.organizationName,
      locationName: userSeed.locationName,
      vehicleNumber: receipt.vehicleNumber,
      vehicleType: receipt.vehicleType,
      vehicleRate: receipt.vehicleRate,
      issuedAt: receipt.issuedAt,
      operatorName: userSeed.name,
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      printStatus: 'printed',
      syncStatus: 'synced',
      reprintCount: 0,
    }],
    report: { count: 1, revenue: 50 },
    generatedAt: '2026-08-15T10:00:00.000Z',
  });
  assert.ok(exportPayload.fileName.endsWith('.xlsx'));
  assert.equal(exportPayload.bytes[0], 0x50);
  assert.equal(exportPayload.bytes[1], 0x4b);
  const workbookFiles = unzipSync(exportPayload.bytes);
  const receiptsSheet = strFromU8(workbookFiles['xl/worksheets/sheet2.xml']);
  const summarySheet = strFromU8(workbookFiles['xl/worksheets/sheet1.xml']);
  assert.doesNotMatch(receiptsSheet, /Organization Code/);
  assert.match(receiptsSheet, /Organization/);
  assert.match(receiptsSheet, /Print Status/);
  assert.match(receiptsSheet, new RegExp(receipt.receiptNumber));
  assert.doesNotMatch(receiptsSheet, /Latitude|Longitude|GPS/);
  assert.match(summarySheet, /Location/);
  assert.match(summarySheet, /Valet POS/);

  assert.match(reportScreen, /Last 24 hours/);
  assert.match(reportScreen, /Save 24-hour report/);
  assert.match(reportScreen, /Choose a saved report date/);
  assert.match(reportScreen, /Saved window/);
  assert.match(reportScreen, /Printed receipts/);
  assert.match(reportScreen, /Load earlier reports/);
  assert.match(reportScreen, /onCreateSnapshot\(\)/);
  assert.doesNotMatch(reportScreen, /ticketCopy|ticketAmount|getDailyReport|onReportDateChange/);
  assert.doesNotMatch(reportScreen, /Monthly Receipt|monthlyReport|Device GPS|Reprints/);
  assert.match(rootNavigator, /const userLookupLoading = isAuthenticated && signedInUser === undefined;/);
  assert.match(rootNavigator, /const authenticatedProfile = isAuthenticated && !userLookupLoading && Boolean\(signedInUser\);/);
  assert.match(rootNavigator, /const showAuthenticatedApp = Boolean\(authenticatedProfile && accessApproved && signedInUser\?\.role === 'attendant'\);/);
  assert.match(rootNavigator, /const showingAuthLoading = \(authLoading \|\| userLookupLoading \|\| accessLoading\) && !showAuthenticatedApp;/);
  assert.match(rootNavigator, /name="DeviceAccess"/);
  assert.match(rootNavigator, /const accountEmail = signedInUser\?\.email\.trim\(\)\.toLowerCase\(\) \?\? '';/, 'Login location must be keyed to the authenticated profile email');
  assert.doesNotMatch(rootNavigator, /const accountEmail = store\.loginEmail\.trim\(\)\.toLowerCase\(\);/, 'A stale sign-in form email must not key the saved login location');
  assert.match(deviceAccessScreen, /The owner must send the code to you in a one-to-one WhatsApp chat/);
  assert.match(deviceAccessScreen, /Brevo does not send this fallback code directly through WhatsApp/);
  assert.match(deviceAccessScreen, /Brevo sends the one-time code to the WhatsApp number saved on your approved account/);
  assert.match(deviceAccessBackend, /https:\/\/api\.brevo\.com\/v3\/whatsapp\/sendMessage/);
  assert.match(deviceAccessScreen, /15 minutes/);
  assert.match(deviceAccessBackend, /crypto\.subtle\.sign\('HMAC'/);
  assert.match(deviceAccessBackend, /MAX_CODE_ATTEMPTS = 5/);
  assert.match(deviceAccessBackend, /MAX_REQUESTS_PER_WINDOW = 5/);
  assert.match(deviceAccessBackend, /MAX_APPROVAL_DELIVERIES_PER_HOUR = 20/);
  assert.match(deviceAccessBackend, /expiresAt: v\.number\(\)/);
  assert.match(deviceAccessStatusQuery, /args: \{ now: v\.number\(\) \}/);
  assert.match(deviceAccessStatusQuery, /const serverNow = Date\.now\(\)/);
  assert.match(deviceAccessStatusQuery, /record\.expiresAt > serverNow/);
  assert.match(deviceAccessStatusQuery, /record\.expiresAt <= serverNow/);
  assert.match(deviceAccessStatusQuery, /assignment\.sessionExpiresAt/);
  assert.match(rootNavigator, /setTimeout\([\s\S]*deviceAccessExpiresAt - Date\.now\(\)/, 'Approval UI must refresh when the code expires');
  assert.match(authGuards, /requireApprovedIdentity/);
  assert.match(reportsBackend, /assertLegacyReportCandidateCount\(receiptCandidates\.length\)/);
  assert.match(reportsBackend, /count: reportTotals\.count/);
  assert.match(reportsBackend, /revenue: reportTotals\.revenueCents \/ 100/);
  assert.doesNotMatch(reportsBackend, /count: validRows\.length/, 'Legacy report totals must include every matching printed receipt, not only detail rows');
  for (const endpoint of [
    'getDashboard', 'listDashboardLocations', 'listDashboardUsers', 'listDashboardDevices', 'listDashboardAudit',
    'updateAttendant', 'setAttendantActive', 'assignDevice', 'revokeDevice', 'releaseDevice',
    'createLocation', 'updateLocation',
  ]) {
    assert.match(getConvexExportBlock(adminBackend, endpoint), /await requireAdministrator\(ctx\)/, `${endpoint} must enforce administrator access on the server`);
  }
  for (const endpoint of [
    'updateAttendant', 'setAttendantActive', 'assignDevice', 'revokeDevice',
    'releaseDevice', 'createLocation', 'updateLocation',
  ]) {
    assert.match(getConvexExportBlock(adminBackend, endpoint), /writeAudit\(/, `${endpoint} must write an administrator audit entry`);
  }
  const createAttendant = getConvexExportBlock(adminBackend, 'createAttendant');
  const persistProvisionedAttendant = getConvexExportBlock(adminBackend, 'persistProvisionedAttendant');
  assert.match(createAttendant, /internal\.admin\.assertCurrentAdministrator/);
  assert.match(persistProvisionedAttendant, /await requireAdministrator\(ctx\)/);
  assert.match(persistProvisionedAttendant, /writeAudit\(/);
  assert.match(authBackend, /disableSignUp:\s*true/);
  assert.match(authBackend, /disabledPaths:\s*\[['"]\/sign-up\/email['"]\]/);
  assert.match(authBackend, /expiresIn:\s*SESSION_MAX_AGE_SECONDS/);
  assert.match(authBackend, /disableSessionRefresh:\s*true/);
  assert.match(deviceAccessBackend, /sessionExpiresAt:\s*getSessionExpiresAt\(now\)/);
  assert.match(deviceAccessBackend, /isSessionExpired\(assignment\.sessionExpiresAt/);
  assert.doesNotMatch(rootNavigator, /SignupScreen|signUp\.email/);
  const adminBootstrap = getConvexExportBlock(adminBackend, 'bootstrapFirstAdmin');
  assert.match(adminBootstrap, /ADMIN_BOOTSTRAP_SECRET/);
  assert.match(adminBootstrap, /ADMIN_BOOTSTRAP_EMAIL/);
  assert.match(adminBootstrap, /safeSecretEquals/);
  const bootstrapAvailabilityStart = adminBackend.indexOf('async function canBootstrapConfiguredAdministrator');
  const bootstrapAvailabilityEnd = adminBackend.indexOf('\n}', bootstrapAvailabilityStart);
  const bootstrapAvailability = adminBackend.slice(bootstrapAvailabilityStart, bootstrapAvailabilityEnd + 2);
  assert.match(bootstrapAvailability, /query\('adminSetup'\)[\s\S]*?unique\(\)/);
  assert.match(bootstrapAvailability, /return setup === null/);
  assert.doesNotMatch(bootstrapAvailability, /users|authUserId|authTokenIdentifier/);
  assert.match(getConvexExportBlock(adminBackend, 'finishFirstAdminBootstrap'), /canBootstrapConfiguredAdministrator/);
  assert.match(adminBootstrap, /ADMIN_ALREADY_INITIALIZED/);
  assert.doesNotMatch(rootNavigator, /store\.authenticated \|\| isAuthenticated/, 'Auth gate should wait for resolved profile and location');
  assert.match(rootNavigator, /onLogin={async \(\) => {[\s\S]*if \(result.error\) \{/);
  assert.doesNotMatch(rootNavigator, /store\.setAuthenticated\(true\);/, 'Login should not force auth state before profile sync is confirmed');

  assert.doesNotMatch(mainScreen, /Operator Profile|Interrupted Connectivity/i, 'Home screen should not include removed legacy top bars');
  assert.doesNotMatch(rootNavigator, /Interrupted Connectivity|Operator Profile/);
  assert.match(rootNavigator, /name=\"Profile\"/);
  assert.match(rootNavigator, /<ProfileScreen/);
  assert.match(rootNavigator, /tabBarLabel:\s*['\"]Profile['\"]/);

  assert.doesNotMatch(profileScreen, /Location Address/, 'Profile screen should not show legacy location address row');

  console.log('Feature checks passed');
}

run();
