import { useAction, useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { Ticket } from '../types';

export function useCreateConvexTicket() {
  return useMutation(api.tickets.createTicket);
}

export function useUpdateReceiptPrintStatus() {
  return useMutation(api.tickets.updateReceiptPrintStatus);
}

export function useRecordActiveSession() {
  return useMutation(api.sessions.recordActiveSession);
}

export function useMarkSessionLoggedOut() {
  return useMutation(api.sessions.markSessionLoggedOut);
}

export function useDeviceAccessStatus(enabled: boolean, now: number) {
  return useQuery(api.deviceAccess.getMyStatus, enabled ? { now } : 'skip');
}

export function useRequestDeviceAccessCode() {
  return useAction(api.deviceAccess.requestApprovalCode);
}

export function useVerifyDeviceAccessCode() {
  return useMutation(api.deviceAccess.verifyApprovalCode);
}

export function useCompleteDeviceLogin() {
  return useMutation(api.deviceAccess.completeDeviceLogin);
}

export function useRevokeDeviceAccess() {
  return useMutation(api.deviceAccess.revokeMyAccess);
}

export function useUpsertReceiptMetadata() {
  return useMutation(api.receiptMetadata.upsert);
}

export function useCurrentProfile(enabled: boolean) {
  return useQuery(api.users.getCurrentProfile, enabled ? {} : 'skip');
}

export function useDailyReport(enabled: boolean, from: number, to: number, deviceId?: string) {
  return useQuery(api.reports.getDailyReport, enabled && deviceId ? { from, to, deviceId } : 'skip');
}

export function useCreateRollingReportSnapshot() {
  return useAction(api.reports.createRollingSnapshot);
}

export function useBeginRollingReportSnapshot() {
  return useMutation(api.reports.beginRollingSnapshot);
}

export function useReportSnapshotHistory() {
  return usePaginatedQuery(api.reports.listMyReportSnapshots, {}, { initialNumItems: 30 });
}

export function useLocationById(locationId?: Id<'locations'>) {
  return useQuery(api.locations.getLocationById, locationId ? { locationId } : 'skip');
}

export function useTicketByClientId(clientId: string) {
  return useQuery(api.tickets.getTicketByClientId, clientId ? { clientId } : 'skip');
}

export async function createConvexTicket(ticket: Ticket) {
  return {
    success: true as const,
    clientId: ticket.id,
  };
}

export async function fetchDailyReport() {
  return {
    count: 0,
    revenue: 0,
  };
}

export async function syncTicket(ticket: Ticket) {
  return createConvexTicket(ticket);
}
