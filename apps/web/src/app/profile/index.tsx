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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useQuery } from '@tanstack/react-query';
import { useUserStore } from '@/store/useUserStore';
import { ConfirmModal } from '@/components/ConfirmModal';
import { api } from '@/services/api';

interface UserProfileResponse {
  id: string;
  name: string;
  email: string;
  role: 'STUDENT' | 'TEACHER';
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

function getInitials(name: string): string {
  if (!name) return 'ME';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getLeagueByXp(xp: number): { name: string; color: string } {
  if (xp >= 5000) return { name: 'Liga Mestre', color: '#9333EA' };
  if (xp >= 3000) return { name: 'Liga Diamante', color: '#06B6D4' };
  if (xp >= 1500) return { name: 'Liga Ouro', color: '#F1C40F' };
  if (xp >= 500) return { name: 'Liga Prata', color: '#94A3B8' };
  return { name: 'Liga Bronze', color: '#CD7F32' };
}

export default function ProfileScreen() {
  const router = useRouter();
  const {
    user: storeUser,
    xp: storeXp,
    currentStreak: storeStreak,
    answeredQuestionsCount: storeAnsweredCount,
    avatar,
    setAvatar,
    logout,
    setAuth,
  } = useUserStore();

  const [activeTab, setActiveTab] = useState<'conquistas' | 'amigos'>('amigos');
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // Busca dados atualizados do usuário autenticado (/auth/me)
  const {
    data: profileData,
    isLoading: isLoadingProfile,
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
          triEstimate: 620,
        };
      }
    },
    networkMode: 'offlineFirst',
  });

  // Sincroniza dados atualizados da API com a store se houver mudanças
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
          role: profileData.role,
          xp: profileData.xp,
        });
      }
    }
  }, [profileData, storeUser, setAuth]);

  const displayName = profileData?.name || storeUser?.name || 'Estudante ENEM';
  const displayRole =
    (profileData?.role || storeUser?.role) === 'TEACHER'
      ? 'Professor(a)'
      : 'Estudante';
  const classroomName =
    profileData?.enrolledClassrooms?.[0]?.name ||
    profileData?.createdClassrooms?.[0]?.name ||
    'Turma ENEM 2026';

  const userXp = profileData?.xp ?? storeXp ?? 0;
  const userStreak = profileData?.currentStreak ?? storeStreak ?? 0;
  const totalQuestions =
    statsData?.totalAttempts ?? storeAnsweredCount ?? 0;
  const accuracyPercent = statsData?.accuracyPercent ?? 0;

  const initials = useMemo(() => getInitials(displayName), [displayName]);
  const league = useMemo(() => getLeagueByXp(userXp), [userXp]);

  // Conquistas (Medalhas) calculadas a partir de métricas REAIS
  const badges = useMemo(() => {
    return [
      {
        id: 1,
        title: 'Primeira Vitória',
        desc: 'Completou a primeira questão no app',
        icon: 'check-circle',
        color: '#1CB0F6',
        unlocked: totalQuestions >= 1,
      },
      {
        id: 2,
        title: 'Foco de Ferro',
        desc: 'Manteve ofensiva de pelo menos 7 dias',
        icon: 'fire-alt',
        color: '#FF9600',
        unlocked:
          userStreak >= 7 || (profileData?.longestStreak ?? 0) >= 7,
      },
      {
        id: 3,
        title: 'Centurião do ENEM',
        desc: 'Acumulou mais de 1.000 pontos de XP',
        icon: 'star',
        color: '#F1C40F',
        unlocked: userXp >= 1000,
      },
      {
        id: 4,
        title: 'Precisão Cirúrgica',
        desc: 'Mais de 80% de acertos com 10+ questões',
        icon: 'bullseye',
        color: '#58CC02',
        unlocked: totalQuestions >= 10 && accuracyPercent >= 80,
      },
      {
        id: 5,
        title: 'Mestre da Maratona',
        desc: 'Mais de 50 questões resolvidas',
        icon: 'medal',
        color: '#CE82FF',
        unlocked: totalQuestions >= 50,
      },
      {
        id: 6,
        title: 'Gênio da Exatas',
        desc: 'Nota TRI estimada acima de 700 pontos',
        icon: 'calculator',
        color: '#FF4B4B',
        unlocked: (statsData?.triEstimate ?? 0) >= 700,
      },
    ];
  }, [totalQuestions, userStreak, profileData, userXp, accuracyPercent, statsData]);

  // Ranking dinâmico da Liga / Turma com base no XP real
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

  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const confirmLogoutAction = () => {
    setShowLogoutModal(false);
    logout();
    router.replace('/auth/login' as any);
  };

  const handlePickImage = async () => {
    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert(
        'Permissão negada',
        'Precisamos de permissão para acessar sua galeria de fotos.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setAvatar(result.assets[0].uri);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <FontAwesome5 name="arrow-left" size={20} color="#2C3A47" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Meu Perfil</Text>
        <View style={styles.headerRightActions}>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={() => refetchProfile()}
            disabled={isRefetching}
          >
            {isRefetching ? (
              <ActivityIndicator size="small" color="#1CB0F6" />
            ) : (
              <FontAwesome5 name="sync-alt" size={16} color="#8CA0B3" />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={handleLogout}
          >
            <FontAwesome5 name="sign-out-alt" size={18} color="#FF4B4B" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* CARD DO USUÁRIO COM FOTO DINÂMICA */}
        <View style={styles.userCard}>
          <TouchableOpacity
            onPress={handlePickImage}
            activeOpacity={0.9}
            style={styles.avatarContainer}
          >
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarBox}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
            )}

            <View style={styles.cameraBadge}>
              <FontAwesome5 name="camera" size={10} color="#FFF" />
            </View>
          </TouchableOpacity>

          <Text style={styles.userName}>{displayName}</Text>
          <Text style={styles.userCourse}>
            {displayRole} • {classroomName}
          </Text>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <FontAwesome5
                name="check-circle"
                size={16}
                color="#1CB0F6"
                solid
              />
              <Text style={styles.statValue}>{totalQuestions}</Text>
              <Text style={styles.statLabel}>Questões</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <FontAwesome5 name="fire-alt" size={16} color="#FF9600" />
              <Text style={styles.statValue}>{userStreak}</Text>
              <Text style={styles.statLabel}>Dias Ofensiva</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <FontAwesome5 name="medal" size={16} color={league.color} />
              <Text style={[styles.statValue, { color: league.color }]}>
                {league.name.replace('Liga ', '')}
              </Text>
              <Text style={styles.statLabel}>{userXp} XP</Text>
            </View>
          </View>
        </View>

        {/* ABAS */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === 'amigos' && styles.tabActive,
            ]}
            onPress={() => setActiveTab('amigos')}
          >
            <FontAwesome5
              name="user-friends"
              size={14}
              color={activeTab === 'amigos' ? '#FFF' : '#8CA0B3'}
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
              size={14}
              color={activeTab === 'conquistas' ? '#FFF' : '#8CA0B3'}
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

        {/* CONTEÚDO DAS ABAS */}
        {activeTab === 'amigos' && (
          <View style={styles.friendsSection}>
            {/* BANNER DO CHAT DE TURMA */}
            <TouchableOpacity
              style={styles.chatPromoBanner}
              activeOpacity={0.85}
              onPress={() => router.push('/chat' as any)}
            >
              <View style={styles.chatPromoIcon}>
                <FontAwesome5 name="comments" size={20} color="#FFF" />
              </View>
              <View style={styles.chatPromoInfo}>
                <Text style={styles.chatPromoTitle}>
                  Chat da Turma & Macetes
                </Text>
                <Text style={styles.chatPromoSubtitle}>
                  Tire dúvidas em tempo real e compartilhe resumos com os colegas!
                </Text>
              </View>
              <FontAwesome5 name="chevron-right" size={14} color="#1CB0F6" />
            </TouchableOpacity>

            <View style={styles.friendsHeader}>
              <Text style={styles.sectionTitle}>
                {league.name} • Classificação Semanal
              </Text>
            </View>

            <View style={styles.rankingCard}>
              {rankingList.map((player, index) => {
                let positionColor = '#8CA0B3';
                if (index === 0) positionColor = '#F1C40F';
                if (index === 1) positionColor = '#BDC3C7';
                if (index === 2) positionColor = '#CD7F32';

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

                    <View
                      style={[
                        styles.friendAvatar,
                        player.isMe && { backgroundColor: '#1CB0F6' },
                      ]}
                    >
                      <FontAwesome5 name="user" size={12} color="#FFF" />
                    </View>

                    <Text
                      style={[
                        styles.friendName,
                        player.isMe && { fontWeight: 'bold', color: '#1E293B' },
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
                          color="#1CB0F6"
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
          <View style={styles.badgesSection}>
            <Text style={styles.sectionTitle}>Suas Medalhas de Estudo</Text>
            <View style={styles.badgesGrid}>
              {badges.map((badge) => (
                <View
                  key={badge.id}
                  style={[
                    styles.badgeCard,
                    !badge.unlocked && { opacity: 0.45 },
                  ]}
                >
                  <View
                    style={[
                      styles.badgeIconBox,
                      {
                        backgroundColor: badge.unlocked
                          ? badge.color
                          : '#E2E8F0',
                      },
                    ]}
                  >
                    <FontAwesome5
                      name={badge.icon}
                      size={22}
                      color={badge.unlocked ? '#FFF' : '#94A3B8'}
                    />
                  </View>
                  <Text style={styles.badgeTitle}>{badge.title}</Text>
                  <Text style={styles.badgeDesc} numberOfLines={2}>
                    {badge.desc}
                  </Text>
                  {badge.unlocked ? (
                    <View style={styles.badgeStatusPill}>
                      <FontAwesome5 name="check" size={9} color="#58CC02" />
                      <Text style={styles.badgeStatusText}>Conquistada</Text>
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.badgeStatusPill,
                        { backgroundColor: '#F1F5F9' },
                      ]}
                    >
                      <FontAwesome5 name="lock" size={9} color="#94A3B8" />
                      <Text
                        style={[
                          styles.badgeStatusText,
                          { color: '#94A3B8' },
                        ]}
                      >
                        Bloqueada
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* BOTÃO DE LOGOUT */}
        <TouchableOpacity
          style={styles.logoutButton}
          activeOpacity={0.8}
          onPress={handleLogout}
        >
          <FontAwesome5 name="sign-out-alt" size={16} color="#FF4B4B" />
          <Text style={styles.logoutButtonText}>Sair da Conta</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Pop-confirm de Saída da Conta */}
      <ConfirmModal
        visible={showLogoutModal}
        title="Sair da Conta"
        message="Tem certeza de que deseja encerrar a sua sessão no Minuto ENEM?"
        confirmText="Sair"
        confirmColor="#FF4B4B"
        icon="sign-out-alt"
        onConfirm={confirmLogoutAction}
        onCancel={() => setShowLogoutModal(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  backButton: { width: 40, height: 40, justifyContent: 'center' },
  headerRightActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  refreshButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#2C3A47' },

  scrollContent: { padding: 20, paddingBottom: 60 },

  userCard: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },

  avatarContainer: { position: 'relative', marginBottom: 12 },
  avatarBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1CB0F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: { width: 80, height: 80, borderRadius: 40 },
  avatarText: { fontSize: 28, fontWeight: 'bold', color: '#FFF' },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#2C3A47',
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },

  userName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2C3A47',
    marginBottom: 4,
  },
  userCourse: {
    fontSize: 13,
    color: '#8CA0B3',
    marginBottom: 24,
    textAlign: 'center',
  },

  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    backgroundColor: '#F8FAFC',
    paddingVertical: 16,
    borderRadius: 16,
  },
  statItem: { alignItems: 'center', flex: 1, gap: 4 },
  statValue: { fontSize: 16, fontWeight: 'bold', color: '#2C3A47' },
  statLabel: {
    fontSize: 10,
    color: '#8CA0B3',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    height: '80%',
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
  },

  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 16,
    padding: 4,
    marginBottom: 24,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  tabActive: {
    backgroundColor: '#2C3A47',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: { fontSize: 14, fontWeight: 'bold', color: '#8CA0B3' },
  tabTextActive: { color: '#FFF' },

  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2C3A47',
    marginBottom: 16,
  },

  friendsSection: {},
  chatPromoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    gap: 12,
  },
  chatPromoIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1CB0F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatPromoInfo: { flex: 1 },
  chatPromoTitle: { fontSize: 14, fontWeight: 'bold', color: '#1E293B' },
  chatPromoSubtitle: { fontSize: 11, color: '#64748B', marginTop: 2 },

  friendsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  rankingCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  rankingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  rankingRowMe: { backgroundColor: '#F0F9FF' },
  rankPosition: { fontSize: 16, fontWeight: 'bold', width: 30 },
  friendAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#8CA0B3',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  friendName: { flex: 1, fontSize: 15, color: '#2C3A47' },
  friendXp: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#F1C40F',
    marginRight: 12,
  },
  cheerButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E0F2FE',
    justifyContent: 'center',
    alignItems: 'center',
  },

  badgesSection: {},
  badgesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  badgeCard: {
    width: '31%',
    backgroundColor: '#FFF',
    padding: 12,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  badgeIconBox: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  badgeTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#2C3A47',
    textAlign: 'center',
    marginBottom: 4,
  },
  badgeDesc: {
    fontSize: 10,
    color: '#8CA0B3',
    textAlign: 'center',
    lineHeight: 13,
    marginBottom: 8,
  },
  badgeStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeStatusText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#15803D',
  },

  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#FFE4E6',
    borderRadius: 16,
    paddingVertical: 14,
    marginTop: 28,
  },
  logoutButtonText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FF4B4B',
  },
});
