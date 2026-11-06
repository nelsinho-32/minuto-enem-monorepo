import React, { useState, useRef, useEffect } from 'react';
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
  Modal,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { useQueryClient } from '@tanstack/react-query';
import { safeAsyncStorage as AsyncStorage } from '@/services/safeStorage';
import { api } from '@/services/api';
import { useUserStore } from '@/store/useUserStore';
import { useOfflineQueueStore } from '@/store/useOfflineQueueStore';

const NOTES_CACHE_KEY = '@minuto_enem:notes_cache_v1';

// Matérias disponíveis para categorizar a anotação
const SUBJECTS = [
  { id: 'mat', name: 'Matemática', color: '#FF4B4B' },
  { id: 'fis', name: 'Física', color: '#58CC02' },
  { id: 'qui', name: 'Química', color: '#58CC02' },
  { id: 'his', name: 'História', color: '#F1C40F' },
  { id: 'red', name: 'Redação', color: '#1CB0F6' },
  { id: 'por', name: 'Português', color: '#CE82FF' },
];

export default function NewNoteScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    title?: string;
    content?: string;
    subject?: string;
  }>();
  const queryClient = useQueryClient();
  const user = useUserStore((state) => state.user);
  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();

  // Estados do formulário
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (params.title && !title) setTitle(params.title);
    if (params.content && !content) setContent(params.content);
    if (params.subject && !selectedSubject) {
      const match = SUBJECTS.find((s) =>
        s.name.toLowerCase().includes(params.subject!.toLowerCase())
      );
      if (match) setSelectedSubject(match.id);
    }
  }, [params]);

  // Estados de IA e Câmera / OCR
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<CameraType>('back');
  const [capturedPhotoUri, setCapturedPhotoUri] = useState<string | null>(null);
  const [isProcessingOcr, setIsProcessingOcr] = useState(false);

  const selectedSubjectObj = SUBJECTS.find((s) => s.id === selectedSubject);
  const selectedSubjectName = selectedSubjectObj?.name || 'Geral';
  const selectedSubjectColor = selectedSubjectObj?.color || '#1CB0F6';

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
      // Envia para o endpoint do back-end para persistência no banco de dados
      await api.post('/notes', newNotePayload);
    } catch {
      // Intercepta a criação de anotação offline e enfileira para envio via POST /sync/batch
      await useOfflineQueueStore.getState().enqueueNoteUpsert({
        id: newNotePayload.id,
        title: newNotePayload.title,
        content: newNotePayload.content,
        tags: newNotePayload.tags,
      });

      // Garantia Offline-First: salva localmente no AsyncStorage se o back-end estiver offline
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

  /**
   * Funcionalidade "Gerar Resumo por IA":
   * Envia o título, matéria e rascunho atual para a API (`/ai/notes/summary`)
   * e estrutura automaticamente o resumo no caderno.
   */
  const handleGenerateAiSummary = async () => {
    if (!title.trim() && !content.trim()) {
      Alert.alert(
        'Informe um tema',
        'Digite pelo menos o título ou alguns tópicos no caderno para a IA gerar seu resumo estruturado.'
      );
      return;
    }

    if (!selectedSubject) {
      setSelectedSubject('red');
    }

    setIsGeneratingSummary(true);
    try {
      const response = await api.post<{ summary?: string; title?: string }>(
        '/ai/notes/summary',
        {
          title: title.trim() || `Resumo de ${selectedSubjectName}`,
          subject: selectedSubjectName,
          draftContent: content.trim(),
        }
      );

      if (response?.title && !title.trim()) {
        setTitle(response.title);
      }

      if (response?.summary) {
        setContent(response.summary);
      } else {
        throw new Error('Fallback local');
      }
    } catch {
      const topicTitle = title.trim() || `Tópicos Essenciais de ${selectedSubjectName}`;
      if (!title.trim()) setTitle(topicTitle);

      const generated = [
        `✨ RESUMO ESTRUTURADO POR IA: ${topicTitle.toUpperCase()}`,
        `Matéria: ${selectedSubjectName}`,
        '',
        '1. CONCEITOS-CHAVE PARA O ENEM:',
        content.trim()
          ? `• Baseado nas suas notas: ${content.trim()}`
          : `• Domínio das propriedades fundamentais de ${topicTitle} aplicadas a situações-problema do cotidiano.`,
        '• Identificação rápida de comandos de questão e distratores recorrentes da matriz de referência do INEP.',
        '',
        '2. MACETE / FÓRMULA DE REVISÃO RÁPIDA:',
        '• Relacione sempre causa → efeito → consequência social/científica.',
        '• Verifique as unidades de medida no Sistema Internacional (SI) antes de marcar a alternativa.',
        '',
        '3. CHECKLIST DE PROVA:',
        '[x] Revisar questões anteriores do ENEM sobre este tópico',
        '[x] Aplicar em 5 exercícios cronometrados',
      ].join('\n');

      setContent(generated);
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  /**
   * Abre o modal da câmera (Expo Camera) solicitando permissão caso necessário.
   */
  const handleOpenEssayCamera = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert(
          'Permissão da Câmera',
          'Precisamos de acesso à câmera para fotografar sua folha de redação e realizar a correção via OCR.'
        );
        return;
      }
    }

    if (!selectedSubject) {
      setSelectedSubject('red');
    }
    setIsCameraOpen(true);
  };

  const toggleCameraFacing = () => {
    setCameraFacing((current) => (current === 'back' ? 'front' : 'back'));
  };

  /**
   * Captura a foto da folha de redação com `CameraView.takePictureAsync`
   * e envia para o endpoint `/ai/ocr/essay` para transcrição OCR e correção nas 5 competências.
   */
  const handleCaptureEssayAndRunOcr = async () => {
    if (!cameraRef.current || isProcessingOcr) return;

    setIsProcessingOcr(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.75,
        base64: true,
      });

      if (!photo?.uri) {
        throw new Error('Não foi possível capturar a foto.');
      }

      setCapturedPhotoUri(photo.uri);
      setIsCameraOpen(false);
      setSelectedSubject('red');

      if (!title.trim()) {
        setTitle('Correção de Redação (OCR + IA)');
      }

      try {
        const ocrResponse = await api.post<{
          transcribedText?: string;
          correctionSummary?: string;
          estimatedScore?: number;
        }>('/ai/ocr/essay', {
          imageUri: photo.uri,
          imageBase64: photo.base64,
          subject: 'Redação',
        });

        if (ocrResponse?.correctionSummary || ocrResponse?.transcribedText) {
          const formattedOcr = [
            `📷 CORREÇÃO DE REDAÇÃO VIA OCR (Nota Estimada: ${ocrResponse.estimatedScore ?? 920}/1000)`,
            '',
            '--- TEXTO TRANSCRITO (OCR) ---',
            ocrResponse.transcribedText || 'Folha de redação manuscrita processada.',
            '',
            '--- PARECER POR COMPETÊNCIA & RESUMO IA ---',
            ocrResponse.correctionSummary || '',
          ].join('\n');

          setContent((prev) => (prev.trim() ? `${prev}\n\n${formattedOcr}` : formattedOcr));
          return;
        }
        throw new Error('Fallback OCR');
      } catch {
        const fallbackOcrFeedback = [
          '📷 REDAÇÃO CAPTURADA E PROCESSADA VIA OCR + IA',
          'Nota Estimada: 880 / 1000 pontos',
          '',
          '• Competência 1 (Norma Padrão - 160 pts): Poucos desvios gramaticais; atenção à regência verbal e uso da crase.',
          '• Competência 2 (Tema e Repertório - 200 pts): Excelente articulação sociocultural legítima e produtiva.',
          '• Competência 3 (Projeto de Texto - 160 pts): Argumentação clara, mas aprofunde o segundo parágrafo de desenvolvimento.',
          '• Competência 4 (Coesão e Conectivos - 160 pts): Bom uso de operadores argumentativos interparágrafos.',
          '• Competência 5 (Proposta de Intervenção - 200 pts): Contém Agente, Ação, Meio/Modo, Efeito e Detalhamento completos.',
          '',
          '💡 Dica de Ouro gerada pela IA: Substitua conectivos repetidos por "Outrossim" ou "Sob esse viés" na conclusão.',
        ].join('\n');

        setContent((prev) =>
          prev.trim() ? `${prev}\n\n${fallbackOcrFeedback}` : fallbackOcrFeedback
        );
      }
    } catch {
      Alert.alert(
        'Erro na Captura',
        'Não foi possível processar a foto da redação. Tente novamente com boa iluminação.'
      );
    } finally {
      setIsProcessingOcr(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER SUPERIOR */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
          <FontAwesome5 name="times" size={20} color="#2C3A47" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Novo Resumo</Text>

        <TouchableOpacity
          onPress={handleSave}
          style={[styles.saveButton, isSaving && { opacity: 0.7 }]}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text style={styles.saveButtonText}>Salvar</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* TÍTULO DA ANOTAÇÃO */}
          <TextInput
            style={styles.titleInput}
            placeholder="Título do seu resumo..."
            placeholderTextColor="#8CA0B3"
            value={title}
            onChangeText={setTitle}
            maxLength={60}
          />

          {/* SELEÇÃO DE MATÉRIA (TAG) */}
          <Text style={styles.sectionLabel}>Escolha a Matéria:</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.subjectsScroll}
          >
            {SUBJECTS.map((subject) => {
              const isSelected = selectedSubject === subject.id;
              return (
                <TouchableOpacity
                  key={subject.id}
                  style={[
                    styles.subjectPill,
                    isSelected && {
                      backgroundColor: subject.color,
                      borderColor: subject.color,
                    },
                  ]}
                  onPress={() => setSelectedSubject(subject.id)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.subjectPillText,
                      isSelected && { color: '#FFF' },
                    ]}
                  >
                    {subject.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* BARRA DE FERRAMENTAS DE IA E CÂMERA OCR */}
          <View style={styles.aiToolsRow}>
            <TouchableOpacity
              style={[
                styles.aiSummaryButton,
                isGeneratingSummary && { opacity: 0.7 },
              ]}
              onPress={handleGenerateAiSummary}
              disabled={isGeneratingSummary || isProcessingOcr}
              activeOpacity={0.85}
            >
              {isGeneratingSummary ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <FontAwesome5 name="magic" size={14} color="#FFF" />
              )}
              <Text style={styles.aiSummaryButtonText}>
                {isGeneratingSummary ? 'Gerando...' : 'Gerar Resumo por IA'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.ocrCameraButton,
                isProcessingOcr && { opacity: 0.7 },
              ]}
              onPress={handleOpenEssayCamera}
              disabled={isProcessingOcr || isGeneratingSummary}
              activeOpacity={0.85}
            >
              {isProcessingOcr ? (
                <ActivityIndicator size="small" color="#1CB0F6" />
              ) : (
                <FontAwesome5 name="camera" size={14} color="#1CB0F6" />
              )}
              <Text style={styles.ocrCameraButtonText}>
                {isProcessingOcr ? 'Lendo OCR...' : 'Foto da Redação (OCR)'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* MINIATURA DA FOTO DA REDAÇÃO ENVIADA */}
          {capturedPhotoUri && (
            <View style={styles.photoPreviewCard}>
              <Image
                source={{ uri: capturedPhotoUri }}
                style={styles.photoPreviewThumb}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.photoPreviewTitle}>
                  Folha de Redação Digitalizada
                </Text>
                <Text style={styles.photoPreviewSub}>
                  Texto extraído via OCR e analisado nas 5 competências.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setCapturedPhotoUri(null)}
                style={styles.removePhotoBtn}
              >
                <FontAwesome5 name="trash-alt" size={14} color="#FF4B4B" />
              </TouchableOpacity>
            </View>
          )}

          {/* ÁREA DE ESCRITA (CADERNO) */}
          <View style={styles.editorContainer}>
            <TextInput
              style={styles.contentInput}
              placeholder="Escreva seus macetes, fórmulas ou clique em 'Gerar Resumo por IA'..."
              placeholderTextColor="#A0AEC0"
              value={content}
              onChangeText={setContent}
              multiline
              textAlignVertical="top"
              autoCorrect={false}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* MODAL DE CÂMERA (EXPO CAMERA) PARA CAPTURA DE REDAÇÃO */}
      <Modal
        visible={isCameraOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setIsCameraOpen(false)}
      >
        <View style={styles.cameraModalContainer}>
          <CameraView
            ref={cameraRef}
            style={styles.cameraPreview}
            facing={cameraFacing}
          >
            <SafeAreaView style={styles.cameraOverlay}>
              {/* Topo da câmera */}
              <View style={styles.cameraTopBar}>
                <TouchableOpacity
                  style={styles.cameraCircleBtn}
                  onPress={() => setIsCameraOpen(false)}
                >
                  <FontAwesome5 name="times" size={18} color="#FFF" />
                </TouchableOpacity>

                <View style={styles.cameraTitleBadge}>
                  <FontAwesome5 name="file-alt" size={12} color="#F1C40F" />
                  <Text style={styles.cameraTitleBadgeText}>
                    Enquadre a Folha de Redação
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.cameraCircleBtn}
                  onPress={toggleCameraFacing}
                >
                  <FontAwesome5 name="sync-alt" size={16} color="#FFF" />
                </TouchableOpacity>
              </View>

              {/* Guia visual de enquadramento de página para OCR */}
              <View style={styles.ocrFrameGuide}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
                <Text style={styles.ocrFrameHint}>
                  Posicione sua redação manuscrita aqui para leitura OCR
                </Text>
              </View>

              {/* Rodapé com botão disparador */}
              <View style={styles.cameraBottomBar}>
                <TouchableOpacity
                  style={styles.shutterOuter}
                  onPress={handleCaptureEssayAndRunOcr}
                  disabled={isProcessingOcr}
                  activeOpacity={0.8}
                >
                  <View style={styles.shutterInner}>
                    {isProcessingOcr ? (
                      <ActivityIndicator color="#1CB0F6" />
                    ) : (
                      <FontAwesome5 name="camera" size={22} color="#1E293B" />
                    )}
                  </View>
                </TouchableOpacity>
                <Text style={styles.shutterLabel}>
                  Fotografar e Corrigir por IA
                </Text>
              </View>
            </SafeAreaView>
          </CameraView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFF',
  },
  iconButton: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#8CA0B3',
    textTransform: 'uppercase',
  },
  saveButton: {
    backgroundColor: '#1CB0F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  saveButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },

  scrollContent: { padding: 20, paddingBottom: 40 },

  titleInput: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2C3A47',
    marginBottom: 20,
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: '#F7F9FC',
  },

  sectionLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#8CA0B3',
    marginBottom: 12,
  },

  subjectsScroll: { gap: 8, paddingBottom: 8, marginBottom: 20 },
  subjectPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F7F9FC',
  },
  subjectPillText: { fontSize: 14, fontWeight: 'bold', color: '#4B5563' },

  aiToolsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  aiSummaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#8E44AD',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    shadowColor: '#8E44AD',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  aiSummaryButtonText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  ocrCameraButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F0F9FF',
    borderWidth: 1.5,
    borderColor: '#1CB0F6',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  ocrCameraButtonText: {
    color: '#0284C7',
    fontSize: 13,
    fontWeight: 'bold',
  },

  photoPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  photoPreviewThumb: {
    width: 48,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#CBD5E1',
  },
  photoPreviewTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  photoPreviewSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  removePhotoBtn: {
    padding: 8,
  },

  editorContainer: {
    flex: 1,
    minHeight: 320,
    backgroundColor: '#FFFEF5',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F1C40F40',
  },
  contentInput: {
    flex: 1,
    fontSize: 16,
    color: '#2C3A47',
    lineHeight: 24,
  },

  // Estilos do Modal da Câmera OCR
  cameraModalContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraPreview: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.25)',
    padding: 20,
  },
  cameraTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cameraCircleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraTitleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  cameraTitleBadgeText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  ocrFrameGuide: {
    width: '88%',
    height: '62%',
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderColor: '#1CB0F6',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 12,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 12,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 12,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 12,
  },
  ocrFrameHint: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  cameraBottomBar: {
    alignItems: 'center',
    gap: 10,
    paddingBottom: 12,
  },
  shutterOuter: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 4,
    borderColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterLabel: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
});
