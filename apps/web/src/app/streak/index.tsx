import React, { useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { useQuery } from '@tanstack/react-query';
import { useUserStore, type WeekDayStreakItem } from '@/store/useUserStore';
import { WeeklyStreakCalendar } from '@/components/WeeklyStreakCalendar';
import { api } from '@/services/api';

// Configuração do idioma do calendário
LocaleConfig.locales['pt-br'] = {
  monthNames: [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ],
  monthNamesShort: [
    'Jan',
    'Fev',
    'Mar',
    'Abr',
    'Mai',
    'Jun',
    'Jul',
    'Ago',
    'Set',
    'Out',
    'Nov',
    'Dez',
  ],
  dayNames: [
    'Domingo',
    'Segunda-feira',
    'Terça-feira',
    'Quarta-feira',
    'Quinta-feira',
    'Sexta-feira',
    'Sábado',
  ],
  dayNamesShort: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
  today: 'Hoje',
};
LocaleConfig.defaultLocale = 'pt-br';

interface StreakApiResponse {
  currentStreak: number;
  longestStreak: number;
  iceFreezes: number;
  lastStudyDate: string | null;
  weekDays?: WeekDayStreakItem[];
}

export default function StreakScreen() {
  const router = useRouter();
  const {
    currentStreak: storeCurrentStreak,
    longestStreak: storeLongestStreak,
    iceFreezes: storeIceFreezes,
    streakHistory,
    getWeekDays,
    validateStreakOnLogin,
  } = useUserStore();

  // Consulta em tempo real à API de ofensiva do back-end
  const {
    data: apiData,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<StreakApiResponse>({
    queryKey: ['streak-week-data'],
    queryFn: async () => {
      const res = await api.get<StreakApiResponse>('/streak/week');
      return res;
    },
    networkMode: 'offlineFirst',
  });

  useEffect(() => {
    validateStreakOnLogin();
  }, [validateStreakOnLogin]);

  const currentStreak = apiData?.currentStreak ?? storeCurrentStreak;
  const longestStreak = apiData?.longestStreak ?? storeLongestStreak;
  const iceFreezes = apiData?.iceFreezes ?? storeIceFreezes;
  const weekDays = apiData?.weekDays?.length ? apiData.weekDays : getWeekDays();

  const markedDates = useMemo(() => {
    const dates: Record<string, { status: 'COMPLETED' | 'FROZEN' }> = {};
    Object.entries(streakHistory).forEach(([dateStr, status]) => {
      dates[dateStr] = { status };
    });

    if (apiData?.weekDays) {
      apiData.weekDays.forEach((day) => {
        if (day.status === 'COMPLETED' || day.status === 'FROZEN') {
          dates[day.date] = { status: day.status };
        }
      });
    }

    return dates;
  }, [streakHistory, apiData]);

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <FontAwesome5 name="arrow-left" size={20} color="#2C3A47" />
        </TouchableOpacity>
        <Text style={styles.title}>Suas Conquistas</Text>
        <TouchableOpacity
          onPress={() => refetch()}
          style={styles.refreshButton}
          disabled={isRefetching}
        >
          {isRefetching ? (
            <ActivityIndicator size="small" color="#FF9600" />
          ) : (
            <FontAwesome5 name="sync-alt" size={16} color="#8CA0B3" />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Placar Principal de Ofensiva */}
        <View style={styles.streakShowcase}>
          <FontAwesome5
            name="fire-alt"
            size={60}
            color="#FF9600"
            style={styles.icon}
          />
          <Text style={styles.streakNumber}>{currentStreak}</Text>
          <Text style={styles.streakLabel}>
            {currentStreak === 1
              ? 'Dia seguido estudando!'
              : 'Dias seguidos estudando!'}
          </Text>

          <View style={styles.metricsRow}>
            <View style={styles.metricBox}>
              <FontAwesome5 name="trophy" size={16} color="#F1C40F" />
              <Text style={styles.metricValue}>{longestStreak} dias</Text>
              <Text style={styles.metricLabel}>Maior Ofensiva</Text>
            </View>

            <View style={styles.metricDivider} />

            <View style={styles.metricBox}>
              <Text style={styles.freezeEmoji}>🧊</Text>
              <Text style={styles.metricValue}>{iceFreezes} disponíveis</Text>
              <Text style={styles.metricLabel}>Bloqueios de Gelo</Text>
            </View>
          </View>
        </View>

        {/* Componente de Calendário da Semana integrado à API */}
        <WeeklyStreakCalendar
          currentStreak={currentStreak}
          iceFreezes={iceFreezes}
          weekDays={weekDays}
        />

        {/* Calendário Mensal com Fogo (🔥) e Gelo (🧊) */}
        <View style={styles.calendarContainer}>
          <Calendar
            hideExtraDays={true}
            markedDates={markedDates as any}
            theme={{
              calendarBackground: '#FFFFFF',
              textSectionTitleColor: '#8CA0B3',
              monthTextColor: '#2C3A47',
              textMonthFontWeight: 'bold',
              textDayHeaderFontWeight: 'bold',
              arrowColor: '#FF9600',
            }}
            dayComponent={({ date, state, marking }: any) => {
              const status: 'COMPLETED' | 'FROZEN' | undefined = marking?.status;
              const isCompleted = status === 'COMPLETED';
              const isFrozen = status === 'FROZEN';
              const isToday = state === 'today';
              const isDisabled = state === 'disabled';

              return (
                <View
                  style={[
                    styles.dayCell,
                    isCompleted && styles.dayCellCompleted,
                    isFrozen && styles.dayCellFrozen,
                    isToday && !isCompleted && !isFrozen && styles.dayCellToday,
                  ]}
                >
                  {isCompleted && (
                    <FontAwesome5
                      name="fire-alt"
                      size={12}
                      color="#FFFFFF"
                      style={styles.dayIcon}
                    />
                  )}
                  {isFrozen && <Text style={styles.dayIceEmoji}>🧊</Text>}
                  <Text
                    style={[
                      styles.dayText,
                      (isCompleted || isFrozen) && styles.dayTextSelected,
                      isDisabled && styles.dayTextDisabled,
                      isToday && !isCompleted && !isFrozen && styles.dayTextToday,
                    ]}
                  >
                    {date.day}
                  </Text>
                </View>
              );
            }}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  backButton: { width: 40, height: 40, justifyContent: 'center' },
  refreshButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  title: { fontSize: 20, fontWeight: 'bold', color: '#2C3A47' },
  content: { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 40 },

  streakShowcase: {
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 24,
    shadowColor: '#FF9600',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  icon: { marginBottom: 10 },
  streakNumber: { fontSize: 48, fontWeight: 'bold', color: '#2C3A47' },
  streakLabel: {
    fontSize: 16,
    color: '#8CA0B3',
    fontWeight: '600',
    marginBottom: 20,
  },

  metricsRow: {
    flexDirection: 'row',
    width: '100%',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    justifyContent: 'space-around',
  },
  metricBox: { alignItems: 'center', flex: 1, gap: 4 },
  metricDivider: { width: 1, backgroundColor: '#E2E8F0' },
  metricValue: { fontSize: 15, fontWeight: 'bold', color: '#2C3A47' },
  metricLabel: { fontSize: 12, color: '#8CA0B3' },
  freezeEmoji: { fontSize: 16 },

  calendarContainer: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFF',
    paddingBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },

  dayCell: {
    width: 40,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  dayCellCompleted: {
    backgroundColor: '#FF9600',
    shadowColor: '#FF9600',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 3,
  },
  dayCellFrozen: {
    backgroundColor: '#38BDF8',
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  dayCellToday: {
    borderWidth: 2,
    borderColor: '#1CB0F6',
  },
  dayIcon: {
    marginBottom: 2,
  },
  dayIceEmoji: {
    fontSize: 11,
    marginBottom: 1,
  },
  dayText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#2C3A47',
  },
  dayTextSelected: {
    color: '#FFFFFF',
  },
  dayTextDisabled: {
    color: '#E2E8F0',
  },
  dayTextToday: {
    color: '#1CB0F6',
  },
});
