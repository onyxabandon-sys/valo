import { NativeModules } from 'react-native';
import { BillableReceipt, BillableTicket, PricedVehicleType, Receipt, User } from '../types';

export type StoredReceipt = BillableReceipt & {
  clientId: string;
  organizationName: string;
  locationId: string;
  locationName: string;
  operatorId: string;
  operatorName: string;
  paymentMethod: 'cash';
  paymentStatus: 'paid';
  syncStatus: 'pending' | 'synced' | 'failed';
  reprintCount: number;
  deviceId: string;
  accountEmail: string;
};

type NativeValetDatabase = {
  saveSession(deviceId: string, accountEmail: string, isLoggedIn: boolean): Promise<{ success: boolean }>;
  clearStoredReceiptLocations(): Promise<{ success: boolean }>;
  saveReceipt(payload: StoredReceiptPayload): Promise<{ success: boolean }>;
  listPendingReceipts(locationId: string, operatorId: string, deviceId: string, accountEmail: string, limit: number): Promise<StoredReceiptPayload[]>;
  listReceipts(locationId: string, operatorId: string, deviceId: string, accountEmail: string, from: string, to: string, limit: number): Promise<StoredReceiptPayload[]>;
  markSynced(receiptId: string, ticketId: string, canonicalReceiptId: string): Promise<{ success: boolean }>;
  markSyncFailed(receiptId: string, message: string): Promise<{ success: boolean }>;
  updatePrintStatus(receiptId: string, status: Receipt['printStatus'], isReprint: boolean): Promise<{ success: boolean }>;
};

export type StoredReceiptPayload = {
  receiptId: string;
  clientId: string;
  receiptNumber: string;
  barcodeValue: string;
  organizationCode: string;
  organizationName: string;
  locationId: string;
  locationName: string;
  vehicleNumber: string;
  vehicleType: PricedVehicleType;
  vehicleRate: number;
  issuedAt: string;
  operatorId: string;
  operatorName: string;
  deviceId: string;
  accountEmail: string;
  paymentMethod: 'cash';
  paymentStatus: 'paid';
  printStatus: Receipt['printStatus'];
  syncStatus: StoredReceipt['syncStatus'];
  reprintCount: number;
};

const nativeDatabase = NativeModules.ValetDatabase as NativeValetDatabase | undefined;
const fallbackReceipts = new Map<string, StoredReceiptPayload>();
const fallbackSessions = new Map<string, { deviceId: string; accountEmail: string; isLoggedIn: boolean; lastActivityTimestamp: number }>();

const fallbackDatabase: NativeValetDatabase = {
  async saveSession(deviceId, accountEmail, isLoggedIn) {
    fallbackSessions.set(`${deviceId}:${accountEmail}`, { deviceId, accountEmail, isLoggedIn, lastActivityTimestamp: Date.now() });
    return { success: true };
  },
  async clearStoredReceiptLocations() {
    return { success: true };
  },
  async saveReceipt(payload) {
    if (!fallbackReceipts.has(payload.receiptId)) fallbackReceipts.set(payload.receiptId, payload);
    return { success: true };
  },
  async listPendingReceipts(locationId, operatorId, deviceId, accountEmail, limit) {
    return [...fallbackReceipts.values()]
      .filter(receipt => receipt.locationId === locationId && receipt.operatorId === operatorId && receipt.deviceId === deviceId && receipt.accountEmail === accountEmail && receipt.syncStatus !== 'synced')
      .sort((left, right) => Number(left.syncStatus !== 'pending') - Number(right.syncStatus !== 'pending'))
      .slice(0, limit);
  },
  async listReceipts(locationId, operatorId, deviceId, accountEmail, from, to, limit) {
    return [...fallbackReceipts.values()]
      .filter(receipt => receipt.locationId === locationId && receipt.operatorId === operatorId && receipt.deviceId === deviceId && receipt.accountEmail === accountEmail && receipt.issuedAt >= from && receipt.issuedAt < to)
      .sort((left, right) => right.issuedAt.localeCompare(left.issuedAt))
      .slice(0, limit);
  },
  async markSynced(receiptId) {
    const receipt = fallbackReceipts.get(receiptId);
    if (receipt) fallbackReceipts.set(receiptId, { ...receipt, syncStatus: 'synced' });
    return { success: true };
  },
  async markSyncFailed(receiptId) {
    const receipt = fallbackReceipts.get(receiptId);
    if (receipt) fallbackReceipts.set(receiptId, { ...receipt, syncStatus: 'failed' });
    return { success: true };
  },
  async updatePrintStatus(receiptId, printStatus, isReprint) {
    const receipt = fallbackReceipts.get(receiptId);
    if (receipt) fallbackReceipts.set(receiptId, { ...receipt, printStatus, reprintCount: receipt.reprintCount + (isReprint && printStatus === 'printed' ? 1 : 0) });
    return { success: true };
  },
};

export const ValetDatabase: NativeValetDatabase = nativeDatabase ?? fallbackDatabase;

export async function clearStoredReceiptLocations() {
  await ValetDatabase.clearStoredReceiptLocations();
}

export function toStoredReceiptPayload(params: { ticket: BillableTicket; receipt: BillableReceipt; user: User; operatorId: string; deviceId: string }): StoredReceiptPayload {
  if (!params.user.locationId) throw new Error('LOCATION_REQUIRED');
  return {
    receiptId: params.receipt.id,
    clientId: params.ticket.id,
    receiptNumber: params.receipt.receiptNumber,
    barcodeValue: params.receipt.barcodeValue,
    organizationCode: params.receipt.organizationCode,
    organizationName: params.user.organizationName,
    locationId: params.user.locationId,
    locationName: params.user.locationName,
    vehicleNumber: params.receipt.vehicleNumber,
    vehicleType: params.receipt.vehicleType,
    vehicleRate: params.receipt.vehicleRate,
    issuedAt: params.receipt.issuedAt,
    operatorId: params.operatorId,
    operatorName: params.user.name,
    deviceId: params.deviceId,
    accountEmail: params.user.email.trim().toLowerCase(),
    paymentMethod: 'cash',
    paymentStatus: 'paid',
    printStatus: params.receipt.printStatus,
    syncStatus: 'pending',
    reprintCount: 0,
  };
}
