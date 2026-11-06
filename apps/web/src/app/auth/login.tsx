import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { api } from '@/services/api';
import { AuthUser, useUserStore } from '@/store/useUserStore';

interface AuthResponse {
  token: string;
  user: AuthUser;
}

export default function LoginScreen() {
  const router = useRouter();
  const setAuth = useUserStore((state) => state.setAuth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Estados de erro por campo
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const validate = () => {
    let isValid = true;
    setEmailError(null);
    setPasswordError(null);
    setGeneralError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setEmailError('Preencha seu e-mail.');
      isValid = false;
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        setEmailError('Insira um e-mail válido (ex: aluno@email.com).');
        isValid = false;
      }
    }

    if (!password) {
      setPasswordError('Preencha sua senha.');
      isValid = false;
    } else if (password.length < 6) {
      setPasswordError('A senha deve ter no mínimo 6 caracteres.');
      isValid = false;
    }

    return isValid;
  };

  const handleLogin = async () => {
    if (!validate()) {
      return;
    }

    setLoading(true);
    setGeneralError(null);

    try {
      const data = await api.post<AuthResponse>('/auth/login', {
        email: email.trim(),
        password,
      });

      setAuth(data.token, data.user);

      if (data.user?.role === 'ADMIN') {
        router.replace('/admin/schools' as any);
      } else if (data.user?.role === 'SCHOOL') {
        router.replace('/school/dashboard' as any);
      } else {
        router.replace('/');
      }
    } catch (error: any) {
      const rawMessage = (error?.message || '').toLowerCase();

      if (rawMessage.includes('senha') || rawMessage.includes('credencia') || rawMessage.includes('password') || rawMessage.includes('inválid')) {
        setPasswordError('E-mail ou senha incorretos. Verifique suas credenciais.');
      } else if (rawMessage.includes('usuário não encontrado') || rawMessage.includes('not found') || rawMessage.includes('e-mail não cadastrado')) {
        setEmailError('E-mail não encontrado. Verifique ou crie uma conta.');
      } else if (rawMessage.includes('connect') || rawMessage.includes('network') || rawMessage.includes('failed to connect')) {
        setGeneralError('Não foi possível conectar ao servidor. Verifique sua conexão ou se a API está online.');
      } else {
        setGeneralError(error.message || 'Falha ao autenticar. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Image
          source={require('@/assets/images/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>Login</Text>

        {generalError && (
          <View style={styles.generalErrorBanner}>
            <FontAwesome5 name="exclamation-circle" size={14} color="#C40000" style={{ marginTop: 2 }} />
            <Text style={styles.generalErrorText}>{generalError}</Text>
          </View>
        )}

        {/* CAMPO DE E-MAIL */}
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

        {/* CAMPO DE SENHA */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Senha</Text>
          <TextInput
            style={[styles.input, passwordError ? styles.inputError : null]}
            placeholder="Sua senha"
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

        <TouchableOpacity
          style={styles.submitButton}
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.submitText}>Entrar</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push('/auth/register' as any)}>
          <Text style={styles.linkText}>Não tem conta? Cadastre-se</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#F7F9FC' },
  card: { backgroundColor: '#FFF', padding: 24, borderRadius: 20, gap: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  logo: { width: 120, height: 120, alignSelf: 'center', marginBottom: 2 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#2C3A47', textAlign: 'center', marginBottom: 4 },
  
  fieldGroup: { gap: 4 },
  fieldLabel: { fontSize: 13, fontWeight: 'bold', color: '#2C3A47' },
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

  submitButton: { backgroundColor: '#1CB0F6', paddingVertical: 15, borderRadius: 14, alignItems: 'center', marginTop: 6 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  linkText: { color: '#1CB0F6', textAlign: 'center', fontWeight: 'bold', marginTop: 6 },
});
