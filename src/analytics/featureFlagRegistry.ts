export const APP_FEATURES = {
  reportExport: {
    key: 'valetpos-report-export-enabled',
    defaultEnabled: true,
    purpose: 'Temporarily disable optional Excel report sharing if that path has an operational issue.',
    owner: 'Valet POS product owner',
    removalCondition: 'Remove after report export no longer needs a remote operational switch.',
  },
} as const;

export type AppFeatureName = keyof typeof APP_FEATURES;

export function resolveFeatureFlag(value: boolean | string | undefined, defaultValue: boolean) {
  return typeof value === 'boolean' ? value : defaultValue;
}
