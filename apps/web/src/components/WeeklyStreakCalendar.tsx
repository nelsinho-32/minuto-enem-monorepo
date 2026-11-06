import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { WeekDayStreakItem } from '@/store/useUserStore';
import { StreakBadge } from '@/components/StreakBadge';

interface WeeklyStreakCalendarProps {
  currentStreak?: number;
  iceFreezes?: number;
  weekDays: WeekDayStreakItem[];
  onPress?: () => void;
  compact?: boolean;
}

export function WeeklyStreakCalendar({
  currentStreak = 0,
  iceFreezes = 0,
  weekDays,
  onPress,
  compact = false,
}: WeeklyStreakCalendarProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 600,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  if (compact) {
    return (
      <TouchableOpacity
        style={styles.compactCard}
        activeOpacity={0.75}
        onPress={onPress}
        disabled={!onPress}
      >
        <View style={styles.compactHeader}>
          <Text style={styles.compactTitle}>Ofensiva</Text>
          <View style={styles.compactBadgesRow}>
            <View style={styles.compactIcePill}>
              <Text style={styles.compactEmoji}>🧊</Text>
              <Text style={styles.compactIceText}>{iceFreezes}</Text>
            </View>
          </View>
        </View>

        <View style={styles.compactHeroRow}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <FontAwesome5 name="fire-alt" size={26} color="#FF9600" />
          </Animated.View>
          <View>
            <Text style={styles.compactStreakNumber}>{currentStreak} dias</Text>
            <Text style={styles.compactStreakSub}>em sequência</Text>
          </View>
        </View>

        <View style={styles.compactDaysRow}>
          {weekDays.map((day) => {
            const isCompleted = day.status === 'COMPLETED';
            const isFrozen = day.status === 'FROZEN';
            const isFuture = day.status === 'FUTURE';

            return (
              <View
                key={day.date}
                style={[styles.compactDayCol, isFuture && styles.dayFutureContainer]}
              >
                <View
                  style={[
                    styles.compactDayCircle,
                    isCompleted && styles.dayCompleted,
                    isFrozen && styles.dayFrozen,
                    day.isToday && styles.dayToday,
                  ]}
                >
                  {isCompleted && (
                    <FontAwesome5 name="fire-alt" size={9} color="#FF9600" />
                  )}
                  {isFrozen && <Text style={styles.compactIceMini}>🧊</Text>}
                </View>
                <Text
                  style={[
                    styles.compactDayLabel,
                    day.isToday && styles.dayLabelToday,
                    isFrozen && styles.dayLabelFrozen,
                  ]}
                >
                  {day.label}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={styles.compactFooter}>
          <Text style={styles.compactFooterText}>Ver calendário</Text>
          <FontAwesome5 name="chevron-right" size={10} color="#FF9600" />
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={styles.section}
      activeOpacity={0.7}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Sua Ofensiva</Text>
        <StreakBadge />
      </View>

      <View style={styles.calendarCard}>
        {weekDays.map((day) => {
          const isCompleted = day.status === 'COMPLETED';
          const isFrozen = day.status === 'FROZEN';
          const isFuture = day.status === 'FUTURE';

          return (
            <View
              key={day.date}
              style={[styles.dayContainer, isFuture && styles.dayFutureContainer]}
            >
              <View
                style={[
                  styles.dayCircle,
                  isCompleted && styles.dayCompleted,
                  isFrozen && styles.dayFrozen,
                  day.isToday && styles.dayToday,
                ]}
              >
                {isCompleted && (
                  <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                    <FontAwesome5 name="fire-alt" size={14} color="#FF9600" />
                  </Animated.View>
                )}

                {isFrozen && <Text style={styles.iceIcon}>🧊</Text>}
              </View>

              <Text
                style={[
                  styles.dayLabel,
                  day.isToday && styles.dayLabelToday,
                  isFrozen && styles.dayLabelFrozen,
                ]}
              >
                {day.label}
              </Text>
            </View>
          );
        })}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2C3A47',
  },
  calendarCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dayContainer: {
    alignItems: 'center',
    gap: 8,
  },
  dayFutureContainer: {
    opacity: 0.55,
  },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F7F9FC',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E2E8F0',
  },
  dayCompleted: {
    backgroundColor: '#FFF0D4',
    borderColor: '#FFB84D',
  },
  dayFrozen: {
    backgroundColor: '#E0F2FE',
    borderColor: '#38BDF8',
  },
  dayToday: {
    borderColor: '#2C3A47',
    borderWidth: 1.5,
  },
  iceIcon: {
    fontSize: 14,
  },
  dayLabel: {
    fontSize: 12,
    color: '#8CA0B3',
    fontWeight: 'bold',
  },
  dayLabelToday: {
    color: '#2C3A47',
  },
  dayLabelFrozen: {
    color: '#0284C7',
  },

  // Estilos da versão compacta (lado a lado com o Mural)
  compactCard: {
    flex: 1,
    backgroundColor: '#FFF',
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  compactHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  compactTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#2C3A47',
  },
  compactBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  compactIcePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  compactEmoji: {
    fontSize: 11,
  },
  compactIceText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0284C7',
  },
  compactHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    backgroundColor: '#FFF9F0',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFE4B5',
  },
  compactStreakNumber: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#2C3A47',
  },
  compactStreakSub: {
    fontSize: 11,
    color: '#8CA0B3',
    fontWeight: '600',
  },
  compactDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  compactDayCol: {
    alignItems: 'center',
    gap: 3,
  },
  compactDayCircle: {
    width: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: '#F7F9FC',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  compactIceMini: {
    fontSize: 9,
  },
  compactDayLabel: {
    fontSize: 10,
    color: '#8CA0B3',
    fontWeight: 'bold',
  },
  compactFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 8,
  },
  compactFooterText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FF9600',
  },
});
