import type { PostHog } from 'posthog-react-native';
import type { CaptureEvent, JsonType } from '@posthog/core';
import type { VehicleType } from '../types';

export const POSTHOG_EVENTS = {
  sessionStarted: 'user_session_started',
  ticketCreated: 'ticket_created',
  reportExported: 'report_exported',
} as const;

const SAFE_EXCEPTION_TYPES = new Set([
  'Error', 'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError', 'URIError',
  'EvalError', 'AggregateError', 'AbortError', 'NetworkError', 'TimeoutError',
  'Invariant Violation',
]);
const SAFE_EXCEPTION_LEVELS = new Set(['fatal', 'error', 'warning', 'info', 'debug']);
const SAFE_MECHANISM_TYPES = new Set(['generic', 'onerror', 'onunhandledrejection', 'instrument', 'chained']);
const PRIVATE_PROPERTY_KEY = /email|phone|address|token|password|secret|auth|code|url|query|prompt|completion|message|text|input|receipt|barcode|vehicleNumber|amount|payment|location|gps|latitude|longitude|customer|operator|ownerName|accountName|organizationName/i;

/** Strip likely personal or credential-bearing fields before sending any event. */
export function redactPostHogEvent(event: CaptureEvent | null, environment?: 'development' | 'production'): CaptureEvent | null {
  if (!event) return null;
  const source = event.properties ?? {};
  const properties: NonNullable<CaptureEvent['properties']> = {};
  if (event.event === '$exception') {
    const exceptionList = redactExceptionList(source.$exception_list);
    const firstException = exceptionList?.[0];
    const firstType = typeof firstException === 'object' && firstException !== null && !Array.isArray(firstException)
      ? firstException.type
      : undefined;
    const exceptionType = typeof source.$exception_type === 'string' && SAFE_EXCEPTION_TYPES.has(source.$exception_type)
      ? source.$exception_type
      : firstType;
    if (exceptionType) {
      properties.$exception_type = exceptionType;
    }
    if (typeof source.$exception_level === 'string' && SAFE_EXCEPTION_LEVELS.has(source.$exception_level)) {
      properties.$exception_level = source.$exception_level;
    }
    if (typeof source.$exception_handled === 'boolean') {
      properties.$exception_handled = source.$exception_handled;
    }
    if (exceptionList) properties.$exception_list = exceptionList;
    for (const key of ['$lib', '$lib_version', '$os_name', '$os_version', '$app_version', '$app_build', '$device_type']) {
      const value = source[key];
      if (typeof value === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(value)) {
        properties[key] = value;
      }
    }
    if (environment) properties.environment = environment;
    return { ...event, properties };
  }

  for (const [key, value] of Object.entries(source)) {
    if (PRIVATE_PROPERTY_KEY.test(key) || (typeof value === 'object' && value !== null)) continue;
    properties[key] = value;
  }
  if (environment) properties.environment = environment;
  return { ...event, properties };
}

function redactExceptionList(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const exceptions: JsonType[] = [];
  for (const item of value.slice(0, 20)) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
    const exception = item as Record<string, unknown>;
    const type = typeof exception.type === 'string' && SAFE_EXCEPTION_TYPES.has(exception.type)
      ? exception.type
      : 'Error';
    const sanitized: Record<string, JsonType> = { type, value: type };
    if (typeof exception.mechanism === 'object' && exception.mechanism !== null && !Array.isArray(exception.mechanism)) {
      const mechanism = exception.mechanism as Record<string, unknown>;
      const safeMechanism: Record<string, JsonType> = {
        type: typeof mechanism.type === 'string' && SAFE_MECHANISM_TYPES.has(mechanism.type)
          ? mechanism.type
          : 'generic',
      };
      for (const key of ['handled', 'synthetic']) {
        if (typeof mechanism[key] === 'boolean') safeMechanism[key] = mechanism[key];
      }
      for (const key of ['exception_id', 'parent_id']) {
        if (typeof mechanism[key] === 'number' && Number.isInteger(mechanism[key]) && mechanism[key] >= 0) {
          safeMechanism[key] = mechanism[key];
        }
      }
      if (mechanism.source === 'cause' || mechanism.source === 'member') safeMechanism.source = mechanism.source;
      sanitized.mechanism = safeMechanism;
    }

    const stacktrace = exception.stacktrace;
    if (typeof stacktrace === 'object' && stacktrace !== null && !Array.isArray(stacktrace)) {
      const frames = (stacktrace as Record<string, unknown>).frames;
      if (Array.isArray(frames)) {
        const safeFrames = frames.slice(0, 50).flatMap(frame => {
          if (typeof frame !== 'object' || frame === null || Array.isArray(frame)) return [];
          const sourceFrame = frame as Record<string, unknown>;
          const safeFrame: Record<string, JsonType> = {};
          const filename = safeFrameFrameName(sourceFrame.filename);
          const functionName = safeIdentifier(sourceFrame.function);
          const moduleName = safeIdentifier(sourceFrame.module);
          if (filename) safeFrame.filename = filename;
          if (functionName) safeFrame.function = functionName;
          if (moduleName) safeFrame.module = moduleName;
          for (const key of ['lineno', 'colno']) {
            const number = sourceFrame[key];
            if (typeof number === 'number' && Number.isInteger(number) && number > 0 && number <= 10_000_000) {
              safeFrame[key] = number;
            }
          }
          if (typeof sourceFrame.in_app === 'boolean') safeFrame.in_app = sourceFrame.in_app;
          return Object.keys(safeFrame).length > 0 ? [safeFrame] : [];
        });
        if (safeFrames.length > 0) sanitized.stacktrace = { type: 'raw', frames: safeFrames };
      }
    }
    exceptions.push(sanitized);
  }
  return exceptions.length > 0 ? exceptions : undefined;
}

function safeIdentifier(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9_$./:@<>-]{1,128}$/.test(value) ? value : undefined;
}

function safeFrameFrameName(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const basename = value.split(/[?#]/, 1)[0].split(/[\\/]/).pop();
  return basename && /^[A-Za-z0-9_$.-]{1,128}$/.test(basename) ? basename : undefined;
}

export type AnalyticsSessionState = {
  current: { authenticated: true; accountId: string } | { authenticated: false; accountId: null } | null;
};

/** Keep the local auth ID only for detecting account changes; never send it to analytics. */
export function syncAnonymousAnalyticsSession(
  client: Pick<PostHog, 'reset'>,
  state: AnalyticsSessionState,
  authenticated: boolean,
  accountId?: string,
) {
  const nextState = authenticated && accountId
    ? { authenticated: true as const, accountId }
    : { authenticated: false as const, accountId: null };
  const previous = state.current;
  const changed = previous === null
    ? nextState.authenticated
    : previous.authenticated !== nextState.authenticated
      || (previous.authenticated && nextState.authenticated && previous.accountId !== nextState.accountId);

  if (changed) client.reset();
  state.current = nextState;
  return nextState.authenticated && changed;
}

export function captureSessionStarted(client: Pick<PostHog, 'capture'>) {
  safeCapture(client, POSTHOG_EVENTS.sessionStarted);
}

export function captureTicketCreated(client: Pick<PostHog, 'capture'>, vehicleType: VehicleType) {
  if (vehicleType !== 'Bike' && vehicleType !== 'Car') return;
  safeCapture(client, POSTHOG_EVENTS.ticketCreated, { vehicle_type: vehicleType });
}

export function captureReportExported(client: Pick<PostHog, 'capture'>) {
  safeCapture(client, POSTHOG_EVENTS.reportExported);
}

export function captureHandledException(client: Pick<PostHog, 'captureException'>, error: unknown) {
  try {
    client.captureException(error, { $exception_handled: true });
  } catch {
    // Error reporting must not change the result of a user action.
  }
}

export function captureSafeLog(
  client: Pick<PostHog, 'logger'>,
  event: 'receipt_sync_failed' | 'receipt_print_failed',
  attributes: { operation: 'retry_pending_receipt' } | { failure_category: string },
) {
  try {
    if (event === 'receipt_sync_failed') {
      client.logger.warn(event, { operation: 'retry_pending_receipt' });
      return;
    }

    const allowedCategories = new Set([
      'out_of_paper', 'cover_open', 'overheated', 'timeout', 'device_or_printer_error',
    ]);
    if ('failure_category' in attributes && allowedCategories.has(attributes.failure_category)) {
      client.logger.warn(event, { failure_category: attributes.failure_category });
    }
  } catch {
    // Analytics and logs must not change the result of a POS operation.
  }
}

function safeCapture(
  client: Pick<PostHog, 'capture'>,
  event: (typeof POSTHOG_EVENTS)[keyof typeof POSTHOG_EVENTS],
  properties?: { vehicle_type: VehicleType },
) {
  try {
    client.capture(event, properties);
  } catch {
    // Analytics must not change the result of a POS operation.
  }
}
