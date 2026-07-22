import { Ticket } from '../types';

class LocalDatabase {
  private tickets: Ticket[] = [];
  private pendingSync: Ticket[] = [];

  load(seed: Ticket[]) {
    this.tickets = [...seed];
  }

  listTickets() {
    return [...this.tickets];
  }

  addTicket(ticket: Ticket) {
    this.tickets = [ticket, ...this.tickets];
    this.pendingSync = [ticket, ...this.pendingSync];
  }

  findTicketById(id: string) {
    return this.tickets.find(ticket => ticket.id === id) ?? null;
  }

  getDailyReport() {
    return {
      count: this.tickets.length,
      total: this.tickets.reduce((sum, ticket) => sum + ticket.amount, 0),
    };
  }

  listPendingSync() {
    return [...this.pendingSync];
  }

  markSynced(clientId: string) {
    this.pendingSync = this.pendingSync.filter(ticket => ticket.id !== clientId);
  }

  reset(seed: Ticket[]) {
    this.load(seed);
    this.pendingSync = [];
  }
}

export const localDatabase = new LocalDatabase();
