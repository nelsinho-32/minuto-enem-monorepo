import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Alert,
  Linking,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { WebView } from 'react-native-webview';
import { api, BASE_URL } from '@/services/api';
import { useTheme } from '@/hooks/use-theme';

interface MissedQuestionItem {
  id: string;
  subject: string;
  topic?: string | null;
  year: number;
  text: string;
  errorCount: number;
}

interface QuestionFeedbackItem {
  id: string;
  commentText: string;
  audioUrl?: string | null;
  createdAt: string;
  teacher: { id: string; name: string };
  question: {
    id: string;
    subject: string;
    topic?: string | null;
    year: number;
    text: string;
  };
}

interface QuestionFeedbackModalProps {
  visible: boolean;
  classroomId: string;
  classroomName: string;
  canSend: boolean;
  onClose: () => void;
}

function resolveMediaUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  return `${BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

export function QuestionFeedbackModal({
  visible,
  classroomId,
  classroomName,
  canSend,
  onClose,
}: QuestionFeedbackModalProps) {
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const [feedbacks, setFeedbacks] = useState<QuestionFeedbackItem[]>([]);
  const [missedQuestions, setMissedQuestions] = useState<MissedQuestionItem[]>([]);

  const [selectedQuestionId, setSelectedQuestionId] = useState<string>('');
  const [commentText, setCommentText] = useState('');
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [pickedAudioFile, setPickedAudioFile] = useState<{
    uri: string;
    name: string;
    mimeType: string;
  } | null>(null);
  const [audioLinkInput, setAudioLinkInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [mobilePlayerUrl, setMobilePlayerUrl] = useState<string | null>(null);

  const recorderRef = useRef<any>(null);
  const chunksRef = useRef<any[]>([]);
  const activeAudioRef = useRef<any>(null);

  const loadData = useCallback(async () => {
    if (!classroomId) return;
    setLoading(true);
    try {
      const res = await api.get<{
        feedbacks: QuestionFeedbackItem[];
        missedQuestions: MissedQuestionItem[];
      }>(`/classrooms/${classroomId}/question-feedback`);
      setFeedbacks(Array.isArray(res?.feedbacks) ? res.feedbacks : []);
      const missed = Array.isArray(res?.missedQuestions) ? res.missedQuestions : [];
      setMissedQuestions(missed);
      if (missed.length > 0 && !selectedQuestionId) {
        setSelectedQuestionId(missed[0].id);
      }
    } catch {
      // Silencioso se ainda vazio
    } finally {
      setLoading(false);
    }
  }, [classroomId]);

  useEffect(() => {
    if (visible) {
      loadData();
    } else {
      stopAudioPlayback();
    }
  }, [visible, loadData]);

  const stopAudioPlayback = () => {
    if (activeAudioRef.current) {
      try {
        activeAudioRef.current.pause();
      } catch {}
      activeAudioRef.current = null;
    }
    setPlayingId(null);
    setMobilePlayerUrl(null);
  };

  const handleTogglePlay = (feedbackId: string, rawUrl?: string | null) => {
    const resolved = resolveMediaUrl(rawUrl);
    if (!resolved) return;

    if (playingId === feedbackId) {
      stopAudioPlayback();
      return;
    }
    stopAudioPlayback();

    if (
      Platform.OS === 'web' &&
      typeof window !== 'undefined' &&
      typeof (window as any).Audio === 'function'
    ) {
      try {
        const audio = new (window as any).Audio(resolved);
        activeAudioRef.current = audio;
        setPlayingId(feedbackId);
        audio.onended = () => setPlayingId(null);
        audio.onerror = () => setPlayingId(null);
        audio.play().catch(() => setPlayingId(null));
        return;
      } catch {}
    }

    // No Mobile (Android/iOS): reproduz no player HTML5 embutido via WebView
    setPlayingId(feedbackId);
    setMobilePlayerUrl(resolved);
  };

  const handlePickMobileAudioFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        setRecordedBlob(null);
        setPickedAudioFile({
          uri: asset.uri,
          name: asset.name || 'devolutiva.m4a',
          mimeType: asset.mimeType || 'audio/m4a',
        });
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível selecionar o arquivo de áudio.');
    }
  };

  const handleToggleRecord = async () => {
    if (
      Platform.OS !== 'web' ||
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      await handlePickMobileAudioFile();
      return;
    }

    if (isRecording && recorderRef.current) {
      try {
        recorderRef.current.stop();
      } catch {}
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const MediaRec = (window as any).MediaRecorder;
      const recorder = new MediaRec(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (ev: any) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t: any) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setPickedAudioFile(null);
        setRecordedBlob(blob);
      };
      recorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      Alert.alert(
        'Microfone indisponível',
        'Permita o acesso ao microfone no navegador ou anexe um arquivo de áudio.'
      );
    }
  };

  const handleSendFeedback = async () => {
    const qId = selectedQuestionId || missedQuestions[0]?.id;
    if (!qId) {
      Alert.alert('Sem questão', 'Atribua ao menos uma lista de questões na turma primeiro.');
      return;
    }
    const hasAudioFile = Boolean(recordedBlob || pickedAudioFile);
    const hasLink = Boolean(audioLinkInput.trim());
    if (!commentText.trim() && !hasAudioFile && !hasLink) {
      Alert.alert('Campo vazio', 'Escreva um comentário ou anexe/grave um áudio explicativo.');
      return;
    }

    setIsSending(true);
    try {
      if (hasAudioFile) {
        const formData = new FormData();
        formData.append('questionId', qId);
        formData.append('commentText', commentText.trim());
        if (recordedBlob) {
          formData.append('audio', recordedBlob as any, `devolutiva-${Date.now()}.webm`);
        } else if (pickedAudioFile) {
          formData.append('audio', {
            uri: pickedAudioFile.uri,
            name: pickedAudioFile.name,
            type: pickedAudioFile.mimeType,
          } as any);
        }
        await api.upload(`/classrooms/${classroomId}/question-feedback`, formData);
      } else {
        await api.post(`/classrooms/${classroomId}/question-feedback`, {
          questionId: qId,
          commentText: commentText.trim(),
          audioUrl: audioLinkInput.trim() || null,
        });
      }

      setCommentText('');
      setRecordedBlob(null);
      setPickedAudioFile(null);
      setAudioLinkInput('');
      await loadData();
      Alert.alert('Enviado!', 'Os alunos da turma receberam sua devolutiva (armazenada em storage).');
    } catch (err: any) {
      Alert.alert('Erro', err?.message || 'Não foi possível enviar a devolutiva.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View
          style={[
            styles.header,
            { backgroundColor: theme.surface, borderBottomColor: theme.border },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.text }]}>
              Devolutivas por Questão Errada
            </Text>
            <Text style={[styles.sub, { color: theme.textMuted }]}>
              {classroomName} • Áudio (Storage) e comentários do professor
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <FontAwesome5 name="times" size={16} color={theme.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {canSend && (
            <View
              style={[
                styles.formCard,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                Enviar Devolutiva Comentada / Áudio
              </Text>
              <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: 8 }}>
                Escolha uma questão com erros na turma para comentar a resolução:
              </Text>

              {missedQuestions.length === 0 ? (
                <Text style={{ fontSize: 12.5, color: theme.textMuted, marginBottom: 10 }}>
                  Ainda não há questões vinculadas às tarefas desta turma.
                </Text>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, marginBottom: 12 }}
                >
                  {missedQuestions.map((q, idx) => {
                    const active = (selectedQuestionId || missedQuestions[0]?.id) === q.id;
                    return (
                      <TouchableOpacity
                        key={q.id}
                        onPress={() => setSelectedQuestionId(q.id)}
                        style={{
                          maxWidth: 220,
                          padding: 10,
                          borderRadius: 12,
                          borderWidth: 1.5,
                          borderColor: active ? theme.primary : theme.border,
                          backgroundColor: active ? theme.surfaceMuted : theme.background,
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '800', color: theme.primary }}>
                          Q{idx + 1} • {q.subject} ({q.errorCount} erro{q.errorCount === 1 ? '' : 's'})
                        </Text>
                        <Text numberOfLines={2} style={{ fontSize: 11.5, color: theme.text, marginTop: 3 }}>
                          {q.text}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              <TextInput
                multiline
                numberOfLines={3}
                value={commentText}
                onChangeText={setCommentText}
                placeholder="Explique o raciocínio da questão e o erro mais comum..."
                placeholderTextColor={theme.textMuted}
                style={[
                  styles.textArea,
                  {
                    backgroundColor: theme.surfaceMuted,
                    borderColor: theme.border,
                    color: theme.text,
                  },
                ]}
              />

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <TouchableOpacity
                  onPress={handleToggleRecord}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    borderRadius: 10,
                    backgroundColor: isRecording ? '#DC2626' : '#EDE9FE',
                  }}
                >
                  <FontAwesome5
                    name={isRecording ? 'stop-circle' : Platform.OS === 'web' ? 'microphone' : 'file-audio'}
                    size={13}
                    color={isRecording ? '#FFF' : '#6D28D9'}
                  />
                  <Text style={{ fontSize: 12, fontWeight: '800', color: isRecording ? '#FFF' : '#6D28D9' }}>
                    {isRecording
                      ? 'Parar Gravação'
                      : recordedBlob
                        ? 'Áudio Gravado ✓ (Regravar)'
                        : pickedAudioFile
                          ? `${pickedAudioFile.name} ✓`
                          : Platform.OS === 'web'
                            ? 'Gravar Áudio'
                            : 'Anexar Áudio do Celular'}
                  </Text>
                </TouchableOpacity>

                {Platform.OS === 'web' && (
                  <TouchableOpacity
                    onPress={handlePickMobileAudioFile}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 12,
                      paddingVertical: 9,
                      borderRadius: 10,
                      backgroundColor: '#E0F2FE',
                    }}
                  >
                    <FontAwesome5 name="upload" size={12} color="#0369A1" />
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#0369A1' }}>
                      Subir Arquivo (.mp3/.m4a)
                    </Text>
                  </TouchableOpacity>
                )}

                {(recordedBlob || pickedAudioFile) && (
                  <TouchableOpacity
                    onPress={() => {
                      setRecordedBlob(null);
                      setPickedAudioFile(null);
                    }}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 9,
                      borderRadius: 10,
                      backgroundColor: '#FEE2E2',
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#DC2626' }}>
                      Remover Áudio
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              <TextInput
                value={audioLinkInput}
                onChangeText={setAudioLinkInput}
                placeholder="Ou cole URL de áudio externo (opcional)..."
                placeholderTextColor={theme.textMuted}
                style={[
                  styles.urlInput,
                  {
                    backgroundColor: theme.surfaceMuted,
                    borderColor: theme.border,
                    color: theme.text,
                  },
                ]}
              />

              <TouchableOpacity
                disabled={isSending}
                onPress={handleSendFeedback}
                style={[styles.sendBtn, { backgroundColor: theme.primary }]}
              >
                {isSending ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <FontAwesome5 name="paper-plane" size={13} color="#FFF" />
                )}
                <Text style={styles.sendBtnText}>
                  {isSending ? 'Enviando para Storage...' : 'Publicar Devolutiva na Turma'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Player nativo embutido no Mobile via WebView */}
          {Platform.OS !== 'web' && mobilePlayerUrl && (
            <View
              style={[
                styles.fbCard,
                { backgroundColor: theme.surface, borderColor: theme.primary },
              ]}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={{ fontSize: 12.5, fontWeight: '800', color: theme.primary }}>
                  Player de Áudio da Devolutiva
                </Text>
                <TouchableOpacity onPress={stopAudioPlayback}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#DC2626' }}>Fechar</Text>
                </TouchableOpacity>
              </View>
              <View style={{ height: 58, borderRadius: 10, overflow: 'hidden' }}>
                <WebView
                  source={{
                    html: `<!doctype html><html><body style="margin:0;padding:6px;background:${
                      theme.isDark ? '#1E293B' : '#F8FAFC'
                    };display:flex;align-items:center;"><audio controls autoplay style="width:100%" src="${mobilePlayerUrl}"></audio></body></html>`,
                  }}
                  mediaPlaybackRequiresUserAction={false}
                  allowsInlineMediaPlayback
                />
              </View>
            </View>
          )}

          <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 4 }]}>
            Histórico de Devolutivas ({feedbacks.length})
          </Text>

          {loading ? (
            <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: 24 }} />
          ) : feedbacks.length === 0 ? (
            <View
              style={[
                styles.emptyCard,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <FontAwesome5 name="comment-dots" size={26} color={theme.textMuted} />
              <Text style={{ fontSize: 14, fontWeight: '800', color: theme.text }}>
                Nenhuma devolutiva publicada ainda
              </Text>
              <Text style={{ fontSize: 12, color: theme.textMuted, textAlign: 'center' }}>
                Quando o professor comentar ou gravar explicações sobre questões erradas, elas aparecerão aqui.
              </Text>
            </View>
          ) : (
            feedbacks.map((fb) => {
              const isPlaying = playingId === fb.id;
              return (
                <View
                  key={fb.id}
                  style={[
                    styles.fbCard,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                  ]}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 11.5, fontWeight: '800', color: theme.primary }}>
                      {fb.question.subject} ({fb.question.year})
                    </Text>
                    <Text style={{ fontSize: 11, color: theme.textMuted }}>
                      Prof. {fb.teacher.name}
                    </Text>
                  </View>

                  <Text numberOfLines={2} style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>
                    “{fb.question.text}”
                  </Text>

                  <View
                    style={{
                      marginTop: 8,
                      padding: 10,
                      borderRadius: 10,
                      backgroundColor: theme.surfaceMuted,
                    }}
                  >
                    <Text style={{ fontSize: 13.5, color: theme.text, lineHeight: 19 }}>
                      {fb.commentText}
                    </Text>
                  </View>

                  {fb.audioUrl && (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      <TouchableOpacity
                        onPress={() => handleTogglePlay(fb.id, fb.audioUrl)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 999,
                          backgroundColor: isPlaying ? '#DC2626' : '#0284C7',
                        }}
                      >
                        <FontAwesome5 name={isPlaying ? 'pause' : 'play'} size={11} color="#FFF" />
                        <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '800' }}>
                          {isPlaying ? 'Pausar Áudio do Professor' : 'Ouvir Explicação em Áudio'}
                        </Text>
                      </TouchableOpacity>
                      {resolveMediaUrl(fb.audioUrl)?.startsWith('http') && (
                        <TouchableOpacity
                          onPress={() => {
                            const url = resolveMediaUrl(fb.audioUrl);
                            if (url) Linking.openURL(url).catch(() => {});
                          }}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 8,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: theme.border,
                          }}
                        >
                          <Text style={{ fontSize: 11.5, fontWeight: '700', color: theme.textMuted }}>
                            Abrir Link
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  title: { fontSize: 17, fontWeight: '800' },
  sub: { fontSize: 12, marginTop: 2 },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: { padding: 16, gap: 12, paddingBottom: 32 },
  formCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  textArea: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 82,
    textAlignVertical: 'top',
    fontSize: 13.5,
  },
  urlInput: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12.5,
  },
  sendBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  sendBtnText: { color: '#FFF', fontWeight: '800', fontSize: 13.5 },
  emptyCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  fbCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
});
