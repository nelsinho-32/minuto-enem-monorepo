import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { FontAwesome5 } from "@expo/vector-icons";
import { safeAsyncStorage as AsyncStorage } from "@/services/safeStorage";
import { api } from "@/services/api";

export type ElasticScope = "ALL" | "SYSTEM" | "CLASSROOM" | "NOTES" | "QUESTIONS";

export interface ElasticSuggestionItem {
  id: string;
  scope: "SYSTEM" | "CLASSROOM" | "NOTES" | "QUESTIONS";
  kind:
    | "SUBJECT"
    | "LESSON"
    | "CLASSROOM_MATERIAL"
    | "CLASSROOM_TASK"
    | "NOTE"
    | "QUESTION";
  title: string;
  subtitle: string;
  snippet?: string;
  badge: string;
  icon: string;
  color: string;
  score: number;
  route: string;
  routeParams?: Record<string, string>;
}

interface ElasticSearchResponse {
  query: string;
  scope: ElasticScope;
  counts: Record<ElasticScope, number>;
  items: ElasticSuggestionItem[];
}

interface ElasticSearchBarProps {
  query: string;
  onChangeQuery: (q: string) => void;
  userId?: string;
  localSubjects?: any[];
  localTasks?: any[];
  localClassrooms?: any[];
  autoFocus?: boolean;
  onNavigate?: () => void;
}

const SCOPE_FILTERS: Array<{
  key: ElasticScope;
  label: string;
  icon: string;
  color: string;
  bg: string;
}> = [
  {
    key: "ALL",
    label: "Todos",
    icon: "layer-group",
    color: "#0F172A",
    bg: "#E2E8F0",
  },
  {
    key: "SYSTEM",
    label: "Conteúdo do Sistema",
    icon: "book-open",
    color: "#0284C7",
    bg: "#E0F2FE",
  },
  {
    key: "CLASSROOM",
    label: "Minha Turma",
    icon: "chalkboard-teacher",
    color: "#16A34A",
    bg: "#DCFCE7",
  },
  {
    key: "NOTES",
    label: "Minhas Anotações",
    icon: "sticky-note",
    color: "#D97706",
    bg: "#FEF3C7",
  },
  {
    key: "QUESTIONS",
    label: "Questões ENEM",
    icon: "graduation-cap",
    color: "#7C3AED",
    bg: "#F3E8FF",
  },
];

function normalizeText(input?: string | null): string {
  if (!input) return "";
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (Math.abs(a.length - b.length) > 3) return 99;
  const m: number[][] = [];
  for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      m[i][j] =
        b.charAt(i - 1) === a.charAt(j - 1)
          ? m[i - 1][j - 1]
          : Math.min(m[i - 1][j - 1] + 1, m[i][j - 1] + 1, m[i - 1][j] + 1);
    }
  }
  return m[b.length][a.length];
}

function scoreLocalMatch(rawQuery: string, title: string, subtitle = "", body = ""): number {
  const q = normalizeText(rawQuery);
  if (!q) return 0;
  const t = normalizeText(title);
  const s = normalizeText(subtitle);
  const b = normalizeText(body);

  let score = 0;
  if (t === q) score += 120;
  else if (t.startsWith(q)) score += 95;
  else if (t.includes(q)) score += 80;
  if (s.includes(q)) score += 45;
  if (b.includes(q)) score += 25;

  const tokens = q.split(/\s+/).filter((tk) => tk.length >= 2);
  const words = t.split(/[^a-z0-9]+/).filter((w) => w.length >= 3);

  for (const token of tokens) {
    if (t.includes(token)) {
      score += 25;
    } else if (s.includes(token) || b.includes(token)) {
      score += 12;
    } else if (token.length >= 4) {
      const maxDist = token.length >= 6 ? 2 : 1;
      const fuzzy = words.some(
        (w) =>
          w.startsWith(token.slice(0, 2)) &&
          levenshtein(token, w.slice(0, token.length + 1)) <= maxDist
      );
      if (fuzzy) score += 35;
    }
  }

  return score;
}

export function ElasticSearchBar({
  query,
  onChangeQuery,
  userId,
  localSubjects = [],
  localTasks = [],
  localClassrooms = [],
  autoFocus = true,
  onNavigate,
}: ElasticSearchBarProps) {
  const router = useRouter();
  const [activeScope, setActiveScope] = useState<ElasticScope>("ALL");
  const [remoteItems, setRemoteItems] = useState<ElasticSuggestionItem[]>([]);
  const [localNotes, setLocalNotes] = useState<any[]>([]);
  const [isLoadingRemote, setIsLoadingRemote] = useState(false);

  // Carrega anotações salvas localmente para sugestão instantânea offline-first
  useEffect(() => {
    AsyncStorage.getItem("@minuto_enem:notes_cache_v1")
      .then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setLocalNotes(parsed);
        }
      })
      .catch(() => {});
  }, []);

  // Busca Elástica Remota com debounce de 180ms
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setRemoteItems([]);
      setIsLoadingRemote(false);
      return;
    }

    let isCurrent = true;
    setIsLoadingRemote(true);

    const timer = setTimeout(async () => {
      try {
        const res = await api.get<ElasticSearchResponse>(
          `/search/elastic?q=${encodeURIComponent(trimmed)}&scope=ALL&limit=35${
            userId ? `&userId=${encodeURIComponent(userId)}` : ""
          }`
        );
        if (isCurrent && res && Array.isArray(res.items)) {
          setRemoteItems(res.items);
        }
      } catch {
        // Continua exibindo resultados elásticos locais caso a rede oscile
      } finally {
        if (isCurrent) setIsLoadingRemote(false);
      }
    }, 180);

    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [query, userId]);

  // Motor Elástico Local Instantâneo (0ms) combinado com os resultados do servidor
  const allMergedSuggestions = useMemo<ElasticSuggestionItem[]>(() => {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const map = new Map<string, ElasticSuggestionItem>();

    // 1. Insere resultados remotos da API (prioridade máxima)
    for (const item of remoteItems) {
      map.set(`${item.scope}:${item.title.toLowerCase()}`, item);
    }

    // 2. Complementa com Matérias e Aulas locais (Conteúdo do Sistema)
    for (const subj of localSubjects) {
      const sScore = scoreLocalMatch(trimmed, subj.name || "", subj.slug || "");
      const sKey = `SYSTEM:${(subj.name || "").toLowerCase()}`;
      if (sScore > 0 && !map.has(sKey)) {
        map.set(sKey, {
          id: `local-subj-${subj.slug || subj.id}`,
          scope: "SYSTEM",
          kind: "SUBJECT",
          title: subj.name,
          subtitle: "Disciplina Oficial do ENEM • Conteúdo do Sistema",
          badge: "Conteúdo do Sistema",
          icon: "book",
          color: "#0284C7",
          score: sScore + 10,
          route: `/subject/${subj.slug || subj.id}`,
        });
      }

      const lessons = Array.isArray(subj.lessons) ? subj.lessons : [];
      for (const lesson of lessons) {
        const lScore = scoreLocalMatch(
          trimmed,
          lesson.title || "",
          subj.name || "",
          (lesson.content || "").slice(0, 400)
        );
        const lKey = `SYSTEM:${(lesson.title || "").toLowerCase()}`;
        if (lScore > 0 && !map.has(lKey)) {
          map.set(lKey, {
            id: `local-lesson-${lesson.id}`,
            scope: "SYSTEM",
            kind: "LESSON",
            title: lesson.title,
            subtitle: `${subj.name} • 🎬 Videoaula + Resumo`,
            badge: "Conteúdo do Sistema",
            icon: "play-circle",
            color: "#0284C7",
            score: lScore,
            route: `/subject/lesson/${lesson.id}`,
          });
        }
      }
    }

    // 3. Complementa com Tarefas e Turmas locais (Minha Turma)
    for (const task of localTasks) {
      const tTitle = task.title || task.topic || "Atividade da Turma";
      const tScore = scoreLocalMatch(
        trimmed,
        tTitle,
        `${task.topic || ""} ${task.subject || ""}`,
        task.description || task.instructions || ""
      );
      const tKey = `CLASSROOM:${tTitle.toLowerCase()}`;
      if (tScore > 0 && !map.has(tKey)) {
        map.set(tKey, {
          id: `local-task-${task.id}`,
          scope: "CLASSROOM",
          kind: "CLASSROOM_TASK",
          title: tTitle,
          subtitle: `Minha Turma • ${task.subject || "Exercício da Turma"}`,
          badge: "Minha Turma",
          icon: "tasks",
          color: "#16A34A",
          score: tScore + 5,
          route: task.classroomId ? `/classes/${task.classroomId}` : "/classes/tasks",
        });
      }
    }

    for (const room of localClassrooms) {
      const rScore = scoreLocalMatch(
        trimmed,
        room.name || "",
        `${room.subject || ""} ${room.teacherName || ""}`
      );
      const rKey = `CLASSROOM:${(room.name || "").toLowerCase()}`;
      if (rScore > 0 && !map.has(rKey)) {
        map.set(rKey, {
          id: `local-room-${room.id}`,
          scope: "CLASSROOM",
          kind: "CLASSROOM_MATERIAL",
          title: room.name,
          subtitle: `Turma (${room.code}) • Prof. ${room.teacherName || ""}`,
          badge: "Minha Turma",
          icon: "chalkboard-teacher",
          color: "#16A34A",
          score: rScore,
          route: `/classes/${room.id}`,
        });
      }
    }

    // 4. Complementa com Anotações do Caderno local (Minhas Anotações)
    for (const note of localNotes) {
      const nScore = scoreLocalMatch(
        trimmed,
        note.title || "",
        note.subject || "",
        note.content || ""
      );
      const nKey = `NOTES:${(note.title || "").toLowerCase()}`;
      if (nScore > 0 && !map.has(nKey)) {
        map.set(nKey, {
          id: `local-note-${note.id}`,
          scope: "NOTES",
          kind: "NOTE",
          title: note.title,
          subtitle: `Caderno de Anotações • ${note.subject || "Resumo"}`,
          snippet: (note.content || "").replace(/\s+/g, " ").trim().slice(0, 100),
          badge: "Minhas Anotações",
          icon: "sticky-note",
          color: "#D97706",
          score: nScore + 8,
          route: "/notes",
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => b.score - a.score);
  }, [query, remoteItems, localSubjects, localTasks, localClassrooms, localNotes]);

  const counts = useMemo<Record<ElasticScope, number>>(() => {
    return {
      ALL: allMergedSuggestions.length,
      SYSTEM: allMergedSuggestions.filter((i) => i.scope === "SYSTEM").length,
      CLASSROOM: allMergedSuggestions.filter((i) => i.scope === "CLASSROOM").length,
      NOTES: allMergedSuggestions.filter((i) => i.scope === "NOTES").length,
      QUESTIONS: allMergedSuggestions.filter((i) => i.scope === "QUESTIONS").length,
    };
  }, [allMergedSuggestions]);

  const visibleSuggestions = useMemo(() => {
    if (activeScope === "ALL") return allMergedSuggestions.slice(0, 20);
    return allMergedSuggestions
      .filter((i) => i.scope === activeScope)
      .slice(0, 20);
  }, [allMergedSuggestions, activeScope]);

  const handleSelectSuggestion = (item: ElasticSuggestionItem) => {
    onNavigate?.();
    if (item.routeParams && Object.keys(item.routeParams).length > 0) {
      router.push({
        pathname: item.route as any,
        params: item.routeParams,
      });
    } else {
      router.push(item.route as any);
    }
  };

  const hasQuery = query.trim().length > 0;

  return (
    <View style={styles.wrapper}>
      {/* BARRA DE PESQUISA ELÁSTICA */}
      <View style={styles.searchBarBox}>
        <FontAwesome5 name="search" size={14} color="#0284C7" />
        <TextInput
          style={styles.searchInput}
          placeholder="Busca elástica: ex. Citologia, Funções, Era Vargas..."
          placeholderTextColor="#94A3B8"
          value={query}
          onChangeText={onChangeQuery}
          autoFocus={autoFocus}
        />
        {isLoadingRemote && (
          <ActivityIndicator
            size="small"
            color="#0284C7"
            style={{ marginRight: 8 }}
          />
        )}
        {hasQuery && (
          <TouchableOpacity
            onPress={() => onChangeQuery("")}
            style={styles.clearBtn}
          >
            <FontAwesome5 name="times-circle" size={16} color="#94A3B8" />
          </TouchableOpacity>
        )}
      </View>

      {/* PAINEL DE SUGESTÕES COM FILTROS NO TOPO */}
      {hasQuery && (
        <View style={styles.dropdownCard}>
          {/* BARRA DE FILTROS EM CIMA DAS SUGESTÕES */}
          <View style={styles.filterHeaderBox}>
            <Text style={styles.filterHeaderLabel}>
              FILTRAR RESULTADOS POR ORIGEM:
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterChipsRow}
              keyboardShouldPersistTaps="handled"
            >
              {SCOPE_FILTERS.map((f) => {
                const isSelected = activeScope === f.key;
                const count = counts[f.key] ?? 0;
                return (
                  <TouchableOpacity
                    key={f.key}
                    style={[
                      styles.filterChip,
                      isSelected && {
                        backgroundColor: f.bg,
                        borderColor: f.color,
                      },
                    ]}
                    onPress={() => setActiveScope(f.key)}
                    activeOpacity={0.8}
                  >
                    <FontAwesome5
                      name={f.icon}
                      size={11}
                      color={isSelected ? f.color : "#64748B"}
                    />
                    <Text
                      style={[
                        styles.filterChipText,
                        isSelected && { color: f.color, fontWeight: "800" },
                      ]}
                    >
                      {f.label}
                    </Text>
                    <View
                      style={[
                        styles.countBadge,
                        isSelected && { backgroundColor: f.color },
                      ]}
                    >
                      <Text
                        style={[
                          styles.countBadgeText,
                          isSelected && { color: "#FFFFFF" },
                        ]}
                      >
                        {count}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* LISTA DE SUGESTÕES CATEGORIZADAS */}
          <ScrollView
            style={styles.suggestionsScroll}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {visibleSuggestions.length === 0 ? (
              <View style={styles.emptyBox}>
                <FontAwesome5
                  name="search"
                  size={22}
                  color="#94A3B8"
                  style={{ marginBottom: 8 }}
                />
                <Text style={styles.emptyTitle}>
                  Nenhum resultado em{" "}
                  {SCOPE_FILTERS.find((s) => s.key === activeScope)?.label} para "
                  {query.trim()}"
                </Text>
                <Text style={styles.emptySubtitle}>
                  {activeScope === "NOTES"
                    ? "Você ainda não possui uma anotação com esse termo no seu caderno."
                    : activeScope === "CLASSROOM"
                    ? "Sua turma ainda não possui materiais ou exercícios sobre esse assunto."
                    : "Tente trocar o filtro acima para 'Todos' ou buscar por outro termo."}
                </Text>

                {/* Atalho contextual inteligente */}
                {activeScope === "NOTES" && (
                  <TouchableOpacity
                    style={styles.quickCreateNoteBtn}
                    onPress={() => {
                      onNavigate?.();
                      router.push({
                        pathname: "/notes/new" as any,
                        params: { title: `Resumo: ${query.trim()}` },
                      });
                    }}
                  >
                    <FontAwesome5 name="plus" size={11} color="#FFF" />
                    <Text style={styles.quickCreateNoteText}>
                      Criar anotação sobre "{query.trim()}"
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              visibleSuggestions.map((item) => {
                const scopeStyle =
                  SCOPE_FILTERS.find((s) => s.key === item.scope) ||
                  SCOPE_FILTERS[1];

                return (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.suggestionRow}
                    activeOpacity={0.75}
                    onPress={() => handleSelectSuggestion(item)}
                  >
                    <View
                      style={[
                        styles.suggestionIconBox,
                        { backgroundColor: scopeStyle.bg },
                      ]}
                    >
                      <FontAwesome5
                        name={item.icon}
                        size={14}
                        color={scopeStyle.color}
                      />
                    </View>

                    <View style={styles.suggestionBody}>
                      <View style={styles.suggestionTopRow}>
                        <View
                          style={[
                            styles.originPill,
                            { backgroundColor: scopeStyle.bg },
                          ]}
                        >
                          <Text
                            style={[
                              styles.originPillText,
                              { color: scopeStyle.color },
                            ]}
                          >
                            {item.badge}
                          </Text>
                        </View>
                        <Text style={styles.suggestionSubtitle} numberOfLines={1}>
                          {item.subtitle}
                        </Text>
                      </View>

                      <Text style={styles.suggestionTitle} numberOfLines={1}>
                        {item.title}
                      </Text>

                      {item.snippet ? (
                        <Text style={styles.suggestionSnippet} numberOfLines={2}>
                          {item.snippet}
                        </Text>
                      ) : null}
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 20,
    marginBottom: 14,
    zIndex: 50,
  },
  searchBarBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#0284C7",
    gap: 10,
    shadowColor: "#0284C7",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#0F172A",
    fontWeight: "600",
    paddingVertical: 0,
  },
  clearBtn: {
    padding: 2,
  },
  dropdownCard: {
    marginTop: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
    overflow: "hidden",
  },
  filterHeaderBox: {
    backgroundColor: "#F8FAFC",
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  filterHeaderLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.6,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  filterChipsRow: {
    paddingHorizontal: 12,
    gap: 8,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  countBadge: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
  },
  countBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#475569",
  },
  suggestionsScroll: {
    maxHeight: 350,
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    gap: 12,
  },
  suggestionIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  suggestionBody: {
    flex: 1,
  },
  suggestionTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 3,
  },
  originPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  originPillText: {
    fontSize: 10,
    fontWeight: "800",
  },
  suggestionSubtitle: {
    flex: 1,
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
  },
  suggestionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  suggestionSnippet: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
    lineHeight: 16,
  },
  emptyBox: {
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#1E293B",
    textAlign: "center",
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 12,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 18,
  },
  quickCreateNoteBtn: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#D97706",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  quickCreateNoteText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
});
