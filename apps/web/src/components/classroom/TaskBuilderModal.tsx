import { useThemedStyles } from '@/hooks/use-theme';
import React from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { AppPalette } from '@/constants/theme';

export type TaskCreationTab = 'BANCO' | 'ASSUNTO' | 'AUTORAL' | 'REDACAO';

export interface BankQuestionOption {
  id: string;
  year?: number;
  subject?: string;
  topic?: string;
  text: string;
  options: string[];
  difficulty?: string;
  errorRate?: number;
  subjectRef?: { name: string; icon?: string };
}

interface TaskBuilderModalProps {
  visible: boolean;
  onClose: () => void;
  classrooms: any[];
  selectedClassId: string;
  onSelectClassId: (id: string) => void;
  taskTitle: string;
  onChangeTaskTitle: (title: string) => void;
  taskDueDateDays: number;
  onChangeTaskDueDateDays: (days: number) => void;
  creationModeTab: TaskCreationTab;
  onChangeCreationModeTab: (tab: TaskCreationTab) => void;
  subjectsList: string[];

  // Aba 1: Banco ENEM
  bankSearchText: string;
  onChangeBankSearchText: (txt: string) => void;
  bankSubjectFilter: string;
  onChangeBankSubjectFilter: (subj: string) => void;
  bankQuestions: BankQuestionOption[];
  isLoadingBankQuestions: boolean;
  selectedQuestionIds: Set<string>;
  onToggleSelectQuestionId: (id: string) => void;

  // Aba 2: Por Assunto
  randomSubject: string;
  onChangeRandomSubject: (subj: string) => void;
  randomTopic: string;
  onChangeRandomTopic: (topic: string) => void;
  randomQuantity: number;
  onChangeRandomQuantity: (qty: number) => void;
  randomDifficulty: 'EASY' | 'MEDIUM' | 'HARD' | 'MISTO';
  onChangeRandomDifficulty: (diff: 'EASY' | 'MEDIUM' | 'HARD' | 'MISTO') => void;

  // Aba 3: Questão Autoral
  authorTopic: string;
  onChangeAuthorTopic: (topic: string) => void;
  authorQuestionText: string;
  onChangeAuthorQuestionText: (txt: string) => void;
  authorOptions: string[];
  onChangeAuthorOptions: (opts: string[]) => void;
  authorCorrectIndex: number;
  onChangeAuthorCorrectIndex: (idx: number) => void;
  authorExplanation: string;
  onChangeAuthorExplanation: (txt: string) => void;

  // Aba 4: Redação
  essayTheme: string;
  onChangeEssayTheme: (theme: string) => void;

  // Submissão
  isSubmitting: boolean;
  onSubmit: () => void;
}

export function TaskBuilderModal({
  visible,
  onClose,
  classrooms,
  selectedClassId,
  onSelectClassId,
  taskTitle,
  onChangeTaskTitle,
  taskDueDateDays,
  onChangeTaskDueDateDays,
  creationModeTab,
  onChangeCreationModeTab,
  subjectsList,
  bankSearchText,
  onChangeBankSearchText,
  bankSubjectFilter,
  onChangeBankSubjectFilter,
  bankQuestions,
  isLoadingBankQuestions,
  selectedQuestionIds,
  onToggleSelectQuestionId,
  randomSubject,
  onChangeRandomSubject,
  randomTopic,
  onChangeRandomTopic,
  randomQuantity,
  onChangeRandomQuantity,
  randomDifficulty,
  onChangeRandomDifficulty,
  authorTopic,
  onChangeAuthorTopic,
  authorQuestionText,
  onChangeAuthorQuestionText,
  authorOptions,
  onChangeAuthorOptions,
  authorCorrectIndex,
  onChangeAuthorCorrectIndex,
  authorExplanation,
  onChangeAuthorExplanation,
  essayTheme,
  onChangeEssayTheme,
  isSubmitting,
  onSubmit,
}: TaskBuilderModalProps) {
  const styles = useThemedStyles(baseStyles);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}
      >
        <View style={styles.modalCard}>
          {/* Header do Construtor */}
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderTitleRow}>
              <View style={styles.modalIconBox}>
                <FontAwesome5 name="tasks" size={16} color="#FFF" />
              </View>
              <View>
                <Text style={styles.modalTitle}>Construtor de Tarefas</Text>
                <Text style={styles.modalSub}>
                  Crie listas sob medida para sua turma em 4 modos flexíveis.
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={onClose}>
              <FontAwesome5
                name="times"
                size={14}
                color={AppPalette.textMuted}
              />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.modalScroll}
          >
            {/* SELEÇÃO DA TURMA */}
            {classrooms.length > 0 && (
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Turma de Destino *</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.horizontalPillRow}
                >
                  {classrooms.map((c) => {
                    const isSelected = selectedClassId === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[
                          styles.selectorPill,
                          isSelected && styles.selectorPillActive,
                        ]}
                        onPress={() => onSelectClassId(c.id)}
                      >
                        <FontAwesome5
                          name={c.icon || 'chalkboard'}
                          size={11}
                          color={isSelected ? '#FFF' : AppPalette.textMuted}
                        />
                        <Text
                          style={[
                            styles.selectorPillText,
                            isSelected && styles.selectorPillTextActive,
                          ]}
                        >
                          {c.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* TÍTULO DA LISTA */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>
                Título da Lista de Exercícios *
              </Text>
              <TextInput
                style={styles.inputField}
                placeholder="Ex: Lista Semanal de Física - Leis de Newton e Forças"
                placeholderTextColor={AppPalette.textSubtle}
                value={taskTitle}
                onChangeText={onChangeTaskTitle}
              />
            </View>

            {/* PRAZO DE ENTREGA */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>
                Prazo para Entrega dos Alunos
              </Text>
              <View style={styles.dueDatePillRow}>
                {[3, 5, 7, 14].map((days) => {
                  const isSelected = taskDueDateDays === days;
                  return (
                    <TouchableOpacity
                      key={days}
                      style={[
                        styles.duePill,
                        isSelected && styles.duePillActive,
                      ]}
                      onPress={() => onChangeTaskDueDateDays(days)}
                    >
                      <Text
                        style={[
                          styles.duePillText,
                          isSelected && styles.duePillTextActive,
                        ]}
                      >
                        {days} dias
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* AS 4 ABAS DO CONSTRUTOR */}
            <View style={styles.builderTabsContainer}>
              <TouchableOpacity
                style={[
                  styles.builderTabBtn,
                  creationModeTab === 'BANCO' && styles.builderTabBtnActive,
                ]}
                onPress={() => onChangeCreationModeTab('BANCO')}
              >
                <FontAwesome5
                  name="database"
                  size={11}
                  color={
                    creationModeTab === 'BANCO'
                      ? AppPalette.primary
                      : AppPalette.textMuted
                  }
                />
                <Text
                  style={[
                    styles.builderTabText,
                    creationModeTab === 'BANCO' && styles.builderTabTextActive,
                  ]}
                >
                  Banco ENEM
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.builderTabBtn,
                  creationModeTab === 'ASSUNTO' && styles.builderTabBtnActive,
                ]}
                onPress={() => onChangeCreationModeTab('ASSUNTO')}
              >
                <FontAwesome5
                  name="random"
                  size={11}
                  color={
                    creationModeTab === 'ASSUNTO'
                      ? AppPalette.primary
                      : AppPalette.textMuted
                  }
                />
                <Text
                  style={[
                    styles.builderTabText,
                    creationModeTab === 'ASSUNTO' &&
                      styles.builderTabTextActive,
                  ]}
                >
                  Por Assunto
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.builderTabBtn,
                  creationModeTab === 'AUTORAL' && styles.builderTabBtnActive,
                ]}
                onPress={() => onChangeCreationModeTab('AUTORAL')}
              >
                <FontAwesome5
                  name="edit"
                  size={11}
                  color={
                    creationModeTab === 'AUTORAL'
                      ? AppPalette.primary
                      : AppPalette.textMuted
                  }
                />
                <Text
                  style={[
                    styles.builderTabText,
                    creationModeTab === 'AUTORAL' &&
                      styles.builderTabTextActive,
                  ]}
                >
                  Autoral
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.builderTabBtn,
                  creationModeTab === 'REDACAO' && styles.builderTabBtnActive,
                ]}
                onPress={() => onChangeCreationModeTab('REDACAO')}
              >
                <FontAwesome5
                  name="pen-fancy"
                  size={11}
                  color={
                    creationModeTab === 'REDACAO'
                      ? AppPalette.purple
                      : AppPalette.textMuted
                  }
                />
                <Text
                  style={[
                    styles.builderTabText,
                    creationModeTab === 'REDACAO' && {
                      color: AppPalette.purple,
                      fontWeight: '800',
                    },
                  ]}
                >
                  Redação
                </Text>
              </TouchableOpacity>
            </View>

            {/* ABA 1: BUSCAR NO BANCO DO ENEM */}
            {creationModeTab === 'BANCO' && (
              <View style={styles.tabContentCard}>
                <View style={styles.searchBarBox}>
                  <FontAwesome5
                    name="search"
                    size={13}
                    color={AppPalette.textSubtle}
                  />
                  <TextInput
                    style={styles.searchBarInput}
                    placeholder="Buscar por palavra-chave no enunciado ou ano..."
                    placeholderTextColor={AppPalette.textSubtle}
                    value={bankSearchText}
                    onChangeText={onChangeBankSearchText}
                  />
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.horizontalPillRow}
                >
                  {['TODAS', ...subjectsList].map((s) => {
                    const isSelected = bankSubjectFilter === s;
                    return (
                      <TouchableOpacity
                        key={s}
                        style={[
                          styles.smallFilterChip,
                          isSelected && styles.smallFilterChipActive,
                        ]}
                        onPress={() => onChangeBankSubjectFilter(s)}
                      >
                        <Text
                          style={[
                            styles.smallFilterChipText,
                            isSelected && styles.smallFilterChipTextActive,
                          ]}
                        >
                          {s}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <View style={styles.questionsSelectionHeader}>
                  <Text style={styles.questionsCountLabel}>
                    Questões encontradas: {bankQuestions.length}
                  </Text>
                  <View style={styles.selectedCountBadge}>
                    <FontAwesome5
                      name="check"
                      size={10}
                      color={AppPalette.success}
                    />
                    <Text style={styles.selectedCountBadgeText}>
                      {selectedQuestionIds.size} selecionadas
                    </Text>
                  </View>
                </View>

                {isLoadingBankQuestions ? (
                  <View style={{ padding: 24, alignItems: 'center' }}>
                    <ActivityIndicator
                      size="small"
                      color={AppPalette.primary}
                    />
                    <Text style={styles.loadingHint}>
                      Filtrando banco de questões do ENEM...
                    </Text>
                  </View>
                ) : bankQuestions.length === 0 ? (
                  <Text style={styles.emptyQuestionsHint}>
                    Nenhuma questão encontrada para os filtros aplicados.
                  </Text>
                ) : (
                  <View style={styles.questionsList}>
                    {bankQuestions.map((q) => {
                      const isChecked = selectedQuestionIds.has(q.id);
                      return (
                        <TouchableOpacity
                          key={q.id}
                          style={[
                            styles.questionSelectCard,
                            isChecked && styles.questionSelectCardChecked,
                          ]}
                          activeOpacity={0.8}
                          onPress={() => onToggleSelectQuestionId(q.id)}
                        >
                          <View style={styles.questionCardTopRow}>
                            <View
                              style={[
                                styles.checkboxBox,
                                isChecked && styles.checkboxBoxChecked,
                              ]}
                            >
                              {isChecked && (
                                <FontAwesome5
                                  name="check"
                                  size={10}
                                  color="#FFF"
                                />
                              )}
                            </View>
                            <View style={styles.questionMetaTags}>
                              {q.year && (
                                <Text style={styles.questionMetaTagText}>
                                  ENEM {q.year}
                                </Text>
                              )}
                              <Text style={styles.questionMetaTagText}>
                                {q.subject || q.subjectRef?.name || 'Geral'}
                              </Text>
                            </View>
                          </View>

                          <Text
                            style={styles.questionSnippet}
                            numberOfLines={3}
                          >
                            {String(q.text || '').replace(/!\[.*?\]\(.*?\)/g, '[Imagem]')}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            )}

            {/* ABA 2: GERAR LISTA POR ASSUNTO */}
            {creationModeTab === 'ASSUNTO' && (
              <View style={styles.tabContentCard}>
                <Text style={styles.modeInstructions}>
                  O sistema sorteará questões reais do ENEM com base no assunto
                  e nível escolhidos.
                </Text>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Disciplina *</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.horizontalPillRow}
                  >
                    {subjectsList.map((s) => {
                      const isSelected = randomSubject === s;
                      return (
                        <TouchableOpacity
                          key={s}
                          style={[
                            styles.selectorPill,
                            isSelected && styles.selectorPillActive,
                          ]}
                          onPress={() => onChangeRandomSubject(s)}
                        >
                          <Text
                            style={[
                              styles.selectorPillText,
                              isSelected && styles.selectorPillTextActive,
                            ]}
                          >
                            {s}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>
                    Assunto / Conteúdo Específico *
                  </Text>
                  <TextInput
                    style={styles.inputField}
                    placeholder="Ex: Ecologia, Leis de Newton, Geometria Espacial..."
                    placeholderTextColor={AppPalette.textSubtle}
                    value={randomTopic}
                    onChangeText={onChangeRandomTopic}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Quantidade de Questões</Text>
                  <View style={styles.dueDatePillRow}>
                    {[5, 10, 15, 20].map((num) => {
                      const isSelected = randomQuantity === num;
                      return (
                        <TouchableOpacity
                          key={num}
                          style={[
                            styles.duePill,
                            isSelected && styles.duePillActive,
                          ]}
                          onPress={() => onChangeRandomQuantity(num)}
                        >
                          <Text
                            style={[
                              styles.duePillText,
                              isSelected && styles.duePillTextActive,
                            ]}
                          >
                            {num} questões
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Nível de Dificuldade</Text>
                  <View style={styles.dueDatePillRow}>
                    {(['MISTO', 'EASY', 'MEDIUM', 'HARD'] as const).map(
                      (lvl) => {
                        const isSelected = randomDifficulty === lvl;
                        const label =
                          lvl === 'MISTO'
                            ? 'Misto'
                            : lvl === 'EASY'
                            ? 'Fácil'
                            : lvl === 'MEDIUM'
                            ? 'Médio'
                            : 'Difícil';
                        return (
                          <TouchableOpacity
                            key={lvl}
                            style={[
                              styles.duePill,
                              isSelected && styles.duePillActive,
                            ]}
                            onPress={() => onChangeRandomDifficulty(lvl)}
                          >
                            <Text
                              style={[
                                styles.duePillText,
                                isSelected && styles.duePillTextActive,
                              ]}
                            >
                              {label}
                            </Text>
                          </TouchableOpacity>
                        );
                      }
                    )}
                  </View>
                </View>
              </View>
            )}

            {/* ABA 3: CRIAR QUESTÃO AUTORAL */}
            {creationModeTab === 'AUTORAL' && (
              <View style={styles.tabContentCard}>
                <Text style={styles.modeInstructions}>
                  Cadastre uma questão inédita da sua autoria com 5 alternativas
                  e gabarito.
                </Text>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Matéria e Assunto</Text>
                  <TextInput
                    style={styles.inputField}
                    placeholder="Ex: Física - Trabalho e Energia"
                    placeholderTextColor={AppPalette.textSubtle}
                    value={authorTopic}
                    onChangeText={onChangeAuthorTopic}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Enunciado da Questão *</Text>
                  <TextInput
                    style={[styles.inputField, styles.textArea]}
                    placeholder="Escreva aqui o enunciado completo da questão autoral..."
                    placeholderTextColor={AppPalette.textSubtle}
                    value={authorQuestionText}
                    onChangeText={onChangeAuthorQuestionText}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
                </View>

                <Text style={styles.formLabel}>
                  Alternativas (Marque a Correta) *
                </Text>
                {authorOptions.map((opt, idx) => {
                  const letter = ['A', 'B', 'C', 'D', 'E'][idx];
                  const isCorrect = authorCorrectIndex === idx;

                  return (
                    <View key={idx} style={styles.optionInputRow}>
                      <TouchableOpacity
                        style={[
                          styles.radioOptionLetter,
                          isCorrect && styles.radioOptionLetterCorrect,
                        ]}
                        onPress={() => onChangeAuthorCorrectIndex(idx)}
                      >
                        <Text
                          style={[
                            styles.radioOptionLetterText,
                            isCorrect && styles.radioOptionLetterTextCorrect,
                          ]}
                        >
                          {letter}
                        </Text>
                      </TouchableOpacity>

                      <TextInput
                        style={[
                          styles.optionInputField,
                          isCorrect && styles.optionInputFieldCorrect,
                        ]}
                        placeholder={`Texto da alternativa ${letter}...`}
                        placeholderTextColor={AppPalette.textSubtle}
                        value={opt}
                        onChangeText={(txt) => {
                          const copy = [...authorOptions];
                          copy[idx] = txt;
                          onChangeAuthorOptions(copy);
                        }}
                      />
                    </View>
                  );
                })}

                <View style={[styles.formGroup, { marginTop: 10 }]}>
                  <Text style={styles.formLabel}>
                    Comentário / Resolução Explicada
                  </Text>
                  <TextInput
                    style={[styles.inputField, { minHeight: 60 }]}
                    placeholder="Explicação pedagógica mostrada aos alunos ao responderem..."
                    placeholderTextColor={AppPalette.textSubtle}
                    value={authorExplanation}
                    onChangeText={onChangeAuthorExplanation}
                    multiline
                    numberOfLines={2}
                    textAlignVertical="top"
                  />
                </View>
              </View>
            )}

            {/* ABA 4: PROPOSTA DE REDAÇÃO (OFICINA NOTA 1000) */}
            {creationModeTab === 'REDACAO' && (
              <View style={styles.tabContentCard}>
                <Text style={styles.essayHeaderTitle}>
                  Oficina Nota 1000 — Proposta de Redação
                </Text>
                <Text style={styles.essayHeaderSub}>
                  Os alunos enviarão a foto da folha manuscrita para você
                  corrigir nas 5 competências do ENEM.
                </Text>

                <View style={{ marginTop: 12 }}>
                  <Text style={styles.formLabel}>
                    Tema / Recorte Temático da Redação
                  </Text>
                  <TextInput
                    style={styles.inputField}
                    placeholder="Ex.: Desafios para a valorização da educação pública no Brasil"
                    placeholderTextColor={AppPalette.textSubtle}
                    value={essayTheme}
                    onChangeText={onChangeEssayTheme}
                  />
                </View>
              </View>
            )}

            {/* BOTÕES FINAIS DE AÇÃO */}
            <View style={styles.modalBottomActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={onClose}
                disabled={isSubmitting}
              >
                <Text style={styles.modalCancelBtnText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalPublishBtn,
                  isSubmitting && { opacity: 0.7 },
                ]}
                activeOpacity={0.85}
                onPress={onSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <FontAwesome5 name="check" size={13} color="#FFF" />
                    <Text style={styles.modalPublishBtnText}>
                      {creationModeTab === 'BANCO'
                        ? `Publicar (${selectedQuestionIds.size} questões)`
                        : creationModeTab === 'REDACAO'
                        ? 'Publicar Proposta de Redação'
                        : 'Publicar Lista para a Turma'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const baseStyles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 14,
  },
  modalCard: {
    width: '100%',
    maxWidth: 720,
    maxHeight: '90%',
    backgroundColor: AppPalette.surface,
    borderRadius: 20,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: AppPalette.background,
    borderBottomWidth: 1,
    borderBottomColor: AppPalette.border,
  },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  modalIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: AppPalette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: AppPalette.textPrimary,
  },
  modalSub: {
    fontSize: 11,
    color: AppPalette.textMuted,
    marginTop: 1,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: AppPalette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScroll: { padding: 18, paddingBottom: 28 },
  formGroup: { marginBottom: 14 },
  formLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: AppPalette.textSecondary,
    marginBottom: 6,
  },
  inputField: {
    backgroundColor: AppPalette.background,
    borderWidth: 1,
    borderColor: AppPalette.borderStrong,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: AppPalette.textPrimary,
  },
  textArea: { minHeight: 84 },
  horizontalPillRow: { gap: 8, paddingVertical: 2 },
  selectorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: AppPalette.surfaceMuted,
    borderWidth: 1,
    borderColor: AppPalette.border,
  },
  selectorPillActive: {
    backgroundColor: AppPalette.primary,
    borderColor: AppPalette.primary,
  },
  selectorPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: AppPalette.textSecondary,
  },
  selectorPillTextActive: { color: '#FFF' },
  dueDatePillRow: { flexDirection: 'row', gap: 8 },
  duePill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: AppPalette.surfaceMuted,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: AppPalette.border,
  },
  duePillActive: {
    backgroundColor: AppPalette.primaryLight,
    borderColor: AppPalette.primary,
  },
  duePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: AppPalette.textMuted,
  },
  duePillTextActive: { color: AppPalette.primaryDark, fontWeight: '800' },
  builderTabsContainer: {
    flexDirection: 'row',
    backgroundColor: AppPalette.surfaceMuted,
    borderRadius: 12,
    padding: 4,
    marginBottom: 14,
  },
  builderTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: 9,
  },
  builderTabBtnActive: {
    backgroundColor: AppPalette.surface,
  },
  builderTabText: {
    fontSize: 11,
    fontWeight: '700',
    color: AppPalette.textMuted,
  },
  builderTabTextActive: {
    color: AppPalette.primary,
    fontWeight: '800',
  },
  tabContentCard: {
    backgroundColor: AppPalette.background,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: AppPalette.border,
    marginBottom: 16,
  },
  searchBarBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: AppPalette.surface,
    borderWidth: 1,
    borderColor: AppPalette.borderStrong,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    marginBottom: 10,
  },
  searchBarInput: {
    flex: 1,
    fontSize: 13,
    color: AppPalette.textPrimary,
  },
  smallFilterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: AppPalette.surface,
    borderWidth: 1,
    borderColor: AppPalette.border,
  },
  smallFilterChipActive: {
    backgroundColor: AppPalette.primary,
    borderColor: AppPalette.primary,
  },
  smallFilterChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: AppPalette.textMuted,
  },
  smallFilterChipTextActive: { color: '#FFF' },
  questionsSelectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 10,
  },
  questionsCountLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: AppPalette.textMuted,
  },
  selectedCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: AppPalette.successLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  selectedCountBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: AppPalette.success,
  },
  loadingHint: {
    fontSize: 12,
    color: AppPalette.textMuted,
    marginTop: 8,
  },
  emptyQuestionsHint: {
    fontSize: 12,
    color: AppPalette.textMuted,
    textAlign: 'center',
    paddingVertical: 20,
  },
  questionsList: { gap: 8, maxHeight: 260 },
  questionSelectCard: {
    backgroundColor: AppPalette.surface,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: AppPalette.border,
  },
  questionSelectCardChecked: {
    borderColor: AppPalette.primary,
    backgroundColor: AppPalette.primaryLight,
  },
  questionCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: AppPalette.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxChecked: {
    backgroundColor: AppPalette.primary,
    borderColor: AppPalette.primary,
  },
  questionMetaTags: { flexDirection: 'row', gap: 6 },
  questionMetaTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: AppPalette.textMuted,
  },
  questionSnippet: {
    fontSize: 12,
    color: AppPalette.textSecondary,
    lineHeight: 17,
  },
  modeInstructions: {
    fontSize: 12,
    color: AppPalette.textMuted,
    marginBottom: 12,
    lineHeight: 17,
  },
  optionInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  radioOptionLetter: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: AppPalette.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: AppPalette.borderStrong,
  },
  radioOptionLetterCorrect: {
    backgroundColor: AppPalette.success,
    borderColor: AppPalette.success,
  },
  radioOptionLetterText: {
    fontSize: 12,
    fontWeight: '800',
    color: AppPalette.textSecondary,
  },
  radioOptionLetterTextCorrect: { color: '#FFF' },
  optionInputField: {
    flex: 1,
    backgroundColor: AppPalette.surface,
    borderWidth: 1,
    borderColor: AppPalette.borderStrong,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    color: AppPalette.textPrimary,
  },
  optionInputFieldCorrect: {
    borderColor: AppPalette.success,
    backgroundColor: AppPalette.successLight,
  },
  essayHeaderTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: AppPalette.textPrimary,
  },
  essayHeaderSub: {
    fontSize: 12,
    color: AppPalette.textMuted,
    marginTop: 2,
  },
  modalBottomActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: AppPalette.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: AppPalette.textMuted,
  },
  modalPublishBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: AppPalette.success,
  },
  modalPublishBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFF',
  },
});
