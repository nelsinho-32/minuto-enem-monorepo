import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { api } from '@/services/api';

interface AssignTaskModalProps {
  visible: boolean;
  classroomId: string;
  initialTopic?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function AssignTaskModal({
  visible,
  classroomId,
  initialTopic,
  onClose,
  onSuccess,
}: AssignTaskModalProps) {
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [totalQuestions, setTotalQuestions] = useState('5');
  const [daysUntilDue, setDaysUntilDue] = useState('7');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialTopic) {
      setTopic(initialTopic);
      setTitle(`Lista de Reforço: ${initialTopic}`);
    } else {
      setTopic('');
      setTitle('');
    }
  }, [initialTopic, visible]);

  const resetForm = () => {
    setTitle('');
    setTopic('');
    setDescription('');
    setTotalQuestions('5');
    setDaysUntilDue('7');
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('O título da atividade é obrigatório.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const days = parseInt(daysUntilDue, 10) || 7;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + days);
      dueDate.setHours(23, 59, 59, 999);

      const numQuestions = Math.min(Math.max(parseInt(totalQuestions, 10) || 5, 1), 30);

      const payload = {
        title: title.trim(),
        topic: topic.trim() || undefined,
        description: description.trim() || undefined,
        total: numQuestions,
        dueDate: dueDate.toISOString(),
      };

      await api.post(`/classrooms/${classroomId}/tasks`, payload);

      resetForm();
      onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Falha ao atribuir tarefa para a turma.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderTitle}>
              <View style={styles.headerIcon}>
                <FontAwesome5 name="tasks" size={16} color="#1CB0F6" />
              </View>
              <Text style={styles.headerTitle}>Nova Tarefa para a Turma</Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <FontAwesome5 name="times" size={16} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {error ? (
              <View style={styles.errorAlert}>
                <FontAwesome5 name="exclamation-circle" size={14} color="#DC2626" />
                <Text style={styles.errorAlertText}>{error}</Text>
              </View>
            ) : null}

            <Text style={styles.label}>Título da Atividade *</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Treino Rápido: Geometria Espacial"
              placeholderTextColor="#9CA3AF"
              value={title}
              onChangeText={setTitle}
            />

            <Text style={styles.label}>Assunto / Matéria (Foco Pedagógico)</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Matemática, Cinemática, Redação..."
              placeholderTextColor="#9CA3AF"
              value={topic}
              onChangeText={setTopic}
            />

            <Text style={styles.label}>Orientações para os Alunos (opcional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Ex: Resolvam com calma prestando atenção nas pegadinhas..."
              placeholderTextColor="#9CA3AF"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
            />

            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>Nº de Questões</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={totalQuestions}
                  onChangeText={setTotalQuestions}
                />
              </View>

              <View style={styles.col}>
                <Text style={styles.label}>Prazo de Entrega (dias)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={daysUntilDue}
                  onChangeText={setDaysUntilDue}
                />
              </View>
            </View>

            <View style={styles.infoBanner}>
              <FontAwesome5 name="bell" size={14} color="#1D4ED8" />
              <Text style={styles.infoBannerText}>
                Esta atividade aparecerá imediatamente na aba de tarefas de todos os alunos
                matriculados nesta turma.
              </Text>
            </View>

            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={handleClose}
                disabled={loading}
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.submitBtn, loading && { opacity: 0.7 }]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <FontAwesome5
                      name="paper-plane"
                      size={13}
                      color="#FFFFFF"
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.submitBtnText}>Atribuir para a Turma</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 8,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  modalHeaderTitle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E0F2FE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  closeButton: {
    padding: 8,
  },
  body: {
    padding: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 14,
    color: '#111827',
    marginBottom: 14,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  col: {
    flex: 1,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    gap: 10,
  },
  infoBannerText: {
    fontSize: 12,
    color: '#1E40AF',
    flex: 1,
    lineHeight: 18,
  },
  errorAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    gap: 10,
  },
  errorAlertText: {
    fontSize: 13,
    color: '#991B1B',
    flex: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
    marginBottom: 8,
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1CB0F6',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

