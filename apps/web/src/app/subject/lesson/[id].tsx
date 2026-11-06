import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import { safeAsyncStorage as AsyncStorage } from '@/services/safeStorage';
import { api } from '@/services/api';
import { useUserStore } from '@/store/useUserStore';
import { EmbeddedVideoPlayer } from '@/components/EmbeddedVideoPlayer';

const { width, height } = Dimensions.get('window');

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

export default function LessonScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { registerDailyPlay } = useUserStore();

  const [lesson, setLesson] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLesson() {
      if (!id) return;
      setIsLoading(true);
      setError(null);
      const cacheKey = `@minuto_enem:lesson_${id}`;

      try {
        const data = await api.get<any>(`/lessons/${id}`);
        if (data) {
          setLesson(data);
          await AsyncStorage.setItem(cacheKey, JSON.stringify(data));
        } else {
          throw new Error('Aula não encontrada');
        }
      } catch (err: any) {
        // Tenta recuperar do cache local offline
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

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.centerAll]}>
        <ActivityIndicator size="large" color="#CE82FF" />
        <Text style={styles.loadingText}>Carregando conteúdo da aula...</Text>
      </SafeAreaView>
    );
  }

  if (error || !lesson) {
    return (
      <SafeAreaView style={[styles.container, styles.centerAll]}>
        <FontAwesome5
          name="exclamation-triangle"
          size={40}
          color="#FF4B4B"
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

  // Função para abrir o vídeo direto no YouTube
  const openYouTube = (query: string) => {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(
      query
    )}`;
    Linking.openURL(url).catch((err) =>
      console.error('Erro ao abrir YouTube:', err)
    );
  };

  // Redireciona para o Quiz passando subjectId e lessonId/topicId exatos
  const handlePracticeThisSubject = async () => {
    if (lesson?.id) {
      await markLessonCompleted(lesson.id);
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

  return (
    <SafeAreaView style={styles.container}>
      {/* 1. CABEÇALHO SUPERIOR */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <FontAwesome5 name="arrow-left" size={20} color="#2C3A47" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {lesson.subject?.name || 'Aula'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleContainer}>
          <Text style={styles.lessonTitle}>{lesson.title}</Text>
          <View style={styles.divider} />
        </View>

        {/* 2. VIDEOAULA EMBUTIDA (YOUTUBE) */}
        {lesson.youtubeUrl && (
          <View style={styles.embeddedVideoSection}>
            <View style={styles.videoBadgeHeader}>
              <FontAwesome5 name="youtube" size={14} color="#FF0000" />
              <Text style={styles.sectionSubtitle}>Videoaula Incorporada</Text>
            </View>
            <View style={styles.embeddedPlayerWrapper}>
              <EmbeddedVideoPlayer
                youtubeUrl={lesson.youtubeUrl}
                title={lesson.title}
                fullWidth={true}
              />
            </View>
          </View>
        )}

        {/* 3. ONDE ASSISTIR (VÍDEOS REAIS CADASTRADOS) */}
        {Array.isArray(lesson.videos) && lesson.videos.length > 0 && (
          <View style={styles.carouselSection}>
            <Text style={styles.sectionSubtitle}>Onde Assistir</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carouselContainer}
            >
              {lesson.videos.map((video: string, idx: number) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.videoCard}
                  activeOpacity={0.8}
                  onPress={() => openYouTube(video)}
                >
                  <View style={styles.videoThumbnail}>
                    <FontAwesome5 name="youtube" size={32} color="#FF0000" />
                  </View>
                  <Text style={styles.videoTitle} numberOfLines={3}>
                    {video}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* 3. CONTEÚDO PEDAGÓGICO COMPLETO EM MARKDOWN */}
        <View style={styles.markdownWrapper}>
          <Markdown
            style={markdownStyles as any}
            rules={{
              image: (node) => (
                <View key={node.key} style={styles.imageContainer}>
                  <Image
                    source={{ uri: node.attributes.src }}
                    style={{ width: width - 48, height: height * 0.25 }}
                    resizeMode="cover"
                  />
                </View>
              ),
            }}
          >
            {lesson.content || 'Nenhum texto disponível para esta aula.'}
          </Markdown>
        </View>

        {/* 4. REFERÊNCIAS BIBLIOGRÁFICAS REAIS */}
        {Array.isArray(lesson.references) && lesson.references.length > 0 && (
          <View style={styles.referencesSection}>
            <Text style={styles.sectionSubtitle}>Referências</Text>
            {lesson.references.map((ref: string, idx: number) => (
              <View key={idx} style={styles.refItem}>
                <FontAwesome5
                  name="book"
                  size={14}
                  color="#8CA0B3"
                  style={{ marginTop: 4 }}
                />
                <Text style={styles.refText}>{ref}</Text>
              </View>
            ))}
          </View>
        )}

        {/* 5. PRATICAR ESTE ASSUNTO AGORA (AO FINAL DO CONTEÚDO) */}
        <View style={styles.practiceContainer}>
          <View style={styles.practiceInfoBox}>
            <View style={styles.practiceIconCircle}>
              <FontAwesome5 name="graduation-cap" size={20} color="#1CB0F6" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.practiceTopicTitle} numberOfLines={1}>
                {lesson.topic?.name || lesson.title}
              </Text>
              <Text style={styles.practiceTopicSubtitle}>
                {lesson.questionsCount
                  ? `${lesson.questionsCount} questões disponíveis deste assunto`
                  : 'Fixe o conteúdo com questões reais do ENEM'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.practiceButton}
            activeOpacity={0.8}
            onPress={handlePracticeThisSubject}
          >
            <FontAwesome5 name="dumbbell" size={18} color="#FFF" />
            <Text style={styles.practiceButtonText}>
              Praticar este assunto agora
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const markdownStyles = StyleSheet.create({
  body: { fontSize: 16, color: '#4B5563', lineHeight: 26 },
  heading2: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2C3A47',
    marginTop: 24,
    marginBottom: 12,
  },
  strong: { color: '#2C3A47', fontWeight: '900' },
  em: { fontStyle: 'italic', color: '#8CA0B3' },
  bullet_list: { marginTop: 10, marginBottom: 10 },
  list_item: { marginBottom: 8, lineHeight: 24 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  centerAll: { justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#8CA0B3',
    fontWeight: 'bold',
  },
  errorText: {
    fontSize: 16,
    color: '#4B5563',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  retryButton: {
    backgroundColor: '#2C3A47',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
  },
  backButton: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: 'bold',
    color: '#8CA0B3',
    textTransform: 'uppercase',
  },

  scrollContent: { padding: 24, paddingBottom: 60 },

  titleContainer: { marginBottom: 24 },
  lessonTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#2C3A47',
    lineHeight: 32,
  },
  divider: {
    height: 4,
    width: 40,
    backgroundColor: '#CE82FF',
    borderRadius: 2,
    marginTop: 16,
  },

  sectionSubtitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2C3A47',
    marginBottom: 12,
    marginTop: 8,
  },

  carouselSection: { marginBottom: 24, marginHorizontal: -24 },
  carouselContainer: { paddingHorizontal: 24, gap: 16 },
  videoCard: {
    width: 150,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  videoThumbnail: {
    height: 85,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoTitle: {
    padding: 12,
    fontSize: 13,
    fontWeight: 'bold',
    color: '#4B5563',
    lineHeight: 18,
  },

  markdownWrapper: { flex: 1, marginBottom: 32 },
  imageContainer: {
    marginVertical: 16,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  referencesSection: {
    backgroundColor: '#F8FAFC',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 24,
  },
  refItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  refText: { flex: 1, fontSize: 14, color: '#4B5563', lineHeight: 22 },

  practiceContainer: {
    backgroundColor: '#F0F9FF',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#BAE6FD',
    padding: 20,
    marginTop: 8,
    marginBottom: 32,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  practiceInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
  },
  practiceIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E0F2FE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  practiceTopicTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0369A1',
    marginBottom: 2,
  },
  practiceTopicSubtitle: {
    fontSize: 13,
    color: '#0284C7',
    fontWeight: '500',
  },
  practiceButton: {
    flexDirection: 'row',
    backgroundColor: '#0284C7',
    paddingVertical: 16,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  practiceButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
    textTransform: 'uppercase',
  },

  embeddedVideoSection: {
    marginBottom: 24,
    gap: 10,
  },
  videoBadgeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  embeddedPlayerWrapper: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    alignSelf: 'center',
  },
});
