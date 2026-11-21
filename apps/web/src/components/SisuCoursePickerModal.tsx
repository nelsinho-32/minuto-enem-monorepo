import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import {
  searchSisuCourses,
  SISU_INSTITUTIONS,
  SISU_COURSE_DEFINITIONS,
  SISU_MODALITIES,
  getSisuStates,
  type SisuCutoffEntry,
  type SisuModalityCode,
} from '@minuto-enem/shared';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/services/api';

interface SisuCoursePickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (entry: SisuCutoffEntry) => void;
  selectedCourse?: string;
  selectedInstitution?: string;
  initialModality?: string;
}

export function SisuCoursePickerModal({
  visible,
  onClose,
  onSelect,
  selectedCourse,
  selectedInstitution,
  initialModality,
}: SisuCoursePickerModalProps) {
  const { isDark } = useTheme();
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState<string>('');
  const [institutionFilter, setInstitutionFilter] = useState<string>('');
  const [courseFilter, setCourseFilter] = useState<string>('');
  const [modality, setModality] = useState<SisuModalityCode>(
    ((initialModality || 'AC').toUpperCase() as SisuModalityCode) || 'AC'
  );
  const [serverItems, setServerItems] = useState<SisuCutoffEntry[] | null>(null);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    const qs = new URLSearchParams();
    if (query.trim()) qs.set('q', query.trim());
    if (stateFilter) qs.set('state', stateFilter);
    if (institutionFilter) qs.set('institution', institutionFilter);
    if (courseFilter) qs.set('course', courseFilter);
    qs.set('modality', modality);
    qs.set('limit', '80');

    api
      .get<{ items: SisuCutoffEntry[] }>(`/sisu/courses?${qs.toString()}`)
      .then((res) => {
        if (active && Array.isArray(res?.items)) {
          setServerItems(res.items);
        }
      })
      .catch(() => {
        if (active) setServerItems(null);
      });

    return () => {
      active = false;
    };
  }, [visible, query, stateFilter, institutionFilter, courseFilter, modality]);

  const states = useMemo(() => getSisuStates(), []);
  const topInstitutions = useMemo(() => SISU_INSTITUTIONS.slice(0, 14), []);
  const popularCourses = useMemo(
    () => SISU_COURSE_DEFINITIONS.slice(0, 12).map((c) => c.name),
    []
  );

  const localResults = useMemo(
    () =>
      searchSisuCourses({
        query,
        state: stateFilter || undefined,
        institution: institutionFilter || undefined,
        course: courseFilter || undefined,
        modality,
        limit: 80,
      }),
    [query, stateFilter, institutionFilter, courseFilter, modality]
  );

  const results = serverItems ?? localResults;

  const bgModal = isDark ? '#0F172A' : '#F8FAFC';
  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const borderCol = isDark ? '#334155' : '#E2E8F0';
  const titleCol = isDark ? '#F8FAFC' : '#0F172A';
  const subCol = isDark ? '#94A3B8' : '#475569';
  const chipBg = isDark ? '#1E293B' : '#FFFFFF';

  const handleClearFilters = () => {
    setQuery('');
    setStateFilter('');
    setInstitutionFilter('');
    setCourseFilter('');
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: bgModal }]}>
        {/* Cabeçalho */}
        <View
          style={[
            styles.header,
            { backgroundColor: cardBg, borderBottomColor: borderCol },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: titleCol }]}>
              Catálogo SISU: Cursos e Instituições
            </Text>
            <Text style={[styles.subtitle, { color: subCol }]}>
              Busca relacional por curso, universidade, estado (UF) e nota de corte recente
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={[styles.closeBtn, { borderColor: borderCol }]}
          >
            <FontAwesome5 name="times" size={16} color={subCol} />
          </TouchableOpacity>
        </View>

        {/* Busca relacional */}
        <View style={[styles.searchBoxWrap, { backgroundColor: cardBg, borderColor: borderCol }]}>
          <FontAwesome5 name="search" size={14} color={subCol} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Ex: Medicina USP, Direito UFMG, Computação RJ..."
            placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
            style={[styles.searchInput, { color: titleCol }]}
          />
          {(query || stateFilter || institutionFilter || courseFilter) ? (
            <TouchableOpacity onPress={handleClearFilters}>
              <Text style={styles.clearLink}>Limpar</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Filtros relacionais horizontais */}
        <View style={styles.filtersBlock}>
          <Text style={[styles.filterHeading, { color: subCol }]}>Modalidade / Cota SISU:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {SISU_MODALITIES.map((m) => {
              const active = modality === m.code;
              return (
                <TouchableOpacity
                  key={m.code}
                  onPress={() => setModality(m.code)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? '#D97706' : chipBg,
                      borderColor: active ? '#D97706' : borderCol,
                    },
                  ]}
                >
                  <Text style={[styles.chipText, { color: active ? '#FFFFFF' : titleCol }]}>
                    {m.shortLabel}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={[styles.filterHeading, { color: subCol, marginTop: 8 }]}>Cursos populares:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            <TouchableOpacity
              onPress={() => setCourseFilter('')}
              style={[
                styles.chip,
                { backgroundColor: !courseFilter ? '#0284C7' : chipBg, borderColor: !courseFilter ? '#0284C7' : borderCol },
              ]}
            >
              <Text style={[styles.chipText, { color: !courseFilter ? '#FFFFFF' : titleCol }]}>
                Todos
              </Text>
            </TouchableOpacity>
            {popularCourses.map((cName) => {
              const active = courseFilter === cName;
              return (
                <TouchableOpacity
                  key={cName}
                  onPress={() => setCourseFilter(active ? '' : cName)}
                  style={[
                    styles.chip,
                    { backgroundColor: active ? '#0284C7' : chipBg, borderColor: active ? '#0284C7' : borderCol },
                  ]}
                >
                  <Text style={[styles.chipText, { color: active ? '#FFFFFF' : titleCol }]}>
                    {cName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={[styles.filterHeading, { color: subCol, marginTop: 8 }]}>
            Instituições (Sigla):
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            <TouchableOpacity
              onPress={() => setInstitutionFilter('')}
              style={[
                styles.chip,
                { backgroundColor: !institutionFilter ? '#7C3AED' : chipBg, borderColor: !institutionFilter ? '#7C3AED' : borderCol },
              ]}
            >
              <Text style={[styles.chipText, { color: !institutionFilter ? '#FFFFFF' : titleCol }]}>
                Todas
              </Text>
            </TouchableOpacity>
            {topInstitutions.map((inst) => {
              const active = institutionFilter === inst.sigla;
              return (
                <TouchableOpacity
                  key={inst.sigla}
                  onPress={() => setInstitutionFilter(active ? '' : inst.sigla)}
                  style={[
                    styles.chip,
                    { backgroundColor: active ? '#7C3AED' : chipBg, borderColor: active ? '#7C3AED' : borderCol },
                  ]}
                >
                  <Text style={[styles.chipText, { color: active ? '#FFFFFF' : titleCol }]}>
                    {inst.sigla} ({inst.state})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={[styles.filterHeading, { color: subCol, marginTop: 8 }]}>
            Estado (UF):
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            <TouchableOpacity
              onPress={() => setStateFilter('')}
              style={[
                styles.chip,
                { backgroundColor: !stateFilter ? '#059669' : chipBg, borderColor: !stateFilter ? '#059669' : borderCol },
              ]}
            >
              <Text style={[styles.chipText, { color: !stateFilter ? '#FFFFFF' : titleCol }]}>
                Brasil
              </Text>
            </TouchableOpacity>
            {states.map((uf) => {
              const active = stateFilter === uf;
              return (
                <TouchableOpacity
                  key={uf}
                  onPress={() => setStateFilter(active ? '' : uf)}
                  style={[
                    styles.chip,
                    { backgroundColor: active ? '#059669' : chipBg, borderColor: active ? '#059669' : borderCol },
                  ]}
                >
                  <Text style={[styles.chipText, { color: active ? '#FFFFFF' : titleCol }]}>
                    {uf}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.countBar}>
          <Text style={[styles.countText, { color: subCol }]}>
            {results.length} {results.length === 1 ? 'opção encontrada' : 'opções encontradas'} (SISU 2025/2026)
          </Text>
        </View>

        {/* Lista de Resultados */}
        <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          {results.map((item) => {
            const isSelected =
              selectedCourse === item.course && selectedInstitution === item.institution;
            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
                activeOpacity={0.85}
                style={[
                  styles.resultCard,
                  {
                    backgroundColor: cardBg,
                    borderColor: isSelected ? '#16A34A' : borderCol,
                    borderWidth: isSelected ? 2 : 1,
                  },
                ]}
              >
                <View style={{ flex: 1, marginRight: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <View style={styles.instBadge}>
                      <Text style={styles.instBadgeText}>{item.institution}</Text>
                    </View>
                    <Text style={[styles.courseTitle, { color: titleCol }]}>
                      {item.course}
                    </Text>
                  </View>
                  <Text style={[styles.instFullName, { color: subCol }]} numberOfLines={1}>
                    {item.institutionName} • {item.city}/{item.state}
                  </Text>
                  <Text style={[styles.areaText, { color: subCol }]}>
                    {item.degree} • Foco: {item.areaFocus}
                  </Text>
                </View>

                <View style={styles.scoreBox}>
                  <Text style={styles.scoreLabel}>Corte</Text>
                  <Text style={styles.scoreVal}>{item.cutoffScore}</Text>
                  <Text style={styles.scoreUnit}>pts</Text>
                </View>
              </TouchableOpacity>
            );
          })}

          {results.length === 0 ? (
            <View style={[styles.emptyBox, { backgroundColor: cardBg, borderColor: borderCol }]}>
              <FontAwesome5 name="search" size={26} color={subCol} />
              <Text style={[styles.emptyTitle, { color: titleCol }]}>
                Nenhuma combinação encontrada
              </Text>
              <Text style={[styles.emptyDesc, { color: subCol }]}>
                Tente limpar algum filtro ou buscar apenas pelo nome do curso ou sigla da universidade.
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  title: { fontSize: 17, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 2 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBoxWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '600' },
  clearLink: { color: '#DC2626', fontSize: 12, fontWeight: '800' },
  filtersBlock: { marginTop: 10, paddingHorizontal: 16 },
  filterHeading: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  chipsRow: { gap: 6, paddingRight: 16 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontSize: 11, fontWeight: '700' },
  countBar: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  countText: { fontSize: 11, fontWeight: '700' },
  listContent: { padding: 16, paddingBottom: 32, gap: 10 },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 13,
    borderRadius: 14,
  },
  instBadge: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  instBadgeText: { fontSize: 11, fontWeight: '900', color: '#1D4ED8' },
  courseTitle: { fontSize: 14, fontWeight: '800' },
  instFullName: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  areaText: { fontSize: 11, marginTop: 3 },
  scoreBox: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignItems: 'center',
    minWidth: 64,
  },
  scoreLabel: { fontSize: 9, fontWeight: '800', color: '#15803D', textTransform: 'uppercase' },
  scoreVal: { fontSize: 16, fontWeight: '900', color: '#166534' },
  scoreUnit: { fontSize: 9, fontWeight: '700', color: '#15803D' },
  emptyBox: {
    alignItems: 'center',
    padding: 28,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  emptyTitle: { fontSize: 15, fontWeight: '800' },
  emptyDesc: { fontSize: 12, textAlign: 'center' },
});
