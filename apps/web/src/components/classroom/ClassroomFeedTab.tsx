import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { AppPalette } from '@/constants/theme';

export interface PostComment {
  id: string;
  author: string;
  role: 'STUDENT' | 'TEACHER';
  date: string;
  text: string;
}

export interface ClassroomPost {
  id: string;
  author: string;
  role: 'STUDENT' | 'TEACHER';
  date: string;
  text: string;
  likes: number;
  comments: PostComment[];
}

interface ClassroomFeedTabProps {
  posts: ClassroomPost[];
  newPostText: string;
  onChangeNewPostText: (text: string) => void;
  onPublishPost: () => void;
  onDeletePost: (postId: string) => void;
  expandedPostComments: Record<string, boolean>;
  onToggleComments: (postId: string) => void;
  commentInputs: Record<string, string>;
  onChangeCommentInput: (postId: string, text: string) => void;
  onAddComment: (postId: string) => void;
}

export function ClassroomFeedTab({
  posts,
  newPostText,
  onChangeNewPostText,
  onPublishPost,
  onDeletePost,
  expandedPostComments,
  onToggleComments,
  commentInputs,
  onChangeCommentInput,
  onAddComment,
}: ClassroomFeedTabProps) {
  return (
    <View style={styles.tabSection}>
      {/* Caixa de Novo Comunicado */}
      <View style={styles.postBoxCard}>
        <Text style={styles.postBoxTitle}>Compartilhar com a turma</Text>
        <TextInput
          style={styles.postInput}
          placeholder="Escreva um comunicado, aviso ou instrução para os alunos..."
          placeholderTextColor={AppPalette.textSubtle}
          multiline
          numberOfLines={3}
          value={newPostText}
          onChangeText={onChangeNewPostText}
        />
        <View style={styles.postBoxActions}>
          <TouchableOpacity
            style={[styles.postButton, !newPostText.trim() && { opacity: 0.5 }]}
            disabled={!newPostText.trim()}
            onPress={onPublishPost}
          >
            <FontAwesome5 name="paper-plane" size={12} color="#FFF" />
            <Text style={styles.postButtonText}>Publicar no Mural</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Lista de Publicações do Mural */}
      {posts.map((post) => {
        const isCommentsOpen = Boolean(expandedPostComments[post.id]);

        return (
          <View key={post.id} style={styles.feedCard}>
            <View style={styles.feedHeader}>
              <View
                style={[
                  styles.feedAvatar,
                  {
                    backgroundColor:
                      post.role === 'TEACHER'
                        ? AppPalette.primary
                        : AppPalette.success,
                  },
                ]}
              >
                <FontAwesome5
                  name={
                    post.role === 'TEACHER' ? 'chalkboard-teacher' : 'user'
                  }
                  size={12}
                  color="#FFF"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.feedAuthor}>
                  {post.author}{' '}
                  {post.role === 'TEACHER' && (
                    <Text style={styles.teacherBadgeText}>• Professor</Text>
                  )}
                </Text>
                <Text style={styles.feedDate}>{post.date}</Text>
              </View>

              <TouchableOpacity
                style={styles.feedOptionsBtn}
                onPress={() => onDeletePost(post.id)}
              >
                <FontAwesome5
                  name="trash-alt"
                  size={12}
                  color={AppPalette.textSubtle}
                />
              </TouchableOpacity>
            </View>

            <Text style={styles.feedText}>{post.text}</Text>

            <View style={styles.feedActionRow}>
              <TouchableOpacity
                style={styles.toggleCommentsBtn}
                onPress={() => onToggleComments(post.id)}
              >
                <FontAwesome5
                  name="comment-alt"
                  size={12}
                  color={AppPalette.primary}
                />
                <Text style={styles.toggleCommentsText}>
                  {post.comments.length}{' '}
                  {post.comments.length === 1
                    ? 'comentário da turma'
                    : 'comentários da turma'}
                </Text>
                <FontAwesome5
                  name={isCommentsOpen ? 'chevron-up' : 'chevron-down'}
                  size={10}
                  color={AppPalette.textSubtle}
                />
              </TouchableOpacity>
            </View>

            {isCommentsOpen && (
              <View style={styles.postCommentsSection}>
                {post.comments.map((comm) => (
                  <View key={comm.id} style={styles.postCommentItem}>
                    <View style={styles.commentAvatarMini}>
                      <FontAwesome5
                        name={
                          comm.role === 'TEACHER'
                            ? 'chalkboard-teacher'
                            : 'user'
                        }
                        size={10}
                        color="#FFF"
                      />
                    </View>
                    <View style={styles.commentBubble}>
                      <View style={styles.commentHeaderMini}>
                        <Text style={styles.commentAuthorMini}>
                          {comm.author}{' '}
                          {comm.role === 'TEACHER' && (
                            <Text style={styles.teacherMiniTag}>(Prof)</Text>
                          )}
                        </Text>
                        <Text style={styles.commentDateMini}>{comm.date}</Text>
                      </View>
                      <Text style={styles.commentTextMini}>{comm.text}</Text>
                    </View>
                  </View>
                ))}

                <View style={styles.addCommentInputRow}>
                  <TextInput
                    style={styles.addCommentInput}
                    placeholder="Adicionar comentário para a turma..."
                    placeholderTextColor={AppPalette.textSubtle}
                    value={commentInputs[post.id] || ''}
                    onChangeText={(txt) => onChangeCommentInput(post.id, txt)}
                  />
                  <TouchableOpacity
                    style={styles.addCommentSendBtn}
                    onPress={() => onAddComment(post.id)}
                  >
                    <FontAwesome5 name="paper-plane" size={11} color="#FFF" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabSection: { padding: 16, gap: 14 },
  postBoxCard: {
    backgroundColor: AppPalette.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: AppPalette.border,
  },
  postBoxTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: AppPalette.textPrimary,
    marginBottom: 8,
  },
  postInput: {
    backgroundColor: AppPalette.background,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: AppPalette.textPrimary,
    minHeight: 72,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: AppPalette.border,
  },
  postBoxActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  postButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: AppPalette.primary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  postButtonText: { color: '#FFF', fontWeight: '800', fontSize: 12 },
  feedCard: {
    backgroundColor: AppPalette.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: AppPalette.border,
  },
  feedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  feedAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedAuthor: {
    fontSize: 14,
    fontWeight: '800',
    color: AppPalette.textPrimary,
  },
  teacherBadgeText: {
    color: AppPalette.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  feedDate: { fontSize: 11, color: AppPalette.textSubtle },
  feedOptionsBtn: { padding: 6 },
  feedText: {
    fontSize: 14,
    color: AppPalette.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  feedActionRow: {
    borderTopWidth: 1,
    borderTopColor: AppPalette.surfaceMuted,
    paddingTop: 10,
  },
  toggleCommentsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toggleCommentsText: {
    fontSize: 12,
    fontWeight: '700',
    color: AppPalette.primary,
    flex: 1,
  },
  postCommentsSection: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: AppPalette.surfaceMuted,
    gap: 8,
  },
  postCommentItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  commentAvatarMini: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: AppPalette.textSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  commentBubble: {
    flex: 1,
    backgroundColor: AppPalette.background,
    borderRadius: 10,
    padding: 10,
  },
  commentHeaderMini: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  commentAuthorMini: {
    fontSize: 12,
    fontWeight: '800',
    color: AppPalette.textPrimary,
  },
  teacherMiniTag: {
    color: AppPalette.primary,
    fontWeight: '800',
  },
  commentDateMini: { fontSize: 10, color: AppPalette.textSubtle },
  commentTextMini: {
    fontSize: 12,
    color: AppPalette.textSecondary,
    lineHeight: 17,
  },
  addCommentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  addCommentInput: {
    flex: 1,
    backgroundColor: AppPalette.background,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    color: AppPalette.textPrimary,
    borderWidth: 1,
    borderColor: AppPalette.border,
  },
  addCommentSendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: AppPalette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
