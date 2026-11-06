import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

export interface DuelProgressBarProps {
  myName: string;
  myScore: number;
  myProgressPercent: number; // 0 a 100
  opponentName: string;
  opponentScore: number;
  opponentProgressPercent: number; // 0 a 100
  totalQuestions: number;
}

export function DuelProgressBar({
  myName,
  myScore,
  myProgressPercent,
  opponentName,
  opponentScore,
  opponentProgressPercent,
}: DuelProgressBarProps) {
  const myWidth = useSharedValue(0);
  const opponentWidth = useSharedValue(0);
  const myScoreScale = useSharedValue(1);
  const opponentScoreScale = useSharedValue(1);

  useEffect(() => {
    myWidth.value = withSpring(Math.min(100, Math.max(0, myProgressPercent)), {
      damping: 14,
      stiffness: 110,
    });
    myScoreScale.value = withSpring(1.15, { damping: 8 }, () => {
      myScoreScale.value = withTiming(1, { duration: 200 });
    });
  }, [myProgressPercent, myScore, myWidth, myScoreScale]);

  useEffect(() => {
    opponentWidth.value = withSpring(
      Math.min(100, Math.max(0, opponentProgressPercent)),
      {
        damping: 14,
        stiffness: 110,
      }
    );
    opponentScoreScale.value = withSpring(1.15, { damping: 8 }, () => {
      opponentScoreScale.value = withTiming(1, { duration: 200 });
    });
  }, [opponentProgressPercent, opponentScore, opponentWidth, opponentScoreScale]);

  const myBarAnimatedStyle = useAnimatedStyle(() => ({
    width: `${myWidth.value}%`,
  }));

  const opponentBarAnimatedStyle = useAnimatedStyle(() => ({
    width: `${opponentWidth.value}%`,
  }));

  const myScoreAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: myScoreScale.value }],
  }));

  const opponentScoreAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: opponentScoreScale.value }],
  }));

  return (
    <View style={styles.container}>
      {/* JOGADOR 1 (VOCÊ) */}
      <View style={styles.playerSection}>
        <View style={styles.playerHeader}>
          <View style={styles.playerInfo}>
            <View style={[styles.avatarBadge, { backgroundColor: '#1CB0F6' }]}>
              <FontAwesome5 name="user-astronaut" size={11} color="#FFF" />
            </View>
            <Text style={styles.playerName} numberOfLines={1}>
              {myName} (Você)
            </Text>
          </View>
          <Animated.Text style={[styles.scoreValue, { color: '#1CB0F6' }, myScoreAnimatedStyle]}>
            {myScore} pts
          </Animated.Text>
        </View>

        <View style={styles.trackBg}>
          <Animated.View
            style={[
              styles.trackFill,
              { backgroundColor: '#1CB0F6' },
              myBarAnimatedStyle,
            ]}
          />
        </View>
      </View>

      {/* DIVISOR VS */}
      <View style={styles.vsBadge}>
        <FontAwesome5 name="bolt" size={12} color="#F1C40F" />
        <Text style={styles.vsText}>VS</Text>
      </View>

      {/* JOGADOR 2 (OPONENTE) */}
      <View style={styles.playerSection}>
        <View style={styles.playerHeader}>
          <View style={styles.playerInfo}>
            <View style={[styles.avatarBadge, { backgroundColor: '#FF4B4B' }]}>
              <FontAwesome5 name="user-ninja" size={11} color="#FFF" />
            </View>
            <Text style={styles.playerName} numberOfLines={1}>
              {opponentName}
            </Text>
          </View>
          <Animated.Text
            style={[styles.scoreValue, { color: '#FF4B4B' }, opponentScoreAnimatedStyle]}
          >
            {opponentScore} pts
          </Animated.Text>
        </View>

        <View style={styles.trackBg}>
          <Animated.View
            style={[
              styles.trackFill,
              { backgroundColor: '#FF4B4B' },
              opponentBarAnimatedStyle,
            ]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    gap: 10,
  },
  playerSection: {
    gap: 6,
  },
  playerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  playerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  avatarBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerName: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1E293B',
    flex: 1,
  },
  scoreValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  trackBg: {
    width: '100%',
    height: 10,
    backgroundColor: '#F1F5F9',
    borderRadius: 5,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    borderRadius: 5,
  },
  vsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    alignSelf: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 10,
  },
  vsText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFF',
    letterSpacing: 1,
  },
});

