import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { RoleGuard } from '@/components/RoleGuard';
import { Badge } from '@/components/b2b/Badge';
import { SkeletonLoader } from '@/components/b2b/SkeletonLoader';
import { AdminSchoolModal } from '@/components/b2b/AdminSchoolModal';

interface SchoolItem {
  id: string;
  name: string;
  code: string;
  slug: string;
  cnpj?: string | null;
  isActive: boolean;
  createdAt: string;
  usersCount: number;
  classroomsCount: number;
  managers: Array<{ id: string; name: string; email: string }>;
}

interface SchoolsResponse {
  schools: SchoolItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export default function AdminSchoolsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [modalVisible, setModalVisible] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Consulta de escolas
  const { data, isLoading, isError, refetch } = useQuery<SchoolsResponse>({
    queryKey: ['admin-schools', search, statusFilter],
    queryFn: async () => {
      let endpoint = `/admin/schools?search=${encodeURIComponent(search)}`;
      if (statusFilter === 'ACTIVE') endpoint += '&isActive=true';
      if (statusFilter === 'INACTIVE') endpoint += '&isActive=false';
      return api.get<SchoolsResponse>(endpoint);
    },
  });

  // Mutação para ativar/desativar escola
  const toggleStatusMutation = useMutation({
    mutationFn: async ({ schoolId, isActive }: { schoolId: string; isActive: boolean }) => {
      setActionLoadingId(schoolId);
      return api.patch(`/admin/schools/${schoolId}/status`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-schools'] });
    },
    onError: (err: any) => {
      const msg = err?.message || 'Falha ao alterar o status da escola.';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Erro', msg);
      }
    },
    onSettled: () => {
      setActionLoadingId(null);
    },
  });

  const handleToggleStatus = (school: SchoolItem) => {
    const nextStatus = !school.isActive;
    const confirmMessage = nextStatus
      ? `Deseja ativar a escola "${school.name}"?`
      : `Deseja desativar a escola "${school.name}"? Os gestores e alunos perderão acesso até a reativação.`;

    if (Platform.OS === 'web') {
      if (window.confirm(confirmMessage)) {
        toggleStatusMutation.mutate({ schoolId: school.id, isActive: nextStatus });
      }
    } else {
      Alert.alert('Alterar Status', confirmMessage, [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: nextStatus ? 'Ativar' : 'Desativar',
          style: nextStatus ? 'default' : 'destructive',
          onPress: () => toggleStatusMutation.mutate({ schoolId: school.id, isActive: nextStatus }),
        },
      ]);
    }
  };

  const schools = data?.schools || [];
  const totalCount = data?.pagination?.total ?? schools.length;

  return (
    <RoleGuard allowedRoles={['ADMIN']}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {/* Top Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleArea}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
              activeOpacity={0.7}
            >
              <FontAwesome5 name="arrow-left" size={16} color="#4B5563" />
            </TouchableOpacity>
            <View>
              <View style={styles.badgeAdmin}>
                <FontAwesome5 name="shield-alt" size={11} color="#9333EA" style={{ marginRight: 5 }} />
                <Text style={styles.badgeAdminText}>Administração Central</Text>
              </View>
              <Text style={styles.headerTitle}>Gestão de Escolas</Text>
              <Text style={styles.headerSubtitle}>
                {totalCount} instituição(ões) parceira(s) cadastrada(s)
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.newSchoolButton}
            onPress={() => setModalVisible(true)}
            activeOpacity={0.8}
          >
            <FontAwesome5 name="plus" size={14} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.newSchoolButtonText}>Nova Escola</Text>
          </TouchableOpacity>
        </View>

        {/* Search and Filters Bar */}
        <View style={styles.filtersBar}>
          <View style={styles.searchBox}>
            <FontAwesome5 name="search" size={14} color="#9CA3AF" style={{ marginRight: 10 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar por nome, código ou CNPJ..."
              placeholderTextColor="#9CA3AF"
              value={search}
              onChangeText={setSearch}
            />
            {search ? (
              <TouchableOpacity onPress={() => setSearch('')} style={{ padding: 4 }}>
                <FontAwesome5 name="times-circle" size={14} color="#9CA3AF" />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.filterPills}>
            <TouchableOpacity
              style={[styles.pill, statusFilter === 'ALL' && styles.pillActive]}
              onPress={() => setStatusFilter('ALL')}
            >
              <Text style={[styles.pillText, statusFilter === 'ALL' && styles.pillTextActive]}>
                Todas
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.pill, statusFilter === 'ACTIVE' && styles.pillActive]}
              onPress={() => setStatusFilter('ACTIVE')}
            >
              <Text style={[styles.pillText, statusFilter === 'ACTIVE' && styles.pillTextActive]}>
                Ativas
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.pill, statusFilter === 'INACTIVE' && styles.pillActive]}
              onPress={() => setStatusFilter('INACTIVE')}
            >
              <Text style={[styles.pillText, statusFilter === 'INACTIVE' && styles.pillTextActive]}>
                Inativas
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Content List */}
        <ScrollView
          style={styles.scrollContent}
          contentContainerStyle={styles.scrollInner}
          showsVerticalScrollIndicator={false}
        >
          {isLoading ? (
            <View style={styles.skeletonList}>
              {[1, 2, 3, 4].map((i) => (
                <View key={i} style={styles.skeletonCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                    <SkeletonLoader width="40%" height={20} />
                    <SkeletonLoader width={70} height={22} borderRadius={11} />
                  </View>
                  <SkeletonLoader width="65%" height={14} style={{ marginBottom: 8 }} />
                  <SkeletonLoader width="30%" height={14} />
                </View>
              ))}
            </View>
          ) : isError ? (
            <View style={styles.errorContainer}>
              <FontAwesome5 name="exclamation-triangle" size={32} color="#EF4444" />
              <Text style={styles.errorTitle}>Não foi possível carregar as escolas</Text>
              <Text style={styles.errorDesc}>
                Ocorreu um erro ao comunicar com a API. Verifique a conexão e tente novamente.
              </Text>
              <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
                <FontAwesome5 name="sync-alt" size={13} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.retryButtonText}>Tentar Novamente</Text>
              </TouchableOpacity>
            </View>
          ) : schools.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <FontAwesome5 name="school" size={32} color="#9CA3AF" />
              </View>
              <Text style={styles.emptyTitle}>Nenhuma escola encontrada</Text>
              <Text style={styles.emptyDesc}>
                {search
                  ? 'Nenhum resultado corresponde à sua pesquisa.'
                  : 'Cadastre a primeira instituição escolar para iniciar o acompanhamento.'}
              </Text>
              <TouchableOpacity
                style={styles.emptyAddButton}
                onPress={() => setModalVisible(true)}
              >
                <FontAwesome5 name="plus" size={13} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.emptyAddButtonText}>Cadastrar Escola</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.schoolsGrid}>
              {schools.map((school) => {
                const isToggling = actionLoadingId === school.id;
                const manager = school.managers?.[0];

                return (
                  <View key={school.id} style={styles.schoolCard}>
                    <View style={styles.cardHeader}>
                      <View style={styles.cardHeaderLeft}>
                        <View style={styles.schoolIconCircle}>
                          <FontAwesome5 name="school" size={18} color="#1CB0F6" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.schoolName} numberOfLines={1}>
                            {school.name}
                          </Text>
                          <View style={styles.codeRow}>
                            <Text style={styles.schoolCode}>Código: {school.code}</Text>
                            {school.cnpj ? (
                              <Text style={styles.schoolCnpj}>• CNPJ: {school.cnpj}</Text>
                            ) : null}
                          </View>
                        </View>
                      </View>

                      <Badge
                        label={school.isActive ? 'Ativa' : 'Inativa'}
                        variant={school.isActive ? 'success' : 'danger'}
                      />
                    </View>

                    {/* Stats Row */}
                    <View style={styles.cardStatsRow}>
                      <View style={styles.statItem}>
                        <FontAwesome5 name="users" size={12} color="#6B7280" style={{ marginRight: 6 }} />
                        <Text style={styles.statItemText}>
                          <Text style={{ fontWeight: '700', color: '#1F2937' }}>
                            {school.classroomsCount}
                          </Text>{' '}
                          turma(s)
                        </Text>
                      </View>

                      <View style={styles.statItem}>
                        <FontAwesome5
                          name="user-graduate"
                          size={12}
                          color="#6B7280"
                          style={{ marginRight: 6 }}
                        />
                        <Text style={styles.statItemText}>
                          <Text style={{ fontWeight: '700', color: '#1F2937' }}>
                            {school.usersCount}
                          </Text>{' '}
                          membro(s)
                        </Text>
                      </View>
                    </View>

                    {/* Manager Info */}
                    <View style={styles.managerBox}>
                      <FontAwesome5
                        name="user-tie"
                        size={12}
                        color="#4B5563"
                        style={{ marginRight: 8, marginTop: 2 }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.managerName}>
                          Gestor: {manager ? manager.name : 'Nenhum gestor vinculado'}
                        </Text>
                        {manager?.email ? (
                          <Text style={styles.managerEmail}>{manager.email}</Text>
                        ) : null}
                      </View>
                    </View>

                    {/* Actions Row */}
                    <View style={styles.cardActions}>
                      <TouchableOpacity
                        style={[
                          styles.statusToggleBtn,
                          school.isActive ? styles.btnDeactivate : styles.btnActivate,
                        ]}
                        onPress={() => handleToggleStatus(school)}
                        disabled={isToggling}
                        activeOpacity={0.7}
                      >
                        {isToggling ? (
                          <ActivityIndicator
                            size="small"
                            color={school.isActive ? '#DC2626' : '#16A34A'}
                          />
                        ) : (
                          <>
                            <FontAwesome5
                              name={school.isActive ? 'toggle-on' : 'toggle-off'}
                              size={14}
                              color={school.isActive ? '#DC2626' : '#16A34A'}
                              style={{ marginRight: 6 }}
                            />
                            <Text
                              style={[
                                styles.statusToggleBtnText,
                                { color: school.isActive ? '#DC2626' : '#16A34A' },
                              ]}
                            >
                              {school.isActive ? 'Desativar Escola' : 'Ativar Escola'}
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>

        {/* Modal de Cadastro de Nova Escola */}
        <AdminSchoolModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['admin-schools'] });
          }}
        />
      </SafeAreaView>
    </RoleGuard>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F9FC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    flexWrap: 'wrap',
    gap: 12,
  },
  headerTitleArea: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  badgeAdmin: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  badgeAdminText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9333EA',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  newSchoolButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1CB0F6',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    shadowColor: '#1CB0F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  newSchoolButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  filtersBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 14,
    gap: 12,
    flexWrap: 'wrap',
  },
  searchBox: {
    flex: 1,
    minWidth: 260,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
  },
  filterPills: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  pillActive: {
    backgroundColor: '#1CB0F6',
    borderColor: '#1CB0F6',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
  scrollContent: {
    flex: 1,
  },
  scrollInner: {
    padding: 24,
  },
  schoolsGrid: {
    gap: 16,
  },
  schoolCard: {
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  schoolIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E0F2FE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  schoolName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    flexWrap: 'wrap',
  },
  schoolCode: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  schoolCnpj: {
    fontSize: 12,
    color: '#9CA3AF',
    marginLeft: 6,
  },
  cardStatsRow: {
    flexDirection: 'row',
    gap: 20,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F3F4F6',
    marginBottom: 12,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItemText: {
    fontSize: 13,
    color: '#6B7280',
  },
  managerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F9FAFB',
    padding: 10,
    borderRadius: 10,
    marginBottom: 14,
  },
  managerName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  managerEmail: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  statusToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
  },
  btnActivate: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  btnDeactivate: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  statusToggleBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  skeletonList: {
    gap: 16,
  },
  skeletonCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  errorContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 36,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#991B1B',
    marginTop: 12,
  },
  errorDesc: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 18,
    maxWidth: 400,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EF4444',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  emptyContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  emptyDesc: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
    maxWidth: 360,
  },
  emptyAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1CB0F6',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  emptyAddButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});

