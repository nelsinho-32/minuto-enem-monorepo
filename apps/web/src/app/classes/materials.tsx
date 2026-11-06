import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Image,
  KeyboardAvoidingView,
  Platform,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Markdown from 'react-native-markdown-display';
import * as WebBrowser from 'expo-web-browser';
import * as DocumentPicker from 'expo-document-picker';
import { api, BASE_URL } from '@/services/api';
import { useUserStore } from '@/store/useUserStore';
import { useClassroomStore } from '@/store/useClassroomStore';
import { EmbeddedVideoPlayer } from '@/components/EmbeddedVideoPlayer';
import { PdfViewerModal } from '@/components/PdfViewerModal';

export type MaterialComment = {
  id: string;
  author: string;
  role: 'STUDENT' | 'TEACHER';
  date: string;
  text: string;
};

export type MaterialTypeOption = 'VIDEO' | 'ARTICLE' | 'TIP' | 'PDF';

export type Material = {
  id: string;
  subject: string;
  subjectId?: string;
  topic: string;
  topicId?: string;
  teacher: string;
  type: 'video' | 'article' | 'tip' | 'pdf' | 'link';
  title: string;
  description: string;
  content?: string;
  color: string;
  folderIcon: string;
  hasRelatedTask?: boolean;
  comments: MaterialComment[];
  youtubeUrl?: string | null;
  fileUrl?: string | null;
  url?: string;
  createdAt?: string;
};

/**
 * Regex para validar e extrair o ID de 11 caracteres de URLs do YouTube.
 */
export function extractYouTubeVideoId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const match = url
    .trim()
    .match(
      /(?:youtube\.com\/(?:watch\?.*v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i
    );
  return match ? match[1] : null;
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Schema Zod dinâmico para validação do formulário do professor.
 * Valida campos de acordo com o formato escolhido (VIDEO, ARTICLE, TIP, PDF).
 */
const createMaterialSchema = z
  .object({
    classroomId: z.string().min(1, 'Selecione uma turma para vincular o material'),
    subjectId: z.string().optional(),
    type: z.enum(['VIDEO', 'ARTICLE', 'TIP', 'PDF']),
    title: z
      .string({ required_error: 'O título do material é obrigatório' })
      .trim()
      .min(3, 'O título deve ter no mínimo 3 caracteres'),
    description: z.string().optional(),
    content: z.string().optional(),
    youtubeUrl: z.string().optional(),
    fileUrl: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'VIDEO') {
      const url = (data.youtubeUrl || '').trim();
      if (!url) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['youtubeUrl'],
          message: 'O link do YouTube é obrigatório para videoaulas',
        });
      } else if (
        !/(?:youtube\.com\/(?:watch\?.*v=|embed\/|v\/|shorts\/)|youtu\.be\/)[a-zA-Z0-9_-]{11}/i.test(
          url
        )
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['youtubeUrl'],
          message:
            'Insira um link válido do YouTube (ex: https://www.youtube.com/watch?v=... ou https://youtu.be/...)',
        });
      }
    } else if (data.type === 'ARTICLE' || data.type === 'TIP') {
      const body = (data.content || data.description || '').trim();
      if (!body || body.length < 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['content'],
          message:
            data.type === 'TIP'
              ? 'Descreva a dica rápida / macete (mínimo de 5 caracteres)'
              : 'O conteúdo do artigo em texto/Markdown é obrigatório (mínimo de 5 caracteres)',
        });
      }
    } else if (data.type === 'PDF') {
      const url = (data.fileUrl || '').trim();
      if (!url) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['fileUrl'],
          message:
            'Selecione um arquivo PDF para upload ou informe uma URL externa.',
        });
      }
    }
  });

type CreateMaterialFormData = z.infer<typeof createMaterialSchema>;

const FORMAT_OPTIONS: {
  id: MaterialTypeOption;
  label: string;
  sub: string;
  icon: string;
  color: string;
}[] = [
  {
    id: 'VIDEO',
    label: 'Vídeo do YouTube',
    sub: 'Player embutido 16:9',
    icon: 'youtube',
    color: '#EF4444',
  },
  {
    id: 'ARTICLE',
    label: 'Artigo / Texto',
    sub: 'Leitura com Markdown',
    icon: 'newspaper',
    color: '#3B82F6',
  },
  {
    id: 'TIP',
    label: 'Macete Rápido',
    sub: 'Dica de ouro / Flash-tip',
    icon: 'lightbulb',
    color: '#F59E0B',
  },
  {
    id: 'PDF',
    label: 'Arquivo PDF / Link',
    sub: 'Apostilas e documentos',
    icon: 'file-pdf',
    color: '#10B981',
  },
];

const INITIAL_MATERIALS_DB: Material[] = [
  {
    id: 'm1',
    subject: 'Física',
    topic: 'Cinemática Escalar',
    teacher: 'Prof. Carlos',
    type: 'pdf',
    title: 'Resumão: Fórmulas de Cinemática',
    description: 'PDF completo de 2 páginas resumindo MRU, MRUV e lançamento oblíquo com gráficos explicativos.',
    content: 'Guia de fórmulas essenciais de cinemática para resolução rápida no ENEM.',
    color: '#58CC02',
    folderIcon: 'atom',
    fileUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    hasRelatedTask: true,
    comments: [
      {
        id: 'c1',
        author: 'Beatriz Costa',
        role: 'STUDENT',
        date: 'Ontem',
        text: 'A tabela de fórmulas ficou muito prática!',
      },
    ],
  },
  {
    id: 'm2',
    subject: 'Física',
    topic: 'Leis de Newton',
    teacher: 'Prof. Carlos',
    type: 'video',
    title: 'Videoaula: Aplicação de Forças no Plano Inclinado',
    description: 'Revisão gravada com foco nas questões recorrentes de decomposição de vetores no ENEM.',
    color: '#58CC02',
    folderIcon: 'atom',
    youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    hasRelatedTask: true,
    comments: [],
  },
  {
    id: 'm3',
    subject: 'Matemática',
    topic: 'Geometria Plana',
    teacher: 'Profª. Marta',
    type: 'tip',
    title: 'Macete: Áreas de Triângulos e Fórmula de Herão',
    description: 'Dica rápida para economizar tempo no cálculo sem conhecer a altura.',
    content:
      '### 💡 Macete de Ouro: Fórmula de Herão\n\nQuando o triângulo **não tem altura definida**, calcule a área usando o semiperímetro ($p$):\n\n$$p = \\frac{a + b + c}{2}$$\n\n$$\\text{Área} = \\sqrt{p(p - a)(p - b)(p - c)}$$\n\n> **Dica ENEM:** Use essa fórmula especialmente em triângulos escalenos onde as 3 medidas dos lados são inteiras.',
    color: '#FF4B4B',
    folderIcon: 'calculator',
    hasRelatedTask: false,
    comments: [
      {
        id: 'c2',
        author: 'Lucas Silva',
        role: 'STUDENT',
        date: 'Hoje 10:00',
        text: 'Essa fórmula de Herão caiu no ENEM 2021!',
      },
    ],
  },
  {
    id: 'm4',
    subject: 'História',
    topic: 'Era Vargas',
    teacher: 'Prof. Sérgio',
    type: 'article',
    title: 'Artigo: O Estado Novo e a Máquina de Propaganda Política',
    description: 'Leitura aprofundada com foco na criação do DIP (Departamento de Imprensa e Propaganda).',
    content:
      '# O Estado Novo e o DIP (1937–1945)\n\nDurante o **Estado Novo**, Getúlio Vargas institucionalizou a propaganda estatal com a criação do **DIP** (Departamento de Imprensa e Propaganda) em 1939.\n\n### Principais Mecanismos de Ação:\n- **Censura Prévia:** Jornais, rádios, teatros e manifestações culturais tinham seu conteúdo inspecionado.\n- **A Hora do Brasil:** Programa de rádio obrigatório para divulgação das realizações do governo federal.\n- **Construção do Mito:** A figura de Vargas era projetada como *"o pai dos pobres"*, amigo das crianças e protetor dos trabalhadores.\n\n### Como o ENEM cobra:\nO exame costuma relacionar cartazes de época do DIP aos conceitos de autoritarismo, nacionalismo e cooptação da classe trabalhadora.',
    color: '#F1C40F',
    folderIcon: 'landmark',
    hasRelatedTask: false,
    comments: [],
  },
];

export default function MaterialsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();

  const {
    subject: filterSubjectParam,
    classId,
    className,
    openNew,
  } = useLocalSearchParams<{
    subject?: string;
    classId?: string;
    className?: string;
    openNew?: string;
  }>();

  const user = useUserStore((state) => state.user);
  const classrooms = useClassroomStore((state) => state.classrooms);

  // Estados de Filtro
  const [activeTypeFilter, setActiveTypeFilter] = useState<'ALL' | 'VIDEO' | 'ARTICLE' | 'TIP' | 'PDF'>('ALL');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>(filterSubjectParam || 'TODAS');

  const [expandedSubject, setExpandedSubject] = useState<string | null>(
    filterSubjectParam || 'Física'
  );
  const [materialsState, setMaterialsState] = useState<Material[]>(INITIAL_MATERIALS_DB);
  const [expandedMaterialComments, setExpandedMaterialComments] = useState<Record<string, boolean>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});

  // Estados do Modal e Toast
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [activePlayingId, setActivePlayingId] = useState<string | null>(null);

  // Modal de Leitura de Artigo / Macete em destaque
  const [readingMaterial, setReadingMaterial] = useState<Material | null>(null);

  // Visualizador In-App de PDF
  const [viewingPdf, setViewingPdf] = useState<{
    visible: boolean;
    fileUrl: string;
    title: string;
    description?: string;
  } | null>(null);

  // Opções de envio de PDF pelo professor ('UPLOAD' ou 'LINK')
  const [pdfInputMode, setPdfInputMode] = useState<'UPLOAD' | 'LINK'>('UPLOAD');
  const [selectedPdfAsset, setSelectedPdfAsset] =
    useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);

  const defaultClassroomId = classId || classrooms[0]?.id || '';

  // Configuração do React Hook Form com Zod Resolver
  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateMaterialFormData>({
    resolver: zodResolver(createMaterialSchema),
    defaultValues: {
      classroomId: defaultClassroomId,
      subjectId: '',
      type: 'VIDEO',
      title: '',
      description: '',
      content: '',
      youtubeUrl: '',
      fileUrl: '',
    },
  });

  // Atualiza defaultClassroomId quando os dados carregam
  useEffect(() => {
    if (defaultClassroomId) {
      setValue('classroomId', defaultClassroomId);
    }
  }, [defaultClassroomId, setValue]);

  // Abre o modal automaticamente se openNew === '1' (vindo do botão de publicação rápida da turma)
  useEffect(() => {
    if (openNew === '1' && user?.role === 'TEACHER') {
      setIsAddModalOpen(true);
    }
  }, [openNew, user?.role]);

  const watchedType = watch('type');
  const watchedYoutubeUrl = watch('youtubeUrl');
  const detectedVideoId = useMemo(
    () => extractYouTubeVideoId(watchedYoutubeUrl || ''),
    [watchedYoutubeUrl]
  );

  // 1. Busca Matérias e Lições padrão do sistema
  const { data: remoteSubjects = [] } = useQuery<any[], Error>({
    queryKey: ['classroom-materials-subjects'],
    queryFn: async () => {
      try {
        const res = await api.get<any[]>('/subjects');
        return Array.isArray(res) ? res : [];
      } catch {
        return [];
      }
    },
  });

  // 2. Busca Lições customizadas criadas para a turma (se classId estiver presente)
  const { data: classroomLessons = [] } = useQuery<any[], Error>({
    queryKey: ['classroom-custom-lessons', classId],
    queryFn: async () => {
      if (!classId) return [];
      try {
        const res = await api.get<any[]>(`/classrooms/${classId}/lessons`);
        return Array.isArray(res) ? res : [];
      } catch {
        return [];
      }
    },
    enabled: Boolean(classId),
  });

  // Mescla aulas de matérias padrão do sistema
  useEffect(() => {
    if (remoteSubjects && remoteSubjects.length > 0) {
      const dynamicMaterials: Material[] = [];
      for (const sub of remoteSubjects) {
        if (Array.isArray(sub.lessons)) {
          for (const les of sub.lessons) {
            dynamicMaterials.push({
              id: les.id,
              subject: sub.name,
              subjectId: sub.id,
              topic: les.title,
              topicId: les.id,
              teacher: 'Professores Minuto ENEM',
              type: les.youtubeUrl ? 'video' : 'article',
              title: les.title,
              description:
                les.content?.substring(0, 120) ||
                `Material teórico e exercícios resolvidos para fixação de ${sub.name}.`,
              content: les.content || undefined,
              color: sub.color || '#58CC02',
              folderIcon: sub.icon || 'book-open',
              hasRelatedTask: true,
              youtubeUrl: les.youtubeUrl || null,
              fileUrl: les.fileUrl || null,
              url: les.youtubeUrl || (les.videos && les.videos[0]),
              comments: [],
            });
          }
        }
      }
      if (dynamicMaterials.length > 0) {
        setMaterialsState((prev) => {
          const customOnes = prev.filter(
            (m) => m.id.startsWith('custom_') || m.id.startsWith('cls_')
          );
          const customIds = new Set(customOnes.map((c) => c.id));
          const filteredDefaults = dynamicMaterials.filter((d) => !customIds.has(d.id));
          return [...customOnes, ...filteredDefaults];
        });
      }
    }
  }, [remoteSubjects]);

  // Mescla aulas customizadas da turma
  useEffect(() => {
    if (Array.isArray(classroomLessons) && classroomLessons.length > 0) {
      const customMats: Material[] = classroomLessons.map((les) => {
        let mappedType: 'video' | 'article' | 'tip' | 'pdf' | 'link' = 'video';
        const rawType = (les.type || '').toUpperCase();
        if (rawType === 'VIDEO') mappedType = 'video';
        else if (rawType === 'ARTICLE') mappedType = 'article';
        else if (rawType === 'TIP') mappedType = 'tip';
        else if (rawType === 'PDF') mappedType = 'pdf';
        else if (rawType === 'EXTERNAL_LINK' || rawType === 'LINK') mappedType = 'link';
        else if (les.youtubeUrl) mappedType = 'video';
        else if (les.fileUrl && /\.pdf/i.test(les.fileUrl)) mappedType = 'pdf';
        else if (les.fileUrl) mappedType = 'link';

        const subjectName = les.subject?.name || className || 'Aulas da Turma';
        const color = les.subject?.color || '#3B82F6';

        return {
          id: les.id,
          subject: subjectName,
          subjectId: les.subjectId || les.subject?.id,
          topic: les.topic?.name || les.title,
          topicId: les.topicId,
          teacher: user?.name || 'Professor da Turma',
          type: mappedType,
          title: les.title,
          description: les.description || les.content?.substring(0, 140) || '',
          content: les.content || les.description,
          color,
          folderIcon: les.subject?.icon || 'chalkboard',
          hasRelatedTask: false,
          youtubeUrl: les.youtubeUrl,
          fileUrl: les.fileUrl,
          url: les.youtubeUrl || les.fileUrl,
          createdAt: les.createdAt,
          comments: [],
        };
      });

      setMaterialsState((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const newOnes = customMats.filter((m) => !existingIds.has(m.id));
        return [...newOnes, ...prev];
      });
    }
  }, [classroomLessons, className, user?.name]);

  const toggleSubject = (subject: string) => {
    setExpandedSubject((prev) => (prev === subject ? null : subject));
  };

  const toggleMaterialComments = (matId: string) => {
    setExpandedMaterialComments((prev) => ({
      ...prev,
      [matId]: !prev[matId],
    }));
  };

  const handleAddComment = (matId: string) => {
    const text = commentInputs[matId]?.trim();
    if (!text) return;

    const newComment: MaterialComment = {
      id: `mc_${Date.now()}`,
      author: user?.name || (user?.role === 'TEACHER' ? 'Professor' : 'Aluno'),
      role: (user?.role as 'STUDENT' | 'TEACHER') || 'STUDENT',
      date: 'Agora',
      text,
    };

    setMaterialsState((prev) =>
      prev.map((m) =>
        m.id === matId ? { ...m, comments: [...m.comments, newComment] } : m
      )
    );

    setCommentInputs((prev) => ({ ...prev, [matId]: '' }));
    setExpandedMaterialComments((prev) => ({ ...prev, [matId]: true }));
  };

  // Submissão do Formulário de Criação Multimodal
  const onSubmitMaterial = async (data: CreateMaterialFormData) => {
    setSubmitError(null);
    try {
      let canonicalYoutubeUrl: string | undefined = undefined;
      if (data.type === 'VIDEO' && data.youtubeUrl) {
        const videoId = extractYouTubeVideoId(data.youtubeUrl);
        canonicalYoutubeUrl = videoId
          ? `https://www.youtube.com/watch?v=${videoId}`
          : data.youtubeUrl.trim();
      }

      let resolvedFileUrl = data.fileUrl?.trim() || undefined;

      // Se o material for PDF, trata as opções de UPLOAD com progresso ou LINK externo
      if (data.type === 'PDF') {
        if (pdfInputMode === 'UPLOAD') {
          if (!selectedPdfAsset) {
            setSubmitError('Selecione um arquivo PDF para upload antes de publicar.');
            return;
          }

          const formData = new FormData();
          if (Platform.OS === 'web' && (selectedPdfAsset as any).file) {
            formData.append('file', (selectedPdfAsset as any).file);
          } else {
            formData.append('file', {
              uri: selectedPdfAsset.uri,
              name: selectedPdfAsset.name,
              type: selectedPdfAsset.mimeType || 'application/pdf',
            } as any);
          }

          setIsUploadingPdf(true);
          setUploadProgress(0);

          try {
            const uploadRes = await api.uploadWithProgress<{
              fileUrl: string;
              originalName: string;
              size: number;
            }>(
              `/classrooms/${data.classroomId}/materials/upload-pdf`,
              formData,
              (percent) => {
                setUploadProgress(percent);
              }
            );

            if (!uploadRes?.fileUrl) {
              throw new Error('Falha ao obter URL pública do PDF enviado.');
            }

            resolvedFileUrl = uploadRes.fileUrl;
          } catch (uploadErr: any) {
            setIsUploadingPdf(false);
            setSubmitError(
              uploadErr?.message || 'Falha ao realizar upload do arquivo PDF.'
            );
            return;
          } finally {
            setIsUploadingPdf(false);
          }
        } else {
          // Modo LINK EXTERNO
          const trimmedUrl = (data.fileUrl || '').trim();
          if (!trimmedUrl) {
            setSubmitError('Informe a URL do arquivo PDF.');
            return;
          }
          if (
            !/^https?:\/\//i.test(trimmedUrl) &&
            !trimmedUrl.startsWith('/uploads/')
          ) {
            setSubmitError(
              'Informe uma URL válida iniciando com http:// ou https://'
            );
            return;
          }
          resolvedFileUrl = trimmedUrl;
        }
      }

      const selectedSub = remoteSubjects.find((s) => s.id === data.subjectId);

      // Envia requisição para a rota POST /classrooms/:id/lessons
      const created = await api.post<any>(
        `/classrooms/${data.classroomId}/lessons`,
        {
          title: data.title.trim(),
          type: data.type,
          description: data.description?.trim() || undefined,
          content: data.content?.trim() || data.description?.trim() || undefined,
          youtubeUrl: canonicalYoutubeUrl,
          fileUrl: resolvedFileUrl,
          subjectId: data.subjectId || undefined,
          subject: selectedSub?.name || undefined,
        }
      );

      // Invalida os caches do React Query para manter a lista sincronizada
      await queryClient.invalidateQueries({
        queryKey: ['classroom-materials-subjects'],
      });
      await queryClient.invalidateQueries({
        queryKey: ['classroom-custom-lessons', data.classroomId],
      });
      await queryClient.invalidateQueries({
        queryKey: ['classroom-detail', data.classroomId],
      });

      // Atualiza a listagem local instantaneamente
      const targetRoom = classrooms.find((c) => c.id === data.classroomId);
      const subjectDisplayName = selectedSub?.name || targetRoom?.name || className || 'Aulas da Turma';

      let mappedType: 'video' | 'article' | 'tip' | 'pdf' | 'link' = 'video';
      if (data.type === 'VIDEO') mappedType = 'video';
      else if (data.type === 'ARTICLE') mappedType = 'article';
      else if (data.type === 'TIP') mappedType = 'tip';
      else if (data.type === 'PDF') mappedType = 'pdf';

      const newMaterial: Material = {
        id: created?.id || `cls_${Date.now()}`,
        subject: subjectDisplayName,
        subjectId: data.subjectId,
        topic: data.title.trim(),
        teacher: user?.name || 'Prof. Responsável',
        type: mappedType,
        title: data.title.trim(),
        description: data.description?.trim() || data.content?.substring(0, 140) || '',
        content: data.content?.trim() || data.description?.trim(),
        color: selectedSub?.color || '#3B82F6',
        folderIcon: selectedSub?.icon || 'folder',
        hasRelatedTask: false,
        youtubeUrl: canonicalYoutubeUrl,
        fileUrl: resolvedFileUrl || null,
        url: canonicalYoutubeUrl || resolvedFileUrl,
        comments: [],
      };

      setMaterialsState((prev) => [newMaterial, ...prev]);
      setExpandedSubject(newMaterial.subject);

      // Fecha o modal e limpa o formulário
      setIsAddModalOpen(false);
      setSelectedPdfAsset(null);
      setUploadProgress(0);
      setPdfInputMode('UPLOAD');
      reset({
        classroomId: defaultClassroomId,
        subjectId: '',
        type: 'VIDEO',
        title: '',
        description: '',
        content: '',
        youtubeUrl: '',
        fileUrl: '',
      });

      // Exibe toast de sucesso
      setToastMessage(`Material "${data.title.trim()}" publicado com sucesso para a turma!`);
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err: any) {
      const msg =
        err.response?.data?.error ||
        err.message ||
        'Não foi possível criar o material. Verifique os dados e tente novamente.';
      setSubmitError(msg);
    }
  };

  const getMaterialIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'pdf':
        return { icon: 'file-pdf', color: '#EF4444', label: 'PDF' };
      case 'video':
        return { icon: 'video', color: '#DC2626', label: 'VÍDEO' };
      case 'article':
        return { icon: 'newspaper', color: '#2563EB', label: 'ARTIGO' };
      case 'tip':
        return { icon: 'lightbulb', color: '#D97706', label: 'MACETE' };
      case 'link':
        return { icon: 'link', color: '#10B981', label: 'LINK' };
      default:
        return { icon: 'file-alt', color: '#64748B', label: 'MATERIAL' };
    }
  };

  // Seleção de arquivo PDF via DocumentPicker
  const handlePickDocument = async () => {
    try {
      setSubmitError(null);
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];

        if (!asset.name.toLowerCase().endsWith('.pdf')) {
          setSubmitError('Apenas arquivos no formato PDF (.pdf) são permitidos.');
          return;
        }

        if (asset.size && asset.size > 15 * 1024 * 1024) {
          setSubmitError('O arquivo PDF excede o limite máximo permitido de 15MB.');
          return;
        }

        setSelectedPdfAsset(asset);
        setValue('fileUrl', asset.name, { shouldValidate: true });
        setToastMessage(`Arquivo selecionado: ${asset.name}`);
      }
    } catch (err: any) {
      setSubmitError(err?.message || 'Erro ao selecionar documento PDF.');
    }
  };

  // Abrir arquivo PDF no visualizador in-app (PdfViewerModal)
  const handleOpenPdf = (
    url?: string | null,
    title?: string,
    description?: string
  ) => {
    if (!url) return;
    setViewingPdf({
      visible: true,
      fileUrl: url,
      title: title || 'Apostila / Documento PDF',
      description,
    });
  };

  // Lista única de matérias disponíveis para o filtro
  const availableSubjects = useMemo(() => {
    const set = new Set<string>();
    materialsState.forEach((m) => {
      if (m.subject) set.add(m.subject);
    });
    return Array.from(set);
  }, [materialsState]);

  // Filtragem multimodal por Tipo e Matéria
  const filteredMaterials = useMemo(() => {
    return materialsState.filter((mat) => {
      // Filtro por Tipo de Material
      if (activeTypeFilter !== 'ALL') {
        if (activeTypeFilter === 'VIDEO' && mat.type !== 'video') return false;
        if (activeTypeFilter === 'ARTICLE' && mat.type !== 'article') return false;
        if (activeTypeFilter === 'TIP' && mat.type !== 'tip') return false;
        if (activeTypeFilter === 'PDF' && mat.type !== 'pdf' && mat.type !== 'link') return false;
      }

      // Filtro por Matéria
      if (selectedSubjectFilter !== 'TODAS') {
        if (mat.subject.toLowerCase() !== selectedSubjectFilter.toLowerCase()) {
          return false;
        }
      }

      return true;
    });
  }, [materialsState, activeTypeFilter, selectedSubjectFilter]);

  // Agrupamento por Matéria
  const groupedMaterials = useMemo(() => {
    return filteredMaterials.reduce((acc, mat) => {
      if (!acc[mat.subject]) {
        acc[mat.subject] = {
          color: mat.color || '#58CC02',
          icon: mat.folderIcon || 'folder',
          materials: [],
        };
      }
      acc[mat.subject].materials.push(mat);
      return acc;
    }, {} as Record<string, { color: string; icon: string; materials: Material[] }>);
  }, [filteredMaterials]);

  return (
    <SafeAreaView style={styles.container}>
      {/* TOAST DE SUCESSO */}
      {toastMessage && (
        <View style={styles.toastContainer}>
          <View style={styles.toastIconBox}>
            <FontAwesome5 name="check-circle" size={16} color="#FFF" />
          </View>
          <Text style={styles.toastText}>{toastMessage}</Text>
          <TouchableOpacity onPress={() => setToastMessage(null)} style={{ padding: 4 }}>
            <FontAwesome5 name="times" size={13} color="#FFF" />
          </TouchableOpacity>
        </View>
      )}

      {/* 1. HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <FontAwesome5 name="arrow-left" size={18} color="#2C3A47" />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.headerTitle}>Central de Materiais</Text>
          {className && (
            <Text style={{ fontSize: 11, color: '#8CA0B3', marginTop: 2 }}>{className}</Text>
          )}
        </View>
        {user?.role === 'TEACHER' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              style={styles.headerAddBtn}
              activeOpacity={0.8}
              onPress={() => {
                setSubmitError(null);
                setIsAddModalOpen(true);
              }}
            >
              <FontAwesome5 name="plus" size={12} color="#FFF" />
              <Text style={styles.headerAddBtnText}>Novo Material</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.teacherTrackerBtn}
              onPress={() => router.push('/classes/teacher-tracking' as any)}
            >
              <FontAwesome5 name="chart-pie" size={15} color="#1CB0F6" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.backButton} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Banner para Professor */}
        {user?.role === 'TEACHER' && (
          <View style={styles.teacherBannerWrapper}>
            <TouchableOpacity
              style={styles.teacherHeaderBanner}
              activeOpacity={0.85}
              onPress={() => router.push('/classes/teacher-tracking' as any)}
            >
              <View style={styles.teacherIconCircle}>
                <FontAwesome5 name="chalkboard-teacher" size={14} color="#FFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.teacherBannerTitle}>Acompanhamento Pedagógico</Text>
                <Text style={styles.teacherBannerSub}>
                  Veja visualizações dos materiais, notas de tarefas e dúvidas da turma.
                </Text>
              </View>
              <FontAwesome5 name="arrow-right" size={12} color="#0284C7" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.createLessonBannerBtn}
              activeOpacity={0.8}
              onPress={() => {
                setSubmitError(null);
                setIsAddModalOpen(true);
              }}
            >
              <FontAwesome5 name="plus-circle" size={15} color="#FFF" />
              <Text style={styles.createLessonBannerBtnText}>
                + Adicionar Material (Vídeo, Artigo, Macete ou PDF)
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ============================================================== */}
        {/* 2. ABAS DE FILTRO MULTIMODAL (POR FORMATO)                     */}
        {/* ============================================================== */}
        <View style={styles.formatFilterRow}>
          <TouchableOpacity
            style={[styles.formatFilterBtn, activeTypeFilter === 'ALL' && styles.formatFilterBtnActive]}
            onPress={() => setActiveTypeFilter('ALL')}
          >
            <FontAwesome5
              name="layer-group"
              size={12}
              color={activeTypeFilter === 'ALL' ? '#FFF' : '#64748B'}
            />
            <Text
              style={[
                styles.formatFilterText,
                activeTypeFilter === 'ALL' && styles.formatFilterTextActive,
              ]}
            >
              Todos ({materialsState.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.formatFilterBtn,
              activeTypeFilter === 'VIDEO' && styles.formatFilterBtnActive,
            ]}
            onPress={() => setActiveTypeFilter('VIDEO')}
          >
            <FontAwesome5
              name="youtube"
              size={12}
              color={activeTypeFilter === 'VIDEO' ? '#FFF' : '#EF4444'}
            />
            <Text
              style={[
                styles.formatFilterText,
                activeTypeFilter === 'VIDEO' && styles.formatFilterTextActive,
              ]}
            >
              Vídeos
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.formatFilterBtn,
              activeTypeFilter === 'ARTICLE' && styles.formatFilterBtnActive,
            ]}
            onPress={() => setActiveTypeFilter('ARTICLE')}
          >
            <FontAwesome5
              name="newspaper"
              size={12}
              color={activeTypeFilter === 'ARTICLE' ? '#FFF' : '#3B82F6'}
            />
            <Text
              style={[
                styles.formatFilterText,
                activeTypeFilter === 'ARTICLE' && styles.formatFilterTextActive,
              ]}
            >
              Artigos
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.formatFilterBtn,
              activeTypeFilter === 'TIP' && styles.formatFilterBtnActive,
            ]}
            onPress={() => setActiveTypeFilter('TIP')}
          >
            <FontAwesome5
              name="lightbulb"
              size={12}
              color={activeTypeFilter === 'TIP' ? '#FFF' : '#F59E0B'}
            />
            <Text
              style={[
                styles.formatFilterText,
                activeTypeFilter === 'TIP' && styles.formatFilterTextActive,
              ]}
            >
              Macetes
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.formatFilterBtn,
              activeTypeFilter === 'PDF' && styles.formatFilterBtnActive,
            ]}
            onPress={() => setActiveTypeFilter('PDF')}
          >
            <FontAwesome5
              name="file-pdf"
              size={12}
              color={activeTypeFilter === 'PDF' ? '#FFF' : '#10B981'}
            />
            <Text
              style={[
                styles.formatFilterText,
                activeTypeFilter === 'PDF' && styles.formatFilterTextActive,
              ]}
            >
              PDFs
            </Text>
          </TouchableOpacity>
        </View>

        {/* ============================================================== */}
        {/* 3. FILTRO HORIZONTAL POR MATÉRIA                               */}
        {/* ============================================================== */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.subjectFilterScroll}
        >
          <TouchableOpacity
            style={[
              styles.subjectPill,
              selectedSubjectFilter === 'TODAS' && styles.subjectPillActive,
            ]}
            onPress={() => setSelectedSubjectFilter('TODAS')}
          >
            <Text
              style={[
                styles.subjectPillText,
                selectedSubjectFilter === 'TODAS' && styles.subjectPillTextActive,
              ]}
            >
              Todas as Matérias
            </Text>
          </TouchableOpacity>

          {availableSubjects.map((sub) => {
            const isSelected = selectedSubjectFilter.toLowerCase() === sub.toLowerCase();
            return (
              <TouchableOpacity
                key={sub}
                style={[styles.subjectPill, isSelected && styles.subjectPillActive]}
                onPress={() => setSelectedSubjectFilter(sub)}
              >
                <Text
                  style={[styles.subjectPillText, isSelected && styles.subjectPillTextActive]}
                >
                  {sub}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* LISTAGEM DE MATERIAIS */}
        {Object.keys(groupedMaterials).length === 0 ? (
          <View style={styles.emptyState}>
            <FontAwesome5 name="folder-open" size={44} color="#CBD5E1" style={{ marginBottom: 12 }} />
            <Text style={styles.emptyText}>
              Nenhum material encontrado para os filtros selecionados.
            </Text>
            {user?.role === 'TEACHER' && (
              <TouchableOpacity
                style={styles.emptyAddBtn}
                onPress={() => {
                  setSubmitError(null);
                  setIsAddModalOpen(true);
                }}
              >
                <FontAwesome5 name="plus-circle" size={14} color="#FFF" />
                <Text style={styles.emptyAddBtnText}>Publicar Material Agora</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          Object.entries(groupedMaterials).map(([subject, data]) => {
            const isExpanded = expandedSubject === subject;

            return (
              <View key={subject} style={[styles.folderContainer, { borderColor: data.color }]}>
                {/* CAPA DA PASTA */}
                <TouchableOpacity
                  style={[styles.folderHeader, isExpanded && styles.folderHeaderActive]}
                  activeOpacity={0.8}
                  onPress={() => toggleSubject(subject)}
                >
                  <View style={styles.folderTitleRow}>
                    <View style={[styles.folderIconBox, { backgroundColor: data.color }]}>
                      <FontAwesome5 name={data.icon} size={15} color="#FFF" />
                    </View>
                    <View>
                      <Text style={styles.folderSubjectName}>{subject}</Text>
                      <Text style={styles.folderSubjectCount}>
                        {data.materials.length} {data.materials.length === 1 ? 'material' : 'materiais'}
                      </Text>
                    </View>
                  </View>
                  <FontAwesome5
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={14}
                    color="#8CA0B3"
                  />
                </TouchableOpacity>

                {/* CONTEÚDO DA PASTA */}
                {isExpanded && (
                  <View style={styles.expandedContent}>
                    {data.materials.map((mat) => {
                      const iconConfig = getMaterialIcon(mat.type);
                      const isCommentsOpen = !!expandedMaterialComments[mat.id];
                      const isYouTube = mat.type === 'video' || Boolean(mat.youtubeUrl);
                      const isArticle = mat.type === 'article';
                      const isTip = mat.type === 'tip';
                      const isPdf = mat.type === 'pdf' || mat.type === 'link';

                      return (
                        <View
                          key={mat.id}
                          style={[styles.materialCard, isTip && styles.materialCardTip]}
                        >
                          {/* Cabeçalho do Card */}
                          <View style={styles.cardHeader}>
                            <View style={styles.headerLeftTags}>
                              <View
                                style={[
                                  styles.formatTypeTag,
                                  { backgroundColor: `${iconConfig.color}18` },
                                ]}
                              >
                                <FontAwesome5
                                  name={iconConfig.icon}
                                  size={10}
                                  color={iconConfig.color}
                                />
                                <Text
                                  style={[styles.formatTypeTagText, { color: iconConfig.color }]}
                                >
                                  {iconConfig.label}
                                </Text>
                              </View>

                              <View style={styles.topicBadge}>
                                <Text style={styles.topicText}>{mat.topic}</Text>
                              </View>
                            </View>

                            <Text style={styles.teacherText}>{mat.teacher}</Text>
                          </View>

                          {/* Informações Principais */}
                          <View style={styles.mainInfoRow}>
                            <View
                              style={[
                                styles.typeIconBox,
                                { backgroundColor: `${iconConfig.color}15` },
                              ]}
                            >
                              <FontAwesome5
                                name={iconConfig.icon}
                                size={18}
                                color={iconConfig.color}
                              />
                            </View>
                            <View style={styles.textDetails}>
                              <Text style={styles.materialTitle}>{mat.title}</Text>
                              <Text style={styles.materialDesc} numberOfLines={3}>
                                {mat.description || mat.content}
                              </Text>
                            </View>
                          </View>

                          {/* Se for MACETE RÁPIDO (FLASH-TIP): Box Especial de Destaque */}
                          {isTip && mat.content && (
                            <View style={styles.tipHighlightBox}>
                              <View style={styles.tipHighlightHeader}>
                                <FontAwesome5 name="bolt" size={12} color="#D97706" />
                                <Text style={styles.tipHighlightTitle}>Dica de Fixação Rápida</Text>
                              </View>
                              <Text style={styles.tipHighlightText} numberOfLines={4}>
                                {mat.content.replace(/[#*`>]/g, '')}
                              </Text>
                            </View>
                          )}

                          {/* Ações Específicas por Tipo de Material */}
                          <View style={styles.cardActionsRow}>
                            {/* AÇÃO 1: VÍDEO DO YOUTUBE */}
                            {isYouTube && (
                              <TouchableOpacity
                                style={styles.actionBtnPrimaryVideo}
                                activeOpacity={0.8}
                                onPress={() => {
                                  setActivePlayingId((prev) => (prev === mat.id ? null : mat.id));
                                }}
                              >
                                <FontAwesome5
                                  name={activePlayingId === mat.id ? 'chevron-up' : 'play'}
                                  size={11}
                                  color="#FFF"
                                />
                                <Text style={styles.actionBtnPrimaryVideoText}>
                                  {activePlayingId === mat.id
                                    ? 'Ocultar Player'
                                    : 'Assistir Aula Embutida'}
                                </Text>
                              </TouchableOpacity>
                            )}

                            {/* AÇÃO 2: ARTIGO / TEXTO */}
                            {isArticle && (
                              <TouchableOpacity
                                style={styles.actionBtnPrimaryArticle}
                                activeOpacity={0.8}
                                onPress={() => setReadingMaterial(mat)}
                              >
                                <FontAwesome5 name="book-reader" size={11} color="#FFF" />
                                <Text style={styles.actionBtnPrimaryArticleText}>
                                  Ler Artigo Completo
                                </Text>
                              </TouchableOpacity>
                            )}

                            {/* AÇÃO 3: MACETE RÁPIDO */}
                            {isTip && (
                              <TouchableOpacity
                                style={styles.actionBtnPrimaryTip}
                                activeOpacity={0.8}
                                onPress={() => setReadingMaterial(mat)}
                              >
                                <FontAwesome5 name="lightbulb" size={11} color="#FFF" />
                                <Text style={styles.actionBtnPrimaryTipText}>
                                  Abrir Macete Detalhado
                                </Text>
                              </TouchableOpacity>
                            )}

                            {/* AÇÃO 4: ARQUIVO PDF */}
                            {isPdf && (
                              <TouchableOpacity
                                style={styles.actionBtnPrimaryPdf}
                                activeOpacity={0.8}
                                onPress={() =>
                                  handleOpenPdf(
                                    mat.fileUrl || mat.url,
                                    mat.title,
                                    mat.description
                                  )
                                }
                              >
                                <FontAwesome5 name="file-pdf" size={11} color="#FFF" />
                                <Text style={styles.actionBtnPrimaryPdfText}>
                                  Visualizar / Abrir PDF
                                </Text>
                              </TouchableOpacity>
                            )}

                            {/* Botão Secundário de Tarefa Vinculada */}
                            {mat.hasRelatedTask && (
                              <TouchableOpacity
                                style={styles.taskLinkButton}
                                onPress={() => router.push('/classes/tasks' as any)}
                              >
                                <FontAwesome5 name="tasks" size={10} color="#16A34A" />
                                <Text style={styles.taskLinkText}>Ver Tarefa</Text>
                              </TouchableOpacity>
                            )}
                          </View>

                          {/* Player de YouTube Embutido Inline */}
                          {isYouTube && activePlayingId === mat.id && (
                            <View style={styles.embeddedMaterialPlayerWrapper}>
                              <EmbeddedVideoPlayer
                                youtubeUrl={mat.youtubeUrl || mat.url}
                                title={mat.title}
                                fullWidth={true}
                              />
                            </View>
                          )}

                          {/* Seção de Dúvidas / Comentários no Material */}
                          <View style={styles.commentsWrapper}>
                            <TouchableOpacity
                              style={styles.commentsToggleBtn}
                              onPress={() => toggleMaterialComments(mat.id)}
                            >
                              <FontAwesome5 name="comment-alt" size={11} color="#0284C7" />
                              <Text style={styles.commentsToggleText}>
                                {mat.comments.length}{' '}
                                {mat.comments.length === 1 ? 'dúvida/comentário' : 'dúvidas/comentários'}
                              </Text>
                              <FontAwesome5
                                name={isCommentsOpen ? 'chevron-up' : 'chevron-down'}
                                size={10}
                                color="#8CA0B3"
                              />
                            </TouchableOpacity>

                            {isCommentsOpen && (
                              <View style={styles.commentsList}>
                                {mat.comments.map((comm) => (
                                  <View key={comm.id} style={styles.commentItem}>
                                    <View style={styles.commentHeaderMini}>
                                      <Text style={styles.commentAuthorText}>
                                        {comm.author}{' '}
                                        {comm.role === 'TEACHER' && (
                                          <Text style={styles.teacherTag}>(Professor)</Text>
                                        )}
                                      </Text>
                                      <Text style={styles.commentDateText}>{comm.date}</Text>
                                    </View>
                                    <Text style={styles.commentBodyText}>{comm.text}</Text>
                                  </View>
                                ))}

                                <View style={styles.commentInputRow}>
                                  <TextInput
                                    style={styles.commentInput}
                                    placeholder="Tirar dúvida sobre este material..."
                                    placeholderTextColor="#A0AEC0"
                                    value={commentInputs[mat.id] || ''}
                                    onChangeText={(txt) =>
                                      setCommentInputs((prev) => ({ ...prev, [mat.id]: txt }))
                                    }
                                  />
                                  <TouchableOpacity
                                    style={styles.commentSendBtn}
                                    onPress={() => handleAddComment(mat.id)}
                                  >
                                    <FontAwesome5 name="paper-plane" size={11} color="#FFF" />
                                  </TouchableOpacity>
                                </View>
                              </View>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* ============================================================== */}
      {/* 4. MODAL DO LEITOR DE ARTIGO / MACETE FORMATADO EM TELA CHEIA   */}
      {/* ============================================================== */}
      <Modal
        visible={Boolean(readingMaterial)}
        transparent
        animationType="slide"
        onRequestClose={() => setReadingMaterial(null)}
      >
        <SafeAreaView style={styles.readerModalOverlay}>
          <View style={styles.readerCard}>
            {/* Header do Leitor */}
            <View style={styles.readerHeader}>
              <View style={{ flex: 1 }}>
                <View style={styles.readerBadgeRow}>
                  <View
                    style={[
                      styles.readerTypeBadge,
                      {
                        backgroundColor:
                          readingMaterial?.type === 'tip' ? '#FEF3C7' : '#EFF6FF',
                      },
                    ]}
                  >
                    <FontAwesome5
                      name={readingMaterial?.type === 'tip' ? 'lightbulb' : 'newspaper'}
                      size={11}
                      color={readingMaterial?.type === 'tip' ? '#D97706' : '#2563EB'}
                    />
                    <Text
                      style={[
                        styles.readerTypeBadgeText,
                        {
                          color:
                            readingMaterial?.type === 'tip' ? '#D97706' : '#2563EB',
                        },
                      ]}
                    >
                      {readingMaterial?.type === 'tip' ? 'Macete Rápido' : 'Artigo Didático'}
                    </Text>
                  </View>
                  <Text style={styles.readerSubjectText}>{readingMaterial?.subject}</Text>
                </View>
                <Text style={styles.readerTitle} numberOfLines={2}>
                  {readingMaterial?.title}
                </Text>
                <Text style={styles.readerAuthorSub}>
                  Publicado por {readingMaterial?.teacher}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.readerCloseBtn}
                onPress={() => setReadingMaterial(null)}
              >
                <FontAwesome5 name="times" size={16} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Conteúdo formatado em Markdown */}
            <ScrollView
              style={styles.readerScroll}
              contentContainerStyle={styles.readerScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {readingMaterial?.content ? (
                <Markdown style={markdownStyles as any}>
                  {readingMaterial.content}
                </Markdown>
              ) : (
                <Text style={styles.readerPlainBody}>
                  {readingMaterial?.description || 'Nenhum texto disponível para este material.'}
                </Text>
              )}

              {/* Botão de Praticar Questões deste Assunto */}
              <View style={styles.readerFooterActionBox}>
                <TouchableOpacity
                  style={styles.practiceQuizBtn}
                  activeOpacity={0.85}
                  onPress={() => {
                    const subId = readingMaterial?.subjectId;
                    setReadingMaterial(null);
                    router.push({
                      pathname: '/quiz',
                      params: {
                        subjectId: subId || '',
                        lessonId: readingMaterial?.id || '',
                      },
                    } as any);
                  }}
                >
                  <FontAwesome5 name="pencil-alt" size={14} color="#FFF" />
                  <Text style={styles.practiceQuizBtnText}>
                    Praticar Questões deste Assunto
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>

      {/* ============================================================== */}
      {/* 5. MODAL DO PROFESSOR: CRIAR MATERIAL MULTIMODAL              */}
      {/* Validado dinamicamente com React Hook Form e Zod               */}
      {/* ============================================================== */}
      <Modal
        visible={isAddModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setIsAddModalOpen(false);
          reset();
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            {/* Cabeçalho do Modal */}
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <View style={styles.modalHeaderIconBox}>
                  <FontAwesome5 name="folder-plus" size={16} color="#FFF" />
                </View>
                <View>
                  <Text style={styles.modalTitle}>Adicionar Material Didático</Text>
                  <Text style={styles.modalSub}>
                    Crie videoaulas, artigos, macetes ou anexe documentos PDF.
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => {
                  setIsAddModalOpen(false);
                  reset();
                }}
              >
                <FontAwesome5 name="times" size={14} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Mensagem de Erro da API */}
            {submitError && (
              <View style={styles.submitErrorBanner}>
                <FontAwesome5 name="exclamation-circle" size={14} color="#DC2626" />
                <Text style={styles.submitErrorText}>{submitError}</Text>
              </View>
            )}

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.formContent}>
              {/* 1. SELETOR DE FORMATO DO MATERIAL */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Formato do Material *</Text>
                <Controller
                  control={control}
                  name="type"
                  render={({ field: { value, onChange } }) => (
                    <View style={styles.formatSelectorGrid}>
                      {FORMAT_OPTIONS.map((opt) => {
                        const isSelected = value === opt.id;
                        return (
                          <TouchableOpacity
                            key={opt.id}
                            style={[
                              styles.formatOptionCard,
                              isSelected && {
                                borderColor: opt.color,
                                backgroundColor: `${opt.color}10`,
                              },
                            ]}
                            activeOpacity={0.8}
                            onPress={() => onChange(opt.id)}
                          >
                            <View
                              style={[
                                styles.formatOptionIconCircle,
                                { backgroundColor: isSelected ? opt.color : '#E2E8F0' },
                              ]}
                            >
                              <FontAwesome5
                                name={opt.icon}
                                size={13}
                                color={isSelected ? '#FFF' : '#64748B'}
                              />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text
                                style={[
                                  styles.formatOptionLabel,
                                  isSelected && { color: opt.color, fontWeight: 'bold' },
                                ]}
                              >
                                {opt.label}
                              </Text>
                              <Text style={styles.formatOptionSub}>{opt.sub}</Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                />
              </View>

              {/* 2. SELEÇÃO DA TURMA (SE HOUVER MAIS DE UMA) */}
              {classrooms.length > 0 && (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Vincular à Turma *</Text>
                  <Controller
                    control={control}
                    name="classroomId"
                    render={({ field: { value, onChange } }) => (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.classroomSelectorScroll}
                      >
                        {classrooms.map((c) => {
                          const isSelected = value === c.id;
                          return (
                            <TouchableOpacity
                              key={c.id}
                              style={[
                                styles.classroomPill,
                                isSelected && styles.classroomPillSelected,
                              ]}
                              activeOpacity={0.8}
                              onPress={() => onChange(c.id)}
                            >
                              <FontAwesome5
                                name={c.icon || 'chalkboard-teacher'}
                                size={12}
                                color={isSelected ? '#FFF' : '#64748B'}
                              />
                              <Text
                                style={[
                                  styles.classroomPillText,
                                  isSelected && styles.classroomPillTextSelected,
                                ]}
                              >
                                {c.name}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    )}
                  />
                  {errors.classroomId && (
                    <Text style={styles.fieldErrorText}>{errors.classroomId.message}</Text>
                  )}
                </View>
              )}

              {/* 3. SELEÇÃO DA MATÉRIA */}
              {remoteSubjects.length > 0 && (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Vincular à Matéria *</Text>
                  <Controller
                    control={control}
                    name="subjectId"
                    render={({ field: { value, onChange } }) => (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.classroomSelectorScroll}
                      >
                        {remoteSubjects.map((sub) => {
                          const isSelected = value === sub.id;
                          return (
                            <TouchableOpacity
                              key={sub.id}
                              style={[
                                styles.subjectSelectorPill,
                                isSelected && {
                                  backgroundColor: sub.color || '#0284C7',
                                  borderColor: sub.color || '#0284C7',
                                },
                              ]}
                              activeOpacity={0.8}
                              onPress={() => onChange(sub.id)}
                            >
                              <FontAwesome5
                                name={sub.icon || 'book'}
                                size={11}
                                color={isSelected ? '#FFF' : sub.color || '#64748B'}
                              />
                              <Text
                                style={[
                                  styles.subjectSelectorPillText,
                                  isSelected && { color: '#FFF', fontWeight: 'bold' },
                                ]}
                              >
                                {sub.name}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    )}
                  />
                </View>
              )}

              {/* 4. TÍTULO DO MATERIAL */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Título do Material *</Text>
                <Controller
                  control={control}
                  name="title"
                  render={({ field: { value, onChange, onBlur } }) => (
                    <TextInput
                      style={[styles.input, errors.title && styles.inputError]}
                      placeholder={
                        watchedType === 'VIDEO'
                          ? 'Ex: Cinemática - Gráficos do MRU e MRUV'
                          : watchedType === 'TIP'
                          ? 'Ex: Macete da Regra da Mão Direita em Eletromagnetismo'
                          : watchedType === 'ARTICLE'
                          ? 'Ex: O Estado Novo e o Papel do DIP no Brasil'
                          : 'Ex: Resumo Geral de Funções Trigonométricas'
                      }
                      placeholderTextColor="#94A3B8"
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                    />
                  )}
                />
                {errors.title && (
                  <View style={styles.errorRow}>
                    <FontAwesome5 name="exclamation-circle" size={11} color="#DC2626" />
                    <Text style={styles.fieldErrorText}>{errors.title.message}</Text>
                  </View>
                )}
              </View>

              {/* 5. CAMPOS DINÂMICOS CONFORME O TIPO ESCOLHIDO */}

              {/* CASO A: VÍDEO DO YOUTUBE */}
              {watchedType === 'VIDEO' && (
                <>
                  <View style={styles.fieldGroup}>
                    <View style={styles.labelWithBadgeRow}>
                      <Text style={styles.fieldLabel}>Link do Vídeo no YouTube *</Text>
                      {detectedVideoId && (
                        <View style={styles.videoIdBadge}>
                          <FontAwesome5 name="check" size={10} color="#16A34A" />
                          <Text style={styles.videoIdBadgeText}>ID: {detectedVideoId}</Text>
                        </View>
                      )}
                    </View>

                    <Controller
                      control={control}
                      name="youtubeUrl"
                      render={({ field: { value, onChange, onBlur } }) => (
                        <View
                          style={[
                            styles.youtubeInputContainer,
                            errors.youtubeUrl && styles.inputError,
                          ]}
                        >
                          <FontAwesome5
                            name="youtube"
                            size={18}
                            color="#EF4444"
                            style={{ marginRight: 10 }}
                          />
                          <TextInput
                            style={styles.youtubeInput}
                            placeholder="https://www.youtube.com/watch?v=... ou https://youtu.be/..."
                            placeholderTextColor="#94A3B8"
                            autoCapitalize="none"
                            autoCorrect={false}
                            value={value}
                            onChangeText={onChange}
                            onBlur={onBlur}
                          />
                        </View>
                      )}
                    />
                    {errors.youtubeUrl ? (
                      <View style={styles.errorRow}>
                        <FontAwesome5 name="exclamation-circle" size={11} color="#DC2626" />
                        <Text style={styles.fieldErrorText}>{errors.youtubeUrl.message}</Text>
                      </View>
                    ) : (
                      <Text style={styles.fieldHint}>
                        Formatos aceitos: youtube.com/watch?v=ID, youtu.be/ID ou youtube.com/shorts/ID
                      </Text>
                    )}

                    {/* Preview do Vídeo Detectado */}
                    {detectedVideoId && (
                      <View style={styles.videoPreviewBox}>
                        <Image
                          source={{
                            uri: `https://img.youtube.com/vi/${detectedVideoId}/hqdefault.jpg`,
                          }}
                          style={styles.videoThumbnail}
                          resizeMode="cover"
                        />
                        <View style={styles.videoPreviewInfo}>
                          <View style={styles.videoPreviewPlayIcon}>
                            <FontAwesome5 name="play" size={12} color="#FFF" />
                          </View>
                          <Text style={styles.videoPreviewUrlText} numberOfLines={1}>
                            https://www.youtube.com/watch?v={detectedVideoId}
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Conteúdo / Descrição Pedagógica</Text>
                    <Controller
                      control={control}
                      name="description"
                      render={({ field: { value, onChange, onBlur } }) => (
                        <TextInput
                          style={[styles.input, styles.textArea]}
                          placeholder="Explique os pontos-chave abordados na videoaula..."
                          placeholderTextColor="#94A3B8"
                          value={value}
                          onChangeText={onChange}
                          onBlur={onBlur}
                          multiline
                          numberOfLines={3}
                          textAlignVertical="top"
                        />
                      )}
                    />
                  </View>
                </>
              )}

              {/* CASO B: ARTIGO / TEXTO */}
              {watchedType === 'ARTICLE' && (
                <>
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Resumo Breve / Subtítulo</Text>
                    <Controller
                      control={control}
                      name="description"
                      render={({ field: { value, onChange, onBlur } }) => (
                        <TextInput
                          style={styles.input}
                          placeholder="Uma linha explicando sobre o que é este artigo..."
                          placeholderTextColor="#94A3B8"
                          value={value}
                          onChangeText={onChange}
                          onBlur={onBlur}
                        />
                      )}
                    />
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Texto do Artigo (Suporta Markdown) *</Text>
                    <Controller
                      control={control}
                      name="content"
                      render={({ field: { value, onChange, onBlur } }) => (
                        <TextInput
                          style={[
                            styles.input,
                            styles.articleTextArea,
                            errors.content && styles.inputError,
                          ]}
                          placeholder="# Título Principal&#10;&#10;Escreva o artigo completo para seus alunos. Você pode usar títulos (#), tópicos (-) e negrito (**)."
                          placeholderTextColor="#94A3B8"
                          value={value}
                          onChangeText={onChange}
                          onBlur={onBlur}
                          multiline
                          numberOfLines={8}
                          textAlignVertical="top"
                        />
                      )}
                    />
                    {errors.content && (
                      <View style={styles.errorRow}>
                        <FontAwesome5 name="exclamation-circle" size={11} color="#DC2626" />
                        <Text style={styles.fieldErrorText}>{errors.content.message}</Text>
                      </View>
                    )}
                  </View>
                </>
              )}

              {/* CASO C: MACETE RÁPIDO (FLASH-TIP) */}
              {watchedType === 'TIP' && (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Dica Rápida / Macete Mnemônico *</Text>
                  <Controller
                    control={control}
                    name="content"
                    render={({ field: { value, onChange, onBlur } }) => (
                      <TextInput
                        style={[
                          styles.input,
                          styles.tipTextArea,
                          errors.content && styles.inputError,
                        ]}
                        placeholder="Ex: Para lembrar a ordem das bases nitrogenadas do DNA: Água Tônica e Coca Gelada (A-T e C-G)."
                        placeholderTextColor="#94A3B8"
                        value={value}
                        onChangeText={onChange}
                        onBlur={onBlur}
                        multiline
                        numberOfLines={5}
                        textAlignVertical="top"
                      />
                    )}
                  />
                  {errors.content ? (
                    <View style={styles.errorRow}>
                      <FontAwesome5 name="exclamation-circle" size={11} color="#DC2626" />
                      <Text style={styles.fieldErrorText}>{errors.content.message}</Text>
                    </View>
                  ) : (
                    <Text style={styles.fieldHint}>
                      💡 Macetes objetivos e frases mnemônicas ajudam na retenção rápida para o ENEM!
                    </Text>
                  )}
                </View>
              )}

              {/* CASO D: ARQUIVO PDF (SELETOR: UPLOAD COM PROGRESSO OU LINK EXTERNO) */}
              {watchedType === 'PDF' && (
                <>
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Origem do Documento PDF *</Text>

                    {/* Chave seletora (toggle/tabs): Upload vs Link Externo */}
                    <View style={styles.pdfTabsToggle}>
                      <TouchableOpacity
                        style={[
                          styles.pdfTabBtn,
                          pdfInputMode === 'UPLOAD' && styles.pdfTabBtnActive,
                        ]}
                        activeOpacity={0.8}
                        onPress={() => {
                          setPdfInputMode('UPLOAD');
                          if (selectedPdfAsset) {
                            setValue('fileUrl', selectedPdfAsset.name, {
                              shouldValidate: true,
                            });
                          } else {
                            setValue('fileUrl', '');
                          }
                        }}
                      >
                        <FontAwesome5
                          name="cloud-upload-alt"
                          size={13}
                          color={pdfInputMode === 'UPLOAD' ? '#2563EB' : '#64748B'}
                        />
                        <Text
                          style={[
                            styles.pdfTabBtnText,
                            pdfInputMode === 'UPLOAD' && styles.pdfTabBtnTextActive,
                          ]}
                        >
                          Fazer Upload de Arquivo
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.pdfTabBtn,
                          pdfInputMode === 'LINK' && styles.pdfTabBtnActive,
                        ]}
                        activeOpacity={0.8}
                        onPress={() => {
                          setPdfInputMode('LINK');
                          setValue('fileUrl', '');
                        }}
                      >
                        <FontAwesome5
                          name="link"
                          size={13}
                          color={pdfInputMode === 'LINK' ? '#2563EB' : '#64748B'}
                        />
                        <Text
                          style={[
                            styles.pdfTabBtnText,
                            pdfInputMode === 'LINK' && styles.pdfTabBtnTextActive,
                          ]}
                        >
                          Inserir Link Externo
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* OPÇÃO 1: FAZER UPLOAD DE ARQUIVO VIA DOCUMENTPICKER */}
                    {pdfInputMode === 'UPLOAD' ? (
                      <View style={{ marginTop: 12 }}>
                        {!selectedPdfAsset ? (
                          <TouchableOpacity
                            style={styles.documentPickerBtn}
                            activeOpacity={0.8}
                            onPress={handlePickDocument}
                          >
                            <View style={styles.documentPickerIconCircle}>
                              <FontAwesome5 name="file-pdf" size={24} color="#EF4444" />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.documentPickerTitle}>
                                Escolher arquivo PDF do dispositivo
                              </Text>
                              <Text style={styles.documentPickerSub}>
                                Documentos no formato .pdf (limite de até 15MB)
                              </Text>
                            </View>
                            <FontAwesome5 name="folder-open" size={16} color="#2563EB" />
                          </TouchableOpacity>
                        ) : (
                          <View style={styles.selectedAssetCard}>
                            <View style={styles.selectedAssetIconCircle}>
                              <FontAwesome5 name="file-pdf" size={20} color="#EF4444" />
                            </View>
                            <View style={styles.selectedAssetInfo}>
                              <Text style={styles.selectedAssetName} numberOfLines={1}>
                                {selectedPdfAsset.name}
                              </Text>
                              <Text style={styles.selectedAssetMeta}>
                                {formatFileSize(selectedPdfAsset.size)} • Pronto para upload
                              </Text>
                            </View>
                            <TouchableOpacity
                              style={styles.changeAssetBtn}
                              activeOpacity={0.8}
                              onPress={handlePickDocument}
                            >
                              <Text style={styles.changeAssetBtnText}>Trocar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.removeAssetBtn}
                              activeOpacity={0.8}
                              onPress={() => {
                                setSelectedPdfAsset(null);
                                setValue('fileUrl', '');
                              }}
                            >
                              <FontAwesome5 name="trash-alt" size={13} color="#EF4444" />
                            </TouchableOpacity>
                          </View>
                        )}

                        {/* Barra de Progresso durante o Envio */}
                        {isUploadingPdf && (
                          <View style={styles.uploadProgressContainer}>
                            <View style={styles.uploadProgressHeader}>
                              <Text style={styles.uploadProgressLabel}>
                                Enviando arquivo PDF para a turma...
                              </Text>
                              <Text style={styles.uploadProgressPercent}>
                                {uploadProgress}%
                              </Text>
                            </View>
                            <View style={styles.progressBarTrack}>
                              <View
                                style={[
                                  styles.progressBarFill,
                                  { width: `${uploadProgress}%` },
                                ]}
                              />
                            </View>
                          </View>
                        )}
                      </View>
                    ) : (
                      // OPÇÃO 2: INSERIR LINK EXTERNO
                      <View style={{ marginTop: 12 }}>
                        <Text style={[styles.fieldLabel, { fontSize: 12, color: '#64748B' }]}>
                          URL do Arquivo PDF (Web / Nuvem) *
                        </Text>
                        <Controller
                          control={control}
                          name="fileUrl"
                          render={({ field: { value, onChange, onBlur } }) => (
                            <View
                              style={[
                                styles.youtubeInputContainer,
                                errors.fileUrl && styles.inputError,
                              ]}
                            >
                              <FontAwesome5
                                name="link"
                                size={15}
                                color="#2563EB"
                                style={{ marginRight: 10 }}
                              />
                              <TextInput
                                style={styles.youtubeInput}
                                placeholder="https://exemplo.com/material.pdf"
                                placeholderTextColor="#94A3B8"
                                autoCapitalize="none"
                                autoCorrect={false}
                                value={value}
                                onChangeText={onChange}
                                onBlur={onBlur}
                              />
                            </View>
                          )}
                        />
                      </View>
                    )}

                    {errors.fileUrl && (
                      <View style={styles.errorRow}>
                        <FontAwesome5 name="exclamation-circle" size={11} color="#DC2626" />
                        <Text style={styles.fieldErrorText}>{errors.fileUrl.message}</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Descrição do PDF</Text>
                    <Controller
                      control={control}
                      name="description"
                      render={({ field: { value, onChange, onBlur } }) => (
                        <TextInput
                          style={[styles.input, styles.textArea]}
                          placeholder="Ex: Lista com 20 exercícios resolvidos e gabarito comentado..."
                          placeholderTextColor="#94A3B8"
                          value={value}
                          onChangeText={onChange}
                          onBlur={onBlur}
                          multiline
                          numberOfLines={3}
                          textAlignVertical="top"
                        />
                      )}
                    />
                  </View>
                </>
              )}

              {/* 6. BOTÕES DE AÇÃO DO MODAL */}
              <View style={styles.modalActionsRow}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  activeOpacity={0.7}
                  onPress={() => {
                    setIsAddModalOpen(false);
                    setSelectedPdfAsset(null);
                    setUploadProgress(0);
                    reset();
                  }}
                  disabled={isSubmitting || isUploadingPdf}
                >
                  <Text style={styles.cancelBtnText}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    (isSubmitting || isUploadingPdf) && styles.submitBtnDisabled,
                  ]}
                  activeOpacity={0.85}
                  onPress={() => {
                    handleSubmit(onSubmitMaterial)();
                  }}
                  disabled={isSubmitting || isUploadingPdf}
                >
                  {isSubmitting || isUploadingPdf ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <ActivityIndicator size="small" color="#FFF" />
                      <Text style={styles.submitBtnText}>
                        {isUploadingPdf
                          ? `Enviando PDF (${uploadProgress}%)...`
                          : 'Publicando...'}
                      </Text>
                    </View>
                  ) : (
                    <>
                      <FontAwesome5 name="check" size={13} color="#FFF" />
                      <Text style={styles.submitBtnText}>Publicar Material</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Visualizador In-App de Documentos PDF */}
      <PdfViewerModal
        visible={Boolean(viewingPdf?.visible)}
        onClose={() => setViewingPdf(null)}
        pdfUrl={viewingPdf?.fileUrl}
        title={viewingPdf?.title}
        description={viewingPdf?.description}
      />
    </SafeAreaView>
  );
}

const markdownStyles = {
  body: {
    color: '#334155',
    fontSize: 15,
    lineHeight: 24,
  },
  heading1: {
    color: '#0F172A',
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 18,
    marginBottom: 8,
  },
  heading2: {
    color: '#1E293B',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 14,
    marginBottom: 6,
  },
  heading3: {
    color: '#334155',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 4,
  },
  paragraph: {
    marginBottom: 12,
  },
  bullet_list: {
    marginBottom: 12,
  },
  list_item: {
    marginBottom: 6,
  },
  blockquote: {
    backgroundColor: '#F8FAFC',
    borderLeftColor: '#3B82F6',
    borderLeftWidth: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginVertical: 10,
    borderRadius: 4,
  },
  code_inline: {
    backgroundColor: '#F1F5F9',
    color: '#EF4444',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 13,
  },
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  backButton: { width: 38, height: 38, justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: 'bold', color: '#1E293B' },
  teacherTrackerBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#F0F9FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  headerAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#16A34A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  headerAddBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },

  // TOAST FLUTUANTE
  toastContainer: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    backgroundColor: '#16A34A',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  toastIconBox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toastText: {
    flex: 1,
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },

  scrollContent: { padding: 16, paddingBottom: 60 },

  teacherBannerWrapper: {
    marginBottom: 14,
    gap: 8,
  },
  teacherHeaderBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    padding: 12,
    borderRadius: 14,
    gap: 10,
  },
  teacherIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0284C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  teacherBannerTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0369A1',
  },
  teacherBannerSub: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 15,
  },
  createLessonBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  createLessonBannerBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: 'bold',
  },

  // ABAS DE FILTRO MULTIMODAL
  formatFilterRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  formatFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  formatFilterBtnActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  formatFilterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  formatFilterTextActive: {
    color: '#FFF',
    fontWeight: 'bold',
  },

  // FILTRO POR MATÉRIA
  subjectFilterScroll: {
    gap: 8,
    paddingBottom: 14,
  },
  subjectPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  subjectPillActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  subjectPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  subjectPillTextActive: {
    color: '#FFF',
    fontWeight: 'bold',
  },

  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 30, paddingHorizontal: 24 },
  emptyText: { fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 10, marginBottom: 16 },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#16A34A',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyAddBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },

  folderContainer: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    marginBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderLeftWidth: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  folderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#FFF',
  },
  folderHeaderActive: { borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#F8FAFC' },
  folderTitleRow: { flexDirection: 'row', alignItems: 'center' },
  folderIconBox: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  folderSubjectName: { fontSize: 15, fontWeight: 'bold', color: '#1E293B' },
  folderSubjectCount: { fontSize: 12, color: '#64748B', marginTop: 2 },

  expandedContent: { padding: 14, backgroundColor: '#F8FAFC', gap: 12 },

  materialCard: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  materialCardTip: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFDF5',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  headerLeftTags: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  formatTypeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  formatTypeTagText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  topicBadge: { backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  topicText: { fontSize: 11, fontWeight: 'bold', color: '#475569' },
  teacherText: { fontSize: 11, color: '#64748B', fontWeight: 'bold' },

  mainInfoRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  typeIconBox: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  textDetails: { flex: 1 },
  materialTitle: { fontSize: 14, fontWeight: 'bold', color: '#1E293B', marginBottom: 3 },
  materialDesc: { fontSize: 12, color: '#64748B', lineHeight: 17 },

  tipHighlightBox: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  tipHighlightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  tipHighlightTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#B45309',
  },
  tipHighlightText: {
    fontSize: 12,
    color: '#92400E',
    lineHeight: 17,
  },

  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
    flexWrap: 'wrap',
  },
  actionBtnPrimaryVideo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#DC2626',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  actionBtnPrimaryVideoText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FFF',
  },
  actionBtnPrimaryArticle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  actionBtnPrimaryArticleText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FFF',
  },
  actionBtnPrimaryTip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#D97706',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  actionBtnPrimaryTipText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FFF',
  },
  actionBtnPrimaryPdf: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  actionBtnPrimaryPdfText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FFF',
  },

  // Seletor de Abas/Toggle para PDF
  pdfTabsToggle: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 4,
    gap: 4,
    marginTop: 6,
  },
  pdfTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 8,
  },
  pdfTabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  pdfTabBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  pdfTabBtnTextActive: {
    color: '#2563EB',
    fontWeight: '700',
  },

  // Botão do DocumentPicker
  documentPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#CBD5E1',
    borderRadius: 12,
    padding: 16,
  },
  documentPickerIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  documentPickerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  documentPickerSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },

  // Card do Arquivo Selecionado
  selectedAssetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 12,
    padding: 14,
  },
  selectedAssetIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedAssetInfo: {
    flex: 1,
  },
  selectedAssetName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  selectedAssetMeta: {
    fontSize: 11,
    color: '#16A34A',
    fontWeight: '600',
    marginTop: 2,
  },
  changeAssetBtn: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  changeAssetBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369A1',
  },
  removeAssetBtn: {
    padding: 8,
  },

  // Barra de Progresso do Upload
  uploadProgressContainer: {
    marginTop: 12,
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  uploadProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  uploadProgressLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E40AF',
  },
  uploadProgressPercent: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: '#DBEAFE',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#2563EB',
    borderRadius: 4,
  },

  embeddedMaterialPlayerWrapper: {
    marginTop: 12,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
    width: '100%',
  },
  taskLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    marginLeft: 'auto',
  },
  taskLinkText: { fontSize: 11, fontWeight: 'bold', color: '#16A34A' },

  commentsWrapper: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  commentsToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  commentsToggleText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0284C7',
    flex: 1,
  },
  commentsList: {
    marginTop: 8,
    gap: 8,
  },
  commentItem: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  commentHeaderMini: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  commentAuthorText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  teacherTag: {
    color: '#0284C7',
  },
  commentDateText: {
    fontSize: 9,
    color: '#94A3B8',
  },
  commentBodyText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 16,
  },
  commentInputRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    color: '#1E293B',
  },
  commentSendBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#0284C7',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
  },

  // MODAL LEITOR EM TELA CHEIA
  readerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  readerCard: {
    width: '100%',
    maxWidth: 680,
    height: '92%',
    backgroundColor: '#FFF',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  readerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  readerBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  readerTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  readerTypeBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  readerSubjectText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  readerTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#0F172A',
    lineHeight: 22,
  },
  readerAuthorSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
  },
  readerCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  readerScroll: {
    flex: 1,
  },
  readerScrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  readerPlainBody: {
    fontSize: 15,
    color: '#334155',
    lineHeight: 24,
  },
  readerFooterActionBox: {
    marginTop: 30,
    paddingTop: 20,
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  practiceQuizBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#16A34A',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  practiceQuizBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },

  // MODAL DE CRIAÇÃO DO PROFESSOR
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '92%',
    backgroundColor: '#FFF',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  modalHeaderIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  modalSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },

  submitErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
  },
  submitErrorText: {
    flex: 1,
    fontSize: 12,
    color: '#B91C1C',
    fontWeight: '600',
  },

  formContent: {
    padding: 20,
    gap: 16,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  labelWithBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  videoIdBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  videoIdBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#16A34A',
  },

  formatSelectorGrid: {
    gap: 8,
  },
  formatOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  formatOptionIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formatOptionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  formatOptionSub: {
    fontSize: 11,
    color: '#64748B',
  },

  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0F172A',
  },
  textArea: {
    minHeight: 80,
  },
  articleTextArea: {
    minHeight: 140,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
  },
  tipTextArea: {
    minHeight: 100,
    backgroundColor: '#FFFDF5',
    borderColor: '#FDE68A',
  },
  inputError: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  fieldErrorText: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '600',
  },
  fieldHint: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },

  classroomSelectorScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  classroomPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  classroomPillSelected: {
    backgroundColor: '#0284C7',
    borderColor: '#0284C7',
  },
  classroomPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  classroomPillTextSelected: {
    color: '#FFF',
    fontWeight: 'bold',
  },

  subjectSelectorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  subjectSelectorPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },

  youtubeInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  youtubeInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 13,
    color: '#0F172A',
  },

  videoPreviewBox: {
    marginTop: 8,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#0F172A',
  },
  videoThumbnail: {
    width: '100%',
    height: 140,
    backgroundColor: '#1E293B',
  },
  videoPreviewInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    backgroundColor: '#0F172A',
  },
  videoPreviewPlayIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPreviewUrlText: {
    flex: 1,
    fontSize: 11,
    color: '#CBD5E1',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },

  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 10,
    paddingTop: 14,
    borderTopWidth: 1,
    borderColor: '#F1F5F9',
  },
  cancelBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#64748B',
  },
  submitBtn: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#16A34A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFF',
  },
});
