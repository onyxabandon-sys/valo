export const normalizeVehicleNumber = (value: string) =>
  value.trim().toUpperCase().replace(/[\s-]+/g, '-');

export const isValidVehicleNumber = (value: string) => {
  const normalized = normalizeVehicleNumber(value);
  const identifierLength = normalized.replace(/-/g, '').length;

  return (
    identifierLength >= 2 &&
    identifierLength <= 20 &&
    normalized.length <= 24 &&
    /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(normalized)
  );
};
