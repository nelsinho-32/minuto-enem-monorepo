import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { io, Socket } from 'socket.io-client';
import { BASE_URL } from '@/services/api';
import { useUserStore } from '@/store/useUserStore';
import {
  useNotificationStore,
  type RealtimeNotificationItem,
} from '@/store/useNotificationStore';
import { useTheme } from '@/hooks/use-theme';

/**
 * Ponte global de Notificações em Tempo Real via Socket.IO (`notification:new`).
 * Conecta com o token JWT do usuário logado e exibe um toast discreto no topo da tela.
 */
export function RealtimeNotificationsBridge() {
  const router = useRouter();
  const theme = useTheme();
  const token = useUserStore((s) => s.token);
  const userId = useUserStore((s) => s.user?.id);
  const activeToast = useNotificationStore((s) => s.activeToast);
  const pushNotification = useNotificationStore((s) => s.pushNotification);
  const dismissToast = useNotificationStore((s) => s.dismissToast);

  const socketRef = useRef<Socket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!token || !userId) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const socket = io(BASE_URL, {
      transports: ['websocket', 'polling'],
      auth: { token },
      reconnectionAttempts: 10,
      reconnectionDelay: 2500,
    });
    socketRef.current = socket;

    socket.on('notification:new', (payload: RealtimeNotificationItem) => {
      if (!payload?.title) return;
      pushNotification(payload);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, userId, pushNotification]);

  useEffect(() => {
    if (!activeToast) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      dismissToast();
    }, 5500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activeToast, dismissToast]);

  if (!activeToast) return null;

  const iconName =
    activeToast.type === 'ESSAY_GRADED'
      ? 'pen-fancy'
      : activeToast.type === 'NEW_MESSAGE'
        ? 'comment-dots'
        : activeToast.type === 'NEW_TASK'
          ? 'clipboard-list'
          : 'bell';

  const accentColor =
    activeToast.type === 'ESSAY_GRADED'
      ? '#7C3AED'
      : activeToast.type === 'NEW_MESSAGE'
        ? '#0284C7'
        : '#16A34A';

  return (
    <View
      pointerEvents="box-none"
      style={styles.overlayContainer}
    >
      <TouchableOpacity
        activeOpacity={0.92}
        onPress={() => {
          const targetRoute = activeToast.route;
          const targetParams = activeToast.routeParams;
          dismissToast();
          if (targetRoute) {
            router.push({ pathname: targetRoute as any, params: targetParams });
          }
        }}
        style={[
          styles.toastCard,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            borderLeftColor: accentColor,
          },
        ]}
      >
        <View style={[styles.iconBox, { backgroundColor: `${accentColor}1A` }]}>
          <FontAwesome5 name={iconName} size={15} color={accentColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
            {activeToast.title}
          </Text>
          <Text style={[styles.body, { color: theme.textMuted }]} numberOfLines={2}>
            {activeToast.body}
          </Text>
        </View>
        <TouchableOpacity
          onPress={dismissToast}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.closeBtn}
        >
          <FontAwesome5 name="times" size={13} color={theme.textMuted} />
        </TouchableOpacity>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 16 : 52,
    left: 16,
    right: 16,
    zIndex: 9999,
    alignItems: 'center',
  },
  toastCard: {
    width: '100%',
    maxWidth: 460,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 13,
    borderRadius: 16,
    borderWidth: 1,
    borderLeftWidth: 4,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 8,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 13.5,
    fontWeight: '800',
    marginBottom: 2,
  },
  body: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  closeBtn: {
    padding: 4,
  },
});
