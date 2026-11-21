import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';

interface TransferTeacherModalProps {
  transferClassroom: {
    id: string;
    name: string;
    teacherId: string;
    teacherName: string;
  } | null;
  teachers: Array<{ id: string; name: string; email: string }>;
  selectedNewTeacherId: string;
  onSelectTeacher: (id: string) => void;
  isTransferring: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function TransferTeacherModal({
  transferClassroom,
  teachers,
  selectedNewTeacherId,
  onSelectTeacher,
  isTransferring,
  onClose,
  onConfirm,
}: TransferTeacherModalProps) {
  return (
    <Modal
      visible={Boolean(transferClassroom)}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Transferir Titularidade da Turma</Text>
          <Text style={styles.sub}>
            Turma: <Text style={{ fontWeight: '800' }}>{transferClassroom?.name}</Text> (atual: Prof.{' '}
            {transferClassroom?.teacherName})
          </Text>

          <ScrollView style={{ maxHeight: 220 }} contentContainerStyle={{ gap: 8 }}>
            {teachers
              .filter((t) => t.id !== transferClassroom?.teacherId)
              .map((t) => {
                const active = selectedNewTeacherId === t.id;
                return (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => onSelectTeacher(t.id)}
                    style={[
                      styles.teacherOption,
                      {
                        borderColor: active ? '#7C3AED' : '#E2E8F0',
                        backgroundColor: active ? '#F5F3FF' : '#F8FAFC',
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A' }}>
                      {t.name}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#64748B' }}>{t.email}</Text>
                  </TouchableOpacity>
                );
              })}
            {teachers.filter((t) => t.id !== transferClassroom?.teacherId).length === 0 && (
              <Text style={{ fontSize: 12.5, color: '#64748B', paddingVertical: 12 }}>
                Cadastre outro professor primeiro na aba Professores para realizar a transferência.
              </Text>
            )}
          </ScrollView>

          <View style={styles.actionsRow}>
            <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
              <Text style={{ fontWeight: '700', color: '#475569' }}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={!selectedNewTeacherId || isTransferring}
              onPress={onConfirm}
              style={[
                styles.confirmBtn,
                { backgroundColor: selectedNewTeacherId ? '#7C3AED' : '#CBD5E1' },
              ]}
            >
              <Text style={{ fontWeight: '800', color: '#FFFFFF' }}>
                {isTransferring ? 'Transferindo...' : 'Confirmar Transferência'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

interface ReassignStudentsModalProps {
  visible: boolean;
  classrooms: Array<{ id: string; name: string }>;
  reassignFromId: string;
  reassignToId: string;
  reassignStudents: Array<{ id: string; name: string; email: string }>;
  selectedStudentIds: string[];
  loadingReassignStudents: boolean;
  isReassigning: boolean;
  onSelectFrom: (id: string) => void;
  onSelectTo: (id: string) => void;
  onToggleStudent: (id: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export function ReassignStudentsModal({
  visible,
  classrooms,
  reassignFromId,
  reassignToId,
  reassignStudents,
  selectedStudentIds,
  loadingReassignStudents,
  isReassigning,
  onSelectFrom,
  onSelectTo,
  onToggleStudent,
  onClose,
  onConfirm,
}: ReassignStudentsModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { maxWidth: 460 }]}>
          <Text style={styles.title}>Remanejamento em Lote de Alunos</Text>
          <Text style={styles.sub}>
            Selecione a turma de origem, marque os alunos e escolha a turma de destino:
          </Text>

          <Text style={styles.label}>Turma de Origem:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {classrooms.map((c) => {
              const active = reassignFromId === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => onSelectFrom(c.id)}
                  style={[
                    styles.roomChip,
                    {
                      borderColor: active ? '#0284C7' : '#E2E8F0',
                      backgroundColor: active ? '#E0F2FE' : '#F8FAFC',
                    },
                  ]}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#0369A1' : '#334155' }}>
                    {c.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={styles.label}>Turma de Destino:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {classrooms
              .filter((c) => c.id !== reassignFromId)
              .map((c) => {
                const active = reassignToId === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => onSelectTo(c.id)}
                    style={[
                      styles.roomChip,
                      {
                        borderColor: active ? '#16A34A' : '#E2E8F0',
                        backgroundColor: active ? '#DCFCE7' : '#F8FAFC',
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#15803D' : '#334155' }}>
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
          </ScrollView>

          <Text style={styles.label}>
            Alunos ({selectedStudentIds.length} selecionado(s)):
          </Text>
          {loadingReassignStudents ? (
            <ActivityIndicator size="small" color="#0284C7" style={{ marginVertical: 14 }} />
          ) : (
            <ScrollView style={{ maxHeight: 190 }} contentContainerStyle={{ gap: 6 }}>
              {reassignStudents.length === 0 ? (
                <Text style={{ fontSize: 12, color: '#64748B', paddingVertical: 8 }}>
                  Nenhum aluno matriculado nesta turma de origem.
                </Text>
              ) : (
                reassignStudents.map((st) => {
                  const checked = selectedStudentIds.includes(st.id);
                  return (
                    <TouchableOpacity
                      key={st.id}
                      onPress={() => onToggleStudent(st.id)}
                      style={[
                        styles.studentRow,
                        {
                          borderColor: checked ? '#0284C7' : '#E2E8F0',
                          backgroundColor: checked ? '#F0F9FF' : '#F8FAFC',
                        },
                      ]}
                    >
                      <View>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>{st.name}</Text>
                        <Text style={{ fontSize: 11.5, color: '#64748B' }}>{st.email}</Text>
                      </View>
                      <FontAwesome5
                        name={checked ? 'check-square' : 'square'}
                        size={16}
                        color={checked ? '#0284C7' : '#94A3B8'}
                      />
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          )}

          <View style={styles.actionsRow}>
            <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
              <Text style={{ fontWeight: '700', color: '#475569' }}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={!reassignFromId || !reassignToId || selectedStudentIds.length === 0 || isReassigning}
              onPress={onConfirm}
              style={[
                styles.confirmBtn,
                {
                  backgroundColor:
                    reassignFromId && reassignToId && selectedStudentIds.length > 0
                      ? '#0284C7'
                      : '#CBD5E1',
                },
              ]}
            >
              <Text style={{ fontWeight: '800', color: '#FFFFFF' }}>
                {isReassigning ? 'Movendo...' : `Mover (${selectedStudentIds.length})`}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    gap: 10,
  },
  title: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  sub: { fontSize: 12.5, color: '#475569' },
  label: { fontSize: 12, fontWeight: '800', color: '#334155' },
  teacherOption: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  roomChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
    marginTop: 6,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  confirmBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
});
