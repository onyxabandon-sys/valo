import { initialTickets, userSeed, VEHICLE_RATES } from '../data/seed';
import { isValidVehicleNumber, normalizeVehicleNumber } from './validation';
import { BillableReceipt, BillableTicket, PricedVehicleType, Ticket } from '../types';

export function makeId() {
  const entropy = `${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 12)}`;
  return `t_${entropy}_${Date.now().toString(36)}`;
}

export function nextTicketNumber(count: number) {
  return `1-${String(count + 1).padStart(4, '0')}`;
}

export function createReceiptNumber(organizationCode: string, issuedAt: Date, clientId: string) {
  const date = issuedAt.toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = clientId.replace(/[^a-z0-9]/gi, '').slice(-16).toUpperCase();
  return `${organizationCode.trim().toUpperCase()}-${date}-${suffix}`;
}

export function createTicket(params: {
  vehicleType: PricedVehicleType;
  vehicleNumber: string;
  existingCount: number;
  locationName?: string;
}): BillableTicket {
  const amount = VEHICLE_RATES[params.vehicleType];
  if (!isValidVehicleNumber(params.vehicleNumber)) {
    throw new Error('INVALID_VEHICLE_NUMBER');
  }
  return {
    id: makeId(),
    ticketNumber: nextTicketNumber(params.existingCount),
    vehicleType: params.vehicleType,
    vehicleNumber: normalizeVehicleNumber(params.vehicleNumber),
    amount,
    createdAt: new Date().toISOString(),
    locationName: params.locationName ?? userSeed.locationName,
    paymentStatus: 'paid',
    paymentMethod: 'cash',
  };
}

export function createReceipt(params: { ticket: BillableTicket; organizationCode: string; organizationName?: string }): BillableReceipt {
  const issuedAt = new Date(params.ticket.createdAt);
  const receiptNumber = createReceiptNumber(params.organizationCode, issuedAt, params.ticket.id);

  return {
    id: `receipt_${params.ticket.id}`,
    receiptNumber,
    barcodeValue: receiptNumber,
    organizationCode: params.organizationCode.trim().toUpperCase(),
    organizationName: params.organizationName?.trim() || undefined,
    vehicleNumber: params.ticket.vehicleNumber,
    vehicleType: params.ticket.vehicleType,
    vehicleRate: params.ticket.amount,
    issuedAt: issuedAt.toISOString(),
    printStatus: 'pending',
    reprintCount: 0,
  };
}

export function seedTickets() {
  return [...initialTickets];
}
