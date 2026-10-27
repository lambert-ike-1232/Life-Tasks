import { useColorScheme } from 'react-native';

import type { Priority } from './types';

// Same palette as the web board (app/static/style.css).
const light = {
  bg: '#f6f7f9',
  panel: '#ffffff',
  text: '#1f2328',
  muted: '#6b7280',
  line: '#e5e7eb',
  accent: '#4f46e5',
  danger: '#dc2626',
  chip: '#eef0f3',
};

const dark: typeof light = {
  bg: '#111318',
  panel: '#1a1d24',
  text: '#e6e7ea',
  muted: '#9aa0aa',
  line: '#2a2e37',
  accent: '#818cf8',
  danger: '#f87171',
  chip: '#262a33',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export const PRIORITY_COLORS: Record<Priority, string> = {
  high: '#dc2626',
  medium: '#d97706',
  low: '#9ca3af',
};
