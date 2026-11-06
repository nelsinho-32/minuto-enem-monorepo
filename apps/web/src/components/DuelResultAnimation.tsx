import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withRepeat,
  withTiming,
  FadeIn,
} from 'react-native-reanimated';

export interface DuelResultAnimationProps {
  visible: boolean;
  outcome: 'VICTORY' | 'DEFEAT' | 'DRAW';
  myScore: number;
  opponentScore: number;
  opponentName: string;
  xpEarned: number;
  onPlayAgain: () => void;
  onExit: () => void;
}

export function DuelResultAnimation({
  visible,
  outcome,
  myScore,
  opponentScore,
  opponentName,
  xpEarned,
  onPlayAgain,
  onExit,
}: DuelResultAnimationProps) {
  const cardScale = useSharedValue(0.6);
  const badgeRotate = useSharedValue(0);
  const badgePulse = useSharedValue(1);

  useEffect(() => {
    if (visible) {
      cardScale.value = withSpring(1, { damping: 12, stiffness: 120 });

      if (outcome === 'VICTORY') {
        badgePulse.value = withRepeat(
          withSequence(
            withTiming(1.14, { duration: 550 }),
            withTiming(1, { duration: 550 })
          ),
          -1,
          true
        );
        badgeRotate.value = withSequence(
          withTiming(-8, { duration: 150 }),
          withTiming(8, { duration: 150 }),
          withTiming(0, { duration: 150 })
        );
      } else if (outcome === 'DEFEAT') {
        badgeRotate.value = withSequence(
          withTiming(-12, { duration: 90 }),
          withTiming(12, { duration: 90 }),
          withTiming(-8, { duration: 90 }),
          withTiming(8, { duration: 90 }),
          withTiming(0, { duration: 90 })
        );
        badgePulse.value = withTiming(0.95, { duration: 300 });
      } else {
        badgePulse.value = withTiming(1, { duration: 300 });
        badgeRotate.value = withTiming(0, { duration: 300 });
      }
    } else {
      cardScale.value = 0.6;
    }
  }, [visible, outcome, cardScale, badgePulse, badgeRotate]);

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
  }));

  const badgeAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: badgePulse.value },
      { rotateZ: `${badgeRotate.value}deg` },
    ],
  }));

  if (!visible) return null;

  const isVictory = outcome === 'VICTORY';
  const isDraw = outcome === 'DRAW';

  const accentColor = isVictory ? '#58CC02' : isDraw ? '#F1C40F' : '#FF4B4B';
  const iconName = isVictory ? 'trophy' : isDraw ? 'handshake' : 'shield-alt';
  const titleText = isVictory
    ? 'VITÓRIA ÉPICA!'
    : isDraw
    ? 'EMPATE TÉCNICO!'
    : 'DERROTA NA ARENA';
  const subtitleText = isVictory
    ? `Você superou ${opponentName} no duelo em tempo real!`
    : isDraw
    ? `Você e ${opponentName} empataram ponto a ponto!`
    : `${opponentName} levou a melhor desta vez. Não desista!`;

  return (
    <Animated.View entering={FadeIn.duration(220)} style={styles.overlay}>
      <Animated.View
        style={[
          styles.modalCard,
          { borderTopColor: accentColor },
          cardAnimatedStyle,
        ]}
      >
        <Animated.View
          style={[
            styles.iconCircle,
            { backgroundColor: `${accentColor}20`, borderColor: accentColor },
            badgeAnimatedStyle,
          ]}
        >
          <FontAwesome5 name={iconName} size={42} color={accentColor} />
        </Animated.View>

        <Text style={[styles.title, { color: accentColor }]}>{titleText}</Text>
        <Text style={styles.subtitle}>{subtitleText}</Text>

        <View style={styles.scoreboardBox}>
          <View style={styles.scoreCol}>
            <Text style={styles.scoreLabel}>VOCÊ</Text>
            <Text style={[styles.scoreBig, { color: '#1CB0F6' }]}>{myScore}</Text>
          </View>

          <View style={styles.scoreDivider} />

          <View style={styles.scoreCol}>
            <Text style={styles.scoreLabel} numberOfLines={1}>
              {opponentName.toUpperCase()}
            </Text>
            <Text style={[styles.scoreBig, { color: '#FF4B4B' }]}>
              {opponentScore}
            </Text>
          </View>
        </View>

        <View style={styles.xpRewardPill}>
          <FontAwesome5 name="star" size={14} color="#F1C40F" solid />
          <Text style={styles.xpRewardText}>+{xpEarned} XP conquistados na Arena</Text>
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: accentColor }]}
            onPress={onPlayAgain}
            activeOpacity={0.85}
          >
            <FontAwesome5 name="redo" size={14} color="#FFF" />
            <Text style={styles.primaryButtonText}>Revanche</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={onExit}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryButtonText}>Sair da Arena</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 100,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderTopWidth: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  iconCircle: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  scoreboardBox: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  scoreCol: {
    flex: 1,
    alignItems: 'center',
  },
  scoreDivider: {
    width: 1,
    backgroundColor: '#E2E8F0',
  },
  scoreLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#94A3B8',
    marginBottom: 4,
  },
  scoreBig: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  xpRewardPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF9C3',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 20,
  },
  xpRewardText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#854D0E',
  },
  actionsRow: {
    width: '100%',
    gap: 10,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  primaryButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  secondaryButton: {
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
  },
  secondaryButtonText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
