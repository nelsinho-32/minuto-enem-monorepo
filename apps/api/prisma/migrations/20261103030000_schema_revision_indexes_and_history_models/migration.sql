-- 1. USER: Atualizações de colunas e índices otimizados para Leaderboard, Ofensiva e Jobs
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");
CREATE INDEX IF NOT EXISTS "User_xp_idx" ON "User"("xp");
CREATE INDEX IF NOT EXISTS "User_currentStreak_idx" ON "User"("currentStreak");
CREATE INDEX IF NOT EXISTS "User_lastStudyDate_idx" ON "User"("lastStudyDate");
CREATE INDEX IF NOT EXISTS "User_createdAt_idx" ON "User"("createdAt");

-- 2. CLASSROOM: Integridade referencial e índices de busca
ALTER TABLE "Classroom" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "Classroom_teacherId_idx" ON "Classroom"("teacherId");
CREATE INDEX IF NOT EXISTS "Classroom_code_idx" ON "Classroom"("code");
CREATE INDEX IF NOT EXISTS "Classroom_createdAt_idx" ON "Classroom"("createdAt");

-- 3. CLASS (Legacy): Índice no professor responsável
CREATE INDEX IF NOT EXISTS "Class_teacherId_idx" ON "Class"("teacherId");

-- 4. TASK: Expansão do modelo com vínculo a Classroom, integridade CASCADE e índices
ALTER TABLE "Task" 
    ADD COLUMN IF NOT EXISTS "title" TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS "description" TEXT,
    ADD COLUMN IF NOT EXISTS "questionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    ADD COLUMN IF NOT EXISTS "classroomId" TEXT,
    ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Task_classroomId_fkey'
    ) THEN
        ALTER TABLE "Task" ADD CONSTRAINT "Task_classroomId_fkey" 
        FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Task_classroomId_idx" ON "Task"("classroomId");
CREATE INDEX IF NOT EXISTS "Task_classId_idx" ON "Task"("classId");
CREATE INDEX IF NOT EXISTS "Task_status_idx" ON "Task"("status");
CREATE INDEX IF NOT EXISTS "Task_dueDate_idx" ON "Task"("dueDate");
CREATE INDEX IF NOT EXISTS "Task_createdAt_idx" ON "Task"("createdAt");

-- 5. SUBJECT & LESSON: Timestamps e índices
ALTER TABLE "Subject" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Lesson" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "Lesson_subjectId_idx" ON "Lesson"("subjectId");
CREATE INDEX IF NOT EXISTS "Lesson_title_idx" ON "Lesson"("title");

-- 6. NOTE: Anotações com vínculo a Lesson (SET NULL) e User (CASCADE)
CREATE TABLE IF NOT EXISTS "Note" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lessonId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Note_lessonId_fkey') THEN
        ALTER TABLE "Note" ADD CONSTRAINT "Note_lessonId_fkey" 
        FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Note_userId_fkey') THEN
        ALTER TABLE "Note" ADD CONSTRAINT "Note_userId_fkey" 
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Note_userId_idx" ON "Note"("userId");
CREATE INDEX IF NOT EXISTS "Note_lessonId_idx" ON "Note"("lessonId");
CREATE INDEX IF NOT EXISTS "Note_userId_createdAt_idx" ON "Note"("userId", "createdAt");

-- 7. TRAIL: Trilhas de Aprendizagem com vínculo a Subject (SET NULL)
CREATE TABLE IF NOT EXISTS "Trail" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "area" TEXT NOT NULL,
    "subjectId" TEXT,
    "lessonIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "questionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "totalSteps" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trail_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Trail_subjectId_fkey') THEN
        ALTER TABLE "Trail" ADD CONSTRAINT "Trail_subjectId_fkey" 
        FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Trail_subjectId_idx" ON "Trail"("subjectId");
CREATE INDEX IF NOT EXISTS "Trail_area_idx" ON "Trail"("area");
CREATE INDEX IF NOT EXISTS "Trail_createdAt_idx" ON "Trail"("createdAt");

-- 8. TRAIL PROGRESS: Progresso do aluno com CASCADE duplo e unicidade
CREATE TABLE IF NOT EXISTS "TrailProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trailId" TEXT NOT NULL,
    "completedSteps" INTEGER NOT NULL DEFAULT 0,
    "completedLessonIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "progressPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrailProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TrailProgress_userId_trailId_key" ON "TrailProgress"("userId", "trailId");

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TrailProgress_userId_fkey') THEN
        ALTER TABLE "TrailProgress" ADD CONSTRAINT "TrailProgress_userId_fkey" 
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TrailProgress_trailId_fkey') THEN
        ALTER TABLE "TrailProgress" ADD CONSTRAINT "TrailProgress_trailId_fkey" 
        FOREIGN KEY ("trailId") REFERENCES "Trail"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "TrailProgress_userId_idx" ON "TrailProgress"("userId");
CREATE INDEX IF NOT EXISTS "TrailProgress_trailId_idx" ON "TrailProgress"("trailId");
CREATE INDEX IF NOT EXISTS "TrailProgress_status_idx" ON "TrailProgress"("status");
CREATE INDEX IF NOT EXISTS "TrailProgress_progressPercent_idx" ON "TrailProgress"("progressPercent");

-- 9. QUESTION: Vetor de embedding e índices de alta performance para filtros do ENEM
ALTER TABLE "Question" 
    ADD COLUMN IF NOT EXISTS "difficulty" TEXT,
    ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "Question_subject_idx" ON "Question"("subject");
CREATE INDEX IF NOT EXISTS "Question_area_idx" ON "Question"("area");
CREATE INDEX IF NOT EXISTS "Question_year_idx" ON "Question"("year");
CREATE INDEX IF NOT EXISTS "Question_difficulty_idx" ON "Question"("difficulty");
CREATE INDEX IF NOT EXISTS "Question_errorRate_idx" ON "Question"("errorRate");
CREATE INDEX IF NOT EXISTS "Question_subject_area_idx" ON "Question"("subject", "area");
CREATE INDEX IF NOT EXISTS "Question_year_area_idx" ON "Question"("year", "area");

-- 10. OFFLINE SYNC LOG: Registro de sincronização offline com chave idempotente
CREATE TABLE IF NOT EXISTS "OfflineSyncLog" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SYNCED',
    "itemsCount" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB,
    "errorMessage" TEXT,
    "clientAnsweredAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfflineSyncLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OfflineSyncLog_idempotencyKey_key" ON "OfflineSyncLog"("idempotencyKey");

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OfflineSyncLog_userId_fkey') THEN
        ALTER TABLE "OfflineSyncLog" ADD CONSTRAINT "OfflineSyncLog_userId_fkey" 
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "OfflineSyncLog_userId_idx" ON "OfflineSyncLog"("userId");
CREATE INDEX IF NOT EXISTS "OfflineSyncLog_idempotencyKey_idx" ON "OfflineSyncLog"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "OfflineSyncLog_status_idx" ON "OfflineSyncLog"("status");
CREATE INDEX IF NOT EXISTS "OfflineSyncLog_syncedAt_idx" ON "OfflineSyncLog"("syncedAt");

-- 11. QUESTION ATTEMPT: Histórico individual de resoluções com métricas TRI e rastreamento de origem
CREATE TABLE IF NOT EXISTS "QuestionAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedAnswer" INTEGER NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "timeSpentMs" INTEGER,
    "xpEarned" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'QUIZ',
    "offlineSyncLogId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionAttempt_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "QuestionAttempt"
    ADD COLUMN IF NOT EXISTS "timeSpentMs" INTEGER,
    ADD COLUMN IF NOT EXISTS "xpEarned" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'QUIZ',
    ADD COLUMN IF NOT EXISTS "offlineSyncLogId" TEXT;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuestionAttempt_userId_fkey') THEN
        ALTER TABLE "QuestionAttempt" ADD CONSTRAINT "QuestionAttempt_userId_fkey" 
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuestionAttempt_questionId_fkey') THEN
        ALTER TABLE "QuestionAttempt" ADD CONSTRAINT "QuestionAttempt_questionId_fkey" 
        FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuestionAttempt_offlineSyncLogId_fkey') THEN
        ALTER TABLE "QuestionAttempt" ADD CONSTRAINT "QuestionAttempt_offlineSyncLogId_fkey" 
        FOREIGN KEY ("offlineSyncLogId") REFERENCES "OfflineSyncLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "QuestionAttempt_userId_idx" ON "QuestionAttempt"("userId");
CREATE INDEX IF NOT EXISTS "QuestionAttempt_questionId_idx" ON "QuestionAttempt"("questionId");
CREATE INDEX IF NOT EXISTS "QuestionAttempt_userId_isCorrect_idx" ON "QuestionAttempt"("userId", "isCorrect");
CREATE INDEX IF NOT EXISTS "QuestionAttempt_userId_createdAt_idx" ON "QuestionAttempt"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "QuestionAttempt_questionId_isCorrect_idx" ON "QuestionAttempt"("questionId", "isCorrect");
CREATE INDEX IF NOT EXISTS "QuestionAttempt_offlineSyncLogId_idx" ON "QuestionAttempt"("offlineSyncLogId");
CREATE INDEX IF NOT EXISTS "QuestionAttempt_source_idx" ON "QuestionAttempt"("source");

-- 12. FLASHCARD REVIEW: Repetição espaçada (Algoritmo SM-2)
CREATE TABLE IF NOT EXISTS "FlashcardReview" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "repetition" INTEGER NOT NULL DEFAULT 0,
    "interval" INTEGER NOT NULL DEFAULT 0,
    "easeFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "nextReviewDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlashcardReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FlashcardReview_userId_questionId_key" ON "FlashcardReview"("userId", "questionId");

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FlashcardReview_userId_fkey') THEN
        ALTER TABLE "FlashcardReview" ADD CONSTRAINT "FlashcardReview_userId_fkey" 
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FlashcardReview_questionId_fkey') THEN
        ALTER TABLE "FlashcardReview" ADD CONSTRAINT "FlashcardReview_questionId_fkey" 
        FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "FlashcardReview_userId_nextReviewDate_idx" ON "FlashcardReview"("userId", "nextReviewDate");
CREATE INDEX IF NOT EXISTS "FlashcardReview_questionId_idx" ON "FlashcardReview"("questionId");

-- 13. STREAK LOG: Histórico diário auditável de ofensiva e congelamentos
CREATE TABLE IF NOT EXISTS "StreakLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "streakCount" INTEGER NOT NULL DEFAULT 0,
    "iceFreezesLeft" INTEGER NOT NULL DEFAULT 0,
    "activityType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreakLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StreakLog_userId_date_key" ON "StreakLog"("userId", "date");

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StreakLog_userId_fkey') THEN
        ALTER TABLE "StreakLog" ADD CONSTRAINT "StreakLog_userId_fkey" 
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "StreakLog_userId_idx" ON "StreakLog"("userId");
CREATE INDEX IF NOT EXISTS "StreakLog_date_idx" ON "StreakLog"("date");
CREATE INDEX IF NOT EXISTS "StreakLog_status_idx" ON "StreakLog"("status");

-- 14. DUEL MATCH: Histórico de partidas da Arena de Duelos Multiplayer 1v1
CREATE TABLE IF NOT EXISTS "DuelMatch" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "subject" TEXT,
    "status" TEXT NOT NULL DEFAULT 'FINISHED',
    "winnerId" TEXT,
    "isDraw" BOOLEAN NOT NULL DEFAULT false,
    "totalQuestions" INTEGER NOT NULL DEFAULT 5,
    "questionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuelMatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DuelMatch_matchId_key" ON "DuelMatch"("matchId");

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DuelMatch_winnerId_fkey') THEN
        ALTER TABLE "DuelMatch" ADD CONSTRAINT "DuelMatch_winnerId_fkey" 
        FOREIGN KEY ("winnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "DuelMatch_matchId_idx" ON "DuelMatch"("matchId");
CREATE INDEX IF NOT EXISTS "DuelMatch_winnerId_idx" ON "DuelMatch"("winnerId");
CREATE INDEX IF NOT EXISTS "DuelMatch_status_idx" ON "DuelMatch"("status");
CREATE INDEX IF NOT EXISTS "DuelMatch_createdAt_idx" ON "DuelMatch"("createdAt");

-- 15. DUEL PLAYER: Desempenho e pontuação de cada competidor no duelo
CREATE TABLE IF NOT EXISTS "DuelPlayer" (
    "id" TEXT NOT NULL,
    "duelMatchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "xpEarned" INTEGER NOT NULL DEFAULT 0,
    "triScore" DOUBLE PRECISION,
    "answers" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuelPlayer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DuelPlayer_duelMatchId_userId_key" ON "DuelPlayer"("duelMatchId", "userId");

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DuelPlayer_duelMatchId_fkey') THEN
        ALTER TABLE "DuelPlayer" ADD CONSTRAINT "DuelPlayer_duelMatchId_fkey" 
        FOREIGN KEY ("duelMatchId") REFERENCES "DuelMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DuelPlayer_userId_fkey') THEN
        ALTER TABLE "DuelPlayer" ADD CONSTRAINT "DuelPlayer_userId_fkey" 
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "DuelPlayer_duelMatchId_idx" ON "DuelPlayer"("duelMatchId");
CREATE INDEX IF NOT EXISTS "DuelPlayer_userId_idx" ON "DuelPlayer"("userId");
CREATE INDEX IF NOT EXISTS "DuelPlayer_score_idx" ON "DuelPlayer"("score");

