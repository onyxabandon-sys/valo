import { paginationOptsValidator, paginationResultValidator } from 'convex/server';
import { action, internalMutation, internalQuery, mutation, query } from './_generated/server';
import { ConvexError, v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { addPrintedReceiptPage, assertLegacyReportCandidateCount, assertSnapshotPageLimit, isReceiptInReportScope, isWithinRollingReportWindow, makeRollingReportWindow, REPORT_WINDOW_MS, SNAPSHOT_MAX_CANDIDATES, SNAPSHOT_PAGE_SIZE } from '../shared/reportSnapshots';
import { requireApprovedIdentity, requireLocationUser } from './lib/auth';

const DAY_MS = REPORT_WINDOW_MS;
const vehicleTypeValidator = v.union(
  v.literal('Bike'),
  v.literal('Car'),
  v.literal('Commercial Vehicle'),
  v.literal('Bus'),
  v.literal('Heavy Vehicle'),
  v.literal('Tractor'),
);
const paymentStatusValidator = v.union(v.literal('paid'), v.literal('void'));
const reportRowValidator = v.object({
  receiptNumber: v.string(),
  barcodeValue: v.string(),
  organizationCode: v.string(),
  organizationName: v.string(),
  locationName: v.string(),
  vehicleNumber: v.string(),
  vehicleType: vehicleTypeValidator,
  vehicleRate: v.number(),
  issuedAt: v.number(),
  operatorName: v.string(),
  paymentMethod: v.literal('cash'),
  paymentStatus: paymentStatusValidator,
  printStatus: v.literal('printed'),
  syncStatus: v.literal('synced'),
  reprintCount: v.number(),
});

const reportSnapshotValidator = v.object({
  _id: v.id('reportSnapshots'),
  _creationTime: v.number(),
  locationId: v.id('locations'),
  reportDate: v.string(),
  ticketCount: v.number(),
  receiptCount: v.number(),
  cashRevenue: v.number(),
  generatedAt: v.number(),
  generatedByUserId: v.optional(v.id('users')),
  deviceId: v.optional(v.string()),
  requestId: v.optional(v.string()),
  startAt: v.optional(v.number()),
  endAt: v.optional(v.number()),
  printedReceiptCount: v.optional(v.number()),
  snapshotStatus: v.optional(v.union(v.literal('building'), v.literal('complete'), v.literal('failed'))),
});

const snapshotSummaryValidator = v.object({
  _id: v.id('reportSnapshots'),
  reportDate: v.string(),
  startAt: v.number(),
  endAt: v.number(),
  requestId: v.string(),
  generatedAt: v.number(),
  printedReceiptCount: v.number(),
  cashRevenue: v.number(),
});

function validateReportWindow(from: number, to: number) {
  const maximumWindowMs = 31 * DAY_MS;
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from >= to || to - from > maximumWindowMs) {
    throw new ConvexError({ code: 'INVALID_TIME_WINDOW', message: 'Choose a valid report period of no more than 31 days.' });
  }
}

function assertRequestId(requestId: string) {
  if (!/^[A-Za-z0-9_-]{12,100}$/.test(requestId)) {
    throw new ConvexError({ code: 'INVALID_REQUEST_ID', message: 'The report request could not be identified. Retry the request.' });
  }
}

function asSnapshotSummary(snapshot: {
  _id: Id<'reportSnapshots'>;
  reportDate: string;
  startAt?: number;
  endAt?: number;
  generatedAt: number;
  requestId?: string;
  printedReceiptCount?: number;
  receiptCount: number;
  cashRevenue: number;
}) {
  return {
    _id: snapshot._id,
    reportDate: snapshot.reportDate,
    startAt: snapshot.startAt ?? snapshot.generatedAt - DAY_MS,
    endAt: snapshot.endAt ?? snapshot.generatedAt,
    requestId: snapshot.requestId ?? '',
    generatedAt: snapshot.generatedAt,
    printedReceiptCount: snapshot.printedReceiptCount ?? snapshot.receiptCount,
    cashRevenue: snapshot.cashRevenue,
  };
}

/**
 * Legacy daily report API retained for callers that still use it. New mobile
 * reports use saved rolling snapshots so report history cannot shift later.
 */
export const getDailyReport = query({
  args: {
    from: v.number(),
    to: v.number(),
    deviceId: v.optional(v.string()),
  },
  returns: v.object({
    count: v.number(),
    revenue: v.number(),
    rows: v.array(reportRowValidator),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    validateReportWindow(args.from, args.to);
    const { user, locationId } = await requireLocationUser(ctx);
    const identity = await requireApprovedIdentity(ctx);
    const sessionId = identity.sessionId;
    const assignment = typeof sessionId === 'string'
      ? await ctx.db.query('deviceAssignments').withIndex('by_session_id', q => q.eq('sessionId', sessionId)).unique()
      : null;
    if (!assignment || assignment.status !== 'active' || assignment.locationId !== locationId) {
      throw new ConvexError({ code: 'DEVICE_ACCESS_REQUIRED', message: 'Complete device approval before viewing reports.' });
    }
    if (args.deviceId && args.deviceId !== assignment.deviceId) {
      throw new ConvexError({ code: 'UNAUTHORIZED_DEVICE', message: 'You can only view reports for this approved device.' });
    }

    const [location, receiptCandidates] = await Promise.all([
      ctx.db.get('locations', locationId),
      ctx.db.query('receipts')
        .withIndex('by_location_and_issued_at', q => q
          .eq('locationId', locationId)
          .gte('issuedAt', args.from)
          .lt('issuedAt', args.to))
        .take(2001),
    ]);
    try {
      assertLegacyReportCandidateCount(receiptCandidates.length);
    } catch (error) {
      if (error instanceof RangeError && error.message === 'REPORT_TOO_LARGE') {
        throw new ConvexError({ code: 'REPORT_TOO_LARGE', message: 'This location has too many receipts in the requested period for this legacy report. Use the saved rolling report.' });
      }
      throw error;
    }
    const receiptScope = { userId: user._id, deviceId: assignment.deviceId, locationId, startAt: args.from, endAt: args.to };
    const receiptMatches = receiptCandidates.filter(receipt => isReceiptInReportScope(receipt, receiptScope));
    let reportTotals: ReturnType<typeof addPrintedReceiptPage>;
    try {
      reportTotals = addPrintedReceiptPage(
        { count: 0, revenueCents: 0 },
        receiptMatches.map(receipt => ({ amount: receipt.amount, printStatus: 'printed' as const })),
      );
    } catch (error) {
      if (error instanceof RangeError && error.message === 'INVALID_RECEIPT_AMOUNT') {
        throw new ConvexError({ code: 'INVALID_RECEIPT_AMOUNT', message: 'A receipt amount is invalid, so the report could not be calculated.' });
      }
      if (error instanceof RangeError && error.message === 'REPORT_TOO_LARGE') {
        throw new ConvexError({ code: 'REPORT_TOO_LARGE', message: 'This report is too large to calculate safely. Use the saved rolling report.' });
      }
      throw error;
    }
    const truncated = receiptMatches.length > 500;
    const receipts = receiptMatches.slice(0, 500);
    const rows = await Promise.all(receipts.map(async receipt => {
      const ticket = receipt.vehicleType && receipt.operatorName && receipt.paymentStatus
        ? null
        : await ctx.db.get('tickets', receipt.ticketId);
      const vehicleType = receipt.vehicleType ?? ticket?.vehicleType;
      if (!vehicleType) return null;
      const operator = receipt.operatorName || !receipt.issuedByUserId ? null : await ctx.db.get('users', receipt.issuedByUserId);
      return {
        receiptNumber: receipt.receiptNumber,
        barcodeValue: receipt.barcodeValue ?? ticket?.clientId ?? receipt.receiptNumber,
        organizationCode: receipt.organizationCode ?? location?.organizationCode ?? 'UNASSIGNED',
        organizationName: receipt.organizationName ?? location?.organizationName ?? location?.name ?? 'Unknown organization',
        locationName: receipt.locationName ?? location?.name ?? 'Unknown location',
        vehicleNumber: receipt.vehicleNumber,
        vehicleType,
        vehicleRate: receipt.amount,
        issuedAt: receipt.issuedAt,
        operatorName: receipt.operatorName ?? operator?.name ?? 'Unknown operator',
        paymentMethod: 'cash' as const,
        paymentStatus: receipt.paymentStatus ?? ticket?.paymentStatus ?? ('paid' as const),
        printStatus: 'printed' as const,
        syncStatus: 'synced' as const,
        reprintCount: receipt.reprintCount ?? 0,
      };
    }));
    const validRows = rows.filter((row): row is NonNullable<typeof row> => row !== null);
    return {
      count: reportTotals.count,
      revenue: reportTotals.revenueCents / 100,
      rows: validRows,
      truncated: truncated || validRows.length < receipts.length,
    };
  },
});

export const listMyReportSnapshots = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(reportSnapshotValidator),
  handler: async (ctx, args) => {
    const { user, locationId } = await requireLocationUser(ctx);
    const identity = await requireApprovedIdentity(ctx);
    const sessionId = identity.sessionId;
    const assignment = typeof sessionId === 'string'
      ? await ctx.db.query('deviceAssignments').withIndex('by_session_id', q => q.eq('sessionId', sessionId)).unique()
      : null;
    if (!assignment || assignment.status !== 'active' || assignment.locationId !== locationId) {
      throw new ConvexError({ code: 'DEVICE_ACCESS_REQUIRED', message: 'Complete device approval before viewing report history.' });
    }
    return await ctx.db.query('reportSnapshots')
      .withIndex('by_user_device_location_and_generated_at', q => q
        .eq('generatedByUserId', user._id)
        .eq('deviceId', assignment.deviceId)
        .eq('locationId', locationId))
      .filter(q => q.and(
        q.neq(q.field('snapshotStatus'), 'building'),
        q.neq(q.field('snapshotStatus'), 'failed'),
      ))
      .order('desc')
      .paginate(args.paginationOpts);
  },
});

export const listReportSnapshots = query({
  args: {},
  returns: v.array(reportSnapshotValidator),
  handler: async ctx => {
    const { user, locationId } = await requireLocationUser(ctx);
    const identity = await requireApprovedIdentity(ctx);
    const sessionId = identity.sessionId;
    const assignment = typeof sessionId === 'string'
      ? await ctx.db.query('deviceAssignments').withIndex('by_session_id', q => q.eq('sessionId', sessionId)).unique()
      : null;
    if (!assignment || assignment.status !== 'active' || assignment.locationId !== locationId) {
      throw new ConvexError({ code: 'DEVICE_ACCESS_REQUIRED', message: 'Complete device approval before viewing report history.' });
    }
    return await ctx.db.query('reportSnapshots')
      .withIndex('by_user_device_location_and_generated_at', q => q
        .eq('generatedByUserId', user._id)
        .eq('deviceId', assignment.deviceId)
        .eq('locationId', locationId))
      .filter(q => q.and(
        q.neq(q.field('snapshotStatus'), 'building'),
        q.neq(q.field('snapshotStatus'), 'failed'),
      ))
      .order('desc')
      .take(30);
  },
});

type SnapshotScope = {
  userId: Id<'users'>;
  locationId: Id<'locations'>;
  deviceId: string;
  sessionId: string;
  tokenIdentifier: string;
};

async function findSnapshotScope(ctx: QueryCtx | MutationCtx, tokenIdentifier: string, sessionId: string): Promise<SnapshotScope> {
  const access = await ctx.db.query('deviceAccess').withIndex('by_session_id', q => q.eq('sessionId', sessionId)).unique();
  const assignment = await ctx.db.query('deviceAssignments').withIndex('by_session_id', q => q.eq('sessionId', sessionId)).unique();
  const user = await ctx.db.query('users').withIndex('by_auth_token_identifier', q => q.eq('authTokenIdentifier', tokenIdentifier)).unique();
  if (
    !access || access.authTokenIdentifier !== tokenIdentifier || access.status !== 'approved' ||
    !assignment || assignment.status !== 'active' || assignment.deviceId !== access.deviceId ||
    !user || user.role !== 'attendant' || user.isActive === false || !user.locationId || user.locationId !== assignment.locationId
  ) {
    throw new ConvexError({ code: 'DEVICE_ACCESS_REQUIRED', message: 'Complete device approval before creating a report.' });
  }
  return { userId: user._id, locationId: user.locationId, deviceId: assignment.deviceId, sessionId, tokenIdentifier };
}

export const getSnapshotScope = internalQuery({
  args: { tokenIdentifier: v.string(), sessionId: v.string() },
  handler: async (ctx, args) => await findSnapshotScope(ctx, args.tokenIdentifier, args.sessionId),
});

const snapshotScopeValidator = v.object({
  userId: v.id('users'),
  locationId: v.id('locations'),
  deviceId: v.string(),
  sessionId: v.string(),
  tokenIdentifier: v.string(),
});

export const beginRollingSnapshot = mutation({
  args: { deviceId: v.string(), requestId: v.string() },
  returns: snapshotSummaryValidator,
  handler: async (ctx, args): Promise<ReturnType<typeof asSnapshotSummary>> => {
    assertRequestId(args.requestId);
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || typeof identity.sessionId !== 'string') {
      throw new ConvexError({ code: 'UNAUTHENTICATED', message: 'Sign in again to create a report.' });
    }
    const scope = await findSnapshotScope(ctx, identity.tokenIdentifier, identity.sessionId);
    if (args.deviceId !== scope.deviceId) {
      throw new ConvexError({ code: 'UNAUTHORIZED_DEVICE', message: 'This report request does not match the approved device.' });
    }
    const existing = await ctx.db.query('reportSnapshots')
      .withIndex('by_user_device_and_request_id', q => q
        .eq('generatedByUserId', scope.userId)
        .eq('deviceId', scope.deviceId)
        .eq('requestId', args.requestId))
      .unique();
    if (existing && existing.locationId !== scope.locationId) {
      throw new ConvexError({ code: 'IDEMPOTENCY_CONFLICT', message: 'This report request belongs to another location.' });
    }
    const { startAt, endAt } = makeRollingReportWindow(Date.now());
    if (existing && existing.snapshotStatus !== 'failed' && (existing.snapshotStatus !== 'building' || endAt - existing.generatedAt < DAY_MS)) {
      return asSnapshotSummary(existing);
    }
    if (existing) {
      await ctx.db.patch(existing._id, {
        reportDate: new Date(endAt).toISOString().slice(0, 10),
        ticketCount: 0,
        receiptCount: 0,
        printedReceiptCount: 0,
        cashRevenue: 0,
        generatedAt: endAt,
        startAt,
        endAt,
        snapshotStatus: 'building',
      });
      const restarted = await ctx.db.get(existing._id);
      if (!restarted) throw new ConvexError({ code: 'SNAPSHOT_SAVE_FAILED', message: 'The report could not be started. Retry the request.' });
      return asSnapshotSummary(restarted);
    }

    const recentSnapshots = await ctx.db.query('reportSnapshots')
      .withIndex('by_user_device_location_and_generated_at', q => q
        .eq('generatedByUserId', scope.userId)
        .eq('deviceId', scope.deviceId)
        .eq('locationId', scope.locationId))
      .order('desc')
      .take(50);
    const inProgress = recentSnapshots.find(snapshot => snapshot.snapshotStatus === 'building');
    if (inProgress && endAt - inProgress.generatedAt < DAY_MS) return asSnapshotSummary(inProgress);
    if (inProgress) await ctx.db.patch(inProgress._id, { snapshotStatus: 'failed' });

    const snapshotId = await ctx.db.insert('reportSnapshots', {
      locationId: scope.locationId,
      reportDate: new Date(endAt).toISOString().slice(0, 10),
      ticketCount: 0,
      receiptCount: 0,
      printedReceiptCount: 0,
      cashRevenue: 0,
      generatedAt: endAt,
      generatedByUserId: scope.userId,
      deviceId: scope.deviceId,
      requestId: args.requestId,
      startAt,
      endAt,
      snapshotStatus: 'building',
    });
    const snapshot = await ctx.db.get(snapshotId);
    if (!snapshot) throw new ConvexError({ code: 'SNAPSHOT_SAVE_FAILED', message: 'The report could not be started. Retry the request.' });
    return asSnapshotSummary(snapshot);
  },
});

export const findSnapshotRequest = internalQuery({
  args: { userId: v.id('users'), deviceId: v.string(), locationId: v.id('locations'), requestId: v.string() },
  returns: v.union(reportSnapshotValidator, v.null()),
  handler: async (ctx, args) => {
    const snapshot = await ctx.db.query('reportSnapshots')
      .withIndex('by_user_device_and_request_id', q => q
        .eq('generatedByUserId', args.userId)
        .eq('deviceId', args.deviceId)
        .eq('requestId', args.requestId))
      .unique();
    if (snapshot && snapshot.locationId !== args.locationId) {
      throw new ConvexError({ code: 'IDEMPOTENCY_CONFLICT', message: 'This report request belongs to another location.' });
    }
    return snapshot;
  },
});

export const pagePrintedReceipts = internalQuery({
  args: {
    scope: snapshotScopeValidator,
    startAt: v.number(),
    endAt: v.number(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(v.object({
    amount: v.number(),
    locationId: v.id('locations'),
    issuedAt: v.number(),
    printStatus: v.literal('printed'),
  })),
  handler: async (ctx, args) => {
    await findSnapshotScope(ctx, args.scope.tokenIdentifier, args.scope.sessionId);
    return await ctx.db.query('receipts')
      .withIndex('by_location_and_issued_at', q => q
        .eq('locationId', args.scope.locationId)
        .gte('issuedAt', args.startAt)
        .lt('issuedAt', args.endAt))
      .paginate(args.paginationOpts)
      .then(result => ({
        ...result,
        page: result.page
          .filter(receipt => isReceiptInReportScope(receipt, { ...args.scope, startAt: args.startAt, endAt: args.endAt }))
          .map(receipt => ({ amount: receipt.amount, locationId: receipt.locationId, issuedAt: receipt.issuedAt, printStatus: 'printed' as const })),
      }));
  },
});

export const storeSnapshot = internalMutation({
  args: {
    scope: snapshotScopeValidator,
    snapshotId: v.id('reportSnapshots'),
    startAt: v.number(),
    endAt: v.number(),
    printedReceiptCount: v.number(),
    cashRevenue: v.number(),
  },
  returns: reportSnapshotValidator,
  handler: async (ctx, args) => {
    await findSnapshotScope(ctx, args.scope.tokenIdentifier, args.scope.sessionId);
    const existing = await ctx.db.get(args.snapshotId);
    if (!existing || existing.generatedByUserId !== args.scope.userId || existing.deviceId !== args.scope.deviceId || existing.locationId !== args.scope.locationId) {
      throw new ConvexError({ code: 'SNAPSHOT_NOT_FOUND', message: 'This report request is no longer available. Start a new report.' });
    }
    if (existing.snapshotStatus === 'complete') return existing;
    if (existing.snapshotStatus !== 'building' || existing.startAt !== args.startAt || existing.endAt !== args.endAt) {
      throw new ConvexError({ code: 'INVALID_SNAPSHOT', message: 'The report request is invalid. Start a new report.' });
    }
    if (
      !Number.isSafeInteger(args.startAt) || !Number.isSafeInteger(args.endAt) || args.endAt - args.startAt !== DAY_MS ||
      !Number.isSafeInteger(args.printedReceiptCount) || args.printedReceiptCount < 0 ||
      !Number.isFinite(args.cashRevenue) || args.cashRevenue < 0
    ) {
      throw new ConvexError({ code: 'INVALID_SNAPSHOT', message: 'The report could not be saved. Retry the request.' });
    }
    await ctx.db.patch(args.snapshotId, {
      ticketCount: args.printedReceiptCount,
      receiptCount: args.printedReceiptCount,
      printedReceiptCount: args.printedReceiptCount,
      cashRevenue: args.cashRevenue,
      snapshotStatus: 'complete',
    });
    const saved = await ctx.db.get(args.snapshotId);
    if (!saved) throw new ConvexError({ code: 'SNAPSHOT_SAVE_FAILED', message: 'The report could not be saved. Retry the request.' });
    return saved;
  },
});

export const createRollingSnapshot = action({
  args: { deviceId: v.string(), requestId: v.string() },
  returns: snapshotSummaryValidator,
  handler: async (ctx, args): Promise<ReturnType<typeof asSnapshotSummary>> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || typeof identity.sessionId !== 'string') {
      throw new ConvexError({ code: 'UNAUTHENTICATED', message: 'Sign in again to create a report.' });
    }
    assertRequestId(args.requestId);
    const scope: SnapshotScope = await ctx.runQuery(internal.reports.getSnapshotScope, {
      tokenIdentifier: identity.tokenIdentifier,
      sessionId: identity.sessionId,
    });
    if (args.deviceId !== scope.deviceId) {
      throw new ConvexError({ code: 'UNAUTHORIZED_DEVICE', message: 'This report request does not match the approved device.' });
    }
    const existing: Doc<'reportSnapshots'> | null = await ctx.runQuery(internal.reports.findSnapshotRequest, {
      userId: scope.userId,
      deviceId: scope.deviceId,
      locationId: scope.locationId,
      requestId: args.requestId,
    });
    if (!existing) {
      throw new ConvexError({ code: 'REPORT_REQUEST_MISSING', message: 'Start a new report and retry.' });
    }
    if (existing.snapshotStatus === 'complete') return asSnapshotSummary(existing);
    const startAt = existing.startAt;
    const endAt = existing.endAt;
    if (existing.snapshotStatus !== 'building' || typeof startAt !== 'number' || typeof endAt !== 'number' || !Number.isSafeInteger(startAt) || !Number.isSafeInteger(endAt) || endAt - startAt !== DAY_MS) {
      throw new ConvexError({ code: 'INVALID_SNAPSHOT', message: 'The report request is invalid. Start a new report.' });
    }
    let cursor: string | null = null;
    let totals = { count: 0, revenueCents: 0 };
    let isDone = false;
    let pageCount = 0;
    while (!isDone) {
      const page: { page: Array<{ amount: number; printStatus: 'printed' }>; isDone: boolean; continueCursor: string } = await ctx.runQuery(internal.reports.pagePrintedReceipts, {
        scope,
        startAt,
        endAt,
        paginationOpts: { numItems: SNAPSHOT_PAGE_SIZE, cursor },
      });
      pageCount += 1;
      try {
        assertSnapshotPageLimit(pageCount, page.isDone);
      } catch {
        throw new ConvexError({ code: 'REPORT_TOO_LARGE', message: `This location has more than ${SNAPSHOT_MAX_CANDIDATES.toLocaleString()} receipts in the requested 24-hour period. The report was not saved; contact an administrator.` });
      }
      try {
        totals = addPrintedReceiptPage(totals, page.page);
      } catch (error) {
        if (error instanceof Error && error.message === 'INVALID_RECEIPT_AMOUNT') {
          throw new ConvexError({ code: 'INVALID_RECEIPT_AMOUNT', message: 'A receipt amount is invalid, so the report was not saved.' });
        }
        throw new ConvexError({ code: 'REPORT_TOO_LARGE', message: 'This report is too large to calculate safely. Contact an administrator.' });
      }
      isDone = page.isDone;
      cursor = page.continueCursor;
    }
    const saved: Doc<'reportSnapshots'> = await ctx.runMutation(internal.reports.storeSnapshot, {
      scope,
      snapshotId: existing._id,
      startAt,
      endAt,
      printedReceiptCount: totals.count,
      cashRevenue: totals.revenueCents / 100,
    });
    return asSnapshotSummary(saved);
  },
});
