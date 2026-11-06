import React from 'react';
// 1. Adicionamos StyleProp, ViewStyle e TextStyle na importação
import { TouchableOpacity, Text, StyleSheet, StyleProp, ViewStyle, TextStyle } from 'react-native';

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
  onPress 
}: OptionButtonProps) {
  
  // 2. Tipamos as variáveis avisando que elas aceitam as regras de estilo do React Native (objetos ou arrays)
  let containerStyle: StyleProp<ViewStyle> = styles.container;
  let textStyle: StyleProp<TextStyle> = styles.text;

  if (isAnswered) {
    if (isCorrectOption) {
      containerStyle = [styles.container, styles.correctContainer];
      textStyle = [styles.text, styles.correctText];
    } else if (isSelected) {
      containerStyle = [styles.container, styles.wrongContainer];
      textStyle = [styles.text, styles.wrongText];
    } else {
      containerStyle = [styles.container, styles.disabledContainer];
    }
  } else if (isSelected) {
    containerStyle = [styles.container, styles.selectedContainer];
  }

  return (
    <TouchableOpacity 
      style={containerStyle} 
      onPress={onPress}
      activeOpacity={0.7}
      disabled={isAnswered}
    >
      <Text style={textStyle}>
        <Text style={{ fontWeight: 'bold' }}>{label}) </Text>{text}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 2,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  selectedContainer: {
    borderColor: '#84D8FF',
    backgroundColor: '#E1F5FE',
  },
  correctContainer: {
    borderColor: '#58CC02',
    backgroundColor: '#D7FFB8',
  },
  wrongContainer: {
    borderColor: '#FF4B4B',
    backgroundColor: '#FFD1D1',
  },
  disabledContainer: {
    opacity: 0.5,
  },
  text: {
    fontSize: 16,
    color: '#4B5563',
  },
  correctText: {
    color: '#3A8A00',
    fontWeight: 'bold',
  },
  wrongText: {
    color: '#C40000',
    fontWeight: 'bold',
  }
});