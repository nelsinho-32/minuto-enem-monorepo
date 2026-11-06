import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { useUserStore } from '@/store/useUserStore';

export function StreakBadge() {
  const currentStreak = useUserStore((state) => state.currentStreak);
  const iceFreezes = useUserStore((state) => state.iceFreezes);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.18,
          duration: 600,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  return (
    <View style={styles.container}>
      {/* Gelinhos Acumulados (🧊 iceFreezes) */}
      <View style={styles.iceBadge}>
        <Text style={styles.emoji}>🧊</Text>
        <Text style={styles.iceText}>{iceFreezes}</Text>
      </View>

      {/* Foguinhos da Ofensiva (🔥 currentStreak) */}
      <View style={styles.fireBadge}>
        <Animated.Text
          style={[styles.emoji, { transform: [{ scale: pulseAnim }] }]}
        >
          🔥
        </Animated.Text>
        <Text style={styles.fireText}>{currentStreak}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  iceText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0284C7',
  },
  fireBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF0D4',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FFB84D',
  },
  fireText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FF9600',
  },
  emoji: {
    fontSize: 14,
  },
});

