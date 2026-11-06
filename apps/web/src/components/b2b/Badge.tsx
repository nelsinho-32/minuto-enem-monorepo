import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'secondary';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  dot?: boolean;
}

const variantStyles: Record<
  BadgeVariant,
  { bg: string; text: string; dot: string; border: string }
> = {
  success: {
    bg: '#DEF7EC',
    text: '#03543F',
    dot: '#31C48D',
    border: '#BCF0DA',
  },
  warning: {
    bg: '#FEF08A',
    text: '#854D0E',
    dot: '#EAB308',
    border: '#FDE047',
  },
  danger: {
    bg: '#FDE8E8',
    text: '#9B1C1C',
    dot: '#F05252',
    border: '#FBD5D5',
  },
  info: {
    bg: '#E1EFFE',
    text: '#1E429F',
    dot: '#3F83F8',
    border: '#C3DDFD',
  },
  secondary: {
    bg: '#F3F4F6',
    text: '#374151',
    dot: '#9CA3AF',
    border: '#E5E7EB',
  },
};

export function Badge({ label, variant = 'secondary', dot = true }: BadgeProps) {
  const conf = variantStyles[variant] || variantStyles.secondary;

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: conf.bg,
          borderColor: conf.border,
        },
      ]}
    >
      {dot && <View style={[styles.dot, { backgroundColor: conf.dot }]} />}
      <Text style={[styles.text, { color: conf.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});

