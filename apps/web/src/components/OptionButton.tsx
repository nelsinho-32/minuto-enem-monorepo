import React from 'react';
import {
  TouchableOpacity,
  Text,
  View,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TextStyle,
} from 'react-native';
import {
  AutoSizedQuestionImage,
  splitMarkdownSegments,
} from './QuestionContentRenderer';

interface OptionButtonProps {
  label: string;
  text: string;
  isSelected: boolean;
  isAnswered: boolean;
  isCorrectOption: boolean;
  onPress: () => void;
}

export function OptionButton({
  label,
  text,
  isSelected,
  isAnswered,
  isCorrectOption,
  onPress,
}: OptionButtonProps) {
  let containerStyle: StyleProp<ViewStyle> = styles.container;
  let textStyle: StyleProp<TextStyle> = styles.text;
  let badgeStyle: StyleProp<ViewStyle> = styles.letterBadge;
  let badgeTextStyle: StyleProp<TextStyle> = styles.letterBadgeText;

  if (isAnswered) {
    if (isCorrectOption) {
      containerStyle = [styles.container, styles.correctContainer];
      textStyle = [styles.text, styles.correctText];
      badgeStyle = [styles.letterBadge, { backgroundColor: '#16A34A' }];
      badgeTextStyle = [styles.letterBadgeText, { color: '#FFFFFF' }];
    } else if (isSelected) {
      containerStyle = [styles.container, styles.wrongContainer];
      textStyle = [styles.text, styles.wrongText];
      badgeStyle = [styles.letterBadge, { backgroundColor: '#DC2626' }];
      badgeTextStyle = [styles.letterBadgeText, { color: '#FFFFFF' }];
    } else {
      containerStyle = [styles.container, styles.disabledContainer];
    }
  } else if (isSelected) {
    containerStyle = [styles.container, styles.selectedContainer];
    badgeStyle = [styles.letterBadge, { backgroundColor: '#0284C7' }];
    badgeTextStyle = [styles.letterBadgeText, { color: '#FFFFFF' }];
  }

  const hasImageInOption = /!\[[^\]]*\]\([^)]+\)/.test(text || '');
  const segments = hasImageInOption ? splitMarkdownSegments(text) : [];

  return (
    <TouchableOpacity
      style={containerStyle}
      onPress={onPress}
      activeOpacity={0.75}
      disabled={isAnswered}
    >
      <View style={styles.row}>
        <View style={badgeStyle}>
          <Text style={badgeTextStyle}>{label}</Text>
        </View>

        <View style={styles.contentColumn}>
          {hasImageInOption ? (
            segments.map((seg, i) =>
              seg.type === 'image' ? (
                <AutoSizedQuestionImage
                  key={`opt-img-${i}`}
                  rawUrl={seg.url}
                  altText={seg.alt}
                  compact
                />
              ) : (
                <Text key={`opt-txt-${i}`} style={textStyle}>
                  {seg.content}
                </Text>
              )
            )
          ) : (
            <Text style={textStyle}>{text}</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 2,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  selectedContainer: {
    borderColor: '#0284C7',
    backgroundColor: '#F0F9FF',
  },
  correctContainer: {
    borderColor: '#16A34A',
    backgroundColor: '#F0FDF4',
  },
  wrongContainer: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  disabledContainer: {
    opacity: 0.55,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  letterBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
  },
  contentColumn: {
    flex: 1,
  },
  text: {
    fontSize: 15,
    color: '#334155',
    lineHeight: 22,
  },
  correctText: {
    color: '#15803D',
    fontWeight: '800',
  },
  wrongText: {
    color: '#B91C1C',
    fontWeight: '800',
  },
});
