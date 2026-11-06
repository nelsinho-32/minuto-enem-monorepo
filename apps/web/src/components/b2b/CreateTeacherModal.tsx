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
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { api } from '@/services/api';

interface CreateTeacherModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateTeacherModal({
  visible,
  onClose,
  onSuccess,
}: CreateTeacherModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setName('');
    setEmail('');
    setPassword('');
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('O nome do professor é obrigatório.');
      return;
    }
    if (!email.trim() || !password.trim()) {
      setError('E-mail e senha provisória são obrigatórios.');
      return;
    }
    if (password.length < 6) {
      setError('A senha provisória deve ter no mínimo 6 caracteres.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await api.post('/schools/me/teachers', {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
      });

      resetForm();
      onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Falha ao vincular o professor.');
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
                <FontAwesome5 name="chalkboard-teacher" size={16} color="#1CB0F6" />
              </View>
              <Text style={styles.headerTitle}>Novo Professor</Text>
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

            <Text style={styles.label}>Nome Completo do Docente *</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Profa. Mariana Silva"
              placeholderTextColor="#9CA3AF"
              value={name}
              onChangeText={setName}
            />

            <Text style={styles.label}>E-mail Institucional *</Text>
            <TextInput
              style={styles.input}
              placeholder="mariana.silva@escola.com.br"
              placeholderTextColor="#9CA3AF"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.label}>Senha Provisória de Acesso *</Text>
            <TextInput
              style={styles.input}
              placeholder="Mínimo 6 caracteres"
              placeholderTextColor="#9CA3AF"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

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
                      name="user-plus"
                      size={13}
                      color="#FFFFFF"
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.submitBtnText}>Vincular Professor</Text>
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
    maxWidth: 480,
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

