import React, { useState } from 'react';
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

export interface TeacherOption {
  id: string;
  name: string;
  email: string;
}

interface CreateClassroomModalProps {
  visible: boolean;
  teachers: TeacherOption[];
  onClose: () => void;
  onSuccess: () => void;
  onOpenCreateTeacher?: () => void;
}

export function CreateClassroomModal({
  visible,
  teachers,
  onClose,
  onSuccess,
  onOpenCreateTeacher,
}: CreateClassroomModalProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(
    teachers[0]?.id || ''
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sincroniza teacher padrão quando lista muda
  React.useEffect(() => {
    if (!selectedTeacherId && teachers.length > 0) {
      setSelectedTeacherId(teachers[0].id);
    }
  }, [teachers, selectedTeacherId]);

  const resetForm = () => {
    setName('');
    setCode('');
    setSelectedTeacherId(teachers[0]?.id || '');
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('O nome da turma é obrigatório.');
      return;
    }
    if (!selectedTeacherId) {
      setError('Selecione um professor responsável para a turma.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await api.post('/schools/me/classrooms', {
        name: name.trim(),
        code: code.trim() ? code.trim().toUpperCase() : undefined,
        teacherId: selectedTeacherId,
      });

      resetForm();
      onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Falha ao criar a turma.');
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
                <FontAwesome5 name="users" size={16} color="#1CB0F6" />
              </View>
              <Text style={styles.headerTitle}>Criar Nova Turma</Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <FontAwesome5 name="times" size={16} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            {error ? (
              <View style={styles.errorAlert}>
                <FontAwesome5 name="exclamation-circle" size={14} color="#DC2626" />
                <Text style={styles.errorAlertText}>{error}</Text>
              </View>
            ) : null}

            <Text style={styles.label}>Nome da Turma *</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: 3º Ano A - Ensino Médio"
              placeholderTextColor="#9CA3AF"
              value={name}
              onChangeText={setName}
            />

            <Text style={styles.label}>Código de Acesso (opcional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: TERC-A (deixe vazio para gerar automático)"
              placeholderTextColor="#9CA3AF"
              value={code}
              onChangeText={setCode}
              autoCapitalize="characters"
            />

            <Text style={styles.label}>Professor Responsável *</Text>
            {teachers.length === 0 ? (
              <View style={styles.noTeachersWarning}>
                <FontAwesome5 name="info-circle" size={14} color="#D97706" />
                <Text style={styles.noTeachersText}>
                  Nenhum professor cadastrado nesta escola ainda.
                </Text>
                {onOpenCreateTeacher ? (
                  <TouchableOpacity
                    style={styles.addTeacherQuickBtn}
                    onPress={() => {
                      handleClose();
                      onOpenCreateTeacher();
                    }}
                  >
                    <Text style={styles.addTeacherQuickBtnText}>+ Cadastrar Professor</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : (
              <ScrollView style={styles.teacherList} nestedScrollEnabled>
                {teachers.map((teacher) => {
                  const isSelected = selectedTeacherId === teacher.id;
                  return (
                    <TouchableOpacity
                      key={teacher.id}
                      style={[
                        styles.teacherOption,
                        isSelected && styles.teacherOptionSelected,
                      ]}
                      onPress={() => setSelectedTeacherId(teacher.id)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.radioCircle}>
                        {isSelected && <View style={styles.radioDot} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.teacherOptionName,
                            isSelected && styles.teacherOptionNameSelected,
                          ]}
                        >
                          {teacher.name}
                        </Text>
                        <Text style={styles.teacherOptionEmail}>{teacher.email}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={handleClose}
                disabled={loading}
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  (loading || teachers.length === 0) && { opacity: 0.6 },
                ]}
                onPress={handleSubmit}
                disabled={loading || teachers.length === 0}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <FontAwesome5
                      name="check"
                      size={13}
                      color="#FFFFFF"
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.submitBtnText}>Criar Turma</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
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
    maxWidth: 500,
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
  teacherList: {
    maxHeight: 180,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 6,
  },
  teacherOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    marginBottom: 4,
  },
  teacherOptionSelected: {
    backgroundColor: '#EFF6FF',
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#1CB0F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1CB0F6',
  },
  teacherOptionName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  teacherOptionNameSelected: {
    color: '#1CB0F6',
    fontWeight: '700',
  },
  teacherOptionEmail: {
    fontSize: 12,
    color: '#6B7280',
  },
  noTeachersWarning: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  noTeachersText: {
    fontSize: 13,
    color: '#B45309',
    textAlign: 'center',
  },
  addTeacherQuickBtn: {
    backgroundColor: '#D97706',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  addTeacherQuickBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
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

