/// <reference types="vite/client" />
import { convexTest, type TestConvex } from 'convex-test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';
import { trustedAuthOrigins } from '../shared/trustedAuthOrigins';

const modules = import.meta.glob('./**/*.ts');
const TEST_SECRET = 'convex-test-secret-value-that-is-never-used-outside-tests';

type TestIdentity = {
  issuer: string;
  subject: string;
  tokenIdentifier: string;
  sessionId: string;
  email: string;
  twoFactorEnabled?: boolean;
};

type TestBackend = TestConvex<typeof schema>;

function makeIdentity(name: string, sessionId: string, twoFactorEnabled = true): TestIdentity {
  return {
    issuer: 'https://auth.example.test',
    subject: name,
    tokenIdentifier: 'https://auth.example.test|' + name,
    sessionId,
    email: name + '@example.test',
    twoFactorEnabled,
  };
}

async function seedUserAndLocation(t: TestBackend, identity: TestIdentity, role: 'admin' | 'attendant' = 'attendant') {
  return await t.run(async ctx => {
    const locationId = await ctx.db.insert('locations', {
      name: 'Harbor Garage',
      organizationCode: 'HBR001',
      organizationName: 'Harbor Parking',
      createdAt: Date.now(),
    });
    const userId = await ctx.db.insert('users', {
      email: identity.email,
      emailNormalized: identity.email,
      authTokenIdentifier: identity.tokenIdentifier,
      name: identity.subject,
      role,
      isActive: true,
      phoneNumber: '+14155550123',
      locationId,
      createdAt: Date.now(),
    });
    return { locationId, userId };
  });
}

async function seedAccess(
  t: TestBackend,
  identity: TestIdentity,
  deviceId: string,
  options: { status?: 'pending' | 'approved'; codeHash?: string; expiresAt?: number } = {},
) {
  const now = Date.now();
  return await t.run(async ctx => await ctx.db.insert('deviceAccess', {
    sessionId: identity.sessionId,
    authTokenIdentifier: identity.tokenIdentifier,
    accountEmail: identity.email,
    deviceId,
    codeHash: options.codeHash ?? '',
    status: options.status ?? 'approved',
    requestedAt: now - 30_000,
    expiresAt: options.expiresAt ?? now + 15 * 60_000,
    attempts: 0,
    requestWindowAt: now - 30_000,
    requestCount: 1,
    lastSentAt: now - 20_000,
  }));
}

async function seedAssignment(
  t: TestBackend,
  userId: Id<'users'>,
  locationId: Id<'locations'>,
  identity: TestIdentity,
  deviceId: string,
) {
  const now = Date.now();
  return await t.run(async ctx => await ctx.db.insert('deviceAssignments', {
    userId,
    deviceId,
    sessionId: identity.sessionId,
    locationId,
    status: 'active',
    latitude: 24.8607,
    longitude: 67.0011,
    accuracy: 12,
    capturedAt: now,
    assignedAt: now,
    updatedAt: now,
  }));
}

async function hashApprovalCode(sessionId: string, code: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(TEST_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(sessionId + ':' + code));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function freshLocation() {
  return { latitude: 24.8607, longitude: 67.0011, accuracy: 12, capturedAt: Date.now() };
}

function receiptNumber(issuedAt: number, clientId: string) {
  const date = new Date(issuedAt).toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = clientId.replace(/[^a-z0-9]/gi, '').slice(-16).toUpperCase();
  return 'HBR001-' + date + '-' + suffix;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('device approval and login', () => {
  it('sends a protected one-time code through the configured Brevo WhatsApp template', async () => {
    vi.stubEnv('BETTER_AUTH_SECRET', TEST_SECRET);
    vi.stubEnv('BREVO_API_KEY', 'test-brevo-key');
    vi.stubEnv('BREVO_WHATSAPP_SENDER_NUMBER', '14155550100');
    vi.stubEnv('BREVO_WHATSAPP_TEMPLATE_ID', '42');
    const requests: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(input), init: init ?? {} });
      return new Response(null, { status: 201 });
    });
    const t = convexTest(schema, modules);
    const identity = makeIdentity('whatsapp-user', 'whatsapp-session-0001');
    await seedUserAndLocation(t, identity);

    const result = await t.withIdentity(identity).action(api.deviceAccess.requestApprovalCode, { deviceId: 'whatsapp-device-0001' });

    expect(result.channel).toBe('whatsapp');
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('https://api.brevo.com/v3/whatsapp/sendMessage');
    const payload = JSON.parse(String(requests[0].init.body)) as {
      contactNumbers: string[];
      senderNumber: string;
      templateId: number;
      params: { code: string; expiresInMinutes: number };
    };
    expect(payload.contactNumbers).toEqual(['14155550123']);
    expect(payload.senderNumber).toBe('14155550100');
    expect(payload.templateId).toBe(42);
    expect(payload.params.code).toMatch(/^\d{8}$/);
    expect(payload.params.expiresInMinutes).toBe(15);
    const stored = await t.run(async ctx => await ctx.db.query('deviceAccess').withIndex('by_session_id', q => q.eq('sessionId', identity.sessionId)).unique());
    expect(stored?.status).toBe('pending');
    expect(stored?.deliveryChannel).toBe('whatsapp');
    expect(stored?.codeHash).toBe(await hashApprovalCode(identity.sessionId, payload.params.code));
    expect(stored?.lastSentAt).toBeDefined();
    expect(stored?.codeHash).not.toBe(payload.params.code);
    await expect(t.withIdentity(identity).query(api.deviceAccess.getMyStatus, { now: Date.now() })).resolves.toMatchObject({
      status: 'pending',
      deliveryChannel: 'whatsapp',
      codeSent: true,
      ownerEmail: null,
    });
  });

  it('keeps the email and manual-forward path explicit when WhatsApp is not configured', async () => {
    vi.stubEnv('BETTER_AUTH_SECRET', TEST_SECRET);
    vi.stubEnv('BREVO_API_KEY', 'test-brevo-key');
    vi.stubEnv('BREVO_WHATSAPP_SENDER_NUMBER', '');
    vi.stubEnv('BREVO_WHATSAPP_TEMPLATE_ID', '');
    vi.stubEnv('ACCESS_APPROVER_EMAIL', 'owner@example.test');
    vi.stubEnv('BREVO_SENDER_EMAIL', 'noreply@example.test');
    const requests: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(input), init: init ?? {} });
      return new Response(null, { status: 201 });
    });
    const t = convexTest(schema, modules);
    const identity = makeIdentity('fallback-user', 'fallback-session-0001');
    const { userId } = await seedUserAndLocation(t, identity);
    await t.run(async ctx => await ctx.db.patch('users', userId, { phoneNumber: undefined }));

    const result = await t.withIdentity(identity).action(api.deviceAccess.requestApprovalCode, { deviceId: 'fallback-device-0001' });

    expect(result.channel).toBe('email-manual-whatsapp-fallback');
    expect(requests[0].url).toBe('https://api.brevo.com/v3/smtp/email');
    const payload = JSON.parse(String(requests[0].init.body)) as { to: Array<{ email: string }>; textContent: string };
    expect(payload.to).toEqual([{ email: 'owner@example.test' }]);
    expect(payload.textContent).toContain('send the code directly to the requester in a one-to-one WhatsApp chat');
    expect(payload.textContent).not.toContain('Brevo WhatsApp');
    expect(await t.withIdentity(identity).query(api.deviceAccess.getMyStatus, { now: Date.now() })).toMatchObject({
      status: 'pending',
      deliveryChannel: 'email-manual-whatsapp-fallback',
      codeSent: true,
    });
  });

  it('invalidates the approval challenge when Brevo rejects WhatsApp delivery', async () => {
    vi.stubEnv('BETTER_AUTH_SECRET', TEST_SECRET);
    vi.stubEnv('BREVO_API_KEY', 'test-brevo-key');
    vi.stubEnv('BREVO_WHATSAPP_SENDER_NUMBER', '14155550100');
    vi.stubEnv('BREVO_WHATSAPP_TEMPLATE_ID', '42');
    vi.stubGlobal('fetch', async () => new Response(null, { status: 400 }));
    const t = convexTest(schema, modules);
    const identity = makeIdentity('whatsapp-failure-user', 'whatsapp-failure-session-0001');
    await seedUserAndLocation(t, identity);

    await expect(t.withIdentity(identity).action(api.deviceAccess.requestApprovalCode, { deviceId: 'whatsapp-failure-device-0001' }))
      .rejects.toThrow('Brevo rejected the WhatsApp code');
    const stored = await t.run(async ctx => await ctx.db.query('deviceAccess').withIndex('by_session_id', q => q.eq('sessionId', identity.sessionId)).unique());
    expect(stored?.status).toBe('failed');
    expect(stored?.codeHash).toBe('');
    expect(stored?.lastSentAt).toBeUndefined();
  });

  it('fails closed when WhatsApp settings are only partly configured', async () => {
    vi.stubEnv('BETTER_AUTH_SECRET', TEST_SECRET);
    vi.stubEnv('BREVO_API_KEY', 'test-brevo-key');
    vi.stubEnv('BREVO_WHATSAPP_SENDER_NUMBER', '14155550100');
    vi.stubEnv('BREVO_WHATSAPP_TEMPLATE_ID', '');
    const requests: string[] = [];
    vi.stubGlobal('fetch', async (input: string | URL | Request) => {
      requests.push(String(input));
      return new Response(null, { status: 201 });
    });
    const t = convexTest(schema, modules);
    const identity = makeIdentity('whatsapp-partial-user', 'whatsapp-partial-session-0001');
    await seedUserAndLocation(t, identity);

    await expect(t.withIdentity(identity).action(api.deviceAccess.requestApprovalCode, { deviceId: 'whatsapp-partial-device-0001' }))
      .rejects.toThrow('only partly configured');
    expect(requests).toEqual([]);
    expect(await t.run(async ctx => await ctx.db.query('deviceAccess').withIndex('by_session_id', q => q.eq('sessionId', identity.sessionId)).unique()))
      .toBeNull();
  });

  it('accepts one protected code once, then rejects replay', async () => {
    vi.stubEnv('BETTER_AUTH_SECRET', TEST_SECRET);
    const t = convexTest(schema, modules);
    const identity = makeIdentity('otp-user', 'otp-session-0001');
    await seedUserAndLocation(t, identity);
    const deviceId = 'otp-device-0001';
    const codeHash = await hashApprovalCode(identity.sessionId, '12345678');
    const accessId = await seedAccess(t, identity, deviceId, { status: 'pending', codeHash });
    const signedIn = t.withIdentity(identity);

    const incorrect = await signedIn.mutation(api.deviceAccess.verifyApprovalCode, { code: '87654321', deviceId });
    expect(incorrect.approved).toBe(false);
    expect(incorrect.message).toContain('incorrect');
    expect(await t.run(async ctx => (await ctx.db.get('deviceAccess', accessId))?.attempts)).toBe(1);

    const approved = await signedIn.mutation(api.deviceAccess.verifyApprovalCode, { code: '12345678', deviceId });
    expect(approved).toEqual({ approved: true, message: '' });
    const replay = await signedIn.mutation(api.deviceAccess.verifyApprovalCode, { code: '12345678', deviceId });
    expect(replay.approved).toBe(false);
    const stored = await t.run(async ctx => await ctx.db.get('deviceAccess', accessId));
    expect(stored?.status).toBe('approved');
    expect(stored?.codeHash).toBe('');
  });

  it('expires stale codes and locks the session after five incorrect guesses', async () => {
    vi.stubEnv('BETTER_AUTH_SECRET', TEST_SECRET);
    const t = convexTest(schema, modules);
    const expiredIdentity = makeIdentity('expired-user', 'expired-session-0001');
    await seedUserAndLocation(t, expiredIdentity);
    const expiredHash = await hashApprovalCode(expiredIdentity.sessionId, '12345678');
    const expiredAccess = await seedAccess(t, expiredIdentity, 'expired-device-0001', {
      status: 'pending',
      codeHash: expiredHash,
      expiresAt: Date.now() - 1_000,
    });
    const expiredResult = await t.withIdentity(expiredIdentity).mutation(api.deviceAccess.verifyApprovalCode, {
      code: '12345678',
      deviceId: 'expired-device-0001',
    });
    expect(expiredResult.approved).toBe(false);
    expect((await t.run(async ctx => await ctx.db.get('deviceAccess', expiredAccess)))?.attempts).toBe(0);

    const lockedIdentity = makeIdentity('locked-user', 'locked-session-0001');
    await seedUserAndLocation(t, lockedIdentity);
    const lockedHash = await hashApprovalCode(lockedIdentity.sessionId, '12345678');
    const lockedAccess = await seedAccess(t, lockedIdentity, 'locked-device-0001', { status: 'pending', codeHash: lockedHash });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await t.withIdentity(lockedIdentity).mutation(api.deviceAccess.verifyApprovalCode, {
        code: '87654321',
        deviceId: 'locked-device-0001',
      });
      expect(result.approved).toBe(false);
    }
    const replayAfterLock = await t.withIdentity(lockedIdentity).mutation(api.deviceAccess.verifyApprovalCode, {
      code: '12345678',
      deviceId: 'locked-device-0001',
    });
    expect(replayAfterLock.approved).toBe(false);
    const stored = await t.run(async ctx => await ctx.db.get('deviceAccess', lockedAccess));
    expect(stored?.status).toBe('failed');
    expect(stored?.attempts).toBe(5);
    expect(stored?.codeHash).toBe('');
  });

  it('limits repeat sends per session and across the shared approver inbox', async () => {
    const t = convexTest(schema, modules);
    const tokenIdentifier = 'https://auth.example.test|send-limit-user';
    const accountEmail = 'send-limit-user@example.test';
    const baseTime = Date.now() - 10 * 60_000;
    const codeHash = 'a'.repeat(64);
    const sessionId = 'send-limit-session-0001';

    for (let request = 0; request < 5; request += 1) {
      const now = baseTime + request * 60_001;
      await t.mutation(internal.deviceAccess.beginRequest, {
        sessionId,
        tokenIdentifier,
        accountEmail,
        deviceId: 'send-limit-device-0001',
        codeHash,
        now,
        expiresAt: now + 15 * 60_000,
      });
      await t.mutation(internal.deviceAccess.markNotificationSent, { sessionId, sentAt: now });
    }
    const sixthAt = baseTime + 5 * 60_001;
    await expect(t.mutation(internal.deviceAccess.beginRequest, {
      sessionId,
      tokenIdentifier,
      accountEmail,
      deviceId: 'send-limit-device-0001',
      codeHash,
      now: sixthAt,
      expiresAt: sixthAt + 15 * 60_000,
    })).rejects.toThrow('Too many code requests');

    const ownerT = convexTest(schema, modules);
    const ownerWindowBase = Date.now() - 10 * 60_000;
    for (let request = 0; request < 20; request += 1) {
      const now = ownerWindowBase + request * 1_000;
      await ownerT.mutation(internal.deviceAccess.beginRequest, {
        sessionId: 'owner-limit-session-' + String(request).padStart(4, '0'),
        tokenIdentifier,
        accountEmail,
        deviceId: 'owner-limit-device-0001',
        codeHash,
        now,
        expiresAt: now + 15 * 60_000,
      });
    }
    const ownerLimitAt = ownerWindowBase + 20_000;
    await expect(ownerT.mutation(internal.deviceAccess.beginRequest, {
      sessionId: 'owner-limit-session-0020',
      tokenIdentifier,
      accountEmail,
      deviceId: 'owner-limit-device-0001',
      codeHash,
      now: ownerLimitAt,
      expiresAt: ownerLimitAt + 15 * 60_000,
    })).rejects.toThrow('Approval delivery has received many requests');
  });

  it('requires approved access and a fresh accurate location before binding one device', async () => {
    const t = convexTest(schema, modules);
    const identity = makeIdentity('login-user', 'login-session-0001');
    const { userId, locationId } = await seedUserAndLocation(t, identity);
    const deviceId = 'login-device-0001';
    await seedAccess(t, identity, deviceId, { status: 'pending' });
    const signedIn = t.withIdentity(identity);

    await expect(signedIn.mutation(api.deviceAccess.completeDeviceLogin, {
      deviceId,
      location: freshLocation(),
    })).rejects.toThrow('no longer approved');

    await t.run(async ctx => {
      const access = await ctx.db.query('deviceAccess').withIndex('by_session_id', q => q.eq('sessionId', identity.sessionId)).unique();
      if (!access) throw new Error('Test access record was not seeded.');
      await ctx.db.patch('deviceAccess', access._id, { status: 'approved' });
    });

    await expect(signedIn.mutation(api.deviceAccess.completeDeviceLogin, {
      deviceId,
      location: { ...freshLocation(), capturedAt: Date.now() - 3 * 60_000 },
    })).rejects.toThrow('too old');
    await expect(signedIn.mutation(api.deviceAccess.completeDeviceLogin, {
      deviceId,
      location: { ...freshLocation(), accuracy: 101 },
    })).rejects.toThrow('not accurate enough');
    await expect(signedIn.mutation(api.deviceAccess.completeDeviceLogin, {
      deviceId,
      location: { ...freshLocation(), latitude: 91 },
    })).rejects.toThrow('location fix is invalid');
    await expect(signedIn.mutation(api.deviceAccess.completeDeviceLogin, {
      deviceId,
      location: { ...freshLocation(), capturedAt: Date.now() + 60_000 },
    })).rejects.toThrow('too old');

    const rejectedLocationState = await t.run(async ctx => ({
      assignment: await ctx.db.query('deviceAssignments').withIndex('by_user', q => q.eq('userId', userId)).unique(),
      sessions: await ctx.db.query('userSessions').withIndex('by_auth_token_identifier', q => q.eq('authTokenIdentifier', identity.tokenIdentifier)).collect(),
      locations: await ctx.db.query('loginLocationHistory').withIndex('by_user_and_logged_in_at', q => q.eq('userId', userId)).collect(),
    }));
    expect(rejectedLocationState.assignment).toBeNull();
    expect(rejectedLocationState.sessions).toHaveLength(0);
    expect(rejectedLocationState.locations).toHaveLength(0);

    const completed = await signedIn.mutation(api.deviceAccess.completeDeviceLogin, { deviceId, location: freshLocation() });
    expect(completed).toEqual({ assigned: true, locationId });
    const assignment = await t.run(async ctx =>
      await ctx.db.query('deviceAssignments').withIndex('by_user', q => q.eq('userId', userId)).unique(),
    );
    expect(assignment).toMatchObject({
      userId,
      deviceId,
      sessionId: identity.sessionId,
      locationId,
      status: 'active',
      latitude: 24.8607,
      longitude: 67.0011,
      accuracy: 12,
    });
    const completedAccess = await t.run(async ctx =>
      await ctx.db.query('deviceAccess').withIndex('by_session_id', q => q.eq('sessionId', identity.sessionId)).unique(),
    );
    expect(completedAccess?.completedAt).toEqual(expect.any(Number));
    const loginLocations = await t.run(async ctx =>
      await ctx.db.query('loginLocationHistory').withIndex('by_user_and_logged_in_at', q => q.eq('userId', userId)).collect(),
    );
    expect(loginLocations).toHaveLength(1);
    expect(loginLocations[0]).toMatchObject({
      userId,
      locationId,
      deviceId,
      latitude: 24.8607,
      longitude: 67.0011,
      accuracy: 12,
    });
    await expect(signedIn.query(api.admin.listAttendantLoginLocations, {
      userId,
      paginationOpts: { numItems: 10, cursor: null },
    })).rejects.toThrow('ADMIN_REQUIRED');
    const adminIdentity = makeIdentity('login-history-admin', 'login-history-admin-session');
    await seedUserAndLocation(t, adminIdentity, 'admin');
    await expect(t.withIdentity(adminIdentity).query(api.admin.listAttendantLoginLocations, {
      userId,
      paginationOpts: { numItems: 10, cursor: null },
    })).resolves.toMatchObject({ page: [{ latitude: 24.8607, longitude: 67.0011, deviceId }] });
    await expect(signedIn.mutation(api.deviceAccess.completeDeviceLogin, {
      deviceId,
      location: { ...freshLocation(), latitude: 25.1, longitude: 68.2 },
    })).rejects.toThrow('DEVICE_LOGIN_ALREADY_COMPLETED');
    expect(await t.run(async ctx =>
      await ctx.db.query('deviceAssignments').withIndex('by_user', q => q.eq('userId', userId)).unique(),
    )).toMatchObject({ latitude: 24.8607, longitude: 67.0011 });

    const secondSession = { ...identity, sessionId: 'login-session-0002' };
    await seedAccess(t, secondSession, 'login-device-0002');
    await expect(t.withIdentity(secondSession).mutation(api.deviceAccess.completeDeviceLogin, {
      deviceId: 'login-device-0002',
      location: freshLocation(),
    })).rejects.toThrow('assigned to another device');
  });

  it('allows only one of two concurrent device claims for the same account', async () => {
    const t = convexTest(schema, modules);
    const firstSession = makeIdentity('race-user', 'race-session-0001');
    const secondSession = { ...firstSession, sessionId: 'race-session-0002' };
    const { userId } = await seedUserAndLocation(t, firstSession);
    const firstDevice = 'race-device-0001';
    const secondDevice = 'race-device-0002';
    await seedAccess(t, firstSession, firstDevice);
    await seedAccess(t, secondSession, secondDevice);

    const claims = await Promise.allSettled([
      t.withIdentity(firstSession).mutation(api.deviceAccess.completeDeviceLogin, {
        deviceId: firstDevice,
        location: freshLocation(),
      }),
      t.withIdentity(secondSession).mutation(api.deviceAccess.completeDeviceLogin, {
        deviceId: secondDevice,
        location: freshLocation(),
      }),
    ]);
    expect(claims.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const assignments = await t.run(async ctx =>
      await ctx.db.query('deviceAssignments').withIndex('by_user', q => q.eq('userId', userId)).take(10),
    );
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.status).toBe('active');
  });

  it('allows a fresh same-device login after the fixed 12-hour session expires', async () => {
    const t = convexTest(schema, modules);
    const oldIdentity = makeIdentity('expired-login-user', 'expired-login-session-0001');
    const newIdentity = { ...oldIdentity, sessionId: 'expired-login-session-0002' };
    const { userId, locationId } = await seedUserAndLocation(t, oldIdentity);
    const deviceId = 'expired-login-device-0001';
    const oldAccessId = await seedAccess(t, oldIdentity, deviceId, { status: 'approved', codeHash: 'old-code-hash' });
    await seedAssignment(t, userId, locationId, oldIdentity, deviceId);
    await t.run(async ctx => {
      const assignment = await ctx.db.query('deviceAssignments').withIndex('by_user', q => q.eq('userId', userId)).unique();
      if (!assignment) throw new Error('Test assignment was not seeded.');
      await ctx.db.patch(assignment._id, { sessionExpiresAt: Date.now() - 1 });
      await ctx.db.patch(oldAccessId, { completedAt: Date.now() });
    });
    await expect(t.withIdentity(oldIdentity).query(api.reports.getDailyReport, {
      from: Date.now() - 60 * 60_000,
      to: Date.now(),
      deviceId,
    })).rejects.toThrow('session has expired');
    await expect(t.withIdentity(oldIdentity).query(api.deviceAccess.getMyStatus, { now: Date.now() }))
      .resolves.toMatchObject({ status: 'notRequested' });
    await seedAccess(t, newIdentity, deviceId, { status: 'approved', codeHash: 'new-code-hash' });

    const result = await t.withIdentity(newIdentity).mutation(api.deviceAccess.completeDeviceLogin, {
      deviceId,
      location: freshLocation(),
    });
    expect(result.assigned).toBe(true);
    const state = await t.run(async ctx => ({
      assignment: await ctx.db.query('deviceAssignments').withIndex('by_user', q => q.eq('userId', userId)).unique(),
      oldAccess: await ctx.db.get(oldAccessId),
      loginLocations: await ctx.db.query('loginLocationHistory').withIndex('by_user_and_logged_in_at', q => q.eq('userId', userId)).collect(),
    }));
    expect(state.assignment).toMatchObject({ deviceId, sessionId: newIdentity.sessionId, status: 'active' });
    expect(state.assignment?.sessionExpiresAt).toBeGreaterThan(Date.now());
    expect(state.oldAccess).toMatchObject({ status: 'revoked', codeHash: '' });
    expect(state.loginLocations).toHaveLength(1);
  });

  it('still requires administrator release to move an expired session to another device', async () => {
    const t = convexTest(schema, modules);
    const oldIdentity = makeIdentity('expired-device-user', 'expired-device-session-0001');
    const newIdentity = { ...oldIdentity, sessionId: 'expired-device-session-0002' };
    const { userId, locationId } = await seedUserAndLocation(t, oldIdentity);
    await seedAssignment(t, userId, locationId, oldIdentity, 'expired-device-original-0001');
    await t.run(async ctx => {
      const assignment = await ctx.db.query('deviceAssignments').withIndex('by_user', q => q.eq('userId', userId)).unique();
      if (!assignment) throw new Error('Test assignment was not seeded.');
      await ctx.db.patch(assignment._id, { sessionExpiresAt: Date.now() - 1 });
    });
    await seedAccess(t, newIdentity, 'expired-device-replacement-0001', { status: 'approved' });

    await expect(t.withIdentity(newIdentity).mutation(api.deviceAccess.completeDeviceLogin, {
      deviceId: 'expired-device-replacement-0001',
      location: freshLocation(),
    })).rejects.toThrow('assigned to another device');
  });

  it('allows only one concurrent completion of a verified login session', async () => {
    const t = convexTest(schema, modules);
    const identity = makeIdentity('completion-race-user', 'completion-race-session-0001');
    const { userId } = await seedUserAndLocation(t, identity);
    const deviceId = 'completion-race-device-0001';
    await seedAccess(t, identity, deviceId, { status: 'approved' });

    const completions = await Promise.allSettled([
      t.withIdentity(identity).mutation(api.deviceAccess.completeDeviceLogin, {
        deviceId,
        location: { ...freshLocation(), latitude: 24.8 },
      }),
      t.withIdentity(identity).mutation(api.deviceAccess.completeDeviceLogin, {
        deviceId,
        location: { ...freshLocation(), latitude: 24.9 },
      }),
    ]);
    expect(completions.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const failure = completions.find(result => result.status === 'rejected');
    expect(failure?.status).toBe('rejected');
    if (failure?.status === 'rejected') expect(String(failure.reason)).toContain('DEVICE_LOGIN_ALREADY_COMPLETED');

    const state = await t.run(async ctx => ({
      assignment: await ctx.db.query('deviceAssignments').withIndex('by_user', q => q.eq('userId', userId)).unique(),
      sessions: await ctx.db.query('userSessions').withIndex('by_auth_token_identifier', q => q.eq('authTokenIdentifier', identity.tokenIdentifier)).collect(),
      access: await ctx.db.query('deviceAccess').withIndex('by_session_id', q => q.eq('sessionId', identity.sessionId)).unique(),
      locations: await ctx.db.query('loginLocationHistory').withIndex('by_user_and_logged_in_at', q => q.eq('userId', userId)).collect(),
    }));
    expect(state.assignment?.status).toBe('active');
    expect(state.sessions).toHaveLength(1);
    expect(state.access?.completedAt).toEqual(expect.any(Number));
    expect(state.locations).toHaveLength(1);
  });
});

describe('administrator device controls', () => {
  it('disabling an attendant revokes approval, assignment, sessions, and writes an audit record', async () => {
    const t = convexTest(schema, modules);
    const adminIdentity = makeIdentity('device-admin', 'device-admin-session');
    const attendantIdentity = makeIdentity('disabled-attendant', 'attendant-session');
    await seedUserAndLocation(t, adminIdentity, 'admin');
    const { userId, locationId } = await seedUserAndLocation(t, attendantIdentity);
    const deviceId = 'assigned-device-0001';
    const assignmentId = await seedAssignment(t, userId, locationId, attendantIdentity, deviceId);
    const accessId = await seedAccess(t, attendantIdentity, deviceId, { codeHash: 'protected-code-hash' });
    const sessionId = await t.run(async ctx => await ctx.db.insert('userSessions', {
      deviceId,
      accountEmail: attendantIdentity.email,
      authTokenIdentifier: attendantIdentity.tokenIdentifier,
      isLoggedIn: true,
      lastActivityTimestamp: Date.now(),
    }));
    const ticketId = await t.run(async ctx => await ctx.db.insert('tickets', {
      clientId: 'disable-retains-receipt-ticket',
      locationId,
      ticketNumber: 'HBR001-DISABLE-RETAIN',
      vehicleType: 'Bike',
      vehicleNumber: 'MH12AB1234',
      amount: 75,
      paymentStatus: 'paid',
      paymentMethod: 'cash',
      createdAt: Date.now(),
      createdByUserId: userId,
    }));
    const receiptId = await t.run(async ctx => await ctx.db.insert('receipts', {
      ticketId,
      locationId,
      receiptNumber: 'receipt-disable-retain',
      vehicleNumber: 'MH12AB1234',
      amount: 75,
      paymentMethod: 'cash',
      issuedAt: Date.now(),
      issuedByUserId: userId,
    }));

    const result = await t.withIdentity(adminIdentity).mutation(api.admin.setAttendantActive, { userId, isActive: false });
    expect(result).toEqual({ updated: true, revoked: true });
    const state = await t.run(async ctx => ({
      user: await ctx.db.get(userId),
      assignment: await ctx.db.get(assignmentId),
      access: await ctx.db.get(accessId),
      session: await ctx.db.get(sessionId),
      ticket: await ctx.db.get(ticketId),
      receipt: await ctx.db.get(receiptId),
      audit: await ctx.db.query('adminAuditLogs').withIndex('by_entity', q => q.eq('entityType', 'user').eq('entityId', userId)).collect(),
    }));
    expect(state.user?.isActive).toBe(false);
    expect(state.assignment).toMatchObject({ status: 'revoked', deviceId, latitude: 24.8607 });
    expect(state.assignment?.sessionId).toBeUndefined();
    expect(state.access).toMatchObject({ status: 'revoked', codeHash: '', expiresAt: expect.any(Number) });
    expect(state.session?.isLoggedIn).toBe(false);
    expect(state.ticket).not.toBeNull();
    expect(state.receipt).not.toBeNull();
    expect(state.audit).toHaveLength(1);
    expect(state.audit[0]).toMatchObject({ action: 'user_disabled', actorUserId: expect.any(String) });
  });

  it('denies an attendant from disabling another account without changing state', async () => {
    const t = convexTest(schema, modules);
    const actor = makeIdentity('ordinary-attendant', 'ordinary-session');
    const target = makeIdentity('target-attendant', 'target-session');
    const actorAccount = await seedUserAndLocation(t, actor);
    const { userId } = await seedUserAndLocation(t, target);

    await expect(t.withIdentity(actor).mutation(api.admin.setAttendantActive, { userId, isActive: false }))
      .rejects.toThrow('ADMIN_REQUIRED');
    await expect(t.withIdentity(actor).action(api.admin.createAttendant, {
      name: 'Unauthorized user',
      email: 'unauthorized@example.test',
      password: 'StrongPass123!',
      phoneNumber: '+14155550124',
      locationId: actorAccount.locationId,
    })).rejects.toThrow('ADMIN_REQUIRED');
    await expect(t.withIdentity(actor).action(api.admin.deleteAttendant, { userId }))
      .rejects.toThrow('ADMIN_REQUIRED');
    expect(await t.run(async ctx => await ctx.db.get(userId))).toMatchObject({ isActive: true });
    expect(await t.run(async ctx => await ctx.db.query('adminAuditLogs').collect())).toHaveLength(0);
  });

  it('removes an attendant and GPS history while keeping anonymized receipts, tickets, and report snapshots', async () => {
    const t = convexTest(schema, modules);
    const adminIdentity = makeIdentity('privacy-admin', 'privacy-admin-session');
    const attendantIdentity = makeIdentity('privacy-attendant', 'privacy-attendant-session');
    await seedUserAndLocation(t, adminIdentity, 'admin');
    const { userId, locationId } = await seedUserAndLocation(t, attendantIdentity);
    const now = Date.now();
    const records = await t.run(async ctx => {
      const ticketId = await ctx.db.insert('tickets', {
        clientId: 'privacy_ticket_0001',
        locationId,
        ticketNumber: 'HBR001-20261006-PRIVACY0001',
        vehicleType: 'Car',
        vehicleNumber: 'MH12AB1234',
        amount: 100,
        paymentStatus: 'paid',
        paymentMethod: 'cash',
        createdAt: now,
        createdByUserId: userId,
      });
      const receiptId = await ctx.db.insert('receipts', {
        ticketId,
        locationId,
        receiptNumber: 'HBR001-20261006-PRIVACY0001',
        vehicleNumber: 'MH12AB1234',
        amount: 100,
        paymentMethod: 'cash',
        operatorName: attendantIdentity.subject,
        issuedAt: now,
        issuedByUserId: userId,
        deviceId: 'privacy-device-0001',
        accountEmail: attendantIdentity.email,
        deviceLocation: { latitude: 24.8607, longitude: 67.0011, accuracy: 12, capturedAt: now },
      });
      const snapshotId = await ctx.db.insert('reportSnapshots', {
        locationId,
        reportDate: new Date(now).toISOString().slice(0, 10),
        ticketCount: 1,
        receiptCount: 1,
        cashRevenue: 100,
        generatedAt: now,
        generatedByUserId: userId,
        deviceId: 'privacy-device-0001',
        requestId: 'privacy_request_0001',
        startAt: now - 24 * 60 * 60_000,
        endAt: now,
        printedReceiptCount: 1,
        snapshotStatus: 'complete',
      });
      await ctx.db.insert('loginLocationHistory', {
        userId,
        locationId,
        deviceId: 'privacy-device-0001',
        latitude: 24.8607,
        longitude: 67.0011,
        accuracy: 12,
        capturedAt: now,
        loggedInAt: now,
      });
      await ctx.db.insert('userSessions', {
        deviceId: 'privacy-device-0001',
        accountEmail: attendantIdentity.email,
        authTokenIdentifier: attendantIdentity.tokenIdentifier,
        isLoggedIn: true,
        lastActivityTimestamp: now,
      });
      await ctx.db.insert('deviceAccess', {
        sessionId: attendantIdentity.sessionId,
        authTokenIdentifier: attendantIdentity.tokenIdentifier,
        accountEmail: attendantIdentity.email,
        deviceId: 'privacy-device-0001',
        codeHash: 'protected-hash',
        status: 'approved',
        requestedAt: now - 10_000,
        expiresAt: now + 10_000,
        attempts: 0,
        requestWindowAt: now - 10_000,
        requestCount: 1,
      });
      await ctx.db.insert('receiptMetadata', {
        receiptId: 'privacy_ticket_0001',
        deviceId: 'privacy-device-0001',
        accountEmail: attendantIdentity.email,
        timestamp: now,
        isSynced: true,
        lamportClock: now,
        lastMutationId: 'privacy_ticket_0001',
      });
      return { ticketId, receiptId, snapshotId };
    });

    await t.withIdentity(adminIdentity).mutation(internal.admin.prepareAttendantDeletion, { userId });
    expect(await t.run(async ctx => await ctx.db.get(userId))).toMatchObject({ isActive: false, deletionPending: true });
    expect(await t.run(async ctx => await ctx.db.query('deviceAssignments').withIndex('by_user', q => q.eq('userId', userId)).unique())).toBeNull();

    let hasMore = true;
    while (hasMore) {
      hasMore = await t.withIdentity(adminIdentity).mutation(internal.admin.purgeAttendantDataChunk, { userId });
    }
    await t.withIdentity(adminIdentity).mutation(internal.admin.finalizeAttendantDeletion, { userId });

    const state = await t.run(async ctx => ({
      user: await ctx.db.get(userId),
      ticket: await ctx.db.get(records.ticketId),
      receipt: await ctx.db.get(records.receiptId),
      snapshot: await ctx.db.get(records.snapshotId),
      locations: await ctx.db.query('loginLocationHistory').withIndex('by_user_and_logged_in_at', q => q.eq('userId', userId)).collect(),
      sessions: await ctx.db.query('userSessions').withIndex('by_account_email', q => q.eq('accountEmail', attendantIdentity.email)).collect(),
      access: await ctx.db.query('deviceAccess').withIndex('by_account_email', q => q.eq('accountEmail', attendantIdentity.email)).collect(),
      metadata: await ctx.db.query('receiptMetadata').withIndex('by_account_and_sync', q => q.eq('accountEmail', attendantIdentity.email).eq('isSynced', true)).collect(),
      audit: await ctx.db.query('adminAuditLogs').withIndex('by_entity', q => q.eq('entityType', 'user').eq('entityId', userId)).collect(),
    }));
    expect(state.user).toBeNull();
    expect(state.ticket).toMatchObject({ locationId, vehicleNumber: 'MH12AB1234' });
    expect(state.ticket?.createdByUserId).toBeUndefined();
    expect(state.receipt).toMatchObject({ locationId, receiptNumber: 'HBR001-20261006-PRIVACY0001' });
    expect(state.receipt?.issuedByUserId).toBeUndefined();
    expect(state.receipt?.accountEmail).toBeUndefined();
    expect(state.receipt?.operatorName).toBeUndefined();
    expect(state.receipt?.deviceId).toBeUndefined();
    expect(state.receipt?.deviceLocation).toBeUndefined();
    expect(state.snapshot).toMatchObject({ locationId, printedReceiptCount: 1, cashRevenue: 100 });
    expect(state.snapshot?.generatedByUserId).toBeUndefined();
    expect(state.snapshot?.deviceId).toBeUndefined();
    expect(state.snapshot?.requestId).toBeUndefined();
    expect(state.locations).toHaveLength(0);
    expect(state.sessions).toHaveLength(0);
    expect(state.access).toHaveLength(0);
    expect(state.metadata).toHaveLength(0);
    expect(state.audit.some(entry => entry.action === 'user_deleted')).toBe(true);
  });

  it('reassigning a device revokes the old login and requires fresh approval', async () => {
    const t = convexTest(schema, modules);
    const adminIdentity = makeIdentity('reassignment-admin', 'reassignment-admin-session');
    const attendantIdentity = makeIdentity('reassigned-attendant', 'reassigned-session');
    await seedUserAndLocation(t, adminIdentity, 'admin');
    const { userId, locationId } = await seedUserAndLocation(t, attendantIdentity);
    const oldDeviceId = 'old-assigned-device-0001';
    const assignmentId = await seedAssignment(t, userId, locationId, attendantIdentity, oldDeviceId);
    const accessId = await seedAccess(t, attendantIdentity, oldDeviceId, { codeHash: 'old-protected-code-hash' });
    const sessionId = await t.run(async ctx => await ctx.db.insert('userSessions', {
      deviceId: oldDeviceId,
      accountEmail: attendantIdentity.email,
      authTokenIdentifier: attendantIdentity.tokenIdentifier,
      isLoggedIn: true,
      lastActivityTimestamp: Date.now(),
    }));

    const result = await t.withIdentity(adminIdentity).mutation(api.admin.assignDevice, {
      userId,
      deviceId: 'replacement-device-0001',
    });
    expect(result).toEqual({ assigned: true, requiresFreshApproval: true });
    const state = await t.run(async ctx => ({
      assignment: await ctx.db.get(assignmentId),
      access: await ctx.db.get(accessId),
      session: await ctx.db.get(sessionId),
      assignments: await ctx.db.query('deviceAssignments').withIndex('by_user', q => q.eq('userId', userId)).collect(),
      audit: await ctx.db.query('adminAuditLogs').withIndex('by_entity', q => q.eq('entityType', 'device').eq('entityId', userId)).collect(),
    }));
    expect(state.assignment).toMatchObject({ deviceId: 'replacement-device-0001', status: 'pending' });
    expect(state.assignment?.sessionId).toBeUndefined();
    expect(state.assignment?.capturedAt).toBeUndefined();
    expect(state.access).toMatchObject({ status: 'revoked', codeHash: '' });
    expect(state.session?.isLoggedIn).toBe(false);
    expect(state.assignments).toHaveLength(1);
    expect(state.audit).toHaveLength(1);
    expect(state.audit[0]?.action).toBe('device_reassigned');
  });
});

describe('first administrator bootstrap', () => {
  it('shows one-time setup for unlinked legacy admins and links the configured profile', async () => {
    vi.stubEnv('CONVEX_SITE_URL', 'https://auth.example.test');
    const t = convexTest(schema, modules);
    const legacyAdminId = await t.run(async ctx => await ctx.db.insert('users', {
      email: 'owner@example.test',
      emailNormalized: 'owner@example.test',
      name: 'Legacy owner',
      role: 'admin',
      isActive: true,
      createdAt: Date.now(),
    }));

    expect(await t.query(api.admin.getBootstrapAvailable, {})).toBe(true);
    const userId = await t.mutation(internal.admin.finishFirstAdminBootstrap, {
      authUserId: 'better-auth-owner-id',
      email: 'owner@example.test',
      name: 'Configured owner',
    });
    const state = await t.run(async ctx => ({
      profile: await ctx.db.get('users', userId),
      setup: await ctx.db.query('adminSetup').withIndex('by_key', q => q.eq('key', 'firstAdmin')).unique(),
      audit: await ctx.db.query('adminAuditLogs').withIndex('by_entity', q => q.eq('entityType', 'admin').eq('entityId', userId)).collect(),
    }));

    expect(userId).toBe(legacyAdminId);
    expect(state.profile).toMatchObject({
      email: 'owner@example.test',
      name: 'Configured owner',
      role: 'admin',
      isActive: true,
      authUserId: 'better-auth-owner-id',
      authTokenIdentifier: 'https://auth.example.test|better-auth-owner-id',
    });
    expect(state.setup).toMatchObject({ key: 'firstAdmin', userId });
    expect(state.audit).toHaveLength(1);
    expect(await t.query(api.admin.getBootstrapAvailable, {})).toBe(false);
  });

  it('allows the configured one-time administrator setup when another linked administrator exists', async () => {
    vi.stubEnv('CONVEX_SITE_URL', 'https://auth.example.test');
    const t = convexTest(schema, modules);
    const identity = makeIdentity('linked-bootstrap-admin', 'linked-bootstrap-session');
    const existingAdmin = await seedUserAndLocation(t, identity, 'admin');

    expect(existingAdmin.userId).toBeTruthy();
    expect(await t.query(api.admin.getBootstrapAvailable, {})).toBe(true);
    await t.mutation(internal.admin.finishFirstAdminBootstrap, {
      authUserId: 'second-admin-id',
      email: 'second-admin@example.test',
      name: 'Second admin',
    });
    expect(await t.query(api.admin.getBootstrapAvailable, {})).toBe(false);
  });

  it('keeps bootstrap closed after the one-time setup marker is written', async () => {
    const t = convexTest(schema, modules);
    const identity = makeIdentity('initialized-bootstrap-admin', 'initialized-bootstrap-session');
    const { userId } = await seedUserAndLocation(t, identity, 'admin');
    await t.run(async ctx => await ctx.db.insert('adminSetup', {
      key: 'firstAdmin',
      userId,
      completedAt: Date.now(),
    }));

    expect(await t.query(api.admin.getBootstrapAvailable, {})).toBe(false);
    await expect(t.mutation(internal.admin.finishFirstAdminBootstrap, {
      authUserId: 'second-admin-id',
      email: 'second-admin@example.test',
      name: 'Second admin',
    })).rejects.toThrow('ADMIN_ALREADY_INITIALIZED');
  });
});

describe('administrator dashboard auth origin', () => {
  it('allows only the configured dashboard origin alongside the Convex and mobile origins', () => {
    expect(trustedAuthOrigins('http://127.0.0.1:3211', 'http://127.0.0.1:3100')).toEqual([
      'valetpos://',
      'http://127.0.0.1:3211',
      '127.0.0.1',
      'http://127.0.0.1:3100',
    ]);
  });

  it('rejects dashboard URLs that expand the trusted surface beyond one origin', () => {
    expect(() => trustedAuthOrigins('https://auth.example.test', 'https://admin.example.test/manage'))
      .toThrow('without a path or credentials');
    expect(() => trustedAuthOrigins('https://auth.example.test', 'https://*.example.test'))
      .toThrow('wildcards are not allowed');
  });
});

describe('server authorization and receipt history', () => {
  it('binds session and receipt writes to the assigned device and keeps printed status monotonic', async () => {
    const t = convexTest(schema, modules);
    const identity = makeIdentity('receipt-user', 'receipt-session-0001');
    const { userId, locationId } = await seedUserAndLocation(t, identity);
    const deviceId = 'receipt-device-0001';
    await seedAccess(t, identity, deviceId);
    await seedAssignment(t, userId, locationId, identity, deviceId);
    const signedIn = t.withIdentity(identity);

    await expect(signedIn.mutation(api.sessions.recordActiveSession, {
      deviceId: 'receipt-device-0002',
      accountEmail: identity.email,
      lastActivityTimestamp: Date.now(),
    })).rejects.toThrow('approved device');
    const session = await signedIn.mutation(api.sessions.recordActiveSession, {
      deviceId,
      accountEmail: identity.email,
      lastActivityTimestamp: Date.now(),
    });
    expect(session.deviceId).toBe(deviceId);

    const clientId = 'receipt_client_0001';
    const issuedAt = Date.now() - 1_000;
    const expectedReceiptNumber = receiptNumber(issuedAt, clientId);
    await expect(signedIn.mutation(api.tickets.createTicket, {
      clientId,
      vehicleType: 'Bike',
      vehicleNumber: 'MH12AB1234',
      receiptNumber: expectedReceiptNumber,
      issuedAt,
      printStatus: 'printed',
      reprintCount: 0,
      deviceId: 'spoofed-device-0001',
    })).rejects.toThrow('approved device');

    const created = await signedIn.mutation(api.tickets.createTicket, {
      clientId,
      vehicleType: 'Bike',
      vehicleNumber: 'MH12AB1234',
      receiptNumber: expectedReceiptNumber,
      issuedAt,
      printStatus: 'printed',
      reprintCount: 0,
      deviceId,
    });
    expect(created.receiptNumber).toBe(expectedReceiptNumber);
    await signedIn.mutation(api.tickets.updateReceiptPrintStatus, {
      clientId,
      printStatus: 'pending',
      reprintCount: 0,
    });
    const storedReceipt = await t.run(async ctx =>
      await ctx.db.query('receipts').withIndex('by_ticket', q => q.eq('ticketId', created.ticketId)).unique(),
    );
    expect(storedReceipt).toMatchObject({ deviceId, issuedByUserId: userId, printStatus: 'printed' });
  });

  it('denies admin reads without MFA and allows a confirmed admin identity', async () => {
    const t = convexTest(schema, modules);
    const identity = makeIdentity('dashboard-admin', 'admin-session-0001', false);
    await seedUserAndLocation(t, identity, 'admin');

    await expect(t.withIdentity(identity).query(api.admin.getDashboard)).rejects.toThrow('authenticator verification');
    const verified = await t.withIdentity({ ...identity, twoFactorEnabled: true }).query(api.admin.getDashboard);
    expect(verified.counts).toEqual({ users: 1, attendants: 0, locations: 1, activeDevices: 0 });
  });

  it('returns only the current user and device printed receipts in an idempotent saved report', async () => {
    const t = convexTest(schema, modules);
    const identity = makeIdentity('report-user', 'report-session-0001');
    const { userId, locationId } = await seedUserAndLocation(t, identity);
    const deviceId = 'report-device-0001';
    await seedAccess(t, identity, deviceId);
    await seedAssignment(t, userId, locationId, identity, deviceId);
    const issuedAt = Date.now() - 1_000;
    const otherIdentity = makeIdentity('another-report-user', 'another-report-session-0001');

    await t.run(async ctx => {
      const rows = [
        { deviceId, printStatus: 'printed' as const, amount: 50 },
        { deviceId, printStatus: 'printed' as const, amount: 100 },
        { deviceId, printStatus: 'pending' as const, amount: 200 },
        { deviceId: 'other-device-0001', printStatus: 'printed' as const, amount: 500 },
      ];
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index]!;
        const clientId = 'report_client_' + String(index).padStart(4, '0');
        const ticketId = await ctx.db.insert('tickets', {
          clientId,
          locationId,
          ticketNumber: 'HBR001-' + clientId,
          vehicleType: 'Bike',
          vehicleNumber: 'MH12AB1234',
          amount: row.amount,
          paymentStatus: 'paid',
          paymentMethod: 'cash',
          createdAt: issuedAt,
          createdByUserId: userId,
        });
        await ctx.db.insert('receipts', {
          ticketId,
          locationId,
          receiptNumber: 'receipt-' + index,
          organizationCode: 'HBR001',
          organizationName: 'Harbor Parking',
          locationName: 'Harbor Garage',
          barcodeValue: 'receipt-' + index,
          vehicleNumber: 'MH12AB1234',
          vehicleType: 'Bike',
          amount: row.amount,
          paymentMethod: 'cash',
          printStatus: row.printStatus,
          reprintCount: 0,
          operatorName: identity.subject,
          paymentStatus: 'paid',
          issuedAt,
          issuedByUserId: userId,
          deviceId: row.deviceId,
          accountEmail: identity.email,
        });
      }
      const otherUserId = await ctx.db.insert('users', {
        email: otherIdentity.email,
        emailNormalized: otherIdentity.email,
        authTokenIdentifier: otherIdentity.tokenIdentifier,
        name: otherIdentity.subject,
        role: 'attendant',
        isActive: true,
        locationId,
        createdAt: Date.now(),
      });
      const otherTicketId = await ctx.db.insert('tickets', {
        clientId: 'other-user-report-ticket',
        locationId,
        ticketNumber: 'HBR001-OTHER-USER',
        vehicleType: 'Bike',
        vehicleNumber: 'MH12AB9999',
        amount: 900,
        paymentStatus: 'paid',
        paymentMethod: 'cash',
        createdAt: issuedAt,
        createdByUserId: otherUserId,
      });
      await ctx.db.insert('receipts', {
        ticketId: otherTicketId,
        locationId,
        receiptNumber: 'receipt-other-user',
        vehicleNumber: 'MH12AB9999',
        vehicleType: 'Bike',
        amount: 900,
        paymentMethod: 'cash',
        printStatus: 'printed',
        issuedAt,
        issuedByUserId: otherUserId,
        deviceId,
        accountEmail: otherIdentity.email,
      });
    });

    const signedIn = t.withIdentity(identity);
    const requestId = 'report_request_0001';
    const begun = await signedIn.mutation(api.reports.beginRollingSnapshot, { deviceId, requestId });
    expect(begun.endAt - begun.startAt).toBe(24 * 60 * 60_000);
    const completed = await signedIn.action(api.reports.createRollingSnapshot, { deviceId, requestId });
    expect(completed.printedReceiptCount).toBe(2);
    expect(completed.cashRevenue).toBe(150);
    const repeated = await signedIn.action(api.reports.createRollingSnapshot, { deviceId, requestId });
    expect(repeated._id).toBe(completed._id);

    const history = await signedIn.query(api.reports.listMyReportSnapshots, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(history.page).toHaveLength(1);
    expect(history.page[0]).toMatchObject({
      _id: completed._id,
      generatedByUserId: userId,
      locationId,
      deviceId,
      requestId,
      printedReceiptCount: 2,
      cashRevenue: 150,
      snapshotStatus: 'complete',
    });

    const otherDeviceId = 'other-report-device-0001';
    await seedAccess(t, otherIdentity, otherDeviceId);
    const otherUserId = await t.run(async ctx =>
      await ctx.db.query('users').withIndex('by_auth_token_identifier', q => q.eq('authTokenIdentifier', otherIdentity.tokenIdentifier)).unique()
        .then(user => {
          if (!user) throw new Error('Test user was not created.');
          return user._id;
        }),
    );
    await seedAssignment(t, otherUserId, locationId, otherIdentity, otherDeviceId);
    const otherHistory = await t.withIdentity(otherIdentity).query(api.reports.listMyReportSnapshots, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(otherHistory.page).toHaveLength(0);
  });

  it('requires pagination instead of silently truncating ticket history after 500 rows', async () => {
    const t = convexTest(schema, modules);
    const identity = makeIdentity('history-user', 'history-session-0001');
    const { userId, locationId } = await seedUserAndLocation(t, identity);
    const deviceId = 'history-device-0001';
    await seedAccess(t, identity, deviceId);
    await seedAssignment(t, userId, locationId, identity, deviceId);
    const from = Date.now() - 1_000;
    const to = Date.now() + 1_000;

    await t.run(async ctx => {
      for (let index = 0; index < 501; index += 1) {
        const clientId = 'history-client-' + String(index).padStart(4, '0');
        await ctx.db.insert('tickets', {
          clientId,
          locationId,
          ticketNumber: 'HBR001-' + clientId,
          vehicleType: 'Bike',
          vehicleNumber: 'MH12AB1234',
          amount: 50,
          paymentStatus: 'paid',
          paymentMethod: 'cash',
          createdAt: from + 100,
          createdByUserId: userId,
        });
      }
    });

    const signedIn = t.withIdentity(identity);
    await expect(signedIn.query(api.tickets.listTodayTickets, { locationId, from, to }))
      .rejects.toThrow('paginated ticket history');
    const firstPage = await signedIn.query(api.tickets.listTodayTicketPage, {
      from,
      to,
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(firstPage.page).toHaveLength(50);
    expect(firstPage.isDone).toBe(false);
    const secondPage = await signedIn.query(api.tickets.listTodayTicketPage, {
      from,
      to,
      paginationOpts: { numItems: 50, cursor: firstPage.continueCursor },
    });
    expect(secondPage.page).toHaveLength(50);
    expect(secondPage.page[0]?._id).not.toBe(firstPage.page[0]?._id);
  });
});
