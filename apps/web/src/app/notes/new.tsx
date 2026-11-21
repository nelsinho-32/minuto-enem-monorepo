import { useThemedStyles } from '@/hooks/use-theme';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { safeAsyncStorage as AsyncStorage } from '@/services/safeStorage';
import { api } from '@/services/api';
import { useUserStore } from '@/store/useUserStore';
import { useOfflineQueueStore } from '@/store/useOfflineQueueStore';

const NOTES_CACHE_KEY = '@minuto_enem:notes_cache_v1';

const SUBJECTS = [
  { id: 'mat', name: 'Matemática', color: '#FF4B4B' },
  { id: 'fis', name: 'Física', color: '#58CC02' },
  { id: 'qui', name: 'Química', color: '#10B981' },
  { id: 'bio', name: 'Biologia', color: '#16A34A' },
  { id: 'his', name: 'História', color: '#F59E0B' },
  { id: 'geo', name: 'Geografia', color: '#EA580C' },
  { id: 'red', name: 'Redação', color: '#1CB0F6' },
  { id: 'por', name: 'Português', color: '#8B5CF6' },
];

const STUDY_TEMPLATES = [
  {
    id: 'resumo',
    label: 'Modelo Resumo',
    icon: 'file-alt',
    color: '#0284C7',
    bg: '#E0F2FE',
    build: (subj: string) =>
      `📌 TEMA CENTRAL (${subj}):\n• \n\n🔑 CONCEITOS-CHAVE:\n• \n• \n\n⚡ MACETES E PEGADINHAS DO ENEM:\n• \n\n📝 PONTOS PARA REVISAR:\n• `,
  },
  {
    id: 'formulas',
    label: 'Fórmulas',
    icon: 'superscript',
    color: '#D97706',
    bg: '#FEF3C7',
    build: (subj: string) =>
      `📐 FÓRMULAS ESSENCIAIS (${subj}):\n\n1. Fórmula:\n   • Quando usar:\n   • Unidades (SI):\n\n2. Fórmula:\n   • Quando usar:\n   • Unidades (SI):\n\n💡 Exemplo resolvido:\n`,
  },
  {
    id: 'redacao',
    label: 'Projeto Redação',
    icon: 'pen-fancy',
    color: '#7C3AED',
    bg: '#F3E8FF',
    build: () =>
      `✍️ PROJETO DE TEXTO — REDAÇÃO ENEM\n\n1. INTRODUÇÃO (Contexto + Tese + Argumentos 1 e 2):\n• Repertório inicial:\n• Tese:\n\n2. DESENVOLVIMENTO 1 (Causa 1 + Repertório + Análise):\n• \n\n3. DESENVOLVIMENTO 2 (Causa 2 + Repertório + Análise):\n• \n\n4. CONCLUSÃO (Proposta de Intervenção — 5 elementos):\n• Agente:\n• Ação:\n• Meio/Modo:\n• Finalidade:\n• Detalhamento:`,
  },
];

export default function NewNoteScreen() {
  const styles = useThemedStyles(baseStyles);
  const router = useRouter();
  const params = useLocalSearchParams<{
    title?: string;
    content?: string;
    subject?: string;
  }>();
  const queryClient = useQueryClient();
  const user = useUserStore((state) => state.user);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (params.title && !title) setTitle(params.title);
    if (params.content && !content) setContent(params.content);
    if (params.subject && !selectedSubject) {
      const match = SUBJECTS.find((s) =>
        s.name.toLowerCase().includes(params.subject!.toLowerCase()) ||
        params.subject!.toLowerCase().includes(s.name.toLowerCase())
      );
      if (match) setSelectedSubject(match.id);
    }
  }, [params]);

  const selectedSubjectObj = SUBJECTS.find((s) => s.id === selectedSubject);
  const selectedSubjectName = selectedSubjectObj?.name || 'Geral';
  const selectedSubjectColor = selectedSubjectObj?.color || '#1CB0F6';

  const handleApplyTemplate = (templateId: string) => {
    const tpl = STUDY_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;
    if (templateId === 'redacao' && !selectedSubject) {
      setSelectedSubject('red');
    }
    const text = tpl.build(selectedSubjectName);
    setContent((prev) => (prev.trim() ? `${prev.trim()}\n\n${text}` : text));
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim() || !selectedSubject) {
      Alert.alert(
        'Quase lá!',
        'Preencha o título, selecione uma matéria e escreva algo na sua anotação antes de salvar.'
      );
      return;
    }

    setIsSaving(true);
    const newNotePayload = {
      id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId: user?.id,
      title: title.trim(),
      content: content.trim(),
      tags: [selectedSubjectName.toLowerCase(), 'general'],
      subject: selectedSubjectName,
      type: 'general',
      color: selectedSubjectColor,
      isFavorite: false,
      createdAt: new Date().toISOString(),
      date: 'Hoje',
    };

    try {
      await api.post('/notes', newNotePayload);
    } catch {
      await useOfflineQueueStore.getState().enqueueNoteUpsert({
        id: newNotePayload.id,
        title: newNotePayload.title,
        content: newNotePayload.content,
        tags: newNotePayload.tags,
      });

      try {
        const cachedRaw = await AsyncStorage.getItem(NOTES_CACHE_KEY);
        const list = cachedRaw ? JSON.parse(cachedRaw) : [];
        const updated = [newNotePayload, ...(Array.isArray(list) ? list : [])];
        await AsyncStorage.setItem(NOTES_CACHE_KEY, JSON.stringify(updated));
      } catch {
        // Falha silenciosa
      }
    } finally {
      setIsSaving(false);
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      Alert.alert('Sucesso!', 'Sua anotação foi salva no Caderno.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* CABEÇALHO */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <FontAwesome5 name="times" size={20} color="#64748B" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Nova Anotação</Text>
          <TouchableOpacity
            style={[styles.saveButton, isSaving && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <FontAwesome5 name="check" size={13} color="#FFF" />
                <Text style={styles.saveButtonText}>Salvar</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* TÍTULO */}
          <TextInput
            style={styles.titleInput}
            placeholder="Título da anotação (ex.: Leis de Newton)"
            placeholderTextColor="#94A3B8"
            value={title}
            onChangeText={setTitle}
            maxLength={120}
          />

          {/* SELETOR DE MATÉRIA */}
          <Text style={styles.sectionLabel}>Matéria</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.subjectsRow}
          >
            {SUBJECTS.map((subject) => {
              const isSelected = selectedSubject === subject.id;
              return (
                <TouchableOpacity
                  key={subject.id}
                  style={[
                    styles.subjectChip,
                    isSelected && {
                      backgroundColor: subject.color,
                      borderColor: subject.color,
                    },
                  ]}
                  onPress={() => setSelectedSubject(subject.id)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.subjectChipText,
                      isSelected && { color: '#FFFFFF' },
                    ]}
                  >
                    {subject.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* MODELOS RÁPIDOS DE ESTUDO */}
          <Text style={styles.sectionLabel}>Modelos Rápidos de Estudo</Text>
          <View style={styles.templatesRow}>
            {STUDY_TEMPLATES.map((tpl) => (
              <TouchableOpacity
                key={tpl.id}
                style={[styles.templateBtn, { backgroundColor: tpl.bg }]}
                onPress={() => handleApplyTemplate(tpl.id)}
                activeOpacity={0.8}
              >
                <FontAwesome5 name={tpl.icon} size={12} color={tpl.color} />
                <Text style={[styles.templateBtnText, { color: tpl.color }]}>
                  {tpl.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ÁREA DE ESCRITA */}
          <View style={styles.editorContainer}>
            <TextInput
              style={styles.contentInput}
              placeholder="Escreva seus macetes, resumos, fórmulas ou selecione um modelo rápido acima..."
              placeholderTextColor="#94A3B8"
              value={content}
              onChangeText={setContent}
              multiline
              textAlignVertical="top"
              autoCorrect={false}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const baseStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#16A34A',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 12,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  body: { flex: 1 },
  bodyContent: { padding: 18, paddingBottom: 40 },
  titleInput: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  subjectsRow: {
    gap: 8,
    paddingBottom: 16,
  },
  subjectChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  subjectChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  templatesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  templateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  templateBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  editorContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minHeight: 320,
    padding: 16,
  },
  contentInput: {
    flex: 1,
    minHeight: 290,
    fontSize: 15,
    lineHeight: 24,
    color: '#1E293B',
  },
});
