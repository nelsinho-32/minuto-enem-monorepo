import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Href, useRouter } from "expo-router";
import { FontAwesome5 } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { safeAsyncStorage as AsyncStorage } from "@/services/safeStorage";
import { api } from "@/services/api";
import { useUserStore } from "@/store/useUserStore";
import { WeeklyStreakCalendar } from "@/components/WeeklyStreakCalendar";
import { CreateRoomButton } from "@/components/CreateRoomButton";
import { useClassroomStore } from "@/store/useClassroomStore";
import { SchoolMuralCard } from "@/components/SchoolMuralCard";
import { ElasticSearchBar } from "@/components/ElasticSearchBar";
import { NotificationsModal } from "@/components/NotificationsModal";
import {
  getSubjectVisualTheme as getSubjectTheme,
  type EnemAreaFilter as AreaFilter,
} from "@/constants/theme";
import { useTheme , useThemedStyles } from "@/hooks/use-theme";

type HomeTab = "INICIO" | "MATERIAS" | "TURMA";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export default function HomeScreen() {
  const styles = useThemedStyles(baseStyles);
  const router = useRouter();
  const theme = useTheme();
  const {
    user,
    currentStreak,
    iceFreezes,
    avatar,
    targetCourse,
    validateStreakOnLogin,
    getWeekDays,
  } = useUserStore();

  const [activeTab, setActiveTab] = useState<HomeTab>("INICIO");
  const [areaFilter, setAreaFilter] = useState<AreaFilter>("TODAS");
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(2);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  const classrooms = useClassroomStore((state) => state.classrooms);
  const joinClassroomByCode = useClassroomStore(
    (state) => state.joinClassroomByCode
  );
  const fetchClassrooms = useClassroomStore((state) => state.fetchClassrooms);

  useEffect(() => {
    validateStreakOnLogin();
    if (user?.id) {
      useClassroomStore.getState().setUserId(user.id);
      fetchClassrooms();
    } else {
      useClassroomStore.getState().clearClassrooms();
    }
  }, [validateStreakOnLogin, fetchClassrooms, user?.id]);

  const weekDays = getWeekDays();

  // 1. Matérias reais da API (Offline-First)
  const { data: remoteSubjects = [] } = useQuery<any[]>({
    queryKey: ["subjects"],
    networkMode: "offlineFirst",
    queryFn: async () => {
      try {
        const res = await api.get<any[]>("/subjects");
        if (Array.isArray(res) && res.length > 0) {
          await AsyncStorage.setItem(
            "@minuto_enem:subjects_cache_v1",
            JSON.stringify(res)
          );
          return res;
        }
      } catch {}
      const cached = await AsyncStorage.getItem(
        "@minuto_enem:subjects_cache_v1"
      );
      return cached ? JSON.parse(cached) : [];
    },
  });

  // 2. Estatísticas do Aluno
  const { data: userStats } = useQuery<any>({
    queryKey: ["user-stats", user?.id],
    networkMode: "offlineFirst",
    queryFn: async () => {
      try {
        return await api.get("/streak/stats");
      } catch {
        return null;
      }
    },
  });

  // 3. Tarefas do Aluno
  const { data: remoteTasks = [] } = useQuery<any[]>({
    queryKey: ["tasks", user?.id],
    networkMode: "offlineFirst",
    queryFn: async () => {
      try {
        return await api.get<any[]>("/tasks");
      } catch {
        return [];
      }
    },
  });

  // 4. Comunicados da Escola
  const { data: remoteAnnouncements = [] } = useQuery<any[]>({
    queryKey: ["announcements-home", user?.id],
    networkMode: "offlineFirst",
    queryFn: async () => {
      try {
        const res = await api.get<any[]>("/announcements");
        return Array.isArray(res) ? res : [];
      } catch {
        return [];
      }
    },
  });

  const pendingTasks = remoteTasks.filter(
    (t) => t.status !== "COMPLETED"
  ).length;
  const overdueTasks = remoteTasks.filter(
    (t) =>
      t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "COMPLETED"
  ).length;

  const difficultySubject =
    userStats?.weakestTopics?.[0]?.topic ||
    userStats?.topicsWithHighestError?.[0]?.subject ||
    "Matemática";

  const firstName = (user?.name || "Estudante").trim().split(/\s+/)[0];

  const formattedSubjects = useMemo(() => {
    return remoteSubjects.map((s: any) => {
      const theme = getSubjectTheme(s.slug || "", s.name || "");
      return {
        id: s.slug || s.id,
        name: s.name,
        icon: theme.icon,
        color: theme.color,
        area: theme.area,
        lessonsCount: Array.isArray(s.lessons)
          ? s.lessons.length
          : s._count?.lessons ?? 0,
      };
    });
  }, [remoteSubjects]);

  const visibleSubjects = useMemo(() => {
    if (areaFilter === "TODAS") return formattedSubjects;
    return formattedSubjects.filter((s) => s.area === areaFilter);
  }, [formattedSubjects, areaFilter]);

  const handleJoinClassroom = async () => {
    const clean = joinCodeInput.trim().toUpperCase();
    if (!clean) {
      setJoinError("Digite o código da turma fornecido pelo professor.");
      return;
    }
    setIsJoining(true);
    setJoinError(null);
    try {
      await joinClassroomByCode(clean);
      setJoinCodeInput("");
      setShowJoinModal(false);
    } catch (err: any) {
      setJoinError(
        err?.message || "Código inválido ou turma não encontrada."
      );
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
      edges={["top", "left", "right"]}
    >
      {/* ======================================================== */}
      {/* 1. CABEÇALHO LIMPO E MODERNO                             */}
      {/* ======================================================== */}
      <View
        style={[
          styles.header,
          { backgroundColor: theme.surface, borderBottomColor: theme.border },
        ]}
      >
        <View style={styles.headerLeft}>
          <Image
            source={require("@/assets/images/name-logo.png")}
            style={styles.headerNameLogo}
            resizeMode="contain"
          />
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={[
              styles.headerIconButton,
              { backgroundColor: theme.surfaceMuted },
              showSearch && styles.headerIconButtonActive,
            ]}
            activeOpacity={0.7}
            onPress={() => {
              setShowSearch((prev) => !prev);
              setShowNotifications(false);
            }}
          >
            <FontAwesome5
              name="search"
              size={15}
              color={showSearch ? "#0284C7" : theme.textSecondary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.headerIconButton,
              { backgroundColor: theme.surfaceMuted },
            ]}
            activeOpacity={0.7}
            onPress={theme.toggleDarkMode}
            accessibilityLabel={
              theme.isDark ? "Mudar para modo claro" : "Mudar para modo escuro"
            }
          >
            <FontAwesome5
              name={theme.isDark ? "sun" : "moon"}
              size={15}
              color={theme.isDark ? "#F59E0B" : theme.textSecondary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.headerIconButton,
              { backgroundColor: theme.surfaceMuted },
              showNotifications && styles.headerIconButtonActive,
            ]}
            activeOpacity={0.7}
            onPress={() => {
              setShowNotifications(true);
              setShowSearch(false);
            }}
          >
            <FontAwesome5
              name="bell"
              size={16}
              color={showNotifications ? "#0284C7" : theme.textSecondary}
            />
            {unreadNotificationsCount > 0 && (
              <View style={styles.notificationDot} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.profileButton}
            activeOpacity={0.8}
            onPress={() => router.push("/profile" as any)}
          >
            {avatar ? (
              <Image
                source={{ uri: avatar }}
                style={styles.headerAvatarImage}
              />
            ) : (
              <View style={styles.headerAvatarPlaceholder}>
                <FontAwesome5 name="user" size={13} color="#FFF" />
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* BARRA DE PESQUISA ELÁSTICA EXPANSÍVEL */}
      {showSearch && (
        <ElasticSearchBar
          query={searchQuery}
          onChangeQuery={setSearchQuery}
          userId={user?.id}
          localSubjects={remoteSubjects}
          localTasks={remoteTasks}
          localClassrooms={classrooms}
          autoFocus
        />
      )}

      {/* CENTRAL DE NOTIFICAÇÕES */}
      <NotificationsModal
        visible={showNotifications}
        onClose={() => setShowNotifications(false)}
        tasks={remoteTasks}
        announcements={remoteAnnouncements}
        difficultySubject={difficultySubject}
        currentStreak={currentStreak}
        onUnreadCountChange={setUnreadNotificationsCount}
      />

      {/* ======================================================== */}
      {/* CONTEÚDO PRINCIPAL POR ABA                               */}
      {/* ======================================================== */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ====================================================== */}
        {/* ABA 1: INÍCIO (ADAPTADO POR ROLE: ALUNO / PROF / ESCOLA)*/}
        {/* ====================================================== */}
        {activeTab === "INICIO" && (
          <>
            {/* HERO DIFERENCIADO POR ROLE PARA EVITAR CONFUSÃO */}
            {user?.role === "SCHOOL" ? (
              <View style={[styles.heroBanner, { backgroundColor: "#1E3A8A" }]}>
                <View style={styles.heroTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.greetingText}>
                      {getGreeting()}, {firstName}! 🏫
                    </Text>
                    <Text style={styles.heroTitle}>
                      Direção Escolar — Gestão e Resultados
                    </Text>
                  </View>
                </View>
                <Text style={styles.heroSubtitle}>
                  Acompanhe turmas, professores, simulados institucionais e retenção de alunos.
                </Text>
                <View style={styles.heroActionsRow}>
                  <TouchableOpacity
                    style={styles.heroPrimaryBtn}
                    activeOpacity={0.85}
                    onPress={() => router.push("/school/dashboard" as any)}
                  >
                    <FontAwesome5 name="school" size={12} color="#1E3A8A" />
                    <Text style={[styles.heroPrimaryBtnText, { color: "#1E3A8A" }]}>
                      Painel da Direção
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.heroSecondaryBtn}
                    activeOpacity={0.85}
                    onPress={() => router.push("/school/operations" as any)}
                  >
                    <Text style={styles.heroSecondaryBtnText}>Simulados & Alertas</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : user?.role === "TEACHER" ? (
              <View style={[styles.heroBanner, { backgroundColor: "#5B21B6" }]}>
                <View style={styles.heroTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.greetingText}>
                      {getGreeting()}, Prof. {firstName}! 👩‍🏫
                    </Text>
                    <Text style={styles.heroTitle}>
                      Área Docente — Turmas, Listas e Redações
                    </Text>
                  </View>
                </View>
                <Text style={styles.heroSubtitle}>
                  Corrija redações da Oficina Nota 1000, crie questões autorais e acompanhe suas turmas.
                </Text>
                <View style={styles.heroActionsRow}>
                  <TouchableOpacity
                    style={styles.heroPrimaryBtn}
                    activeOpacity={0.85}
                    onPress={() => router.push("/teacher/essays" as any)}
                  >
                    <FontAwesome5 name="pen-fancy" size={12} color="#5B21B6" />
                    <Text style={[styles.heroPrimaryBtnText, { color: "#5B21B6" }]}>
                      Corrigir Redações
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.heroSecondaryBtn}
                    activeOpacity={0.85}
                    onPress={() => router.push("/classes/calendar" as any)}
                  >
                    <Text style={styles.heroSecondaryBtnText}>Agenda de Entregas</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.heroBanner}>
                <View style={styles.heroTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.greetingText}>
                      {getGreeting()}, {firstName}! 👋
                    </Text>
                    <Text style={styles.heroTitle}>
                      Pronto para avançar rumo a {targetCourse || "sua aprovação"}?
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.streakPill}
                    onPress={() => router.push("/streak")}
                    activeOpacity={0.8}
                  >
                    <FontAwesome5 name="fire-alt" size={14} color="#EA580C" />
                    <Text style={styles.streakPillText}>{currentStreak}d</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.heroSubtitle}>
                  Foco recomendado hoje:{" "}
                  <Text style={{ fontWeight: "800", color: "#FFFFFF" }}>
                    {difficultySubject}
                  </Text>
                </Text>

                <View style={styles.heroActionsRow}>
                  <TouchableOpacity
                    style={styles.heroPrimaryBtn}
                    activeOpacity={0.85}
                    onPress={() =>
                      router.push({
                        pathname: "/quiz",
                        params: {
                          mode: "pratica",
                          subject: difficultySubject,
                        },
                      } as any)
                    }
                  >
                    <FontAwesome5 name="play" size={12} color="#0284C7" />
                    <Text style={styles.heroPrimaryBtnText}>
                      Continuar Estudando
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.heroSecondaryBtn}
                    activeOpacity={0.85}
                    onPress={() => setActiveTab("MATERIAS")}
                  >
                    <Text style={styles.heroSecondaryBtnText}>Ver Matérias</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Painéis B2B (Somente para ADMIN / SCHOOL / TEACHER) */}
            {user?.role === "ADMIN" && (
              <TouchableOpacity
                style={[styles.b2bCard, { borderColor: "#C4B5FD", backgroundColor: "#F5F3FF" }]}
                activeOpacity={0.85}
                onPress={() => router.push("/admin/schools" as any)}
              >
                <View style={[styles.b2bIconBox, { backgroundColor: "#7C3AED" }]}>
                  <FontAwesome5 name="shield-alt" size={16} color="#FFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.b2bTitle, { color: "#5B21B6" }]}>
                    Painel do Administrador (Escolas)
                  </Text>
                  <Text style={styles.b2bSub}>
                    Cadastre e gerencie instituições parceiras.
                  </Text>
                </View>
                <FontAwesome5 name="chevron-right" size={13} color="#7C3AED" />
              </TouchableOpacity>
            )}

            {user?.role === "SCHOOL" && (
              <TouchableOpacity
                style={[styles.b2bCard, { borderColor: "#BAE6FD", backgroundColor: "#F0F9FF" }]}
                activeOpacity={0.85}
                onPress={() => router.push("/school/operations" as any)}
              >
                <View style={[styles.b2bIconBox, { backgroundColor: "#0284C7" }]}>
                  <FontAwesome5 name="users-cog" size={15} color="#FFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.b2bTitle, { color: "#0369A1" }]}>
                    Simulados Unificados, Importação & Alertas de Evasão
                  </Text>
                  <Text style={styles.b2bSub}>
                    Agende simulados para toda a escola, importe alunos/professores e monitore retenção.
                  </Text>
                </View>
                <FontAwesome5 name="chevron-right" size={13} color="#0284C7" />
              </TouchableOpacity>
            )}

            {user?.role === "TEACHER" && (
              <TouchableOpacity
                style={[styles.b2bCard, { borderColor: "#BBF7D0", backgroundColor: "#F0FDF4" }]}
                activeOpacity={0.85}
                onPress={() => router.push("/classes/teacher-tracking" as any)}
              >
                <View style={[styles.b2bIconBox, { backgroundColor: "#16A34A" }]}>
                  <FontAwesome5 name="chart-bar" size={15} color="#FFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.b2bTitle, { color: "#15803D" }]}>
                    Acompanhamento de Listas e Desempenho
                  </Text>
                  <Text style={styles.b2bSub}>
                    Veja quem entregou cada lista, taxa de acertos e tempo médio por aluno.
                  </Text>
                </View>
                <FontAwesome5 name="chevron-right" size={13} color="#16A34A" />
              </TouchableOpacity>
            )}

            {(user?.role === "TEACHER" || user?.role === "STUDENT") && (
              <TouchableOpacity
                style={[
                  styles.b2bCard,
                  {
                    borderColor: theme.isDark ? "#4C1D95" : "#DDD6FE",
                    backgroundColor: theme.isDark ? "#1E293B" : "#F5F3FF",
                  },
                ]}
                activeOpacity={0.85}
                onPress={() => router.push("/classes/calendar" as any)}
              >
                <View style={[styles.b2bIconBox, { backgroundColor: "#7C3AED" }]}>
                  <FontAwesome5 name="calendar-alt" size={15} color="#FFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.b2bTitle,
                      { color: theme.isDark ? "#C4B5FD" : "#5B21B6" },
                    ]}
                  >
                    Agenda Unificada de Entregas
                  </Text>
                  <Text style={[styles.b2bSub, { color: theme.textMuted }]}>
                    {user?.role === "TEACHER"
                      ? "Veja prazos e entregas de todas as suas turmas em ordem cronológica."
                      : "Acompanhe listas pendentes, prazos de hoje e tarefas entregues."}
                  </Text>
                </View>
                <FontAwesome5 name="chevron-right" size={13} color="#7C3AED" />
              </TouchableOpacity>
            )}

            {/* Atalhos exclusivos do ESTUDANTE */}
            {user?.role !== "SCHOOL" && user?.role !== "TEACHER" && (
              <>
                <TouchableOpacity
                  style={[
                    styles.b2bCard,
                    {
                      borderColor: theme.isDark ? "#14532D" : "#BBF7D0",
                      backgroundColor: theme.isDark ? "#1E293B" : "#F0FDF4",
                    },
                  ]}
                  activeOpacity={0.85}
                  onPress={() => router.push("/study-plan" as any)}
                >
                  <View style={[styles.b2bIconBox, { backgroundColor: "#16A34A" }]}>
                    <FontAwesome5 name="calendar-check" size={16} color="#FFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.b2bTitle,
                        { color: theme.isDark ? "#4ADE80" : "#15803D" },
                      ]}
                    >
                      Cronograma Semanal Adaptativo
                    </Text>
                    <Text style={[styles.b2bSub, { color: theme.textMuted }]}>
                      Plano personalizado focado nas suas matérias de maior atenção (+20 XP/bloco).
                    </Text>
                  </View>
                  <FontAwesome5 name="chevron-right" size={13} color="#16A34A" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.b2bCard,
                    {
                      borderColor: theme.isDark ? "#1E3A8A" : "#BAE6FD",
                      backgroundColor: theme.isDark ? "#1E293B" : "#F0F9FF",
                    },
                  ]}
                  activeOpacity={0.85}
                  onPress={() => router.push("/simulado" as any)}
                >
                  <View style={[styles.b2bIconBox, { backgroundColor: "#0284C7" }]}>
                    <FontAwesome5 name="stopwatch" size={16} color="#FFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.b2bTitle,
                        { color: theme.isDark ? "#38BDF8" : "#0369A1" },
                      ]}
                    >
                      Simulado Oficial ENEM + Simulador SISU
                    </Text>
                    <Text style={[styles.b2bSub, { color: theme.textMuted }]}>
                      Prova cronometrada (Dia 1, Dia 2 ou Express), cartão-resposta e nota TRI.
                    </Text>
                  </View>
                  <FontAwesome5 name="chevron-right" size={13} color={theme.tint} />
                </TouchableOpacity>
              </>
            )}

            {/* Mural de Avisos e Notícias (Lista de tamanho fixo para todas as roles) */}
            <View style={{ marginBottom: 16 }}>
              <SchoolMuralCard />
            </View>

            {/* Calendário de Ofensiva Compacto (apenas Aluno/Admin) */}
            {user?.role !== "SCHOOL" && user?.role !== "TEACHER" && (
              <View style={styles.sectionBlock}>
                <WeeklyStreakCalendar
                  compact
                  currentStreak={currentStreak}
                  iceFreezes={iceFreezes}
                  weekDays={weekDays}
                  onPress={() => router.push("/streak")}
                />
              </View>
            )}

            {/* Pendências da Turma (apenas Aluno) vs Gestão Rápida (Escola/Professor) */}
            {user?.role !== "SCHOOL" && user?.role !== "TEACHER" && (
              <>
              <View style={styles.sectionBlock}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Resumo do Dia</Text>
                <TouchableOpacity onPress={() => setActiveTab("TURMA")}>
                  <Text style={styles.sectionLink}>Ir para Turma</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.summaryRow}>
                <TouchableOpacity
                  style={styles.summaryMiniCard}
                  activeOpacity={0.8}
                  onPress={() => router.push("/classes/tasks" as any)}
                >
                  <View style={[styles.summaryIcon, { backgroundColor: "#E0F2FE" }]}>
                    <FontAwesome5 name="tasks" size={14} color="#0284C7" />
                  </View>
                  <Text style={styles.summaryValue}>{pendingTasks}</Text>
                  <Text style={styles.summaryLabel}>Para fazer</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.summaryMiniCard}
                  activeOpacity={0.8}
                  onPress={() => router.push("/classes/tasks" as any)}
                >
                  <View style={[styles.summaryIcon, { backgroundColor: "#FEF3C7" }]}>
                    <FontAwesome5 name="clock" size={14} color="#D97706" />
                  </View>
                  <Text style={[styles.summaryValue, overdueTasks > 0 && { color: "#DC2626" }]}>
                    {overdueTasks}
                  </Text>
                  <Text style={styles.summaryLabel}>Atrasadas</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.summaryMiniCard}
                  activeOpacity={0.8}
                  onPress={() => router.push("/chat" as any)}
                >
                  <View style={[styles.summaryIcon, { backgroundColor: "#DCFCE7" }]}>
                    <FontAwesome5 name="comments" size={14} color="#16A34A" />
                  </View>
                  <Text style={styles.summaryValue}>{classrooms.length}</Text>
                  <Text style={styles.summaryLabel}>Chats/Turmas</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Acesso Rápido: Modos de Estudo (Grade 2x2 Limpa) */}
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionTitle}>Modos de Estudo</Text>
              <View style={styles.quickGrid}>
                <TouchableOpacity
                  style={styles.quickGridCard}
                  activeOpacity={0.85}
                  onPress={() =>
                    router.push({
                      pathname: "/quiz",
                      params: { mode: "simulado" },
                    } as any)
                  }
                >
                  <View style={[styles.quickGridIcon, { backgroundColor: "#E0F2FE" }]}>
                    <FontAwesome5 name="stopwatch" size={18} color="#0284C7" />
                  </View>
                  <Text style={styles.quickGridTitle}>Simulado ENEM</Text>
                  <Text style={styles.quickGridSub}>Questões oficiais com TRI</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.quickGridCard}
                  activeOpacity={0.85}
                  onPress={() => router.push("/stats/errors" as any)}
                >
                  <View style={[styles.quickGridIcon, { backgroundColor: "#DCFCE7" }]}>
                    <FontAwesome5 name="redo-alt" size={17} color="#16A34A" />
                  </View>
                  <Text style={styles.quickGridTitle}>Revisão Inteligente</Text>
                  <Text style={styles.quickGridSub}>Foque onde mais errou</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.quickGridCard}
                  activeOpacity={0.85}
                  onPress={() => router.push("/challenge" as any)}
                >
                  <View style={[styles.quickGridIcon, { backgroundColor: "#FFEDD5" }]}>
                    <FontAwesome5 name="bolt" size={18} color="#EA580C" />
                  </View>
                  <Text style={styles.quickGridTitle}>Duelo 1v1</Text>
                  <Text style={styles.quickGridSub}>Desafie colegas ao vivo</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.quickGridCard}
                  activeOpacity={0.85}
                  onPress={() => router.push("/notes" as any)}
                >
                  <View style={[styles.quickGridIcon, { backgroundColor: "#FEF3C7" }]}>
                    <FontAwesome5 name="book" size={17} color="#D97706" />
                  </View>
                  <Text style={styles.quickGridTitle}>Meu Caderno</Text>
                  <Text style={styles.quickGridSub}>Resumos e macetes</Text>
                </TouchableOpacity>
              </View>
            </View>
            </>
            )}

            {/* Atalho Compacto de Chats & Fórum Opcional */}
            <TouchableOpacity
              style={styles.chatCompactCard}
              activeOpacity={0.85}
              onPress={() => router.push("/chat" as any)}
            >
              <View style={styles.chatCompactIcon}>
                <FontAwesome5 name="user-friends" size={16} color="#0284C7" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.chatCompactTitle}>
                  Chats com Colegas, Professores & Escola
                </Text>
                <Text style={styles.chatCompactSub}>
                  Tire dúvidas no privado, na turma ou acesse o Fórum opcional
                </Text>
              </View>
              <FontAwesome5 name="chevron-right" size={13} color="#0284C7" />
            </TouchableOpacity>
          </>
        )}

        {/* ====================================================== */}
        {/* ABA 2: MATÉRIAS DO ENEM (14 DISCIPLINAS + FILTRO ÁREA) */}
        {/* ====================================================== */}
        {activeTab === "MATERIAS" && (
          <View style={styles.sectionBlock}>
            <Text style={styles.tabPageTitle}>Matérias do ENEM</Text>
            <Text style={styles.tabPageSub}>
              Escolha uma disciplina para assistir videoaulas, ler resumos e praticar questões oficiais.
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.areaChipsRow}
            >
              {[
                { key: "TODAS" as AreaFilter, label: "Todas" },
                { key: "LINGUAGENS" as AreaFilter, label: "Linguagens & Redação" },
                { key: "HUMANAS" as AreaFilter, label: "Humanas" },
                { key: "NATUREZA" as AreaFilter, label: "Natureza" },
                { key: "MATEMATICA" as AreaFilter, label: "Matemática" },
              ].map((chip) => {
                const active = areaFilter === chip.key;
                return (
                  <TouchableOpacity
                    key={chip.key}
                    style={[styles.areaChip, active && styles.areaChipActive]}
                    onPress={() => setAreaFilter(chip.key)}
                  >
                    <Text
                      style={[
                        styles.areaChipText,
                        active && styles.areaChipTextActive,
                      ]}
                    >
                      {chip.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.subjectsGrid}>
              {visibleSubjects.map((subject) => (
                <TouchableOpacity
                  key={subject.id}
                  style={styles.subjectCard}
                  activeOpacity={0.85}
                  onPress={() =>
                    router.push(`/subject/${subject.id}` as Href)
                  }
                >
                  <View
                    style={[
                      styles.subjectIconCircle,
                      { backgroundColor: `${subject.color}18` },
                    ]}
                  >
                    <FontAwesome5
                      name={subject.icon}
                      size={20}
                      color={subject.color}
                    />
                  </View>
                  <Text style={styles.subjectCardTitle} numberOfLines={2}>
                    {subject.name}
                  </Text>
                  <Text style={styles.subjectCardMeta}>
                    {subject.lessonsCount > 0
                      ? `${subject.lessonsCount} aulas + vídeos`
                      : "Aulas & Questões"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ====================================================== */}
        {/* ABA 3: MINHA TURMA & MURAL DA ESCOLA                   */}
        {/* ====================================================== */}
        {activeTab === "TURMA" && (
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={styles.tabPageTitle}>Minha Turma</Text>
                <Text style={styles.tabPageSub}>
                  Aulas dos professores, listas de exercícios e comunicados da escola.
                </Text>
              </View>
            </View>

            {/* Mural Institucional da Escola */}
            <View style={{ marginBottom: 16 }}>
              <SchoolMuralCard />
            </View>

            {/* Ação: Criar Turma (Professor), Gerenciar Turmas (Escola) ou Entrar com Código (Aluno) */}
            <View style={{ marginBottom: 14 }}>
              {user?.role === "TEACHER" ? (
                <CreateRoomButton />
              ) : user?.role === "SCHOOL" ? (
                <TouchableOpacity
                  style={styles.joinCodeTriggerBtn}
                  onPress={() => router.push("/school/dashboard" as any)}
                  activeOpacity={0.85}
                >
                  <FontAwesome5 name="school" size={13} color="#0284C7" />
                  <Text style={styles.joinCodeTriggerText}>
                    Gerenciar Turmas e Professores da Escola
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.joinCodeTriggerBtn}
                  onPress={() => setShowJoinModal((prev) => !prev)}
                  activeOpacity={0.85}
                >
                  <FontAwesome5 name="key" size={13} color="#0284C7" />
                  <Text style={styles.joinCodeTriggerText}>
                    Entrar em uma Turma com Código
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {showJoinModal && (
              <View style={styles.joinBox}>
                <TextInput
                  style={styles.joinInput}
                  placeholder="Ex.: ENEM-2026"
                  placeholderTextColor="#94A3B8"
                  value={joinCodeInput}
                  onChangeText={setJoinCodeInput}
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  style={styles.joinConfirmBtn}
                  onPress={handleJoinClassroom}
                  disabled={isJoining}
                >
                  {isJoining ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.joinConfirmBtnText}>Entrar</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
            {joinError && <Text style={styles.joinErrorText}>{joinError}</Text>}

            {/* Lista de Turmas */}
            {classrooms.length === 0 ? (
              <View style={styles.emptyClassroomCard}>
                <FontAwesome5
                  name="chalkboard"
                  size={28}
                  color="#94A3B8"
                  style={{ marginBottom: 10 }}
                />
                <Text style={styles.emptyClassroomTitle}>
                  Nenhuma turma vinculada ainda
                </Text>
                <Text style={styles.emptyClassroomSub}>
                  {user?.role === "TEACHER"
                    ? "Crie sua primeira turma acima para compartilhar aulas e listas."
                    : "Peça o código da turma ao seu professor para acompanhar listas e materiais."}
                </Text>
              </View>
            ) : (
              <View style={{ gap: 10, marginBottom: 18 }}>
                {classrooms.map((room) => (
                  <TouchableOpacity
                    key={room.id}
                    style={styles.classroomCard}
                    activeOpacity={0.85}
                    onPress={() => router.push(`/classes/${room.id}` as any)}
                  >
                    <View
                      style={[
                        styles.classroomIconBox,
                        { backgroundColor: `${room.themeColor || "#16A34A"}18` },
                      ]}
                    >
                      <FontAwesome5
                        name="graduation-cap"
                        size={18}
                        color={room.themeColor || "#16A34A"}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.classroomName}>{room.name}</Text>
                      <Text style={styles.classroomMeta}>
                        Prof. {room.teacherName || "Docente"} • Código: {room.code}
                      </Text>
                    </View>
                    <FontAwesome5
                      name="chevron-right"
                      size={13}
                      color="#94A3B8"
                    />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Atalhos rápidos da Turma */}
            <View style={styles.quickGrid}>
              <TouchableOpacity
                style={styles.quickGridCard}
                onPress={() => router.push("/classes/tasks" as any)}
              >
                <View style={[styles.quickGridIcon, { backgroundColor: "#E0F2FE" }]}>
                  <FontAwesome5 name="clipboard-list" size={17} color="#0284C7" />
                </View>
                <Text style={styles.quickGridTitle}>Tarefas & Listas</Text>
                <Text style={styles.quickGridSub}>
                  {pendingTasks} pendente(s)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickGridCard}
                onPress={() => router.push("/classes/materials" as any)}
              >
                <View style={[styles.quickGridIcon, { backgroundColor: "#F3E8FF" }]}>
                  <FontAwesome5 name="folder-open" size={17} color="#7C3AED" />
                </View>
                <Text style={styles.quickGridTitle}>Materiais</Text>
                <Text style={styles.quickGridSub}>PDFs e videoaulas</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ======================================================== */}
      {/* BARRA DE NAVEGAÇÃO INFERIOR (PADRÃO DE MERCADO)          */}
      {/* ======================================================== */}
      <View
        style={[
          styles.bottomTabBar,
          { backgroundColor: theme.surface, borderTopColor: theme.border },
        ]}
      >
        <TouchableOpacity
          style={styles.bottomTabItem}
          onPress={() => setActiveTab("INICIO")}
          activeOpacity={0.8}
        >
          <FontAwesome5
            name="home"
            size={18}
            color={activeTab === "INICIO" ? "#0284C7" : "#94A3B8"}
          />
          <Text
            style={[
              styles.bottomTabLabel,
              activeTab === "INICIO" && styles.bottomTabLabelActive,
            ]}
          >
            Início
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.bottomTabItem}
          onPress={() => setActiveTab("MATERIAS")}
          activeOpacity={0.8}
        >
          <FontAwesome5
            name="book-open"
            size={18}
            color={activeTab === "MATERIAS" ? "#0284C7" : "#94A3B8"}
          />
          <Text
            style={[
              styles.bottomTabLabel,
              activeTab === "MATERIAS" && styles.bottomTabLabelActive,
            ]}
          >
            Matérias
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.bottomTabItem}
          onPress={() => setActiveTab("TURMA")}
          activeOpacity={0.8}
        >
          <FontAwesome5
            name="graduation-cap"
            size={18}
            color={activeTab === "TURMA" ? "#0284C7" : "#94A3B8"}
          />
          <Text
            style={[
              styles.bottomTabLabel,
              activeTab === "TURMA" && styles.bottomTabLabelActive,
            ]}
          >
            Turma
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.bottomTabItem}
          onPress={() => router.push("/chat" as any)}
          activeOpacity={0.8}
        >
          <FontAwesome5 name="comments" size={18} color="#94A3B8" />
          <Text style={styles.bottomTabLabel}>Chats</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.bottomTabItem}
          onPress={() => router.push("/profile" as any)}
          activeOpacity={0.8}
        >
          <FontAwesome5 name="user-circle" size={18} color="#94A3B8" />
          <Text style={styles.bottomTabLabel}>Perfil</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const baseStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  headerLeft: { flexDirection: "row", alignItems: "center" },
  headerNameLogo: { width: 132, height: 34 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  headerIconButtonActive: { backgroundColor: "#E0F2FE" },
  notificationDot: {
    position: "absolute",
    top: 8,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  profileButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#0284C7",
  },
  headerAvatarImage: { width: "100%", height: "100%" },
  headerAvatarPlaceholder: {
    flex: 1,
    backgroundColor: "#0284C7",
    alignItems: "center",
    justifyContent: "center",
  },

  scrollContent: {
    padding: 18,
    paddingBottom: 32,
    maxWidth: 900,
    width: "100%",
    alignSelf: "center",
  },

  /* HERO BANNER */
  heroBanner: {
    backgroundColor: "#0284C7",
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#0284C7",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 6,
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 8,
  },
  greetingText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#BAE6FD",
    marginBottom: 2,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#FFFFFF",
    lineHeight: 26,
  },
  streakPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 16,
  },
  streakPillText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#EA580C",
  },
  heroSubtitle: {
    fontSize: 13,
    color: "#E0F2FE",
    marginBottom: 16,
  },
  heroActionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  heroPrimaryBtn: {
    flex: 1.4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    paddingVertical: 12,
    borderRadius: 14,
  },
  heroPrimaryBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0284C7",
  },
  heroSecondaryBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingVertical: 12,
    borderRadius: 14,
  },
  heroSecondaryBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  b2bCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  b2bIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  b2bTitle: { fontSize: 14, fontWeight: "800" },
  b2bSub: { fontSize: 12, color: "#64748B", marginTop: 1 },

  sectionBlock: { marginBottom: 18 },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 10,
  },
  sectionLink: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0284C7",
    marginBottom: 10,
  },

  summaryRow: {
    flexDirection: "row",
    gap: 10,
  },
  summaryMiniCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  summaryIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0F172A",
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
    marginTop: 1,
  },

  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
  },
  quickGridCard: {
    width: "48.3%",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 15,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  quickGridIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  quickGridTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 2,
  },
  quickGridSub: {
    fontSize: 11,
    color: "#64748B",
  },

  chatCompactCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#BAE6FD",
  },
  chatCompactIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#E0F2FE",
    alignItems: "center",
    justifyContent: "center",
  },
  chatCompactTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
  },
  chatCompactSub: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 1,
  },

  /* ABA MATÉRIAS */
  tabPageTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0F172A",
    marginBottom: 4,
  },
  tabPageSub: {
    fontSize: 13,
    color: "#64748B",
    marginBottom: 14,
    lineHeight: 19,
  },
  areaChipsRow: {
    gap: 8,
    paddingBottom: 14,
  },
  areaChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  areaChipActive: {
    backgroundColor: "#0284C7",
    borderColor: "#0284C7",
  },
  areaChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  areaChipTextActive: {
    color: "#FFFFFF",
  },
  subjectsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
  },
  subjectCard: {
    width: "48.3%",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  subjectIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  subjectCardTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 3,
  },
  subjectCardMeta: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
  },

  /* ABA TURMA */
  joinCodeTriggerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#E0F2FE",
    paddingVertical: 12,
    borderRadius: 14,
  },
  joinCodeTriggerText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0284C7",
  },
  joinBox: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  joinInput: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  joinConfirmBtn: {
    backgroundColor: "#0284C7",
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  joinConfirmBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 },
  joinErrorText: {
    fontSize: 12,
    color: "#DC2626",
    marginBottom: 10,
    fontWeight: "600",
  },
  emptyClassroomCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 16,
  },
  emptyClassroomTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 4,
  },
  emptyClassroomSub: {
    fontSize: 12,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 18,
  },
  classroomCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  classroomIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  classroomName: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  classroomMeta: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },

  /* BOTTOM TAB BAR */
  bottomTabBar: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 18 : 10,
    paddingHorizontal: 6,
  },
  bottomTabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  bottomTabLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
  },
  bottomTabLabelActive: {
    color: "#0284C7",
    fontWeight: "800",
  },
});
