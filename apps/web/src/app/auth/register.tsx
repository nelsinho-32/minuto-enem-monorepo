import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { api } from '@/services/api';
import { AuthUser, UserRole, useUserStore } from '@/store/useUserStore';

interface AuthResponse {
  token: string;
  user: AuthUser;
}

export default function RegisterScreen() {
  const router = useRouter();
  const setAuth = useUserStore((state) => state.setAuth);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [courseOrClass, setCourseOrClass] = useState('');
  const [school, setSchool] = useState('');
  const [role, setRole] = useState<UserRole>('STUDENT');
  const [loading, setLoading] = useState(false);

  // Estados de erro por campo
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [courseOrClassError, setCourseOrClassError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const validate = () => {
    let isValid = true;
    setNameError(null);
    setEmailError(null);
    setPasswordError(null);
    setCourseOrClassError(null);
    setGeneralError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError('Por favor, informe seu nome completo.');
      isValid = false;
    } else if (trimmedName.split(' ').filter(Boolean).length < 2) {
      setNameError('Insira nome e sobrenome.');
      isValid = false;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setEmailError('Preencha seu e-mail.');
      isValid = false;
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        setEmailError('Insira um formato de e-mail válido (ex: aluno@email.com).');
        isValid = false;
      }
    }

    if (!password) {
      setPasswordError('Crie uma senha para sua conta.');
      isValid = false;
    } else if (password.length < 6) {
      setPasswordError('A senha deve ter no mínimo 6 caracteres.');
      isValid = false;
    }

    const trimmedCourse = courseOrClass.trim();
    if (!trimmedCourse) {
      setCourseOrClassError(
        role === 'STUDENT'
          ? 'Informe seu curso ou sala (ex: 3º Ano B, Pré-Vestibular).'
          : 'Informe sua disciplina ou turma (ex: Física 3º Ano).'
      );
      isValid = false;
    }

    return isValid;
  };

  const handleRegister = async () => {
    if (!validate()) {
      return;
    }

    setLoading(true);
    setGeneralError(null);

    try {
      const data = await api.post<AuthResponse>('/auth/register', {
        name: name.trim(),
        email: email.trim(),
        password,
        role,
        courseOrClass: courseOrClass.trim(),
        school: school.trim() || undefined,
      });

      const registeredUser: AuthUser = {
        ...data.user,
        courseOrClass: courseOrClass.trim(),
        school: school.trim() || undefined,
      };

      setAuth(data.token, registeredUser);
      router.replace('/');
    } catch (error: any) {
      const rawMessage = (error?.message || '').toLowerCase();

      if (rawMessage.includes('email') || rawMessage.includes('e-mail') || rawMessage.includes('já cadastrado') || rawMessage.includes('already exists') || rawMessage.includes('duplicate')) {
        setEmailError('Este e-mail já está cadastrado. Tente fazer login.');
      } else if (rawMessage.includes('connect') || rawMessage.includes('network') || rawMessage.includes('failed to connect')) {
        setGeneralError('Não foi possível conectar ao servidor. Verifique se sua API está ligada.');
      } else {
        setGeneralError(error.message || 'Erro ao realizar cadastro. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Image
            source={require('@/assets/images/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>Criar Conta</Text>

          {generalError && (
            <View style={styles.generalErrorBanner}>
              <FontAwesome5 name="exclamation-circle" size={14} color="#C40000" style={{ marginTop: 2 }} />
              <Text style={styles.generalErrorText}>{generalError}</Text>
            </View>
          )}

          {/* NOME COMPLETO */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Nome Completo</Text>
            <TextInput
              style={[styles.input, nameError ? styles.inputError : null]}
              placeholder="Nome"
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

          {/* E-MAIL */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>E-mail</Text>
            <TextInput
              style={[styles.input, emailError ? styles.inputError : null]}
              placeholder="seu.email@exemplo.com"
              placeholderTextColor="#A0AEC0"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                if (emailError) setEmailError(null);
              }}
            />
            {emailError && (
              <View style={styles.errorRow}>
                <FontAwesome5 name="exclamation-circle" size={11} color="#FF4B4B" />
                <Text style={styles.errorText}>{emailError}</Text>
              </View>
            )}
          </View>

          {/* SENHA */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Senha</Text>
            <TextInput
              style={[styles.input, passwordError ? styles.inputError : null]}
              placeholder="Mínimo de 6 caracteres"
              placeholderTextColor="#A0AEC0"
              secureTextEntry
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (passwordError) setPasswordError(null);
              }}
            />
            {passwordError && (
              <View style={styles.errorRow}>
                <FontAwesome5 name="exclamation-circle" size={11} color="#FF4B4B" />
                <Text style={styles.errorText}>{passwordError}</Text>
              </View>
            )}
          </View>

          {/* CURSO OU SALA */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>
              {role === 'STUDENT' ? 'Curso ou Sala' : 'Disciplina ou Sala'}
            </Text>
            <TextInput
              style={[styles.input, courseOrClassError ? styles.inputError : null]}
              placeholder={
                role === 'STUDENT'
                  ? 'Ex: 3º Ano A, Cursinho Extensivo'
                  : 'Ex: Matemática 3º Ano, Física Geral'
              }
              placeholderTextColor="#A0AEC0"
              value={courseOrClass}
              onChangeText={(text) => {
                setCourseOrClass(text);
                if (courseOrClassError) setCourseOrClassError(null);
              }}
            />
            {courseOrClassError && (
              <View style={styles.errorRow}>
                <FontAwesome5 name="exclamation-circle" size={11} color="#FF4B4B" />
                <Text style={styles.errorText}>{courseOrClassError}</Text>
              </View>
            )}
          </View>

          {/* ESCOLA (OPCIONAL) */}
          <View style={styles.fieldGroup}>
            <View style={styles.labelWithOptionalRow}>
              <Text style={styles.fieldLabel}>Escola</Text>
              <Text style={styles.optionalTag}>Opcional</Text>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Ex: Márcia Guedes, Pedro Cardoso..."
              placeholderTextColor="#A0AEC0"
              value={school}
              onChangeText={setSchool}
            />
          </View>

          {/* SELETOR DE PERFIL: ALUNO VS PROFESSOR */}
          <Text style={styles.fieldLabel}>Eu sou:</Text>
          <View style={styles.roleSelector}>
            <TouchableOpacity
              style={[
                styles.roleOption,
                role === 'STUDENT' && styles.roleOptionActive,
              ]}
              onPress={() => setRole('STUDENT')}
            >
              <FontAwesome5
                name="user-graduate"
                size={14}
                color={role === 'STUDENT' ? '#FFF' : '#8CA0B3'}
                style={{ marginRight: 6 }}
              />
              <Text
                style={[
                  styles.roleText,
                  role === 'STUDENT' && styles.roleTextActive,
                ]}
              >
                Aluno
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.roleOption,
                role === 'TEACHER' && styles.roleOptionActive,
              ]}
              onPress={() => setRole('TEACHER')}
            >
              <FontAwesome5
                name="chalkboard-teacher"
                size={14}
                color={role === 'TEACHER' ? '#FFF' : '#8CA0B3'}
                style={{ marginRight: 6 }}
              />
              <Text
                style={[
                  styles.roleText,
                  role === 'TEACHER' && styles.roleTextActive,
                ]}
              >
                Professor
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.submitButton}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.submitText}>Cadastrar</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.linkText}>Já possui conta? Entrar</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  scrollContent: { padding: 24, paddingBottom: 40, justifyContent: 'center' },
  card: { backgroundColor: '#FFF', padding: 24, borderRadius: 20, gap: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  logo: { width: 110, height: 110, alignSelf: 'center', marginBottom: 2 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#2C3A47', textAlign: 'center', marginBottom: 4 },

  fieldGroup: { gap: 4 },
  fieldLabel: { fontSize: 13, fontWeight: 'bold', color: '#2C3A47' },
  labelWithOptionalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
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
  inputError: {
    borderColor: '#FF4B4B',
    backgroundColor: '#FFF5F5',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
    paddingHorizontal: 2,
  },
  errorText: {
    fontSize: 12,
    color: '#C40000',
    fontWeight: '600',
  },
  generalErrorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#FFE4E6',
    borderRadius: 12,
    padding: 12,
  },
  generalErrorText: {
    flex: 1,
    fontSize: 13,
    color: '#C40000',
    lineHeight: 18,
  },

  roleSelector: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 12, padding: 4, gap: 8 },
  roleOption: { flex: 1, flexDirection: 'row', paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  roleOptionActive: { backgroundColor: '#1CB0F6' },
  roleText: { fontSize: 14, fontWeight: 'bold', color: '#8CA0B3' },
  roleTextActive: { color: '#FFFFFF' },
  submitButton: { backgroundColor: '#58CC02', paddingVertical: 15, borderRadius: 14, alignItems: 'center', marginTop: 6 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  linkText: { color: '#1CB0F6', textAlign: 'center', fontWeight: 'bold', marginTop: 6 },
});
