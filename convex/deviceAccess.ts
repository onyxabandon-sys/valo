import { action, internalMutation, internalQuery, query, mutation } from './_generated/server';
import { internal } from './_generated/api';
import { ConvexError, v } from 'convex/values';
import { isDeviceReservedForAnotherUser } from '../shared/deviceAssignments';
import { getSessionExpiresAt, isSessionExpired, SESSION_MAX_AGE_MS } from '../shared/sessionPolicy';

const HASH_HEX = /^[a-f0-9]{64}$/;
const DEVICE_ID = /^[A-Za-z0-9._:-]{8,128}$/;
const CODE = /^\d{8}$/;
const CODE_TTL_MS = 15 * 60_000;
const REQUEST_WINDOW_MS = 60 * 60_000;
const RESEND_DELAY_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 5;
const MAX_APPROVAL_DELIVERIES_PER_HOUR = 20;
const MAX_CODE_ATTEMPTS = 5;
const MAX_LOCATION_AGE_MS = 2 * 60_000;
const MAX_LOCATION_ACCURACY_METERS = 100;
const LOCATION_FUTURE_TOLERANCE_MS = 15_000;

const loginLocationValidator = v.object({
  latitude: v.number(),
  longitude: v.number(),
  accuracy: v.number(),
  capturedAt: v.number(),
});

const deliveryChannelValidator = v.union(v.literal('whatsapp'), v.literal('email-manual-whatsapp-fallback'));
type DeliveryChannel = 'whatsapp' | 'email-manual-whatsapp-fallback';

function configuredDeliveryChannel(): DeliveryChannel {
  return process.env.BREVO_API_KEY?.trim() &&
    process.env.BREVO_WHATSAPP_SENDER_NUMBER?.trim() &&
    process.env.BREVO_WHATSAPP_TEMPLATE_ID?.trim()
    ? 'whatsapp'
    : 'email-manual-whatsapp-fallback';
}

function sessionIdFromIdentity(identity: unknown) {
  if (!identity || typeof identity !== 'object' || !('sessionId' in identity)) {
    throw new ConvexError({ code: 'SESSION_ID_MISSING', message: 'Your sign-in session cannot be verified. Sign out and sign in again.' });
  }
  const sessionId = identity.sessionId;
  if (typeof sessionId !== 'string' || sessionId.length < 8 || sessionId.length > 128) {
    throw new ConvexError({ code: 'SESSION_ID_MISSING', message: 'Your sign-in session cannot be verified. Sign out and sign in again.' });
  }
  return sessionId;
}

async function hashCode(sessionId: string, code: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new ConvexError({ code: 'ACCESS_SECRET_NOT_CONFIGURED', message: 'Secure device approval is not configured. Ask the app owner to finish the server setup.' });
  }
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${sessionId}:${code}`));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function createCode() {
  const values = new Uint32Array(1);
  const ceiling = 4_200_000_000;
  do crypto.getRandomValues(values); while (values[0] >= ceiling);
  return String(values[0] % 100_000_000).padStart(8, '0');
}

function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  if (!local || !domain) return 'your owner inbox';
  return `${local.slice(0, 1)}${'*'.repeat(Math.min(Math.max(local.length - 1, 2), 6))}@${domain}`;
}

function requireEmailConfig() {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const ownerEmail = process.env.ACCESS_APPROVER_EMAIL?.trim().toLowerCase();
  const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim();
  const senderName = process.env.BREVO_SENDER_NAME?.trim() || 'Valet POS';
  if (!apiKey || !ownerEmail || !senderEmail || !ownerEmail.includes('@') || !senderEmail.includes('@')) {
    throw new ConvexError({ code: 'ACCESS_EMAIL_NOT_CONFIGURED', message: 'Device approval email is not configured. Ask the app owner to finish the secure email setup.' });
  }
  return { apiKey, ownerEmail, senderEmail, senderName };
}

function getWhatsappConfig() {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const senderNumber = process.env.BREVO_WHATSAPP_SENDER_NUMBER?.trim();
  const templateIdValue = process.env.BREVO_WHATSAPP_TEMPLATE_ID?.trim();
  const anyWhatsappConfig = Boolean(senderNumber || templateIdValue);
  if (!anyWhatsappConfig) return null;
  const templateId = Number(templateIdValue);
  if (
    !apiKey ||
    !senderNumber ||
    !/^[1-9]\d{7,14}$/.test(senderNumber) ||
    !templateIdValue ||
    !Number.isSafeInteger(templateId) ||
    templateId <= 0
  ) {
    throw new ConvexError({ code: 'ACCESS_WHATSAPP_NOT_CONFIGURED', message: 'Direct WhatsApp approval is only partly configured. Ask the app owner to finish the Brevo sender and approved template setup.' });
  }
  return { apiKey, senderNumber, templateId };
}

function requireWhatsappPhoneNumber(phoneNumber: string | null | undefined) {
  if (!phoneNumber || !/^\+[1-9]\d{7,14}$/.test(phoneNumber)) {
    throw new ConvexError({ code: 'WHATSAPP_NUMBER_REQUIRED', message: 'Your approved profile has no valid WhatsApp number. Ask an administrator to update it.' });
  }
  return phoneNumber;
}

export const getMyStatus = query({
  args: { now: v.number() },
  returns: v.union(
    v.object({ status: v.literal('notRequested'), ownerEmail: v.union(v.string(), v.null()), deliveryChannel: deliveryChannelValidator }),
    v.object({ status: v.literal('pending'), expiresAt: v.number(), ownerEmail: v.union(v.string(), v.null()), codeSent: v.boolean(), deliveryChannel: deliveryChannelValidator }),
    v.object({ status: v.literal('locationRequired'), expiresAt: v.number(), approvedAt: v.number() }),
    v.object({ status: v.literal('approved'), approvedAt: v.number() }),
  ),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: 'UNAUTHENTICATED', message: 'Sign in to continue.' });
    const sessionId = sessionIdFromIdentity(identity);
    if (!Number.isSafeInteger(args.now)) throw new ConvexError({ code: 'INVALID_STATUS_REFRESH', message: 'Refresh the sign-in status and try again.' });
    const serverNow = Date.now();
    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_token_identifier', q => q.eq('authTokenIdentifier', identity.tokenIdentifier))
      .unique();
    if (user && (user.role !== 'attendant' || user.isActive === false)) {
      return { status: 'notRequested' as const, ownerEmail: null, deliveryChannel: configuredDeliveryChannel() };
    }
    const record = await ctx.db.query('deviceAccess').withIndex('by_session_id', q => q.eq('sessionId', sessionId)).unique();
    if (!record || record.authTokenIdentifier !== identity.tokenIdentifier || record.status === 'failed' || record.status === 'revoked') {
      const deliveryChannel = configuredDeliveryChannel();
      return {
        status: 'notRequested' as const,
        ownerEmail: deliveryChannel === 'email-manual-whatsapp-fallback' && process.env.ACCESS_APPROVER_EMAIL
          ? maskEmail(process.env.ACCESS_APPROVER_EMAIL.trim())
          : null,
        deliveryChannel,
      };
    }
    if (record.status === 'approved') {
      const assignment = await ctx.db
        .query('deviceAssignments')
        .withIndex('by_session_id', q => q.eq('sessionId', sessionId))
        .unique();
      if (assignment?.status === 'active' && assignment.deviceId === record.deviceId) {
        if (!isSessionExpired(assignment.sessionExpiresAt ?? getSessionExpiresAt(assignment.updatedAt), serverNow)) {
          return { status: 'approved' as const, approvedAt: record.approvedAt ?? record.requestedAt };
        }
        const deliveryChannel = configuredDeliveryChannel();
        return {
          status: 'notRequested' as const,
          ownerEmail: deliveryChannel === 'email-manual-whatsapp-fallback' && process.env.ACCESS_APPROVER_EMAIL
            ? maskEmail(process.env.ACCESS_APPROVER_EMAIL.trim())
            : null,
          deliveryChannel,
        };
      }
      if (record.expiresAt > serverNow) {
        return {
          status: 'locationRequired' as const,
          expiresAt: record.expiresAt,
          approvedAt: record.approvedAt ?? record.requestedAt,
        };
      }
      const deliveryChannel = configuredDeliveryChannel();
      return {
        status: 'notRequested' as const,
        ownerEmail: deliveryChannel === 'email-manual-whatsapp-fallback' && process.env.ACCESS_APPROVER_EMAIL
          ? maskEmail(process.env.ACCESS_APPROVER_EMAIL.trim())
          : null,
        deliveryChannel,
      };
    }
    if (record.expiresAt <= serverNow) {
      const deliveryChannel = configuredDeliveryChannel();
      return {
        status: 'notRequested' as const,
        ownerEmail: deliveryChannel === 'email-manual-whatsapp-fallback' && process.env.ACCESS_APPROVER_EMAIL
          ? maskEmail(process.env.ACCESS_APPROVER_EMAIL.trim())
          : null,
        deliveryChannel,
      };
    }
    const deliveryChannel = record.deliveryChannel ?? 'email-manual-whatsapp-fallback';
    return {
      status: 'pending' as const,
      expiresAt: record.expiresAt,
      ownerEmail: deliveryChannel === 'email-manual-whatsapp-fallback' && process.env.ACCESS_APPROVER_EMAIL
        ? maskEmail(process.env.ACCESS_APPROVER_EMAIL.trim())
        : null,
      codeSent: record.lastSentAt !== undefined,
      deliveryChannel,
    };
  },
});

export const requestApprovalCode = action({
  args: { deviceId: v.string() },
  returns: v.union(
    v.object({ sent: v.literal(true), expiresAt: v.number(), channel: v.literal('whatsapp') }),
    v.object({ sent: v.literal(true), ownerEmail: v.string(), expiresAt: v.number(), channel: v.literal('email-manual-whatsapp-fallback') }),
  ),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: 'UNAUTHENTICATED', message: 'Sign in to request device access.' });
    const sessionId = sessionIdFromIdentity(identity);
    const email = identity.email?.trim().toLowerCase();
    if (!email || !email.includes('@')) throw new ConvexError({ code: 'EMAIL_REQUIRED', message: 'Your sign-in account has no valid email address.' });
    if (!DEVICE_ID.test(args.deviceId)) throw new ConvexError({ code: 'INVALID_DEVICE_ID', message: 'This device identifier is invalid. Restart the app and try again.' });
    const recipient = await ctx.runQuery(internal.deviceAccess.getApprovalRecipient, {
      email,
      tokenIdentifier: identity.tokenIdentifier,
    });
    if (!recipient) {
      throw new ConvexError({ code: 'PROFILE_NOT_PROVISIONED', message: 'This account has no approved Valet POS profile. Ask an administrator to add the account, then sign in again.' });
    }
    if (recipient.role !== 'attendant') {
      throw new ConvexError({ code: 'WEB_ONLY_ACCOUNT', message: 'Administrator accounts must use the operations dashboard.' });
    }
    if (!recipient.isActive) {
      throw new ConvexError({ code: 'ACCOUNT_DISABLED', message: 'This account is disabled. Contact an administrator.' });
    }
    const delivery = (() => {
      const whatsappConfig = getWhatsappConfig();
      return whatsappConfig
        ? { channel: 'whatsapp' as const, config: whatsappConfig }
        : { channel: 'email-manual-whatsapp-fallback' as const, config: requireEmailConfig() };
    })();
    const whatsappPhoneNumber = delivery.channel === 'whatsapp'
      ? requireWhatsappPhoneNumber(recipient.phoneNumber)
      : undefined;
    const code = createCode();
    const now = Date.now();
    const expiresAt = now + CODE_TTL_MS;
    const codeHashValue = await hashCode(sessionId, code);
    const prepared: { expiresAt: number } = await ctx.runMutation(internal.deviceAccess.beginRequest, {
      sessionId,
      tokenIdentifier: identity.tokenIdentifier,
      accountEmail: email,
      deviceId: args.deviceId,
      codeHash: codeHashValue,
      deliveryChannel: delivery.channel,
      now,
      expiresAt,
    });

    const controller = new AbortController();
    const notificationTimeout = setTimeout(() => controller.abort(), 10_000);
    const url = delivery.channel === 'whatsapp'
      ? 'https://api.brevo.com/v3/whatsapp/sendMessage'
      : 'https://api.brevo.com/v3/smtp/email';
    const body = delivery.channel === 'whatsapp'
      ? {
          contactNumbers: [requireWhatsappPhoneNumber(whatsappPhoneNumber).replace(/^\+/, '')],
          senderNumber: delivery.config.senderNumber,
          templateId: delivery.config.templateId,
          params: { code, expiresInMinutes: Math.ceil(CODE_TTL_MS / 60_000) },
        }
      : {
          sender: { name: delivery.config.senderName, email: delivery.config.senderEmail },
          to: [{ email: delivery.config.ownerEmail }],
          subject: 'Valet POS device access code',
          textContent: [
            `A sign-in is requesting your approval for Valet POS.`,
            `Account: ${email}`,
            `Approval code: ${code}`,
            `This code expires in 15 minutes and works only for this sign-in session.`,
            `If you approve this request, send the code directly to the requester in a one-to-one WhatsApp chat. Never share it if you did not expect this request.`,
          ].join('\n\n'),
        };
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'api-key': delivery.config.apiKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      await ctx.runMutation(internal.deviceAccess.markNotificationFailed, { sessionId, now: Date.now() });
      throw new ConvexError({
        code: delivery.channel === 'whatsapp' ? 'ACCESS_WHATSAPP_FAILED' : 'ACCESS_EMAIL_FAILED',
        message: delivery.channel === 'whatsapp'
          ? 'The WhatsApp code could not be sent. Check the Brevo sender and template, then retry.'
          : 'The approval email could not be sent. Check the email setup and try again.',
      });
    } finally {
      clearTimeout(notificationTimeout);
    }

    if (!response.ok) {
      await ctx.runMutation(internal.deviceAccess.markNotificationFailed, { sessionId, now: Date.now() });
      throw new ConvexError({
        code: delivery.channel === 'whatsapp' ? 'ACCESS_WHATSAPP_FAILED' : 'ACCESS_EMAIL_FAILED',
        message: delivery.channel === 'whatsapp'
          ? 'Brevo rejected the WhatsApp code. Check the approved sender and template, then retry.'
          : 'The approval email was rejected by the email service. Check the sender setup and try again.',
      });
    }
    await ctx.runMutation(internal.deviceAccess.markNotificationSent, { sessionId, sentAt: Date.now() });
    if (delivery.channel === 'whatsapp') {
      return { sent: true as const, expiresAt: prepared.expiresAt, channel: 'whatsapp' as const };
    }
    return {
      sent: true as const,
      ownerEmail: maskEmail(delivery.config.ownerEmail),
      expiresAt: prepared.expiresAt,
      channel: 'email-manual-whatsapp-fallback' as const,
    };
  },
});

export const verifyApprovalCode = mutation({
  args: { code: v.string(), deviceId: v.string() },
  returns: v.object({ approved: v.boolean(), message: v.string() }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: 'UNAUTHENTICATED', message: 'Sign in to continue.' });
    const sessionId = sessionIdFromIdentity(identity);
    if (!DEVICE_ID.test(args.deviceId)) throw new ConvexError({ code: 'INVALID_DEVICE_ID', message: 'This device identifier is invalid. Restart the app and try again.' });
    if (!CODE.test(args.code.trim())) return { approved: false, message: 'Enter the 8-digit code from the app owner.' };
    const digest = await hashCode(sessionId, args.code.trim());
    const now = Date.now();
    const record = await ctx.db.query('deviceAccess').withIndex('by_session_id', q => q.eq('sessionId', sessionId)).unique();
    if (
      !record ||
      record.authTokenIdentifier !== identity.tokenIdentifier ||
      record.accountEmail !== identity.email?.trim().toLowerCase() ||
      record.deviceId !== args.deviceId ||
      record.status !== 'pending' ||
      !record.lastSentAt ||
      record.expiresAt <= now
    ) {
      return { approved: false, message: 'This code expired or was not sent. Request a new code.' };
    }
    if (record.attempts >= MAX_CODE_ATTEMPTS) {
      await ctx.db.patch(record._id, { status: 'failed', codeHash: '' });
      return { approved: false, message: 'Too many incorrect codes. Sign out and sign in again to request a new code.' };
    }
    if (record.codeHash !== digest) {
      const attempts = record.attempts + 1;
      await ctx.db.patch(record._id, { attempts, ...(attempts >= MAX_CODE_ATTEMPTS ? { status: 'failed' as const, codeHash: '' } : {}) });
      return {
        approved: false,
        message: attempts >= MAX_CODE_ATTEMPTS
          ? 'Too many incorrect codes. Sign out and sign in again to request a new code.'
          : 'That code is incorrect. Check the WhatsApp message and try again.',
      };
    }
    await ctx.db.patch(record._id, { status: 'approved', approvedAt: now, codeHash: '' });
    return { approved: true, message: '' };
  },
});

export const completeDeviceLogin = mutation({
  args: { deviceId: v.string(), location: loginLocationValidator },
  returns: v.object({ assigned: v.literal(true), locationId: v.id('locations') }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) throw new ConvexError({ code: 'UNAUTHENTICATED', message: 'Sign in to continue.' });
    const sessionId = sessionIdFromIdentity(identity);
    if (!DEVICE_ID.test(args.deviceId)) throw new ConvexError({ code: 'INVALID_DEVICE_ID', message: 'This device identifier is invalid. Restart the app and try again.' });

    const now = Date.now();
    const location = args.location;
    if (
      !Number.isFinite(location.latitude) ||
      location.latitude < -90 ||
      location.latitude > 90 ||
      !Number.isFinite(location.longitude) ||
      location.longitude < -180 ||
      location.longitude > 180
    ) {
      throw new ConvexError({ code: 'INVALID_LOGIN_LOCATION', message: 'The location fix is invalid. Try again.' });
    }
    if (!Number.isSafeInteger(location.capturedAt) || location.capturedAt > now + LOCATION_FUTURE_TOLERANCE_MS || now - location.capturedAt > MAX_LOCATION_AGE_MS) {
      throw new ConvexError({ code: 'STALE_LOGIN_LOCATION', message: 'The location fix is too old. Try again to get a fresh location.' });
    }
    if (!Number.isFinite(location.accuracy) || location.accuracy <= 0 || location.accuracy > MAX_LOCATION_ACCURACY_METERS) {
      throw new ConvexError({ code: 'POOR_LOGIN_LOCATION', message: 'The location fix is not accurate enough. Move to an open area and try again.' });
    }

    const access = await ctx.db
      .query('deviceAccess')
      .withIndex('by_session_id', q => q.eq('sessionId', sessionId))
      .unique();
    if (
      !access ||
      access.authTokenIdentifier !== identity.tokenIdentifier ||
      access.accountEmail !== identity.email.trim().toLowerCase() ||
      access.deviceId !== args.deviceId ||
      access.status !== 'approved' ||
      access.completedAt !== undefined ||
      access.expiresAt <= now
    ) {
      if (access?.completedAt !== undefined && access.authTokenIdentifier === identity.tokenIdentifier) {
        throw new ConvexError({ code: 'DEVICE_LOGIN_ALREADY_COMPLETED', message: 'This device approval was already used. Sign out and request a new code to sign in again.' });
      }
      throw new ConvexError({ code: 'DEVICE_ACCESS_REQUIRED', message: 'This code is no longer approved. Request a new code and try again.' });
    }

    let user = await ctx.db
      .query('users')
      .withIndex('by_auth_token_identifier', q => q.eq('authTokenIdentifier', identity.tokenIdentifier))
      .unique();
    if (!user) {
      const normalizedEmail = identity.email.trim().toLowerCase();
      user = await ctx.db
        .query('users')
        .withIndex('by_email_normalized', q => q.eq('emailNormalized', normalizedEmail))
        .unique();
      if (!user) {
        user = await ctx.db.query('users').withIndex('by_email', q => q.eq('email', normalizedEmail)).first();
      }
      if (!user) {
        throw new ConvexError({ code: 'PROFILE_NOT_PROVISIONED', message: 'This account has no Valet POS profile. Ask an administrator to add the account.' });
      }
      if (user.authTokenIdentifier && user.authTokenIdentifier !== identity.tokenIdentifier) {
        throw new ConvexError({ code: 'ACCOUNT_ALREADY_LINKED', message: 'This Valet POS profile is linked to another sign-in. Contact an administrator.' });
      }
      if (user.email.trim().toLowerCase() !== normalizedEmail) {
        throw new ConvexError({ code: 'ACCOUNT_EMAIL_MISMATCH', message: 'The signed-in email does not match this Valet POS profile.' });
      }
    }
    if (user.authUserId && user.authUserId !== identity.subject) {
      throw new ConvexError({ code: 'ACCOUNT_AUTH_ID_MISMATCH', message: 'This sign-in is not linked to the account created by an administrator. Contact an administrator.' });
    }
    if (user.isActive === false) throw new ConvexError({ code: 'ACCOUNT_DISABLED', message: 'This account is disabled. Contact an administrator.' });
    if (user.role !== 'attendant') throw new ConvexError({ code: 'WEB_ONLY_ACCOUNT', message: 'Administrator accounts must use the operations dashboard.' });
    if (!user.locationId) throw new ConvexError({ code: 'LOCATION_NOT_ASSIGNED', message: 'An administrator must assign a location before this account can open the app.' });

    const existing = await ctx.db
      .query('deviceAssignments')
      .withIndex('by_user', q => q.eq('userId', user!._id))
      .unique();
    if (existing?.status === 'revoked') {
      throw new ConvexError({ code: 'DEVICE_REVOKED', message: 'An administrator revoked this device. Ask an administrator to assign a device before trying again.' });
    }
    if (existing && existing.deviceId !== args.deviceId) {
      throw new ConvexError({ code: 'DEVICE_ALREADY_ASSIGNED', message: 'This account is assigned to another device. Ask an administrator to change the device assignment.' });
    }
    const existingSessionExpiresAt = existing
      ? existing.sessionExpiresAt ?? existing.updatedAt + SESSION_MAX_AGE_MS
      : null;
    if (existing?.status === 'active' && existing.sessionId !== sessionId &&
      (existingSessionExpiresAt === null || !isSessionExpired(existingSessionExpiresAt, now))) {
      throw new ConvexError({ code: 'ACTIVE_SESSION_EXISTS', message: 'This account already has an active session. Sign out from that device or ask an administrator to revoke it.' });
    }
    // Read both reservation ranges in the same transaction as the assignment write.
    // Convex serializable mutations retry a concurrent claim after either range changes.
    const deviceOwners = await Promise.all((['active', 'pending'] as const).map(status =>
      ctx.db.query('deviceAssignments')
        .withIndex('by_status_and_device', q => q.eq('status', status).eq('deviceId', args.deviceId))
        .unique(),
    ));
    if (isDeviceReservedForAnotherUser(deviceOwners.filter(owner => owner !== null), user._id, args.deviceId)) {
      throw new ConvexError({ code: 'DEVICE_ASSIGNED_TO_ANOTHER_ACCOUNT', message: 'This device is assigned to another account. Ask an administrator to change the assignment.' });
    }

    if (existing?.status === 'active' && existing.sessionId && existing.sessionId !== sessionId && existingSessionExpiresAt !== null && isSessionExpired(existingSessionExpiresAt, now)) {
      const oldAccess = await ctx.db.query('deviceAccess').withIndex('by_session_id', q => q.eq('sessionId', existing.sessionId!)).unique();
      if (oldAccess && oldAccess.status !== 'revoked') {
        await ctx.db.patch(oldAccess._id, { status: 'revoked', codeHash: '', expiresAt: now });
      }
    }

    if (user.authTokenIdentifier !== identity.tokenIdentifier || user.authUserId !== identity.subject) {
      await ctx.db.patch('users', user._id, {
        authTokenIdentifier: identity.tokenIdentifier,
        authUserId: identity.subject,
      });
    }

    const assignmentValues = {
      userId: user._id,
      deviceId: args.deviceId,
      sessionId,
      locationId: user.locationId,
      status: 'active' as const,
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      capturedAt: location.capturedAt,
      sessionExpiresAt: getSessionExpiresAt(now),
      assignedAt: existing?.assignedAt ?? now,
      updatedAt: now,
      revokedAt: undefined,
    };
    if (existing) await ctx.db.replace(existing._id, assignmentValues);
    else await ctx.db.insert('deviceAssignments', assignmentValues);

    await ctx.db.insert('loginLocationHistory', {
      userId: user._id,
      locationId: user.locationId,
      deviceId: args.deviceId,
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      capturedAt: location.capturedAt,
      loggedInAt: now,
    });

    const session = await ctx.db
      .query('userSessions')
      .withIndex('by_device_and_account', q => q.eq('deviceId', args.deviceId).eq('accountEmail', user!.email.trim().toLowerCase()))
      .unique();
    const sessionValues = {
      deviceId: args.deviceId,
      accountEmail: user.email.trim().toLowerCase(),
      authTokenIdentifier: identity.tokenIdentifier,
      isLoggedIn: true,
      lastActivityTimestamp: now,
    };
    if (session) await ctx.db.replace(session._id, sessionValues);
    else await ctx.db.insert('userSessions', sessionValues);
    await ctx.db.patch(access._id, { completedAt: now });

    return { assigned: true as const, locationId: user.locationId };
  },
});

export const revokeMyAccess = mutation({
  args: {},
  returns: v.object({ revoked: v.literal(true) }),
  handler: async ctx => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { revoked: true as const };
    const sessionId = sessionIdFromIdentity(identity);
    const record = await ctx.db.query('deviceAccess').withIndex('by_session_id', q => q.eq('sessionId', sessionId)).unique();
    if (record && record.authTokenIdentifier === identity.tokenIdentifier) {
      await ctx.db.patch(record._id, { status: 'revoked', codeHash: '', expiresAt: Date.now() });
    }
    const assignment = await ctx.db
      .query('deviceAssignments')
      .withIndex('by_session_id', q => q.eq('sessionId', sessionId))
      .unique();
    if (assignment?.status === 'active') {
      await ctx.db.patch(assignment._id, { status: 'pending', sessionId: undefined, sessionExpiresAt: undefined, updatedAt: Date.now() });
    }
    return { revoked: true as const };
  },
});

export const getApprovalRecipient = internalQuery({
  args: { email: v.string(), tokenIdentifier: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      phoneNumber: v.union(v.string(), v.null()),
      role: v.union(v.literal('admin'), v.literal('attendant')),
      isActive: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const normalizedEmail = args.email.trim().toLowerCase();
    let user = await ctx.db
      .query('users')
      .withIndex('by_auth_token_identifier', q => q.eq('authTokenIdentifier', args.tokenIdentifier))
      .unique();
    if (!user) {
      user = await ctx.db
        .query('users')
        .withIndex('by_email_normalized', q => q.eq('emailNormalized', normalizedEmail))
        .unique();
      if (!user) user = await ctx.db.query('users').withIndex('by_email', q => q.eq('email', normalizedEmail)).first();
    }
    if (!user || user.email.trim().toLowerCase() !== normalizedEmail) return null;
    if (user.authTokenIdentifier && user.authTokenIdentifier !== args.tokenIdentifier) return null;
    return {
      phoneNumber: user.phoneNumber ?? null,
      role: user.role,
      isActive: user.isActive !== false,
    };
  },
});

export const beginRequest = internalMutation({
  args: {
    sessionId: v.string(), tokenIdentifier: v.string(), accountEmail: v.string(), deviceId: v.string(),
    codeHash: v.string(), deliveryChannel: v.optional(deliveryChannelValidator), now: v.number(), expiresAt: v.number(),
  },
  returns: v.object({ expiresAt: v.number() }),
  handler: async (ctx, args) => {
    if (!HASH_HEX.test(args.codeHash)) throw new ConvexError('Invalid challenge hash.');
    const existing = await ctx.db.query('deviceAccess').withIndex('by_session_id', q => q.eq('sessionId', args.sessionId)).unique();
    if (existing?.status === 'revoked') {
      throw new ConvexError({ code: 'SESSION_ALREADY_FINAL', message: 'This sign-in session cannot request another approval. Sign out and sign in again.' });
    }
    if (existing?.status === 'approved') {
      const assignment = await ctx.db
        .query('deviceAssignments')
        .withIndex('by_session_id', q => q.eq('sessionId', args.sessionId))
        .unique();
      const assignmentSessionIsActive = assignment?.status === 'active' &&
        !isSessionExpired(assignment.sessionExpiresAt ?? getSessionExpiresAt(assignment.updatedAt), args.now);
      if (assignmentSessionIsActive || existing.expiresAt > args.now) {
        throw new ConvexError({ code: 'SESSION_ALREADY_FINAL', message: 'This approval is already complete or still valid. Finish location approval, or sign out and sign in again.' });
      }
    }
    const windowActive = existing && args.now - existing.requestWindowAt < REQUEST_WINDOW_MS;
    const requestCount = windowActive ? existing.requestCount : 0;
    if (requestCount >= MAX_REQUESTS_PER_WINDOW) {
      throw new ConvexError({ code: 'ACCESS_REQUEST_LIMIT', message: 'Too many code requests. Wait one hour, or sign out and try again later.' });
    }
    if (existing && args.now - existing.requestedAt < RESEND_DELAY_MS) {
      throw new ConvexError({ code: 'ACCESS_RESEND_WAIT', message: 'Wait one minute before requesting another code.' });
    }
    const ownerLimit = await ctx.db.query('deviceAccessLimits').withIndex('by_key', q => q.eq('key', 'ownerInbox')).unique();
    const ownerWindowActive = ownerLimit && args.now - ownerLimit.windowStartAt < REQUEST_WINDOW_MS;
    if (ownerWindowActive && ownerLimit.requestCount >= MAX_APPROVAL_DELIVERIES_PER_HOUR) {
      throw new ConvexError({ code: 'ACCESS_DELIVERY_RATE_LIMIT', message: 'Approval delivery has received many requests. Wait up to one hour, then try again.' });
    }
    if (!ownerLimit) {
      await ctx.db.insert('deviceAccessLimits', { key: 'ownerInbox', windowStartAt: args.now, requestCount: 1 });
    } else if (ownerWindowActive) {
      await ctx.db.patch(ownerLimit._id, { requestCount: ownerLimit.requestCount + 1 });
    } else {
      await ctx.db.patch(ownerLimit._id, { windowStartAt: args.now, requestCount: 1 });
    }
    const values = {
      sessionId: args.sessionId,
      authTokenIdentifier: args.tokenIdentifier,
      accountEmail: args.accountEmail,
      deviceId: args.deviceId,
      codeHash: args.codeHash,
      deliveryChannel: args.deliveryChannel ?? 'email-manual-whatsapp-fallback',
      status: 'pending' as const,
      requestedAt: args.now,
      expiresAt: args.expiresAt,
      attempts: existing?.status === 'pending' ? existing.attempts : 0,
      requestWindowAt: windowActive ? existing.requestWindowAt : args.now,
      requestCount: requestCount + 1,
      lastSentAt: undefined,
      approvedAt: undefined,
    };
    if (existing) await ctx.db.replace(existing._id, values);
    else await ctx.db.insert('deviceAccess', values);
    return { expiresAt: args.expiresAt };
  },
});

export const markNotificationSent = internalMutation({
  args: { sessionId: v.string(), sentAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const record = await ctx.db.query('deviceAccess').withIndex('by_session_id', q => q.eq('sessionId', args.sessionId)).unique();
    if (record?.status === 'pending') await ctx.db.patch(record._id, { lastSentAt: args.sentAt });
    return null;
  },
});

export const markNotificationFailed = internalMutation({
  args: { sessionId: v.string(), now: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const record = await ctx.db.query('deviceAccess').withIndex('by_session_id', q => q.eq('sessionId', args.sessionId)).unique();
    if (record?.status === 'pending' && record.lastSentAt === undefined) {
      await ctx.db.patch(record._id, { status: 'failed', codeHash: '', expiresAt: args.now });
    }
    return null;
  },
});
