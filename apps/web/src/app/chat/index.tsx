import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { io, Socket } from 'socket.io-client';
import { safeAsyncStorage as AsyncStorage } from '@/services/safeStorage';
import { BASE_URL } from '@/services/api';
import { useUserStore } from '@/store/useUserStore';
import {
  useChatStore,
  type ChatCategory,
  type ChatMessageItem,
  type ChatRoomItem,
  type ChatUserOption,
} from '@/store/useChatStore';

const FORUM_OPT_IN_KEY = '@minuto_enem:forum_opt_in_v1';

const CATEGORIES: Array<{
  key: ChatCategory;
  label: string;
  color: string;
  bg: string;
  icon: string;
}> = [
  { key: 'GERAL', label: 'Geral', color: '#475569', bg: '#F1F5F9', icon: 'comments' },
  { key: 'DUVIDA', label: 'Dúvida', color: '#D97706', bg: '#FEF3C7', icon: 'question-circle' },
  { key: 'MACETE', label: 'Macete', color: '#16A34A', bg: '#DCFCE7', icon: 'lightbulb' },
  { key: 'QUESTAO', label: 'Questão', color: '#0284C7', bg: '#E0F2FE', icon: 'book-open' },
];

type RoleFilter = 'ALL' | 'TEACHER' | 'SCHOOL' | 'STUDENT';

function getRoleBadge(role?: string) {
  switch (role) {
    case 'TEACHER':
      return { label: 'Professor(a)', bg: '#DBEAFE', color: '#1D4ED8', icon: 'chalkboard-teacher' };
    case 'SCHOOL':
      return { label: 'Escola', bg: '#F3E8FF', color: '#7E22CE', icon: 'school' };
    case 'ADMIN':
      return { label: 'Coordenação', bg: '#FEE2E2', color: '#B91C1C', icon: 'user-shield' };
    default:
      return { label: 'Colega', bg: '#DCFCE7', color: '#15803D', icon: 'user-graduate' };
  }
}

function formatMessageTime(isoDate: string) {
  try {
    const d = new Date(isoDate);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function UserChatsAndForumScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    subject?: string;
    topic?: string;
    category?: string;
    tab?: string;
  }>();
  const { width } = useWindowDimensions();
  const isWide = width >= 820;

  const user = useUserStore((s) => s.user);
  const token = useUserStore((s) => s.token);
  const {
    globalRoom,
    classroomRooms,
    directRooms,
    activeRoomId,
    messagesByRoom,
    isLoadingRooms,
    isLoadingMessages,
    isSending,
    fetchRooms,
    setActiveRoomId,
    sendMessage,
    appendIncomingMessage,
    updateMessageLikes,
    toggleLike,
    startDirectChat,
    searchUsers,
  } = useChatStore();

  // Aba principal: 'CHATS' (Colegas, Professores, Escola e Turmas) vs 'FORUM' (Fórum opcional)
  const [mainTab, setMainTab] = useState<'CHATS' | 'FORUM'>(
    params.tab === 'FORUM' ? 'FORUM' : 'CHATS'
  );
  const [hasJoinedForum, setHasJoinedForum] = useState<boolean>(false);
  const [forumTopicFilter, setForumTopicFilter] = useState<'ALL' | ChatCategory>('ALL');

  const [inputText, setInputText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ChatCategory>(
    params.category === 'DUVIDA' || params.subject ? 'DUVIDA' : 'GERAL'
  );
  const [subjectTag, setSubjectTag] = useState(params.subject || '');
  const [mobileShowRooms, setMobileShowRooms] = useState(false);
  const [typingUser, setTypingUser] = useState<string | null>(null);

  // Diretório de contatos (Colegas, Professores e Escola)
  const [isNewDmOpen, setIsNewDmOpen] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');
  const [directoryUsers, setDirectoryUsers] = useState<ChatUserOption[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const flatListRef = useRef<FlatList<ChatMessageItem>>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Carrega decisão local do usuário sobre participar do Fórum
  useEffect(() => {
    AsyncStorage.getItem(FORUM_OPT_IN_KEY)
      .then((val) => {
        if (val === 'true') setHasJoinedForum(true);
      })
      .catch(() => {});
  }, []);

  const handleJoinForum = async () => {
    setHasJoinedForum(true);
    try {
      await AsyncStorage.setItem(FORUM_OPT_IN_KEY, 'true');
    } catch {}
    if (globalRoom?.id) {
      setActiveRoomId(globalRoom.id);
    }
  };

  const handleLeaveForum = async () => {
    setHasJoinedForum(false);
    try {
      await AsyncStorage.setItem(FORUM_OPT_IN_KEY, 'false');
    } catch {}
    const firstPrivate = directRooms[0] || classroomRooms[0];
    if (firstPrivate) {
      setActiveRoomId(firstPrivate.id);
    }
    setMainTab('CHATS');
  };

  // Carrega salas e contatos iniciais
  useEffect(() => {
    if (user?.id) {
      fetchRooms();
      searchUsers('').then((list) => setDirectoryUsers(list));
    }
  }, [user?.id, fetchRooms, searchUsers]);

  // Preenche dúvida se veio de uma aula específica
  useEffect(() => {
    if (params.topic && !inputText) {
      setInputText(`Olá! Estou estudando "${params.topic}" e tenho uma dúvida: `);
    }
  }, [params.topic]);

  // Quando alterna entre 'CHATS' e 'FORUM', ajusta a sala ativa
  useEffect(() => {
    if (mainTab === 'FORUM') {
      if (hasJoinedForum && globalRoom?.id && activeRoomId !== globalRoom.id) {
        setActiveRoomId(globalRoom.id);
      }
    } else {
      if (activeRoomId === globalRoom?.id) {
        const nextRoom = directRooms[0] || classroomRooms[0];
        if (nextRoom) setActiveRoomId(nextRoom.id);
      }
    }
  }, [mainTab, hasJoinedForum, globalRoom?.id]);

  // Conexão Socket.IO em tempo real autenticada com JWT
  useEffect(() => {
    if (!user?.id || !token) return;

    const socket = io(BASE_URL, {
      transports: ['websocket', 'polling'],
      auth: { token },
      reconnectionAttempts: 10,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      const currentRoom = useChatStore.getState().activeRoomId;
      if (currentRoom) {
        socket.emit('chat:join_room', { roomId: currentRoom });
      }
    });

    socket.on('chat:new_message', (msg: ChatMessageItem) => {
      appendIncomingMessage(msg);
    });

    socket.on(
      'chat:message_liked',
      (payload: { messageId: string; likesCount: number }) => {
        updateMessageLikes(payload.messageId, payload.likesCount);
      }
    );

    socket.on(
      'chat:user_typing',
      (payload: { roomId: string; userName: string; isTyping: boolean }) => {
        if (payload.roomId === useChatStore.getState().activeRoomId) {
          setTypingUser(payload.isTyping ? payload.userName : null);
        }
      }
    );

    socket.on('chat:error', (payload: { error?: string }) => {
      if (payload?.error) {
        console.warn('[Chat Socket Error]:', payload.error);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user?.id, token, appendIncomingMessage, updateMessageLikes]);

  // Entra e sai da sala ativa via Socket.IO
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !activeRoomId) return;

    setTypingUser(null);
    socket.emit('chat:join_room', { roomId: activeRoomId });

    return () => {
      socket.emit('chat:leave_room', { roomId: activeRoomId });
    };
  }, [activeRoomId]);

  // Busca usuários no modal/diretório
  useEffect(() => {
    let active = true;
    setIsSearchingUsers(true);
    const timer = setTimeout(async () => {
      const results = await searchUsers(userSearchQuery);
      if (active) {
        setDirectoryUsers(results);
        setIsSearchingUsers(false);
      }
    }, 220);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [userSearchQuery, searchUsers]);

  const filteredDirectoryUsers = useMemo(() => {
    if (roleFilter === 'ALL') return directoryUsers;
    if (roleFilter === 'SCHOOL') {
      return directoryUsers.filter(
        (u) => u.role === 'SCHOOL' || u.role === 'ADMIN'
      );
    }
    return directoryUsers.filter((u) => u.role === roleFilter);
  }, [directoryUsers, roleFilter]);

  const privateAndClassroomRooms = useMemo(
    () => [...directRooms, ...classroomRooms],
    [directRooms, classroomRooms]
  );

  const activeRoom = useMemo(() => {
    if (mainTab === 'FORUM') return globalRoom;
    return (
      privateAndClassroomRooms.find((r) => r.id === activeRoomId) ||
      privateAndClassroomRooms[0] ||
      null
    );
  }, [mainTab, globalRoom, privateAndClassroomRooms, activeRoomId]);

  const rawMessages = activeRoom?.id ? messagesByRoom[activeRoom.id] || [] : [];

  const messages = useMemo(() => {
    if (mainTab === 'FORUM' && forumTopicFilter !== 'ALL') {
      return rawMessages.filter((m) => m.category === forumTopicFilter);
    }
    return rawMessages;
  }, [rawMessages, mainTab, forumTopicFilter]);

  const handleSelectRoom = (room: ChatRoomItem) => {
    setActiveRoomId(room.id);
    setMobileShowRooms(false);
  };

  const handleTextChange = (text: string) => {
    setInputText(text);
    if (socketRef.current && activeRoom?.id) {
      socketRef.current.emit('chat:typing', {
        roomId: activeRoom.id,
        userName: user?.name || 'Usuário',
        isTyping: text.trim().length > 0,
      });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socketRef.current?.emit('chat:typing', {
          roomId: activeRoom.id,
          userName: user?.name || 'Usuário',
          isTyping: false,
        });
      }, 2000);
    }
  };

  const handleSend = async () => {
    if (!activeRoom?.id || !inputText.trim() || isSending) return;
    const textToSend = inputText.trim();
    setInputText('');

    if (socketRef.current) {
      socketRef.current.emit('chat:typing', {
        roomId: activeRoom.id,
        userName: user?.name || 'Usuário',
        isTyping: false,
      });
    }

    await sendMessage({
      roomId: activeRoom.id,
      content: textToSend,
      category: selectedCategory,
      subjectTag: subjectTag || undefined,
    });

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const handleStartDirect = async (target: ChatUserOption) => {
    const room = await startDirectChat(target.id);
    if (room) {
      setMainTab('CHATS');
      setIsNewDmOpen(false);
      setUserSearchQuery('');
      setMobileShowRooms(false);
    }
  };

  const renderRoomItem = (room: ChatRoomItem) => {
    const isActive = activeRoom?.id === room.id;
    const isClassroom = room.type === 'CLASSROOM';
    const roleInfo = getRoleBadge(room.peer?.role);

    return (
      <TouchableOpacity
        key={room.id}
        style={[styles.roomItem, isActive && styles.roomItemActive]}
        onPress={() => handleSelectRoom(room)}
        activeOpacity={0.8}
      >
        <View
          style={[
            styles.roomIconCircle,
            {
              backgroundColor: isClassroom ? '#DCFCE7' : roleInfo.bg,
            },
          ]}
        >
          <FontAwesome5
            name={isClassroom ? 'graduation-cap' : roleInfo.icon}
            size={14}
            color={isClassroom ? '#16A34A' : roleInfo.color}
          />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text
              style={[styles.roomName, isActive && styles.roomNameActive]}
              numberOfLines={1}
            >
              {room.name}
            </Text>
            {!isClassroom && room.peer?.role && (
              <View style={[styles.rolePill, { backgroundColor: roleInfo.bg }]}>
                <Text style={[styles.rolePillText, { color: roleInfo.color }]}>
                  {roleInfo.label}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.roomLastMsg} numberOfLines={1}>
            {room.lastMessage
              ? `${room.lastMessage.senderName}: ${room.lastMessage.content}`
              : isClassroom
              ? 'Toque para conversar com a turma'
              : 'Toque para enviar mensagem'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderSidebar = () => (
    <View
      style={[
        styles.sidebar,
        isWide ? styles.sidebarWide : styles.sidebarMobile,
      ]}
    >
      <View style={styles.sidebarHeader}>
        <Text style={styles.sidebarTitle}>Meus Contatos & Turmas</Text>
        <TouchableOpacity
          style={styles.newDmBtn}
          onPress={() => setIsNewDmOpen(true)}
          activeOpacity={0.8}
        >
          <FontAwesome5 name="plus" size={10} color="#FFF" />
          <Text style={styles.newDmBtnText}>Novo Chat</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {/* Salas das Turmas */}
        <View style={styles.roomGroup}>
          <Text style={styles.roomGroupTitle}>
            MINHAS TURMAS ({classroomRooms.length})
          </Text>
          {classroomRooms.length === 0 ? (
            <Text style={styles.emptyGroupHint}>
              Entre em uma turma na tela inicial para conversar com sua sala.
            </Text>
          ) : (
            classroomRooms.map((cr) => renderRoomItem(cr))
          )}
        </View>

        {/* Conversas Diretas com Professores, Escola e Colegas */}
        <View style={styles.roomGroup}>
          <Text style={styles.roomGroupTitle}>
            COLEGAS, PROFESSORES & ESCOLA ({directRooms.length})
          </Text>
          {directRooms.length === 0 ? (
            <Text style={styles.emptyGroupHint}>
              Escolha alguém abaixo ou toque em "Novo Chat" para iniciar uma conversa individual.
            </Text>
          ) : (
            directRooms.map((dr) => renderRoomItem(dr))
          )}
        </View>

        {/* Sugestões Rápidas de Pessoas (Professores, Escola e Colegas) */}
        {directoryUsers.length > 0 && (
          <View style={styles.roomGroup}>
            <Text style={styles.roomGroupTitle}>
              INICIAR CONVERSA RÁPIDA
            </Text>
            {directoryUsers.slice(0, 8).map((u) => {
              const badge = getRoleBadge(u.role);
              return (
                <TouchableOpacity
                  key={u.id}
                  style={styles.quickContactRow}
                  onPress={() => handleStartDirect(u)}
                  activeOpacity={0.75}
                >
                  <View
                    style={[
                      styles.quickContactAvatar,
                      { backgroundColor: badge.bg },
                    ]}
                  >
                    <FontAwesome5
                      name={badge.icon}
                      size={12}
                      color={badge.color}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.quickContactName} numberOfLines={1}>
                      {u.name}
                    </Text>
                    <Text
                      style={[
                        styles.quickContactRole,
                        { color: badge.color },
                      ]}
                    >
                      {badge.label}
                    </Text>
                  </View>
                  <FontAwesome5
                    name="comment-dots"
                    size={13}
                    color="#0284C7"
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );

  const renderMessage = ({ item }: { item: ChatMessageItem }) => {
    const isMe = item.senderId === user?.id;
    const roleBadge = getRoleBadge(item.senderRole);
    const catInfo =
      CATEGORIES.find((c) => c.key === item.category) || CATEGORIES[0];

    return (
      <View
        style={[
          styles.msgRow,
          isMe ? styles.msgRowMe : styles.msgRowOther,
        ]}
      >
        <View
          style={[
            styles.msgBubble,
            isMe ? styles.msgBubbleMe : styles.msgBubbleOther,
          ]}
        >
          <View style={styles.msgHeader}>
            <Text style={[styles.msgSender, isMe && { color: '#E0F2FE' }]}>
              {isMe ? 'Você' : item.senderName}
            </Text>
            {!isMe && (
              <View
                style={[styles.rolePill, { backgroundColor: roleBadge.bg }]}
              >
                <Text
                  style={[styles.rolePillText, { color: roleBadge.color }]}
                >
                  {roleBadge.label}
                </Text>
              </View>
            )}
            {item.category !== 'GERAL' && (
              <View
                style={[
                  styles.catPill,
                  {
                    backgroundColor: isMe
                      ? 'rgba(255,255,255,0.2)'
                      : catInfo.bg,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.catPillText,
                    { color: isMe ? '#FFF' : catInfo.color },
                  ]}
                >
                  {catInfo.label}
                </Text>
              </View>
            )}
            {item.subjectTag ? (
              <View
                style={[
                  styles.catPill,
                  {
                    backgroundColor: isMe
                      ? 'rgba(255,255,255,0.2)'
                      : '#F3E8FF',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.catPillText,
                    { color: isMe ? '#FFF' : '#7C3AED' },
                  ]}
                >
                  #{item.subjectTag}
                </Text>
              </View>
            ) : null}
          </View>

          <Text style={[styles.msgText, isMe && { color: '#FFFFFF' }]}>
            {item.content}
          </Text>

          <View style={styles.msgFooter}>
            <TouchableOpacity
              style={styles.likeBtn}
              onPress={() => toggleLike(item.id)}
              activeOpacity={0.7}
            >
              <FontAwesome5
                name="thumbs-up"
                solid={item.likedByMe}
                size={11}
                color={
                  isMe
                    ? '#E0F2FE'
                    : item.likedByMe
                    ? '#0284C7'
                    : '#94A3B8'
                }
              />
              {item.likesCount > 0 && (
                <Text
                  style={[
                    styles.likeCount,
                    isMe && { color: '#E0F2FE' },
                    !isMe && item.likedByMe && { color: '#0284C7' },
                  ]}
                >
                  {item.likesCount}
                </Text>
              )}
            </TouchableOpacity>
            <Text style={[styles.msgTime, isMe && { color: '#BAE6FD' }]}>
              {formatMessageTime(item.createdAt)}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* CABEÇALHO PRINCIPAL */}
      <View style={styles.topHeader}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <FontAwesome5 name="arrow-left" size={16} color="#1E293B" />
        </TouchableOpacity>

        {!isWide && mainTab === 'CHATS' && (
          <TouchableOpacity
            style={styles.roomsToggleBtn}
            onPress={() => setMobileShowRooms((prev) => !prev)}
            activeOpacity={0.8}
          >
            <FontAwesome5
              name={mobileShowRooms ? 'comments' : 'users'}
              size={13}
              color="#0284C7"
            />
            <Text style={styles.roomsToggleText}>
              {mobileShowRooms ? 'Ver Chat' : 'Contatos'}
            </Text>
          </TouchableOpacity>
        )}

        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.topHeaderTitle} numberOfLines={1}>
            {mainTab === 'FORUM'
              ? 'Fórum de Estudantes ENEM'
              : activeRoom?.name || 'Conversas & Turmas'}
          </Text>
          <Text style={styles.topHeaderSub} numberOfLines={1}>
            {mainTab === 'FORUM'
              ? 'Comunidade opcional • Dúvidas, macetes e debates de questões'
              : activeRoom?.type === 'CLASSROOM'
              ? 'Chat da sua turma com colegas e professor'
              : activeRoom?.peer
              ? `${getRoleBadge(activeRoom.peer.role).label} • ${activeRoom.peer.email}`
              : 'Converse com seus colegas, professores e escola'}
          </Text>
        </View>

        {mainTab === 'FORUM' && hasJoinedForum ? (
          <TouchableOpacity
            style={styles.leaveForumBtn}
            onPress={handleLeaveForum}
            activeOpacity={0.75}
          >
            <FontAwesome5 name="sign-out-alt" size={11} color="#DC2626" />
            <Text style={styles.leaveForumText}>Sair do Fórum</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setIsNewDmOpen(true)}
            activeOpacity={0.7}
          >
            <FontAwesome5 name="user-plus" size={14} color="#0284C7" />
          </TouchableOpacity>
        )}
      </View>

      {/* SELETOR DE MODO: MEUS CHATS (PADRÃO) vs FÓRUM OPCIONAL */}
      <View style={styles.modeTabsBar}>
        <TouchableOpacity
          style={[
            styles.modeTabBtn,
            mainTab === 'CHATS' && styles.modeTabBtnActive,
          ]}
          onPress={() => setMainTab('CHATS')}
          activeOpacity={0.85}
        >
          <FontAwesome5
            name="user-friends"
            size={13}
            color={mainTab === 'CHATS' ? '#0284C7' : '#64748B'}
          />
          <Text
            style={[
              styles.modeTabText,
              mainTab === 'CHATS' && styles.modeTabTextActive,
            ]}
          >
            Colegas, Professores & Escola
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.modeTabBtn,
            mainTab === 'FORUM' && styles.modeTabBtnActiveForum,
          ]}
          onPress={() => setMainTab('FORUM')}
          activeOpacity={0.85}
        >
          <FontAwesome5
            name="comments"
            size={13}
            color={mainTab === 'FORUM' ? '#7C3AED' : '#64748B'}
          />
          <Text
            style={[
              styles.modeTabText,
              mainTab === 'FORUM' && { color: '#7C3AED', fontWeight: '800' },
            ]}
          >
            Fórum de Estudantes
          </Text>
          <View
            style={[
              styles.forumStatusBadge,
              hasJoinedForum
                ? { backgroundColor: '#DCFCE7' }
                : { backgroundColor: '#F1F5F9' },
            ]}
          >
            <Text
              style={[
                styles.forumStatusBadgeText,
                { color: hasJoinedForum ? '#16A34A' : '#64748B' },
              ]}
            >
              {hasJoinedForum ? 'Participando' : 'Opcional'}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* MODO 1: FÓRUM OPCIONAL (QUANDO O USUÁRIO AINDA NÃO ENTROU) */}
      {mainTab === 'FORUM' && !hasJoinedForum ? (
        <View style={styles.forumOptInContainer}>
          <View style={styles.forumOptInCard}>
            <View style={styles.forumOptInIconCircle}>
              <FontAwesome5 name="users" size={30} color="#7C3AED" />
            </View>
            <Text style={styles.forumOptInTitle}>
              Fórum Aberto da Comunidade ENEM
            </Text>
            <Text style={styles.forumOptInDesc}>
              Este é um espaço opcional em formato de fórum onde estudantes e professores de toda a plataforma trocam macetes de prova, tiram dúvidas de matérias e discutem questões do ENEM.
            </Text>

            <View style={styles.forumPerksList}>
              <View style={styles.forumPerkRow}>
                <FontAwesome5 name="check-circle" size={14} color="#16A34A" />
                <Text style={styles.forumPerkText}>
                  Tópicos organizados por Dúvidas, Macetes e Questões
                </Text>
              </View>
              <View style={styles.forumPerkRow}>
                <FontAwesome5 name="check-circle" size={14} color="#16A34A" />
                <Text style={styles.forumPerkText}>
                  Participação 100% opcional — você pode entrar e sair quando quiser
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.joinForumBtn}
              onPress={handleJoinForum}
              activeOpacity={0.85}
            >
              <FontAwesome5 name="door-open" size={14} color="#FFF" />
              <Text style={styles.joinForumBtnText}>
                Quero Participar do Fórum
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.backToPrivateBtn}
              onPress={() => setMainTab('CHATS')}
            >
              <Text style={styles.backToPrivateText}>
                Continuar apenas nos meus chats privados e de turma
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        /* CORPO DE MENSAGENS (MEUS CHATS OU FÓRUM ATIVO) */
        <View style={styles.mainContainer}>
          {mainTab === 'CHATS' && (isWide || mobileShowRooms) && renderSidebar()}

          {(isWide || !mobileShowRooms || mainTab === 'FORUM') && (
            <KeyboardAvoidingView
              style={styles.chatPane}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
            >
              {/* Filtro de tópicos do Fórum quando estiver na aba Fórum */}
              {mainTab === 'FORUM' && (
                <View style={styles.forumFilterBar}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8, paddingHorizontal: 14 }}
                  >
                    <TouchableOpacity
                      style={[
                        styles.forumFilterChip,
                        forumTopicFilter === 'ALL' && styles.forumFilterChipActive,
                      ]}
                      onPress={() => setForumTopicFilter('ALL')}
                    >
                      <Text
                        style={[
                          styles.forumFilterChipText,
                          forumTopicFilter === 'ALL' && { color: '#FFF' },
                        ]}
                      >
                        Todos os Tópicos
                      </Text>
                    </TouchableOpacity>
                    {CATEGORIES.map((c) => {
                      const active = forumTopicFilter === c.key;
                      return (
                        <TouchableOpacity
                          key={c.key}
                          style={[
                            styles.forumFilterChip,
                            active && { backgroundColor: c.color },
                          ]}
                          onPress={() => setForumTopicFilter(c.key)}
                        >
                          <FontAwesome5
                            name={c.icon}
                            size={10}
                            color={active ? '#FFF' : c.color}
                          />
                          <Text
                            style={[
                              styles.forumFilterChipText,
                              active && { color: '#FFF' },
                            ]}
                          >
                            {c.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* Se o usuário está em CHATS mas ainda não selecionou/iniciou nenhuma conversa */}
              {mainTab === 'CHATS' && !activeRoom ? (
                <View style={styles.emptyChatBox}>
                  <View style={styles.emptyChatCircle}>
                    <FontAwesome5 name="user-friends" size={28} color="#0284C7" />
                  </View>
                  <Text style={styles.emptyChatTitle}>
                    Converse com Colegas, Professores e Escola
                  </Text>
                  <Text style={styles.emptyChatSub}>
                    Selecione uma turma ou escolha um professor, colega ou coordenação escolar para iniciar um chat direto.
                  </Text>
                  <TouchableOpacity
                    style={styles.startFirstChatBtn}
                    onPress={() => setIsNewDmOpen(true)}
                    activeOpacity={0.85}
                  >
                    <FontAwesome5 name="plus" size={12} color="#FFF" />
                    <Text style={styles.startFirstChatText}>
                      Escolher Pessoa para Conversar
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : isLoadingRooms ||
                (isLoadingMessages && messages.length === 0) ? (
                <View style={styles.centerBox}>
                  <ActivityIndicator size="large" color="#0284C7" />
                  <Text style={styles.loadingText}>Carregando mensagens...</Text>
                </View>
              ) : (
                <FlatList
                  ref={flatListRef}
                  data={messages}
                  keyExtractor={(item) => item.id}
                  renderItem={renderMessage}
                  contentContainerStyle={styles.messagesListContent}
                  onContentSizeChange={() =>
                    flatListRef.current?.scrollToEnd({ animated: false })
                  }
                  ListEmptyComponent={
                    <View style={styles.emptyChatBox}>
                      <View style={styles.emptyChatCircle}>
                        <FontAwesome5
                          name="comments"
                          size={28}
                          color="#0284C7"
                        />
                      </View>
                      <Text style={styles.emptyChatTitle}>
                        Envie a primeira mensagem!
                      </Text>
                      <Text style={styles.emptyChatSub}>
                        {mainTab === 'FORUM'
                          ? 'Publique uma dúvida, um macete ou uma questão para debater no fórum.'
                          : `Inicie sua conversa em "${activeRoom?.name}".`}
                      </Text>
                    </View>
                  }
                />
              )}

              {typingUser && (
                <View style={styles.typingBar}>
                  <Text style={styles.typingText}>
                    {typingUser} está digitando...
                  </Text>
                </View>
              )}

              {/* COMPOSER DE MENSAGEM */}
              {activeRoom && (
                <View style={styles.composerContainer}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.categoryBar}
                  >
                    {CATEGORIES.map((cat) => {
                      const active = selectedCategory === cat.key;
                      return (
                        <TouchableOpacity
                          key={cat.key}
                          style={[
                            styles.catChip,
                            active && {
                              backgroundColor: cat.bg,
                              borderColor: cat.color,
                            },
                          ]}
                          onPress={() => setSelectedCategory(cat.key)}
                        >
                          <FontAwesome5
                            name={cat.icon}
                            size={10}
                            color={active ? cat.color : '#64748B'}
                          />
                          <Text
                            style={[
                              styles.catChipText,
                              active && {
                                color: cat.color,
                                fontWeight: '800',
                              },
                            ]}
                          >
                            {cat.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                    {subjectTag ? (
                      <TouchableOpacity
                        style={[
                          styles.catChip,
                          {
                            backgroundColor: '#F3E8FF',
                            borderColor: '#8B5CF6',
                          },
                        ]}
                        onPress={() => setSubjectTag('')}
                      >
                        <Text
                          style={[
                            styles.catChipText,
                            { color: '#7C3AED', fontWeight: '700' },
                          ]}
                        >
                          #{subjectTag} ×
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </ScrollView>

                  <View style={styles.inputRow}>
                    <TextInput
                      style={styles.textInput}
                      placeholder={
                        mainTab === 'FORUM'
                          ? 'Publicar no Fórum de Estudantes...'
                          : `Mensagem para ${activeRoom.name}...`
                      }
                      placeholderTextColor="#94A3B8"
                      value={inputText}
                      onChangeText={handleTextChange}
                      multiline
                      maxLength={2000}
                      onSubmitEditing={
                        Platform.OS === 'web' ? handleSend : undefined
                      }
                    />
                    <TouchableOpacity
                      style={[
                        styles.sendBtn,
                        (!inputText.trim() || isSending) && { opacity: 0.5 },
                      ]}
                      onPress={handleSend}
                      disabled={!inputText.trim() || isSending}
                      activeOpacity={0.8}
                    >
                      {isSending ? (
                        <ActivityIndicator size="small" color="#FFF" />
                      ) : (
                        <FontAwesome5
                          name="paper-plane"
                          size={15}
                          color="#FFF"
                        />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </KeyboardAvoidingView>
          )}
        </View>
      )}

      {/* MODAL: INICIAR CONVERSA COM COLEGA, PROFESSOR OU ESCOLA */}
      <Modal
        visible={isNewDmOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsNewDmOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Nova Conversa (Colegas, Professores & Escola)
              </Text>
              <TouchableOpacity onPress={() => setIsNewDmOpen(false)}>
                <FontAwesome5 name="times" size={16} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Filtro por Papel */}
            <View style={styles.roleFiltersRow}>
              {[
                { key: 'ALL' as RoleFilter, label: 'Todos' },
                { key: 'TEACHER' as RoleFilter, label: 'Professores' },
                { key: 'SCHOOL' as RoleFilter, label: 'Escola' },
                { key: 'STUDENT' as RoleFilter, label: 'Colegas' },
              ].map((rf) => {
                const active = roleFilter === rf.key;
                return (
                  <TouchableOpacity
                    key={rf.key}
                    style={[
                      styles.roleFilterChip,
                      active && styles.roleFilterChipActive,
                    ]}
                    onPress={() => setRoleFilter(rf.key)}
                  >
                    <Text
                      style={[
                        styles.roleFilterText,
                        active && styles.roleFilterTextActive,
                      ]}
                    >
                      {rf.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.modalSearchBox}>
              <FontAwesome5 name="search" size={13} color="#94A3B8" />
              <TextInput
                style={styles.modalSearchInput}
                placeholder="Buscar por nome ou e-mail..."
                placeholderTextColor="#94A3B8"
                value={userSearchQuery}
                onChangeText={setUserSearchQuery}
                autoFocus
              />
            </View>

            {isSearchingUsers ? (
              <ActivityIndicator
                style={{ marginVertical: 24 }}
                color="#0284C7"
              />
            ) : (
              <ScrollView style={{ maxHeight: 340 }}>
                {filteredDirectoryUsers.length === 0 ? (
                  <Text style={styles.emptyUsersText}>
                    Nenhum contato encontrado neste filtro.
                  </Text>
                ) : (
                  filteredDirectoryUsers.map((u) => {
                    const badge = getRoleBadge(u.role);
                    return (
                      <TouchableOpacity
                        key={u.id}
                        style={styles.userRow}
                        onPress={() => handleStartDirect(u)}
                        activeOpacity={0.75}
                      >
                        <View
                          style={[
                            styles.userAvatar,
                            { backgroundColor: badge.bg },
                          ]}
                        >
                          <FontAwesome5
                            name={badge.icon}
                            size={14}
                            color={badge.color}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <Text style={styles.userName}>{u.name}</Text>
                            <View
                              style={[
                                styles.rolePill,
                                { backgroundColor: badge.bg },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.rolePillText,
                                  { color: badge.color },
                                ]}
                              >
                                {badge.label}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.userEmail}>{u.email}</Text>
                        </View>
                        <FontAwesome5
                          name="comment-dots"
                          size={15}
                          color="#0284C7"
                        />
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8FAFC' },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomsToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#E0F2FE',
  },
  roomsToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284C7',
  },
  topHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  topHeaderSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  leaveForumBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
  },
  leaveForumText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  modeTabsBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modeTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  modeTabBtnActive: {
    backgroundColor: '#E0F2FE',
    borderColor: '#0284C7',
  },
  modeTabBtnActiveForum: {
    backgroundColor: '#F3E8FF',
    borderColor: '#7C3AED',
  },
  modeTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  modeTabTextActive: {
    color: '#0369A1',
    fontWeight: '800',
  },
  forumStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  forumStatusBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  forumOptInContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  forumOptInCard: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  forumOptInIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  forumOptInTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 8,
  },
  forumOptInDesc: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  forumPerksList: {
    width: '100%',
    gap: 10,
    backgroundColor: '#F8FAFC',
    padding: 14,
    borderRadius: 14,
    marginBottom: 20,
  },
  forumPerkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  forumPerkText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  joinForumBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#7C3AED',
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 12,
  },
  joinForumBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  backToPrivateBtn: {
    paddingVertical: 6,
  },
  backToPrivateText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  forumFilterBar: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  forumFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
  },
  forumFilterChipActive: {
    backgroundColor: '#7C3AED',
  },
  forumFilterChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  mainContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    backgroundColor: '#FFFFFF',
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
  },
  sidebarWide: {
    width: 300,
  },
  sidebarMobile: {
    flex: 1,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sidebarTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  newDmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#0284C7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  newDmBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  roomGroup: {
    paddingHorizontal: 12,
    paddingTop: 14,
  },
  roomGroupTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.7,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  emptyGroupHint: {
    fontSize: 12,
    color: '#94A3B8',
    paddingHorizontal: 6,
    lineHeight: 17,
  },
  roomItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 4,
  },
  roomItemActive: {
    backgroundColor: '#E0F2FE',
  },
  roomIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  roomNameActive: {
    color: '#0369A1',
  },
  roomLastMsg: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  quickContactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 10,
  },
  quickContactAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickContactName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  quickContactRole: {
    fontSize: 10,
    fontWeight: '700',
  },
  chatPane: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: '#64748B',
  },
  messagesListContent: {
    padding: 16,
    paddingBottom: 20,
    flexGrow: 1,
  },
  emptyChatBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyChatCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyChatTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyChatSub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 340,
  },
  startFirstChatBtn: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0284C7',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  startFirstChatText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  msgRow: {
    marginBottom: 12,
    flexDirection: 'row',
  },
  msgRowMe: {
    justifyContent: 'flex-end',
  },
  msgRowOther: {
    justifyContent: 'flex-start',
  },
  msgBubble: {
    maxWidth: '82%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  msgBubbleMe: {
    backgroundColor: '#0284C7',
    borderBottomRightRadius: 4,
  },
  msgBubbleOther: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderBottomLeftRadius: 4,
  },
  msgHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  msgSender: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  rolePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  rolePillText: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  catPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  catPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  msgText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#1E293B',
  },
  msgFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    gap: 12,
  },
  likeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  likeCount: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  msgTime: {
    fontSize: 10,
    color: '#94A3B8',
  },
  typingBar: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    backgroundColor: '#F1F5F9',
  },
  typingText: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#64748B',
  },
  composerContainer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
  },
  categoryBar: {
    gap: 6,
    paddingBottom: 8,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  catChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  textInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 110,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#0284C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  roleFiltersRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  roleFilterChip: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  roleFilterChipActive: {
    backgroundColor: '#0284C7',
  },
  roleFilterText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  roleFilterTextActive: {
    color: '#FFFFFF',
  },
  modalSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
    marginBottom: 12,
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
  },
  emptyUsersText: {
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 13,
    paddingVertical: 20,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  userAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  userEmail: {
    fontSize: 12,
    color: '#64748B',
  },
});
