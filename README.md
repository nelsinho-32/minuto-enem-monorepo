# 🎓 Minuto ENEM — Plataforma Educacional Inteligente

<p align="center">
  <img src="https://img.shields.io/badge/Status-Em%20Desenvolvimento%20Ativo-brightgreen?style=for-the-badge" alt="Status">
  <img src="https://img.shields.io/badge/Architecture-Monorepo%20(Turborepo)-blueviolet?style=for-the-badge" alt="Monorepo">
  <img src="https://img.shields.io/badge/TypeScript-5.8%2B-blue?style=for-the-badge&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/React%20Native-Expo%2058-000020?style=for-the-badge&logo=expo" alt="Expo">
  <img src="https://img.shields.io/badge/Node.js-Express%205-green?style=for-the-badge&logo=node.js" alt="Express">
  <img src="https://img.shields.io/badge/Database-PostgreSQL%20%2B%20pgvector-336791?style=for-the-badge&logo=postgresql" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/Cache%20%26%20Queues-Redis%20%2B%20BullMQ-DC382D?style=for-the-badge&logo=redis" alt="Redis">
  <img src="https://img.shields.io/badge/AI-Google%20Gemini-4285F4?style=for-the-badge&logo=google" alt="Gemini AI">
</p>

---

## 📌 Sumário

- [Visão Geral](#-visão-geral)
- [Funcionalidades Principais](#-funcionalidades-principais)
- [Arquitetura do Projeto](#-arquitetura-do-projeto)
- [Stack Tecnológica](#-stack-tecnológica)
- [Estrutura do Repositório](#-estrutura-do-repositório)
- [Tutorial Passo a Passo para a Equipe](#-tutorial-passo-a-passo-para-a-equipe)
  - [1. Pré-requisitos](#1-pré-requisitos)
  - [2. Instalação](#2-instalação-do-projeto)
  - [3. Subir Bancos (Docker)](#3-subir-o-banco-de-dados-e-redis-via-docker)
  - [4. Variáveis de Ambiente](#4-configuração-das-variáveis-de-ambiente)
  - [5. Migrações e Seed do Banco](#5-migração-e-seed-do-banco-de-dados)
  - [6. Executar o Projeto](#6-executando-a-aplicação)
  - [7. Como Testar no Celular ou Navegador](#7-como-testar-no-celular-ou-navegador)
- [Guia de Uso das Funcionalidades](#-guia-de-uso-das-funcionalidades)
- [Comandos Úteis (Cheat Sheet)](#-comandos-úteis-cheat-sheet)
- [Solução de Problemas Frequentes (FAQ)](#-solução-de-problemas-frequentes-faq)
- [Convenções e Boas Práticas](#-convenções-e-boas-práticas)

---

## 💡 Visão Geral

O **Minuto ENEM** é um ecossistema educacional completo voltado para estudantes do Ensino Médio e pré-vestibulandos, integrando **estudo adaptativo, gamificação e gestão escolar para professores**.

Diferente de plataformas convencionais de questões, o projeto combina:
1. **Calibração Científica por TRI (Teoria de Resposta ao Item):** Questões reais com índices de discriminação, dificuldade e acerto ao acaso.
2. **Gamificação Profunda:** Sistema de ofensivas diárias (*streak* com proteção por congelamento), duelos 1v1 em tempo real com WebSockets, níveis e ganho de XP.
3. **Gestão Escolar para Professores:** Criação de turmas com código de acesso, central multimídia (PDFs, vídeos, artigos e macetes) e construtor flexível de tarefas com métricas da turma em tempo real.
4. **Inteligência Artificial (Google Gemini):** Tutoria socrática passo a passo e geração de simulados inéditos.
5. **Arquitetura Resiliente (Offline-First):** Fila de tentativas offline com reconciliação assíncrona automática via BullMQ e Redis.

---

## 🚀 Funcionalidades Principais

### 👨‍🏫 Para Professores
- **Criação e Gestão de Turmas:** Códigos únicos de acesso para alunos entrarem instantaneamente.
- **Central Multimídia de Materiais:**
  - 🎥 **Vídeos:** URLs do YouTube com player embutido sem sair do app.
  - 📄 **PDFs Híbridos:** Envio via upload direto (*multipart/form-data*) com barra de progresso ou inserção de link externo, ambos com visualizador integrado (*In-App PDF Viewer*).
  - 📝 **Artigos & Leituras:** Textos ricos em Markdown.
  - 💡 **Flash-Tips (Macetes Rápidos):** Dicas curtas destacadas por assunto.
- **Construtor Inteligente de Atividades (4 Modos):**
  1. *Seleção Manual no Banco do ENEM:* Pesquisa e filtragem por matéria, ano ou assunto.
  2. *Sorteio Inteligente:* Seleção automática por matéria, tópico, dificuldade e quantidade.
  3. *Questões Autorais:* Cadastro de enunciados e 5 alternativas próprias na hora.
  4. *Geração por IA (Google Gemini):* Criação de listas de exercícios temáticas automáticas.
- **Painel de Acompanhamento em Tempo Real (*Teacher Tracking*):**
  - Status de entrega de cada aluno (Pendente / Concluído).
  - Notas, tempo gasto na tarefa e acurácia.
  - Mapa de calor das questões com maior índice de erros da turma.

### 🎒 Para Alunos
- **Quiz Adaptativo do ENEM:** Prática com questões oficiais categorizadas por grandes áreas (*Ciências Humanas, Ciências da Natureza, Matemática, Linguagens e Códigos*), matérias e tópicos.
- **Trilhas de Aprendizagem Estruturadas:** Fluxo didático conectando Matéria $\rightarrow$ Tópicos $\rightarrow$ Lição $\rightarrow$ Prática direcionada de questões.
- **Duelos 1v1 em Tempo Real:** Disputa contra outros estudantes com sincronização via Socket.io, barra de progresso do oponente e telas de vitória/derrota.
- **Ofensiva Diária (Streaks) Estilo Duolingo:**
  - Contador de dias seguidos de estudo.
  - Calendário semanal de frequência.
  - Mecânica de congelamento de ofensiva (*Ice Freezes*) para dias de imprevisto.
  - Job automático diário para verificação de inatividade.
- **Repetição Espaçada (Flashcards):** Algoritmo para reforçar questões erradas no momento ideal de retenção de memória.
- **Caderno de Anotações:** Bloco de notas vinculado a aulas e assuntos específicos.
- **Modo Offline:** Pratique questões mesmo no transporte público ou sem internet; o app armazena as respostas localmente e sincroniza tudo com a nuvem quando a conexão retornar.

---

## 🏗 Arquitetura do Projeto

O projeto utiliza a arquitetura de **Monorepo gerenciado pelo Turborepo**, dividindo responsabilidades entre aplicações e pacotes compartilhados:

```mermaid
graph TD
    subgraph Frontend ["Front-end (apps/web)"]
        ExpoApp["Expo / React Native\n(Web, Android & iOS)"]
        ZustandStore["Zustand Stores\n(User, Chat, OfflineQueue)"]
        ReactQuery["TanStack React Query\n(Cache & Estado de Rede)"]
    end

    subgraph Shared ["Pacotes Compartilhados (packages/shared)"]
        ZodSchemas["Schemas Zod & Types TS\n(Single Source of Truth)"]
    end

    subgraph Backend ["Back-end (apps/api)"]
        ExpressServer["Servidor Express + TypeScript"]
        SocketIO["Socket.io (Duelos 1v1 Real-time)"]
        PrismaORM["Prisma ORM (PostgreSQL)"]
        BullMQWorkers["BullMQ + Background Workers"]
        GeminiService["Google Gemini AI Service"]
    end

    subgraph Infra ["Infraestrutura (Docker)"]
        Postgres["PostgreSQL 16 (pgvector)"]
        RedisDB["Redis (Filas & Cache)"]
    end

    ExpoApp -->|Consome Schemas| ZodSchemas
    ExpressServer -->|Valida com Schemas| ZodSchemas
    ExpoApp -->|REST API & Uploads| ExpressServer
    ExpoApp <-->|WebSocket Events| SocketIO
    ExpressServer --> PrismaORM
    ExpressServer --> BullMQWorkers
    ExpressServer --> GeminiService
    PrismaORM --> Postgres
    BullMQWorkers --> RedisDB
```

---

## 🛠 Stack Tecnológica

| Camada | Tecnologia | Descrição |
|---|---|---|
| **Monorepo** | [Turborepo](https://turbo.build/) | Pipeline de build ultrarrápido com cache inteligente e execução paralela |
| **Front-end** | [React Native](https://reactnative.dev/) / [Expo 58](https://expo.dev/) | Suporte universal: Roda no **Navegador Web**, **Android** e **iOS** com uma única base de código |
| **Navegação** | [Expo Router](https://docs.expo.dev/router/introduction/) | Roteamento baseado em arquivos (*file-based routing*) |
| **Estado & Cache** | [Zustand](https://zustand-demo.pmnd.rs/) + [TanStack Query](https://tanstack.com/query) | Gerenciamento de estado global leve e sincronização de dados do servidor |
| **Back-end** | [Node.js](https://nodejs.org/) + [Express 5](https://expressjs.com/) | API RESTful modular em TypeScript com middleware de upload e estáticos |
| **Banco de Dados** | [PostgreSQL 16](https://www.postgresql.org/) + [pgvector](https://github.com/pgvector/pgvector) | Banco relacional robusto com extensão vetorial para buscas semânticas futuras |
| **ORM** | [Prisma ORM 7](https://www.prisma.io/) | Modelagem de dados tipada, migrações e client autogerado |
| **Filas & Cache** | [Redis](https://redis.io/) + [BullMQ](https://docs.bullmq.io/) | Processamento assíncrono de tarefas pesadas e concorrência |
| **Tempo Real** | [Socket.io](https://socket.io/) | Conexão bidirecional em baixa latência para os duelos competitivos |
| **Inteligência Artificial** | [Google Gemini](https://ai.google.dev/) (`@google/genai`) | IA generativa para tutoria personalizada e geração de questões |
| **Contratos & Tipos** | [Zod 3](https://zod.dev/) | Validação em runtime e inferência estática unificada entre front e back |

---

## 📁 Estrutura do Repositório

```text
projEducacional/
├── apps/
│   ├── api/                       # 🟢 BACK-END (Node.js, Express, Prisma)
│   │   ├── prisma/
│   │   │   ├── schema.prisma      # Modelagem completa do banco de dados
│   │   │   └── seed.ts            # Seed com questões reais do ENEM calibradas com TRI
│   │   ├── src/
│   │   │   ├── controllers/       # Controladores de rota
│   │   │   ├── middlewares/       # Auth JWT, Upload Multer, validação
│   │   │   ├── queues/            # Filas BullMQ e workers em segundo plano
│   │   │   ├── routes/            # Definição modular de endpoints
│   │   │   ├── services/          # Regras de negócio (TRI, IA, Streaks, Tarefas)
│   │   │   ├── websocket/         # Salas e eventos de duelo 1v1
│   │   │   └── server.ts          # Inicialização HTTP + WebSocket + Static Files
│   │   ├── uploads/pdfs/          # Armazenamento de arquivos PDF enviados
│   │   └── docker-compose.yml     # Containers de PostgreSQL e Redis
│   │
│   └── web/                       # 🔵 FRONT-END (Expo / React Native Web)
│       ├── src/
│       │   ├── app/               # Telas do Expo Router (subject, classes, quiz, etc.)
│       │   ├── components/        # Componentes UI (PdfViewer, VideoPlayer, Modais, etc.)
│       │   ├── hooks/             # Custom hooks (useQuiz, useTheme, useQuestionsQuery)
│       │   ├── services/          # Cliente API com axios/fetch, upload com progresso
│       │   └── store/             # Stores Zustand (User, Turmas, Offline Queue)
│       └── package.json
│
├── packages/
│   └── shared/                    # 🟡 PACOTE COMPARTILHADO
│       └── src/
│           ├── index.ts           # Barrel file exportando tipos e schemas
│           └── schemas/           # Schemas Zod (task, lesson, question, user, etc.)
│
├── docker-compose.yml             # Docker compose global (opcional)
├── turbo.json                     # Configuração das pipelines do Turborepo
└── package.json                   # Scripts do monorepo e dependências raiz
```

---

## 📖 Tutorial Passo a Passo para a Equipe

Siga este guia prático para rodar o projeto na sua máquina do zero em menos de 5 minutos!

### 1. Pré-requisitos

Certifique-se de ter instalado em seu computador:
- **[Node.js](https://nodejs.org/)** (v20 ou superior recomendado)
- **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** (em execução para subir o banco e Redis)
- **Git**
- *(Opcional)* **App Expo Go** no celular (disponível na Google Play ou App Store) se desejar rodar no smartphone.

---

### 2. Instalação do Projeto

Clone o repositório e instale todas as dependências do monorepo a partir da raiz:

```powershell
# 1. Clone o repositório
git clone <URL_DO_REPOSITORIO>
cd projEducacional

# 2. Instale as dependências de todos os workspaces de uma só vez
npm install
```

> [!TIP]
> O npm instalará automaticamente as dependências de `apps/api`, `apps/web` e `packages/shared`, realizando o *link* local automático dos workspaces.

---

### 3. Subir o Banco de Dados e Redis via Docker

Abra um terminal e inicie os containers do **PostgreSQL** e do **Redis**:

```powershell
docker-compose -f apps/api/docker-compose.yml up -d
```

Para confirmar que os containers subiram com sucesso:
```powershell
docker ps
```
Você verá dois containers ativos:
- `enem_db` rodando na porta **5432**
- `enem_redis` rodando na porta **6379**

---

### 4. Configuração das Variáveis de Ambiente

#### Back-end (`apps/api/.env`)
Crie ou verifique o arquivo `apps/api/.env`:

```env
# Banco de Dados PostgreSQL
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/enem_app?schema=public"

# Redis (Filas e Cache)
REDIS_HOST="127.0.0.1"
REDIS_PORT=6379

# Autenticação JWT
JWT_SECRET="enem-super-secret-jwt-key-2026"
JWT_REFRESH_SECRET="enem-super-secret-jwt-key-2026-refresh"

# Porta do Servidor
PORT=3333

# (Opcional) Chave do Google Gemini para Tutoria com IA e Geração de Questões
GEMINI_API_KEY="sua_chave_do_google_ai_studio_aqui"
```

#### Front-end (`apps/web/.env`)
O aplicativo possui **detecção automática inteligente de IP** na rede local para comunicação com a API. Porém, se desejar fixar a URL ou usar um túnel:

```env
# Opcional em desenvolvimento local (se omitido, o Expo detecta o IP da sua máquina automaticamente)
# EXPO_PUBLIC_API_URL=http://localhost:3333
```

---

### 5. Migração e Seed do Banco de Dados

Com os containers Docker ativos, execute o push do schema Prisma e popule a base com matérias, tópicos e questões reais do ENEM:

```powershell
# 1. Sincroniza o schema do Prisma com o PostgreSQL
npx prisma db push --schema=apps/api/prisma/schema.prisma

# 2. Executa o Seed completo com 175+ questões do ENEM calibradas com TRI e trilhas
npm run seed
```

Ao final, você verá a mensagem:
`🎉 SEED DO MINUTO ENEM FINALIZADO COM SUCESSO!`

---

### 6. Executando a Aplicação

Você pode executar o ecossistema completo de duas formas:

#### Forma 1: Comando Unificado (Turborepo)
```powershell
npm run dev
```
*Inicia o Back-end e o Metro Bundler do Front-end concorrentemente em um único comando.*

#### Forma 2: Terminais Separados (Recomendado para Desenvolvimento)
Abra dois terminais na raiz:

- **Terminal 1 (Back-end API):**
  ```powershell
  npm run dev:api
  ```
  *A API iniciará em `http://localhost:3333` e exibirá o IP para acesso na rede local.*

- **Terminal 2 (Front-end Web/Mobile):**
  ```powershell
  npm run dev:web
  ```
  *Iniciará o Metro Bundler do Expo.*

---

### 7. Como Testar no Celular ou Navegador

Assim que o terminal do Expo (`apps/web`) estiver rodando:

#### Opção A: No Navegador (Computador)
Pressione a tecla **`w`** no terminal do Expo, ou abra no navegador:
👉 `http://localhost:8081`

#### Opção B: No Celular (Expo Go via Wi-Fi)
1. Conecte seu celular **na mesma rede Wi-Fi** do seu computador.
2. Abra o app **Expo Go** no celular.
3. Escaneie o **QR Code** exibido no terminal.
4. O app será compilado e abrirá instantaneamente! O app no celular detectará o back-end rodando no seu computador automaticamente.

#### Opção C: Celular no 4G ou Redes Isoladas (Via Tunnel)
Caso você esteja testando em redes diferentes:
```powershell
cd apps/web
npx expo start --tunnel -c
```
*(O `@expo/ngrok` já está configurado no projeto para gerar o link público sem erros).*

---

## 🎯 Guia de Uso das Funcionalidades

### 1. Criando e Gerenciando Turmas (Professor)
1. Ao se cadastrar ou logar no app, selecione o perfil **Professor**.
2. Vá para a aba **Turmas** e clique em **Criar Turma**.
3. Um código exclusivo de 6 caracteres será gerado (ex: `MAT101`).
4. Compartilhe o código com os colegas que entrarem como **Aluno** para ingressarem na turma.

### 2. Postando Materiais Didáticos
Na aba de Materiais da Turma, clique em **Adicionar Material** e escolha entre:
- **Vídeo:** Cole a URL de uma aula do YouTube.
- **PDF:** Escolha entre enviar um arquivo do seu computador/celular (com upload direto) ou colar um link externo. Os alunos poderão ler diretamente no leitor embutido!
- **Artigo / Leitura:** Escreva em Markdown para resumos completos.
- **Macete (Flash-Tip):** Crie cartões de destaque com fórmulas e dicas mnemônicas rápidas.

### 3. Criando Atividades para a Turma
Na aba de Tarefas, clique em **Nova Tarefa** e selecione um dos 4 modos:
- **Banco ENEM:** Busque por palavras-chave e marque as caixas das questões desejadas.
- **Sorteio por Assunto:** Ex: Escolha *Biologia $\rightarrow$ Ecologia $\rightarrow$ 5 questões*. O back-end sorteia questões reais com gabarito na hora.
- **Questão Autoral:** Crie uma questão exclusiva com 5 alternativas e defina a correta.
- **Gerar com IA:** Especifique o tema e deixe o Google Gemini formular os exercícios.

Ao finalizar, defina um prazo e clique em **Publicar**.

### 4. Acompanhando o Desempenho dos Alunos
Abra o **Painel do Professor (*Teacher Tracking*)**:
- Veja quem já entregou a tarefa e quem está com entrega pendente.
- Visualize a nota média, pontuação individual e as questões com maior taxa de erro para planejar a próxima aula de revisão.

---

## ⚡ Comandos Úteis (Cheat Sheet)

| Comando | O que faz |
|---|---|
| `npm run dev` | Roda Front-end e Back-end juntos via Turborepo |
| `npm run dev:api` | Roda apenas a API Express com recarregamento a quente (`tsx watch`) |
| `npm run dev:web` | Roda apenas o Front-end Expo com Metro Bundler |
| `npm run typecheck` | Executa a checagem de tipos TypeScript em todo o monorepo |
| `npm run build` | Compila todos os pacotes e aplicações |
| `npm run seed` | Executa o seed de 175+ questões do ENEM calibradas e matérias |
| `npm run build:shared` | Compila o pacote `@minuto-enem/shared` |
| `docker-compose -f apps/api/docker-compose.yml up -d` | Sobe PostgreSQL e Redis em segundo plano |
| `docker-compose -f apps/api/docker-compose.yml down` | Para os containers do Docker |
| `npx prisma studio --schema=apps/api/prisma/schema.prisma` | Abre interface web para inspecionar e editar dados do banco |

---

## ❓ Solução de Problemas Frequentes (FAQ)

<details>
<summary><b>1. Conflito ao subir o Docker: "container name '/enem_db' is already in use"</b></summary>

Se você já tinha um container antigo do postgres criado com esse nome, basta removê-lo antes de subir:
```powershell
docker rm -f enem_db enem_redis
docker-compose -f apps/api/docker-compose.yml up -d
```
</details>

<details>
<summary><b>2. Erro de execução de scripts no PowerShell (ExecutionPolicy)</b></summary>

Se o Windows bloquear a execução de scripts do npm/npx:
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```
Ou utilize o executável `.cmd` (ex: `npm.cmd run dev`).
</details>

<details>
<summary><b>3. O Expo no celular não consegue conectar com a API</b></summary>

1. Verifique se o celular e o computador estão na **mesma rede Wi-Fi**.
2. Certifique-se de que a rede Wi-Fi não possui "Isolamento de AP" (*AP Isolation*).
3. Se estiver bloqueado pelo Firewall do Windows, permita conexões na porta `3333` ou use o modo túnel:
   ```powershell
   npx expo start --tunnel -c
   ```
</details>

<details>
<summary><b>4. Limpar o cache do Metro Bundler</b></summary>

Se notar comportamentos estranhos em telas recém-criadas:
```powershell
cd apps/web
npx expo start -c
```
</details>

---

## 📐 Convenções e Boas Práticas

- **TypeScript First:** Todas as funções, rotas e componentes devem ser estritamente tipados.
- **Validação com Zod:** Novos contratos entre Front e Back devem ser declarados primeiro em `packages/shared/src/schemas/`.
- **Arquitetura em Camadas (Back-end):**
  - `routes`: Definição de endpoints e middlewares.
  - `controllers`: Extração de parâmetros HTTP e respostas `res.json()`.
  - `services`: Regras de negócio puras desacopladas de frameworks HTTP.
  - `prisma`: Acesso a dados e persistência.
- **Commits Convencionais:** Adote o padrão `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`.

---

<p align="center">
  Desenvolvido com 💙 e foco no futuro da educação brasileira 🇧🇷<br>
  <b>Minuto ENEM &bull; 2026</b>
</p>

