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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { api } from '@/services/api';
import { useTheme } from '@/hooks/use-theme';
import { useClassroomStore } from '@/store/useClassroomStore';
import { RoleGuard } from '@/components/RoleGuard';

interface CustomQuestion {
  id: string;
  year: number;
  area: string;
  subject: string;
  topic?: string | null;
  difficulty?: string | null;
  text: string;
  options: string[];
  correctAnswer: number;
  explanation?: string | null;
}

interface TaskTemplate {
  id: string;
  title: string;
  topic: string;
  description?: string | null;
  questionIds: string[];
  createdAt: string;
}

export default function TeacherBankScreen() {
  const router = useRouter();
  const theme = useTheme();
  const classrooms = useClassroomStore((s) => s.classrooms);
  const fetchClassrooms = useClassroomStore((s) => s.fetchClassrooms);

  const [tab, setTab] = useState<'QUESTIONS' | 'TEMPLATES'>('QUESTIONS');
  const [questions, setQuestions] = useState<CustomQuestion[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Formulário de questão autoral
  const [subject, setSubject] = useState('Matemática');
  const [area, setArea] = useState('Matemática');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<'EASY' | 'MEDIUM' | 'HARD'>('MEDIUM');
  const [promptText, setPromptText] = useState('');
  const [opts, setOpts] = useState(['', '', '', '', '']);
  const [correctIdx, setCorrectIdx] = useState(0);
  const [explanation, setExplanation] = useState('');
  const [isSavingQ, setIsSavingQ] = useState(false);

  // Formulário de modelo de lista
  const [tplTitle, setTplTitle] = useState('');
  const [tplTopic, setTplTopic] = useState('');
  const [selectedQIds, setSelectedQIds] = useState<string[]>([]);
  const [isSavingTpl, setIsSavingTpl] = useState(false);
  const [applyingTplId, setApplyingTplId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [qList, tList] = await Promise.all([
        api.get<CustomQuestion[]>('/teacher-bank/questions'),
        api.get<TaskTemplate[]>('/teacher-bank/templates'),
      ]);
      setQuestions(Array.isArray(qList) ? qList : []);
      setTemplates(Array.isArray(tList) ? tList : []);
    } catch {
      Alert.alert('Erro', 'Não foi possível carregar o banco autoral.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    fetchClassrooms();
  }, [loadData, fetchClassrooms]);

  const handleCreateQuestion = async () => {
    if (promptText.trim().length < 10 || opts.some((o) => !o.trim())) {
      Alert.alert(
        'Campos obrigatórios',
        'Preencha o enunciado (mínimo 10 caracteres) e todas as 5 alternativas (A–E).'
      );
      return;
    }

    setIsSavingQ(true);
    try {
      const created = await api.post<CustomQuestion>('/teacher-bank/questions', {
        year: new Date().getFullYear(),
        area,
        subject,
        topic: topic.trim() || undefined,
        difficulty,
        text: promptText.trim(),
        options: opts.map((o) => o.trim()),
        correctAnswer: correctIdx,
        explanation: explanation.trim() || undefined,
      });
      setQuestions((prev) => [created, ...prev]);
      setPromptText('');
      setOpts(['', '', '', '', '']);
      setExplanation('');
      setTopic('');
      Alert.alert('Sucesso', 'Questão autoral salva no seu banco!');
    } catch (err: any) {
      Alert.alert('Erro', err?.message || 'Não foi possível salvar a questão.');
    } finally {
      setIsSavingQ(false);
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    try {
      await api.delete(`/teacher-bank/questions/${id}`);
      setQuestions((prev) => prev.filter((q) => q.id !== id));
    } catch {
      Alert.alert('Erro', 'Não foi possível remover a questão.');
    }
  };

  const handleCreateTemplate = async () => {
    if (!tplTitle.trim() || !tplTopic.trim()) {
      Alert.alert('Campos obrigatórios', 'Informe título e tema do modelo de lista.');
      return;
    }
    setIsSavingTpl(true);
    try {
      const created = await api.post<TaskTemplate>('/teacher-bank/templates', {
        title: tplTitle.trim(),
        topic: tplTopic.trim(),
        questionIds: selectedQIds,
      });
      setTemplates((prev) => [created, ...prev]);
      setTplTitle('');
      setTplTopic('');
      setSelectedQIds([]);
      Alert.alert('Modelo salvo!', 'Agora você pode aplicar esta lista em qualquer turma com 1 clique.');
    } catch (err: any) {
      Alert.alert('Erro', err?.message || 'Não foi possível salvar o modelo.');
    } finally {
      setIsSavingTpl(false);
    }
  };

  const handleApplyTemplate = async (tpl: TaskTemplate) => {
    if (classrooms.length === 0) {
      Alert.alert('Sem turmas', 'Crie uma turma primeiro para aplicar este modelo.');
      return;
    }
    setApplyingTplId(tpl.id);
    try {
      const res = await api.post<{ appliedCount: number }>(
        `/teacher-bank/templates/${tpl.id}/apply`,
        { classroomIds: classrooms.map((c) => c.id) }
      );
      Alert.alert(
        'Lista Aplicada!',
        `Modelo "${tpl.title}" publicado em ${res.appliedCount} turma(s) com notificação automática aos alunos.`
      );
    } catch (err: any) {
      Alert.alert('Erro', err?.message || 'Não foi possível aplicar o modelo.');
    } finally {
      setApplyingTplId(null);
    }
  };

  return (
    <RoleGuard allowedRoles={['TEACHER', 'SCHOOL', 'ADMIN']}>
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
            Banco Autoral do Professor
          </Text>
          <Text style={[styles.headerSub, { color: theme.textMuted }]}>
            Questões próprias e modelos reutilizáveis de listas/simulados
          </Text>
        </View>
      </View>

      {/* ABAS */}
      <View
        style={[
          styles.tabsBar,
          { backgroundColor: theme.surface, borderBottomColor: theme.border },
        ]}
      >
        {[
          { key: 'QUESTIONS', label: `Questões (${questions.length})`, icon: 'file-alt' },
          { key: 'TEMPLATES', label: `Modelos (${templates.length})`, icon: 'layer-group' },
        ].map((t) => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key as any)}
              style={[
                styles.tabBtn,
                active && { borderBottomColor: theme.primary, borderBottomWidth: 3 },
              ]}
            >
              <FontAwesome5
                name={t.icon}
                size={13}
                color={active ? theme.primary : theme.textMuted}
              />
              <Text
                style={{
                  fontSize: 13,
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
          {tab === 'QUESTIONS' ? (
            <>
              <View
                style={[
                  styles.card,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}
              >
                <Text style={[styles.cardTitle, { color: theme.text }]}>
                  Nova Questão Autoral
                </Text>

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
                    placeholder="Matéria (ex: Física)"
                    placeholderTextColor={theme.textMuted}
                    value={subject}
                    onChangeText={setSubject}
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
                    placeholder="Área (ex: Natureza)"
                    placeholderTextColor={theme.textMuted}
                    value={area}
                    onChangeText={setArea}
                  />
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
                  placeholder="Tópico específico (opcional)"
                  placeholderTextColor={theme.textMuted}
                  value={topic}
                  onChangeText={setTopic}
                />

                <TextInput
                  style={[
                    styles.input,
                    {
                      minHeight: 88,
                      textAlignVertical: 'top',
                      backgroundColor: theme.surfaceMuted,
                      borderColor: theme.border,
                      color: theme.text,
                    },
                  ]}
                  multiline
                  placeholder="Enunciado da questão..."
                  placeholderTextColor={theme.textMuted}
                  value={promptText}
                  onChangeText={setPromptText}
                />

                {opts.map((val, idx) => (
                  <View key={idx} style={styles.optRow}>
                    <TouchableOpacity
                      onPress={() => setCorrectIdx(idx)}
                      style={[
                        styles.optLetterBtn,
                        {
                          backgroundColor:
                            correctIdx === idx ? '#16A34A' : theme.surfaceMuted,
                          borderColor:
                            correctIdx === idx ? '#16A34A' : theme.border,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontWeight: '800',
                          color: correctIdx === idx ? '#FFF' : theme.text,
                        }}
                      >
                        {String.fromCharCode(65 + idx)}
                      </Text>
                    </TouchableOpacity>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          flex: 1,
                          marginBottom: 0,
                          backgroundColor: theme.surfaceMuted,
                          borderColor: theme.border,
                          color: theme.text,
                        },
                      ]}
                      placeholder={`Alternativa ${String.fromCharCode(65 + idx)}`}
                      placeholderTextColor={theme.textMuted}
                      value={val}
                      onChangeText={(txt) =>
                        setOpts((prev) => prev.map((p, i) => (i === idx ? txt : p)))
                      }
                    />
                  </View>
                ))}

                <Text style={{ fontSize: 11.5, color: theme.textMuted, marginBottom: 10 }}>
                  Toque na letra (A–E) para definir o gabarito oficial (verde).
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
                  placeholder="Resolução comentada (opcional)"
                  placeholderTextColor={theme.textMuted}
                  value={explanation}
                  onChangeText={setExplanation}
                />

                <TouchableOpacity
                  onPress={handleCreateQuestion}
                  disabled={isSavingQ}
                  style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
                >
                  {isSavingQ ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <FontAwesome5 name="plus" size={13} color="#FFF" />
                      <Text style={styles.primaryBtnText}>Salvar Questão Autoral</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {questions.map((q) => (
                <View
                  key={q.id}
                  style={[
                    styles.card,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                  ]}
                >
                  <View style={styles.itemHeader}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: theme.primary }}>
                      {q.subject} • {q.area} • Gabarito {String.fromCharCode(65 + q.correctAnswer)}
                    </Text>
                    <TouchableOpacity onPress={() => handleDeleteQuestion(q.id)}>
                      <FontAwesome5 name="trash-alt" size={13} color="#DC2626" />
                    </TouchableOpacity>
                  </View>
                  <Text style={{ color: theme.text, fontSize: 14, lineHeight: 20 }}>
                    {q.text}
                  </Text>
                </View>
              ))}
            </>
          ) : (
            <>
              <View
                style={[
                  styles.card,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}
              >
                <Text style={[styles.cardTitle, { color: theme.text }]}>
                  Criar Modelo Reutilizável de Lista
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
                  placeholder="Título do modelo (ex: Revisão Revisonal Física 3º Ano)"
                  placeholderTextColor={theme.textMuted}
                  value={tplTitle}
                  onChangeText={setTplTitle}
                />
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.surfaceMuted,
                      borderColor: theme.border,
                      color: theme.text,
                    },
                  ]}
                  placeholder="Assunto / Disciplina"
                  placeholderTextColor={theme.textMuted}
                  value={tplTopic}
                  onChangeText={setTplTopic}
                />

                {questions.length > 0 && (
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textMuted, marginBottom: 6 }}>
                      Selecionar questões autorais ({selectedQIds.length} marcadas):
                    </Text>
                    {questions.slice(0, 8).map((q) => {
                      const checked = selectedQIds.includes(q.id);
                      return (
                        <TouchableOpacity
                          key={q.id}
                          onPress={() =>
                            setSelectedQIds((prev) =>
                              checked ? prev.filter((id) => id !== q.id) : [...prev, q.id]
                            )
                          }
                          style={[
                            styles.pickRow,
                            {
                              backgroundColor: theme.surfaceMuted,
                              borderColor: checked ? theme.primary : theme.border,
                            },
                          ]}
                        >
                          <FontAwesome5
                            name={checked ? 'check-square' : 'square'}
                            size={14}
                            color={checked ? theme.primary : theme.textMuted}
                          />
                          <Text
                            style={{ flex: 1, fontSize: 12.5, color: theme.text }}
                            numberOfLines={1}
                          >
                            {q.text}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                <TouchableOpacity
                  onPress={handleCreateTemplate}
                  disabled={isSavingTpl}
                  style={[styles.primaryBtn, { backgroundColor: '#7C3AED' }]}
                >
                  {isSavingTpl ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <FontAwesome5 name="save" size={13} color="#FFF" />
                      <Text style={styles.primaryBtnText}>Salvar Modelo de Lista</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {templates.map((tpl) => (
                <View
                  key={tpl.id}
                  style={[
                    styles.card,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                  ]}
                >
                  <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 4 }]}>
                    {tpl.title}
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12.5, marginBottom: 12 }}>
                    Tema: {tpl.topic} • {tpl.questionIds.length} questão(ões) vinculadas
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleApplyTemplate(tpl)}
                    disabled={applyingTplId === tpl.id}
                    style={[styles.primaryBtn, { backgroundColor: '#16A34A' }]}
                  >
                    {applyingTplId === tpl.id ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <>
                        <FontAwesome5 name="paper-plane" size={12} color="#FFF" />
                        <Text style={styles.primaryBtnText}>
                          Aplicar em Todas as Minhas Turmas ({classrooms.length})
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
    </RoleGuard>
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
    gap: 8,
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
  row2: { flexDirection: 'row', gap: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13.5,
    marginBottom: 10,
  },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  optLetterBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
  },
});
