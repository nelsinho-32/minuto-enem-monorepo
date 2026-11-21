import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  ScrollView,
  Image,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import { safeAsyncStorage as AsyncStorage } from '@/services/safeStorage';
import { api } from '@/services/api';
import { useUserStore } from '@/store/useUserStore';
import {
  EmbeddedVideoPlayer,
  extractYouTubeVideoId,
} from '@/components/EmbeddedVideoPlayer';

const { width: INITIAL_WIDTH, height } = Dimensions.get('window');

export const COMPLETED_LESSONS_STORAGE_KEY = '@minuto_enem:completed_lessons';

export async function markLessonCompleted(lessonId: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(COMPLETED_LESSONS_STORAGE_KEY);
    const existing: string[] = raw ? JSON.parse(raw) : [];
    if (!existing.includes(lessonId)) {
      const updated = [...existing, lessonId];
      await AsyncStorage.setItem(
        COMPLETED_LESSONS_STORAGE_KEY,
        JSON.stringify(updated)
      );
      return updated;
    }
    return existing;
  } catch {
    return [lessonId];
  }
}

export async function getCompletedLessons(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(COMPLETED_LESSONS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

interface ParsedVideoItem {
  title: string;
  url: string | null;
  videoId: string | null;
}

function parseVideoEntry(entry: string, fallbackTitle: string): ParsedVideoItem {
  if (!entry || typeof entry !== 'string') {
    return { title: fallbackTitle, url: null, videoId: null };
  }

  // Formato "Título da Videoaula | https://www.youtube.com/watch?v=..."
  if (entry.includes('|')) {
    const parts = entry.split('|');
    const urlPart = parts[parts.length - 1].trim();
    const titlePart = parts.slice(0, -1).join('|').trim();
    const vid = extractYouTubeVideoId(urlPart);
    if (vid) {
      return {
        title: titlePart || fallbackTitle,
        url: `https://www.youtube.com/watch?v=${vid}`,
        videoId: vid,
      };
    }
  }

  // Formato URL direta do YouTube
  const directVid = extractYouTubeVideoId(entry);
  if (directVid) {
    return {
      title: fallbackTitle,
      url: `https://www.youtube.com/watch?v=${directVid}`,
      videoId: directVid,
    };
  }

  // Fallback para termo de busca
  return {
    title: entry.trim(),
    url: null,
    videoId: null,
  };
}

export default function LessonScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width: windowWidth } = useWindowDimensions();
  const { registerDailyPlay } = useUserStore();

  const [lesson, setLesson] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [fontSize, setFontSize] = useState<number>(16);
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);
  const [activeVideoTitle, setActiveVideoTitle] = useState<string>('');

  const contentMaxWidth = Math.min(windowWidth, 860);

  useEffect(() => {
    async function fetchLesson() {
      if (!id) return;
      setIsLoading(true);
      setError(null);
      const cacheKey = `@minuto_enem:lesson_${id}`;

      const completed = await getCompletedLessons();
      setIsCompleted(completed.includes(id));

      try {
        const data = await api.get<any>(`/lessons/${id}`);
        if (data) {
          setLesson(data);
          await AsyncStorage.setItem(cacheKey, JSON.stringify(data));
        } else {
          throw new Error('Aula não encontrada');
        }
      } catch {
        try {
          const cached = await AsyncStorage.getItem(cacheKey);
          if (cached) {
            setLesson(JSON.parse(cached));
            return;
          }
        } catch {}
        setError('Não foi possível carregar a aula. Verifique sua conexão.');
      } finally {
        setIsLoading(false);
      }
    }

    fetchLesson();
  }, [id]);

  // Extrai todas as videoaulas válidas (priorizando youtubeUrl exata da aula)
  const parsedVideos = useMemo<ParsedVideoItem[]>(() => {
    if (!lesson) return [];
    const list: ParsedVideoItem[] = [];
    const seenIds = new Set<string>();

    if (lesson.youtubeUrl) {
      const mainId = extractYouTubeVideoId(lesson.youtubeUrl);
      if (mainId) {
        seenIds.add(mainId);
        list.push({
          title: lesson.title,
          url: `https://www.youtube.com/watch?v=${mainId}`,
          videoId: mainId,
        });
      }
    }

    if (Array.isArray(lesson.videos)) {
      for (const v of lesson.videos) {
        const parsed = parseVideoEntry(v, lesson.title);
        if (parsed.videoId && !seenIds.has(parsed.videoId)) {
          seenIds.add(parsed.videoId);
          list.push(parsed);
        } else if (!parsed.videoId && list.length === 0) {
          list.push(parsed);
        }
      }
    }

    return list;
  }, [lesson]);

  // Define o vídeo inicial automaticamente
  useEffect(() => {
    const firstPlayable = parsedVideos.find((v) => v.videoId);
    if (firstPlayable?.url) {
      setActiveVideoUrl(firstPlayable.url);
      setActiveVideoTitle(firstPlayable.title);
    } else if (lesson?.youtubeUrl) {
      setActiveVideoUrl(lesson.youtubeUrl);
      setActiveVideoTitle(lesson.title || '');
    }
  }, [parsedVideos, lesson]);

  const readingTimeMinutes = useMemo(() => {
    const words = (lesson?.content || '').trim().split(/\s+/).filter(Boolean).length;
    return Math.max(2, Math.ceil(words / 180));
  }, [lesson?.content]);

  const dynamicMarkdownStyles = useMemo(
    () => ({
      body: {
        fontSize,
        color: '#334155',
        lineHeight: Math.round(fontSize * 1.65),
      },
      heading1: {
        fontSize: fontSize + 7,
        fontWeight: '800' as const,
        color: '#0F172A',
        marginTop: 22,
        marginBottom: 10,
      },
      heading2: {
        fontSize: fontSize + 4,
        fontWeight: '800' as const,
        color: '#0F172A',
        marginTop: 22,
        marginBottom: 10,
        paddingBottom: 6,
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
      },
      heading3: {
        fontSize: fontSize + 2,
        fontWeight: '700' as const,
        color: '#1E293B',
        marginTop: 18,
        marginBottom: 8,
      },
      strong: {
        color: '#0F172A',
        fontWeight: '800' as const,
      },
      em: {
        fontStyle: 'italic' as const,
        color: '#475569',
      },
      blockquote: {
        backgroundColor: '#F0F9FF',
        borderLeftWidth: 4,
        borderLeftColor: '#0284C7',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 8,
        marginVertical: 12,
      },
      code_inline: {
        backgroundColor: '#F1F5F9',
        color: '#0369A1',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        fontWeight: '700' as const,
        fontSize: fontSize - 1,
      },
      bullet_list: { marginTop: 8, marginBottom: 12 },
      ordered_list: { marginTop: 8, marginBottom: 12 },
      list_item: { marginBottom: 8, lineHeight: Math.round(fontSize * 1.55) },
    }),
    [fontSize]
  );

  const handleToggleComplete = async () => {
    if (!lesson?.id) return;
    if (!isCompleted) {
      await markLessonCompleted(lesson.id);
      await registerDailyPlay();
      setIsCompleted(true);
    }
  };

  const handleOpenExternalVideo = (item: ParsedVideoItem) => {
    const targetUrl =
      item.url ||
      `https://www.youtube.com/results?search_query=${encodeURIComponent(
        `${item.title} ${lesson?.subject?.name || ''} ENEM`
      )}`;
    Linking.openURL(targetUrl).catch(() => {});
  };

  const handlePracticeThisSubject = async () => {
    if (lesson?.id) {
      await markLessonCompleted(lesson.id);
      setIsCompleted(true);
    }
    await registerDailyPlay();

    const targetSubjectId = lesson.subjectId || lesson.subject?.id || '';
    const targetTopicId = lesson.topicId || lesson.topic?.id || '';
    const targetSubjectName = lesson.subject?.name || lesson.subject?.slug || '';
    const targetTopicName = lesson.topic?.name || lesson.title || '';

    router.push({
      pathname: '/quiz',
      params: {
        mode: 'pratica',
        subjectId: targetSubjectId,
        topicId: targetTopicId,
        lessonId: lesson.id,
        subject: targetSubjectName,
        topic: targetTopicName,
        limit: 10,
      },
    });
  };

  const handleCreateNoteFromLesson = () => {
    router.push({
      pathname: '/notes/new',
      params: {
        title: `Resumo: ${lesson?.title || ''}`,
        subject: lesson?.subject?.name || '',
      },
    } as any);
  };

  const handleAskInChat = () => {
    router.push({
      pathname: '/chat',
      params: {
        subject: lesson?.subject?.name || '',
        topic: lesson?.title || '',
        category: 'DUVIDA',
      },
    } as any);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.centerAll]}>
        <ActivityIndicator size="large" color="#0284C7" />
        <Text style={styles.loadingText}>Carregando material de estudo...</Text>
      </SafeAreaView>
    );
  }

  if (error || !lesson) {
    return (
      <SafeAreaView style={[styles.container, styles.centerAll]}>
        <FontAwesome5
          name="exclamation-triangle"
          size={40}
          color="#EF4444"
          style={{ marginBottom: 16 }}
        />
        <Text style={styles.errorText}>{error || 'Aula não encontrada.'}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => router.back()}
        >
          <Text style={styles.retryText}>Voltar</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* 1. CABEÇALHO DE ESTUDO */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <FontAwesome5 name="arrow-left" size={16} color="#1E293B" />
        </TouchableOpacity>

        <View style={{ flex: 1, marginHorizontal: 10 }}>
          <Text style={styles.headerSubjectLabel} numberOfLines={1}>
            {lesson.subject?.name || 'Disciplina ENEM'}
          </Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {lesson.title}
          </Text>
        </View>

        {/* Controles de tamanho de fonte */}
        <View style={styles.fontControls}>
          <TouchableOpacity
            style={styles.fontBtn}
            onPress={() => setFontSize((s) => Math.max(13, s - 1))}
          >
            <Text style={styles.fontBtnText}>A-</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.fontBtn}
            onPress={() => setFontSize((s) => Math.min(22, s + 1))}
          >
            <Text style={styles.fontBtnText}>A+</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* 2. HERO DO ASSUNTO */}
        <View style={styles.heroCard}>
          <View style={styles.metaBadgesRow}>
            <View style={styles.subjectPill}>
              <FontAwesome5 name="book-open" size={10} color="#0284C7" />
              <Text style={styles.subjectPillText}>
                {lesson.subject?.name || 'ENEM'}
              </Text>
            </View>

            <View style={styles.timePill}>
              <FontAwesome5 name="clock" size={10} color="#64748B" />
              <Text style={styles.timePillText}>~{readingTimeMinutes} min</Text>
            </View>

            <TouchableOpacity
              style={[
                styles.completePill,
                isCompleted && styles.completePillDone,
              ]}
              onPress={handleToggleComplete}
              activeOpacity={0.8}
            >
              <FontAwesome5
                name={isCompleted ? 'check-circle' : 'circle'}
                size={11}
                color={isCompleted ? '#16A34A' : '#64748B'}
              />
              <Text
                style={[
                  styles.completePillText,
                  isCompleted && styles.completePillTextDone,
                ]}
              >
                {isCompleted ? 'Estudada' : 'Marcar lida'}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.lessonTitle}>{lesson.title}</Text>

          {/* Barra rápida de ferramentas do estudante */}
          <View style={styles.quickActionsRow}>
            <TouchableOpacity
              style={styles.quickActionBtn}
              onPress={handleCreateNoteFromLesson}
              activeOpacity={0.8}
            >
              <FontAwesome5 name="sticky-note" size={12} color="#D97706" />
              <Text style={styles.quickActionText}>Anotar no Caderno</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickActionBtn}
              onPress={handleAskInChat}
              activeOpacity={0.8}
            >
              <FontAwesome5 name="comments" size={12} color="#0284C7" />
              <Text style={styles.quickActionText}>Tirar Dúvida no Chat</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 3. VIDEOAULA CORRESPONDENTE NO YOUTUBE */}
        {activeVideoUrl && (
          <View style={styles.videoCardSection}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleGroup}>
                <FontAwesome5 name="youtube" size={16} color="#FF0000" />
                <Text style={styles.sectionSubtitle}>
                  Videoaula Correspondente
                </Text>
              </View>
              <TouchableOpacity
                style={styles.openYtBtn}
                onPress={() =>
                  Linking.openURL(activeVideoUrl).catch(() => {})
                }
              >
                <Text style={styles.openYtBtnText}>Abrir no YouTube</Text>
                <FontAwesome5 name="external-link-alt" size={10} color="#0284C7" />
              </TouchableOpacity>
            </View>

            <View style={styles.playerContainer}>
              <EmbeddedVideoPlayer
                youtubeUrl={activeVideoUrl}
                title={activeVideoTitle || lesson.title}
                width={Math.min(contentMaxWidth - 32, 820)}
                fullWidth={false}
              />
            </View>

            {/* Alternar entre videoaulas relacionadas deste mesmo tópico */}
            {parsedVideos.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.altVideosRow}
              >
                {parsedVideos.map((v, idx) => {
                  const isSelected = v.url === activeVideoUrl;
                  return (
                    <TouchableOpacity
                      key={v.videoId || idx}
                      style={[
                        styles.altVideoChip,
                        isSelected && styles.altVideoChipActive,
                      ]}
                      onPress={() => {
                        if (v.url) {
                          setActiveVideoUrl(v.url);
                          setActiveVideoTitle(v.title);
                        } else {
                          handleOpenExternalVideo(v);
                        }
                      }}
                      activeOpacity={0.8}
                    >
                      <FontAwesome5
                        name="play-circle"
                        size={12}
                        color={isSelected ? '#FFFFFF' : '#FF0000'}
                      />
                      <Text
                        style={[
                          styles.altVideoChipText,
                          isSelected && { color: '#FFFFFF' },
                        ]}
                        numberOfLines={1}
                      >
                        {v.title}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        )}

        {/* 4. CONTEÚDO TEÓRICO COMPLETO EM MARKDOWN */}
        <View style={styles.contentCard}>
          <View style={styles.sectionTitleGroup}>
            <FontAwesome5 name="align-left" size={14} color="#0284C7" />
            <Text style={styles.sectionSubtitle}>Resumo & Teoria Completa</Text>
          </View>
          <View style={styles.contentDivider} />

          <Markdown
            style={dynamicMarkdownStyles as any}
            rules={{
              image: (node) => (
                <View key={node.key} style={styles.imageContainer}>
                  <Image
                    source={{ uri: node.attributes.src }}
                    style={{
                      width: Math.min(INITIAL_WIDTH - 64, 600),
                      height: height * 0.26,
                    }}
                    resizeMode="cover"
                  />
                </View>
              ),
            }}
          >
            {lesson.content || 'Nenhum texto disponível para esta aula.'}
          </Markdown>
        </View>

        {/* 5. REFERÊNCIAS BIBLIOGRÁFICAS */}
        {Array.isArray(lesson.references) && lesson.references.length > 0 && (
          <View style={styles.referencesCard}>
            <View style={styles.sectionTitleGroup}>
              <FontAwesome5 name="bookmark" size={14} color="#64748B" />
              <Text style={styles.sectionSubtitle}>
                Referências Bibliográficas
              </Text>
            </View>
            <View style={{ marginTop: 10, gap: 10 }}>
              {lesson.references.map((ref: string, idx: number) => (
                <View key={idx} style={styles.refItem}>
                  <FontAwesome5
                    name="book"
                    size={12}
                    color="#94A3B8"
                    style={{ marginTop: 4 }}
                  />
                  <Text style={styles.refText}>{ref}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 6. CTA FINAL: PRATICAR ESTE ASSUNTO */}
        <View style={styles.practiceContainer}>
          <View style={styles.practiceInfoBox}>
            <View style={styles.practiceIconCircle}>
              <FontAwesome5 name="graduation-cap" size={20} color="#0284C7" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.practiceTopicTitle} numberOfLines={2}>
                Praticar: {lesson.topic?.name || lesson.title}
              </Text>
              <Text style={styles.practiceTopicSubtitle}>
                {lesson.questionsCount
                  ? `${lesson.questionsCount} questões oficiais do ENEM disponíveis`
                  : 'Fixe o conteúdo agora com questões reais do ENEM'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.practiceButton}
            activeOpacity={0.85}
            onPress={handlePracticeThisSubject}
          >
            <FontAwesome5 name="dumbbell" size={16} color="#FFF" />
            <Text style={styles.practiceButtonText}>
              Praticar este assunto agora
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  centerAll: { justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: {
    marginTop: 14,
    fontSize: 15,
    color: '#64748B',
    fontWeight: '700',
  },
  errorText: {
    fontSize: 15,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  retryButton: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryText: { color: '#FFF', fontWeight: '700', fontSize: 15 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
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
  headerSubjectLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0284C7',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  fontControls: {
    flexDirection: 'row',
    gap: 6,
  },
  fontBtn: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  fontBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 48,
    gap: 16,
  },

  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  metaBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  subjectPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  subjectPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0369A1',
  },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  timePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  completePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginLeft: 'auto',
  },
  completePillDone: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  completePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  completePillTextDone: {
    color: '#16A34A',
  },
  lessonTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 30,
    marginBottom: 14,
  },
  quickActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },

  videoCardSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionSubtitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  openYtBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F0F9FF',
  },
  openYtBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284C7',
  },
  playerContainer: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#000',
    alignItems: 'center',
  },
  altVideosRow: {
    gap: 8,
    paddingTop: 12,
  },
  altVideoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 260,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  altVideoChipActive: {
    backgroundColor: '#0284C7',
    borderColor: '#0284C7',
  },
  altVideoChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    flexShrink: 1,
  },

  contentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  contentDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginTop: 10,
    marginBottom: 14,
  },
  imageContainer: {
    marginVertical: 14,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
  },

  referencesCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  refItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  refText: {
    flex: 1,
    fontSize: 13,
    color: '#475569',
    lineHeight: 20,
  },

  practiceContainer: {
    backgroundColor: '#F0F9FF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#BAE6FD',
  },
  practiceInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  practiceIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  practiceTopicTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0C4A6E',
  },
  practiceTopicSubtitle: {
    fontSize: 12,
    color: '#0369A1',
    marginTop: 2,
  },
  practiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#16A34A',
    paddingVertical: 15,
    borderRadius: 14,
  },
  practiceButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
