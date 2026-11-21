import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import {
  Colors,
  AppPalette,
  AppSpacing,
  AppRadius,
  getSubjectVisualTheme,
} from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useUserStore } from '@/store/useUserStore';

export type ThemePreference = 'light' | 'dark' | 'system';

export function useTheme() {
  const osScheme = useColorScheme();
  const themePreference = useUserStore((s) => s.themePreference || 'light');
  const setThemePreference = useUserStore((s) => s.setThemePreference);
  const toggleDarkMode = useUserStore((s) => s.toggleDarkMode);

  const resolvedTheme: 'light' | 'dark' =
    themePreference === 'system'
      ? osScheme === 'dark'
        ? 'dark'
        : 'light'
      : themePreference;

  return {
    ...Colors[resolvedTheme],
    palette: AppPalette,
    spacing: AppSpacing,
    radius: AppRadius,
    isDark: resolvedTheme === 'dark',
    themePreference,
    setThemePreference,
    toggleDarkMode,
  };
}

const DARK_BG_MAP: Record<string, string> = {
  '#f7f9fc': '#0F172A',
  '#f8fafc': '#0F172A',
  '#f4f6f9': '#0F172A',
  '#f3f4f6': '#0F172A',
  '#f9fafb': '#0F172A',
  '#f1f5f9': '#1E293B',
  '#edf2f7': '#1E293B',
  '#e2e8f0': '#334155',
  '#ffffff': '#1E293B',
  '#fff': '#1E293B',
  white: '#1E293B',
  '#f0f9ff': '#0C4A6E',
  '#e0f2fe': '#0C4A6E',
  '#ebf5fb': '#0C4A6E',
  '#faf5ff': '#2E1065',
  '#f3e8ff': '#2E1065',
  '#f4ecf7': '#2E1065',
  '#f0fdf4': '#052E16',
  '#dcfce7': '#052E16',
  '#e8f8f5': '#052E16',
  '#fef2f2': '#450A0A',
  '#fee2e2': '#450A0A',
  '#ffe4e6': '#4C0519',
  '#fffbeb': '#451A03',
  '#fef3c7': '#451A03',
  '#fff0d4': '#451A03',
  '#fff9f0': '#431407',
  '#fff7ed': '#431407',
  '#ffedd5': '#431407',
};

const DARK_BORDER_MAP: Record<string, string> = {
  '#e2e8f0': '#334155',
  '#cbd5e1': '#475569',
  '#e5e7eb': '#334155',
  '#f1f5f9': '#334155',
  '#dde6ed': '#334155',
  '#d1d5db': '#475569',
  '#bae6fd': '#0369A1',
  '#e9d5ff': '#6B21A8',
  '#fecaca': '#991B1B',
  '#fde68a': '#92400E',
  '#ffe4b5': '#92400E',
  '#ffb84d': '#B45309',
  '#86efac': '#166534',
  '#ffffff': '#334155',
  '#fff': '#334155',
};

const DARK_TEXT_MAP: Record<string, string> = {
  '#0f172a': '#F8FAFC',
  '#1e293b': '#F8FAFC',
  '#2c3a47': '#F8FAFC',
  '#111827': '#F8FAFC',
  '#1f2937': '#F1F5F9',
  '#334155': '#E2E8F0',
  '#374151': '#E2E8F0',
  '#475569': '#CBD5E1',
  '#4b5563': '#CBD5E1',
  '#52656d': '#CBD5E1',
  '#64748b': '#94A3B8',
  '#6b7280': '#94A3B8',
  '#8ca0b3': '#94A3B8',
  '#7f8c8d': '#94A3B8',
  '#0369a1': '#38BDF8',
  '#6b21a8': '#D8B4FE',
  '#15803d': '#4ADE80',
  '#166534': '#4ADE80',
  '#991b1b': '#FCA5A5',
  '#b91c1c': '#FCA5A5',
  '#b45309': '#FCD34D',
  '#92400e': '#FCD34D',
};

function mapHex(value: unknown, table: Record<string, string>): unknown {
  if (typeof value !== 'string') return value;
  const key = value.trim().toLowerCase();
  return table[key] ?? value;
}

/**
 * Adapta qualquer StyleSheet da aplicação para o Modo Escuro de forma uniforme
 * quando `theme.isDark === true`, mantendo 100% inalterado no Modo Claro (padrão).
 */
export function useThemedStyles<T extends Record<string, any>>(baseStyles: T): T {
  const { isDark } = useTheme();

  return useMemo(() => {
    if (!isDark) return baseStyles;

    const adapted: Record<string, any> = {};
    for (const [key, rawStyle] of Object.entries(baseStyles)) {
      const flat = StyleSheet.flatten(rawStyle);
      if (!flat || typeof flat !== 'object') {
        adapted[key] = rawStyle;
        continue;
      }

      const next: Record<string, any> = { ...flat };
      if ('backgroundColor' in next) {
        next.backgroundColor = mapHex(next.backgroundColor, DARK_BG_MAP);
      }
      if ('borderColor' in next) {
        next.borderColor = mapHex(next.borderColor, DARK_BORDER_MAP);
      }
      if ('borderTopColor' in next) {
        next.borderTopColor = mapHex(next.borderTopColor, DARK_BORDER_MAP);
      }
      if ('borderBottomColor' in next) {
        next.borderBottomColor = mapHex(next.borderBottomColor, DARK_BORDER_MAP);
      }
      if ('borderLeftColor' in next) {
        next.borderLeftColor = mapHex(next.borderLeftColor, DARK_BORDER_MAP);
      }
      if ('borderRightColor' in next) {
        next.borderRightColor = mapHex(next.borderRightColor, DARK_BORDER_MAP);
      }
      if ('color' in next) {
        next.color = mapHex(next.color, DARK_TEXT_MAP);
      }

      adapted[key] = next;
    }

    return adapted as T;
  }, [baseStyles, isDark]);
}

export {
  Colors,
  AppPalette,
  AppSpacing,
  AppRadius,
  getSubjectVisualTheme,
};
