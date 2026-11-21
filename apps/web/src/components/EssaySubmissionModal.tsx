import { useThemedStyles } from '@/hooks/use-theme';
import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, BASE_URL } from '@/services/api';
import { ENEM_COMPETENCIES } from '@minuto-enem/shared';

interface EssaySubmissionModalProps {
  visible: boolean;
  onClose: () => void;
  taskId: string;
  taskTitle: string;
  taskTopic?: string;
  classroomId?: string;
}

export function EssaySubmissionModal({
  visible,
  onClose,
  taskId,
  taskTitle,
  taskTopic,
  classroomId,
}: EssaySubmissionModalProps) {
  const styles = useThemedStyles(baseStyles);
  const { width } = useWindowDimensions();
  const queryClient = useQueryClient();

  const [pickedImageUri, setPickedImageUri] = useState<string | null>(null);
  const [pickedMimeType, setPickedMimeType] = useState<string | null>(null);
  const [isZoomModalOpen, setIsZoomModalOpen] = useState(false);
  const [photoZoomScale, setPhotoZoomScale] = useState(1);

  // Busca a submissão de redação do aluno para esta tarefa
  const {
    data: essayData,
    isLoading: isLoadingEssay,
    refetch: refetchEssay,
  } = useQuery({
    queryKey: ['my-essay', taskId],
    queryFn: async () => {
      if (!taskId) return null;
      try {
        const res = await api.get<any>(`/tasks/${taskId}/my-essay`);
        return res;
      } catch {
        return null;
      }
    },
    enabled: visible && Boolean(taskId),
  });

  // Mutação para enviar a foto da redação
  const uploadMutation = useMutation({
    mutationFn: async (imageUri: string) => {
      const formData = new FormData();

      if (Platform.OS === 'web') {
        const response = await fetch(imageUri);
        const blob = await response.blob();
        formData.append('file', blob, 'redacao.jpg');
      } else {
        formData.append('file', {
          uri: imageUri,
          name: 'redacao.jpg',
          type: pickedMimeType || 'image/jpeg',
        } as any);
      }

      formData.append('taskId', taskId);

      const res = await api.post<any>(`/tasks/${taskId}/essay`, formData);
      return res;
    },
    onSuccess: () => {
      setPickedImageUri(null);
      setPickedMimeType(null);
      refetchEssay();
      queryClient.invalidateQueries({ queryKey: ['classroom-tasks', classroomId] });
      queryClient.invalidateQueries({ queryKey: ['classroom-detail', classroomId] });
      Alert.alert(
        'Redação Enviada! 📝',
        'Sua folha de redação foi enviada com sucesso para a Oficina Nota 1000. Aguarde a correção detalhada do seu professor!'
      );
    },
    onError: (err: any) => {
      Alert.alert(
        'Erro no Envio',
        err.message || 'Não foi possível enviar a foto da redação. Tente novamente.'
      );
    },
  });

  // Ação para tirar foto com a câmera
  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permissão Necessária',
          'Precisamos de permissão para acessar a câmera para que você fotografe sua redação.'
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.9,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        setPickedImageUri(result.assets[0].uri);
        setPickedMimeType(result.assets[0].mimeType || 'image/jpeg');
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível abrir a câmera.');
    }
  };

  // Ação para escolher da galeria de fotos
  const handlePickFromGallery = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permissão Necessária',
          'Precisamos de permissão para acessar suas fotos para selecionar sua folha de redação.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.9,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        setPickedImageUri(result.assets[0].uri);
        setPickedMimeType(result.assets[0].mimeType || 'image/jpeg');
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível acessar a galeria de imagens.');
    }
  };

  const currentStatus = essayData?.status || (pickedImageUri ? 'SELECTED' : 'NONE');
  const rawImageUrl = essayData?.imageUrl;
  const fullImageUrl = rawImageUrl
    ? rawImageUrl.startsWith('http')
      ? rawImageUrl
      : `${BASE_URL}${rawImageUrl}`
    : null;

  const displayImageUri = pickedImageUri || fullImageUrl;

  const getScoreColor = (score?: number | null) => {
    if (score === null || score === undefined) return '#64748B';
    if (score >= 900) return '#16A34A';
    if (score >= 700) return '#0284C7';
    if (score >= 500) return '#D97706';
    return '#DC2626';
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { maxWidth: Math.min(width - 24, 760) }]}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <View style={styles.headerBadgeRow}>
                <View style={styles.officeBadge}>
                  <FontAwesome5 name="pen-fancy" size={11} color="#FFF" style={{ marginRight: 6 }} />
                  <Text style={styles.officeBadgeText}>Oficina Nota 1000</Text>
                </View>
                {currentStatus === 'CORRECTED' && (
                  <View style={styles.statusCorrectedBadge}>
                    <FontAwesome5 name="check-circle" size={11} color="#16A34A" style={{ marginRight: 4 }} />
                    <Text style={styles.statusCorrectedText}>Corrigida</Text>
                  </View>
                )}
                {currentStatus === 'PENDING' && (
                  <View style={styles.statusPendingBadge}>
                    <FontAwesome5 name="hourglass-half" size={11} color="#D97706" style={{ marginRight: 4 }} />
                    <Text style={styles.statusPendingText}>Aguardando Correção</Text>
                  </View>
                )}
              </View>
              <Text style={styles.modalTitle} numberOfLines={2}>
                {taskTitle}
              </Text>
              {taskTopic && (
                <Text style={styles.modalSub} numberOfLines={1}>
                  Tema: {taskTopic}
                </Text>
              )}
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
              <FontAwesome5 name="times" size={16} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Conteúdo com Scroll */}
          <ScrollView
            style={styles.modalBody}
            contentContainerStyle={styles.modalBodyContent}
            showsVerticalScrollIndicator={false}
          >
            {isLoadingEssay ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#0284C7" />
                <Text style={styles.loadingText}>Carregando dados da redação...</Text>
              </View>
            ) : (
              <>
                {/* 1. SE A REDAÇÃO JÁ FOI CORRIGIDA (STATUS = CORRECTED) */}
                {essayData?.status === 'CORRECTED' && (
                  <View style={styles.gradeReportSection}>
                    {/* Banner de Nota Final */}
                    <View style={styles.finalScoreBanner}>
                      <View style={styles.finalScoreIconCircle}>
                        <FontAwesome5 name="trophy" size={24} color="#F59E0B" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.finalScoreLabel}>Nota Final no ENEM</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                          <Text
                            style={[
                              styles.finalScoreValue,
                              { color: getScoreColor(essayData.finalScore) },
                            ]}
                          >
                            {essayData.finalScore ?? 0}
                          </Text>
                          <Text style={styles.finalScoreMax}> / 1000 pontos</Text>
                        </View>
                      </View>
                    </View>

                    {/* Detalhamento das 5 Competências */}
                    <Text style={styles.sectionSubtitle}>Desempenho por Competência do ENEM</Text>
                    <View style={styles.competenciesList}>
                      {ENEM_COMPETENCIES.map((comp) => {
                        const score = essayData[comp.key] ?? 0;
                        const percent = (score / 200) * 100;
                        return (
                          <View key={comp.key} style={styles.competencyCard}>
                            <View style={styles.competencyHeader}>
                              <View style={styles.competencyPill}>
                                <Text style={styles.competencyPillText}>{comp.name}</Text>
                              </View>
                              <Text style={styles.competencyScoreText}>{score} / 200 pts</Text>
                            </View>
                            <Text style={styles.competencyTitle}>{comp.title}</Text>
                            <Text style={styles.competencyDesc}>{comp.description}</Text>
                            <View style={styles.progressBarBg}>
                              <View
                                style={[
                                  styles.progressBarFill,
                                  {
                                    width: `${percent}%`,
                                    backgroundColor: getScoreColor(score * 5),
                                  },
                                ]}
                              />
                            </View>
                          </View>
                        );
                      })}
                    </View>

                    {/* Comentários Gerais do Professor */}
                    {essayData.generalFeedback ? (
                      <View style={styles.feedbackCard}>
                        <View style={styles.feedbackHeader}>
                          <FontAwesome5 name="comment-dots" size={16} color="#0284C7" />
                          <Text style={styles.feedbackTitle}>Feedback do Professor</Text>
                        </View>
                        <Text style={styles.feedbackContent}>{essayData.generalFeedback}</Text>
                        {essayData.correctedBy?.name && (
                          <Text style={styles.feedbackAuthor}>
                            Avaliado por: Prof. {essayData.correctedBy.name}
                          </Text>
                        )}
                      </View>
                    ) : null}
                  </View>
                )}

                {/* 2. SE A REDAÇÃO ESTÁ AGUARDANDO CORREÇÃO (STATUS = PENDING) */}
                {essayData?.status === 'PENDING' && !pickedImageUri && (
                  <View style={styles.pendingNoticeCard}>
                    <View style={styles.pendingNoticeIcon}>
                      <FontAwesome5 name="clock" size={20} color="#D97706" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pendingNoticeTitle}>Aguardando Correção do Professor</Text>
                      <Text style={styles.pendingNoticeText}>
                        Sua folha de redação foi entregue com sucesso e já está disponível para o professor avaliar. Assim que corrigida, suas notas de 0 a 1000 aparecerão aqui!
                      </Text>
                    </View>
                  </View>
                )}

                {/* 3. VISUALIZAÇÃO DA FOTO (FOTO ESCOLHIDA OU JÁ SUBMETIDA) */}
                {displayImageUri ? (
                  <View style={styles.photoPreviewSection}>
                    <View style={styles.photoHeaderRow}>
                      <Text style={styles.sectionSubtitle}>
                        {pickedImageUri ? 'Foto Selecionada' : 'Folha de Redação Enviada'}
                      </Text>
                      <TouchableOpacity
                        style={styles.zoomToggleBtn}
                        onPress={() => {
                          setPhotoZoomScale(1);
                          setIsZoomModalOpen(true);
                        }}
                      >
                        <FontAwesome5 name="search-plus" size={12} color="#0284C7" style={{ marginRight: 6 }} />
                        <Text style={styles.zoomToggleText}>Ampliar Folha</Text>
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      activeOpacity={0.9}
                      style={styles.imageWrapper}
                      onPress={() => {
                        setPhotoZoomScale(1);
                        setIsZoomModalOpen(true);
                      }}
                    >
                      <Image
                        source={{ uri: displayImageUri }}
                        style={styles.previewImage}
                        resizeMode="contain"
                      />
                      <View style={styles.imageOverlayHint}>
                        <FontAwesome5 name="search-plus" size={14} color="#FFF" style={{ marginRight: 6 }} />
                        <Text style={styles.imageOverlayHintText}>Toque para ampliar e ler</Text>
                      </View>
                    </TouchableOpacity>

                    {/* Botões para foto recém-selecionada */}
                    {pickedImageUri ? (
                      <View style={styles.actionButtonsRow}>
                        <TouchableOpacity
                          style={styles.cancelPickBtn}
                          onPress={() => setPickedImageUri(null)}
                          disabled={uploadMutation.isPending}
                        >
                          <Text style={styles.cancelPickText}>Descartar</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.submitPhotoBtn}
                          onPress={() => uploadMutation.mutate(pickedImageUri)}
                          disabled={uploadMutation.isPending}
                        >
                          {uploadMutation.isPending ? (
                            <ActivityIndicator size="small" color="#FFF" />
                          ) : (
                            <>
                              <FontAwesome5 name="paper-plane" size={13} color="#FFF" style={{ marginRight: 8 }} />
                              <Text style={styles.submitPhotoText}>Confirmar e Enviar Redação</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>
                    ) : (
                      /* Se já submetido, permite substituir foto */
                      <View style={styles.actionButtonsRow}>
                        <TouchableOpacity
                          style={styles.retakeBtn}
                          onPress={handleTakePhoto}
                          activeOpacity={0.8}
                        >
                          <FontAwesome5 name="camera" size={12} color="#475569" style={{ marginRight: 6 }} />
                          <Text style={styles.retakeBtnText}>Tirar Nova Foto</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.retakeBtn}
                          onPress={handlePickFromGallery}
                          activeOpacity={0.8}
                        >
                          <FontAwesome5 name="image" size={12} color="#475569" style={{ marginRight: 6 }} />
                          <Text style={styles.retakeBtnText}>Escolher da Galeria</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ) : (
                  /* 4. NENHUMA FOTO ENVIADA AINDA: OPÇÕES DE CAPTURA */
                  <View style={styles.uploadPromptSection}>
                    <View style={styles.instructionCard}>
                      <FontAwesome5 name="info-circle" size={18} color="#0284C7" style={{ marginRight: 10, marginTop: 2 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.instructionTitle}>Como funciona o envio?</Text>
                        <Text style={styles.instructionText}>
                          1. Escreva sua redação na folha pautada padrão do ENEM.{'\n'}
                          2. Tire uma foto nítida e bem iluminada da folha inteira.{'\n'}
                          3. O professor avaliará sua redação nas 5 competências oficiais do ENEM.
                        </Text>
                      </View>
                    </View>

                    <View style={styles.captureOptionsRow}>
                      <TouchableOpacity
                        style={styles.captureOptionCard}
                        onPress={handleTakePhoto}
                        activeOpacity={0.8}
                      >
                        <View style={[styles.captureIconCircle, { backgroundColor: '#E0F2FE' }]}>
                          <FontAwesome5 name="camera" size={26} color="#0284C7" />
                        </View>
                        <Text style={styles.captureOptionTitle}>Tirar Foto Agora</Text>
                        <Text style={styles.captureOptionSub}>
                          Fotografe sua folha de redação diretamente com a câmera do celular
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.captureOptionCard}
                        onPress={handlePickFromGallery}
                        activeOpacity={0.8}
                      >
                        <View style={[styles.captureIconCircle, { backgroundColor: '#FEF3C7' }]}>
                          <FontAwesome5 name="image" size={26} color="#D97706" />
                        </View>
                        <Text style={styles.captureOptionTitle}>Escolher da Galeria</Text>
                        <Text style={styles.captureOptionSub}>
                          Selecione uma foto da folha de redação já salva no seu dispositivo
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.closeFooterBtn} onPress={onClose}>
              <Text style={styles.closeFooterBtnText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* MODAL DE ZOOM DA FOLHA DE REDAÇÃO */}
      {isZoomModalOpen && displayImageUri && (
        <Modal
          visible={isZoomModalOpen}
          animationType="fade"
          transparent
          onRequestClose={() => setIsZoomModalOpen(false)}
        >
          <View style={styles.zoomModalOverlay}>
            <View style={styles.zoomControlsHeader}>
              <View style={styles.zoomControlsGroup}>
                <TouchableOpacity
                  style={styles.zoomIconBtn}
                  onPress={() => setPhotoZoomScale((s) => Math.max(0.8, s - 0.25))}
                >
                  <FontAwesome5 name="search-minus" size={16} color="#FFF" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.zoomIconBtn}
                  onPress={() => setPhotoZoomScale(1)}
                >
                  <Text style={styles.zoomResetText}>100%</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.zoomIconBtn}
                  onPress={() => setPhotoZoomScale((s) => Math.min(3, s + 0.25))}
                >
                  <FontAwesome5 name="search-plus" size={16} color="#FFF" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.zoomCloseBtn}
                onPress={() => setIsZoomModalOpen(false)}
              >
                <FontAwesome5 name="times" size={18} color="#FFF" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ flex: 1, width: '100%' }}
              contentContainerStyle={styles.zoomScrollContent}
              maximumZoomScale={3}
              minimumZoomScale={0.8}
            >
              <Image
                source={{ uri: displayImageUri }}
                style={[
                  styles.zoomedImage,
                  {
                    transform: [{ scale: photoZoomScale }],
                  },
                ]}
                resizeMode="contain"
              />
            </ScrollView>
          </View>
        </Modal>
      )}
    </Modal>
  );
}

const baseStyles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  modalCard: {
    width: '100%',
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 25,
    elevation: 10,
    display: 'flex',
    flexDirection: 'column',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  headerBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  officeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8E44AD',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  officeBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  statusCorrectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusCorrectedText: {
    color: '#16A34A',
    fontSize: 11,
    fontWeight: '700',
  },
  statusPendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusPendingText: {
    color: '#D97706',
    fontSize: 11,
    fontWeight: '700',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1E293B',
  },
  modalSub: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#E2E8F0',
  },
  modalBody: {
    flex: 1,
  },
  modalBodyContent: {
    padding: 20,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
  },
  sectionSubtitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 12,
  },
  gradeReportSection: {
    marginBottom: 20,
  },
  finalScoreBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  finalScoreIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  finalScoreLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
    textTransform: 'uppercase',
  },
  finalScoreValue: {
    fontSize: 32,
    fontWeight: '900',
  },
  finalScoreMax: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94A3B8',
  },
  competenciesList: {
    gap: 12,
    marginBottom: 20,
  },
  competencyCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  competencyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  competencyPill: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  competencyPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  competencyScoreText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  competencyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 2,
  },
  competencyDesc: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 8,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  feedbackCard: {
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  feedbackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  feedbackTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0369A1',
  },
  feedbackContent: {
    fontSize: 14,
    color: '#0C4A6E',
    lineHeight: 20,
    fontStyle: 'italic',
  },
  feedbackAuthor: {
    fontSize: 11,
    color: '#0284C7',
    fontWeight: '700',
    marginTop: 8,
  },
  pendingNoticeCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    alignItems: 'center',
    gap: 12,
  },
  pendingNoticeIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingNoticeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 2,
  },
  pendingNoticeText: {
    fontSize: 12,
    color: '#B45309',
    lineHeight: 17,
  },
  photoPreviewSection: {
    marginTop: 8,
    marginBottom: 16,
  },
  photoHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  zoomToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#E0F2FE',
  },
  zoomToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284C7',
  },
  imageWrapper: {
    width: '100%',
    height: 320,
    backgroundColor: '#0F172A',
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  imageOverlayHint: {
    position: 'absolute',
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  imageOverlayHintText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  cancelPickBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelPickText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  submitPhotoBtn: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitPhotoText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  retakeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  retakeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  uploadPromptSection: {
    gap: 16,
  },
  instructionCard: {
    flexDirection: 'row',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 12,
    padding: 14,
  },
  instructionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0369A1',
    marginBottom: 4,
  },
  instructionText: {
    fontSize: 12,
    color: '#0284C7',
    lineHeight: 18,
  },
  captureOptionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  captureOptionCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    textAlign: 'center',
  },
  captureIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  captureOptionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
    textAlign: 'center',
  },
  captureOptionSub: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 15,
  },
  modalFooter: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'flex-end',
  },
  closeFooterBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#E2E8F0',
  },
  closeFooterBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  zoomModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomControlsHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  zoomControlsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  zoomIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomResetText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  zoomCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(239, 68, 68, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  zoomedImage: {
    width: '95%',
    height: '95%',
    minWidth: 320,
    minHeight: 500,
  },
});
