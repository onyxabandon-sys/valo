import { initialTickets, userSeed, VEHICLE_RATES } from '../data/seed';
import { isValidVehicleNumber } from './validation';
import { Ticket, VehicleType } from '../types';

export function makeId() {
  return `t_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function nextTicketNumber(count: number) {
  return `1-${String(count + 1).padStart(4, '0')}`;
}

export function createTicket(params: {
  vehicleType: VehicleType;
  vehicleNumber: string;
  amount?: number;
  existingCount: number;
  locationName?: string;
}): Ticket {
  const amount = params.amount ?? VEHICLE_RATES[params.vehicleType];
  if (!isValidVehicleNumber(params.vehicleNumber)) {
    throw new Error('INVALID_VEHICLE_NUMBER');
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('INVALID_AMOUNT');
  }

  return {
    id: makeId(),
    ticketNumber: nextTicketNumber(params.existingCount),
    vehicleType: params.vehicleType,
    vehicleNumber: params.vehicleNumber.trim().toUpperCase(),
    amount,
    createdAt: new Date().toISOString(),
    locationName: params.locationName ?? userSeed.locationName,
    paymentStatus: 'paid',
    paymentMethod: 'cash',
  };
}

export function seedTickets() {
  return [...initialTickets];
}
