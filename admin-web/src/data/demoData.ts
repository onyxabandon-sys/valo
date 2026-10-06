export type Section = 'Overview' | 'Locations' | 'Users' | 'Devices';
export type Status = 'Active' | 'Pending' | 'Inactive';

export type Location = {
  id: string;
  name: string;
  address: string;
  users: number;
  devices: number;
  status: Status;
  lastActivity: string;
};

export type Operator = {
  id: string;
  name: string;
  email: string;
  role: 'Admin' | 'Operator';
  location: string;
  device: string;
  status: Status;
  lastActivity: string;
};

export type Device = {
  id: string;
  name: string;
  deviceId: string;
  user: string;
  location: string;
  status: Status;
  lastActivity: string;
};

export const initialLocations: Location[] = [
  { id: 'loc-01', name: 'North Gate', address: 'Demo address · Islamabad', users: 4, devices: 4, status: 'Active', lastActivity: '2 min ago' },
  { id: 'loc-02', name: 'Crescent Plaza', address: 'Demo address · Rawalpindi', users: 3, devices: 3, status: 'Active', lastActivity: '18 min ago' },
  { id: 'loc-03', name: 'Garden Entrance', address: 'Demo address · Lahore', users: 2, devices: 2, status: 'Inactive', lastActivity: 'Yesterday' },
];

export const initialUsers: Operator[] = [
  { id: 'usr-01', name: 'Shift Operator 01', email: 'operator-01@example.test', role: 'Operator', location: 'North Gate', device: 'Sunmi V2 · ···· 4F2A', status: 'Active', lastActivity: '2 min ago' },
  { id: 'usr-02', name: 'Shift Operator 02', email: 'operator-02@example.test', role: 'Operator', location: 'North Gate', device: 'Sunmi V2 · ···· 9B10', status: 'Active', lastActivity: '7 min ago' },
  { id: 'usr-03', name: 'Shift Operator 03', email: 'operator-03@example.test', role: 'Operator', location: 'Crescent Plaza', device: 'Android · ···· 08C1', status: 'Pending', lastActivity: 'Not signed in' },
  { id: 'usr-04', name: 'Operations Admin', email: 'admin@example.test', role: 'Admin', location: 'All locations', device: 'Web console', status: 'Active', lastActivity: 'Now' },
];

export const initialDevices: Device[] = [
  { id: 'dev-01', name: 'Sunmi V2', deviceId: '···· 4F2A', user: 'Shift Operator 01', location: 'North Gate', status: 'Active', lastActivity: '2 min ago' },
  { id: 'dev-02', name: 'Sunmi V2', deviceId: '···· 9B10', user: 'Shift Operator 02', location: 'North Gate', status: 'Active', lastActivity: '7 min ago' },
  { id: 'dev-03', name: 'Android terminal', deviceId: '···· 08C1', user: 'Unassigned', location: 'Crescent Plaza', status: 'Pending', lastActivity: 'Not signed in' },
  { id: 'dev-04', name: 'Sunmi V2', deviceId: '···· 731D', user: 'Shift Operator 04', location: 'Garden Entrance', status: 'Inactive', lastActivity: 'Yesterday' },
];
