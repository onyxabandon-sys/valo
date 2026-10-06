import { Platform } from 'react-native';

export const colors = {
  ink: '#0B1220',
  inkSoft: '#172033',
  porcelain: '#F5F7FB',
  blueCanvas: '#EAF3FF',
  blueCanvasDeep: '#D6E8FF',
  blueSurface: '#F8FBFF',
  surface: '#FFFFFF',
  cobalt: '#2F6BFF',
  cobaltSoft: '#EAF0FF',
  cobaltDeep: '#174EE8',
  mint: '#16A678',
  mintText: '#087454',
  mintSoft: '#E8F8F2',
  amber: '#F4B740',
  amberSoft: '#FFF7E2',
  danger: '#D64545',
  dangerSoft: '#FFF0F0',
  text: '#111827',
  muted: '#687386',
  line: '#DDE3ED',
} as const;

export const radius = {
  small: 12,
  medium: 18,
  large: 26,
  pill: 999,
} as const;

export const fonts = {
  utility: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
} as const;

export const surfaceShadow = {
  shadowColor: colors.ink,
  shadowOpacity: 0.08,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 10 },
  elevation: 4,
} as const;
