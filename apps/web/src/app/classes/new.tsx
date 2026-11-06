import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { useUserStore } from '@/store/useUserStore';
import { useClassroomStore } from '@/store/useClassroomStore';
import { ConfirmModal } from '@/components/ConfirmModal';

const SUBJECT_OPTIONS = [
  { label: 'Matemática', color: '#1CB0F6', icon: 'calculator' },
  { label: 'Física', color: '#58CC02', icon: 'atom' },
  { label: 'Química', color: '#58CC02', icon: 'flask' },
  { label: 'Biologia', color: '#58CC02', icon: 'leaf' },
  { label: 'História', color: '#FF9600', icon: 'landmark' },
  { label: 'Geografia', color: '#FF9600', icon: 'map' },
  { label: 'Filosofia', color: '#FF9600', icon: 'brain' },
  { label: 'Sociologia', color: '#FF9600', icon: 'users' },
  { label: 'Português', color: '#FF4B4B', icon: 'book-open' },
  { label: 'Literatura', color: '#FF4B4B', icon: 'book' },
  { label: 'Redação', color: '#FF4B4B', icon: 'pen-nib' },
  { label: 'Geral / Todas', color: '#CE82FF', icon: 'graduation-cap' },
];

const THEME_COLORS = [
  '#1CB0F6', // Azul claro
  '#58CC02', // Verde
  '#FF9600', // Laranja
  '#FF4B4B', // Vermelho
  '#CE82FF', // Roxo
  '#2C3A47', // Azul escuro
];

function generateRoomCode(subject: string): string {
  const prefix = subject.slice(0, 3).toUpperCase().replace(/[^A-Z]/g, 'TUR');
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${randomNum}`;
}

export default function CreateClassroomScreen() {
  const router = useRouter();
  const user = useUserStore((state) => state.user);
  const addClassroom = useClassroomStore((state) => state.addClassroom);

  const [name, setName] = useState('');
  const [selectedSubject, setSelectedSubject] = useState(SUBJECT_OPTIONS[0]);
  const [description, setDescription] = useState('');
  const [school, setSchool] = useState('');
  const [themeColor, setThemeColor] = useState(SUBJECT_OPTIONS[0].color);
  const [customCode, setCustomCode] = useState(() => generateRoomCode(SUBJECT_OPTIONS[0].label));

  // Estados de erro
  const [nameError, setNameError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);

  // Estado para pop-confirm de cancelamento
  const [showCancelModal, setShowCancelModal] = useState(false);

  // Estado de sucesso pós-criação
  const [createdRoom, setCreatedRoom] = useState<any | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Verificação de permissão: apenas professores podem criar salas
  if (user && user.role !== 'TEACHER') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <FontAwesome5 name="arrow-left" size={18} color="#2C3A47" />
          </TouchableOpacity>
          <Text style={styles.title}>Criar Turma</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#FFF0D4', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
            <FontAwesome5 name="chalkboard-teacher" size={28} color="#FF9600" />
          </View>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#2C3A47', textAlign: 'center', marginBottom: 8 }}>
            Acesso Restrito a Professores
          </Text>
          <Text style={{ fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 20, marginBottom: 24, maxWidth: 320 }}>
            Apenas contas com perfil de Professor podem criar e gerenciar salas de aula no Minuto ENEM. Como estudante, você pode ingressar em turmas existentes usando o código de convite fornecido pelo seu professor.
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: '#1CB0F6', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 14 }}
            onPress={() => router.back()}
          >
            <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 14 }}>Voltar</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleSelectSubject = (item: typeof SUBJECT_OPTIONS[0]) => {
    setSelectedSubject(item);
    setThemeColor(item.color);
    setCustomCode(generateRoomCode(item.label));
    if (codeError) setCodeError(null);
  };

  const handleCreate = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError('Por favor, dê um nome para a sua turma.');
      return;
    }
    if (trimmedName.length < 3) {
      setNameError('O nome deve ter pelo menos 3 caracteres.');
      return;
    }

    const trimmedCode = customCode.trim().toUpperCase();
    if (!trimmedCode) {
      setCodeError('Por favor, informe ou gere um código para a turma.');
      return;
    }
    if (trimmedCode.length < 3) {
      setCodeError('O código da turma deve ter pelo menos 3 caracteres.');
      return;
    }
    if (!/^[A-Z0-9_-]+$/.test(trimmedCode)) {
      setCodeError('O código deve conter apenas letras maiúsculas, números e hífens.');
      return;
    }

    // Verifica localmente se o código já existe nas turmas carregadas
    const currentClassrooms = useClassroomStore.getState().classrooms;
    if (
      currentClassrooms.some(
        (c) => c.code?.trim().toUpperCase() === trimmedCode
      )
    ) {
      setCodeError(`Você já possui uma turma com o código "${trimmedCode}". Escolha outro código.`);
      return;
    }

    setNameError(null);
    setCodeError(null);
    setIsSubmitting(true);

    try {
      const newRoom = await addClassroom({
        name: trimmedName,
        schoolId: (user as any)?.schoolId || 'default-school',
        teacherId: user?.id || '',
        subject: selectedSubject.label,
        description: description.trim() || undefined,
        school: school.trim() || undefined,
        code: trimmedCode,
        themeColor,
        icon: selectedSubject.icon,
        teacherName: user?.name || 'Prof. Responsável',
      });

      setCreatedRoom(newRoom);
    } catch (err: any) {
      const errorMsg =
        err?.message || 'Não foi possível registrar a turma. Tente novamente.';
      const lower = errorMsg.toLowerCase();
      if (
        lower.includes('código') ||
        lower.includes('codigo') ||
        lower.includes('sala com este') ||
        lower.includes('turma cadastrada')
      ) {
        setCodeError(errorMsg);
      } else {
        setNameError(errorMsg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleShareCode = async (code: string, roomName: string) => {
    try {
      await Share.share({
        message: `Entre na minha turma "${roomName}" no Minuto ENEM! Use o código: ${code}`,
      });
    } catch {
      // Ignora falha de share
    }
  };

  if (createdRoom) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successWrapper}>
          <View style={[styles.successIconBox, { backgroundColor: createdRoom.themeColor }]}>
            <FontAwesome5 name="check" size={32} color="#FFF" />
          </View>

          <Text style={styles.successTitle}>Turma Criada com Sucesso!</Text>
          <Text style={styles.successSub}>
            Compartilhe o código abaixo com seus alunos para que eles possam ingressar.
          </Text>

          {/* Card do Código */}
          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>CÓDIGO DE ACESSO DA TURMA</Text>
            <Text style={[styles.codeValue, { color: createdRoom.themeColor }]}>
              {createdRoom.code}
            </Text>

            <TouchableOpacity
              style={[styles.sharePill, { backgroundColor: createdRoom.themeColor }]}
              activeOpacity={0.8}
              onPress={() => handleShareCode(createdRoom.code, createdRoom.name)}
            >
              <FontAwesome5 name="share-alt" size={14} color="#FFF" />
              <Text style={styles.sharePillText}>Compartilhar Código</Text>
            </TouchableOpacity>
          </View>

          {/* Resumo da Turma */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryKey}>Turma:</Text>
              <Text style={styles.summaryVal}>{createdRoom.name}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryKey}>Matéria:</Text>
              <Text style={styles.summaryVal}>{createdRoom.subject}</Text>
            </View>
            {createdRoom.school && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryKey}>Escola:</Text>
                <Text style={styles.summaryVal}>{createdRoom.school}</Text>
              </View>
            )}
            <View style={styles.summaryRow}>
              <Text style={styles.summaryKey}>Professor:</Text>
              <Text style={styles.summaryVal}>{createdRoom.teacherName}</Text>
            </View>
          </View>

          <View style={styles.successActions}>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: '#0284C7', marginBottom: 10 }]}
              activeOpacity={0.8}
              onPress={() =>
                router.replace({
                  pathname: '/classes/tasks',
                  params: {
                    classId: createdRoom.id,
                    className: createdRoom.name,
                    subject: createdRoom.subject,
                    openNewTask: '1',
                  },
                } as any)
              }
            >
              <FontAwesome5 name="tasks" size={14} color="#FFF" style={{ marginRight: 8 }} />
              <Text style={styles.primaryButtonText}>Criar Lista de Exercícios (Construtor)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: '#DC2626', marginBottom: 10 }]}
              activeOpacity={0.8}
              onPress={() =>
                router.replace({
                  pathname: '/classes/materials',
                  params: { classId: createdRoom.id, className: createdRoom.name, openNew: '1' },
                } as any)
              }
            >
              <FontAwesome5 name="video" size={14} color="#FFF" style={{ marginRight: 8 }} />
              <Text style={styles.primaryButtonText}>Adicionar Materiais e Videoaulas</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.primaryButton}
              activeOpacity={0.8}
              onPress={() => router.replace(`/classes/${createdRoom.id}` as any)}
            >
              <Text style={styles.primaryButtonText}>Acessar Painel da Turma</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              activeOpacity={0.8}
              onPress={() => router.replace('/')}
            >
              <Text style={styles.secondaryButtonText}>Voltar ao Início</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (name.trim() || description.trim() || school.trim()) {
              setShowCancelModal(true);
            } else {
              router.back();
            }
          }}
          style={styles.backButton}
        >
          <FontAwesome5 name="arrow-left" size={20} color="#2C3A47" />
        </TouchableOpacity>
        <Text style={styles.title}>Criar Nova Turma</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.pageSubtitle}>
          Cadastre sua sala de aula para compartilhar listas de exercícios, simulados e materiais de estudo.
        </Text>

        <View style={styles.card}>
          {/* NOME DA TURMA */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Nome da Turma *</Text>
            <TextInput
              style={[styles.input, nameError ? styles.inputError : null]}
              placeholder="Ex: 3º Ano B - Matutino / Intensivo ENEM"
              placeholderTextColor="#A0AEC0"
              value={name}
              onChangeText={(text) => {
                setName(text);
                if (nameError) setNameError(null);
              }}
            />
            {nameError && (
              <View style={styles.errorRow}>
                <FontAwesome5 name="exclamation-circle" size={11} color="#FF4B4B" />
                <Text style={styles.errorText}>{nameError}</Text>
              </View>
            )}
          </View>

          {/* MATÉRIA / DISCIPLINA */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Disciplina / Área de Foco *</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.subjectTagsScroll}
            >
              {SUBJECT_OPTIONS.map((item) => {
                const isSelected = selectedSubject.label === item.label;
                return (
                  <TouchableOpacity
                    key={item.label}
                    style={[
                      styles.subjectTag,
                      isSelected && {
                        backgroundColor: item.color,
                        borderColor: item.color,
                      },
                    ]}
                    activeOpacity={0.7}
                    onPress={() => handleSelectSubject(item)}
                  >
                    <FontAwesome5
                      name={item.icon}
                      size={13}
                      color={isSelected ? '#FFF' : '#4B5563'}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={[
                        styles.subjectTagText,
                        isSelected && styles.subjectTagTextSelected,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* CÓDIGO DA TURMA */}
          <View style={styles.fieldGroup}>
            <View style={styles.labelWithHintRow}>
              <Text style={styles.fieldLabel}>Código de Inscrição *</Text>
              <TouchableOpacity
                onPress={() => {
                  setCustomCode(generateRoomCode(selectedSubject.label));
                  if (codeError) setCodeError(null);
                }}
              >
                <Text style={styles.refreshCodeText}>Gerar outro</Text>
              </TouchableOpacity>
            </View>
            <View
              style={[
                styles.codePreviewBox,
                codeError ? styles.codePreviewBoxError : null,
              ]}
            >
              <FontAwesome5
                name="key"
                size={14}
                color={codeError ? '#FF4B4B' : '#8CA0B3'}
              />
              <TextInput
                style={styles.codeInput}
                value={customCode}
                onChangeText={(text) => {
                  setCustomCode(text.toUpperCase());
                  if (codeError) setCodeError(null);
                }}
                autoCapitalize="characters"
                placeholder="EX: ENEM-2026"
                placeholderTextColor="#A0AEC0"
              />
            </View>
            {codeError ? (
              <View style={styles.errorRow}>
                <FontAwesome5 name="exclamation-circle" size={11} color="#FF4B4B" />
                <Text style={styles.errorText}>{codeError}</Text>
              </View>
            ) : (
              <Text style={styles.fieldHint}>
                Seus alunos usarão este código exclusivo para ingressar nesta turma. Não é possível ter turmas com códigos duplicados.
              </Text>
            )}
          </View>

          {/* COR DO TEMA */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Cor da Turma</Text>
            <View style={styles.colorPaletteRow}>
              {THEME_COLORS.map((c) => {
                const isSelected = themeColor === c;
                return (
                  <TouchableOpacity
                    key={c}
                    style={[
                      styles.colorCircle,
                      { backgroundColor: c },
                      isSelected && styles.colorCircleSelected,
                    ]}
                    onPress={() => setThemeColor(c)}
                    activeOpacity={0.8}
                  >
                    {isSelected && <FontAwesome5 name="check" size={14} color="#FFF" />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* ESCOLA / INSTITUIÇÃO (OPCIONAL) */}
          <View style={styles.fieldGroup}>
            <View style={styles.labelWithHintRow}>
              <Text style={styles.fieldLabel}>Escola ou Instituição</Text>
              <Text style={styles.optionalTag}>Opcional</Text>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Ex: IFPB, Colégio Aplicação..."
              placeholderTextColor="#A0AEC0"
              value={school}
              onChangeText={setSchool}
            />
          </View>

          {/* DESCRIÇÃO / AVISO INICIAL (OPCIONAL) */}
          <View style={styles.fieldGroup}>
            <View style={styles.labelWithHintRow}>
              <Text style={styles.fieldLabel}>Descrição ou Recado da Turma</Text>
              <Text style={styles.optionalTag}>Opcional</Text>
            </View>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Ex: Sejam bem-vindos! Postaremos listas toda terça e quinta-feira."
              placeholderTextColor="#A0AEC0"
              multiline
              numberOfLines={3}
              value={description}
              onChangeText={setDescription}
            />
          </View>

          {/* BOTÃO CRIAR */}
          <TouchableOpacity
            style={[styles.submitButton, { backgroundColor: themeColor }]}
            activeOpacity={0.8}
            onPress={handleCreate}
          >
            <FontAwesome5 name="plus-circle" size={16} color="#FFF" />
            <Text style={styles.submitButtonText}>Criar Turma</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Pop-confirm de Cancelamento */}
      <ConfirmModal
        visible={showCancelModal}
        title="Descartar Turma"
        message="Você já começou a preencher os dados desta turma. Deseja sair e descartar as alterações?"
        confirmText="Descartar"
        cancelText="Continuar editando"
        confirmColor="#FF4B4B"
        icon="exclamation-circle"
        onConfirm={() => {
          setShowCancelModal(false);
          router.back();
        }}
        onCancel={() => setShowCancelModal(false)}
      />
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
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  backButton: { width: 40, height: 40, justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#2C3A47' },
  scrollContent: { padding: 20, paddingBottom: 60 },
  pageSubtitle: { fontSize: 13, color: '#8CA0B3', marginBottom: 16, lineHeight: 18 },

  card: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },

  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: 'bold', color: '#2C3A47' },
  fieldHint: { fontSize: 11, color: '#8CA0B3', marginTop: 2 },
  labelWithHintRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  refreshCodeText: { fontSize: 12, fontWeight: 'bold', color: '#1CB0F6' },
  optionalTag: {
    fontSize: 11,
    color: '#8CA0B3',
    fontWeight: 'bold',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },

  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#2C3A47',
  },
  textArea: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: '#FF4B4B',
    backgroundColor: '#FFF5F5',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  errorText: {
    fontSize: 12,
    color: '#C40000',
    fontWeight: '600',
  },

  subjectTagsScroll: {
    gap: 8,
    paddingVertical: 4,
  },
  subjectTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  subjectTagText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#4B5563',
  },
  subjectTagTextSelected: {
    color: '#FFF',
  },

  codePreviewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  codePreviewBoxError: {
    borderColor: '#FF4B4B',
    borderWidth: 1.5,
    backgroundColor: '#FFF5F5',
  },
  codeInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2C3A47',
    letterSpacing: 1,
  },

  colorPaletteRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 4,
  },
  colorCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorCircleSelected: {
    borderWidth: 3,
    borderColor: '#2C3A47',
  },

  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 14,
    marginTop: 8,
  },
  submitButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },

  // TELA DE SUCESSO
  successWrapper: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successIconBox: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2C3A47',
    textAlign: 'center',
    marginBottom: 8,
  },
  successSub: {
    fontSize: 14,
    color: '#8CA0B3',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  codeCard: {
    width: '100%',
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  codeLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#8CA0B3',
    letterSpacing: 1,
    marginBottom: 6,
  },
  codeValue: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 14,
  },
  sharePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  sharePillText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: 'bold',
  },

  summaryCard: {
    width: '100%',
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
    marginBottom: 24,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryKey: {
    fontSize: 13,
    color: '#8CA0B3',
    fontWeight: '600',
  },
  summaryVal: {
    fontSize: 13,
    color: '#2C3A47',
    fontWeight: 'bold',
  },

  successActions: {
    width: '100%',
    gap: 10,
  },
  primaryButton: {
    backgroundColor: '#1CB0F6',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  secondaryButton: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#4B5563',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

