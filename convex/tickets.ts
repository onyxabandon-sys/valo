import { paginationOptsValidator, paginationResultValidator } from 'convex/server';
import { mutation, query } from './_generated/server';
import { ConvexError, v } from 'convex/values';
import { isValidVehicleNumber, normalizeVehicleNumber as normalizeCanonicalVehicleNumber } from '../shared/vehicleNumber';
import { matchesClaimedDeviceId } from '../shared/deviceAssignments';
import { shouldIgnorePrintStatusUpdate } from '../shared/receiptStatus';
import { requireLocationAccess, requireLocationUser, requireLocationUserWithAssignment } from './lib/auth';

const RATES = { Bike: 50, Car: 100 } as const;
const vehicleTypeValidator = v.union(v.literal('Bike'), v.literal('Car'));
const storedVehicleTypeValidator = v.union(
  v.literal('Bike'),
  v.literal('Car'),
  v.literal('Commercial Vehicle'),
  v.literal('Bus'),
  v.literal('Heavy Vehicle'),
  v.literal('Tractor'),
);
const printStatusValidator = v.union(v.literal('pending'), v.literal('printed'), v.literal('failed'));
const ticketValidator = v.object({
  _id: v.id('tickets'),
  _creationTime: v.number(),
  clientId: v.string(),
  locationId: v.id('locations'),
  ticketNumber: v.string(),
  vehicleType: storedVehicleTypeValidator,
  vehicleNumber: v.string(),
  amount: v.number(),
  paymentStatus: v.union(v.literal('paid'), v.literal('void')),
  paymentMethod: v.literal('cash'),
  createdAt: v.number(),
  createdByUserId: v.optional(v.id('users')),
});
const receiptValidator = v.object({
  _id: v.id('receipts'),
  _creationTime: v.number(),
  ticketId: v.id('tickets'),
  locationId: v.id('locations'),
  receiptNumber: v.string(),
  customerName: v.optional(v.string()),
  vehicleNumber: v.string(),
  amount: v.number(),
  paymentMethod: v.literal('cash'),
  organizationCode: v.optional(v.string()),
  organizationName: v.optional(v.string()),
  locationName: v.optional(v.string()),
  barcodeValue: v.optional(v.string()),
  vehicleType: v.optional(storedVehicleTypeValidator),
  printStatus: v.optional(printStatusValidator),
  reprintCount: v.optional(v.number()),
  operatorName: v.optional(v.string()),
  paymentStatus: v.optional(v.union(v.literal('paid'), v.literal('void'))),
  issuedAt: v.number(),
  issuedByUserId: v.optional(v.id('users')),
  deviceId: v.optional(v.string()),
  accountEmail: v.optional(v.string()),
});

function validateTimeWindow(from: number, to: number) {
  const maximumWindowMs = 31 * 24 * 60 * 60_000;
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from >= to || to - from > maximumWindowMs) {
    throw new ConvexError({ code: 'INVALID_TIME_WINDOW', message: 'Choose a valid report period of no more than 31 days.' });
  }
}

function normalizeVehicleNumber(value: string) {
  if (!isValidVehicleNumber(value)) {
    throw new ConvexError({ code: 'INVALID_VEHICLE_NUMBER', message: 'Enter a valid vehicle number.' });
  }
  return normalizeCanonicalVehicleNumber(value);
}

function makeReceiptNumber(organizationCode: string, createdAt: number, clientId: string) {
  const date = new Date(createdAt).toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = clientId.replace(/[^a-z0-9]/gi, '').slice(-16).toUpperCase();
  return `${organizationCode.trim().toUpperCase()}-${date}-${suffix}`;
}

export const createTicket = mutation({
  args: {
    clientId: v.string(),
    vehicleType: vehicleTypeValidator,
    vehicleNumber: v.string(),
    receiptNumber: v.string(),
    issuedAt: v.number(),
    printStatus: printStatusValidator,
    reprintCount: v.number(),
    deviceId: v.optional(v.string()),
  },
  returns: v.object({
    ticketId: v.id('tickets'),
    receiptId: v.id('receipts'),
    clientId: v.string(),
    ticketNumber: v.string(),
    receiptNumber: v.string(),
    barcodeValue: v.string(),
    organizationCode: v.string(),
    vehicleType: vehicleTypeValidator,
    vehicleNumber: v.string(),
    vehicleRate: v.number(),
    issuedAt: v.number(),
  }),
  handler: async (ctx, args) => {
    if (!/^[A-Za-z0-9_-]{8,96}$/.test(args.clientId)) {
      throw new ConvexError({ code: 'INVALID_CLIENT_ID', message: 'Receipt request identifier is invalid.' });
    }
    const { identity, user, assignment, locationId } = await requireLocationUserWithAssignment(ctx);
    if (!matchesClaimedDeviceId(args.deviceId, assignment.deviceId)) {
      throw new ConvexError({ code: 'UNAUTHORIZED_DEVICE', message: 'This receipt does not match the approved device.' });
    }
    const accountEmail = identity.email?.trim().toLowerCase() ?? user.email.trim().toLowerCase();
    const location = await ctx.db.get('locations', locationId);
    if (!location?.organizationCode) {
      throw new ConvexError({ code: 'ORGANIZATION_CODE_REQUIRED', message: 'The location is missing an organization code.' });
    }
    const existing = await ctx.db
      .query('tickets')
      .withIndex('by_client_id', q => q.eq('clientId', args.clientId))
      .first();

    if (existing) {
      const receipt = await ctx.db
        .query('receipts')
        .withIndex('by_ticket', q => q.eq('ticketId', existing._id))
        .unique();
      if (!receipt?.organizationCode || !receipt.barcodeValue || !receipt.vehicleType) {
        throw new ConvexError({ code: 'INCOMPLETE_RECEIPT', message: 'The existing receipt requires migration.' });
      }
      if (
        existing.locationId !== locationId ||
        existing.createdByUserId !== user._id ||
        receipt.deviceId !== assignment.deviceId ||
        existing.vehicleType !== args.vehicleType ||
        existing.vehicleNumber !== normalizeVehicleNumber(args.vehicleNumber) ||
        receipt.receiptNumber !== args.receiptNumber ||
        receipt.issuedAt !== args.issuedAt
      ) {
        throw new ConvexError({ code: 'IDEMPOTENCY_CONFLICT', message: 'The client ID is already assigned to a different receipt.' });
      }
      return {
        ticketId: existing._id,
        receiptId: receipt._id,
        clientId: existing.clientId,
        ticketNumber: existing.ticketNumber,
        receiptNumber: receipt.receiptNumber,
        barcodeValue: receipt.barcodeValue,
        organizationCode: receipt.organizationCode,
        vehicleType: receipt.vehicleType,
        vehicleNumber: receipt.vehicleNumber,
        vehicleRate: receipt.amount,
        issuedAt: receipt.issuedAt,
      };
    }

    const now = Date.now();
    if (!Number.isSafeInteger(args.issuedAt) || args.issuedAt > now + 5 * 60_000 || args.issuedAt < now - 90 * 24 * 60 * 60_000) {
      throw new ConvexError({ code: 'INVALID_ISSUED_AT', message: 'Receipt timestamp is outside the accepted synchronization window.' });
    }
    if (!Number.isSafeInteger(args.reprintCount) || args.reprintCount < 0 || args.reprintCount > 100) {
      throw new ConvexError({ code: 'INVALID_REPRINT_COUNT', message: 'Receipt reprint count is invalid.' });
    }
    const createdAt = args.issuedAt;
    const vehicleNumber = normalizeVehicleNumber(args.vehicleNumber);
    const organizationCode = location.organizationCode.trim().toUpperCase();
    const receiptNumber = makeReceiptNumber(organizationCode, createdAt, args.clientId);
    if (args.receiptNumber !== receiptNumber) {
      throw new ConvexError({ code: 'INVALID_RECEIPT_NUMBER', message: 'Receipt number does not match its organization, timestamp, and client ID.' });
    }
    const amount = RATES[args.vehicleType];
    const ticketId = await ctx.db.insert('tickets', {
      clientId: args.clientId,
      locationId,
      vehicleType: args.vehicleType,
      createdByUserId: user._id,
      ticketNumber: receiptNumber,
      vehicleNumber,
      amount,
      paymentStatus: 'paid',
      paymentMethod: 'cash',
      createdAt,
    });
    const receiptId = await ctx.db.insert('receipts', {
      ticketId,
      locationId,
      receiptNumber,
      organizationCode,
      organizationName: location.organizationName ?? location.name,
      locationName: location.name,
      barcodeValue: receiptNumber,
      vehicleNumber,
      vehicleType: args.vehicleType,
      amount,
      paymentMethod: 'cash',
      printStatus: args.printStatus,
      reprintCount: args.reprintCount,
      operatorName: user.name,
      paymentStatus: 'paid',
      issuedAt: createdAt,
      issuedByUserId: user._id,
      deviceId: assignment.deviceId,
      accountEmail,
    });
    return {
      ticketId,
      receiptId,
      clientId: args.clientId,
      ticketNumber: receiptNumber,
      receiptNumber,
      barcodeValue: receiptNumber,
      organizationCode,
      vehicleType: args.vehicleType,
      vehicleNumber,
      vehicleRate: amount,
      issuedAt: createdAt,
    };
  },
});

export const updateReceiptPrintStatus = mutation({
  args: {
    clientId: v.string(),
    printStatus: printStatusValidator,
    reprintCount: v.number(),
  },
  returns: v.object({ success: v.literal(true) }),
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.reprintCount) || args.reprintCount < 0 || args.reprintCount > 100) {
      throw new ConvexError({ code: 'INVALID_REPRINT_COUNT', message: 'Receipt reprint count is invalid.' });
    }
    const { user, assignment, locationId } = await requireLocationUserWithAssignment(ctx);
    const ticket = await ctx.db.query('tickets').withIndex('by_client_id', q => q.eq('clientId', args.clientId)).unique();
    if (!ticket || ticket.locationId !== locationId || ticket.createdByUserId !== user._id) {
      throw new ConvexError({ code: 'UNAUTHORIZED_RECEIPT', message: 'The receipt is unavailable for this user and location.' });
    }
    const receipt = await ctx.db.query('receipts').withIndex('by_ticket', q => q.eq('ticketId', ticket._id)).unique();
    if (!receipt) throw new ConvexError({ code: 'RECEIPT_NOT_FOUND', message: 'Receipt not found.' });
    if (receipt.deviceId !== assignment.deviceId) {
      throw new ConvexError({ code: 'UNAUTHORIZED_DEVICE', message: 'This receipt does not belong to the approved device.' });
    }
    if (shouldIgnorePrintStatusUpdate(receipt.printStatus, args.printStatus)) {
      return { success: true as const };
    }
    if (args.reprintCount < (receipt.reprintCount ?? 0)) {
      throw new ConvexError({ code: 'STALE_PRINT_STATUS', message: 'Receipt print status is older than the stored record.' });
    }
    await ctx.db.patch(receipt._id, { printStatus: args.printStatus, reprintCount: args.reprintCount });
    return { success: true as const };
  },
});

export const getTicketByClientId = query({
  args: { clientId: v.string() },
  returns: v.union(ticketValidator, v.null()),
  handler: async (ctx, args) => {
    const { locationId } = await requireLocationUser(ctx);
    const ticket = await ctx.db
      .query('tickets')
      .withIndex('by_client_id', q => q.eq('clientId', args.clientId))
      .first();
    if (ticket?.locationId === locationId) return ticket;

    return await ctx.db
      .query('tickets')
      .withIndex('by_ticket_number', q => q.eq('locationId', locationId).eq('ticketNumber', args.clientId))
      .unique();
  },
});

export const listTodayTickets = query({
  args: {
    locationId: v.id('locations'),
    from: v.number(),
    to: v.number(),
  },
  returns: v.array(ticketValidator),
  handler: async (ctx, args) => {
    validateTimeWindow(args.from, args.to);
    const { locationId } = await requireLocationAccess(ctx, args.locationId);
    const tickets = await ctx.db
      .query('tickets')
      .withIndex('by_location_and_date', q => q.eq('locationId', locationId).gte('createdAt', args.from).lt('createdAt', args.to))
      .take(501);
    if (tickets.length > 500) {
      throw new ConvexError({ code: 'TICKET_PAGE_REQUIRED', message: 'This period has more than 500 tickets. Use the paginated ticket history query.' });
    }
    return tickets;
  },
});

export const listTodayTicketPage = query({
  args: {
    from: v.number(),
    to: v.number(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(ticketValidator),
  handler: async (ctx, args) => {
    validateTimeWindow(args.from, args.to);
    const { locationId } = await requireLocationUser(ctx);
    return await ctx.db
      .query('tickets')
      .withIndex('by_location_and_date', q => q.eq('locationId', locationId).gte('createdAt', args.from).lt('createdAt', args.to))
      .paginate(args.paginationOpts);
  },
});

export const listReceipts = query({
  args: {},
  returns: v.array(receiptValidator),
  handler: async ctx => {
    const { locationId } = await requireLocationUser(ctx);
    const receipts = await ctx.db
      .query('receipts')
      .withIndex('by_location_and_issued_at', q => q.eq('locationId', locationId))
      .order('desc')
      .take(50);
    return receipts.map(({ deviceLocation: _privateLocation, ...receipt }) => receipt);
  },
});
