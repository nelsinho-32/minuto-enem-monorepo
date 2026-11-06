import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';

export interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: string;
  icon?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  visible,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  confirmColor = '#FF4B4B',
  icon = 'exclamation-triangle',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!visible) return null;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onCancel}
    >
      <TouchableWithoutFeedback onPress={onCancel}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <View style={styles.modalCard}>
              <View style={[styles.iconCircle, { backgroundColor: `${confirmColor}15` }]}>
                <FontAwesome5 name={icon} size={24} color={confirmColor} />
              </View>

              <Text style={styles.title}>{title}</Text>
              <Text style={styles.message}>{message}</Text>

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  activeOpacity={0.7}
                  onPress={onCancel}
                >
                  <Text style={styles.cancelText}>{cancelText}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.confirmButton, { backgroundColor: confirmColor }]}
                  activeOpacity={0.8}
                  onPress={onConfirm}
                >
                  <Text style={styles.confirmText}>{confirmText}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2C3A47',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#8CA0B3',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4B5563',
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});

