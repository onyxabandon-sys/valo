export const convexSchema = {
  users: {
    email: 'string',
    passwordHash: 'string',
    locationId: 'id(locations)',
    createdAt: 'number',
  },
  locations: {
    name: 'string',
    logoUrl: 'string?',
    gps: 'object?',
    address: 'string?',
    ownerUserId: 'id(users)',
    createdAt: 'number',
  },
  tickets: {
    clientId: 'string',
    locationId: 'id(locations)',
    ticketNumber: 'string',
    vehicleType: 'Car|Bike',
    vehicleNumber: 'string',
    amount: 'number',
    paymentStatus: 'paid|void',
    paymentMethod: 'cash',
    createdAt: 'number',
    createdByUserId: 'id(users)',
  },
};
