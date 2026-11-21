import { useThemedStyles, useTheme } from '@/hooks/use-theme';
import React, { useState } from 'react';
import {
  SISU_INSTITUTIONS,
  SISU_COURSE_DEFINITIONS,
  SISU_MODALITIES,
} from '@minuto-enem/shared';
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
  const styles = useThemedStyles(baseStyles);
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [adminTab, setAdminTab] = useState<'SCHOOLS' | 'TENANTS' | 'QUESTIONS' | 'SISU'>('SCHOOLS');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [modalVisible, setModalVisible] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [recalibrating, setRecalibrating] = useState(false);

  // Form de atualização dinâmica de notas SISU
  const [sisuInst, setSisuInst] = useState('USP');
  const [sisuCourseSlug, setSisuCourseSlug] = useState('medicina');
  const [sisuModality, setSisuModality] = useState('AC');
  const [sisuScore, setSisuScore] = useState('840');
  const [sisuEdition, setSisuEdition] = useState('SISU 2026');
  const [savingSisu, setSavingSisu] = useState(false);

  const { data: tenantsData, refetch: refetchTenants } = useQuery<any>({
    queryKey: ['admin-tenants-overview'],
    queryFn: () => api.get('/admin/tenants/overview'),
    enabled: adminTab === 'TENANTS',
  });

  const { data: qHealthData, refetch: refetchQHealth } = useQuery<any>({
    queryKey: ['admin-questions-health'],
    queryFn: () => api.get('/admin/questions/health'),
    enabled: adminTab === 'QUESTIONS',
  });

  const { data: sisuOverrides = [], refetch: refetchSisuOverrides } = useQuery<any[]>({
    queryKey: ['admin-sisu-overrides'],
    queryFn: () => api.get('/admin/sisu/overrides'),
    enabled: adminTab === 'SISU',
  });

  const handleRecalibrateQuestions = async () => {
    setRecalibrating(true);
    try {
      const res = await api.post<{ message: string }>('/admin/questions/recalibrate', {});
      refetchQHealth();
      if (Platform.OS === 'web') window.alert(res.message);
      else Alert.alert('Recalibração concluída', res.message);
    } catch (err: any) {
      const msg = err?.message || 'Erro ao recalibrar questões.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Erro', msg);
    } finally {
      setRecalibrating(false);
    }
  };

  const handleSaveSisuOverride = async () => {
    setSavingSisu(true);
    try {
      await api.put('/admin/sisu/overrides', {
        institution: sisuInst,
        courseSlug: sisuCourseSlug,
        modality: sisuModality,
        cutoffScore: Number(sisuScore) || 750,
        referenceEdition: sisuEdition,
      });
      refetchSisuOverrides();
      if (Platform.OS === 'web') window.alert('Nota de corte SISU atualizada com sucesso!');
      else Alert.alert('Salvo!', 'Nota de corte SISU atualizada em tempo real.');
    } catch (err: any) {
      const msg = err?.message || 'Erro ao atualizar nota SISU.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Erro', msg);
    } finally {
      setSavingSisu(false);
    }
  };

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

        {/* Barra de Abas Administrativas */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ maxHeight: 50, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border }}
          contentContainerStyle={{ paddingHorizontal: 16, alignItems: 'center', gap: 8 }}
        >
          {(
            [
              { key: 'SCHOOLS', label: 'Escolas', icon: 'school' },
              { key: 'TENANTS', label: 'Tenants & Storage', icon: 'server' },
              { key: 'QUESTIONS', label: 'Saúde Questões', icon: 'stethoscope' },
              { key: 'SISU', label: 'Notas SISU', icon: 'university' },
            ] as const
          ).map((t) => {
            const active = adminTab === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                onPress={() => setAdminTab(t.key)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: active ? '#7C3AED' : theme.surfaceMuted,
                }}
              >
                <FontAwesome5 name={t.icon} size={11} color={active ? '#FFF' : theme.textMuted} />
                <Text style={{ fontSize: 12, fontWeight: '800', color: active ? '#FFF' : theme.textMuted }}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Search and Filters Bar (somente na aba Escolas) */}
        {adminTab === 'SCHOOLS' && (
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
        )}

        {/* Content List */}
        <ScrollView
          style={styles.scrollContent}
          contentContainerStyle={styles.scrollInner}
          showsVerticalScrollIndicator={false}
        >
          {adminTab === 'TENANTS' && (
            <View style={{ gap: 12 }}>
              <View style={{ backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: 16, padding: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: theme.text }}>
                    Monitoramento Global de Tenants & Storage
                  </Text>
                  <TouchableOpacity onPress={() => refetchTenants()}>
                    <FontAwesome5 name="sync-alt" size={13} color={theme.primary} />
                  </TouchableOpacity>
                </View>
                <Text style={{ fontSize: 12.5, color: theme.textMuted, marginTop: 4 }}>
                  Provedor de Storage ativo: <Text style={{ fontWeight: '800', color: theme.primary }}>{String(tenantsData?.storageProvider || 'local').toUpperCase()}</Text>
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
                  {[
                    { label: 'Escolas Ativas', value: tenantsData?.summary?.schoolsActive ?? 0, color: '#16A34A' },
                    { label: 'Usuários Ativos', value: tenantsData?.summary?.usersActive ?? 0, color: '#0284C7' },
                    { label: 'Redações (Storage)', value: tenantsData?.summary?.essaysCount ?? 0, color: '#7C3AED' },
                    { label: 'Áudios Devolutiva', value: tenantsData?.summary?.audioFeedbacksCount ?? 0, color: '#EA580C' },
                    { label: 'PDFs de Turmas', value: tenantsData?.summary?.pdfsCount ?? 0, color: '#D97706' },
                  ].map((kpi) => (
                    <View
                      key={kpi.label}
                      style={{
                        minWidth: 130,
                        flex: 1,
                        padding: 12,
                        borderRadius: 12,
                        backgroundColor: theme.surfaceMuted,
                        borderWidth: 1,
                        borderColor: theme.border,
                      }}
                    >
                      <Text style={{ fontSize: 20, fontWeight: '900', color: kpi.color }}>{kpi.value}</Text>
                      <Text style={{ fontSize: 11.5, fontWeight: '700', color: theme.textMuted }}>{kpi.label}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {(tenantsData?.tenants || []).map((t: any) => (
                <View
                  key={t.id}
                  style={{
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    borderWidth: 1,
                    borderRadius: 14,
                    padding: 14,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: theme.text }}>
                      {t.name} ({t.code})
                    </Text>
                    <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
                      {t.usersCount} usuários • {t.classroomsCount} turmas • {t.examsCount} simulados
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11.5, fontWeight: '800', color: t.isActive ? '#16A34A' : '#DC2626' }}>
                    {t.isActive ? 'ATIVA' : 'INATIVA'}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {adminTab === 'QUESTIONS' && (
            <View style={{ gap: 12 }}>
              <View style={{ backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: 16, padding: 16 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: theme.text }}>
                  Curadoria e Saúde do Banco de Questões
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
                  {[
                    { label: 'Total Questões', value: qHealthData?.totalQuestions ?? 0, color: '#0284C7' },
                    { label: 'Sem Explicação', value: qHealthData?.withoutExplanation ?? 0, color: '#D97706' },
                    { label: 'Sem Dificuldade', value: qHealthData?.withoutDifficulty ?? 0, color: '#7C3AED' },
                    { label: 'Erro Anômalo (>=80%)', value: qHealthData?.highErrorCount ?? 0, color: '#DC2626' },
                  ].map((item) => (
                    <View
                      key={item.label}
                      style={{
                        minWidth: 130,
                        flex: 1,
                        padding: 12,
                        borderRadius: 12,
                        backgroundColor: theme.surfaceMuted,
                        borderWidth: 1,
                        borderColor: theme.border,
                      }}
                    >
                      <Text style={{ fontSize: 20, fontWeight: '900', color: item.color }}>{item.value}</Text>
                      <Text style={{ fontSize: 11.5, fontWeight: '700', color: theme.textMuted }}>{item.label}</Text>
                    </View>
                  ))}
                </View>

                <TouchableOpacity
                  disabled={recalibrating}
                  onPress={handleRecalibrateQuestions}
                  style={{
                    marginTop: 14,
                    backgroundColor: '#7C3AED',
                    paddingVertical: 11,
                    borderRadius: 12,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 13 }}>
                    {recalibrating ? 'Recalibrando...' : 'Recalibrar Dificuldades pelo ErrorRate Real'}
                  </Text>
                </TouchableOpacity>
              </View>

              {(qHealthData?.flaggedQuestions || []).slice(0, 12).map((q: any) => (
                <View
                  key={q.id}
                  style={{
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    borderWidth: 1,
                    borderRadius: 14,
                    padding: 13,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '800', color: theme.primary }}>
                    {q.subject} ({q.year}) • {q.difficulty || 'SEM NÍVEL'} • Erro:{' '}
                    {typeof q.errorRate === 'number' ? `${Math.round(q.errorRate * 100)}%` : 'N/D'}
                  </Text>
                  <Text numberOfLines={2} style={{ fontSize: 12.5, color: theme.text, marginTop: 4 }}>
                    {q.text}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {adminTab === 'SISU' && (
            <View style={{ gap: 12 }}>
              <View style={{ backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: theme.text }}>
                  Atualização Dinâmica de Notas de Corte SISU
                </Text>
                <Text style={{ fontSize: 12, color: theme.textMuted }}>
                  Altere a nota de corte de qualquer curso/universidade/modalidade sem precisar de novo deploy:
                </Text>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {SISU_INSTITUTIONS.slice(0, 14).map((i) => (
                    <TouchableOpacity
                      key={i.sigla}
                      onPress={() => setSisuInst(i.sigla)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 8,
                        backgroundColor: sisuInst === i.sigla ? '#7C3AED' : theme.surfaceMuted,
                      }}
                    >
                      <Text style={{ fontSize: 11.5, fontWeight: '800', color: sisuInst === i.sigla ? '#FFF' : theme.text }}>
                        {i.sigla}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {SISU_COURSE_DEFINITIONS.slice(0, 12).map((c) => (
                    <TouchableOpacity
                      key={c.slug}
                      onPress={() => setSisuCourseSlug(c.slug)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 8,
                        backgroundColor: sisuCourseSlug === c.slug ? '#0284C7' : theme.surfaceMuted,
                      }}
                    >
                      <Text style={{ fontSize: 11.5, fontWeight: '800', color: sisuCourseSlug === c.slug ? '#FFF' : theme.text }}>
                        {c.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {SISU_MODALITIES.map((m) => (
                    <TouchableOpacity
                      key={m.code}
                      onPress={() => setSisuModality(m.code)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 8,
                        backgroundColor: sisuModality === m.code ? '#D97706' : theme.surfaceMuted,
                      }}
                    >
                      <Text style={{ fontSize: 11.5, fontWeight: '800', color: sisuModality === m.code ? '#FFF' : theme.text }}>
                        {m.shortLabel}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: theme.border,
                      backgroundColor: theme.surfaceMuted,
                      color: theme.text,
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 9,
                    }}
                    keyboardType="numeric"
                    value={sisuScore}
                    onChangeText={setSisuScore}
                    placeholder="Nota de corte (ex: 840)"
                    placeholderTextColor={theme.textMuted}
                  />
                  <TextInput
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: theme.border,
                      backgroundColor: theme.surfaceMuted,
                      color: theme.text,
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 9,
                    }}
                    value={sisuEdition}
                    onChangeText={setSisuEdition}
                    placeholder="Edição (ex: SISU 2026)"
                    placeholderTextColor={theme.textMuted}
                  />
                </View>

                <TouchableOpacity
                  disabled={savingSisu}
                  onPress={handleSaveSisuOverride}
                  style={{
                    backgroundColor: '#16A34A',
                    paddingVertical: 11,
                    borderRadius: 12,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 13 }}>
                    {savingSisu ? 'Salvando...' : `Salvar Corte (${sisuInst} • ${sisuCourseSlug} • ${sisuModality})`}
                  </Text>
                </TouchableOpacity>
              </View>

              {sisuOverrides.map((ov: any) => (
                <View
                  key={ov.id}
                  style={{
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    borderWidth: 1,
                    borderRadius: 12,
                    padding: 12,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: theme.text }}>
                      {ov.institution} • {ov.courseSlug} ({ov.modality})
                    </Text>
                    <Text style={{ fontSize: 11.5, color: theme.textMuted }}>{ov.referenceEdition}</Text>
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: '900', color: '#16A34A' }}>
                    {ov.cutoffScore} pts
                  </Text>
                </View>
              ))}
            </View>
          )}

          {adminTab === 'SCHOOLS' && (isLoading ? (
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
          ))}
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

const baseStyles = StyleSheet.create({
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

