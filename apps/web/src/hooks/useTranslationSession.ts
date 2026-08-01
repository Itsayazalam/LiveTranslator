import { useCallback, useEffect, useRef } from 'react';
import { TranslationCoordinator, TranslationSession } from '@live-translator/core';
import { CONTEXT_TURN_COUNT, type AppLanguage } from '@live-translator/shared';
import { AudioCaptureService } from '../services/audio-capture';
import { conversationRepository } from '../services/conversation-repository';
import { fetchFinalTranslation } from '../services/final-translator';
import { WebRTCClient } from '../services/webrtc-client';
import { useUIStore } from '../stores/ui-store';

export function useTranslationSession() {
  const setSessionState = useUIStore((s) => s.setSessionState);
  const setSessionActive = useUIStore((s) => s.setSessionActive);
  const isSessionActive = useUIStore((s) => s.isSessionActive);
  const persistedConversation = useUIStore((s) => s.persistedConversation);
  const sessionStatus = useUIStore((s) => s.sessionState?.status);
  const isPaused = sessionStatus === 'paused' || sessionStatus === 'translating';

  const sessionRef = useRef<TranslationSession | null>(null);
  const audioRef = useRef<AudioCaptureService | null>(null);
  const webrtcRef = useRef<WebRTCClient | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSessionActiveRef = useRef(false);
  const spaceHeldRef = useRef(false);
  const directionChangeInProgressRef = useRef(false);
  const intentionalDisconnectRef = useRef(false);
  const translateAbortRef = useRef<AbortController | null>(null);
  const finalizePromiseRef = useRef<Promise<void> | null>(null);
  const translationCoordinatorRef = useRef(new TranslationCoordinator());

  useEffect(() => {
    isSessionActiveRef.current = isSessionActive;
  }, [isSessionActive]);

  const flipDirection = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;

    const { sourceLang, targetLang } = session.swapLanguages();
    useUIStore.getState().updateSettings({ sourceLang, targetLang });
  }, []);

  const initEngine = useCallback(
    (sourceLang: AppLanguage, targetLang: AppLanguage) => {
      sessionRef.current = new TranslationSession({
        config: { sourceLang, targetLang },
        onStateChange: (state) => {
          setSessionState({ ...state });
        },
        onTurnComplete: (turn) => {
          void conversationRepository.appendTurn(
            turn,
            turn.sourceText,
            turn.translatedText,
          );
        },
      });

      if (persistedConversation) {
        sessionRef.current.hydrate(
          persistedConversation.turns,
          '',
          '',
        );
      }

      setSessionState({ ...sessionRef.current.getState() });
    },
    [setSessionState, persistedConversation],
  );

  const cleanupConnections = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    translateAbortRef.current?.abort();
    translateAbortRef.current = null;
    finalizePromiseRef.current = null;
    webrtcRef.current?.disconnect();
    audioRef.current?.stop();
    webrtcRef.current = null;
    audioRef.current = null;
    spaceHeldRef.current = false;
    translationCoordinatorRef.current.reset();
    setSessionActive(false);
  }, [setSessionActive]);

  const stopSession = useCallback(() => {
    sessionRef.current?.stopListening();
    if (sessionRef.current) {
      setSessionState({ ...sessionRef.current.getState() });
    }
    cleanupConnections();
  }, [cleanupConnections, setSessionState]);

  const runBatchTranslation = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || !session.isSegmentLocked()) return;

    const sourceText = session.getFinalizedSourceText();
    if (!sourceText) return;

    const utteranceId = translationCoordinatorRef.current.nextUtteranceId();
    translationCoordinatorRef.current.beginTranslation(utteranceId);

    translateAbortRef.current?.abort();
    const controller = new AbortController();
    translateAbortRef.current = controller;

    const { settings } = useUIStore.getState();
    const config = session.getConfig();
    const context = session
      .getContextTurns()
      .slice(-CONTEXT_TURN_COUNT)
      .map((t) => ({
        sourceText: t.sourceText,
        translatedText: t.translatedText,
        sourceLang: t.sourceLang,
        targetLang: t.targetLang,
      }));

    try {
      const translatedText = await fetchFinalTranslation(
        settings.apiBaseUrl,
        {
          sourceText,
          sourceLang: config.sourceLang,
          targetLang: config.targetLang,
          context,
        },
        controller.signal,
      );

      if (!translationCoordinatorRef.current.isActiveTranslation(utteranceId)) return;
      if (!sessionRef.current?.isSegmentLocked()) return;

      sessionRef.current.applyFinalTranslation(translatedText);
      setSessionState({ ...sessionRef.current.getState() });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      if (!translationCoordinatorRef.current.isActiveTranslation(utteranceId)) return;

      const message =
        err instanceof Error ? err.message : 'Translation failed';
      sessionRef.current?.setStatus('paused', message);
      setSessionState({ ...sessionRef.current!.getState() });
    }
  }, [setSessionState]);

  const beginSpaceHold = useCallback(() => {
    if (!isSessionActiveRef.current || !sessionRef.current) return;
    if (directionChangeInProgressRef.current) return;
    if (sessionRef.current.isSegmentLocked()) return;

    spaceHeldRef.current = true;
    audioRef.current?.setMuted(true);
    sessionRef.current.enterHoldPause();

    const sourceText = sessionRef.current.beginSegmentFinalize();
    setSessionState({ ...sessionRef.current.getState() });

    if (sourceText) {
      finalizePromiseRef.current = runBatchTranslation();
    }
  }, [setSessionState, runBatchTranslation]);

  const connectWebRTC = useCallback(async () => {
    const stream = audioRef.current?.getStream();
    if (!stream || !webrtcRef.current) return;

    const currentSettings = useUIStore.getState().settings;

    await webrtcRef.current.connect(stream, {
      apiBaseUrl: currentSettings.apiBaseUrl,
      sourceLang: currentSettings.sourceLang,
      targetLang: currentSettings.targetLang,
      onEvent: (event) => sessionRef.current?.handleRealtimeEvent(event),
      onConnectionChange: (connected) => {
        if (connected) {
          sessionRef.current?.resetReconnectAttempts();
          if (
            sessionRef.current?.getState().status !== 'paused' &&
            !sessionRef.current?.isSegmentLocked()
          ) {
            sessionRef.current?.setStatus('listening');
          }
        } else if (isSessionActiveRef.current && !intentionalDisconnectRef.current) {
          const session = sessionRef.current;
          if (!session?.recordReconnectAttempt()) return;

          webrtcRef.current?.disconnect();
          webrtcRef.current = new WebRTCClient();

          const delay = session.getReconnectDelayMs();
          reconnectTimerRef.current = setTimeout(() => {
            void connectWebRTC();
          }, delay);
        }
      },
      onError: (err) => sessionRef.current?.setStatus('error', err.message),
    });
  }, []);

  /** OpenAI recommends one translation session per output language — reconnect after each flip. */
  const reconnectForNewDirection = useCallback(async () => {
    if (
      !isSessionActiveRef.current ||
      !sessionRef.current ||
      !audioRef.current?.getStream() ||
      directionChangeInProgressRef.current
    ) {
      return;
    }

    directionChangeInProgressRef.current = true;

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    intentionalDisconnectRef.current = true;
    audioRef.current.setMuted(true);
    sessionRef.current.setStatus('connecting');
    setSessionState({ ...sessionRef.current.getState() });

    webrtcRef.current?.disconnect();
    webrtcRef.current = new WebRTCClient();

    try {
      await connectWebRTC();
      if (
        sessionRef.current.getState().status !== 'paused' &&
        !sessionRef.current.isSegmentLocked()
      ) {
        sessionRef.current.setStatus('listening');
      }
      audioRef.current.setMuted(false);
      setSessionState({ ...sessionRef.current.getState() });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to reconnect for new direction';
      sessionRef.current.setStatus('error', message);
      setSessionState({ ...sessionRef.current.getState() });
    } finally {
      intentionalDisconnectRef.current = false;
      directionChangeInProgressRef.current = false;
    }
  }, [connectWebRTC, setSessionState]);

  const endSpaceHold = useCallback(async () => {
    if (!spaceHeldRef.current) return;
    spaceHeldRef.current = false;

    if (!isSessionActiveRef.current || !sessionRef.current) return;
    if (directionChangeInProgressRef.current) return;

    try {
      if (finalizePromiseRef.current) {
        await finalizePromiseRef.current;
      }
    } catch {
      // errors surfaced via session state
    }
    finalizePromiseRef.current = null;

    if (!sessionRef.current.isSegmentLocked()) return;

    sessionRef.current.releaseHoldPause();
    flipDirection();
    setSessionState({ ...sessionRef.current.getState() });
    await reconnectForNewDirection();
  }, [setSessionState, flipDirection, reconnectForNewDirection]);

  /** Finish current segment (button): translate, commit, toggle direction, keep listening. */
  const finishSegment = useCallback(async () => {
    if (!isSessionActiveRef.current || !sessionRef.current) return;
    if (directionChangeInProgressRef.current) return;

    const session = sessionRef.current;

    if (!session.isSegmentLocked()) {
      audioRef.current?.setMuted(true);
      session.enterHoldPause();
      const sourceText = session.beginSegmentFinalize();
      setSessionState({ ...session.getState() });
      if (sourceText) {
        await runBatchTranslation();
      }
    } else if (finalizePromiseRef.current) {
      await finalizePromiseRef.current;
    }

    session.releaseHoldPause();
    flipDirection();
    spaceHeldRef.current = false;
    finalizePromiseRef.current = null;
    setSessionState({ ...session.getState() });
    await reconnectForNewDirection();
  }, [setSessionState, flipDirection, reconnectForNewDirection, runBatchTranslation]);

  const startSession = useCallback(async () => {
    try {
      const currentSettings = useUIStore.getState().settings;
      initEngine(currentSettings.sourceLang, currentSettings.targetLang);
      sessionRef.current?.setStatus('connecting');

      audioRef.current = new AudioCaptureService();
      webrtcRef.current = new WebRTCClient();

      await audioRef.current.start({
        deviceId: currentSettings.micDeviceId,
        onLevelChange: (level) => {
          const s = sessionRef.current;
          if (!s || s.getState().status === 'paused' || s.isSegmentLocked()) return;
          s.setAudioLevel(level);
        },
      });

      await connectWebRTC();
      setSessionActive(true);
      sessionRef.current?.setStatus('listening');
    } catch (err) {
      cleanupConnections();
      const message =
        err instanceof Error ? err.message : 'Failed to start session';
      sessionRef.current?.setStatus('error', message);
    }
  }, [initEngine, setSessionActive, cleanupConnections, connectWebRTC]);

  const toggleSession = useCallback(async () => {
    if (isSessionActive) {
      stopSession();
    } else {
      await startSession();
    }
  }, [isSessionActive, startSession, stopSession]);

  const swapAndRestart = useCallback(async () => {
    const wasActive = isSessionActive;
    stopSession();
    useUIStore.getState().swapLanguages();
    if (wasActive) {
      await startSession();
    }
  }, [isSessionActive, startSession, stopSession]);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'c' && e.shiftKey) {
        const state = useUIStore.getState().sessionState;
        const text = state?.partialTranslation || state?.translatedText;
        if (text) void navigator.clipboard.writeText(text);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
        e.preventDefault();
        void swapAndRestart();
      }
      if (e.code === 'Space' && !isTypingTarget(e.target)) {
        e.preventDefault();
        if (e.repeat) return;
        if (isSessionActiveRef.current) {
          beginSpaceHold();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTypingTarget(e.target)) {
        e.preventDefault();
        void endSpaceHold();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [beginSpaceHold, endSpaceHold, swapAndRestart]);

  useEffect(() => () => cleanupConnections(), [cleanupConnections]);

  return {
    toggleSession,
    finishSegment,
    swapAndRestart,
    stopSession,
    clearConversation: async () => {
      cleanupConnections();
      sessionRef.current?.clearConversation();
      await useUIStore.getState().clearConversation();
    },
    isSessionActive,
    isPaused,
  };
}
