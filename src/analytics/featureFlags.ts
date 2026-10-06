import { useFeatureFlag } from 'posthog-react-native';
import { APP_FEATURES, resolveFeatureFlag, type AppFeatureName } from './featureFlagRegistry';

export { APP_FEATURES, resolveFeatureFlag, type AppFeatureName };

export function useAppFeatureEnabled(name: AppFeatureName) {
  const definition = APP_FEATURES[name];
  const value = useFeatureFlag(definition.key);
  return resolveFeatureFlag(value, definition.defaultEnabled);
}
