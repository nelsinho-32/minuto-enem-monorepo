import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { BASE_URL } from '@/services/api';
import { useUserStore } from '@/store/useUserStore';
import {
  useChatStore,
  type SocraticMessage,
  type QuestionSearchResult,
} from '@/store/useChatStore';

const SOCRATIC_PROMPTS = [
  {
    label: '📐 Funções de 2º Grau',
    subject: 'Matemática',
    prompt: 'Me ajude a entender como encontrar o vértice de uma parábola sem decorar a fórmula pronta.',
  },
  {
    label: '⚡ Leis de Newton',
    subject: 'Física',
    prompt: 'Tenho dúvida sobre força normal e peso num plano inclinado. Como posso deduzir as componentes?',
  },
  {
    label: '🧬 Genética Mendeliana',
    subject: 'Biologia',
    prompt: 'Como diferenciar herança autossômica recessiva de ligada ao sexo em um heredograma do ENEM?',
  },
  {
    label: '✍️ Competência 5 Redação',
    subject: 'Redação',
    prompt: 'Quais são os 5 elementos obrigatórios da proposta de intervenção na redação do ENEM?',
  },
];

function TypingIndicator() {
  const dot1 = useSharedValue(0.3);
  const dot2 = useSharedValue(0.3);
  const dot3 = useSharedValue(0.3);

  useEffect(() => {
    dot1.value = withRepeat(
      withSequence(withTiming(1, { duration: 400 }), withTiming(0.3, { duration: 400 })),
      -1,
      true
    );
    dot2.value = withDelay(
      150,
      withRepeat(
        withSequence(withTiming(1, { duration: 400 }), withTiming(0.3, { duration: 400 })),
        -1,
        true
      )
    );
    dot3.value = withDelay(
      300,
      withRepeat(
        withSequence(withTiming(1, { duration: 400 }), withTiming(0.3, { duration: 400 })),
        -1,
        true
      )
    );
  }, [dot1, dot2, dot3]);

  const style1 = useAnimatedStyle(() => ({ opacity: dot1.value, transform: [{ scale: 0.85 + dot1.value * 0.25 }] }));
  const style2 = useAnimatedStyle(() => ({ opacity: dot2.value, transform: [{ scale: 0.85 + dot2.value * 0.25 }] }));
  const style3 = useAnimatedStyle(() => ({ opacity: dot3.value, transform: [{ scale: 0.85 + dot3.value * 0.25 }] }));

  return (
    <View style={styles.typingContainer}>
      <View style={styles.tutorAvatarSmall}>
        <FontAwesome5 name="brain" size={11} color="#FFF" />
      </View>
      <View style={styles.typingBubble}>
        <Text style={styles.typingLabel}>Tutor Socrático está pensando</Text>
        <View style={styles.dotsRow}>
          <Animated.View style={[styles.typingDot, style1]} />
          <Animated.View style={[styles.typingDot, style2]} />
          <Animated.View style={[styles.typingDot, style3]} />
        </View>
      </View>
    </View>
  );
}

function buildSocraticFallbackResponse(question: string, subject: string): string {
  return `Excelente questão sobre **${subject}**! Vamos construir o raciocínio juntos pelo **Método Socrático** em vez de ir direto ao gabarito:\n\n1. **Identificação do Conceito Central**: Quando você lê *"${question.slice(0, 60)}${question.length > 60 ? '...' : ''}"*, quais grandezas ou variáveis o enunciado já fornece explicitamente?\n2. **Modelagem / Fórmula**: Veja como podemos estruturar o algoritmo mental:\n\n\`\`\`python\n# Passo a passo para resolução no ENEM\ndef resolver_questao(dados_enunciado, comando_questao):\n    hipotese = relacionar_conceitos(dados_enunciado)\n    # Elimine distratores que extrapolam o texto base\n    return validar_unidade_de_medida(hipotese)\n\`\`\`\n\n> **Pergunta norteadora:** Se alterarmos a variável principal pela metade, o resultado final cresce ou diminui proporcionalmente? Tente me responder com suas palavras!`;
}

export default function SocraticTutorChatScreen() {
  const router = useRouter();
  const { user } = useUserStore();
  const flatListRef = useRef<FlatList<SocraticMessage>>(null);

  const {
    socraticMessages: messages,
    isTyping,
    activeSubject: selectedSubject,
    setActiveSubject: setSelectedSubject,
    sendSocraticMessage,
    searchQuestions,
    searchResults,
    isSearching,
    clearSocraticMessages,
  } = useChatStore();

  const [inputText, setInputText] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleSend = async (
    customPrompt?: string,
    customSubject?: string,
    questionId?: string
  ) => {
    const textToSend = (customPrompt ?? inputText).trim();
    if (!textToSend || isTyping) return;

    const activeSubject = customSubject ?? selectedSubject;
    if (customSubject) setSelectedSubject(customSubject);
    if (!customPrompt) setInputText('');

    await sendSocraticMessage(textToSend, activeSubject, questionId);
  };

  const handleSearchSubmit = async () => {
    if (!searchQuery.trim()) return;
    await searchQuestions(searchQuery, selectedSubject);
  };

  const handleSelectSearchedQuestion = (q: QuestionSearchResult) => {
    setIsSearchOpen(false);
    handleSend(
      `Me ajude a compreender esta questão do ENEM (${q.subject} - ${q.year}) pelo método socrático: "${q.text.slice(0, 160)}..."`,
      q.subject,
      q.id
    );
  };

  const markdownRules = {
    fence: (node: any) => {
      const language = node.sourceInfo || 'código';
      return (
        <View key={node.key} style={styles.codeBlockContainer}>
          <View style={styles.codeBlockHeader}>
            <View style={styles.codeWindowDots}>
              <View style={[styles.codeDot, { backgroundColor: '#FF5F56' }]} />
              <View style={[styles.codeDot, { backgroundColor: '#FFBD2E' }]} />
              <View style={[styles.codeDot, { backgroundColor: '#27C93F' }]} />
            </View>
            <Text style={styles.codeLanguageLabel}>{language.toUpperCase()}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Text style={styles.codeBlockContent}>
              {(node.content || '').replace(/\n$/, '')}
            </Text>
          </ScrollView>
        </View>
      );
    },
    code_block: (node: any) => (
      <View key={node.key} style={styles.codeBlockContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Text style={styles.codeBlockContent}>
            {(node.content || '').replace(/\n$/, '')}
          </Text>
        </ScrollView>
      </View>
    ),
  };

  const renderMessage = ({ item }: { item: SocraticMessage }) => {
    const isUser = item.role === 'user';

    if (!isUser && !item.content && item.isStreaming) {
      return null;
    }

    return (
      <View
        style={[
          styles.messageWrapper,
          isUser ? styles.messageWrapperUser : styles.messageWrapperAssistant,
        ]}
      >
        <View style={styles.messageHeaderRow}>
          <View
            style={[
              styles.avatarCircle,
              isUser ? styles.avatarUser : styles.avatarAssistant,
            ]}
          >
            <FontAwesome5
              name={isUser ? 'user-graduate' : 'brain'}
              size={12}
              color="#FFF"
            />
          </View>
          <Text style={styles.senderName}>
            {isUser ? user?.name || 'Você' : 'Tutor Socrático IA'}
          </Text>
          {item.subjectTag && (
            <View style={styles.subjectChip}>
              <Text style={styles.subjectChipText}>{item.subjectTag}</Text>
            </View>
          )}
          <Text style={styles.timestampText}>{item.timestamp}</Text>
        </View>

        <View
          style={[
            styles.messageBubble,
            isUser ? styles.userBubble : styles.assistantBubble,
          ]}
        >
          {isUser ? (
            <Text style={styles.userMessageText}>{item.content}</Text>
          ) : (
            <Markdown style={markdownStyles as any} rules={markdownRules}>
              {item.content}
            </Markdown>
          )}

          {item.isStreaming && (
            <View style={styles.streamingBadge}>
              <FontAwesome5 name="bolt" size={10} color="#1CB0F6" />
              <Text style={styles.streamingBadgeText}>Gerando raciocínio em tempo real...</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <FontAwesome5 name="arrow-left" size={18} color="#2C3A47" />
        </TouchableOpacity>
        <View style={styles.headerTitleBox}>
          <View style={styles.headerTitleRow}>
            <FontAwesome5 name="brain" size={15} color="#8E44AD" />
            <Text style={styles.headerTitle}>Tutor Socrático IA</Text>
          </View>
          <Text style={styles.headerSubtitle}>
            RAG Pedagógico • Base de Erros • Tutoria Ativa
          </Text>
        </View>
        <TouchableOpacity
          style={styles.searchToggleBtn}
          onPress={() => setIsSearchOpen((prev) => !prev)}
        >
          <FontAwesome5
            name={isSearchOpen ? 'times' : 'search'}
            size={16}
            color={isSearchOpen ? '#FF4B4B' : '#8E44AD'}
          />
        </TouchableOpacity>
      </View>

      {/* PAINEL DE BUSCA SEMÂNTICA DE QUESTÕES DO ENEM */}
      {isSearchOpen && (
        <View style={styles.searchPanel}>
          <View style={styles.searchBarRow}>
            <TextInput
              style={styles.searchBarInput}
              placeholder="Buscar questão do ENEM (ex: dilatação, genética)..."
              placeholderTextColor="#8CA0B3"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearchSubmit}
              returnKeyType="search"
            />
            <TouchableOpacity
              style={styles.searchSubmitBtn}
              onPress={handleSearchSubmit}
              disabled={isSearching}
            >
              <FontAwesome5
                name={isSearching ? 'spinner' : 'search'}
                size={14}
                color="#FFF"
              />
            </TouchableOpacity>
          </View>

          {searchResults.length > 0 && (
            <ScrollView style={styles.searchResultsList} nestedScrollEnabled>
              {searchResults.slice(0, 4).map((q) => (
                <TouchableOpacity
                  key={q.id}
                  style={styles.searchResultItem}
                  onPress={() => handleSelectSearchedQuestion(q)}
                >
                  <View style={styles.searchResultHeader}>
                    <Text style={styles.searchResultSubject}>
                      {q.subject} ({q.year})
                    </Text>
                    {q.errorRate !== undefined && (
                      <Text style={styles.searchResultErrorRate}>
                        Taxa de Erro: {Math.round(q.errorRate * 100)}%
                      </Text>
                    )}
                  </View>
                  <Text style={styles.searchResultSnippet} numberOfLines={2}>
                    {q.text}
                  </Text>
                  <Text style={styles.searchResultAction}>
                    💡 Pedir ajuda ao Tutor com esta questão →
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* SUGESTÕES RÁPIDAS DE ESTUDO */}
      <View style={styles.promptsBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.promptsScroll}
        >
          {SOCRATIC_PROMPTS.map((item, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.promptChip}
              activeOpacity={0.8}
              onPress={() => handleSend(item.prompt, item.subject)}
              disabled={isTyping}
            >
              <Text style={styles.promptChipText}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* LISTA DE MENSAGENS */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: true })
        }
        ListFooterComponent={isTyping ? <TypingIndicator /> : undefined}
      />

      {/* BARRA DE ENTRADA */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.inputContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.subjectSelectorRow}
          >
            {['Matemática', 'Física', 'Química', 'Biologia', 'Humanas', 'Redação'].map(
              (subj) => {
                const active = selectedSubject === subj;
                return (
                  <TouchableOpacity
                    key={subj}
                    style={[
                      styles.subjectOption,
                      active && styles.subjectOptionActive,
                    ]}
                    onPress={() => setSelectedSubject(subj)}
                  >
                    <Text
                      style={[
                        styles.subjectOptionText,
                        active && styles.subjectOptionTextActive,
                      ]}
                    >
                      {subj}
                    </Text>
                  </TouchableOpacity>
                );
              }
            )}
          </ScrollView>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              placeholder={`Qual sua dúvida de ${selectedSubject}?`}
              placeholderTextColor="#94A3B8"
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={800}
              editable={!isTyping}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                (!inputText.trim() || isTyping) && styles.sendButtonDisabled,
              ]}
              onPress={() => handleSend()}
              disabled={!inputText.trim() || isTyping}
              activeOpacity={0.8}
            >
              <FontAwesome5 name="paper-plane" size={16} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const markdownStyles = StyleSheet.create({
  body: {
    fontSize: 14,
    color: '#1E293B',
    lineHeight: 22,
  },
  heading1: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0F172A',
    marginVertical: 6,
  },
  heading2: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
    marginVertical: 6,
  },
  strong: {
    fontWeight: 'bold',
    color: '#0F172A',
  },
  blockquote: {
    backgroundColor: '#F3E8FF',
    borderLeftWidth: 4,
    borderLeftColor: '#8E44AD',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginVertical: 8,
  },
  code_inline: {
    backgroundColor: '#F1F5F9',
    color: '#7C3AED',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
  },
  bullet_list: {
    marginVertical: 4,
  },
  ordered_list: {
    marginVertical: 4,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  backButton: { width: 36, height: 36, justifyContent: 'center' },
  headerTitleBox: { alignItems: 'center', flex: 1 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: '#1E293B' },
  headerSubtitle: { fontSize: 11, color: '#64748B', marginTop: 2 },
  onlineDotBox: { width: 36, alignItems: 'flex-end', justifyContent: 'center' },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#58CC02',
  },
  searchToggleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3E8FF',
    justifyContent: 'center',
    alignItems: 'center',
  },

  searchPanel: {
    backgroundColor: '#FFF',
    padding: 12,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchBarRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  searchBarInput: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#1E293B',
  },
  searchSubmitBtn: {
    backgroundColor: '#8E44AD',
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchResultsList: {
    maxHeight: 180,
    marginTop: 10,
  },
  searchResultItem: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  searchResultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  searchResultSubject: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#7E22CE',
  },
  searchResultErrorRate: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '600',
  },
  searchResultSnippet: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 16,
  },
  searchResultAction: {
    fontSize: 11,
    color: '#2563EB',
    fontWeight: 'bold',
    marginTop: 6,
  },

  promptsBar: {
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingVertical: 10,
  },
  promptsScroll: { paddingHorizontal: 16, gap: 8 },
  promptChip: {
    backgroundColor: '#F3E8FF',
    borderWidth: 1,
    borderColor: '#E9D5FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  promptChipText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#7E22CE',
  },

  listContent: { padding: 16, gap: 16, paddingBottom: 28 },
  messageWrapper: { width: '100%' },
  messageWrapperUser: { alignItems: 'flex-end' },
  messageWrapperAssistant: { alignItems: 'flex-start' },

  messageHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  avatarCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarUser: { backgroundColor: '#1CB0F6' },
  avatarAssistant: { backgroundColor: '#8E44AD' },
  senderName: { fontSize: 12, fontWeight: 'bold', color: '#334155' },
  subjectChip: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  subjectChipText: { fontSize: 10, fontWeight: 'bold', color: '#475569' },
  timestampText: { fontSize: 10, color: '#94A3B8' },

  messageBubble: {
    maxWidth: '94%',
    borderRadius: 18,
    padding: 14,
  },
  userBubble: {
    backgroundColor: '#1CB0F6',
    borderTopRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  userMessageText: {
    fontSize: 14,
    color: '#FFF',
    lineHeight: 20,
    fontWeight: '500',
  },

  codeBlockContainer: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    marginVertical: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  codeBlockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  codeWindowDots: { flexDirection: 'row', gap: 6 },
  codeDot: { width: 8, height: 8, borderRadius: 4 },
  codeLanguageLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#94A3B8',
  },
  codeBlockContent: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    color: '#E2E8F0',
    padding: 12,
    lineHeight: 18,
  },

  streamingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  streamingBadgeText: {
    fontSize: 11,
    color: '#1CB0F6',
    fontWeight: 'bold',
  },

  typingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  tutorAvatarSmall: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#8E44AD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F3E8FF',
    borderWidth: 1,
    borderColor: '#E9D5FF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  typingLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#6B21A8',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#8E44AD',
  },

  inputContainer: {
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 16 : 12,
  },
  subjectSelectorRow: {
    gap: 6,
    paddingBottom: 8,
  },
  subjectOption: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  subjectOptionActive: {
    backgroundColor: '#8E44AD',
  },
  subjectOptionText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#64748B',
  },
  subjectOptionTextActive: {
    color: '#FFF',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1E293B',
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#8E44AD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#CBD5E1',
  },
});
