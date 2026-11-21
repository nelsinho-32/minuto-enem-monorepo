export type EnemAreaFilter =
  | 'TODAS'
  | 'LINGUAGENS'
  | 'HUMANAS'
  | 'NATUREZA'
  | 'MATEMATICA';

export const AppPalette = {
  primary: '#0284C7',
  primaryDark: '#0369A1',
  primaryLight: '#E0F2FE',
  primaryBorder: '#BAE6FD',

  success: '#16A34A',
  successLight: '#DCFCE7',
  successBorder: '#86EFAC',

  warning: '#D97706',
  warningLight: '#FEF3C7',
  warningBorder: '#FDE68A',

  orange: '#EA580C',
  orangeLight: '#FFEDD5',

  danger: '#DC2626',
  dangerLight: '#FEE2E2',
  dangerBorder: '#FECACA',

  purple: '#7C3AED',
  purpleLight: '#F3E8FF',
  purpleBorder: '#E9D5FF',

  surface: '#FFFFFF',
  background: '#F8FAFC',
  surfaceMuted: '#F1F5F9',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',

  textPrimary: '#0F172A',
  textSecondary: '#334155',
  textMuted: '#64748B',
  textSubtle: '#94A3B8',
} as const;

export const AppSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

export const AppRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const Colors = {
  light: {
    text: AppPalette.textPrimary,
    textSecondary: AppPalette.textSecondary,
    textMuted: AppPalette.textMuted,
    background: AppPalette.background,
    surface: AppPalette.surface,
    surfaceMuted: AppPalette.surfaceMuted,
    border: AppPalette.border,
    tint: AppPalette.primary,
    primary: AppPalette.primary,
    primaryLight: AppPalette.primaryLight,
    success: AppPalette.success,
    warning: AppPalette.warning,
    danger: AppPalette.danger,
    purple: AppPalette.purple,
    icon: AppPalette.textMuted,
    tabIconDefault: AppPalette.textSubtle,
    tabIconSelected: AppPalette.primary,
  },
  dark: {
    text: '#F8FAFC',
    textSecondary: '#E2E8F0',
    textMuted: '#94A3B8',
    background: '#0F172A',
    surface: '#1E293B',
    surfaceMuted: '#334155',
    border: '#334155',
    tint: '#38BDF8',
    primary: '#0284C7',
    primaryLight: '#0C4A6E',
    success: '#22C55E',
    warning: '#F59E0B',
    danger: '#EF4444',
    purple: '#A855F7',
    icon: '#94A3B8',
    tabIconDefault: '#64748B',
    tabIconSelected: '#38BDF8',
  },
};

/**
 * Helper centralizado do Design System para resolver ícone, cor e área do ENEM
 * de qualquer disciplina do sistema.
 */
export function getSubjectVisualTheme(slug = '', name = ''): {
  icon: string;
  color: string;
  bg: string;
  area: EnemAreaFilter;
} {
  const lower = `${slug} ${name}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (lower.includes('matem')) {
    return { icon: 'calculator', color: '#0284C7', bg: '#E0F2FE', area: 'MATEMATICA' };
  }
  if (lower.includes('redac')) {
    return { icon: 'pen-fancy', color: '#7C3AED', bg: '#F3E8FF', area: 'LINGUAGENS' };
  }
  if (lower.includes('portug') || lower.includes('lingua')) {
    return { icon: 'book-open', color: '#E11D48', bg: '#FFE4E6', area: 'LINGUAGENS' };
  }
  if (lower.includes('literat')) {
    return { icon: 'book', color: '#E11D48', bg: '#FFE4E6', area: 'LINGUAGENS' };
  }
  if (lower.includes('arte')) {
    return { icon: 'palette', color: '#EC4899', bg: '#FCE7F3', area: 'LINGUAGENS' };
  }
  if (lower.includes('ingl') || lower.includes('espanh') || lower.includes('idiom')) {
    return { icon: 'globe', color: '#F43F5E', bg: '#FFE4E6', area: 'LINGUAGENS' };
  }
  if (lower.includes('fisic') && lower.includes('educ')) {
    return { icon: 'running', color: '#F97316', bg: '#FFEDD5', area: 'LINGUAGENS' };
  }
  if (lower.includes('histor')) {
    return { icon: 'landmark', color: '#D97706', bg: '#FEF3C7', area: 'HUMANAS' };
  }
  if (lower.includes('geograf')) {
    return { icon: 'map', color: '#EA580C', bg: '#FFEDD5', area: 'HUMANAS' };
  }
  if (lower.includes('filosof')) {
    return { icon: 'brain', color: '#B45309', bg: '#FEF3C7', area: 'HUMANAS' };
  }
  if (lower.includes('sociolog')) {
    return { icon: 'users', color: '#D97706', bg: '#FEF3C7', area: 'HUMANAS' };
  }
  if (lower.includes('biolog')) {
    return { icon: 'leaf', color: '#16A34A', bg: '#DCFCE7', area: 'NATUREZA' };
  }
  if (lower.includes('quimic')) {
    return { icon: 'flask', color: '#059669', bg: '#D1FAE5', area: 'NATUREZA' };
  }
  if (lower.includes('fisic')) {
    return { icon: 'atom', color: '#10B981', bg: '#D1FAE5', area: 'NATUREZA' };
  }
  return { icon: 'graduation-cap', color: '#0284C7', bg: '#E0F2FE', area: 'TODAS' };
}
