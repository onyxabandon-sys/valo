export type DeviceAssignmentBinding = {
  userId: string;
  deviceId: string;
  status: 'active' | 'pending' | 'revoked';
};

export function isDeviceReservedForAnotherUser(
  assignments: readonly DeviceAssignmentBinding[],
  userId: string,
  deviceId: string,
) {
  return assignments.some(assignment =>
    assignment.status !== 'revoked' &&
    assignment.deviceId === deviceId &&
    assignment.userId !== userId,
  );
}

export function matchesClaimedDeviceId(claimedDeviceId: string | undefined, assignedDeviceId: string) {
  return claimedDeviceId === undefined || claimedDeviceId === assignedDeviceId;
}
