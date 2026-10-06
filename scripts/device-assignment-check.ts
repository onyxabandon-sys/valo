import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isDeviceReservedForAnotherUser, matchesClaimedDeviceId, type DeviceAssignmentBinding } from '../shared/deviceAssignments';

const deviceId = 'pixel8-device-id';
const userId = 'attendant-a';

function run() {
  const deviceAccessBackend = readFileSync(path.join(process.cwd(), 'convex', 'deviceAccess.ts'), 'utf8');
  const adminBackend = readFileSync(path.join(process.cwd(), 'convex', 'admin.ts'), 'utf8');
  const ticketsBackend = readFileSync(path.join(process.cwd(), 'convex', 'tickets.ts'), 'utf8');
  const metadataBackend = readFileSync(path.join(process.cwd(), 'convex', 'receiptMetadata.ts'), 'utf8');
  const sessionsBackend = readFileSync(path.join(process.cwd(), 'convex', 'sessions.ts'), 'utf8');
  const authBackend = readFileSync(path.join(process.cwd(), 'convex', 'lib', 'auth.ts'), 'utf8');
  const binding = (overrides: Partial<DeviceAssignmentBinding> = {}): DeviceAssignmentBinding => ({
    userId,
    deviceId,
    status: 'active',
    ...overrides,
  });

  assert.equal(isDeviceReservedForAnotherUser([], userId, deviceId), false, 'an unassigned device is available');
  assert.equal(isDeviceReservedForAnotherUser([binding({ userId: 'attendant-b' })], userId, deviceId), true, 'an active binding blocks another user');
  assert.equal(isDeviceReservedForAnotherUser([binding({ userId: 'attendant-b', status: 'pending' })], userId, deviceId), true, 'a pending reservation blocks another user');
  assert.equal(isDeviceReservedForAnotherUser([binding({ userId: 'attendant-b', status: 'revoked' })], userId, deviceId), false, 'a revoked binding releases the device');
  assert.equal(isDeviceReservedForAnotherUser([binding()], userId, deviceId), false, 'the assigned user can complete approval');
  assert.equal(isDeviceReservedForAnotherUser([binding({ userId: 'attendant-b', deviceId: 'other-device' })], userId, deviceId), false, 'a different device does not reserve this device');
  assert.equal(matchesClaimedDeviceId(undefined, deviceId), true, 'an omitted legacy device claim resolves to the authenticated assignment');
  assert.equal(matchesClaimedDeviceId(deviceId, deviceId), true, 'the assigned device claim is accepted');
  assert.equal(matchesClaimedDeviceId('forged-device-id', deviceId), false, 'a forged device claim is rejected');
  for (const backend of [deviceAccessBackend, adminBackend]) {
    assert.match(backend, /\.withIndex\('by_status_and_device', q => q\.eq\('status', status\)\.eq\('deviceId', args\.deviceId\)\)\s*\.unique\(\)/, 'duplicate reservations for the same device must fail closed');
    assert.match(backend, /Read both reservation ranges in the same transaction as the assignment write/);
  }
  assert.match(authBackend, /assignment\.userId !== user\._id/, 'the approved device assignment must belong to the authenticated user');
  assert.match(authBackend, /assignment\.locationId !== user\.locationId/, 'the approved device assignment must match the account location');
  assert.match(ticketsBackend, /requireLocationUserWithAssignment\(ctx\)/, 'receipt creation must use the authenticated assignment');
  assert.match(ticketsBackend, /matchesClaimedDeviceId\(args\.deviceId, assignment\.deviceId\)/, 'receipt creation must reject a mismatched client device');
  assert.match(ticketsBackend, /deviceId: assignment\.deviceId/, 'receipts must persist the server-trusted device ID');
  assert.match(ticketsBackend, /receipt\.deviceId !== assignment\.deviceId/, 'idempotent receipt replays must stay on the original device');
  assert.match(metadataBackend, /requireAppUserWithAssignment\(ctx\)/, 'receipt metadata must use the authenticated assignment');
  assert.match(metadataBackend, /matchesClaimedDeviceId\(args\.deviceId, assignment\.deviceId\)/, 'receipt metadata must reject a mismatched client device');
  assert.match(metadataBackend, /deviceId: assignment\.deviceId/, 'receipt metadata must persist the server-trusted device ID');
  assert.match(sessionsBackend, /matchesClaimedDeviceId\(args\.deviceId, assignment\.deviceId\)/, 'session mutations must reject a mismatched client device');
  assert.match(sessionsBackend, /deviceId: assignment\.deviceId/, 'active sessions must persist the server-trusted device ID');
  assert.doesNotMatch(ticketsBackend, /deviceId:\s*args\.deviceId\s*\?\?\s*'server'/, 'receipt creation must never persist a client claim or the server placeholder');

  console.log('Device assignment checks passed.');
}

run();
