import assert from 'node:assert/strict';
import {
  captureReportExported,
  captureHandledException,
  captureSafeLog,
  captureSessionStarted,
  captureTicketCreated,
  redactPostHogEvent,
  syncAnonymousAnalyticsSession,
  type AnalyticsSessionState,
} from '../src/analytics/telemetry';
import { APP_FEATURES, resolveFeatureFlag } from '../src/analytics/featureFlagRegistry';

const events: Array<{ name: string; properties?: Record<string, unknown> }> = [];
const logs: Array<{ name: string; properties: Record<string, unknown> }> = [];
let resetCount = 0;
let throwOnCapture = false;
const exceptions: Array<{ error: unknown; properties?: Record<string, unknown> }> = [];
const client = {
  capture(name: string, properties?: Record<string, unknown>) {
    if (throwOnCapture) throw new Error('synthetic failure');
    events.push({ name, properties });
  },
  reset() { resetCount += 1; },
  captureException(error: unknown, properties?: Record<string, unknown>) {
    exceptions.push({ error, properties });
  },
  logger: {
    warn(name: string, properties: Record<string, unknown>) {
      logs.push({ name, properties });
    },
  },
} as never;

assert.equal(APP_FEATURES.reportExport.defaultEnabled, true);
assert.equal(resolveFeatureFlag(true, false), true);
assert.equal(resolveFeatureFlag(false, true), false);
assert.equal(resolveFeatureFlag(undefined, false), false);
assert.equal(resolveFeatureFlag('true', false), false);

const session: AnalyticsSessionState = { current: null };
assert.equal(syncAnonymousAnalyticsSession(client, session, false), false);
assert.equal(syncAnonymousAnalyticsSession(client, session, true, 'private-account-a'), true);
assert.equal(syncAnonymousAnalyticsSession(client, session, true, 'private-account-a'), false);
assert.equal(syncAnonymousAnalyticsSession(client, session, true, 'private-account-b'), true);
assert.equal(syncAnonymousAnalyticsSession(client, session, false), false);
assert.equal(resetCount, 3);
assert.deepEqual(session.current, { authenticated: false, accountId: null });

captureSessionStarted(client);
captureTicketCreated(client, 'Car');
captureTicketCreated(client, 'Bike');
captureTicketCreated(client, 'plane' as never);
captureReportExported(client);
assert.deepEqual(events, [
  { name: 'user_session_started', properties: undefined },
  { name: 'ticket_created', properties: { vehicle_type: 'Car' } },
  { name: 'ticket_created', properties: { vehicle_type: 'Bike' } },
  { name: 'report_exported', properties: undefined },
]);
assert.equal(JSON.stringify(events).includes('private-account'), false);

assert.deepEqual(redactPostHogEvent({
  event: '$exception',
  properties: {
    '$exception_type': 'TypeError',
    '$exception_level': 'error',
    '$exception_message': 'password=secret-value',
    '$exception_stack_trace': 'private path and token',
    '$exception_component_stack': 'private component content',
    '$exception_steps': [{ message: 'private user content' }],
    '$exception_list': [{
      type: 'TypeError',
      value: 'password=secret-value',
      mechanism: { type: 'onerror', handled: false, exception_id: 0, secret: 'private' },
      stacktrace: {
        type: 'raw',
        frames: [{
          filename: 'https://example.com/index.android.bundle?token=secret',
          function: 'submitPayment',
          lineno: 22,
          colno: 3,
          email: 'operator@example.com',
        }],
      },
    }],
    '$app_version': '1.0.0',
  },
}), {
  event: '$exception',
  properties: {
    '$exception_type': 'TypeError',
    '$exception_level': 'error',
    '$exception_list': [{
      type: 'TypeError',
      value: 'TypeError',
      mechanism: { type: 'onerror', handled: false, exception_id: 0 },
      stacktrace: {
        type: 'raw',
        frames: [{ filename: 'index.android.bundle', function: 'submitPayment', lineno: 22, colno: 3 }],
      },
    }],
    '$app_version': '1.0.0',
  },
});
const safeException = redactPostHogEvent({
  event: '$exception',
  properties: {
    '$exception_list': [{ type: 'Error', value: 'private email operator@example.com' }],
  },
});
assert.equal(JSON.stringify(safeException).includes('operator@example.com'), false);
assert.equal(JSON.stringify(safeException).includes('password=secret-value'), false);
assert.equal(redactPostHogEvent({ event: 'ticket_created', properties: { vehicle_type: 'Car' } })?.event, 'ticket_created');
assert.deepEqual(redactPostHogEvent({
  event: 'Application Opened',
  properties: { url: 'valetpos://login?token=credential', accountEmail: 'operator@example.com', vehicle_type: 'Bike' },
}), { event: 'Application Opened', properties: { vehicle_type: 'Bike' } });
assert.equal(redactPostHogEvent({ event: 'ticket_created' }, 'development')?.properties?.environment, 'development');

captureSafeLog(client, 'receipt_sync_failed', { operation: 'retry_pending_receipt' });
captureSafeLog(client, 'receipt_print_failed', { failure_category: 'out_of_paper' });
captureSafeLog(client, 'receipt_print_failed', { failure_category: 'vehicle ABC123 amount 99' });
assert.deepEqual(logs, [
  { name: 'receipt_sync_failed', properties: { operation: 'retry_pending_receipt' } },
  { name: 'receipt_print_failed', properties: { failure_category: 'out_of_paper' } },
]);

captureHandledException(client, new Error('private user input and auth token'));
assert.equal(exceptions.length, 1);
assert.deepEqual(exceptions[0].properties, { $exception_handled: true });

throwOnCapture = true;
assert.doesNotThrow(() => captureTicketCreated(client, 'Car'));
console.log('PostHog event, identity, flag-default, and redaction checks passed.');
