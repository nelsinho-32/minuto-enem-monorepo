import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { WebView } from 'react-native-webview';
import { BASE_URL } from '@/services/api';

export interface PdfViewerModalProps {
  visible: boolean;
  onClose: () => void;
  pdfUrl?: string | null;
  title?: string;
  description?: string;
}

export function PdfViewerModal({
  visible,
  onClose,
  pdfUrl,
  title = 'Documento PDF',
  description,
}: PdfViewerModalProps) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [isIframeLoading, setIsIframeLoading] = useState(true);

  // Normaliza a URL do PDF (resolve caminhos relativos /uploads/... usando BASE_URL)
  const resolvedUrl = useMemo(() => {
    if (!pdfUrl) return null;
    const trimmed = pdfUrl.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }

    return `${BASE_URL}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
  }, [pdfUrl]);

  const handleOpenExternally = async () => {
    if (!resolvedUrl) return;

    try {
      if (Platform.OS === 'web') {
        window.open(resolvedUrl, '_blank');
      } else {
        await WebBrowser.openBrowserAsync(resolvedUrl);
      }
    } catch {
      Linking.openURL(resolvedUrl).catch(() => {});
    }
  };

  const isWeb = Platform.OS === 'web';
  const isLargeScreen = windowWidth >= 768;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.modalContainer,
            isLargeScreen && styles.modalContainerDesktop,
          ]}
        >
          {/* Cabeçalho do Visualizador */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.pdfBadge}>
                <FontAwesome5 name="file-pdf" size={16} color="#EF4444" />
              </View>
              <View style={styles.headerTextGroup}>
                <Text style={styles.headerTitle} numberOfLines={1}>
                  {title}
                </Text>
                {Boolean(description) && (
                  <Text style={styles.headerSub} numberOfLines={1}>
                    {description}
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.headerActions}>
              {/* Botão Baixar / Abrir Externamente */}
              <TouchableOpacity
                style={styles.externalButton}
                activeOpacity={0.8}
                onPress={handleOpenExternally}
              >
                <FontAwesome5 name="external-link-alt" size={12} color="#2563EB" />
                <Text style={styles.externalButtonText}>
                  {isLargeScreen ? 'Baixar / Abrir Externamente' : 'Abrir'}
                </Text>
              </TouchableOpacity>

              {/* Botão Fechar */}
              <TouchableOpacity
                style={styles.closeButton}
                activeOpacity={0.8}
                onPress={onClose}
              >
                <FontAwesome5 name="times" size={15} color="#64748B" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Área do Documento */}
          <View style={styles.contentArea}>
            {!resolvedUrl ? (
              <View style={styles.emptyContainer}>
                <FontAwesome5 name="file-excel" size={40} color="#94A3B8" />
                <Text style={styles.emptyTitle}>Arquivo PDF não encontrado</Text>
                <Text style={styles.emptySub}>
                  Nenhuma URL válida ou arquivo anexado foi fornecido para este material.
                </Text>
              </View>
            ) : isWeb ? (
              // Na Web: renderiza <iframe /> nativo do navegador
              <View style={styles.iframeWrapper}>
                <iframe
                  src={resolvedUrl}
                  title={title}
                  style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                    backgroundColor: '#F8FAFC',
                  }}
                  onLoad={() => setIsIframeLoading(false)}
                />
              </View>
            ) : (
              // No Mobile: renderiza WebView com Google Docs Viewer embutido
              <WebView
                source={{
                  uri: `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(
                    resolvedUrl
                  )}`,
                }}
                style={styles.webview}
                startInLoadingState
                renderLoading={() => (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#58CC02" />
                    <Text style={styles.loadingText}>
                      Carregando documento PDF...
                    </Text>
                  </View>
                )}
                renderError={() => (
                  <View style={styles.errorContainer}>
                    <FontAwesome5
                      name="exclamation-circle"
                      size={36}
                      color="#EF4444"
                    />
                    <Text style={styles.errorTitle}>
                      Visualização in-app indisponível
                    </Text>
                    <Text style={styles.errorSub}>
                      Não foi possível gerar a prévia interna. Você pode abrir o
                      documento diretamente no leitor do dispositivo.
                    </Text>
                    <TouchableOpacity
                      style={styles.fallbackExternalButton}
                      activeOpacity={0.8}
                      onPress={handleOpenExternally}
                    >
                      <FontAwesome5
                        name="external-link-alt"
                        size={14}
                        color="#FFF"
                      />
                      <Text style={styles.fallbackExternalButtonText}>
                        Abrir no Leitor Externo
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  modalContainerDesktop: {
    width: '92%',
    maxWidth: 1040,
    height: '92%',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    zIndex: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 12,
  },
  pdfBadge: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTextGroup: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  externalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  externalButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    position: 'relative',
  },
  iframeWrapper: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  webview: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1E293B',
  },
  emptySub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 400,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  errorSub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 420,
    lineHeight: 18,
  },
  fallbackExternalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  fallbackExternalButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
