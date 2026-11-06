import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { api } from '@/services/api';

interface AdminSchoolModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AdminSchoolModal({ visible, onClose, onSuccess }: AdminSchoolModalProps) {
  const [name, setName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [code, setCode] = useState('');
  const [slug, setSlug] = useState('');
  const [managerName, setManagerName] = useState('');
  const [managerEmail, setManagerEmail] = useState('');
  const [managerPassword, setManagerPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    schoolName: string;
    managerEmail: string;
    code: string;
  } | null>(null);

  const resetForm = () => {
    setName('');
    setCnpj('');
    setCode('');
    setSlug('');
    setManagerName('');
    setManagerEmail('');
    setManagerPassword('');
    setError(null);
    setSuccessInfo(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('O nome da instituição escolar é obrigatório.');
      return;
    }
    if (!managerName.trim() || !managerEmail.trim() || !managerPassword.trim()) {
      setError('Os dados completos do gestor escolar (nome, e-mail e senha) são obrigatórios.');
      return;
    }
    if (managerPassword.length < 6) {
      setError('A senha inicial do gestor deve conter no mínimo 6 caracteres.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const payload = {
        name: name.trim(),
        cnpj: cnpj.trim() ? cnpj.trim() : undefined,
        code: code.trim() ? code.trim().toUpperCase() : undefined,
        slug: slug.trim() ? slug.trim().toLowerCase() : undefined,
        manager: {
          name: managerName.trim(),
          email: managerEmail.trim().toLowerCase(),
          password: managerPassword,
        },
      };

      const response = await api.post('/admin/schools', payload);

      setSuccessInfo({
        schoolName: response.school?.name || name,
        managerEmail: response.manager?.email || managerEmail,
        code: response.school?.code || 'Gerado',
      });

      onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Falha ao cadastrar a escola. Verifique os dados digitados.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderTitle}>
              <View style={styles.headerIcon}>
                <FontAwesome5 name="school" size={16} color="#1CB0F6" />
              </View>
              <Text style={styles.headerTitle}>Cadastrar Nova Escola</Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <FontAwesome5 name="times" size={16} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {successInfo ? (
              <View style={styles.successContainer}>
                <View style={styles.successIconCircle}>
                  <FontAwesome5 name="check" size={32} color="#10B981" />
                </View>
                <Text style={styles.successTitle}>Escola cadastrada com sucesso!</Text>
                <Text style={styles.successDesc}>
                  A instituição <Text style={{ fontWeight: '700' }}>{successInfo.schoolName}</Text>{' '}
                  foi configurada no sistema.
                </Text>

                <View style={styles.credentialsBox}>
                  <Text style={styles.credentialsBoxTitle}>Credenciais do Gestor Escolar:</Text>
                  <Text style={styles.credText}>
                    <Text style={{ fontWeight: '600' }}>E-mail: </Text>
                    {successInfo.managerEmail}
                  </Text>
                  <Text style={styles.credText}>
                    <Text style={{ fontWeight: '600' }}>Código da Escola: </Text>
                    {successInfo.code}
                  </Text>
                  <Text style={styles.credNote}>
                    O gestor já pode fazer login na plataforma para gerenciar turmas e professores.
                  </Text>
                </View>

                <TouchableOpacity style={styles.submitBtn} onPress={handleClose}>
                  <Text style={styles.submitBtnText}>Concluir e Voltar</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {error ? (
                  <View style={styles.errorAlert}>
                    <FontAwesome5 name="exclamation-circle" size={16} color="#DC2626" />
                    <Text style={styles.errorAlertText}>{error}</Text>
                  </View>
                ) : null}

                {/* Seção 1: Dados da Instituição */}
                <Text style={styles.sectionTitle}>1. Dados da Instituição</Text>

                <Text style={styles.label}>Nome da Escola *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: Colégio Anglo Vestibulares"
                  placeholderTextColor="#9CA3AF"
                  value={name}
                  onChangeText={setName}
                />

                <View style={styles.row}>
                  <View style={styles.col}>
                    <Text style={styles.label}>CNPJ (opcional)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="00.000.000/0000-00"
                      placeholderTextColor="#9CA3AF"
                      value={cnpj}
                      onChangeText={setCnpj}
                    />
                  </View>

                  <View style={styles.col}>
                    <Text style={styles.label}>Código/Identificador</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Ex: ANGLO-01 (ou auto)"
                      placeholderTextColor="#9CA3AF"
                      value={code}
                      onChangeText={setCode}
                      autoCapitalize="characters"
                    />
                  </View>
                </View>

                {/* Seção 2: Gestor Inicial */}
                <Text style={[styles.sectionTitle, { marginTop: 16 }]}>
                  2. Credenciais do Gestor Inicial (Perfil Escola)
                </Text>

                <Text style={styles.label}>Nome do Diretor/Coordenador *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: Prof. Carlos Eduardo"
                  placeholderTextColor="#9CA3AF"
                  value={managerName}
                  onChangeText={setManagerName}
                />

                <Text style={styles.label}>E-mail de Acesso do Gestor *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="coordenacao@escola.com.br"
                  placeholderTextColor="#9CA3AF"
                  value={managerEmail}
                  onChangeText={setManagerEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />

                <Text style={styles.label}>Senha Inicial Provisória *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Mínimo 6 caracteres"
                  placeholderTextColor="#9CA3AF"
                  value={managerPassword}
                  onChangeText={setManagerPassword}
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
                          name="check"
                          size={14}
                          color="#FFFFFF"
                          style={{ marginRight: 8 }}
                        />
                        <Text style={styles.submitBtnText}>Criar Escola e Gestor</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
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
    maxWidth: 540,
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
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5563',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
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
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  col: {
    flex: 1,
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
    marginTop: 16,
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
  successContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  successIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#D1FAE5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#065F46',
    marginBottom: 8,
    textAlign: 'center',
  },
  successDesc: {
    fontSize: 14,
    color: '#4B5563',
    textAlign: 'center',
    marginBottom: 20,
  },
  credentialsBox: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    marginBottom: 24,
  },
  credentialsBoxTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#166534',
    marginBottom: 8,
  },
  credText: {
    fontSize: 13,
    color: '#1E293B',
    marginBottom: 4,
  },
  credNote: {
    fontSize: 12,
    color: '#15803D',
    marginTop: 8,
    fontStyle: 'italic',
  },
});

