import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  LayoutAnimation,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { safeAsyncStorage as AsyncStorage } from '@/services/safeStorage';
import { api } from '@/services/api';
import { useUserStore } from '@/store/useUserStore';

const NOTES_CACHE_KEY = '@minuto_enem:notes_cache_v1';

export interface NoteItem {
  id: string;
  userId?: string;
  subject: string;
  title?: string;
  content: string;
  type?: 'question' | 'general';
  questionSnippet?: string;
  isFavorite: boolean;
  color?: string;
  icon?: string;
  date?: string;
  createdAt?: string;
}

function getSubjectColor(subject: string): { color: string; icon: string } {
  const norm = subject.toLowerCase();
  if (norm.includes('mat')) return { color: '#FF4B4B', icon: 'calculator' };
  if (norm.includes('fís') || norm.includes('fis')) return { color: '#58CC02', icon: 'atom' };
  if (norm.includes('quí') || norm.includes('qui')) return { color: '#58CC02', icon: 'flask' };
  if (norm.includes('his')) return { color: '#F1C40F', icon: 'monument' };
  if (norm.includes('red')) return { color: '#1CB0F6', icon: 'pen-fancy' };
  if (norm.includes('por') || norm.includes('ling')) return { color: '#CE82FF', icon: 'book-open' };
  if (norm.includes('bio')) return { color: '#58CC02', icon: 'dna' };
  return { color: '#1CB0F6', icon: 'book' };
}

async function fetchNotesFromApi(): Promise<NoteItem[]> {
  try {
    const data = await api.get<any[]>('/notes');
    if (Array.isArray(data)) {
      const normalized = data.map((n) => {
        const subject =
          n.subject || (Array.isArray(n.tags) && n.tags[0]) || 'Geral';
        const isQuestionType =
          n.type === 'question' ||
          n.tags?.includes('question') ||
          Boolean(n.questionSnippet);
        const visual = getSubjectColor(subject);
        return {
          id: n.id,
          userId: n.userId,
          title: n.title,
          content: n.content,
          subject,
          type: isQuestionType ? ('question' as const) : ('general' as const),
          questionSnippet: n.questionSnippet,
          isFavorite: Boolean(n.isFavorite),
          color: n.color || visual.color,
          icon: n.icon || visual.icon,
          date: n.createdAt
            ? new Date(n.createdAt).toLocaleDateString('pt-BR')
            : 'Salvo',
          createdAt: n.createdAt,
        };
      });
      await AsyncStorage.setItem(NOTES_CACHE_KEY, JSON.stringify(normalized));
      return normalized;
    }
    throw new Error('Formato inválido retornado pela API.');
  } catch (err) {
    const cached = await AsyncStorage.getItem(NOTES_CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Ignora erro de parse
      }
    }
    return [];
  }
}

export default function NotesScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ tab?: 'questions' | 'general' }>();

  const [activeTab, setActiveTab] = useState<'questions' | 'general'>(
    params.tab || 'questions'
  );
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);

  // TanStack Query conectado ao banco de dados com suporte Offline-First
  const {
    data: notes = [],
    isLoading,
    isRefetching,
    refetch,
    error,
  } = useQuery<NoteItem[], Error>({
    queryKey: ['notes'],
    queryFn: fetchNotesFromApi,
    networkMode: 'offlineFirst',
  });

  useEffect(() => {
    if (params.tab) {
      setActiveTab(params.tab);
      setExpandedSubject(null);
    }
  }, [params.tab]);

  // Mutação para salvar favorito no banco de dados
  const favoriteMutation = useMutation({
    mutationFn: async ({ id, isFavorite }: { id: string; isFavorite: boolean }) => {
      return api.put(`/notes/${id}/favorite`, { isFavorite });
    },
    onMutate: async ({ id, isFavorite }) => {
      await queryClient.cancelQueries({ queryKey: ['notes'] });
      const previousNotes = queryClient.getQueryData<NoteItem[]>(['notes']);

      queryClient.setQueryData<NoteItem[]>(['notes'], (old) =>
        old ? old.map((n) => (n.id === id ? { ...n, isFavorite } : n)) : []
      );

      return { previousNotes };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousNotes) {
        queryClient.setQueryData(['notes'], context.previousNotes);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
  });

  // Mutação para excluir anotação do banco de dados
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.delete(`/notes/${id}`);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['notes'] });
      const previousNotes = queryClient.getQueryData<NoteItem[]>(['notes']);
      queryClient.setQueryData<NoteItem[]>(['notes'], (old) =>
        old ? old.filter((n) => n.id !== id) : []
      );
      return { previousNotes };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousNotes) {
        queryClient.setQueryData(['notes'], context.previousNotes);
      }
      Alert.alert('Erro', 'Não foi possível remover a anotação.');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
  });

  const toggleFavorite = (id: string, currentFav: boolean) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    favoriteMutation.mutate({ id, isFavorite: !currentFav });
  };

  const handleDeleteNote = (note: NoteItem) => {
    Alert.alert(
      'Excluir Anotação',
      `Deseja realmente apagar esta anotação sobre ${note.subject}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(note.id),
        },
      ]
    );
  };

  // Filtra as anotações conforme o tipo selecionado na aba (por questão ou gerais)
  const currentTabNotes = useMemo(() => {
    return notes.filter((n) => {
      if (activeTab === 'questions') {
        return n.type === 'question' || Boolean(n.questionSnippet);
      }
      return n.type === 'general' || (!n.questionSnippet && Boolean(n.title));
    });
  }, [notes, activeTab]);

  // Hierarquia: Ordena favoritos no topo e agrupa por matéria
  const groupedNotes = useMemo(() => {
    const sorted = [...currentTabNotes].sort((a, b) => {
      if (a.isFavorite === b.isFavorite) return 0;
      return a.isFavorite ? -1 : 1;
    });

    return sorted.reduce((acc, note) => {
      const visual = getSubjectColor(note.subject);
      const subjectName = note.subject || 'Geral';

      if (!acc[subjectName]) {
        acc[subjectName] = {
          notes: [],
          color: note.color || visual.color,
          icon: note.icon || visual.icon,
        };
      }
      acc[subjectName].notes.push(note);
      return acc;
    }, {} as Record<string, { notes: NoteItem[]; color: string; icon: string }>);
  }, [currentTabNotes]);

  const toggleSubject = (subject: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedSubject((prev) => (prev === subject ? null : subject));
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <FontAwesome5 name="arrow-left" size={20} color="#2C3A47" />
        </TouchableOpacity>
        <Text style={styles.title}>Meu Caderno</Text>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={() => refetch()}
          disabled={isRefetching}
        >
          {isRefetching ? (
            <ActivityIndicator size="small" color="#1CB0F6" />
          ) : (
            <FontAwesome5 name="sync-alt" size={16} color="#8CA0B3" />
          )}
        </TouchableOpacity>
      </View>

      {/* ABAS */}
      <View style={styles.tabContainer}>
        <View style={styles.tabBackground}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'questions' && styles.tabActive]}
            onPress={() => {
              setActiveTab('questions');
              setExpandedSubject(null);
            }}
            activeOpacity={0.8}
          >
            <FontAwesome5
              name="bookmark"
              size={14}
              color={activeTab === 'questions' ? '#2C3A47' : '#8CA0B3'}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.tabText,
                activeTab === 'questions' && styles.tabTextActive,
              ]}
            >
              Por Questão
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'general' && styles.tabActive]}
            onPress={() => {
              setActiveTab('general');
              setExpandedSubject(null);
            }}
            activeOpacity={0.8}
          >
            <FontAwesome5
              name="book-open"
              size={14}
              color={activeTab === 'general' ? '#2C3A47' : '#8CA0B3'}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.tabText,
                activeTab === 'general' && styles.tabTextActive,
              ]}
            >
              Gerais
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* CONTEÚDO */}
      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#1CB0F6" />
          <Text style={styles.loadingText}>Carregando suas anotações...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionSubtitle}>
            {activeTab === 'questions'
              ? 'Macetes salvos de questões, com seus favoritos fixados no topo.'
              : 'Resumos teóricos organizados e salvos no seu banco de dados.'}
          </Text>

          {Object.keys(groupedNotes).length === 0 ? (
            <View style={styles.emptyState}>
              <FontAwesome5
                name="folder-open"
                size={48}
                color="#CBD5E1"
                style={{ marginBottom: 16 }}
              />
              <Text style={styles.emptyTitle}>Nenhuma anotação por aqui</Text>
              <Text style={styles.emptyText}>
                {activeTab === 'questions'
                  ? 'Ao resolver questões do ENEM, salve macetes para revisar depois.'
                  : 'Toque no botão (+) abaixo para criar um novo resumo ou gerar com IA.'}
              </Text>
            </View>
          ) : (
            Object.entries(groupedNotes).map(([subject, data]) => {
              const isExpanded = expandedSubject === subject;

              return (
                <View
                  key={subject}
                  style={[styles.folderContainer, { borderColor: data.color }]}
                >
                  <TouchableOpacity
                    style={[
                      styles.folderHeader,
                      isExpanded && styles.folderHeaderActive,
                    ]}
                    activeOpacity={0.8}
                    onPress={() => toggleSubject(subject)}
                  >
                    <View style={styles.folderTitleRow}>
                      <View
                        style={[
                          styles.folderIconBox,
                          { backgroundColor: data.color },
                        ]}
                      >
                        <FontAwesome5 name={data.icon} size={16} color="#FFF" />
                      </View>
                      <View>
                        <Text style={styles.folderSubjectName}>{subject}</Text>
                        <Text style={styles.folderSubjectCount}>
                          {data.notes.length}{' '}
                          {data.notes.length === 1 ? 'anotação' : 'anotações'}
                        </Text>
                      </View>
                    </View>
                    <FontAwesome5
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color="#8CA0B3"
                    />
                  </TouchableOpacity>

                  {isExpanded && (
                    <View style={styles.expandedContent}>
                      {data.notes.map((note) => (
                        <View
                          key={note.id}
                          style={[
                            activeTab === 'general'
                              ? styles.generalNoteCard
                              : styles.noteCard,
                            note.isFavorite && styles.favoriteHighlight,
                          ]}
                        >
                          <View style={styles.noteHeader}>
                            <Text style={styles.dateText}>
                              {note.date ||
                                (note.createdAt
                                  ? new Date(note.createdAt).toLocaleDateString(
                                      'pt-BR'
                                    )
                                  : 'Salvo')}
                            </Text>

                            <View style={styles.headerActions}>
                              <TouchableOpacity
                                onPress={() =>
                                  toggleFavorite(note.id, note.isFavorite)
                                }
                                style={styles.actionIconBtn}
                              >
                                <FontAwesome5
                                  name="star"
                                  solid={note.isFavorite}
                                  size={18}
                                  color={
                                    note.isFavorite ? '#F1C40F' : '#E2E8F0'
                                  }
                                />
                              </TouchableOpacity>

                              <TouchableOpacity
                                onPress={() => handleDeleteNote(note)}
                                style={styles.actionIconBtn}
                              >
                                <FontAwesome5
                                  name="trash-alt"
                                  size={14}
                                  color="#EF4444"
                                />
                              </TouchableOpacity>
                            </View>
                          </View>

                          {activeTab === 'questions' ? (
                            <>
                              {note.questionSnippet && (
                                <View style={styles.questionRefBox}>
                                  <FontAwesome5
                                    name="quote-left"
                                    size={10}
                                    color="#8CA0B3"
                                    style={{ marginRight: 6, marginTop: 2 }}
                                  />
                                  <Text
                                    style={styles.questionRefText}
                                    numberOfLines={2}
                                  >
                                    {note.questionSnippet}
                                  </Text>
                                </View>
                              )}
                              <Text style={styles.userNoteText}>
                                {note.content}
                              </Text>
                            </>
                          ) : (
                            <>
                              {note.title && (
                                <Text style={styles.generalNoteTitle}>
                                  {note.title}
                                </Text>
                              )}
                              <Text style={styles.userNoteText}>
                                {note.content}
                              </Text>
                            </>
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* BOTÃO FLUTUANTE */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.8}
        onPress={() => router.push('/notes/new' as any)}
      >
        <FontAwesome5 name="plus" size={20} color="#FFF" />
      </TouchableOpacity>
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
  },
  backButton: { width: 40, height: 40, justifyContent: 'center' },
  refreshButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  title: { fontSize: 20, fontWeight: 'bold', color: '#2C3A47' },

  tabContainer: {
    backgroundColor: '#FFF',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  tabBackground: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: { fontSize: 14, fontWeight: 'bold', color: '#8CA0B3' },
  tabTextActive: { color: '#2C3A47' },

  scrollContent: { padding: 20, paddingBottom: 100 },
  sectionSubtitle: {
    fontSize: 14,
    color: '#8CA0B3',
    marginBottom: 20,
    fontStyle: 'italic',
  },

  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: '#8CA0B3',
    fontWeight: 'bold',
  },

  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 60 },
  emptyTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#334155',
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 14,
    color: '#8CA0B3',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },

  folderContainer: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderLeftWidth: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  folderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFF',
  },
  folderHeaderActive: {
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  folderTitleRow: { flexDirection: 'row', alignItems: 'center' },
  folderIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  folderSubjectName: { fontSize: 16, fontWeight: 'bold', color: '#2C3A47' },
  folderSubjectCount: { fontSize: 13, color: '#8CA0B3', marginTop: 2 },

  expandedContent: { padding: 16, backgroundColor: '#F7F9FC' },

  noteCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  generalNoteCard: {
    backgroundColor: '#FFFEF5',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F1C40F40',
  },

  favoriteHighlight: {
    borderColor: '#F1C40F',
    borderWidth: 2,
  },

  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateText: { fontSize: 12, color: '#8CA0B3', fontWeight: 'bold' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  actionIconBtn: { padding: 4 },

  questionRefBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#E2E8F0',
  },
  questionRefText: {
    flex: 1,
    fontSize: 13,
    color: '#4B5563',
    fontStyle: 'italic',
    lineHeight: 18,
  },

  generalNoteTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2C3A47',
    marginBottom: 8,
  },
  userNoteText: { fontSize: 15, color: '#2C3A47', lineHeight: 22 },

  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1CB0F6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1CB0F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
});
