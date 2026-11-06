import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { SkeletonLoader } from './SkeletonLoader';

export interface ErrorSubjectItem {
  subject: string;
  topic?: string;
  errorCount: number;
  totalAttempts: number;
  errorPercent: number;
}

interface HeatmapCardProps {
  items: ErrorSubjectItem[];
  loading?: boolean;
  onAssignReinforcement?: (subject: string) => void;
}

function getErrorColor(percent: number): { bar: string; bg: string; text: string } {
  if (percent >= 60) {
    return { bar: '#EF4444', bg: '#FEE2E2', text: '#B91C1C' };
  }
  if (percent >= 40) {
    return { bar: '#F59E0B', bg: '#FEF3C7', text: '#B45309' };
  }
  return { bar: '#1CB0F6', bg: '#E0F2FE', text: '#0369A1' };
}

export function HeatmapCard({
  items,
  loading = false,
  onAssignReinforcement,
}: HeatmapCardProps) {
  if (loading) {
    return (
      <View style={styles.container}>
        <SkeletonLoader width={220} height={22} style={{ marginBottom: 16 }} />
        {[1, 2, 3].map((i) => (
          <View key={i} style={styles.itemSkeleton}>
            <SkeletonLoader width="60%" height={16} />
            <SkeletonLoader width="100%" height={10} style={{ marginVertical: 8 }} />
            <SkeletonLoader width="40%" height={12} />
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <View style={styles.fireIcon}>
            <FontAwesome5 name="fire-alt" size={16} color="#EF4444" />
          </View>
          <View>
            <Text style={styles.title}>Mapa de Calor de Dúvidas</Text>
            <Text style={styles.subtitle}>Top assuntos com maior índice de erro nas tarefas da turma</Text>
          </View>
        </View>
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <FontAwesome5 name="clipboard-list" size={26} color="#64748B" />
          </View>
          <Text style={styles.emptyTitle}>Nenhum dado de desempenho ainda</Text>
          <Text style={styles.emptyText}>
            Envie uma lista de exercícios para começar a gerar o mapa de calor desta turma.
          </Text>
          {onAssignReinforcement ? (
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => onAssignReinforcement('')}
              activeOpacity={0.8}
            >
              <FontAwesome5 name="plus" size={12} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.emptyButtonText}>Criar Lista de Exercícios</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <View style={styles.list}>
          {items.map((item, index) => {
            const colors = getErrorColor(item.errorPercent);
            const parts = item.subject.includes(' - ')
              ? item.subject.split(' - ')
              : item.subject.includes(' • ')
              ? item.subject.split(' • ')
              : null;
            const mainSubject = parts ? parts[0]?.trim() : null;
            const subTopic = parts ? parts.slice(1).join(' - ').trim() : item.subject;

            return (
              <View key={item.subject + index} style={styles.rowItem}>
                <View style={styles.rowTop}>
                  <View style={styles.subjectInfo}>
                    <Text style={styles.rankIndex}>#{index + 1}</Text>
                    <View style={styles.subjectTextContainer}>
                      {mainSubject && (
                        <View style={styles.mainSubjectTag}>
                          <Text style={styles.mainSubjectTagText} numberOfLines={1}>
                            {mainSubject}
                          </Text>
                        </View>
                      )}
                      <Text style={styles.subjectName} numberOfLines={2}>
                        {subTopic}
                      </Text>
                      {item.topic && item.topic !== item.subject && item.topic !== subTopic && (
                        <Text style={styles.topicName} numberOfLines={1}>
                          Tópico: {item.topic}
                        </Text>
                      )}
                    </View>
                  </View>
                  <View style={[styles.percentBadge, { backgroundColor: colors.bg }]}>
                    <Text style={[styles.percentText, { color: colors.text }]}>
                      {item.errorPercent}% erro
                    </Text>
                  </View>
                </View>

                {/* Barra de Progresso do Erro */}
                <View style={styles.progressBarTrack}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${Math.min(item.errorPercent, 100)}%`,
                        backgroundColor: colors.bar,
                      },
                    ]}
                  />
                </View>

                <View style={styles.rowBottom}>
                  <Text style={styles.attemptDetails}>
                    {item.errorCount} erros em {item.totalAttempts} questões resolvidas
                  </Text>
                  {onAssignReinforcement ? (
                    <TouchableOpacity
                      style={styles.reinforceButton}
                      onPress={() => onAssignReinforcement(subTopic || item.subject)}
                      activeOpacity={0.7}
                    >
                      <FontAwesome5
                        name="plus-circle"
                        size={12}
                        color="#1CB0F6"
                        style={{ marginRight: 6 }}
                      />
                      <Text style={styles.reinforceButtonText}>Criar Reforço</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
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
  header: {
    marginBottom: 16,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fireIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  list: {
    gap: 16,
  },
  rowItem: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  subjectInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  rankIndex: {
    fontSize: 12,
    fontWeight: '800',
    color: '#9CA3AF',
    marginRight: 8,
  },
  subjectName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
    flex: 1,
  },
  percentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  percentText: {
    fontSize: 11,
    fontWeight: '700',
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  attemptDetails: {
    fontSize: 12,
    color: '#6B7280',
  },
  reinforceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  reinforceButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1CB0F6',
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginTop: 4,
  },
  emptyText: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    maxWidth: 320,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1CB0F6',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    marginTop: 18,
    shadowColor: '#1CB0F6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  subjectTextContainer: {
    flex: 1,
  },
  mainSubjectTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 2,
  },
  mainSubjectTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2563EB',
    textTransform: 'uppercase',
  },
  topicName: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  itemSkeleton: {
    marginBottom: 16,
  },
});

