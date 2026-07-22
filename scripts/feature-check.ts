import assert from 'node:assert/strict';
import { convexSchema } from '../src/data/convexSchema';
import { localDatabase } from '../src/data/localDatabase';
import { initialTickets, userSeed, VEHICLE_RATES } from '../src/data/seed';
import { createTicket } from '../src/lib/appFlows';
import { isValidEmail, isValidPassword, isValidVehicleNumber } from '../src/lib/validation';
import { Ticket } from '../src/types';

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 't_feature_test',
    ticketNumber: '1-9999',
    vehicleType: 'Car',
    vehicleNumber: 'MH12AB1234',
    amount: 50,
    createdAt: '2026-07-16T00:00:00.000Z',
    locationName: userSeed.locationName,
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    ...overrides,
  };
}

function run() {
  localDatabase.reset(initialTickets);

  assert.equal(isValidEmail('user@example.com'), true);
  assert.equal(isValidEmail('bad-email'), false);
  assert.equal(isValidPassword('Passw0rd'), true);
  assert.equal(isValidPassword('short1'), false);
  assert.equal(isValidVehicleNumber('MH12AB1234'), true);
  assert.equal(isValidVehicleNumber('x'), false);

  const before = localDatabase.listTickets().length;
  localDatabase.addTicket(makeTicket({ id: 't_added' }));
  assert.equal(localDatabase.listTickets().length, before + 1);
  assert.equal(localDatabase.findTicketById('t_added')?.vehicleNumber, 'MH12AB1234');
  assert.equal(localDatabase.listPendingSync().length, 1);
  localDatabase.markSynced('t_added');
  assert.equal(localDatabase.listPendingSync().length, 0);

  const report = localDatabase.getDailyReport();
  assert.equal(report.count, before + 1);
  assert.ok(report.total > 0);

  assert.equal(VEHICLE_RATES.Car, 50);
  assert.equal(VEHICLE_RATES.Bike, 20);

  assert.ok('users' in convexSchema);
  assert.ok('locations' in convexSchema);
  assert.ok('tickets' in convexSchema);
  assert.equal(convexSchema.tickets.paymentMethod, 'cash');

  const seeded = initialTickets.every(ticket => ticket.paymentStatus === 'paid' && ticket.paymentMethod === 'cash');
  assert.equal(seeded, true);

  const generated = createTicket({
    vehicleType: 'Bike',
    vehicleNumber: 'MH12AB1234',
    existingCount: before + 1,
  });
  assert.equal(generated.vehicleType, 'Bike');
  assert.equal(generated.amount, 20);
  assert.equal(generated.paymentStatus, 'paid');

  console.log('Feature checks passed');
}

run();
