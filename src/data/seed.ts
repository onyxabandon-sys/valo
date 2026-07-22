import { Ticket, User, VehicleType } from '../types';

export const VEHICLE_RATES: Record<VehicleType, number> = {
  Bike: 20,
  Car: 50,
  'Commercial Vehicle': 100,
  Bus: 200,
  'Heavy Vehicle': 150,
  Tractor: 30,
};

export const userSeed: User = {
  name: 'Rohit Sharma',
  email: 'rohit.sharma@company.com',
  role: 'Attendant',
  locationId: 'demo-location',
  locationName: 'Main Gate, Building A',
  locationAddress: 'Mumbai, Maharashtra',
  employeeId: 'ATT1007',
  phone: '+91 98765 43210',
  joinedAt: '01 Apr 2024',
  gps: '19.0760, 72.8777',
  status: 'Active',
};

export const adminSeed: User = {
  name: 'Arsalan Valet',
  email: 'arsalan.valet@demo.local',
  role: 'Admin',
  locationId: 'demo-location',
  locationName: 'Main Gate, Building A',
  locationAddress: 'Mumbai, Maharashtra',
  employeeId: 'ADM1001',
  phone: '+91 90000 00001',
  joinedAt: '01 Feb 2024',
  gps: '19.0760, 72.8777',
  status: 'Active',
};

export const initialTickets: Ticket[] = [
  {
    id: 'c0ffee11-0001',
    ticketNumber: '1-0005',
    vehicleType: 'Car',
    vehicleNumber: 'MH12AB1234',
    amount: 50,
    createdAt: '2025-05-16T08:30:00.000Z',
    locationName: userSeed.locationName,
    paymentStatus: 'paid',
    paymentMethod: 'cash',
  },
  {
    id: 'c0ffee11-0002',
    ticketNumber: '1-0006',
    vehicleType: 'Bike',
    vehicleNumber: 'MH01XY2026',
    amount: 20,
    createdAt: '2025-05-16T10:15:00.000Z',
    locationName: userSeed.locationName,
    paymentStatus: 'paid',
    paymentMethod: 'cash',
  },
];
