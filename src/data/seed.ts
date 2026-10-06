import { Ticket, User, PricedVehicleType } from '../types';

export const VEHICLE_RATES: Record<PricedVehicleType, number> = {
  Bike: 50,
  Car: 100,
};

export const userSeed: User = {
  name: 'Rohit Sharma',
  email: 'rohit.sharma@company.com',
  role: 'Attendant',
  locationId: 'demo-location',
  organizationCode: 'ORG-001',
  organizationName: 'Arsalan Valet parking',
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
  organizationCode: 'ORG-001',
  organizationName: 'Arsalan Valet parking',
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
    amount: 100,
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
    amount: 50,
    createdAt: '2025-05-16T10:15:00.000Z',
    locationName: userSeed.locationName,
    paymentStatus: 'paid',
    paymentMethod: 'cash',
  },
];
