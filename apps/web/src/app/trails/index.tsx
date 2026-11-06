import React, { useState } from 'react';
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
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { safeAsyncStorage as AsyncStorage } from '@/services/safeStorage';
import { api } from '@/services/api';
import { useUserStore } from '@/store/useUserStore';

export interface TrailItem {
  id: string;
  day: '1' | '2';
  difficulty: 'facil' | 'medio' | 'dificil';
  title: string;
  description: string;
  limit: number;
  timeInMinutes: number;
  completedQuestions: number;
  totalQuestions: number;
  progressPercentage: number;
  isCompleted: boolean;
  stars: number;
  color: string;
  icon: string;
}

const TRAILS_CACHE_KEY_PREFIX = '@minuto_enem:trails_cache_v1_';

function getDefaultTrailTemplate(day: '1' | '2'): TrailItem[] {
  return [
    {
      id: `trail_${day}_facil`,
      day,
      difficulty: 'facil',
      title: 'Nível Fácil',
      description: '10 questões • 60 min',
      limit: 10,
      timeInMinutes: 60,
      completedQuestions: 0,
      totalQuestions: 10,
      progressPercentage: 0,
      isCompleted: false,
      stars: 0,
      color: '#58CC02',
      icon: 'smile',
    },
    {
      id: `trail_${day}_medio`,
      day,
      difficulty: 'medio',
      title: 'Nível Médio',
      description: '20 questões • 90 min',
      limit: 20,
      timeInMinutes: 90,
      completedQuestions: 0,
      totalQuestions: 20,
      progressPercentage: 0,
      isCompleted: false,
      stars: 0,
      color: '#FF9600',
      icon: 'brain',
    },
    {
      id: `trail_${day}_dificil`,
      day,
      difficulty: 'dificil',
      title: 'Nível Difícil',
      description: '45 questões • 150 min',
      limit: 45,
      timeInMinutes: 150,
      completedQuestions: 0,
      totalQuestions: 45,
      progressPercentage: 0,
      isCompleted: false,
      stars: 0,
      color: '#FF4B4B',
      icon: 'fire',
    },
  ];
}

async function fetchTrailsFromApi(day: '1' | '2', userId?: string): Promise<TrailItem[]> {
  const cacheKey = `${TRAILS_CACHE_KEY_PREFIX}${day}`;
  try {
    const rawTrails = await api.get<any[]>(
      `/trails${userId ? `?userId=${userId}` : ''}`
    );

    if (Array.isArray(rawTrails) && rawTrails.length > 0) {
      // Filtra as trilhas reais cadastradas no PostgreSQL pelo dia da prova do ENEM
      const dayMatches = rawTrails.filter((t) => {
        const areaLower = (t.area || '').toLowerCase();
        if (day === '1') {
          return (
            areaLower.includes('humanas') ||
            areaLower.includes('linguagens') ||
            areaLower.includes('ch') ||
            areaLower.includes('lc')
          );
        } else {
          return (
            areaLower.includes('natureza') ||
            areaLower.includes('matemática') ||
            areaLower.includes('cn') ||
            areaLower.includes('mt')
          );
        }
      });

      const itemsToMap = dayMatches.length > 0 ? dayMatches : rawTrails;

      const mappedTrails: TrailItem[] = itemsToMap.map((t, idx) => {
        const totalSteps =
          t.totalSteps ||
          t.questionIds?.length ||
          t.lessonIds?.length ||
          10;
        const completed = t.userProgress?.completedSteps || 0;
        const progressPct =
          t.userProgress?.progressPercent ||
          Math.min(100, Math.round((completed / Math.max(totalSteps, 1)) * 100));
        const isCompleted =
          t.userProgress?.status === 'COMPLETED' || progressPct >= 100;

        let diff: 'facil' | 'medio' | 'dificil' = 'medio';
        if (idx % 3 === 0) diff = 'facil';
        else if (idx % 3 === 2) diff = 'dificil';

        let color = '#FF9600';
        if (diff === 'facil') color = '#58CC02';
        if (diff === 'dificil') color = '#FF4B4B';

        return {
          id: t.id,
          day,
          difficulty: diff,
          title: t.title,
          description: t.description || `${totalSteps} etapas • ${t.area}`,
          limit: totalSteps,
          timeInMinutes: totalSteps * 5,
          completedQuestions: completed,
          totalQuestions: totalSteps,
          progressPercentage: progressPct,
          isCompleted,
          stars: isCompleted ? 3 : progressPct >= 50 ? 2 : progressPct > 0 ? 1 : 0,
          color,
          icon: t.subject?.icon && t.subject.icon !== 'book' ? t.subject.icon : 'route',
        };
      });

      await AsyncStorage.setItem(cacheKey, JSON.stringify(mappedTrails));
      return mappedTrails;
    }
  } catch {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {
        // Ignora erro
      }
    }
  }
  return getDefaultTrailTemplate(day);
}

export default function TrailsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useUserStore((state) => state.user);
  const [selectedDay, setSelectedDay] = useState<'1' | '2'>('1');

  // TanStack Query conectado ao banco de dados com suporte Offline-First
  const {
    data: trails = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<TrailItem[], Error>({
    queryKey: ['trails', selectedDay, user?.id],
    queryFn: () => fetchTrailsFromApi(selectedDay, user?.id),
    networkMode: 'offlineFirst',
  });

  // Mutação para registrar o progresso e início da trilha no banco de dados
  const startTrailMutation = useMutation({
    mutationFn: async (trail: TrailItem) => {
      try {
        await api.post('/trails/start', {
          userId: user?.id,
          trailId: trail.id,
          day: trail.day,
          difficulty: trail.difficulty,
          startedAt: new Date().toISOString(),
        });
      } catch {
        // Falha tolerante para permitir início offline
      }
    },
  });

  const handleStartTrail = async (trail: TrailItem) => {
    startTrailMutation.mutate(trail);

    router.push({
      pathname: '/quiz',
      params: {
        mode: 'trilha',
        day: trail.day,
        difficulty: trail.difficulty,
        limit: trail.limit,
        time: trail.timeInMinutes,
      },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <FontAwesome5 name="arrow-left" size={20} color="#2C3A47" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trilhas de Questões</Text>
        <TouchableOpacity
          onPress={() => refetch()}
          style={styles.refreshButton}
          disabled={isRefetching}
        >
          {isRefetching ? (
            <ActivityIndicator size="small" color="#1CB0F6" />
          ) : (
            <FontAwesome5 name="sync-alt" size={16} color="#8CA0B3" />
          )}
        </TouchableOpacity>
      </View>

      {/* SELETOR DE DIA DO ENEM */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, selectedDay === '1' && styles.tabActive]}
          onPress={() => setSelectedDay('1')}
        >
          <Text
            style={[styles.tabText, selectedDay === '1' && styles.tabTextActive]}
          >
            1º Dia do ENEM
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, selectedDay === '2' && styles.tabActive]}
          onPress={() => setSelectedDay('2')}
        >
          <Text
            style={[styles.tabText, selectedDay === '2' && styles.tabTextActive]}
          >
            2º Dia do ENEM
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.subtitle}>
        {selectedDay === '1'
          ? 'Linguagens, Ciências Humanas e Redação.'
          : 'Matemática e Ciências da Natureza.'}
      </Text>

      {isLoading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#1CB0F6" />
          <Text style={styles.loadingText}>Carregando seu progresso nas trilhas...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.cardsContainer}
          showsVerticalScrollIndicator={false}
        >
          {trails.map((trail) => {
            const hasStarted = trail.progressPercentage > 0;

            return (
              <TouchableOpacity
                key={trail.id}
                style={[styles.card, { borderColor: trail.color }]}
                activeOpacity={0.8}
                onPress={() => handleStartTrail(trail)}
              >
                <View style={styles.cardTopRow}>
                  <View
                    style={[
                      styles.iconBox,
                      { backgroundColor: `${trail.color}18` },
                    ]}
                  >
                    <FontAwesome5
                      name={trail.icon}
                      size={24}
                      color={trail.color}
                    />
                  </View>

                  <View style={styles.cardContent}>
                    <View style={styles.titleBadgeRow}>
                      <Text style={styles.cardTitle}>{trail.title}</Text>
                      {trail.isCompleted && (
                        <View style={styles.completedBadge}>
                          <FontAwesome5
                            name="check"
                            size={10}
                            color="#58CC02"
                          />
                          <Text style={styles.completedBadgeText}>
                            Concluído
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.cardDesc}>{trail.description}</Text>
                  </View>

                  <FontAwesome5
                    name="chevron-right"
                    size={16}
                    color="#8CA0B3"
                    style={{ marginLeft: 8 }}
                  />
                </View>

                {/* BARRA DE PROGRESSO REAL SALVA NO BANCO DE DADOS */}
                <View style={styles.progressContainer}>
                  <View style={styles.progressHeader}>
                    <Text style={styles.progressLabel}>
                      Progresso na Trilha
                    </Text>
                    <Text style={styles.progressValue}>
                      {trail.completedQuestions}/{trail.totalQuestions} ({trail.progressPercentage}%)
                    </Text>
                  </View>
                  <View style={styles.progressBarBg}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          width: `${Math.min(100, trail.progressPercentage)}%`,
                          backgroundColor: trail.color,
                        },
                      ]}
                    />
                  </View>
                </View>

                {/* RODAPÉ DO CARD: ESTRELAS E STATUS */}
                <View style={styles.cardFooter}>
                  <View style={styles.starsRow}>
                    {[1, 2, 3].map((starIdx) => (
                      <FontAwesome5
                        key={starIdx}
                        name="star"
                        solid={trail.stars >= starIdx}
                        size={12}
                        color={trail.stars >= starIdx ? '#F1C40F' : '#E2E8F0'}
                      />
                    ))}
                    <Text style={styles.starsLabel}>
                      {trail.stars > 0 ? `${trail.stars}/3 Estrelas` : 'Sem estrelas'}
                    </Text>
                  </View>

                  <Text style={[styles.actionLinkText, { color: trail.color }]}>
                    {trail.isCompleted
                      ? 'Refazer Trilha'
                      : hasStarted
                      ? 'Continuar Trilha'
                      : 'Iniciar Trilha'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
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
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#2C3A47' },

  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: '#E2E8F0',
    borderRadius: 16,
    padding: 4,
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 12 },
  tabActive: {
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: { fontSize: 14, fontWeight: 'bold', color: '#8CA0B3' },
  tabTextActive: { color: '#2C3A47' },

  subtitle: {
    textAlign: 'center',
    color: '#8CA0B3',
    marginTop: 12,
    fontStyle: 'italic',
    marginBottom: 8,
    fontSize: 13,
  },

  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#8CA0B3',
    fontWeight: 'bold',
  },

  cardsContainer: { padding: 20, gap: 16, paddingBottom: 40 },
  card: {
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 20,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconBox: {
    width: 50,
    height: 50,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  cardContent: { flex: 1 },
  titleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  cardTitle: { fontSize: 17, fontWeight: 'bold', color: '#2C3A47' },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EBFBEF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  completedBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#58CC02',
  },
  cardDesc: { fontSize: 13, color: '#8CA0B3' },

  progressContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: { fontSize: 11, fontWeight: 'bold', color: '#64748B' },
  progressValue: { fontSize: 11, fontWeight: 'bold', color: '#1E293B' },
  progressBarBg: {
    width: '100%',
    height: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  starsLabel: {
    fontSize: 11,
    color: '#8CA0B3',
    fontWeight: '600',
    marginLeft: 4,
  },
  actionLinkText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
});
