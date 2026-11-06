import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { useUserStore, type UserRole } from '@/store/useUserStore';

interface RoleGuardProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
  fallbackRoute?: string;
}

export function RoleGuard({
  allowedRoles,
  children,
  fallbackRoute = '/',
}: RoleGuardProps) {
  const router = useRouter();
  const { user, hasHydrated } = useUserStore();

  const isAuthorized = Boolean(
    user && user.role && (allowedRoles.includes(user.role) || user.role === 'ADMIN')
  );

  useEffect(() => {
    if (!hasHydrated) return;

    if (!user) {
      router.replace('/auth/login' as any);
    }
  }, [hasHydrated, user, router]);

  if (!hasHydrated) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1CB0F6" />
        <Text style={styles.loadingText}>Carregando permissões...</Text>
      </View>
    );
  }

  if (!user) {
    return null;
  }

  if (!isAuthorized) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <FontAwesome5 name="lock" size={32} color="#FF4B4B" />
          </View>
          <Text style={styles.title}>Acesso Restrito</Text>
          <Text style={styles.description}>
            Seu perfil atual ({user.role}) não possui privilégios para acessar este módulo.
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.replace(fallbackRoute as any)}
            activeOpacity={0.8}
          >
            <FontAwesome5 name="arrow-left" size={14} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.backButtonText}>Voltar ao Início</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    backgroundColor: '#F7F9FC',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    maxWidth: 420,
    width: '100%',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1CB0F6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});

