import React, { useState, useEffect, useCallback } from 'react';
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
import * as WebBrowser from 'expo-web-browser';
import { api, BASE_URL } from '@/services/api';
import { useTheme } from '@/hooks/use-theme';
import { useUserStore } from '@/store/useUserStore';

interface InstitutionalExamItem {
  id: string;
  title: string;
  description?: string | null;
  durationMinutes: number;
  startsAt: string;
  endsAt: string;
  status: string;
  questionsCount: number;
  classroomsCount: number;
  attemptsCount: number;
  averageTriScore: number | null;
}

interface DropoutAlert {
  studentId: string;
  name: string;
  email: string;
  classroomName: string;
  daysInactive: number | null;
  accuracyPercent: number | null;
  riskLevel: 'HIGH' | 'MEDIUM';
  reasons: string[];
}

export default function SchoolOperationsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const token = useUserStore((s) => s.token);

  const [activeTab, setActiveTab] = useState<'EXAMS' | 'IMPORT' | 'ALERTS'>('EXAMS');
  const [isLoading, setIsLoading] = useState(true);

  // Simulados Institucionais
  const [exams, setExams] = useState<InstitutionalExamItem[]>([]);
  const [examTitle, setExamTitle] = useState('');
  const [examDuration, setExamDuration] = useState('90');
  const [examQCount, setExamQCount] = useState('20');
  const [isCreatingExam, setIsCreatingExam] = useState(false);

  // Importação em Massa
  const [bulkText, setBulkText] = useState(
    'Maria Eduarda, maria.eduarda@escola.com, STUDENT\nJoão Pedro, joao.pedro@escola.com, STUDENT'
  );
  const [defaultClassroomCode, setDefaultClassroomCode] = useState('');
  const [defaultRole, setDefaultRole] = useState<'STUDENT' | 'TEACHER'>('STUDENT');
  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<string | null>(null);

  // Alertas Preventivos de Evasão
  const [alerts, setAlerts] = useState<DropoutAlert[]>([]);
  const [monitoredCount, setMonitoredCount] = useState(0);
  const [nudgingId, setNudgingId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [examRes, alertRes] = await Promise.all([
        api.get<InstitutionalExamItem[]>('/institutional-exams').catch(() => []),
        api
          .get<{ totalMonitoredStudents: number; alerts: DropoutAlert[] }>(
            '/schools/me/dropout-alerts'
          )
          .catch(() => ({ totalMonitoredStudents: 0, alerts: [] })),
      ]);
      setExams(Array.isArray(examRes) ? examRes : []);
      setAlerts(Array.isArray(alertRes?.alerts) ? alertRes.alerts : []);
      setMonitoredCount(alertRes?.totalMonitoredStudents || 0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleScheduleExam = async () => {
    if (!examTitle.trim()) {
      Alert.alert('Informe o título', 'Digite o nome do simulado institucional.');
      return;
    }
    setIsCreatingExam(true);
    try {
      const now = Date.now();
      await api.post('/institutional-exams', {
        title: examTitle.trim(),
        durationMinutes: Number(examDuration) || 90,
        autoQuestionCount: Number(examQCount) || 20,
        startsAt: new Date(now).toISOString(),
        endsAt: new Date(now + 7 * 86_400_000).toISOString(),
      });
      setExamTitle('');
      await loadAll();
      Alert.alert(
        'Simulado Agendado!',
        'Todas as turmas da escola foram vinculadas e os alunos notificados automaticamente.'
      );
    } catch (err: any) {
      Alert.alert('Erro', err?.message || 'Falha ao agendar simulado.');
    } finally {
      setIsCreatingExam(false);
    }
  };

  const handleDownloadExamPdf = async (exam: InstitutionalExamItem) => {
    try {
      const url = `${BASE_URL}/institutional-exams/${exam.id}/report-pdf`;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const resp = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!resp.ok) throw new Error('Falha ao baixar PDF comparativo.');
        const blob = await resp.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `simulado-comparativo-${exam.id.slice(0, 8)}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(blobUrl);
      } else {
        await WebBrowser.openBrowserAsync(url);
      }
    } catch (err: any) {
      Alert.alert('Erro', err?.message || 'Não foi possível exportar o PDF.');
    }
  };

  const handleBulkImport = async () => {
    if (!bulkText.trim()) return;
    setIsImporting(true);
    setImportSummary(null);
    try {
      const res = await api.post<any>('/schools/me/import-users', {
        rawText: bulkText,
        defaultRole,
        defaultClassroomCode: defaultClassroomCode.trim() || undefined,
      });
      setImportSummary(
        `Concluído: ${res.createdCount} criado(s), ${res.skippedCount} já existente(s). Senha padrão: ${res.defaultPasswordUsed}`
      );
      await loadAll();
    } catch (err: any) {
      Alert.alert('Erro na Importação', err?.message || 'Verifique o formato das linhas.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleNudge = async (studentIds: string[], key: string) => {
    setNudgingId(key);
    try {
      const res = await api.post<{ notifiedCount: number }>(
        '/schools/me/dropout-alerts/nudge',
        { studentIds }
      );
      Alert.alert(
        'Incentivo Enviado!',
        `${res.notifiedCount} aluno(s) receberam notificação imediata para retomar os estudos.`
      );
    } catch {
      Alert.alert('Erro', 'Não foi possível enviar o incentivo.');
    } finally {
      setNudgingId(null);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View
        style={[
          styles.header,
          { backgroundColor: theme.surface, borderBottomColor: theme.border },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <FontAwesome5 name="arrow-left" size={18} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            Gestão Escolar Avançada
          </Text>
          <Text style={[styles.headerSub, { color: theme.textMuted }]}>
            Simulados unificados, importação em massa e retenção
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.tabsBar,
          { backgroundColor: theme.surface, borderBottomColor: theme.border },
        ]}
      >
        {[
          { key: 'EXAMS', label: 'Simulados', icon: 'file-signature' },
          { key: 'IMPORT', label: 'Importar', icon: 'users-cog' },
          { key: 'ALERTS', label: `Alertas (${alerts.length})`, icon: 'exclamation-triangle' },
        ].map((t) => {
          const active = activeTab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => setActiveTab(t.key as any)}
              style={[
                styles.tabBtn,
                active && { borderBottomColor: theme.primary, borderBottomWidth: 3 },
              ]}
            >
              <FontAwesome5
                name={t.icon}
                size={12}
                color={active ? theme.primary : theme.textMuted}
              />
              <Text
                style={{
                  fontSize: 12.5,
                  fontWeight: '800',
                  color: active ? theme.primary : theme.textMuted,
                }}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {activeTab === 'EXAMS' && (
            <>
              <View
                style={[
                  styles.card,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}
              >
                <Text style={[styles.cardTitle, { color: theme.text }]}>
                  Agendar Simulado Institucional Unificado
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.surfaceMuted,
                      borderColor: theme.border,
                      color: theme.text,
                    },
                  ]}
                  placeholder="Ex.: Simulado Geral ENEM 2026 — 1º Semestre"
                  placeholderTextColor={theme.textMuted}
                  value={examTitle}
                  onChangeText={setExamTitle}
                />
                <View style={styles.row2}>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        flex: 1,
                        backgroundColor: theme.surfaceMuted,
                        borderColor: theme.border,
                        color: theme.text,
                      },
                    ]}
                    keyboardType="numeric"
                    placeholder="Duração (min)"
                    placeholderTextColor={theme.textMuted}
                    value={examDuration}
                    onChangeText={setExamDuration}
                  />
                  <TextInput
                    style={[
                      styles.input,
                      {
                        flex: 1,
                        backgroundColor: theme.surfaceMuted,
                        borderColor: theme.border,
                        color: theme.text,
                      },
                    ]}
                    keyboardType="numeric"
                    placeholder="Qtd. questões"
                    placeholderTextColor={theme.textMuted}
                    value={examQCount}
                    onChangeText={setExamQCount}
                  />
                </View>

                <TouchableOpacity
                  onPress={handleScheduleExam}
                  disabled={isCreatingExam}
                  style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
                >
                  {isCreatingExam ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <FontAwesome5 name="calendar-plus" size={13} color="#FFF" />
                      <Text style={styles.primaryBtnText}>
                        Publicar Simulado para Todas as Turmas
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {exams.map((ex) => (
                <View
                  key={ex.id}
                  style={[
                    styles.card,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                  ]}
                >
                  <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 4 }]}>
                    {ex.title}
                  </Text>
                  <Text style={{ fontSize: 12.5, color: theme.textMuted, marginBottom: 12 }}>
                    {ex.questionsCount} questões • {ex.attemptsCount} entregas • Média TRI:{' '}
                    {ex.averageTriScore ?? '—'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleDownloadExamPdf(ex)}
                    style={[styles.primaryBtn, { backgroundColor: '#DC2626' }]}
                  >
                    <FontAwesome5 name="file-pdf" size={13} color="#FFF" />
                    <Text style={styles.primaryBtnText}>
                      Exportar Comparativo entre Turmas (PDF)
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </>
          )}

          {activeTab === 'IMPORT' && (
            <View
              style={[
                styles.card,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <Text style={[styles.cardTitle, { color: theme.text }]}>
                Importação em Massa de Alunos e Professores
              </Text>
              <Text style={{ fontSize: 12.5, color: theme.textMuted, marginBottom: 12 }}>
                Cole uma pessoa por linha no formato: Nome, email@escola.com, STUDENT ou TEACHER
              </Text>

              <View style={styles.row2}>
                {(['STUDENT', 'TEACHER'] as const).map((r) => (
                  <TouchableOpacity
                    key={r}
                    onPress={() => setDefaultRole(r)}
                    style={[
                      styles.rolePill,
                      {
                        flex: 1,
                        backgroundColor:
                          defaultRole === r ? theme.primary : theme.surfaceMuted,
                        borderColor:
                          defaultRole === r ? theme.primary : theme.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontWeight: '800',
                        fontSize: 12.5,
                        color: defaultRole === r ? '#FFF' : theme.text,
                      }}
                    >
                      Padrão: {r === 'STUDENT' ? 'Alunos' : 'Professores'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.surfaceMuted,
                    borderColor: theme.border,
                    color: theme.text,
                  },
                ]}
                placeholder="Código da turma padrão (opcional, ex: ENEM-3A)"
                placeholderTextColor={theme.textMuted}
                value={defaultClassroomCode}
                onChangeText={setDefaultClassroomCode}
                autoCapitalize="characters"
              />

              <TextInput
                style={[
                  styles.input,
                  {
                    minHeight: 130,
                    textAlignVertical: 'top',
                    backgroundColor: theme.surfaceMuted,
                    borderColor: theme.border,
                    color: theme.text,
                  },
                ]}
                multiline
                value={bulkText}
                onChangeText={setBulkText}
                placeholder="Nome, email@escola.com"
                placeholderTextColor={theme.textMuted}
              />

              <TouchableOpacity
                onPress={handleBulkImport}
                disabled={isImporting}
                style={[styles.primaryBtn, { backgroundColor: '#16A34A' }]}
              >
                {isImporting ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <FontAwesome5 name="user-plus" size={13} color="#FFF" />
                    <Text style={styles.primaryBtnText}>Importar Usuários Agora</Text>
                  </>
                )}
              </TouchableOpacity>

              {importSummary && (
                <View
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 10,
                    backgroundColor: theme.isDark ? '#052E16' : '#DCFCE7',
                  }}
                >
                  <Text style={{ color: '#16A34A', fontWeight: '700', fontSize: 12.5 }}>
                    {importSummary}
                  </Text>
                </View>
              )}
            </View>
          )}

          {activeTab === 'ALERTS' && (
            <>
              <View
                style={[
                  styles.card,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}
              >
                <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 4 }]}>
                  Monitoramento Preventivo de Evasão
                </Text>
                <Text style={{ fontSize: 12.5, color: theme.textMuted, marginBottom: 12 }}>
                  {monitoredCount} aluno(s) monitorado(s) • {alerts.length} alerta(s) ativo(s)
                </Text>

                {alerts.length > 0 && (
                  <TouchableOpacity
                    onPress={() =>
                      handleNudge(
                        alerts.map((a) => a.studentId),
                        'ALL'
                      )
                    }
                    disabled={nudgingId === 'ALL'}
                    style={[styles.primaryBtn, { backgroundColor: '#D97706' }]}
                  >
                    {nudgingId === 'ALL' ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <>
                        <FontAwesome5 name="bell" size={13} color="#FFF" />
                        <Text style={styles.primaryBtnText}>
                          Enviar Incentivo para Todos ({alerts.length})
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              {alerts.length === 0 ? (
                <View
                  style={[
                    styles.card,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                      alignItems: 'center',
                      paddingVertical: 28,
                    },
                  ]}
                >
                  <FontAwesome5 name="check-circle" size={32} color="#16A34A" />
                  <Text style={{ color: theme.text, fontWeight: '800', marginTop: 10 }}>
                    Nenhum aluno em risco de evasão!
                  </Text>
                </View>
              ) : (
                alerts.map((a) => (
                  <View
                    key={a.studentId}
                    style={[
                      styles.card,
                      {
                        backgroundColor: theme.surface,
                        borderColor: a.riskLevel === 'HIGH' ? '#DC2626' : '#D97706',
                      },
                    ]}
                  >
                    <View style={styles.alertTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800' }}>
                          {a.name}
                        </Text>
                        <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                          {a.classroomName} • {a.email}
                        </Text>
                      </View>
                      <View
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 8,
                          backgroundColor:
                            a.riskLevel === 'HIGH' ? '#FEE2E2' : '#FEF3C7',
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: '800',
                            color: a.riskLevel === 'HIGH' ? '#DC2626' : '#B45309',
                          }}
                        >
                          {a.riskLevel === 'HIGH' ? 'Risco Alto' : 'Atenção'}
                        </Text>
                      </View>
                    </View>

                    <View style={{ marginVertical: 10, gap: 4 }}>
                      {a.reasons.map((r, i) => (
                        <Text key={i} style={{ fontSize: 12.5, color: theme.textSecondary }}>
                          • {r}
                        </Text>
                      ))}
                    </View>

                    <TouchableOpacity
                      onPress={() => handleNudge([a.studentId], a.studentId)}
                      disabled={nudgingId === a.studentId}
                      style={[styles.nudgeBtn, { backgroundColor: theme.surfaceMuted }]}
                    >
                      <FontAwesome5 name="paper-plane" size={11} color={theme.primary} />
                      <Text style={{ fontSize: 12, fontWeight: '800', color: theme.primary }}>
                        {nudgingId === a.studentId
                          ? 'Enviando...'
                          : 'Enviar Notificação de Apoio'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800' },
  headerSub: { fontSize: 12, marginTop: 1 },
  tabsBar: { flexDirection: 'row', borderBottomWidth: 1 },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
  },
  centerLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    maxWidth: 820,
    width: '100%',
    alignSelf: 'center',
    gap: 14,
  },
  card: { borderRadius: 16, borderWidth: 1, padding: 16 },
  cardTitle: { fontSize: 15.5, fontWeight: '800', marginBottom: 12 },
  row2: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  rolePill: {
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13.5,
    marginBottom: 10,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  primaryBtnText: { color: '#FFF', fontSize: 13.5, fontWeight: '800' },
  alertTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  nudgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
});
