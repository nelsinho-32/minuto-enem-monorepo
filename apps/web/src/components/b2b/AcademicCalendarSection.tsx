import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { FontAwesome5 } from '@expo/vector-icons';
import { api } from '@/services/api';
import { useTheme } from '@/hooks/use-theme';

interface AcademicCalendarEvent {
  id: string;
  type: 'INSTITUTIONAL_EXAM' | 'ANNOUNCEMENT' | 'CLASSROOM_TASK';
  title: string;
  subtitle: string;
  date: string;
  classroomName?: string | null;
  badge: string;
}

interface AcademicCalendarResponse {
  totalEvents: number;
  counts: {
    exams: number;
    announcements: number;
    tasks: number;
  };
  events: AcademicCalendarEvent[];
}

export function AcademicCalendarSection() {
  const theme = useTheme();
  const [filterType, setFilterType] = useState<'ALL' | 'INSTITUTIONAL_EXAM' | 'ANNOUNCEMENT' | 'CLASSROOM_TASK'>('ALL');

  const { data, isLoading, refetch } = useQuery<AcademicCalendarResponse>({
    queryKey: ['school-academic-calendar'],
    queryFn: () => api.get<AcademicCalendarResponse>('/schools/me/academic-calendar'),
  });

  const events = (data?.events || []).filter((e) =>
    filterType === 'ALL' ? true : e.type === filterType
  );

  const styleForType = (type: AcademicCalendarEvent['type']) => {
    if (type === 'INSTITUTIONAL_EXAM') {
      return { icon: 'file-signature', color: '#7C3AED', bg: '#EDE9FE' };
    }
    if (type === 'ANNOUNCEMENT') {
      return { icon: 'bullhorn', color: '#2563EB', bg: '#DBEAFE' };
    }
    return { icon: 'tasks', color: '#16A34A', bg: '#DCFCE7' };
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>
            Calendário Acadêmico Institucional
          </Text>
          <Text style={[styles.sub, { color: theme.textMuted }]}>
            Simulados unificados, comunicados agendados e prazos de todas as turmas
          </Text>
        </View>
        <TouchableOpacity onPress={() => refetch()} style={styles.refreshBtn}>
          <FontAwesome5 name="sync-alt" size={13} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.filtersRow}>
        {(
          [
            { key: 'ALL', label: `Tudo (${data?.totalEvents ?? 0})` },
            { key: 'INSTITUTIONAL_EXAM', label: `Simulados (${data?.counts?.exams ?? 0})` },
            { key: 'ANNOUNCEMENT', label: `Comunicados (${data?.counts?.announcements ?? 0})` },
            { key: 'CLASSROOM_TASK', label: `Entregas (${data?.counts?.tasks ?? 0})` },
          ] as const
        ).map((f) => {
          const active = filterType === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilterType(f.key)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? theme.primary : theme.surfaceMuted,
                  borderColor: active ? theme.primary : theme.border,
                },
              ]}
            >
              <Text style={{ fontSize: 11.5, fontWeight: '800', color: active ? '#FFF' : theme.textMuted }}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading ? (
        <ActivityIndicator size="small" color={theme.primary} style={{ marginVertical: 20 }} />
      ) : events.length === 0 ? (
        <Text style={{ fontSize: 12.5, color: theme.textMuted, paddingVertical: 14 }}>
          Nenhum evento acadêmico encontrado neste filtro.
        </Text>
      ) : (
        <View style={{ gap: 10, marginTop: 8 }}>
          {events.slice(0, 20).map((ev) => {
            const st = styleForType(ev.type);
            const dateStr = new Date(ev.date).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            });
            return (
              <View
                key={ev.id}
                style={[
                  styles.eventCard,
                  { backgroundColor: theme.surfaceMuted, borderColor: theme.border },
                ]}
              >
                <View style={[styles.iconBox, { backgroundColor: st.bg }]}>
                  <FontAwesome5 name={st.icon} size={13} color={st.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.eventTop}>
                    <Text style={{ fontSize: 10.5, fontWeight: '800', color: st.color }}>
                      {ev.badge} • {ev.classroomName}
                    </Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textMuted }}>
                      {dateStr}
                    </Text>
                  </View>
                  <Text style={[styles.eventTitle, { color: theme.text }]}>{ev.title}</Text>
                  <Text style={{ fontSize: 12, color: theme.textMuted }} numberOfLines={2}>
                    {ev.subtitle}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: { fontSize: 16, fontWeight: '800' },
  sub: { fontSize: 12, marginTop: 2 },
  refreshBtn: {
    padding: 8,
  },
  filtersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eventTitle: { fontSize: 13.5, fontWeight: '800', marginTop: 2 },
});
