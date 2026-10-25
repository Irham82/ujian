'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  apiRequest,
  formatCountdownHms,
  getSavedAuth,
} from '@/lib/api-client';
import {
  AnswerSyncState,
  computeBackoffWithJitterMs,
  enqueueOfflineAnswerMutation,
  listQueuedMutationsForParticipant,
  loadPaperFromIndexedDb,
  removeQueuedMutations,
  savePaperToIndexedDb,
} from '@/lib/offline-db';

interface QuestionAnswerState {
  answerPayload: Record<string, any>;
  isMarkedForReview: boolean;
  answerVersion: number;
  syncState: AnswerSyncState;
  lastIdempotencyKey: string;
}

export default function TakeExamPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const sessionId = params?.sessionId || '';
  const user = getSavedAuth().user;

  const [participantId, setParticipantId] = useState<string>('');
  const [paper, setPaper] = useState<any>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [answersMap, setAnswersMap] = useState<Record<string, QuestionAnswerState>>({});
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [offlineSecondsElapsed, setOfflineSecondsElapsed] = useState<number>(0);
  const [unsyncedCount, setUnsyncedCount] = useState<number>(0);
  const [syncBanner, setSyncBanner] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState<boolean>(false);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submittedResult, setSubmittedResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const tabHiddenAtRef = useRef<number | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttemptRef = useRef<number>(0);

  const recordSecurityEvent = useCallback(
    async (
      partId: string,
      eventType: string,
      durationMs?: number,
      metadata?: Record<string, any>,
    ) => {
      if (!partId) return;
      try {
        await apiRequest('/security/events', {
          method: 'POST',
          body: {
            participantId: partId,
            eventType,
            durationMs,
            occurredAt: new Date().toISOString(),
            metadata,
          },
        });
      } catch {
        // non-blocking when offline
      }
    },
    [],
  );

  const flushOfflineQueue = useCallback(
    async (partId: string, offlineSec = 0) => {
      if (!partId) return;
      const queued = await listQueuedMutationsForParticipant(partId);
      setUnsyncedCount(queued.length);
      if (queued.length === 0) return;

      try {
        const batchKey = `batch-${partId}-${queued[0].idempotencyKey}-${queued.length}`;
        const res = await apiRequest(`/student/participants/${partId}/offline-sync`, {
          method: 'POST',
          body: {
            batchIdempotencyKey: batchKey,
            offlineDurationSeconds: offlineSec,
            items: queued.map((q) => ({
              questionId: q.questionId,
              answerPayload: q.answerPayload,
              isMarkedForReview: q.isMarkedForReview,
              idempotencyKey: q.idempotencyKey,
              expectedVersion: q.expectedVersion,
              clientUpdatedAt: q.clientUpdatedAt,
            })),
          },
        });

        await removeQueuedMutations(queued.map((q) => q.idempotencyKey));
        setUnsyncedCount(0);
        retryAttemptRef.current = 0;

        setAnswersMap((prev) => {
          const next = { ...prev };
          for (const item of res.results || []) {
            if (item.status === 'SAVED_ON_SERVER' && next[item.questionId]) {
              next[item.questionId] = {
                ...next[item.questionId],
                answerVersion: item.answerVersion,
                syncState: 'SAVED_ON_SERVER',
              };
            }
          }
          return next;
        });

        setSyncBanner(
          res.gracePeriodWarning ||
            `Sinkronisasi antrean offline berhasil (${res.acceptedCount} jawaban dikonfirmasi server).`,
        );
      } catch (err: any) {
        retryAttemptRef.current += 1;
        const delayMs = computeBackoffWithJitterMs(retryAttemptRef.current);
        setSyncBanner(
          `Sinkronisasi belum berhasil (${err.message}). Retry otomatis dalam ${Math.round(delayMs / 1000)} detik...`,
        );
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(() => {
          flushOfflineQueue(partId, offlineSec);
        }, delayMs);
      }
    },
    [],
  );

  // Initial session start/resume & paper load
  useEffect(() => {
    if (!sessionId) return;
    let mounted = true;

    const initExam = async () => {
      try {
        const startRes = await apiRequest(`/student/exams/${sessionId}/start`, {
          method: 'POST',
        });
        if (!mounted) return;
        const partId = startRes.participantId;
        setParticipantId(partId);

        const paperData = await apiRequest(`/student/participants/${partId}/paper`);
        if (!mounted) return;
        setPaper(paperData);
        setRemainingSeconds(Number(paperData.remainingSeconds || 0));
        await savePaperToIndexedDb(partId, paperData);

        const initialMap: Record<string, QuestionAnswerState> = {};
        for (const q of paperData.questions || []) {
          if (q.savedAnswer) {
            initialMap[q.questionId] = {
              answerPayload: q.savedAnswer.answerPayload || {},
              isMarkedForReview: Boolean(q.savedAnswer.isMarkedForReview),
              answerVersion: Number(q.savedAnswer.answerVersion || 1),
              syncState: 'SAVED_ON_SERVER',
              lastIdempotencyKey: q.savedAnswer.lastIdempotencyKey || '',
            };
          }
        }

        // Overlay any pending local mutations from IndexedDB if browser was reloaded while offline
        const pendingLocal = await listQueuedMutationsForParticipant(partId);
        for (const item of pendingLocal) {
          initialMap[item.questionId] = {
            answerPayload: item.answerPayload,
            isMarkedForReview: item.isMarkedForReview,
            answerVersion: item.expectedVersion || 0,
            syncState: 'SAVED_LOCAL_PENDING_SYNC',
            lastIdempotencyKey: item.idempotencyKey,
          };
        }

        setAnswersMap(initialMap);
        setUnsyncedCount(pendingLocal.length);
        if (pendingLocal.length > 0 && navigator.onLine) {
          await flushOfflineQueue(partId, 0);
        }
      } catch (err: any) {
        // Attempt fallback from IndexedDB if reloaded while offline
        const cachedAuth = getSavedAuth();
        if (cachedAuth.user) {
          setError(
            err.message ||
              'Tidak dapat memuat sesi dari server. Pastikan Anda telah memulai ujian secara online.',
          );
        }
      }
    };

    initExam();
    return () => {
      mounted = false;
    };
  }, [sessionId, flushOfflineQueue]);

  // Server-synced countdown timer & offline grace counter
  useEffect(() => {
    const interval = setInterval(() => {
      setRemainingSeconds((prev) => Math.max(0, prev - 1));
      if (!isOnline) {
        setOfflineSecondsElapsed((prev) => prev + 1);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isOnline]);

  // Anti-cheating visibilitychange, window blur, and online/offline listeners
  useEffect(() => {
    if (!participantId) return;

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        tabHiddenAtRef.current = Date.now();
        recordSecurityEvent(participantId, 'TAB_HIDDEN');
      } else if (document.visibilityState === 'visible' && tabHiddenAtRef.current) {
        const duration = Date.now() - tabHiddenAtRef.current;
        tabHiddenAtRef.current = null;
        recordSecurityEvent(participantId, 'TAB_HIDDEN', duration, {
          returnedToTab: true,
        });
      }
    };

    const onWindowBlur = () => {
      recordSecurityEvent(participantId, 'WINDOW_BLUR');
    };

    const onOffline = () => {
      setIsOnline(false);
      setOfflineSecondsElapsed(1);
    };

    const onOnline = () => {
      setIsOnline(true);
      const totalOfflineSec = offlineSecondsElapsed;
      setOfflineSecondsElapsed(0);
      recordSecurityEvent(participantId, 'CONNECTION_RESTORED', totalOfflineSec * 1000);
      flushOfflineQueue(participantId, totalOfflineSec);
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [participantId, offlineSecondsElapsed, recordSecurityEvent, flushOfflineQueue]);

  const persistAnswerChange = async (
    questionId: string,
    newPayload: Record<string, any>,
    isMarkedForReview: boolean,
  ) => {
    if (!participantId) return;
    const prevState = answersMap[questionId];
    const expectedVersion = prevState?.answerVersion || 0;
    const idempotencyKey = `ans-${participantId}-${questionId}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)}`;

    // Optimistically mark as SAVED_LOCAL_PENDING_SYNC until server confirms HTTP 200
    setAnswersMap((prev) => ({
      ...prev,
      [questionId]: {
        answerPayload: newPayload,
        isMarkedForReview,
        answerVersion: expectedVersion,
        syncState: 'SAVED_LOCAL_PENDING_SYNC',
        lastIdempotencyKey: idempotencyKey,
      },
    }));

    // Always write to IndexedDB local buffer first for crash/reload resilience
    await enqueueOfflineAnswerMutation({
      idempotencyKey,
      participantId,
      questionId,
      answerPayload: newPayload,
      isMarkedForReview,
      expectedVersion,
      clientUpdatedAt: new Date().toISOString(),
      retryCount: 0,
    });

    if (!isOnline || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      const queued = await listQueuedMutationsForParticipant(participantId);
      setUnsyncedCount(queued.length);
      return;
    }

    try {
      const res = await apiRequest(`/student/participants/${participantId}/answers`, {
        method: 'PUT',
        body: {
          questionId,
          answerPayload: newPayload,
          isMarkedForReview,
          idempotencyKey,
          expectedVersion,
          clientUpdatedAt: new Date().toISOString(),
        },
      });

      await removeQueuedMutations([idempotencyKey]);
      const remainingQueue = await listQueuedMutationsForParticipant(participantId);
      setUnsyncedCount(remainingQueue.length);

      if (typeof res.remainingSeconds === 'number') {
        setRemainingSeconds(res.remainingSeconds);
      }

      setAnswersMap((prev) => ({
        ...prev,
        [questionId]: {
          answerPayload: newPayload,
          isMarkedForReview,
          answerVersion: Number(res.answerVersion || expectedVersion + 1),
          syncState: 'SAVED_ON_SERVER',
          lastIdempotencyKey: idempotencyKey,
        },
      }));
    } catch {
      const queued = await listQueuedMutationsForParticipant(participantId);
      setUnsyncedCount(queued.length);
      setAnswersMap((prev) => ({
        ...prev,
        [questionId]: {
          answerPayload: newPayload,
          isMarkedForReview,
          answerVersion: expectedVersion,
          syncState: 'SAVED_LOCAL_PENDING_SYNC',
          lastIdempotencyKey: idempotencyKey,
        },
      }));
    }
  };

  const handleDebouncedTextChange = (
    questionId: string,
    textVal: string,
    isMarkedForReview: boolean,
  ) => {
    const prevState = answersMap[questionId];
    setAnswersMap((prev) => ({
      ...prev,
      [questionId]: {
        answerPayload: { text: textVal },
        isMarkedForReview,
        answerVersion: prevState?.answerVersion || 0,
        syncState: 'SAVED_LOCAL_PENDING_SYNC',
        lastIdempotencyKey: prevState?.lastIdempotencyKey || 'typing',
      },
    }));

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      persistAnswerChange(questionId, { text: textVal }, isMarkedForReview);
    }, 650);
  };

  const handleFinalSubmit = async () => {
    if (!participantId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      // Flush any pending offline queue before final submit
      await flushOfflineQueue(participantId, offlineSecondsElapsed);
      const res = await apiRequest(`/student/participants/${participantId}/submit`, {
        method: 'POST',
        body: { idempotencyKey: `submit-${participantId}` },
      });
      setSubmittedResult(res);
      setConfirmSubmitOpen(false);
    } catch (err: any) {
      setError(err.message || 'Gagal mengumpulkan jawaban ke server');
    } finally {
      setSubmitting(false);
    }
  };

  if (submittedResult) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white rounded-2xl border border-slate-200 shadow-md p-6 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 font-extrabold text-2xl flex items-center justify-center mx-auto">
            ✓
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900">
            Jawaban Ujian Berhasil Dikumpulkan
          </h1>
          <p className="text-sm text-slate-600">
            Bukti Pengumpulan Server ID: <code className="font-mono">{submittedResult.submissionId}</code>
          </p>
          {submittedResult.score && (
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-sm space-y-1">
              <div className="font-bold text-blue-900">
                Nilai Objektif Otomatis: {submittedResult.score.autoScore} /{' '}
                {submittedResult.score.maxPossibleScore}
              </div>
              <div className="text-xs text-slate-600">
                Status Penilaian: {submittedResult.gradingStatus}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => router.push('/exam-schedules')}
            className="w-full py-3 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-bold text-sm"
          >
            Kembali ke Daftar Jadwal Ujian
          </button>
        </div>
      </div>
    );
  }

  const questions: any[] = paper?.questions || [];
  const currentQuestion = questions[currentIndex] || null;
  const currentAns = currentQuestion ? answersMap[currentQuestion.questionId] : undefined;
  const graceLimit = Number(paper?.offlinePolicy?.offlineGracePeriodSeconds || 120);
  const offlineExceededGrace = !isOnline && offlineSecondsElapsed > graceLimit;

  const isQuestionAnswered = (qId: string): boolean => {
    const st = answersMap[qId];
    if (!st || !st.answerPayload) return false;
    const p = st.answerPayload;
    if (p.selectedOption) return true;
    if (Array.isArray(p.selectedOptions) && p.selectedOptions.length > 0) return true;
    if (typeof p.text === 'string' && p.text.trim().length > 0) return true;
    return false;
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Sticky Exam Header (Visible on both Laptop and HP without blocking question content) */}
      <header className="bg-blue-900 text-white sticky top-0 z-30 border-b border-blue-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="font-bold text-sm sm:text-base truncate">
              {paper?.examTitle || 'Memuat Naskah Ujian TKA...'}
            </div>
            <div className="text-xs text-blue-200 truncate">
              Peserta: {user?.fullName || 'Siswa'} ({user?.identifierCode || user?.username})
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {/* Connection & Sync Indicator */}
            <div
              className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 ${
                isOnline && unsyncedCount === 0
                  ? 'bg-emerald-500/20 text-emerald-100 border border-emerald-400/40'
                  : offlineExceededGrace
                    ? 'bg-red-600 text-white'
                    : 'bg-amber-500/30 text-amber-100 border border-amber-300/50'
              }`}
            >
              <span>
                {isOnline
                  ? unsyncedCount > 0
                    ? `Tersimpan Lokal (${unsyncedCount} Menunggu Sinkronisasi)`
                    : 'Tersimpan di Server'
                  : `OFFLINE (${offlineSecondsElapsed}s) • ${unsyncedCount} Buffer Lokal`}
              </span>
            </div>

            {/* Server Countdown Timer */}
            <div
              className={`px-3 py-1.5 rounded-xl font-mono font-extrabold text-sm sm:text-base ${
                remainingSeconds <= 300
                  ? 'bg-red-600 text-white'
                  : 'bg-white text-blue-950'
              }`}
              aria-label="Sisa Waktu Ujian Server"
            >
              ⏱ {formatCountdownHms(remainingSeconds)}
            </div>

            {/* Mobile Question Drawer Toggle Button */}
            <button
              type="button"
              onClick={() => setMobileNavOpen(!mobileNavOpen)}
              className="lg:hidden px-3 py-1.5 rounded-lg bg-blue-800 hover:bg-blue-700 text-xs font-bold border border-blue-600"
            >
              No. Soal ({currentIndex + 1}/{questions.length})
            </button>
          </div>
        </div>
      </header>

      {/* Offline Grace Period Warning Banner */}
      {!isOnline && (
        <div
          role="alert"
          className={`px-4 py-2.5 text-xs sm:text-sm font-semibold text-center ${
            offlineExceededGrace
              ? 'bg-red-700 text-white'
              : 'bg-amber-100 text-amber-950 border-b border-amber-300'
          }`}
        >
          {offlineExceededGrace
            ? `PERINGATAN: Anda telah offline selama ${offlineSecondsElapsed} detik (melebihi batas toleransi ${graceLimit} detik). Jawaban lokal tetap dipertahankan di perangkat tetapi BELUM diterima server. Segera lapor ke Pengawas/Proktor!`
            : `Koneksi terputus (${offlineSecondsElapsed}s / toleransi ${graceLimit}s). Jawaban Anda disimpan sementara di buffer lokal perangkat (IndexedDB) dan akan disinkronisasi saat online kembali. Timer server tetap berjalan.`}
        </div>
      )}

      {syncBanner && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 text-xs text-blue-900 font-medium flex justify-between items-center">
          <span>{syncBanner}</span>
          <button
            type="button"
            onClick={() => setSyncBanner(null)}
            className="text-blue-700 font-bold ml-4"
          >
            Tutup
          </button>
        </div>
      )}

      {error && (
        <div className="max-w-7xl mx-auto w-full px-4 pt-4">
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm font-semibold">
            {error}
          </div>
        </div>
      )}

      {/* Main Exam Area: 2 Columns on Laptop, 1 Column on Mobile */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 grid lg:grid-cols-12 gap-6 items-start">
        {/* Question & Answer Area */}
        <section className="lg:col-span-8 xl:col-span-9 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-6">
          {!currentQuestion ? (
            <div className="text-sm text-slate-500 py-8 text-center">
              Memuat butir soal ujian...
            </div>
          ) : (
            <>
              {/* Question Number & Explicit Answer Sync Status Badge */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200">
                <div className="flex items-center gap-2.5">
                  <span className="px-3 py-1 rounded-lg bg-blue-900 text-white font-extrabold text-sm">
                    SOAL NO. {currentQuestion.number}
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-semibold">
                    {currentQuestion.questionType} • Bobot: {currentQuestion.weight}
                  </span>
                </div>

                {/* Honest Per-Question Sync Status */}
                <div>
                  {!currentAns ? (
                    <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-semibold">
                      Belum Dijawab
                    </span>
                  ) : currentAns.syncState === 'SAVED_ON_SERVER' ? (
                    <span className="px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 text-xs font-bold">
                      ✓ Tersimpan di Server (v{currentAns.answerVersion})
                    </span>
                  ) : currentAns.syncState === 'SAVED_LOCAL_PENDING_SYNC' ? (
                    <span className="px-2.5 py-1 rounded-md bg-amber-100 text-amber-900 text-xs font-bold">
                      ⏳ Tersimpan Lokal (Menunggu Sinkronisasi Server)
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-md bg-red-100 text-red-800 text-xs font-bold">
                      ⚠ Sinkronisasi Gagal — Akan Dicoba Ulang
                    </span>
                  )}
                </div>
              </div>

              {/* Question Stem */}
              <div
                className="text-base sm:text-lg text-slate-900 leading-relaxed space-y-3"
                dangerouslySetInnerHTML={{ __html: currentQuestion.stemHtml }}
              />

              {currentQuestion.formulaLatex && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 font-mono text-sm text-slate-800">
                  Rumus: {currentQuestion.formulaLatex}
                </div>
              )}

              {/* Answer Input Area (Large Touch Targets for HP & Laptop) */}
              <div className="space-y-3 pt-2">
                {(currentQuestion.questionType === 'SINGLE_CHOICE' ||
                  currentQuestion.questionType === 'TRUE_FALSE') &&
                  currentQuestion.options?.map((opt: any) => {
                    const selected =
                      currentAns?.answerPayload?.selectedOption === opt.optionKey;
                    return (
                      <button
                        key={opt.optionKey}
                        type="button"
                        onClick={() =>
                          persistAnswerChange(
                            currentQuestion.questionId,
                            { selectedOption: opt.optionKey },
                            Boolean(currentAns?.isMarkedForReview),
                          )
                        }
                        className={`w-full text-left p-4 rounded-xl border-2 transition flex items-start gap-3.5 ${
                          selected
                            ? 'border-blue-700 bg-blue-50/80 text-slate-950 font-semibold'
                            : 'border-slate-200 hover:border-slate-300 bg-white text-slate-800'
                        }`}
                      >
                        <span
                          className={`w-8 h-8 rounded-lg font-bold text-sm flex items-center justify-center shrink-0 ${
                            selected
                              ? 'bg-blue-700 text-white'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {opt.optionKey}
                        </span>
                        <span
                          className="text-sm sm:text-base pt-1"
                          dangerouslySetInnerHTML={{ __html: opt.contentHtml }}
                        />
                      </button>
                    );
                  })}

                {currentQuestion.questionType === 'MULTIPLE_CHOICE_COMPLEX' &&
                  currentQuestion.options?.map((opt: any) => {
                    const selectedList: string[] = Array.isArray(
                      currentAns?.answerPayload?.selectedOptions,
                    )
                      ? currentAns.answerPayload.selectedOptions
                      : [];
                    const checked = selectedList.includes(opt.optionKey);
                    return (
                      <button
                        key={opt.optionKey}
                        type="button"
                        onClick={() => {
                          const nextList = checked
                            ? selectedList.filter((k) => k !== opt.optionKey)
                            : [...selectedList, opt.optionKey];
                          persistAnswerChange(
                            currentQuestion.questionId,
                            { selectedOptions: nextList },
                            Boolean(currentAns?.isMarkedForReview),
                          );
                        }}
                        className={`w-full text-left p-4 rounded-xl border-2 transition flex items-start gap-3.5 ${
                          checked
                            ? 'border-blue-700 bg-blue-50/80 text-slate-950 font-semibold'
                            : 'border-slate-200 hover:border-slate-300 bg-white text-slate-800'
                        }`}
                      >
                        <span
                          className={`w-8 h-8 rounded-lg font-bold text-sm flex items-center justify-center shrink-0 ${
                            checked
                              ? 'bg-blue-700 text-white'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {checked ? '✓' : opt.optionKey}
                        </span>
                        <span
                          className="text-sm sm:text-base pt-1"
                          dangerouslySetInnerHTML={{ __html: opt.contentHtml }}
                        />
                      </button>
                    );
                  })}

                {currentQuestion.questionType === 'SHORT_ANSWER' && (
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                      Jawaban Singkat Anda:
                    </label>
                    <input
                      type="text"
                      value={currentAns?.answerPayload?.text || ''}
                      onChange={(e) =>
                        handleDebouncedTextChange(
                          currentQuestion.questionId,
                          e.target.value,
                          Boolean(currentAns?.isMarkedForReview),
                        )
                      }
                      placeholder="Ketik jawaban singkat di sini..."
                      className="w-full px-4 py-3.5 rounded-xl border-2 border-slate-300 focus:border-blue-700 focus:outline-none text-base"
                    />
                  </div>
                )}

                {currentQuestion.questionType === 'ESSAY' && (
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                      Jawaban Uraian / Esai Anda:
                    </label>
                    <textarea
                      rows={6}
                      value={currentAns?.answerPayload?.text || ''}
                      onChange={(e) =>
                        handleDebouncedTextChange(
                          currentQuestion.questionId,
                          e.target.value,
                          Boolean(currentAns?.isMarkedForReview),
                        )
                      }
                      placeholder="Tuliskan langkah penyelesaian dan jawaban uraian Anda secara lengkap..."
                      className="w-full px-4 py-3.5 rounded-xl border-2 border-slate-300 focus:border-blue-700 focus:outline-none text-base"
                    />
                  </div>
                )}
              </div>

              {/* Bottom Navigation Controls: Sebelumnya, Ragu-ragu, Berikutnya */}
              <div className="pt-6 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                  className="px-5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 font-bold text-sm"
                >
                  ← Soal Sebelumnya
                </button>

                <label className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-amber-50 border-2 border-amber-300 text-amber-900 font-bold text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(currentAns?.isMarkedForReview)}
                    onChange={(e) =>
                      persistAnswerChange(
                        currentQuestion.questionId,
                        currentAns?.answerPayload || {},
                        e.target.checked,
                      )
                    }
                    className="w-4 h-4 rounded"
                  />
                  Ragu-ragu (Tandai untuk Ditinjau)
                </label>

                {currentIndex < questions.length - 1 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))
                    }
                    className="px-5 py-3 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-bold text-sm"
                  >
                    Soal Berikutnya →
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmSubmitOpen(true)}
                    className="px-6 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm"
                  >
                    Selesai & Kumpulkan Jawaban
                  </button>
                )}
              </div>
            </>
          )}
        </section>

        {/* Question Navigation Grid (Sidebar on Laptop, Collapsible Drawer on Mobile) */}
        <aside
          className={`lg:col-span-4 xl:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4 ${
            mobileNavOpen ? 'block' : 'hidden lg:block'
          }`}
        >
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-sm uppercase tracking-wider">
              Navigasi Nomor Soal
            </h2>
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              className="lg:hidden text-xs font-bold text-slate-500"
            >
              Tutup
            </button>
          </div>

          <div className="grid grid-cols-5 gap-2">
            {questions.map((q, idx) => {
              const active = idx === currentIndex;
              const answered = isQuestionAnswered(q.questionId);
              const marked = Boolean(answersMap[q.questionId]?.isMarkedForReview);
              const localOnly =
                answersMap[q.questionId]?.syncState === 'SAVED_LOCAL_PENDING_SYNC';

              let colorClass = 'bg-white text-slate-700 border-slate-300';
              if (marked) {
                colorClass = 'bg-amber-500 text-white border-amber-600';
              } else if (answered) {
                colorClass = localOnly
                  ? 'bg-sky-600 text-white border-sky-700'
                  : 'bg-emerald-600 text-white border-emerald-700';
              }

              return (
                <button
                  key={q.questionId}
                  type="button"
                  onClick={() => {
                    setCurrentIndex(idx);
                    setMobileNavOpen(false);
                  }}
                  className={`h-11 rounded-xl border-2 font-bold text-sm flex items-center justify-center transition ${colorClass} ${
                    active ? 'ring-2 ring-blue-700 ring-offset-2' : ''
                  }`}
                >
                  {q.number}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="pt-3 border-t border-slate-200 space-y-1.5 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded bg-emerald-600 inline-block" />
              <span>Sudah Dijawab (Tersimpan di Server)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded bg-sky-600 inline-block" />
              <span>Tersimpan Lokal (Menunggu Sinkronisasi)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded bg-amber-500 inline-block" />
              <span>Ditandai Ragu-ragu (Untuk Ditinjau)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded border border-slate-300 bg-white inline-block" />
              <span>Belum Dijawab</span>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setConfirmSubmitOpen(true)}
              className="w-full py-3 rounded-xl bg-blue-900 hover:bg-blue-950 text-white font-bold text-sm"
            >
              Akhiri & Kumpulkan Ujian
            </button>
          </div>
        </aside>
      </div>

      {/* Confirmation Dialog Modal Before Final Submission */}
      {confirmSubmitOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
        >
          <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-xl p-6 space-y-4">
            <h3 className="text-lg font-extrabold text-slate-900">
              Konfirmasi Pengumpulan Jawaban Akhir
            </h3>
            <p className="text-sm text-slate-600">
              Apakah Anda yakin ingin mengakhiri ujian dan mengumpulkan seluruh jawaban ke server? Setelah dikumpulkan, jawaban tidak dapat diubah kembali.
            </p>
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
              <div>
                Soal Terjawab:{' '}
                <strong>
                  {questions.filter((q) => isQuestionAnswered(q.questionId)).length} dari{' '}
                  {questions.length} Soal
                </strong>
              </div>
              <div>
                Ditandai Ragu-ragu:{' '}
                <strong>
                  {
                    questions.filter((q) => answersMap[q.questionId]?.isMarkedForReview)
                      .length
                  }{' '}
                  Soal
                </strong>
              </div>
              <div>
                Antrean Buffer Lokal Belum Tersinkronisasi:{' '}
                <strong>{unsyncedCount} Jawaban</strong>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmSubmitOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-sm"
              >
                Periksa Kembali
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleFinalSubmit}
                className="flex-1 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm"
              >
                {submitting ? 'Mengumpulkan...' : 'Ya, Kumpulkan Sekarang'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
