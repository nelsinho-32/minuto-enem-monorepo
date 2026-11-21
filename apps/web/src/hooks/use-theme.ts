import {
  Colors,
  AppPalette,
  AppSpacing,
  AppRadius,
  getSubjectVisualTheme,
} from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useTheme() {
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? 'dark' : 'light';

  return {
    ...Colors[theme],
    palette: AppPalette,
    spacing: AppSpacing,
    radius: AppRadius,
    isDark: theme === 'dark',
  };
}

export {
  Colors,
  AppPalette,
  AppSpacing,
  AppRadius,
  getSubjectVisualTheme,
};
