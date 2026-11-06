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

function getSubjectTheme(slug: string, name: string) {
  const lower = (slug + " " + name).toLowerCase();
  if (lower.includes("matem")) return { icon: "calculator", color: "#1CB0F6" };
  if (lower.includes("portug") || lower.includes("língua"))
    return { icon: "book-open", color: "#FF4B4B" };
  if (lower.includes("literat")) return { icon: "book", color: "#FF4B4B" };
  if (lower.includes("arte")) return { icon: "palette", color: "#FF4B4B" };
  if (lower.includes("ingl") || lower.includes("espanh") || lower.includes("idiom"))
    return { icon: "globe", color: "#FF4B4B" };
  if (lower.includes("físic") && lower.includes("educ"))
    return { icon: "running", color: "#FF4B4B" };
  if (lower.includes("histór")) return { icon: "landmark", color: "#FF9600" };
  if (lower.includes("geograf")) return { icon: "map", color: "#FF9600" };
  if (lower.includes("filosof")) return { icon: "brain", color: "#FF9600" };
  if (lower.includes("sociolog")) return { icon: "users", color: "#FF9600" };
  if (lower.includes("biolog")) return { icon: "leaf", color: "#58CC02" };
  if (lower.includes("químic")) return { icon: "flask", color: "#58CC02" };
  if (lower.includes("físic")) return { icon: "atom", color: "#58CC02" };
  return { icon: "graduation-cap", color: "#1CB0F6" };
}

export default function HomeScreen() {
  const router = useRouter();
  const {
    user,
    currentStreak,
    iceFreezes,
    avatar,
    validateStreakOnLogin,
    getWeekDays,
  } = useUserStore();

  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);

  const classrooms = useClassroomStore((state) => state.classrooms);
  const joinClassroomByCode = useClassroomStore((state) => state.joinClassroomByCode);
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

  // 1. Busca Matérias reais da API com suporte Offline-First
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
      const cached = await AsyncStorage.getItem("@minuto_enem:subjects_cache_v1");
      return cached ? JSON.parse(cached) : [];
    },
  });

  // 2. Busca Estatísticas Reais do Aluno da API
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

  // 3. Busca Tarefas Reais do Aluno
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

  const pendingTasks = remoteTasks.filter((t) => t.status !== "COMPLETED").length;
  const overdueTasks = remoteTasks.filter(
    (t) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "COMPLETED"
  ).length;

  const difficultySubject =
    userStats?.weakestTopics?.[0]?.topic ||
    userStats?.topicsWithHighestError?.[0]?.subject ||
    "Matemática";

  const muralSummary = {
    pendingTasks,
    overdueTasks,
    difficultySubject,
  };

  const formattedSubjects = useMemo(() => {
    return remoteSubjects.map((s: any) => {
      const theme = getSubjectTheme(s.slug || "", s.name || "");
      return {
        id: s.slug || s.id,
        name: s.name,
        icon: theme.icon,
        color: theme.color,
      };
    });
  }, [remoteSubjects]);

  const filteredSubjects = searchQuery.trim()
    ? formattedSubjects.filter((s) =>
        s.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
      )
    : formattedSubjects;

  return (
    <SafeAreaView style={styles.container}>
      {/* 1. HEADER */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image
            source={require("@/assets/images/name-logo.png")}
            style={styles.headerNameLogo}
            resizeMode="contain"
          />
        </View>

        <View style={styles.headerRight}>
          {/* Botão de Pesquisa */}
          <TouchableOpacity
            style={[
              styles.headerIconButton,
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
              size={16}
              color={showSearch ? "#1CB0F6" : "#2C3A47"}
            />
          </TouchableOpacity>

          {/* Botão de Notificação */}
          <TouchableOpacity
            style={[
              styles.headerIconButton,
              showNotifications && styles.headerIconButtonActive,
            ]}
            activeOpacity={0.7}
            onPress={() => {
              setShowNotifications((prev) => !prev);
              setShowSearch(false);
            }}
          >
            <FontAwesome5
              name="bell"
              size={17}
              color={showNotifications ? "#1CB0F6" : "#2C3A47"}
            />
            <View style={styles.notificationDot} />
          </TouchableOpacity>

          {/* Atalho para o Perfil com Foto Dinâmica */}
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
                <FontAwesome5 name="user" size={14} color="#FFF" />
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Barra de Pesquisa Expansível */}
      {showSearch && (
        <View style={styles.searchBarContainer}>
          <FontAwesome5 name="search" size={14} color="#8CA0B3" />
          <TextInput
            style={styles.searchInput}
            placeholder="Pesquisar matéria do ENEM..."
            placeholderTextColor="#8CA0B3"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <FontAwesome5 name="times-circle" size={16} color="#8CA0B3" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Painel Rápido de Notificações */}
      {showNotifications && (
        <View style={styles.notificationsDropdown}>
          <Text style={styles.notificationsTitle}>Notificações</Text>
          <TouchableOpacity
            style={styles.notificationItem}
            onPress={() => {
              setShowNotifications(false);
              router.push("/classes/tasks" as any);
            }}
          >
            <FontAwesome5 name="exclamation-circle" size={14} color="#FF4B4B" />
            <Text style={styles.notificationText}>
              Você tem {muralSummary.overdueTasks} atividade atrasada e{" "}
              {muralSummary.pendingTasks} para fazer.
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.notificationItem}
            onPress={() => {
              setShowNotifications(false);
              router.push("/stats/errors");
            }}
          >
            <FontAwesome5 name="microscope" size={14} color="#1CB0F6" />
            <Text style={styles.notificationText}>
              Recomendação: revisar erros de {muralSummary.difficultySubject}.
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 2. OFENSIVA COMPACTA + MURAL LADO A LADO */}
        <View style={styles.topOverviewRow}>
          <WeeklyStreakCalendar
            compact
            currentStreak={currentStreak}
            iceFreezes={iceFreezes}
            weekDays={weekDays}
            onPress={() => router.push("/streak")}
          />

          {/* MURAL DE ATIVIDADES E DIFICULDADES */}
          <View style={styles.muralCard}>
            <View style={styles.muralHeader}>
              <FontAwesome5 name="clipboard-list" size={14} color="#1CB0F6" />
              <Text style={styles.muralTitle}>Mural</Text>
            </View>

            <View style={styles.muralList}>
              {/* Atividades para fazer */}
              <TouchableOpacity
                style={styles.muralItem}
                activeOpacity={0.7}
                onPress={() => router.push("/classes/tasks" as any)}
              >
                <View
                  style={[styles.muralBadgeIcon, { backgroundColor: "#E0F2FE" }]}
                >
                  <FontAwesome5 name="tasks" size={11} color="#1CB0F6" />
                </View>
                <View style={styles.muralItemTexts}>
                  <Text style={styles.muralItemValue}>
                    {muralSummary.pendingTasks} para fazer
                  </Text>
                  <Text style={styles.muralItemLabel}>Atividades no prazo</Text>
                </View>
              </TouchableOpacity>

              {/* Atividades atrasadas */}
              <TouchableOpacity
                style={styles.muralItem}
                activeOpacity={0.7}
                onPress={() => router.push("/classes/tasks" as any)}
              >
                <View
                  style={[styles.muralBadgeIcon, { backgroundColor: "#FFF0D4" }]}
                >
                  <FontAwesome5
                    name="exclamation-circle"
                    size={11}
                    color="#FF9600"
                  />
                </View>
                <View style={styles.muralItemTexts}>
                  <Text style={[styles.muralItemValue, { color: "#D97706" }]}>
                    {muralSummary.overdueTasks} atrasada
                  </Text>
                  <Text style={styles.muralItemLabel}>Prazo encerrado</Text>
                </View>
              </TouchableOpacity>

              {/* Onde está com dificuldades */}
              <TouchableOpacity
                style={styles.muralItem}
                activeOpacity={0.7}
                onPress={() => router.push("/stats/errors")}
              >
                <View
                  style={[styles.muralBadgeIcon, { backgroundColor: "#FFE4E6" }]}
                >
                  <FontAwesome5
                    name="exclamation-triangle"
                    size={10}
                    color="#FF4B4B"
                  />
                </View>
                <View style={styles.muralItemTexts}>
                  <Text
                    style={[styles.muralItemValue, { color: "#FF4B4B" }]}
                    numberOfLines={1}
                  >
                    {muralSummary.difficultySubject}
                  </Text>
                  <Text style={styles.muralItemLabel}>Maior dificuldade</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ========================================== */}
        {/* SEÇÃO B2B: PAINÉIS DE GESTÃO / ADMINISTRAÇÃO */}
        {/* ========================================== */}
        {user?.role === "ADMIN" && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.adminBanner}
              activeOpacity={0.85}
              onPress={() => router.push("/admin/schools" as any)}
            >
              <View style={styles.adminBannerIcon}>
                <FontAwesome5 name="shield-alt" size={18} color="#9333EA" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.adminBannerTitle}>Painel Geral do Administrador</Text>
                <Text style={styles.adminBannerSubtitle}>
                  Gerenciar escolas parceiras, status de ativação e gestores escolares.
                </Text>
              </View>
              <FontAwesome5 name="chevron-right" size={14} color="#9333EA" />
            </TouchableOpacity>
          </View>
        )}

        {user?.role === "SCHOOL" && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.schoolBanner}
              activeOpacity={0.85}
              onPress={() => router.push("/school/dashboard" as any)}
            >
              <View style={styles.schoolBannerIcon}>
                <FontAwesome5 name="school" size={18} color="#0284C7" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.schoolBannerTitle}>Dashboard da Escola</Text>
                <Text style={styles.schoolBannerSubtitle}>
                  Acompanhe ranking de turmas, engajamento e gerencie o corpo docente.
                </Text>
              </View>
              <FontAwesome5 name="chevron-right" size={14} color="#0284C7" />
            </TouchableOpacity>
          </View>
        )}

        {/* ========================================== */}
        {/* MURAL INSTITUCIONAL DA ESCOLA              */}
        {/* ========================================== */}
        <View style={styles.section}>
          <SchoolMuralCard />
        </View>

        {/* ========================================== */}
        {/* SEÇÃO: MINHA TURMA                         */}
        {/* ========================================== */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Minha Turma</Text>
            <TouchableOpacity onPress={() => { setShowJoinModal(true); setJoinError(null); }}>
              <Text style={styles.addClassText}>+ Código da Turma</Text>
            </TouchableOpacity>
          </View>

          <CreateRoomButton />

          {/* Modal / Caixa de Entrada com Código de Turma */}
          {showJoinModal && (
            <View style={styles.joinCodeBox}>
              <View style={styles.joinCodeHeader}>
                <Text style={styles.joinCodeTitle}>Entrar em uma Turma</Text>
                <TouchableOpacity onPress={() => setShowJoinModal(false)}>
                  <FontAwesome5 name="times" size={14} color="#8CA0B3" />
                </TouchableOpacity>
              </View>
              <Text style={styles.joinCodeSub}>
                Digite o código fornecido pelo seu professor (ex: FIS-2026, MAT-800).
              </Text>
              <View style={styles.joinCodeInputRow}>
                <TextInput
                  style={[styles.joinCodeInput, joinError ? styles.joinCodeInputError : null]}
                  placeholder="CÓDIGO DA TURMA"
                  placeholderTextColor="#A0AEC0"
                  autoCapitalize="characters"
                  value={joinCodeInput}
                  onChangeText={(t) => {
                    setJoinCodeInput(t);
                    if (joinError) setJoinError(null);
                  }}
                />
                <TouchableOpacity
                  style={styles.joinCodeButton}
                  onPress={async () => {
                    if (!joinCodeInput.trim()) {
                      setJoinError("Digite o código da turma.");
                      return;
                    }
                    try {
                      const res = await joinClassroomByCode(joinCodeInput);
                      if (res.success && res.classroom) {
                        setShowJoinModal(false);
                        setJoinCodeInput("");
                        router.push(`/classes/${res.classroom.id}` as any);
                      } else {
                        setJoinError(res.message);
                      }
                    } catch (err: any) {
                      setJoinError(err?.message || "Erro ao entrar na turma.");
                    }
                  }}
                >
                  <Text style={styles.joinCodeButtonText}>Entrar</Text>
                </TouchableOpacity>
              </View>
              {joinError && (
                <View style={styles.joinErrorRow}>
                  <FontAwesome5 name="exclamation-circle" size={12} color="#FF4B4B" />
                  <Text style={styles.joinErrorText}>{joinError}</Text>
                </View>
              )}
            </View>
          )}

          {/* Lista de Turmas Cadastradas / Ingressadas */}
          {classrooms.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.classroomsScroll}
            >
              {classrooms.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.classroomBadgeCard, { borderLeftColor: c.themeColor }]}
                  activeOpacity={0.8}
                  onPress={() => router.push(`/classes/${c.id}` as any)}
                >
                  <View style={[styles.classroomBadgeIcon, { backgroundColor: c.themeColor }]}>
                    <FontAwesome5 name={c.icon || "chalkboard-teacher"} size={13} color="#FFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.classroomBadgeName} numberOfLines={1}>{c.name}</Text>
                    <Text style={styles.classroomBadgeSub}>Código: {c.code}</Text>
                  </View>
                  <FontAwesome5 name="chevron-right" size={10} color="#8CA0B3" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.emptyClassroomCard}>
              <FontAwesome5 name="info-circle" size={14} color="#8CA0B3" />
              <Text style={styles.emptyClassroomText}>
                {user?.role === "TEACHER"
                  ? "Você ainda não possui turmas criadas. Use o botão acima para criar sua turma."
                  : "Você ainda não está em nenhuma turma. Solicite o código ao seu professor e clique em \"+ Código da Turma\" para ingressar."}
              </Text>
            </View>
          )}

          <View style={styles.row}>
            {/* Vai para a Tela de Tarefas (Questões) */}
            <TouchableOpacity
              style={[
                styles.card,
                { backgroundColor: "#F0F9FF", borderColor: "#BAE6FD" },
              ]}
              activeOpacity={0.7}
              onPress={() => router.push("/classes/tasks" as any)}
            >
              <FontAwesome5 name="tasks" size={24} color="#1CB0F6" />
              <Text style={styles.cardTitle}>Tarefas</Text>
              <Text style={styles.cardSub}>2 listas pendentes</Text>
            </TouchableOpacity>

            {/* Vai para a Tela de Materiais (Teoria/Vídeos) */}
            <TouchableOpacity
              style={[
                styles.card,
                { backgroundColor: "#F8FAFC", borderColor: "#E2E8F0" },
              ]}
              activeOpacity={0.7}
              onPress={() => router.push("/classes/materials" as any)}
            >
              <FontAwesome5 name="folder-open" size={24} color="#8CA0B3" />
              <Text style={styles.cardTitle}>Materiais</Text>
              <Text style={styles.cardSub}>Resumos e vídeos</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 3. MODOS DE JOGO */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Modos de Estudo</Text>

          <TouchableOpacity
            style={[
              styles.mainActionCard,
              { backgroundColor: "#58CC02", shadowColor: "#58CC02" },
            ]}
            activeOpacity={0.8}
            onPress={() => router.push("/quiz")}
          >
            <View style={styles.mainActionIcon}>
              <FontAwesome5 name="dice" size={24} color="#FFF" />
            </View>
            <View style={styles.mainActionText}>
              <Text style={styles.mainActionTitle}>Treino Aleatório</Text>
              <Text style={styles.mainActionSub}>
                Questões variadas de todas as áreas
              </Text>
            </View>
          </TouchableOpacity>

          <View style={styles.row}>
            <TouchableOpacity
              style={[
                styles.secondaryActionCard,
                { backgroundColor: "#CE82FF", shadowColor: "#CE82FF" },
              ]}
              activeOpacity={0.8}
              onPress={() => router.push("/trails" as Href)}
            >
              <FontAwesome5
                name="route"
                size={20}
                color="#FFF"
                style={{ marginBottom: 8 }}
              />
              <Text style={styles.secondaryActionTitle}>
                Trilhas de{"\n"}Questões
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.secondaryActionCard,
                { backgroundColor: "#FF9600", shadowColor: "#FF9600" },
              ]}
              activeOpacity={0.8}
              onPress={() => router.push("/challenge" as Href)}
            >
              <FontAwesome5
                name="bolt"
                size={20}
                color="#FFF"
                style={{ marginBottom: 8 }}
              />
              <Text style={styles.secondaryActionTitle}>
                Desafio{"\n"}Diário
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 4. DISCIPLINAS DO ENEM */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Matérias do ENEM</Text>
          <View style={styles.gridContainer}>
            {filteredSubjects.map((subject, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.gridItem, { borderLeftColor: subject.color }]}
                activeOpacity={0.7}
                onPress={() => router.push(`/subject/${subject.id}` as any)}
              >
                <FontAwesome5
                  name={subject.icon}
                  size={16}
                  color={subject.color}
                  style={{ marginRight: 10 }}
                />
                <Text style={styles.gridItemText}>{subject.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 5. ANÁLISE DE DESEMPENHO (NOVO FORMATO LISTA) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Desempenho e Evolução</Text>

          <TouchableOpacity
            style={[styles.analysisCard, { borderLeftColor: "#1CB0F6" }]}
            activeOpacity={0.7}
            onPress={() => router.push("/stats" as Href)}
          >
            <View style={[styles.analysisIcon, { backgroundColor: "#E0F2FE" }]}>
              <FontAwesome5 name="chart-line" size={20} color="#1CB0F6" />
            </View>
            <View style={styles.analysisTextContent}>
              <Text style={styles.analysisTitle}>Estatísticas de Acertos</Text>
              <Text style={styles.analysisSub}>
                Taxa de precisão geral e média de tempo (ex: 2m15s) para cada
                acerto.
              </Text>
            </View>
            <FontAwesome5 name="chevron-right" size={16} color="#E2E8F0" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.analysisCard, { borderLeftColor: "#FF4B4B" }]}
            activeOpacity={0.7}
            onPress={() => router.push("/stats/errors")}
          >
            <View style={[styles.analysisIcon, { backgroundColor: "#FFE4E6" }]}>
              <FontAwesome5 name="microscope" size={20} color="#FF4B4B" />
            </View>
            <View style={styles.analysisTextContent}>
              <Text style={styles.analysisTitle}>Raio-X de Erros</Text>
              <Text style={styles.analysisSub}>
                Veja sua taxa de erro, o tempo médio e os assuntos com mais
                falhas por matéria.
              </Text>
            </View>
            <FontAwesome5 name="chevron-right" size={16} color="#E2E8F0" />
          </TouchableOpacity>
        </View>

        {/* 6. CADERNO DE ANOTAÇÕES */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Meu Caderno</Text>
          <View style={styles.row}>
            {/* Vai para o Caderno na aba de Questões */}
            <TouchableOpacity
              style={[styles.card, styles.notesCard]}
              activeOpacity={0.7}
              onPress={() => router.push("/notes?tab=questions" as any)}
            >
              <FontAwesome5 name="bookmark" size={24} color="#F1C40F" />
              <Text style={styles.cardTitle}>Por Questão</Text>
              <Text style={styles.cardSub}>
                Macetes salvos direto na resolução.
              </Text>
            </TouchableOpacity>

            {/* Vai para o Caderno na aba de Resumos Gerais */}
            <TouchableOpacity
              style={[styles.card, styles.notesCard]}
              activeOpacity={0.7}
              onPress={() => router.push("/notes?tab=general" as any)}
            >
              <FontAwesome5 name="book-open" size={24} color="#8CA0B3" />
              <Text style={styles.cardTitle}>Gerais</Text>
              <Text style={styles.cardSub}>
                Resumos teóricos e fórmulas exatas.
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F9FC" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  headerLeft: {
    flex: 1,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  headerNameLogo: {
    width: 115,
    height: 44,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  headerIconButtonActive: {
    backgroundColor: "#E0F2FE",
    borderColor: "#BAE6FD",
  },
  notificationDot: {
    position: "absolute",
    top: 8,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF4B4B",
    borderWidth: 1.5,
    borderColor: "#FFF",
  },
  profileButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#1CB0F6",
  },
  headerAvatarImage: { width: "100%", height: "100%" },
  headerAvatarPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#1CB0F6",
    justifyContent: "center",
    alignItems: "center",
  },

  searchBarContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#2C3A47",
    paddingVertical: 4,
  },

  notificationsDropdown: {
    backgroundColor: "#FFF",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    gap: 8,
  },
  notificationsTitle: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#8CA0B3",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  notificationItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F8FAFC",
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  notificationText: {
    flex: 1,
    fontSize: 13,
    color: "#2C3A47",
  },

  scrollContent: { padding: 20, paddingBottom: 40 },

  // Seção Lado a Lado: Ofensiva + Mural
  topOverviewRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 28,
    alignItems: "stretch",
  },
  muralCard: {
    flex: 1,
    backgroundColor: "#FFF",
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  muralHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  muralTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#2C3A47",
  },
  muralList: {
    gap: 8,
  },
  muralItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F8FAFC",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  muralBadgeIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  muralItemTexts: {
    flex: 1,
  },
  muralItemValue: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#2C3A47",
  },
  muralItemLabel: {
    fontSize: 10,
    color: "#8CA0B3",
  },

  section: { marginBottom: 28 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#2C3A47",
    marginBottom: 12,
  },

  mainActionCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
    borderRadius: 20,
    marginBottom: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  mainActionIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  mainActionText: { flex: 1 },
  mainActionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFF",
    marginBottom: 4,
  },
  mainActionSub: { fontSize: 13, color: "rgba(255,255,255,0.9)" },

  secondaryActionCard: {
    flex: 1,
    padding: 16,
    borderRadius: 20,
    alignItems: "flex-start",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  secondaryActionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FFF",
    lineHeight: 22,
  },

  row: { flexDirection: "row", gap: 12 },

  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  gridItem: {
    width: "48%",
    backgroundColor: "#FFF",
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderLeftWidth: 4,
  },
  gridItemText: { fontSize: 14, fontWeight: "bold", color: "#4B5563", flex: 1 },

  // Estilos da Seção de Análise
  analysisCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderLeftWidth: 6,
    marginBottom: 12,
  },
  analysisIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  analysisTextContent: { flex: 1, paddingRight: 10 },
  analysisTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#2C3A47",
    marginBottom: 4,
  },
  analysisSub: { fontSize: 13, color: "#8CA0B3", lineHeight: 18 },

  // Estilos da Seção de Anotações
  card: {
    flex: 1,
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "flex-start",
  },
  notesCard: { backgroundColor: "#F8FAFC" },
  cardTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#2C3A47",
    marginTop: 12,
    marginBottom: 4,
  },
  cardSub: { fontSize: 12, color: "#8CA0B3", lineHeight: 16 },

  // SALA DE AULA
  addClassText: { fontSize: 14, fontWeight: "bold", color: "#1CB0F6" },

  // Estilos do Modal / Entrada de Código
  joinCodeBox: {
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 14,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  joinCodeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  joinCodeTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#2C3A47",
  },
  joinCodeSub: {
    fontSize: 12,
    color: "#8CA0B3",
    lineHeight: 16,
  },
  joinCodeInputRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  joinCodeInput: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: "bold",
    color: "#2C3A47",
    letterSpacing: 1,
  },
  joinCodeInputError: {
    borderColor: "#FF4B4B",
    backgroundColor: "#FFF5F5",
  },
  joinCodeButton: {
    backgroundColor: "#1CB0F6",
    paddingHorizontal: 18,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  joinCodeButtonText: {
    color: "#FFF",
    fontWeight: "bold",
    fontSize: 14,
  },
  joinErrorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  joinErrorText: {
    fontSize: 12,
    color: "#FF4B4B",
    fontWeight: "600",
  },

  classroomsScroll: {
    gap: 10,
    paddingBottom: 12,
  },
  classroomBadgeCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderLeftWidth: 4,
    width: 220,
    gap: 10,
  },
  classroomBadgeIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  classroomBadgeName: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#2C3A47",
  },
  classroomBadgeSub: {
    fontSize: 11,
    color: "#8CA0B3",
  },
  emptyClassroomCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 12,
    gap: 10,
  },
  emptyClassroomText: {
    flex: 1,
    fontSize: 12,
    color: "#64748B",
    lineHeight: 18,
  },
  adminBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FAF5FF",
    borderWidth: 1,
    borderColor: "#E9D5FF",
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },
  adminBannerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F3E8FF",
    justifyContent: "center",
    alignItems: "center",
  },
  adminBannerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#581C87",
    marginBottom: 2,
  },
  adminBannerSubtitle: {
    fontSize: 12,
    color: "#7E22CE",
    lineHeight: 16,
  },
  schoolBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F9FF",
    borderWidth: 1,
    borderColor: "#BAE6FD",
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },
  schoolBannerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#E0F2FE",
    justifyContent: "center",
    alignItems: "center",
  },
  schoolBannerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0369A1",
    marginBottom: 2,
  },
  schoolBannerSubtitle: {
    fontSize: 12,
    color: "#0284C7",
    lineHeight: 16,
  },
});
