import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Ticket } from '../types';

export function useCreateConvexTicket() {
  return useMutation(api.tickets.createTicket);
}

export function useCreateOrganization() {
  return useMutation(api.users.createOrganization);
}

export function useDailyReport(locationId: string, from: number, to: number) {
  return useQuery(api.reports.getDailyReport, locationId ? ({ locationId: locationId as any, from, to } as any) : 'skip');
}

export function useLocationById(locationId: string) {
  return useQuery(api.locations.getLocationById, locationId ? ({ locationId: locationId as any } as any) : 'skip');
}

export function useTicketByClientId(clientId: string) {
  return useQuery(api.tickets.getTicketByClientId, clientId ? { clientId } : 'skip');
}

export function useUserByEmail(email: string) {
  return useQuery(api.users.getUserByEmail, email.trim() ? { email } : 'skip');
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
