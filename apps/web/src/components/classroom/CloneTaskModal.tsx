import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { api } from '@/services/api';
import { useTheme } from '@/hooks/use-theme';

interface CloneTaskModalProps {
  visible: boolean;
  task: { id: string; title: string } | null;
  classrooms: Array<{ id: string; name: string; code?: string }>;
  onClose: () => void;
  onCloned?: () => void;
}

export function CloneTaskModal({
  visible,
  task,
  classrooms,
  onClose,
  onCloned,
}: CloneTaskModalProps) {
  const theme = useTheme();
  const [targetClassroomId, setTargetClassroomId] = useState<string>('');
  const [customTitle, setCustomTitle] = useState<string>('');
  const [dueDateInput, setDueDateInput] = useState<string>('');
  const [isCloning, setIsCloning] = useState(false);

  const handleConfirmClone = async () => {
    const destId = targetClassroomId || classrooms[0]?.id;
    if (!task || !destId) {
      Alert.alert('Selecione a turma', 'Escolha a turma de destino para clonar esta lista.');
      return;
    }

    let dueIso: string | undefined;
    if (dueDateInput.trim()) {
      const parsed = new Date(dueDateInput.trim().replace(' ', 'T'));
      if (Number.isNaN(parsed.getTime())) {
        Alert.alert('Data inválida', 'Use o formato AAAA-MM-DD (ex: 2026-12-10).');
        return;
      }
      dueIso = parsed.toISOString();
    }

    setIsCloning(true);
    try {
      await api.post(`/tasks/${task.id}/clone`, {
        targetClassroomId: destId,
        title: customTitle.trim() || `${task.title} (Cópia)`,
        ...(dueIso ? { dueDate: dueIso } : {}),
      });
      onCloned?.();
      onClose();
      const msg = 'Lista/tarefa clonada com sucesso para a turma selecionada!';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Lista Clonada!', msg);
    } catch (err: any) {
      const msg = err?.message || 'Erro ao clonar tarefa.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Erro', msg);
    } finally {
      setIsCloning(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.card,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: theme.text }]}>
              Clonar Lista para Outra Turma
            </Text>
            <TouchableOpacity onPress={onClose}>
              <FontAwesome5 name="times" size={16} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={{ fontSize: 12.5, color: theme.textMuted }}>
            Origem: <Text style={{ fontWeight: '800', color: theme.text }}>{task?.title}</Text>
          </Text>

          <Text style={[styles.label, { color: theme.text }]}>Turma de Destino:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {classrooms.map((c) => {
              const active = (targetClassroomId || classrooms[0]?.id) === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => setTargetClassroomId(c.id)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? theme.primary : theme.surfaceMuted,
                      borderColor: active ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <Text style={{ fontSize: 12, fontWeight: '800', color: active ? '#FFF' : theme.text }}>
                    {c.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={[styles.label, { color: theme.text }]}>Novo Título (opcional):</Text>
          <TextInput
            value={customTitle}
            onChangeText={setCustomTitle}
            placeholder={task ? `${task.title} (Cópia)` : 'Título da cópia'}
            placeholderTextColor={theme.textMuted}
            style={[
              styles.input,
              {
                backgroundColor: theme.surfaceMuted,
                borderColor: theme.border,
                color: theme.text,
              },
            ]}
          />

          <Text style={[styles.label, { color: theme.text }]}>Novo Prazo (opcional, AAAA-MM-DD):</Text>
          <TextInput
            value={dueDateInput}
            onChangeText={setDueDateInput}
            placeholder="Ex: 2026-12-15"
            placeholderTextColor={theme.textMuted}
            style={[
              styles.input,
              {
                backgroundColor: theme.surfaceMuted,
                borderColor: theme.border,
                color: theme.text,
              },
            ]}
          />

          <View style={styles.actionsRow}>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.cancelBtn, { backgroundColor: theme.surfaceMuted }]}
            >
              <Text style={{ fontWeight: '700', color: theme.textMuted }}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={isCloning}
              onPress={handleConfirmClone}
              style={[styles.confirmBtn, { backgroundColor: theme.primary }]}
            >
              <FontAwesome5 name="copy" size={12} color="#FFF" />
              <Text style={{ fontWeight: '800', color: '#FFF', fontSize: 13 }}>
                {isCloning ? 'Clonando...' : 'Clonar Lista'}
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
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontSize: 16, fontWeight: '800' },
  label: { fontSize: 12, fontWeight: '800', marginTop: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
});
