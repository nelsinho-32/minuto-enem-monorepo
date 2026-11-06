import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { SkeletonLoader } from './SkeletonLoader';

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: string;
  color?: string;
  loading?: boolean;
  style?: ViewStyle;
}

export function KpiCard({
  title,
  value,
  subtitle,
  icon,
  color = '#1CB0F6',
  loading = false,
  style,
}: KpiCardProps) {
  if (loading) {
    return (
      <View style={[styles.card, style]}>
        <View style={styles.topRow}>
          <SkeletonLoader width={120} height={16} />
          <SkeletonLoader width={36} height={36} borderRadius={18} />
        </View>
        <SkeletonLoader width={90} height={32} style={{ marginVertical: 8 }} />
        <SkeletonLoader width={160} height={14} />
      </View>
    );
  }

  return (
    <View style={[styles.card, style]}>
      <View style={styles.topRow}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={[styles.iconContainer, { backgroundColor: `${color}18` }]}>
          <FontAwesome5 name={icon as any} size={16} color={color} />
        </View>
      </View>
      <Text style={styles.value}>{value}</Text>
      {subtitle ? (
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 220,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
    marginRight: 8,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  value: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#9CA3AF',
  },
});

