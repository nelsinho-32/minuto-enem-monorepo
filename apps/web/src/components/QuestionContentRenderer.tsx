import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  ScrollView,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import { FontAwesome5 } from '@expo/vector-icons';
import { BASE_URL } from '@/services/api';
import { AppPalette } from '@/constants/theme';

const LOCAL_ENEM_YEARS = new Set([
  '2009',
  '2010',
  '2011',
  '2012',
  '2013',
  '2014',
  '2018',
  '2019',
  '2020',
  '2021',
  '2022',
  '2023',
]);

/**
 * Resolve uma URL de imagem de questão do ENEM:
 * - Se for dos anos disponíveis localmente no servidor (2009-2014, 2018-2023),
 *   aponta prioritariamente para `${BASE_URL}/enem-media/...`
 * - Mantém URL de fallback externa (`https://enem.dev/...`) caso necessário.
 */
export function resolveQuestionImageUrls(rawUrl: string): {
  primaryUrl: string;
  fallbackUrl: string | null;
} {
  let clean = (rawUrl || '').trim();
  if (clean.startsWith('//')) {
    clean = `https:${clean}`;
  }

  if (clean.startsWith('/enem-media/')) {
    const rel = clean.replace(/^\/enem-media\//, '');
    return {
      primaryUrl: `${BASE_URL}/enem-media/${rel}`,
      fallbackUrl: `https://enem.dev/${rel}`,
    };
  }

  const enemDevMatch = clean.match(
    /^https?:\/\/enem\.dev\/(\d{4}\/questions\/.+)$/i
  );
  if (enemDevMatch) {
    const relPath = enemDevMatch[1];
    const year = relPath.split('/')[0];
    if (LOCAL_ENEM_YEARS.has(year)) {
      return {
        primaryUrl: `${BASE_URL}/enem-media/${relPath}`,
        fallbackUrl: clean,
      };
    }
    return {
      primaryUrl: clean,
      fallbackUrl: `${BASE_URL}/enem-media/${relPath}`,
    };
  }

  if (clean.startsWith('/uploads/')) {
    return {
      primaryUrl: `${BASE_URL}${clean}`,
      fallbackUrl: null,
    };
  }

  return { primaryUrl: clean, fallbackUrl: null };
}

interface AutoSizedQuestionImageProps {
  rawUrl: string;
  altText?: string;
  compact?: boolean;
}

export function AutoSizedQuestionImage({
  rawUrl,
  altText,
  compact = false,
}: AutoSizedQuestionImageProps) {
  const { primaryUrl, fallbackUrl } = useMemo(
    () => resolveQuestionImageUrls(rawUrl),
    [rawUrl]
  );

  const [currentUri, setCurrentUri] = useState<string>(primaryUrl);
  const [triedFallback, setTriedFallback] = useState<boolean>(false);
  const [aspectRatio, setAspectRatio] = useState<number>(1.6);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasFailed, setHasFailed] = useState<boolean>(false);
  const [isZoomOpen, setIsZoomOpen] = useState<boolean>(false);
  const [zoomScale, setZoomScale] = useState<number>(1);

  useEffect(() => {
    setCurrentUri(primaryUrl);
    setTriedFallback(false);
    setIsLoading(true);
    setHasFailed(false);
  }, [primaryUrl]);

  useEffect(() => {
    if (!currentUri || hasFailed) return;
    let active = true;
    Image.getSize(
      currentUri,
      (w, h) => {
        if (active && w > 0 && h > 0) {
          const ratio = Math.min(Math.max(w / h, 0.55), 3.5);
          setAspectRatio(ratio);
        }
      },
      () => {
        // Ignora erro no getSize; o onError do Image gerencia o fallback
      }
    );
    return () => {
      active = false;
    };
  }, [currentUri, hasFailed]);

  if (!rawUrl || rawUrl.includes('broken-image.svg') || hasFailed) {
    return null;
  }

  const handleImageError = () => {
    if (!triedFallback && fallbackUrl && fallbackUrl !== currentUri) {
      setTriedFallback(true);
      setCurrentUri(fallbackUrl);
      setIsLoading(true);
    } else {
      setIsLoading(false);
      setHasFailed(true);
    }
  };

  return (
    <View style={[styles.imageCardWrapper, compact && styles.imageCardCompact]}>
      <TouchableOpacity
        activeOpacity={0.9}
        style={[
          styles.imageContainer,
          compact ? { height: 150 } : { aspectRatio, maxHeight: 340 },
        ]}
        onPress={() => {
          setZoomScale(1);
          setIsZoomOpen(true);
        }}
      >
        <Image
          source={{ uri: currentUri }}
          style={styles.questionImage}
          resizeMode="contain"
          onLoad={(e) => {
            const src = (e?.nativeEvent as any)?.source;
            if (src?.width && src?.height) {
              const ratio = Math.min(
                Math.max(src.width / src.height, 0.55),
                3.5
              );
              setAspectRatio(ratio);
            }
            setIsLoading(false);
          }}
          onLoadEnd={() => setIsLoading(false)}
          onError={handleImageError}
        />

        {isLoading && (
          <View style={styles.imageLoadingOverlay}>
            <ActivityIndicator size="small" color={AppPalette.primary} />
          </View>
        )}

        {!compact && !isLoading && (
          <View style={styles.zoomHintPill}>
            <FontAwesome5 name="search-plus" size={10} color="#FFF" />
            <Text style={styles.zoomHintText}>Ampliar imagem</Text>
          </View>
        )}
      </TouchableOpacity>

      {altText ? (
        <Text style={styles.imageCaption} numberOfLines={2}>
          {altText}
        </Text>
      ) : null}

      {/* Modal de Zoom da Imagem da Questão */}
      {isZoomOpen && (
        <Modal
          visible={isZoomOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setIsZoomOpen(false)}
        >
          <View style={styles.zoomModalOverlay}>
            <View style={styles.zoomModalToolbar}>
              <View style={styles.zoomControlsRow}>
                <TouchableOpacity
                  style={styles.zoomControlBtn}
                  onPress={() =>
                    setZoomScale((s) => Math.max(0.75, Number((s - 0.25).toFixed(2))))
                  }
                >
                  <FontAwesome5 name="search-minus" size={14} color="#FFF" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.zoomControlBtn}
                  onPress={() => setZoomScale(1)}
                >
                  <Text style={styles.zoomScaleLabel}>
                    {Math.round(zoomScale * 100)}%
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.zoomControlBtn}
                  onPress={() =>
                    setZoomScale((s) => Math.min(3.0, Number((s + 0.25).toFixed(2))))
                  }
                >
                  <FontAwesome5 name="search-plus" size={14} color="#FFF" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.zoomCloseBtn}
                onPress={() => setIsZoomOpen(false)}
              >
                <FontAwesome5 name="times" size={16} color="#FFF" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ flex: 1, width: '100%' }}
              contentContainerStyle={styles.zoomScrollContent}
              maximumZoomScale={3}
              minimumZoomScale={0.75}
            >
              <Image
                source={{ uri: currentUri }}
                style={[
                  styles.zoomedFullImage,
                  { transform: [{ scale: zoomScale }] },
                ]}
                resizeMode="contain"
              />
            </ScrollView>
          </View>
        </Modal>
      )}
    </View>
  );
}

type ContentSegment =
  | { type: 'text'; content: string }
  | { type: 'image'; url: string; alt: string };

/**
 * Divide um texto Markdown em segmentos de texto puro e segmentos de imagem independentes.
 * Isso evita que o react-native-markdown-display envolva imagens dentro de um componente <Text>,
 * eliminando 100% dos bugs de posicionamento, corte lateral e desalinhamento no mobile e na web.
 */
export function splitMarkdownSegments(rawText: string): ContentSegment[] {
  if (!rawText) return [];

  const normalized = rawText
    .replace(/\]\(\/\//g, '](https://')
    .replace(/!\[\]\(https?:\/\/enem\.dev\/broken-image\.svg\)/gi, '');

  const regex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  const segments: ContentSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(normalized)) !== null) {
    if (match.index > lastIndex) {
      const textChunk = normalized.slice(lastIndex, match.index).trim();
      if (textChunk) {
        segments.push({ type: 'text', content: textChunk });
      }
    }

    const alt = (match[1] || '').trim();
    const url = (match[2] || '').trim();
    if (url && !url.includes('broken-image.svg')) {
      segments.push({ type: 'image', url, alt });
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < normalized.length) {
    const remaining = normalized.slice(lastIndex).trim();
    if (remaining) {
      segments.push({ type: 'text', content: remaining });
    }
  }

  return segments;
}

interface QuestionContentRendererProps {
  text: string;
  compact?: boolean;
  fontSize?: number;
  textColor?: string;
}

export function QuestionContentRenderer({
  text,
  compact = false,
  fontSize = 16,
  textColor = '#334155',
}: QuestionContentRendererProps) {
  const segments = useMemo(() => splitMarkdownSegments(text), [text]);

  const mdStyles = useMemo(
    () => ({
      body: {
        fontSize,
        color: textColor,
        lineHeight: Math.round(fontSize * 1.6),
      },
      paragraph: {
        marginTop: 0,
        marginBottom: compact ? 4 : 10,
      },
      strong: {
        fontWeight: '800' as const,
        color: '#0F172A',
      },
      em: {
        fontStyle: 'italic' as const,
        color: '#475569',
      },
      blockquote: {
        backgroundColor: '#F8FAFC',
        borderLeftWidth: 3,
        borderLeftColor: '#0284C7',
        paddingHorizontal: 12,
        paddingVertical: 6,
        marginVertical: 8,
      },
    }),
    [fontSize, textColor, compact]
  );

  if (segments.length === 0) {
    return null;
  }

  return (
    <View style={styles.rendererContainer}>
      {segments.map((seg, idx) => {
        if (seg.type === 'image') {
          return (
            <AutoSizedQuestionImage
              key={`img-${idx}-${seg.url}`}
              rawUrl={seg.url}
              altText={seg.alt}
              compact={compact}
            />
          );
        }

        return (
          <View key={`txt-${idx}`} style={styles.textBlockWrapper}>
            <Markdown style={mdStyles as any}>{seg.content}</Markdown>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  rendererContainer: {
    width: '100%',
  },
  textBlockWrapper: {
    width: '100%',
  },
  imageCardWrapper: {
    width: '100%',
    marginVertical: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  imageCardCompact: {
    marginVertical: 6,
    padding: 6,
  },
  imageContainer: {
    width: '100%',
    minHeight: 140,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  questionImage: {
    width: '100%',
    height: '100%',
  },
  imageLoadingOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(248, 250, 252, 0.7)',
  },
  zoomHintPill: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  zoomHintText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  imageCaption: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 6,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  zoomModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.94)',
  },
  zoomModalToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 42,
    paddingBottom: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
  },
  zoomControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  zoomControlBtn: {
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomScaleLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  zoomCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  zoomedFullImage: {
    width: '94%',
    height: '86%',
    minHeight: 360,
  },
});
