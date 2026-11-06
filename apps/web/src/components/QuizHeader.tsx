import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons'; // Biblioteca de ícones nativa do Expo

interface QuizHeaderProps {
  progress: number; // Vai receber um valor de 0 a 1
  streak: number;
  xp: number;
}

export function QuizHeader({ progress, streak, xp }: QuizHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.statBadge}>
        <FontAwesome5 name="fire-alt" size={16} color={streak > 0 ? '#FF9600' : '#E2E8F0'} />
        <Text style={[styles.statText, { color: streak > 0 ? '#FF9600' : '#8CA0B3' }]}>
          {streak}
        </Text>
      </View>

      <View style={styles.progressBarContainer}>
        <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
      </View>

      <View style={styles.statBadge}>
        <FontAwesome5 name="star" size={16} color="#F1C40F" solid />
        <Text style={[styles.statText, { color: '#D4A017' }]}>
          {xp}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
  },
  statBadge: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  progressBarContainer: {
    flex: 1,
    height: 14,
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    marginHorizontal: 15,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#58CC02',
    borderRadius: 10,
  },
});