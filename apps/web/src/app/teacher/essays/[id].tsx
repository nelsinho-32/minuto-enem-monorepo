import { useThemedStyles } from '@/hooks/use-theme';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, BASE_URL } from '@/services/api';
import { RoleGuard } from '@/components/RoleGuard';
import { ENEM_COMPETENCIES, CompetencyLevelValues } from '@minuto-enem/shared';

export default function TeacherGradeEssayScreen() {
  const styles = useThemedStyles(baseStyles);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const queryClient = useQueryClient();

  const isWideScreen = width >= 860;

  // Estados das notas das 5 competências (0 a 200 cada)
  const [competency1, setCompetency1] = useState<number>(120);
  const [competency2, setCompetency2] = useState<number>(120);
  const [competency3, setCompetency3] = useState<number>(120);
  const [competency4, setCompetency4] = useState<number>(120);
  const [competency5, setCompetency5] = useState<number>(120);
  const [generalFeedback, setGeneralFeedback] = useState<string>('');

  // Estado de zoom do visualizador da imagem
  const [zoomScale, setZoomScale] = useState<number>(1);

  // Busca detalhes da submissão da redação
  const {
    data: essay,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['essay-detail', id],
    queryFn: async () => {
      if (!id) return null;
      const res = await api.get<any>(`/essays/${id}`);
      return res;
    },
    enabled: Boolean(id),
  });

  // Preenche dados existentes se já foi corrigida previamente
  useEffect(() => {
    if (essay) {
      if (essay.competency1 !== null && essay.competency1 !== undefined) {
        setCompetency1(essay.competency1);
      }
      if (essay.competency2 !== null && essay.competency2 !== undefined) {
        setCompetency2(essay.competency2);
      }
      if (essay.competency3 !== null && essay.competency3 !== undefined) {
        setCompetency3(essay.competency3);
      }
      if (essay.competency4 !== null && essay.competency4 !== undefined) {
        setCompetency4(essay.competency4);
      }
      if (essay.competency5 !== null && essay.competency5 !== undefined) {
        setCompetency5(essay.competency5);
      }
      if (essay.generalFeedback) {
        setGeneralFeedback(essay.generalFeedback);
      }
    }
  }, [essay]);

  // Cálculo automático da nota final somando as 5 competências (0 a 1000)
  const finalScore =
    competency1 + competency2 + competency3 + competency4 + competency5;

  // Mutação para salvar a correção
  const gradeMutation = useMutation({
    mutationFn: async () => {
      if (!generalFeedback || generalFeedback.trim().length < 5) {
        throw new Error(
          'Escreva um feedback geral de pelo menos 5 caracteres para orientar o aluno.'
        );
      }

      const payload = {
        competency1,
        competency2,
        competency3,
        competency4,
        competency5,
        generalFeedback: generalFeedback.trim(),
      };

      const res = await api.patch<any>(`/essays/${id}/grade`, payload);
      return res;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['teacher-essays'] });
      queryClient.invalidateQueries({ queryKey: ['essay-detail', id] });
      Alert.alert(
        'Correção Concluída! 🎉',
        `A redação foi corrigida com sucesso! Nota final: ${data.finalScore}/1000. O aluno já pode conferir a nota e seu feedback.`,
        [
          {
            text: 'Voltar à Lista',
            onPress: () => router.push('/teacher/essays' as any),
          },
        ]
      );
    },
    onError: (err: any) => {
      Alert.alert('Erro ao Salvar Correção', err.message || 'Tente novamente.');
    },
  });

  const rawImageUrl = essay?.imageUrl;
  const fullImageUrl = rawImageUrl
    ? rawImageUrl.startsWith('http')
      ? rawImageUrl
      : `${BASE_URL}${rawImageUrl}`
    : null;

  const getScoreClassification = (score: number) => {
    if (score >= 900) return { label: 'Excelente (Faixa de Redação Nota 1000)', color: '#16A34A', bg: '#DCFCE7' };
    if (score >= 700) return { label: 'Bom Desempenho (Acima da Média Nacional)', color: '#0284C7', bg: '#E0F2FE' };
    if (score >= 500) return { label: 'Regular (Necessita de ajustes estruturais)', color: '#D97706', bg: '#FEF3C7' };
    return { label: 'Abaixo do Esperado (Requer atenção urgente)', color: '#DC2626', bg: '#FEE2E2' };
  };

  const classification = getScoreClassification(finalScore);

  const setCompetencyValue = (compIndex: number, val: number) => {
    switch (compIndex) {
      case 1:
        setCompetency1(val);
        break;
      case 2:
        setCompetency2(val);
        break;
      case 3:
        setCompetency3(val);
        break;
      case 4:
        setCompetency4(val);
        break;
      case 5:
        setCompetency5(val);
        break;
    }
  };

  const getCompetencyValue = (compIndex: number) => {
    switch (compIndex) {
      case 1:
        return competency1;
      case 2:
        return competency2;
      case 3:
        return competency3;
      case 4:
        return competency4;
      case 5:
        return competency5;
      default:
        return 0;
    }
  };

  return (
    <RoleGuard allowedRoles={['TEACHER', 'SCHOOL']}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        {/* Header Superior */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <FontAwesome5 name="arrow-left" size={16} color="#1E293B" />
          </TouchableOpacity>

          <View style={{ flex: 1, marginLeft: 12 }}>
            <View style={styles.headerPillsRow}>
              <View style={styles.officeBadge}>
                <FontAwesome5 name="pen-fancy" size={10} color="#FFF" style={{ marginRight: 5 }} />
                <Text style={styles.officeBadgeText}>Oficina Nota 1000</Text>
              </View>
              {essay?.status === 'CORRECTED' && (
                <View style={styles.correctedBadge}>
                  <Text style={styles.correctedBadgeText}>Já Corrigida</Text>
                </View>
              )}
            </View>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {essay?.task?.title || essay?.task?.topic || 'Avaliação de Redação'}
            </Text>
            <Text style={styles.headerSub} numberOfLines={1}>
              Aluno: {essay?.student?.name || 'Carregando...'} • Turma: {essay?.task?.classroom?.name || 'Geral'}
            </Text>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0284C7" />
            <Text style={styles.loadingText}>Carregando folha de redação do aluno...</Text>
          </View>
        ) : isError || !essay ? (
          <View style={styles.errorContainer}>
            <FontAwesome5 name="exclamation-circle" size={36} color="#DC2626" />
            <Text style={styles.errorTitle}>Redação não encontrada</Text>
            <TouchableOpacity style={styles.errorBackBtn} onPress={() => router.back()}>
              <Text style={styles.errorBackText}>Voltar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* CORPO PRINCIPAL COM DUAS COLUNAS */
          <View style={[styles.mainLayout, isWideScreen ? styles.rowLayout : styles.columnLayout]}>
            {/* ======================================================== */}
            {/* COLUNA ESQUERDA: VISUALIZADOR COM ZOOM DA FOLHA          */}
            {/* ======================================================== */}
            <View style={[styles.leftColumn, isWideScreen && { flex: 1.15 }]}>
              {/* Barra de Controles de Zoom */}
              <View style={styles.viewerToolbar}>
                <View style={styles.viewerToolbarLeft}>
                  <FontAwesome5 name="image" size={13} color="#0284C7" style={{ marginRight: 6 }} />
                  <Text style={styles.viewerToolbarTitle}>Folha de Redação Manuscrita</Text>
                </View>

                <View style={styles.zoomButtonsGroup}>
                  <TouchableOpacity
                    style={styles.zoomBtn}
                    onPress={() => setZoomScale((s) => Math.max(0.75, Number((s - 0.25).toFixed(2))))}
                    activeOpacity={0.7}
                  >
                    <FontAwesome5 name="search-minus" size={13} color="#334155" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.zoomResetBtn}
                    onPress={() => setZoomScale(1)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.zoomResetText}>{Math.round(zoomScale * 100)}%</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.zoomBtn}
                    onPress={() => setZoomScale((s) => Math.min(3.5, Number((s + 0.25).toFixed(2))))}
                    activeOpacity={0.7}
                  >
                    <FontAwesome5 name="search-plus" size={13} color="#334155" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Área do Visualizador da Imagem com Scroll */}
              <View style={styles.imageViewerContainer}>
                {fullImageUrl ? (
                  <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={styles.imageScrollContent}
                    maximumZoomScale={3.5}
                    minimumZoomScale={0.75}
                    showsHorizontalScrollIndicator
                    showsVerticalScrollIndicator
                    horizontal={isWideScreen}
                  >
                    <ScrollView
                      contentContainerStyle={styles.imageScrollContent}
                      showsVerticalScrollIndicator
                    >
                      <Image
                        source={{ uri: fullImageUrl }}
                        style={[
                          styles.essayImage,
                          {
                            transform: [{ scale: zoomScale }],
                          },
                        ]}
                        resizeMode="contain"
                      />
                    </ScrollView>
                  </ScrollView>
                ) : (
                  <View style={styles.noImagePlaceholder}>
                    <FontAwesome5 name="file-image" size={40} color="#94A3B8" />
                    <Text style={styles.noImageText}>Imagem da redação indisponível</Text>
                  </View>
                )}
              </View>
            </View>

            {/* ======================================================== */}
            {/* COLUNA DIREITA: PAINEL DE NOTAS DAS 5 COMPETÊNCIAS       */}
            {/* ======================================================== */}
            <View style={[styles.rightColumn, isWideScreen && { flex: 1, maxWidth: 540 }]}>
              <ScrollView
                style={styles.gradingFormScroll}
                contentContainerStyle={styles.gradingFormContent}
                showsVerticalScrollIndicator={false}
              >
                {/* Banner de Somatório Total (0 a 1000) */}
                <View style={styles.scoreBanner}>
                  <View style={styles.scoreBannerTop}>
                    <View>
                      <Text style={styles.scoreBannerLabel}>NOTA TOTAL DA REDAÇÃO</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 2 }}>
                        <Text style={[styles.scoreBannerValue, { color: classification.color }]}>
                          {finalScore}
                        </Text>
                        <Text style={styles.scoreBannerMax}> / 1000 pontos</Text>
                      </View>
                    </View>

                    <View style={[styles.tierBadge, { backgroundColor: classification.bg }]}>
                      <Text style={[styles.tierBadgeText, { color: classification.color }]}>
                        {classification.label}
                      </Text>
                    </View>
                  </View>

                  {/* Barra de Progresso da Nota Total */}
                  <View style={styles.scoreProgressBarBg}>
                    <View
                      style={[
                        styles.scoreProgressBarFill,
                        {
                          width: `${(finalScore / 1000) * 100}%`,
                          backgroundColor: classification.color,
                        },
                      ]}
                    />
                  </View>
                </View>

                {/* Seletor de Notas das 5 Competências do ENEM */}
                <Text style={styles.competenciesHeading}>Avaliação por Competência (ENEM)</Text>
                <Text style={styles.competenciesSub}>
                  Atribua a pontuação em cada competência oficial (de 0 a 200 pontos):
                </Text>

                <View style={styles.competenciesSection}>
                  {ENEM_COMPETENCIES.map((comp) => {
                    const currentVal = getCompetencyValue(comp.index);

                    return (
                      <View key={comp.key} style={styles.compGradeCard}>
                        <View style={styles.compGradeHeader}>
                          <View style={styles.compBadge}>
                            <Text style={styles.compBadgeText}>{comp.name}</Text>
                          </View>
                          <Text style={styles.compCurrentScore}>
                            Nota: <Text style={{ color: '#0284C7', fontWeight: '900' }}>{currentVal}</Text> / 200
                          </Text>
                        </View>

                        <Text style={styles.compTitle}>{comp.title}</Text>
                        <Text style={styles.compDesc}>{comp.description}</Text>

                        {/* Botões seletores de notas (0, 40, 80, 120, 160, 200) */}
                        <View style={styles.scoreChipsRow}>
                          {CompetencyLevelValues.map((scoreVal) => {
                            const isSelected = currentVal === scoreVal;
                            return (
                              <TouchableOpacity
                                key={scoreVal}
                                style={[
                                  styles.scoreChip,
                                  isSelected && styles.scoreChipSelected,
                                ]}
                                onPress={() => setCompetencyValue(comp.index, scoreVal)}
                                activeOpacity={0.7}
                              >
                                <Text
                                  style={[
                                    styles.scoreChipText,
                                    isSelected && styles.scoreChipTextSelected,
                                  ]}
                                >
                                  {scoreVal}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    );
                  })}
                </View>

                {/* Campo de Comentários Gerais (generalFeedback) */}
                <View style={styles.feedbackSection}>
                  <View style={styles.feedbackLabelRow}>
                    <FontAwesome5 name="comment-alt" size={13} color="#0284C7" style={{ marginRight: 6 }} />
                    <Text style={styles.feedbackLabel}>
                      Comentários Pedagógicos e Feedback (generalFeedback)
                    </Text>
                  </View>
                  <Text style={styles.feedbackHint}>
                    Explique os acertos, falhas gramaticais, repertório sociocultural e como o aluno pode aprimorar a proposta de intervenção.
                  </Text>
                  <TextInput
                    style={styles.feedbackInput}
                    multiline
                    numberOfLines={4}
                    placeholder="Ex: Excelente argumentação e repertório histórico. Atenção à concordância na linha 14 e detalhe melhor os agentes na proposta de intervenção..."
                    placeholderTextColor="#94A3B8"
                    value={generalFeedback}
                    onChangeText={setGeneralFeedback}
                    textAlignVertical="top"
                  />
                </View>

                {/* Botão de Salvar Correção */}
                <TouchableOpacity
                  style={[
                    styles.submitGradeBtn,
                    gradeMutation.isPending && { opacity: 0.7 },
                  ]}
                  onPress={() => gradeMutation.mutate()}
                  disabled={gradeMutation.isPending}
                  activeOpacity={0.85}
                >
                  {gradeMutation.isPending ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <FontAwesome5 name="check-circle" size={15} color="#FFF" style={{ marginRight: 8 }} />
                      <Text style={styles.submitGradeBtnText}>
                        Salvar e Enviar Correção ({finalScore}/1000)
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        )}
      </SafeAreaView>
    </RoleGuard>
  );
}

const baseStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  officeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8E44AD',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  officeBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
  },
  correctedBadge: {
    backgroundColor: '#065F46',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  correctedBadgeText: {
    color: '#34D399',
    fontSize: 10,
    fontWeight: '700',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  headerSub: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
  },
  loadingText: {
    marginTop: 12,
    color: '#94A3B8',
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  errorTitle: {
    fontSize: 16,
    color: '#EF4444',
    fontWeight: '700',
    marginTop: 12,
  },
  errorBackBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#334155',
    borderRadius: 8,
  },
  errorBackText: {
    color: '#FFF',
    fontWeight: '600',
  },
  mainLayout: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  rowLayout: {
    flexDirection: 'row',
  },
  columnLayout: {
    flexDirection: 'column',
  },
  /* COLUNA ESQUERDA */
  leftColumn: {
    backgroundColor: '#0B0F19',
    borderRightWidth: 1,
    borderRightColor: '#1E293B',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 400,
  },
  viewerToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  viewerToolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewerToolbarTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F1F5F9',
  },
  zoomButtonsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  zoomBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomResetBtn: {
    paddingHorizontal: 8,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomResetText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '800',
  },
  imageViewerContainer: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  essayImage: {
    width: 600,
    height: 850,
    maxWidth: '100%',
  },
  noImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  noImageText: {
    color: '#94A3B8',
    marginTop: 10,
    fontSize: 13,
  },
  /* COLUNA DIREITA */
  rightColumn: {
    backgroundColor: '#F8FAFC',
  },
  gradingFormScroll: {
    flex: 1,
  },
  gradingFormContent: {
    padding: 20,
    paddingBottom: 40,
  },
  scoreBanner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  scoreBannerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  scoreBannerLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  scoreBannerValue: {
    fontSize: 36,
    fontWeight: '900',
  },
  scoreBannerMax: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94A3B8',
  },
  tierBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    maxWidth: 220,
  },
  tierBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  scoreProgressBarBg: {
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  scoreProgressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  competenciesHeading: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  competenciesSub: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 16,
  },
  competenciesSection: {
    gap: 14,
    marginBottom: 20,
  },
  compGradeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  compGradeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  compBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  compBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0369A1',
  },
  compCurrentScore: {
    fontSize: 12,
    color: '#475569',
  },
  compTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 3,
  },
  compDesc: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 10,
    lineHeight: 15,
  },
  scoreChipsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  scoreChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreChipSelected: {
    borderColor: '#0284C7',
    backgroundColor: '#0284C7',
  },
  scoreChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  scoreChipTextSelected: {
    color: '#FFFFFF',
  },
  feedbackSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
  },
  feedbackLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  feedbackLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  feedbackHint: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 10,
    lineHeight: 15,
  },
  feedbackInput: {
    minHeight: 100,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    color: '#1E293B',
    lineHeight: 18,
  },
  submitGradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16A34A',
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitGradeBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
