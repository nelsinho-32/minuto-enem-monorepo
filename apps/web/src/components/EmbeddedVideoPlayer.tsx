import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions,
  StyleProp,
  ViewStyle,
  TouchableOpacity,
  Linking,
  Platform,
} from 'react-native';
import YoutubeIframe, { PLAYER_STATES } from 'react-native-youtube-iframe';
import { FontAwesome5 } from '@expo/vector-icons';

/**
 * Expressão regular para validar e extrair o ID de 11 caracteres de qualquer formato de URL do YouTube.
 * Suporta:
 * - https://www.youtube.com/watch?v=XXXXXXXXXXX
 * - https://youtu.be/XXXXXXXXXXX
 * - https://www.youtube.com/embed/XXXXXXXXXXX
 * - https://www.youtube.com/shorts/XXXXXXXXXXX
 * - https://www.youtube.com/v/XXXXXXXXXXX
 * - IDs puros de 11 caracteres
 */
export function extractYouTubeVideoId(url?: string | null): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();

  // Caso seja o próprio ID de 11 caracteres
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(
    /(?:youtube\.com\/(?:watch\?.*v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i
  );
  return match ? match[1] : null;
}

export interface EmbeddedVideoPlayerProps {
  /**
   * URL do YouTube ou ID direto do vídeo salvo no banco de dados.
   */
  youtubeUrl?: string | null;
  /**
   * Alias de conveniência para youtubeUrl.
   */
  url?: string | null;
  /**
   * Largura customizada do player.
   * Por padrão, preenche a largura total da tela (100% da largura da janela).
   */
  width?: number;
  /**
   * Se true, força a largura a ocupar a tela inteira (width da janela). Padrão: true.
   */
  fullWidth?: boolean;
  /**
   * Título opcional da aula / vídeo exibido no cabeçalho ou badge.
   */
  title?: string;
  /**
   * Iniciar reproduzindo (por padrão false, conforme especificação).
   */
  initialPlay?: boolean;
  /**
   * Callback acionado quando o player termina de carregar.
   */
  onReady?: () => void;
  /**
   * Callback acionado em alterações de estado (reproduzindo, pausado, etc).
   */
  onChangeState?: (state: PLAYER_STATES) => void;
  /**
   * Estilo customizado para o contêiner do player.
   */
  style?: StyleProp<ViewStyle>;
}

/**
 * Componente de Player Embutido do YouTube para Alunos.
 *
 * Características:
 * - Extrai automaticamente o ID do vídeo da URL salva no banco de dados.
 * - Renderiza via `<YoutubeIframe />`.
 * - Largura total da tela e proporção perfeita 16:9 (altura proporcional).
 * - Inicia com `play={false}` por padrão.
 * - Exibe `ActivityIndicator` com transição suave enquanto o iframe carrega.
 * - Trata erros de carregamento e fornece atalho de contingência para abrir no app nativo.
 */
export const EmbeddedVideoPlayer: React.FC<EmbeddedVideoPlayerProps> = ({
  youtubeUrl,
  url,
  width: customWidth,
  fullWidth = true,
  title,
  initialPlay = false,
  onReady: externalOnReady,
  onChangeState,
  style,
}) => {
  const { width: windowWidth } = useWindowDimensions();

  // Extrai o ID do vídeo a partir da prop youtubeUrl ou url
  const rawUrl = youtubeUrl || url;
  const videoId = useMemo(() => extractYouTubeVideoId(rawUrl), [rawUrl]);

  // Controle de reprodução: sempre inicia em false conforme especificado
  const [playing, setPlaying] = useState<boolean>(initialPlay);
  // Estado de carregamento do iframe
  const [isReady, setIsReady] = useState<boolean>(false);
  const [playerError, setPlayerError] = useState<string | null>(null);

  // Calcula a largura total da tela ou customizada, e altura na proporção exata 16:9
  const playerWidth = useMemo(() => {
    if (customWidth && customWidth > 0) return customWidth;
    if (fullWidth) return windowWidth;
    return windowWidth;
  }, [customWidth, fullWidth, windowWidth]);

  const playerHeight = useMemo(() => {
    return Math.round((playerWidth * 9) / 16);
  }, [playerWidth]);

  const handleReady = useCallback(() => {
    setIsReady(true);
    setPlayerError(null);
    externalOnReady?.();
  }, [externalOnReady]);

  const handleError = useCallback((error: string) => {
    setIsReady(true);
    setPlayerError(error);
  }, []);

  const handleStateChange = useCallback(
    (state: PLAYER_STATES) => {
      onChangeState?.(state);
      if (state === PLAYER_STATES.ENDED) {
        setPlaying(false);
      }
    },
    [onChangeState]
  );

  const openInYouTube = useCallback(() => {
    if (!rawUrl && !videoId) return;
    const target = rawUrl || `https://www.youtube.com/watch?v=${videoId}`;
    Linking.openURL(target).catch(() => {});
  }, [rawUrl, videoId]);

  // Se não foi possível extrair um ID de vídeo válido
  if (!videoId) {
    return (
      <View
        style={[
          styles.container,
          { width: playerWidth, height: playerHeight },
          styles.fallbackBox,
          style,
        ]}
      >
        <FontAwesome5 name="youtube" size={32} color="#94A3B8" />
        <Text style={styles.fallbackTitle}>Vídeo indisponível</Text>
        <Text style={styles.fallbackSub}>
          O link de aula associado não possui uma URL válida do YouTube.
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { width: playerWidth, height: playerHeight },
        style,
      ]}
    >
      {/* Container do Player (Suporte Web nativo e Mobile via YoutubeIframe) */}
      <View style={[styles.iframeWrapper, { width: playerWidth, height: playerHeight }]}>
        {Platform.OS === 'web' ? (
          <iframe
            width={playerWidth}
            height={playerHeight}
            src={`https://www.youtube.com/embed/${videoId}?autoplay=0&rel=0&enablejsapi=1`}
            title={title || 'Aula Minuto ENEM - YouTube'}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            style={{
              border: 'none',
              width: playerWidth,
              height: playerHeight,
              display: 'block',
            }}
            onLoad={() => {
              handleReady();
            }}
          />
        ) : (
          <YoutubeIframe
            width={playerWidth}
            height={playerHeight}
            videoId={videoId}
            play={playing}
            onReady={handleReady}
            onError={handleError}
            onChangeState={handleStateChange}
            initialPlayerParams={{
              preventFullScreen: false,
              controls: true,
              rel: false,
            }}
            webViewProps={{
              allowsFullscreenVideo: true,
              androidLayerType: Platform.OS === 'android' ? 'hardware' : undefined,
            }}
          />
        )}
      </View>

      {/* Overlay com ActivityIndicator enquanto o iframe carrega */}
      {!isReady && !playerError && (
        <View
          style={[
            styles.loadingOverlay,
            { width: playerWidth, height: playerHeight },
          ]}
          pointerEvents="none"
        >
          <ActivityIndicator size="large" color="#FF0000" />
          <Text style={styles.loadingText}>Carregando vídeo da aula...</Text>
          {title ? (
            <Text style={styles.loadingLessonTitle} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
        </View>
      )}

      {/* Overlay de erro caso o embed do YouTube falhe */}
      {playerError && (
        <View
          style={[
            styles.errorOverlay,
            { width: playerWidth, height: playerHeight },
          ]}
        >
          <FontAwesome5 name="exclamation-circle" size={28} color="#EF4444" />
          <Text style={styles.errorTitle}>Erro ao reproduzir o vídeo</Text>
          <Text style={styles.errorSubtitle}>
            Este vídeo pode conter restrições de incorporação pelo autor.
          </Text>
          <TouchableOpacity
            style={styles.openExternalBtn}
            activeOpacity={0.8}
            onPress={openInYouTube}
          >
            <FontAwesome5 name="external-link-alt" size={12} color="#FFF" />
            <Text style={styles.openExternalBtnText}>Abrir no app do YouTube</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    overflow: 'hidden',
    position: 'relative',
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iframeWrapper: {
    backgroundColor: '#000',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    gap: 10,
    paddingHorizontal: 20,
  },
  loadingText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
  },
  loadingLessonTitle: {
    color: '#94A3B8',
    fontSize: 11,
    textAlign: 'center',
  },
  errorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
    gap: 8,
    paddingHorizontal: 24,
  },
  errorTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  errorSubtitle: {
    color: '#94A3B8',
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 4,
  },
  openExternalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#DC2626',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  openExternalBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  fallbackBox: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    gap: 6,
  },
  fallbackTitle: {
    color: '#F1F5F9',
    fontSize: 14,
    fontWeight: 'bold',
  },
  fallbackSub: {
    color: '#94A3B8',
    fontSize: 11,
    textAlign: 'center',
  },
});

export default EmbeddedVideoPlayer;

