import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { AppPalette } from '@/constants/theme';

interface ClassroomStudentsTabProps {
  classroomCode: string;
  students?: Array<{
    id: string;
    name: string;
    currentStreak?: number;
    xp?: number;
  }>;
  onShareInvite: () => void;
}

export function ClassroomStudentsTab({
  classroomCode,
  students = [],
  onShareInvite,
}: ClassroomStudentsTabProps) {
  return (
    <View style={styles.tabSection}>
      <View style={styles.inviteBox}>
        <View style={{ flex: 1 }}>
          <Text style={styles.inviteTitle}>Convide mais participantes</Text>
          <Text style={styles.inviteSub}>Código: {classroomCode}</Text>
        </View>
        <TouchableOpacity style={styles.inviteBtn} onPress={onShareInvite}>
          <FontAwesome5 name="share-alt" size={12} color="#FFF" />
          <Text style={styles.inviteBtnText}>Convidar</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.studentsListCard}>
        {students.length > 0 ? (
          students.map((student) => (
            <View key={student.id} style={styles.studentRow}>
              <View style={styles.studentAvatar}>
                <Text style={styles.studentAvatarText}>
                  {student.name?.charAt(0)?.toUpperCase() || 'A'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.studentName}>{student.name}</Text>
                <Text style={styles.studentSub}>
                  {student.currentStreak || 0} dias de ofensiva
                </Text>
              </View>
              <Text style={styles.studentXp}>{student.xp || 0} XP</Text>
            </View>
          ))
        ) : (
          <View style={styles.emptyBox}>
            <FontAwesome5
              name="user-friends"
              size={32}
              color={AppPalette.borderStrong}
              style={{ marginBottom: 10 }}
            />
            <Text style={styles.emptyTitle}>
              Nenhum aluno matriculado ainda.
            </Text>
            <Text style={styles.emptySub}>
              Compartilhe o código {classroomCode} para que os estudantes entrem
              nesta sala.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabSection: { padding: 16, gap: 14 },
  inviteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppPalette.primaryLight,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: AppPalette.primaryBorder,
  },
  inviteTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: AppPalette.textPrimary,
  },
  inviteSub: {
    fontSize: 12,
    fontWeight: '700',
    color: AppPalette.primaryDark,
    marginTop: 2,
  },
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: AppPalette.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  inviteBtnText: { color: '#FFF', fontWeight: '800', fontSize: 12 },
  studentsListCard: {
    backgroundColor: AppPalette.surface,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: AppPalette.border,
  },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: AppPalette.surfaceMuted,
  },
  studentAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: AppPalette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentAvatarText: { color: '#FFF', fontWeight: '800', fontSize: 15 },
  studentName: {
    fontSize: 14,
    fontWeight: '800',
    color: AppPalette.textPrimary,
  },
  studentSub: { fontSize: 11, color: AppPalette.textMuted, marginTop: 1 },
  studentXp: {
    fontSize: 13,
    fontWeight: '800',
    color: AppPalette.warning,
  },
  emptyBox: { padding: 24, alignItems: 'center' },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: AppPalette.textMuted,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 12,
    color: AppPalette.textSubtle,
    textAlign: 'center',
    marginTop: 4,
  },
});
