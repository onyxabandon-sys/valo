import { syncPendingTickets } from '../data/convexApi';
import { localDatabase } from '../data/localDatabase';

export async function flushOfflineQueue() {
  const pending = localDatabase.listPendingSync();
  const result = await syncPendingTickets(pending);
  if (result.success) {
    result.synced.forEach(id => localDatabase.markSynced(id));
  }
  return result;
}
