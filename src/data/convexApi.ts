import { Ticket } from '../types';

export async function syncTicketToConvex(ticket: Ticket) {
  return { success: true, canonicalId: ticket.id };
}

export async function syncPendingTickets(tickets: Ticket[]) {
  return {
    success: true,
    synced: tickets.map(ticket => ticket.id),
  };
}
