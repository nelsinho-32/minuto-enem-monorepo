import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useUserStore } from '@/store/useUserStore';

export interface SchoolAnnouncementItem {
  id: string;
  schoolId: string;
  title: string;
  content: string;
  targetAudience: 'ALL' | 'TEACHERS_ONLY';
  createdAt: string;
  school?: {
    id: string;
    name: string;
    code?: string;
  };
}

export function SchoolMuralCard() {
  const user = useUserStore((state) => state.user);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Busca os comunicados institucionais pertinentes ao usuário logado
  const {
    data: announcements = [],
    isLoading,
    refetch,
  } = useQuery<SchoolAnnouncementItem[]>({
    queryKey: ['institutional-announcements', user?.id],
    queryFn: async () => {
      try {
        const res = await api.get<SchoolAnnouncementItem[]>('/announcements');
        return Array.isArray(res) ? res : [];
      } catch {
        return [];
      }
    },
    enabled: Boolean(user?.id),
    staleTime: 1000 * 60 * 3, // 3 minutos de cache
  });

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#1CB0F6" />
        <Text style={styles.loadingText}>Carregando avisos da escola...</Text>
      </View>
    );
  }

  // Se o aluno ou professor não tiver nenhum comunicado institucional ativo, não polui a tela
  if (!Array.isArray(announcements) || announcements.length === 0) {
    return null;
  }

  const schoolName = announcements[0]?.school?.name || 'Sua Escola';

  return (
    <View style={styles.container}>
      {/* Header do Mural com MegaFone e Nome da Escola */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={styles.megaphoneCircle}>
            <FontAwesome5 name="bullhorn" size={15} color="#2563EB" />
          </View>
          <View>
            <View style={styles.titleBadgeRow}>
              <Text style={styles.muralTitle}>Mural da Escola</Text>
              <View style={styles.schoolPill}>
                <Text style={styles.schoolPillText} numberOfLines={1}>
                  {schoolName}
                </Text>
              </View>
            </View>
            <Text style={styles.muralSub}>
              Comunicados e avisos oficiais da direção e coordenação
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={() => refetch()}
          activeOpacity={0.7}
        >
          <FontAwesome5 name="sync-alt" size={12} color="#64748B" />
        </TouchableOpacity>
      </View>

      {/* Lista de Comunicados com Destaque Visual */}
      <View style={styles.cardsList}>
        {announcements.map((item, idx) => {
          const isTeachersOnly = item.targetAudience === 'TEACHERS_ONLY';
          const isExpanded = expandedId === item.id || (announcements.length === 1 && idx === 0);
          const isLongContent = item.content.length > 140;

          const formattedDate = new Date(item.createdAt).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          });

          return (
            <View
              key={item.id}
              style={[
                styles.announcementCard,
                isTeachersOnly ? styles.cardTeacherAudience : styles.cardGeneralAudience,
              ]}
            >
              <View style={styles.cardTopRow}>
                {/* Badge de Público-Alvo */}
                <View
                  style={[
                    styles.audienceBadge,
                    isTeachersOnly ? styles.badgeTeacher : styles.badgeGeneral,
                  ]}
                >
                  <FontAwesome5
                    name={isTeachersOnly ? 'chalkboard-teacher' : 'users'}
                    size={10}
                    color={isTeachersOnly ? '#2563EB' : '#16A34A'}
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    style={[
                      styles.audienceBadgeText,
                      isTeachersOnly ? styles.textTeacher : styles.textGeneral,
                    ]}
                  >
                    {isTeachersOnly ? 'Apenas Professores' : 'Geral (Todos)'}
                  </Text>
                </View>

                {/* Data de Publicação */}
                <View style={styles.dateRow}>
                  <FontAwesome5 name="clock" size={10} color="#94A3B8" style={{ marginRight: 4 }} />
                  <Text style={styles.dateText}>{formattedDate}</Text>
                </View>
              </View>

              {/* Título do Comunicado */}
              <Text style={styles.announcementTitle}>{item.title}</Text>

              {/* Conteúdo / Mensagem */}
              <Text
                style={styles.announcementBody}
                numberOfLines={isExpanded ? undefined : 3}
              >
                {item.content}
              </Text>

              {/* Botão de Expandir / Recolher se for longo */}
              {isLongContent && (
                <TouchableOpacity
                  style={styles.expandToggleBtn}
                  onPress={() => setExpandedId(isExpanded ? null : item.id)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.expandToggleText}>
                    {isExpanded ? 'Ver menos' : 'Ler comunicado completo'}
                  </Text>
                  <FontAwesome5
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={10}
                    color="#2563EB"
                  />
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#BFDBFE', // destaque azul institucional
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 16,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  megaphoneCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  muralTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E293B',
  },
  schoolPill: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  schoolPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  muralSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  refreshBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
  },
  cardsList: {
    gap: 12,
  },
  announcementCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardGeneralAudience: {
    borderLeftColor: '#10B981', // Verde para todos
  },
  cardTeacherAudience: {
    borderLeftColor: '#2563EB', // Azul para professores
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  audienceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeGeneral: {
    backgroundColor: '#DCFCE7',
  },
  badgeTeacher: {
    backgroundColor: '#DBEAFE',
  },
  audienceBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  textGeneral: {
    color: '#15803D',
  },
  textTeacher: {
    color: '#1E40AF',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  announcementTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
    lineHeight: 18,
  },
  announcementBody: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 19,
  },
  expandToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  expandToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
});

