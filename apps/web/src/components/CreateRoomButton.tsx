import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useUserStore } from '@/store/useUserStore';

export interface CreateRoomButtonProps {
  onPress?: (roomId?: string) => void;
  mode?: 'classroom' | 'duel';
  title?: string;
  subject?: string;
}

export function CreateRoomButton({
  onPress,
  mode = 'classroom',
  title,
  subject,
}: CreateRoomButtonProps) {
  const router = useRouter();
  const role = useUserStore((state) => state.user?.role);

  // Turmas só podem ser criadas por professores
  if (mode === 'classroom' && role !== 'TEACHER') {
    return null;
  }

  const handlePress = () => {
    if (mode === 'duel') {
      const customRoomId = `sala_${Date.now().toString(36).slice(-4).toUpperCase()}`;
      if (onPress) {
        onPress(customRoomId);
      } else {
        router.push({
          pathname: '/challenge',
          params: { roomId: customRoomId, subject: subject || 'Geral' },
        } as any);
      }
      return;
    }

    if (onPress) {
      onPress();
    } else {
      router.push('/classes/new' as any);
    }
  };

  const isDuel = mode === 'duel';
  const label =
    title || (isDuel ? 'Criar Sala de Duelo Privada' : 'Criar Nova Turma');
  const icon = isDuel ? 'gamepad' : 'plus-circle';
  const bgColor = isDuel ? '#8E44AD' : '#58CC02';

  return (
    <TouchableOpacity
      style={[styles.button, { backgroundColor: bgColor }]}
      activeOpacity={0.8}
      onPress={handlePress}
    >
      <FontAwesome5 name={icon} size={16} color="#FFFFFF" />
      <Text style={styles.text}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#58CC02',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    marginBottom: 12,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
