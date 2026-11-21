import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { FontAwesome5 } from "@expo/vector-icons";
import { safeAsyncStorage as AsyncStorage } from "@/services/safeStorage";

const READ_NOTIFICATIONS_KEY = "@minuto_enem:read_notifications_v1";

export type NotificationCategory = "ALL" | "TASKS" | "SCHOOL" | "STUDY";

export interface AppNotificationItem {
  id: string;
  category: "TASKS" | "SCHOOL" | "STUDY";
  title: string;
  description: string;
  timeLabel: string;
  icon: string;
  color: string;
  bg: string;
  route: string;
  urgent?: boolean;
}

interface NotificationsModalProps {
  visible: boolean;
  onClose: () => void;
  tasks: any[];
  announcements?: any[];
  difficultySubject?: string;
  currentStreak?: number;
  onUnreadCountChange?: (count: number) => void;
}

const FILTER_TABS: Array<{
  key: NotificationCategory;
  label: string;
  icon: string;
}> = [
  { key: "ALL", label: "Todas", icon: "bell" },
  { key: "TASKS", label: "Atividades", icon: "tasks" },
  { key: "SCHOOL", label: "Escola", icon: "bullhorn" },
  { key: "STUDY", label: "Estudos & Chat", icon: "graduation-cap" },
];

export function NotificationsModal({
  visible,
  onClose,
  tasks = [],
  announcements = [],
  difficultySubject = "Matemática",
  currentStreak = 0,
  onUnreadCountChange,
}: NotificationsModalProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<NotificationCategory>("ALL");
  const [readIds, setReadIds] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(READ_NOTIFICATIONS_KEY)
      .then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setReadIds(parsed);
        }
      })
      .catch(() => {});
  }, []);

  const notifications = useMemo<AppNotificationItem[]>(() => {
    const list: AppNotificationItem[] = [];

    // 1. Tarefas atrasadas
    const overdue = tasks.filter(
      (t) =>
        t.dueDate &&
        new Date(t.dueDate) < new Date() &&
        t.status !== "COMPLETED"
    );
    for (const t of overdue.slice(0, 4)) {
      list.push({
        id: `task-overdue-${t.id}`,
        category: "TASKS",
        title: `Atividade Atrasada: ${t.title || t.topic || "Exercício"}`,
        description: `O prazo encerrou em ${new Date(
          t.dueDate
        ).toLocaleDateString("pt-BR")}. Entregue o quanto antes!`,
        timeLabel: "Prazo encerrado",
        icon: "exclamation-circle",
        color: "#DC2626",
        bg: "#FEE2E2",
        route: t.classroomId ? `/classes/${t.classroomId}` : "/classes/tasks",
        urgent: true,
      });
    }

    // 2. Tarefas pendentes no prazo
    const pending = tasks.filter(
      (t) =>
        (!t.dueDate || new Date(t.dueDate) >= new Date()) &&
        t.status !== "COMPLETED"
    );
    for (const t of pending.slice(0, 5)) {
      const isEssay =
        t.creationMode === "ESSAY" ||
        (t.title || "").toLowerCase().includes("redação");
      list.push({
        id: `task-pending-${t.id}`,
        category: "TASKS",
        title: isEssay
          ? `Redação Pendente: ${t.title || t.topic}`
          : `Nova Lista: ${t.title || t.topic || "Exercício da Turma"}`,
        description: t.dueDate
          ? `Disponível na sua turma • Prazo até ${new Date(
              t.dueDate
            ).toLocaleDateString("pt-BR")}.`
          : "Atividade disponível para resolução na sua turma.",
        timeLabel: "No prazo",
        icon: isEssay ? "pen-fancy" : "clipboard-check",
        color: isEssay ? "#7C3AED" : "#0284C7",
        bg: isEssay ? "#F3E8FF" : "#E0F2FE",
        route: t.classroomId ? `/classes/${t.classroomId}` : "/classes/tasks",
      });
    }

    // 3. Comunicados institucionais da escola
    for (const ann of announcements.slice(0, 4)) {
      list.push({
        id: `ann-${ann.id}`,
        category: "SCHOOL",
        title: `Comunicado: ${ann.title}`,
        description: ann.content || "Novo aviso publicado pela sua escola.",
        timeLabel: ann.createdAt
          ? new Date(ann.createdAt).toLocaleDateString("pt-BR")
          : "Recente",
        icon: "bullhorn",
        color: "#D97706",
        bg: "#FEF3C7",
        route: "/",
      });
    }

    // 4. Recomendação de Revisão e Ofensiva
    list.push({
      id: `study-review-${difficultySubject}`,
      category: "STUDY",
      title: `Foco de Revisão: ${difficultySubject}`,
      description: `Identificamos oportunidades de evolução em ${difficultySubject}. Revise seus erros para subir sua nota TRI!`,
      timeLabel: "Sugestão Pedagógica",
      icon: "microscope",
      color: "#16A34A",
      bg: "#DCFCE7",
      route: "/stats/errors",
    });

    list.push({
      id: "study-chat-peers",
      category: "STUDY",
      title: "Conversas com Professores e Colegas",
      description:
        "Veja as mensagens da sua turma ou tire dúvidas diretamente com seus professores.",
      timeLabel: "Chat & Turmas",
      icon: "comments",
      color: "#0284C7",
      bg: "#E0F2FE",
      route: "/chat",
    });

    if (currentStreak > 0) {
      list.push({
        id: `streak-keep-${currentStreak}`,
        category: "STUDY",
        title: `Ofensiva de ${currentStreak} dia(s) ativa! 🔥`,
        description:
          "Resolva pelo menos 1 questão ou estude uma aula hoje para manter sua sequência.",
        timeLabel: "Ofensiva Diária",
        icon: "fire-alt",
        color: "#EA580C",
        bg: "#FFEDD5",
        route: "/streak",
      });
    }

    return list;
  }, [tasks, announcements, difficultySubject, currentStreak]);

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !readIds.includes(n.id)).length;
  }, [notifications, readIds]);

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [unreadCount, onUnreadCountChange]);

  const filteredNotifications = useMemo(() => {
    if (activeTab === "ALL") return notifications;
    return notifications.filter((n) => n.category === activeTab);
  }, [notifications, activeTab]);

  const markAsRead = async (id: string) => {
    if (readIds.includes(id)) return;
    const next = [...readIds, id];
    setReadIds(next);
    try {
      await AsyncStorage.setItem(READ_NOTIFICATIONS_KEY, JSON.stringify(next));
    } catch {}
  };

  const markAllAsRead = async () => {
    const allIds = notifications.map((n) => n.id);
    setReadIds(allIds);
    try {
      await AsyncStorage.setItem(
        READ_NOTIFICATIONS_KEY,
        JSON.stringify(allIds)
      );
    } catch {}
  };

  const handlePressItem = async (item: AppNotificationItem) => {
    await markAsRead(item.id);
    onClose();
    if (item.route && item.route !== "/") {
      router.push(item.route as any);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* CABEÇALHO */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.bellCircle}>
                <FontAwesome5 name="bell" size={15} color="#0284C7" solid />
              </View>
              <View>
                <Text style={styles.headerTitle}>Central de Notificações</Text>
                <Text style={styles.headerSub}>
                  {unreadCount > 0
                    ? `${unreadCount} atualização(ões) não lida(s)`
                    : "Você está em dia com seus avisos!"}
                </Text>
              </View>
            </View>

            <View style={styles.headerActions}>
              {unreadCount > 0 && (
                <TouchableOpacity
                  style={styles.markAllBtn}
                  onPress={markAllAsRead}
                  activeOpacity={0.75}
                >
                  <FontAwesome5 name="check-double" size={11} color="#0284C7" />
                  <Text style={styles.markAllText}>Ler todas</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={onClose}
                activeOpacity={0.75}
              >
                <FontAwesome5 name="times" size={15} color="#64748B" />
              </TouchableOpacity>
            </View>
          </View>

          {/* ABAS DE FILTRO */}
          <View style={styles.tabsWrapper}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabsRow}
            >
              {FILTER_TABS.map((t) => {
                const isSelected = activeTab === t.key;
                const count =
                  t.key === "ALL"
                    ? notifications.length
                    : notifications.filter((n) => n.category === t.key).length;

                return (
                  <TouchableOpacity
                    key={t.key}
                    style={[styles.tabChip, isSelected && styles.tabChipActive]}
                    onPress={() => setActiveTab(t.key)}
                    activeOpacity={0.8}
                  >
                    <FontAwesome5
                      name={t.icon}
                      size={11}
                      color={isSelected ? "#FFFFFF" : "#64748B"}
                    />
                    <Text
                      style={[
                        styles.tabChipText,
                        isSelected && styles.tabChipTextActive,
                      ]}
                    >
                      {t.label} ({count})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* LISTA DE NOTIFICAÇÕES */}
          <ScrollView
            style={styles.listScroll}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {filteredNotifications.length === 0 ? (
              <View style={styles.emptyBox}>
                <View style={styles.emptyIconCircle}>
                  <FontAwesome5 name="check-circle" size={28} color="#16A34A" />
                </View>
                <Text style={styles.emptyTitle}>Tudo tranquilo por aqui!</Text>
                <Text style={styles.emptySub}>
                  Nenhuma notificação pendente nesta categoria no momento.
                </Text>
              </View>
            ) : (
              filteredNotifications.map((item) => {
                const isUnread = !readIds.includes(item.id);
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.card,
                      isUnread && styles.cardUnread,
                      item.urgent && styles.cardUrgent,
                    ]}
                    activeOpacity={0.8}
                    onPress={() => handlePressItem(item)}
                  >
                    <View
                      style={[styles.iconBox, { backgroundColor: item.bg }]}
                    >
                      <FontAwesome5
                        name={item.icon}
                        size={16}
                        color={item.color}
                      />
                    </View>

                    <View style={styles.cardBody}>
                      <View style={styles.cardTopRow}>
                        <Text
                          style={[
                            styles.timeTag,
                            { color: item.color },
                          ]}
                        >
                          {item.timeLabel}
                        </Text>
                        {isUnread && <View style={styles.unreadDot} />}
                      </View>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.cardDesc} numberOfLines={2}>
                        {item.description}
                      </Text>
                    </View>

                    <FontAwesome5
                      name="chevron-right"
                      size={12}
                      color="#CBD5E1"
                    />
                  </TouchableOpacity>
                );
              })
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
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "flex-start",
    alignItems: "center",
    paddingTop: 54,
    paddingHorizontal: 14,
  },
  sheet: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "82%",
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  bellCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E0F2FE",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  headerSub: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 1,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  markAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#E0F2FE",
  },
  markAllText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0284C7",
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  tabsWrapper: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    paddingVertical: 10,
  },
  tabsRow: {
    paddingHorizontal: 16,
    gap: 8,
  },
  tabChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
  },
  tabChipActive: {
    backgroundColor: "#0284C7",
  },
  tabChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
  },
  tabChipTextActive: {
    color: "#FFFFFF",
  },
  listScroll: {
    maxHeight: 440,
  },
  listContent: {
    padding: 14,
    gap: 10,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  cardUnread: {
    backgroundColor: "#F8FAFC",
    borderColor: "#BAE6FD",
  },
  cardUrgent: {
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: {
    flex: 1,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  timeTag: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#0284C7",
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 2,
  },
  cardDesc: {
    fontSize: 12,
    color: "#475569",
    lineHeight: 17,
  },
  emptyBox: {
    paddingVertical: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 12,
    color: "#64748B",
    textAlign: "center",
  },
});
