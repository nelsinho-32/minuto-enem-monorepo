import { useThemedStyles } from '@/hooks/use-theme';
import React from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import { AppPalette } from '@/constants/theme';

interface ClassroomReadingModalProps {
  material: any | null;
  classroomName: string;
  teacherName: string;
  defaultSubject: string;
  onClose: () => void;
  onPracticeQuiz: (subjectId: string, lessonId: string) => void;
}

const markdownStyles = StyleSheet.create({
  body: { fontSize: 15, color: AppPalette.textSecondary, lineHeight: 24 },
  heading2: {
    fontSize: 18,
    fontWeight: '800',
    color: AppPalette.textPrimary,
    marginTop: 16,
    marginBottom: 8,
  },
  strong: { fontWeight: '800', color: AppPalette.textPrimary },
});

export function ClassroomReadingModal({
  material,
  classroomName,
  teacherName,
  defaultSubject,
  onClose,
  onPracticeQuiz,
}: ClassroomReadingModalProps) {
  const styles = useThemedStyles(baseStyles);
  return (
    <Modal
      visible={Boolean(material)}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <View style={styles.badgeRow}>
                <View
                  style={[
                    styles.typeBadge,
                    {
                      backgroundColor:
                        material?.type === 'TIP'
                          ? AppPalette.warningLight
                          : AppPalette.primaryLight,
                    },
                  ]}
                >
                  <FontAwesome5
                    name={
                      material?.type === 'TIP' ? 'lightbulb' : 'newspaper'
                    }
                    size={11}
                    color={
                      material?.type === 'TIP'
                        ? AppPalette.warning
                        : AppPalette.primary
                    }
                  />
                  <Text
                    style={[
                      styles.typeBadgeText,
                      {
                        color:
                          material?.type === 'TIP'
                            ? AppPalette.warning
                            : AppPalette.primary,
                      },
                    ]}
                  >
                    {material?.type === 'TIP'
                      ? 'Macete Rápido'
                      : 'Artigo Didático'}
                  </Text>
                </View>
                <Text style={styles.subjectText}>
                  {material?.subject?.name || defaultSubject}
                </Text>
              </View>
              <Text style={styles.title} numberOfLines={2}>
                {material?.title}
              </Text>
              <Text style={styles.authorSub}>
                Turma: {classroomName} • {teacherName}
              </Text>
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <FontAwesome5
                name="times"
                size={16}
                color={AppPalette.textMuted}
              />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {material?.content ? (
              <Markdown style={markdownStyles as any}>
                {material.content}
              </Markdown>
            ) : (
              <Text style={styles.plainBody}>
                {material?.description ||
                  'Nenhum texto disponível para este material.'}
              </Text>
            )}

            <View style={styles.footerActionBox}>
              <TouchableOpacity
                style={styles.practiceBtn}
                activeOpacity={0.85}
                onPress={() => {
                  const subId =
                    material?.subjectId || material?.subject?.id || '';
                  onPracticeQuiz(subId, material?.id || '');
                }}
              >
                <FontAwesome5 name="pencil-alt" size={14} color="#FFF" />
                <Text style={styles.practiceBtnText}>
                  Praticar Questões deste Assunto
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const baseStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    padding: 14,
  },
  card: {
    flex: 1,
    maxHeight: '90%',
    backgroundColor: AppPalette.surface,
    borderRadius: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: AppPalette.border,
    backgroundColor: AppPalette.background,
    gap: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  typeBadgeText: { fontSize: 11, fontWeight: '800' },
  subjectText: {
    fontSize: 11,
    fontWeight: '700',
    color: AppPalette.textMuted,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: AppPalette.textPrimary,
  },
  authorSub: {
    fontSize: 12,
    color: AppPalette.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: AppPalette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 18, paddingBottom: 32 },
  plainBody: {
    fontSize: 15,
    color: AppPalette.textSecondary,
    lineHeight: 24,
  },
  footerActionBox: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: AppPalette.border,
  },
  practiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: AppPalette.success,
    paddingVertical: 14,
    borderRadius: 14,
  },
  practiceBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
