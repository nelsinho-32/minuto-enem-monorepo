import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useQuery } from '@tanstack/react-query';
import { safeAsyncStorage as AsyncStorage } from '@/services/safeStorage';
import { useUserStore } from '@/store/useUserStore';
import { useOfflineQueueStore } from '@/store/useOfflineQueueStore';
import { ConfirmModal } from '@/components/ConfirmModal';
import { api } from '@/services/api';
import { useTheme, type ThemePreference , useThemedStyles } from '@/hooks/use-theme';
import {
  downloadOfflineStudyPack,
  getOfflinePackMetadata,
  clearOfflineStudyPack,
  type OfflinePackMetadata,
} from '@/services/offlinePack';

interface UserProfileResponse {
  id: string;
  name: string;
  email: string;
  role: 'STUDENT' | 'TEACHER' | 'SCHOOL' | 'ADMIN';
  xp: number;
  currentStreak: number;
  longestStreak: number;
  iceFreezes: number;
  lastStudyDate: string | null;
  enrolledClassrooms?: Array<{
    id: string;
    name: string;
    code: string;
    teacher?: { id: string; name: string };
  }>;
  createdClassrooms?: Array<{
    id: string;
    name: string;
    code: string;
  }>;
}

interface UserStatsResponse {
  totalAttempts: number;
  totalCorrect: number;
  accuracyPercent: number;
  triEstimate: number;
}

const POPULAR_COURSES = [
  'Medicina',
  'Direito',
  'Engenharia de Software',
  'Ciência da Computação',
  'Psicologia',
  'Engenharia Civil',
  'Arquitetura e Urbanismo',
  'Administração',
  'Odontologia',
  'Enfermagem',
];

function getInitials(name: string): string {
  if (!name) return 'ME';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getLeagueByXp(xp: number): { name: string; color: string; bg: string } {
  if (xp >= 5000) return { name: 'Liga Mestre', color: '#9333EA', bg: '#F3E8FF' };
  if (xp >= 3000) return { name: 'Liga Diamante', color: '#0284C7', bg: '#E0F2FE' };
  if (xp >= 1500) return { name: 'Liga Ouro', color: '#D97706', bg: '#FEF3C7' };
  if (xp >= 500) return { name: 'Liga Prata', color: '#475569', bg: '#F1F5F9' };
  return { name: 'Liga Bronze', color: '#B45309', bg: '#FFEDD5' };
}

/**
 * Converte um asset do ImagePicker em Data URI (base64) persistente para que a foto
 * fique salva definitivamente no banco local (mesmo após fechar o app ou recarregar no navegador).
 */
async function assetToPersistentDataUri(
  asset: ImagePicker.ImagePickerAsset
): Promise<string> {
  if (asset.base64) {
    const mime = asset.mimeType || 'image/jpeg';
    return `data:${mime};base64,${asset.base64}`;
  }

  if (Platform.OS === 'web' && asset.uri) {
    try {
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') resolve(reader.result);
          else reject(new Error('Falha ao converter imagem'));
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return asset.uri;
    }
  }

  return asset.uri;
}

export default function ProfileScreen() {
  const styles = useThemedStyles(baseStyles);
  const router = useRouter();
  const {
    user: storeUser,
    userId,
    xp: storeXp,
    currentStreak: storeStreak,
    answeredQuestionsCount: storeAnsweredCount,
    avatar,
    targetCourse,
    targetScore,
    bio,
    setAvatar,
    setProfileMeta,
    logout,
    setAuth,
  } = useUserStore();

  const [activeTab, setActiveTab] = useState<'conquistas' | 'amigos'>('amigos');
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [isSavingPhoto, setIsSavingPhoto] = useState(false);

  // Modal de edição de meta e curso do ENEM
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [draftCourse, setDraftCourse] = useState(targetCourse || 'Medicina');
  const [draftScore, setDraftScore] = useState(String(targetScore || 780));
  const [draftBio, setDraftBio] = useState(bio || 'Focado na aprovação no ENEM!');

  // Tema opcional (Claro / Escuro / Sistema) + Pacote Offline
  const theme = useTheme();
  const offlineQueueCount = useOfflineQueueStore((s) => s.queue.length);
  const flushOfflineQueue = useOfflineQueueStore((s) => s.flushQueue);
  const [offlineMeta, setOfflineMeta] = useState<OfflinePackMetadata | null>(null);
  const [isDownloadingOffline, setIsDownloadingOffline] = useState(false);
  const [isSyncingOffline, setIsSyncingOffline] = useState(false);

  useEffect(() => {
    getOfflinePackMetadata().then(setOfflineMeta).catch(() => {});
  }, []);

  const handleDownloadOfflinePack = async () => {
    setIsDownloadingOffline(true);
    try {
      const meta = await downloadOfflineStudyPack(80);
      setOfflineMeta(meta);
      Alert.alert(
        'Pacote Offline Baixado!',
        `${meta.questionsCount} questões reais do ENEM e ${meta.subjectsCount} matérias (${meta.sizeKb} KB) estão prontas para estudo sem internet.`
      );
    } catch {
      Alert.alert(
        'Sem conexão',
        'Conecte-se à internet para baixar o pacote de estudo offline.'
      );
    } finally {
      setIsDownloadingOffline(false);
    }
  };

  const handleSyncOfflineNow = async () => {
    setIsSyncingOffline(true);
    try {
      const res = await flushOfflineQueue();
      if (res.syncedCount > 0) {
        Alert.alert(
          'Sincronizado!',
          `${res.syncedCount} atividade(s) offline foram sincronizadas com o servidor.`
        );
      } else {
        Alert.alert('Tudo em dia', 'Não há respostas pendentes de sincronização.');
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível sincronizar agora. Tente novamente mais tarde.');
    } finally {
      setIsSyncingOffline(false);
    }
  };

  const effectiveUserId = storeUser?.id || userId || 'default';
  const localAvatarKey = `@minuto_enem:local_avatar_${effectiveUserId}`;

  // Carrega a foto de perfil salva no banco local (AsyncStorage) ao abrir a tela
  useEffect(() => {
    AsyncStorage.getItem(localAvatarKey)
      .then((savedUri) => {
        if (savedUri && savedUri !== avatar) {
          setAvatar(savedUri);
        }
      })
      .catch(() => {});
  }, [localAvatarKey]);

  const persistAvatarLocally = async (dataUri: string | null) => {
    setAvatar(dataUri);
    try {
      if (dataUri) {
        await AsyncStorage.setItem(localAvatarKey, dataUri);
      } else {
        await AsyncStorage.removeItem(localAvatarKey);
      }
    } catch {}
  };

  // Busca dados atualizados do usuário autenticado (/auth/me)
  const {
    data: profileData,
    refetch: refetchProfile,
    isRefetching,
  } = useQuery<UserProfileResponse>({
    queryKey: ['user-me-profile'],
    queryFn: async () => {
      const res = await api.get<UserProfileResponse>('/auth/me');
      return res;
    },
    networkMode: 'offlineFirst',
  });

  // Busca estatísticas reais de resolução e TRI
  const { data: statsData } = useQuery<UserStatsResponse>({
    queryKey: ['user-stats-profile'],
    queryFn: async () => {
      try {
        const res = await api.get<UserStatsResponse>('/questions/stats');
        return res;
      } catch {
        return {
          totalAttempts: storeAnsweredCount,
          totalCorrect: Math.round(storeAnsweredCount * 0.75),
          accuracyPercent: 75,
          triEstimate: 640,
        };
      }
    },
    networkMode: 'offlineFirst',
  });

  useEffect(() => {
    if (profileData && storeUser) {
      if (
        profileData.name !== storeUser.name ||
        profileData.xp !== storeUser.xp
      ) {
        setAuth(useUserStore.getState().token || '', {
          ...storeUser,
          name: profileData.name,
          email: profileData.email,
          role: profileData.role as any,
          xp: profileData.xp,
        });
      }
    }
  }, [profileData, storeUser, setAuth]);

  const displayName = profileData?.name || storeUser?.name || 'Estudante ENEM';
  const displayEmail = profileData?.email || storeUser?.email || '';
  const rawRole = profileData?.role || storeUser?.role || 'STUDENT';
  const displayRole =
    rawRole === 'TEACHER'
      ? 'Professor(a)'
      : rawRole === 'SCHOOL'
      ? 'Gestão Escolar'
      : rawRole === 'ADMIN'
      ? 'Administrador'
      : 'Estudante ENEM';

  const classroomName =
    profileData?.enrolledClassrooms?.[0]?.name ||
    profileData?.createdClassrooms?.[0]?.name ||
    'Preparação ENEM 2026';

  const userXp = profileData?.xp ?? storeXp ?? 0;
  const userStreak = profileData?.currentStreak ?? storeStreak ?? 0;
  const totalQuestions = statsData?.totalAttempts ?? storeAnsweredCount ?? 0;
  const accuracyPercent = statsData?.accuracyPercent ?? 0;
  const triEstimate = Math.round(statsData?.triEstimate ?? 620);

  const initials = useMemo(() => getInitials(displayName), [displayName]);
  const league = useMemo(() => getLeagueByXp(userXp), [userXp]);

  const goalProgressPercent = useMemo(() => {
    const goal = Math.max(targetScore || 750, 400);
    return Math.min(100, Math.max(10, Math.round((triEstimate / goal) * 100)));
  }, [triEstimate, targetScore]);

  // Conquistas (Medalhas)
  const badges = useMemo(() => {
    return [
      {
        id: 1,
        title: 'Primeira Vitória',
        desc: 'Completou a primeira questão no app',
        icon: 'check-circle',
        color: '#0284C7',
        unlocked: totalQuestions >= 1,
      },
      {
        id: 2,
        title: 'Foco de Ferro',
        desc: 'Manteve ofensiva de pelo menos 7 dias',
        icon: 'fire-alt',
        color: '#EA580C',
        unlocked:
          userStreak >= 7 || (profileData?.longestStreak ?? 0) >= 7,
      },
      {
        id: 3,
        title: 'Centurião do ENEM',
        desc: 'Acumulou mais de 1.000 pontos de XP',
        icon: 'star',
        color: '#D97706',
        unlocked: userXp >= 1000,
      },
      {
        id: 4,
        title: 'Precisão Cirúrgica',
        desc: 'Mais de 80% de acertos com 10+ questões',
        icon: 'bullseye',
        color: '#16A34A',
        unlocked: totalQuestions >= 10 && accuracyPercent >= 80,
      },
      {
        id: 5,
        title: 'Mestre da Maratona',
        desc: 'Mais de 50 questões resolvidas',
        icon: 'medal',
        color: '#7C3AED',
        unlocked: totalQuestions >= 50,
      },
      {
        id: 6,
        title: 'Rumo à Nota 1000',
        desc: 'Nota TRI estimada acima de 700 pontos',
        icon: 'trophy',
        color: '#DC2626',
        unlocked: triEstimate >= 700,
      },
    ];
  }, [totalQuestions, userStreak, profileData, userXp, accuracyPercent, triEstimate]);

  const rankingList = useMemo(() => {
    const list = [
      { id: 'me', name: displayName, xp: userXp, isMe: true },
      { id: 'u2', name: 'Ana Beatriz Souza', xp: Math.max(1200, userXp + 150), isMe: false },
      { id: 'u3', name: 'Carlos Eduardo Lima', xp: Math.max(850, userXp - 120), isMe: false },
      { id: 'u4', name: 'Lucas Silva Santos', xp: Math.max(450, Math.floor(userXp * 0.6)), isMe: false },
      { id: 'u5', name: 'Mariana Oliveira', xp: Math.max(300, Math.floor(userXp * 0.4)), isMe: false },
    ];
    return list.sort((a, b) => b.xp - a.xp);
  }, [displayName, userXp]);

  const handlePickFromGallery = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Permissão Necessária',
          'Conceda acesso às suas fotos para escolher uma imagem de perfil.'
        );
        return;
      }

      setIsSavingPhoto(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.65,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const persistentUri = await assetToPersistentDataUri(result.assets[0]);
        await persistAvatarLocally(persistentUri);
        setShowPhotoModal(false);
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível selecionar a imagem da galeria.');
    } finally {
      setIsSavingPhoto(false);
    }
  };

  const handleTakeCameraPhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Permissão Necessária',
          'Conceda permissão à câmera para tirar sua foto de perfil.'
        );
        return;
      }

      setIsSavingPhoto(true);
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.65,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const persistentUri = await assetToPersistentDataUri(result.assets[0]);
        await persistAvatarLocally(persistentUri);
        setShowPhotoModal(false);
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível abrir a câmera.');
    } finally {
      setIsSavingPhoto(false);
    }
  };

  const handleRemovePhoto = async () => {
    await persistAvatarLocally(null);
    setShowPhotoModal(false);
  };

  const handleSaveGoals = () => {
    const parsedScore = Math.min(
      1000,
      Math.max(400, Number(draftScore) || 750)
    );
    setProfileMeta({
      targetCourse: draftCourse.trim() || 'Medicina',
      targetScore: parsedScore,
      bio: draftBio.trim() || 'Focado na aprovação no ENEM!',
    });
    setShowGoalModal(false);
  };

  const confirmLogoutAction = () => {
    setShowLogoutModal(false);
    logout();
    router.replace('/auth/login' as any);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* HEADER */}
      <View
        style={[
          styles.header,
          { backgroundColor: theme.surface, borderBottomColor: theme.border },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <FontAwesome5 name="arrow-left" size={18} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Meu Perfil</Text>
        <View style={styles.headerRightActions}>
          <TouchableOpacity
            style={styles.iconActionBtn}
            onPress={() => refetchProfile()}
            disabled={isRefetching}
          >
            {isRefetching ? (
              <ActivityIndicator size="small" color="#0284C7" />
            ) : (
              <FontAwesome5 name="sync-alt" size={14} color="#64748B" />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconActionBtn, { backgroundColor: '#FEF2F2' }]}
            onPress={() => setShowLogoutModal(true)}
          >
            <FontAwesome5 name="sign-out-alt" size={15} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. HERO CARD DO PERFIL COM FOTO SALVA LOCALMENTE */}
        <View
          style={[
            styles.heroCard,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <View style={styles.heroBannerBg} />

          <View style={styles.heroContent}>
            <TouchableOpacity
              onPress={() => setShowPhotoModal(true)}
              activeOpacity={0.85}
              style={styles.avatarContainer}
            >
              {avatar ? (
                <Image source={{ uri: avatar }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitials}>{initials}</Text>
                </View>
              )}
              <View style={styles.cameraBadge}>
                <FontAwesome5 name="camera" size={11} color="#FFF" />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.changePhotoLink}
              onPress={() => setShowPhotoModal(true)}
            >
              <Text style={styles.changePhotoLinkText}>
                {avatar ? 'Alterar foto do perfil' : 'Adicionar foto do perfil'}
              </Text>
            </TouchableOpacity>

            <Text style={styles.userName}>{displayName}</Text>
            {displayEmail ? (
              <Text style={styles.userEmail}>{displayEmail}</Text>
            ) : null}

            <View style={styles.roleAndLeagueRow}>
              <View style={styles.roleBadge}>
                <FontAwesome5 name="user-graduate" size={10} color="#0284C7" />
                <Text style={styles.roleBadgeText}>
                  {displayRole} • {classroomName}
                </Text>
              </View>

              <View
                style={[
                  styles.leagueBadge,
                  { backgroundColor: league.bg },
                ]}
              >
                <FontAwesome5 name="trophy" size={10} color={league.color} />
                <Text style={[styles.leagueBadgeText, { color: league.color }]}>
                  {league.name}
                </Text>
              </View>
            </View>

            {bio ? <Text style={styles.userBio}>"{bio}"</Text> : null}

            {/* GRADE DE MÉTRICAS DO PERFIL (4 COLUNAS) */}
            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <FontAwesome5 name="check-circle" size={15} color="#0284C7" />
                <Text style={styles.statValue}>{totalQuestions}</Text>
                <Text style={styles.statLabel}>Questões</Text>
              </View>

              <View style={styles.statBox}>
                <FontAwesome5 name="fire-alt" size={15} color="#EA580C" />
                <Text style={styles.statValue}>{userStreak}d</Text>
                <Text style={styles.statLabel}>Ofensiva</Text>
              </View>

              <View style={styles.statBox}>
                <FontAwesome5 name="star" size={15} color="#D97706" solid />
                <Text style={styles.statValue}>{userXp}</Text>
                <Text style={styles.statLabel}>XP Total</Text>
              </View>

              <View style={styles.statBox}>
                <FontAwesome5 name="chart-line" size={15} color="#16A34A" />
                <Text style={styles.statValue}>{triEstimate}</Text>
                <Text style={styles.statLabel}>Nota TRI</Text>
              </View>
            </View>
          </View>
        </View>

        {/* 1B. APARÊNCIA — MODO CLARO / ESCURO / SISTEMA (OPCIONAL) */}
        <View
          style={[
            styles.goalCard,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <View style={styles.goalHeaderRow}>
            <View style={styles.goalTitleGroup}>
              <View
                style={[
                  styles.goalIconBox,
                  { backgroundColor: theme.isDark ? '#1E3A8A' : '#E0F2FE' },
                ]}
              >
                <FontAwesome5
                  name={theme.isDark ? 'moon' : 'sun'}
                  size={15}
                  color={theme.isDark ? '#FBBF24' : '#0284C7'}
                />
              </View>
              <View>
                <Text style={[styles.goalCardTitle, { color: theme.text }]}>
                  Aparência do Aplicativo
                </Text>
                <Text style={[styles.goalCardSub, { color: theme.textMuted }]}>
                  Escolha entre modo claro, escuro ou automático do sistema
                </Text>
              </View>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            {(
              [
                { key: 'light', label: 'Claro', icon: 'sun' },
                { key: 'dark', label: 'Escuro', icon: 'moon' },
                { key: 'system', label: 'Sistema', icon: 'adjust' },
              ] as Array<{ key: ThemePreference; label: string; icon: string }>
            ).map((opt) => {
              const isActive = theme.themePreference === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => theme.setThemePreference(opt.key)}
                  activeOpacity={0.8}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    paddingVertical: 10,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: isActive ? theme.primary : theme.border,
                    backgroundColor: isActive
                      ? theme.isDark
                        ? '#0C4A6E'
                        : '#E0F2FE'
                      : theme.surfaceMuted,
                  }}
                >
                  <FontAwesome5
                    name={opt.icon}
                    size={13}
                    color={isActive ? theme.tint : theme.textMuted}
                  />
                  <Text
                    style={{
                      fontSize: 12.5,
                      fontWeight: '800',
                      color: isActive ? theme.tint : theme.textSecondary,
                    }}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 1C. MODO OFFLINE & SINCRONIZAÇÃO AUTOMÁTICA */}
        <View
          style={[
            styles.goalCard,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <View style={styles.goalHeaderRow}>
            <View style={styles.goalTitleGroup}>
              <View
                style={[
                  styles.goalIconBox,
                  { backgroundColor: theme.isDark ? '#064E3B' : '#DCFCE7' },
                ]}
              >
                <FontAwesome5 name="cloud-download-alt" size={15} color="#16A34A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.goalCardTitle, { color: theme.text }]}>
                  Estudo Offline & Sincronização
                </Text>
                <Text style={[styles.goalCardSub, { color: theme.textMuted }]}>
                  {offlineMeta
                    ? `${offlineMeta.questionsCount} questões salvas (${offlineMeta.sizeKb} KB) • ${offlineQueueCount} pendente(s)`
                    : `Baixe questões no Wi-Fi para estudar sem internet • ${offlineQueueCount} pendente(s)`}
                </Text>
              </View>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <TouchableOpacity
              onPress={handleDownloadOfflinePack}
              disabled={isDownloadingOffline}
              activeOpacity={0.85}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 10,
                borderRadius: 12,
                backgroundColor: theme.primary,
              }}
            >
              {isDownloadingOffline ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <FontAwesome5 name="download" size={12} color="#FFF" />
              )}
              <Text style={{ color: '#FFF', fontSize: 12.5, fontWeight: '800' }}>
                {offlineMeta ? 'Atualizar Pacote' : 'Baixar Pacote (80q)'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSyncOfflineNow}
              disabled={isSyncingOffline}
              activeOpacity={0.85}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.surfaceMuted,
              }}
            >
              {isSyncingOffline ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <FontAwesome5 name="sync-alt" size={12} color={theme.text} />
              )}
              <Text style={{ color: theme.text, fontSize: 12.5, fontWeight: '800' }}>
                Sincronizar
              </Text>
            </TouchableOpacity>

            {offlineMeta && (
              <TouchableOpacity
                onPress={async () => {
                  await clearOfflineStudyPack();
                  setOfflineMeta(null);
                }}
                style={{
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: theme.border,
                  backgroundColor: theme.surfaceMuted,
                }}
              >
                <FontAwesome5 name="trash-alt" size={12} color="#DC2626" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* 2. CARD: MEU OBJETIVO NO ENEM (CURSO & META DE NOTA) */}
        <View
          style={[
            styles.goalCard,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <View style={styles.goalHeaderRow}>
            <View style={styles.goalTitleGroup}>
              <View style={styles.goalIconBox}>
                <FontAwesome5 name="bullseye" size={15} color="#7C3AED" />
              </View>
              <View>
                <Text style={[styles.goalCardTitle, { color: theme.text }]}>
                  Foco ENEM: {targetCourse || 'Medicina'}
                </Text>
                <Text style={[styles.goalCardSub, { color: theme.textMuted }]}>
                  Meta TRI: {targetScore || 780} pts • Atual: {triEstimate} pts
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.editGoalBtn}
              onPress={() => {
                setDraftCourse(targetCourse || 'Medicina');
                setDraftScore(String(targetScore || 780));
                setDraftBio(bio || 'Focado na aprovação no ENEM!');
                setShowGoalModal(true);
              }}
            >
              <FontAwesome5 name="pen" size={10} color="#7C3AED" />
              <Text style={styles.editGoalBtnText}>Editar</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.goalProgressBarBg}>
            <View
              style={[
                styles.goalProgressBarFill,
                { width: `${goalProgressPercent}%` },
              ]}
            />
          </View>
          <Text style={styles.goalProgressHint}>
            Você já atingiu {goalProgressPercent}% da sua meta de nota TRI para{' '}
            {targetCourse || 'seu curso'}!
          </Text>
        </View>

        {/* 3. ATALHOS RÁPIDOS DE ESTUDO E CONVERSAS */}
        <View style={styles.quickShortcutsRow}>
          <TouchableOpacity
            style={styles.shortcutCard}
            activeOpacity={0.8}
            onPress={() => router.push('/chat' as any)}
          >
            <View style={[styles.shortcutIcon, { backgroundColor: '#E0F2FE' }]}>
              <FontAwesome5 name="comments" size={16} color="#0284C7" />
            </View>
            <Text style={styles.shortcutTitle}>Meus Chats</Text>
            <Text style={styles.shortcutSub}>Colegas & Profs</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.shortcutCard}
            activeOpacity={0.8}
            onPress={() => router.push('/notes' as any)}
          >
            <View style={[styles.shortcutIcon, { backgroundColor: '#FEF3C7' }]}>
              <FontAwesome5 name="book" size={16} color="#D97706" />
            </View>
            <Text style={styles.shortcutTitle}>Meu Caderno</Text>
            <Text style={styles.shortcutSub}>Resumos salvos</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.shortcutCard}
            activeOpacity={0.8}
            onPress={() => router.push('/stats/errors' as any)}
          >
            <View style={[styles.shortcutIcon, { backgroundColor: '#DCFCE7' }]}>
              <FontAwesome5 name="microscope" size={16} color="#16A34A" />
            </View>
            <Text style={styles.shortcutTitle}>Revisão</Text>
            <Text style={styles.shortcutSub}>Pontos de atenção</Text>
          </TouchableOpacity>
        </View>

        {/* 4. ABAS: RANKING DA LIGA & MEDALHAS */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === 'amigos' && styles.tabActive,
            ]}
            onPress={() => setActiveTab('amigos')}
          >
            <FontAwesome5
              name="trophy"
              size={13}
              color={activeTab === 'amigos' ? '#FFF' : '#64748B'}
              style={{ marginRight: 8 }}
            />
            <Text
              style={[
                styles.tabText,
                activeTab === 'amigos' && styles.tabTextActive,
              ]}
            >
              Ranking da Liga
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === 'conquistas' && styles.tabActive,
            ]}
            onPress={() => setActiveTab('conquistas')}
          >
            <FontAwesome5
              name="award"
              size={13}
              color={activeTab === 'conquistas' ? '#FFF' : '#64748B'}
              style={{ marginRight: 8 }}
            />
            <Text
              style={[
                styles.tabText,
                activeTab === 'conquistas' && styles.tabTextActive,
              ]}
            >
              Medalhas ({badges.filter((b) => b.unlocked).length}/{badges.length})
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'amigos' && (
          <View style={styles.friendsSection}>
            <View style={styles.friendsHeader}>
              <Text style={styles.sectionTitle}>
                {league.name} • Classificação Semanal
              </Text>
            </View>

            <View style={styles.rankingCard}>
              {rankingList.map((player, index) => {
                let positionColor = '#64748B';
                if (index === 0) positionColor = '#D97706';
                if (index === 1) positionColor = '#64748B';
                if (index === 2) positionColor = '#B45309';

                return (
                  <View
                    key={player.id}
                    style={[
                      styles.rankingRow,
                      player.isMe && styles.rankingRowMe,
                    ]}
                  >
                    <Text
                      style={[styles.rankPosition, { color: positionColor }]}
                    >
                      {index + 1}º
                    </Text>

                    {player.isMe && avatar ? (
                      <Image
                        source={{ uri: avatar }}
                        style={styles.friendAvatarImg}
                      />
                    ) : (
                      <View
                        style={[
                          styles.friendAvatar,
                          player.isMe && { backgroundColor: '#0284C7' },
                        ]}
                      >
                        <FontAwesome5 name="user" size={12} color="#FFF" />
                      </View>
                    )}

                    <Text
                      style={[
                        styles.friendName,
                        player.isMe && {
                          fontWeight: '800',
                          color: '#0F172A',
                        },
                      ]}
                    >
                      {player.name} {player.isMe && '(Você)'}
                    </Text>

                    <Text style={styles.friendXp}>{player.xp} XP</Text>

                    {!player.isMe && (
                      <TouchableOpacity
                        style={styles.cheerButton}
                        onPress={() => router.push('/chat' as any)}
                      >
                        <FontAwesome5
                          name="comment-dots"
                          size={14}
                          color="#0284C7"
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {activeTab === 'conquistas' && (
          <View style={styles.badgesGrid}>
            {badges.map((badge) => (
              <View
                key={badge.id}
                style={[
                  styles.badgeCard,
                  !badge.unlocked && styles.badgeLocked,
                ]}
              >
                <View
                  style={[
                    styles.badgeIconCircle,
                    {
                      backgroundColor: badge.unlocked
                        ? badge.color
                        : '#CBD5E1',
                    },
                  ]}
                >
                  <FontAwesome5 name={badge.icon} size={22} color="#FFF" />
                </View>
                <Text style={styles.badgeTitle}>{badge.title}</Text>
                <Text style={styles.badgeDesc}>{badge.desc}</Text>
                <View
                  style={[
                    styles.badgeStatusPill,
                    {
                      backgroundColor: badge.unlocked
                        ? '#DCFCE7'
                        : '#F1F5F9',
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '800',
                      color: badge.unlocked ? '#16A34A' : '#64748B',
                    }}
                  >
                    {badge.unlocked ? 'DESBLOQUEADA' : 'EM PROGRESSO'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* MODAL: FOTO DO PERFIL (SALVA NO BANCO LOCAL) */}
      <Modal
        visible={showPhotoModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPhotoModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Foto do Perfil</Text>
              <TouchableOpacity onPress={() => setShowPhotoModal(false)}>
                <FontAwesome5 name="times" size={16} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.photoPreviewCenter}>
              {avatar ? (
                <Image
                  source={{ uri: avatar }}
                  style={styles.modalAvatarPreview}
                />
              ) : (
                <View style={styles.modalAvatarFallback}>
                  <Text style={styles.modalAvatarInitials}>{initials}</Text>
                </View>
              )}
              <Text style={styles.photoModalSub}>
                Sua foto fica salva diretamente no banco local do seu dispositivo.
              </Text>
            </View>

            {isSavingPhoto ? (
              <ActivityIndicator
                size="large"
                color="#0284C7"
                style={{ marginVertical: 20 }}
              />
            ) : (
              <View style={styles.photoOptionsGroup}>
                <TouchableOpacity
                  style={styles.photoOptionBtnPrimary}
                  onPress={handlePickFromGallery}
                  activeOpacity={0.85}
                >
                  <FontAwesome5 name="images" size={15} color="#FFF" />
                  <Text style={styles.photoOptionBtnPrimaryText}>
                    Escolher Foto da Galeria
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.photoOptionBtnSecondary}
                  onPress={handleTakeCameraPhoto}
                  activeOpacity={0.85}
                >
                  <FontAwesome5 name="camera" size={15} color="#0284C7" />
                  <Text style={styles.photoOptionBtnSecondaryText}>
                    Tirar Foto com a Câmera
                  </Text>
                </TouchableOpacity>

                {avatar && (
                  <TouchableOpacity
                    style={styles.photoOptionBtnDanger}
                    onPress={handleRemovePhoto}
                    activeOpacity={0.85}
                  >
                    <FontAwesome5 name="trash-alt" size={14} color="#DC2626" />
                    <Text style={styles.photoOptionBtnDangerText}>
                      Remover Foto Atual
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* MODAL: EDITAR OBJETIVO E META DO ENEM */}
      <Modal
        visible={showGoalModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGoalModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Meu Objetivo no ENEM</Text>
              <TouchableOpacity onPress={() => setShowGoalModal(false)}>
                <FontAwesome5 name="times" size={16} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Curso Pretendido</Text>
            <TextInput
              style={styles.textInput}
              value={draftCourse}
              onChangeText={setDraftCourse}
              placeholder="Ex.: Medicina, Direito, Engenharia..."
              placeholderTextColor="#94A3B8"
            />

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 6, marginBottom: 14 }}
            >
              {POPULAR_COURSES.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[
                    styles.courseChip,
                    draftCourse === c && styles.courseChipActive,
                  ]}
                  onPress={() => setDraftCourse(c)}
                >
                  <Text
                    style={[
                      styles.courseChipText,
                      draftCourse === c && { color: '#FFFFFF' },
                    ]}
                  >
                    {c}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.inputLabel}>Meta de Nota TRI (400 a 1000)</Text>
            <TextInput
              style={styles.textInput}
              value={draftScore}
              onChangeText={setDraftScore}
              keyboardType="numeric"
              placeholder="Ex.: 780"
              placeholderTextColor="#94A3B8"
            />

            <Text style={styles.inputLabel}>Frase / Bio de Estudos</Text>
            <TextInput
              style={styles.textInput}
              value={draftBio}
              onChangeText={setDraftBio}
              placeholder="Sua frase de motivação..."
              placeholderTextColor="#94A3B8"
            />

            <TouchableOpacity
              style={styles.saveGoalBtn}
              onPress={handleSaveGoals}
              activeOpacity={0.85}
            >
              <FontAwesome5 name="check" size={13} color="#FFF" />
              <Text style={styles.saveGoalBtnText}>Salvar Objetivo</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ConfirmModal
        visible={showLogoutModal}
        title="Sair da Conta"
        message="Tem certeza que deseja encerrar a sessão e voltar para a tela de login?"
        confirmText="Sair"
        cancelText="Cancelar"
        onConfirm={confirmLogoutAction}
        onCancel={() => setShowLogoutModal(false)}
      />
    </SafeAreaView>
  );
}

const baseStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconActionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },

  scrollContent: { padding: 16, paddingBottom: 44 },

  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  heroBannerBg: {
    height: 68,
    backgroundColor: '#0284C7',
  },
  heroContent: {
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingBottom: 20,
    marginTop: -46,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 6,
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    backgroundColor: '#E2E8F0',
  },
  avatarFallback: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#FFFFFF',
  },
  avatarInitials: { fontSize: 32, fontWeight: '900', color: '#FFF' },
  cameraBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: '#0284C7',
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2.5,
    borderColor: '#FFF',
  },
  changePhotoLink: {
    paddingVertical: 4,
    marginBottom: 4,
  },
  changePhotoLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284C7',
  },
  userName: {
    fontSize: 21,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  userEmail: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  roleAndLeagueRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0369A1',
  },
  leagueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  leagueBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  userBio: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#475569',
    marginTop: 10,
    textAlign: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    width: '100%',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 8,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statValue: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 4,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 1,
  },

  goalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  goalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  goalTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  goalIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  goalCardSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  editGoalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  editGoalBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#7C3AED',
  },
  goalProgressBarBg: {
    height: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  goalProgressBarFill: {
    height: '100%',
    backgroundColor: '#7C3AED',
    borderRadius: 4,
  },
  goalProgressHint: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },

  quickShortcutsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  shortcutCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  shortcutIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  shortcutTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  shortcutSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },

  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 11,
  },
  tabActive: {
    backgroundColor: '#0284C7',
  },
  tabText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  tabTextActive: { color: '#FFF', fontWeight: '800' },

  friendsSection: { flex: 1 },
  friendsHeader: {
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  rankingCard: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  rankingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
    borderRadius: 12,
  },
  rankingRowMe: {
    backgroundColor: '#F0F9FF',
  },
  rankPosition: { width: 28, fontSize: 14, fontWeight: '900' },
  friendAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#94A3B8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  friendAvatarImg: {
    width: 34,
    height: 34,
    borderRadius: 17,
    marginRight: 10,
  },
  friendName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  friendXp: {
    fontSize: 13,
    fontWeight: '800',
    color: '#D97706',
    marginRight: 12,
  },
  cheerButton: {
    backgroundColor: '#E0F2FE',
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },

  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  badgeCard: {
    width: '48%',
    backgroundColor: '#FFF',
    padding: 14,
    borderRadius: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  badgeLocked: { opacity: 0.65, backgroundColor: '#F8FAFC' },
  badgeIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  badgeTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 3,
  },
  badgeDesc: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 15,
    marginBottom: 8,
  },
  badgeStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  photoPreviewCenter: {
    alignItems: 'center',
    marginBottom: 18,
  },
  modalAvatarPreview: {
    width: 110,
    height: 110,
    borderRadius: 55,
    marginBottom: 10,
    backgroundColor: '#E2E8F0',
  },
  modalAvatarFallback: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  modalAvatarInitials: {
    fontSize: 36,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  photoModalSub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
  photoOptionsGroup: {
    gap: 10,
  },
  photoOptionBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0284C7',
    paddingVertical: 13,
    borderRadius: 14,
  },
  photoOptionBtnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  photoOptionBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#E0F2FE',
    paddingVertical: 13,
    borderRadius: 14,
  },
  photoOptionBtnSecondaryText: {
    color: '#0284C7',
    fontSize: 14,
    fontWeight: '800',
  },
  photoOptionBtnDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    paddingVertical: 12,
    borderRadius: 14,
  },
  photoOptionBtnDangerText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '700',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    marginBottom: 12,
  },
  courseChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
  },
  courseChipActive: {
    backgroundColor: '#7C3AED',
  },
  courseChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  saveGoalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#7C3AED',
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 6,
  },
  saveGoalBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
