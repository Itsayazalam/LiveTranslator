import { useCallback, useEffect, useRef } from 'react';
import { TranslationSession } from '@live-translator/core';
import type { AppLanguage } from '@live-translator/shared';
import { AudioCaptureService } from '../services/audio-capture';
import { conversationRepository } from '../services/conversation-repository';
import { fetchFinalTranslation } from '../services/final-translator';
import { WebRTCClient } from '../services/webrtc-client';
import { useUIStore } from '../stores/ui-store';

export function useTranslationSession() {
  const settings = useUIStore((s) => s.settings);
  const setSessionState = useUIStore((s) => s.setSessionState);
  const setSessionActive = useUIStore((s) => s.setSessionActive);
  const isSessionActive = useUIStore((s) => s.isSessionActive);
  const persistedConversation = useUIStore((s) => s.persistedConversation);

  const sessionRef = useRef<TranslationSession | null>(null);
  const audioRef = useRef<AudioCaptureService | null>(null);
  const webrtcRef = useRef<WebRTCClient | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translationAbortRef = useRef<AbortController | null>(null);
  const isSessionActiveRef = useRef(false);

  useEffect(() => {
    isSessionActiveRef.current = isSessionActive;
  }, [isSessionActive]);

  const handleUtteranceReady = useCallback(
    async (event: {
      utteranceId: number;
      sourceText: string;
      sourceLang: AppLanguage;
      targetLang: AppLanguage;
    }) => {
      translationAbortRef.current?.abort();
      const controller = new AbortController();
      translationAbortRef.current = controller;

      const session = sessionRef.current;
      if (!session) return;

      const context = session.getContextTurns().map((turn) => ({
        sourceText: turn.sourceText,
        translatedText: turn.translatedText,
        sourceLang: turn.sourceLang,
        targetLang: turn.targetLang,
      }));

      try {
        const translatedText = await fetchFinalTranslation(
          useUIStore.getState().settings.apiBaseUrl,
          {
            sourceText: event.sourceText,
            sourceLang: event.sourceLang,
            targetLang: event.targetLang,
            context,
          },
          controller.signal,
        );

        session.applyFinalTranslation(event.utteranceId, translatedText, event.sourceText);
        setSessionState(session.getState());
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const message = err instanceof Error ? err.message : 'Translation failed';
        session.setStatus('error', message);
        setSessionState(session.getState());
      }
    },
    [setSessionState],
  );

  const initEngine = useCallback(
    (sourceLang: AppLanguage, targetLang: AppLanguage) => {
      sessionRef.current = new TranslationSession({
        config: { sourceLang, targetLang },
        onStateChange: setSessionState,
        onUtteranceReady: (event) => {
          void handleUtteranceReady(event);
        },
        onTurnComplete: (turn) => {
          const state = sessionRef.current?.getState();
          void conversationRepository.appendTurn(
            turn,
            state?.sourceTranscript ?? turn.sourceText,
            state?.translatedText ?? turn.translatedText,
          );

          const context = sessionRef.current?.getTurnBuffer().toContextPrompt();
          if (context) {
            webrtcRef.current?.updateContext(context);
          }
        },
      });

      if (persistedConversation) {
        sessionRef.current.hydrate(
          persistedConversation.turns,
          persistedConversation.lastSourceText,
          persistedConversation.lastTranslatedText,
        );
      }

      setSessionState(sessionRef.current.getState());
    },
    [setSessionState, persistedConversation, handleUtteranceReady],
  );

  const cleanupConnections = useCallback(() => {
    translationAbortRef.current?.abort();
    translationAbortRef.current = null;

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    webrtcRef.current?.disconnect();
    audioRef.current?.stop();
    webrtcRef.current = null;
    audioRef.current = null;
    setSessionActive(false);
  }, [setSessionActive]);

  const stopSession = useCallback(() => {
    cleanupConnections();
    sessionRef.current?.stopListening();
    if (sessionRef.current) {
      setSessionState(sessionRef.current.getState());
    }
  }, [cleanupConnections, setSessionState]);

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
          sessionRef.current?.setStatus('listening');
        } else if (isSessionActiveRef.current) {
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

  const startSession = useCallback(async () => {
    try {
      initEngine(settings.sourceLang, settings.targetLang);
      sessionRef.current?.setStatus('connecting');

      audioRef.current = new AudioCaptureService();
      webrtcRef.current = new WebRTCClient();

      await audioRef.current.start({
        deviceId: settings.micDeviceId,
        onLevelChange: (level) => sessionRef.current?.setAudioLevel(level),
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
  }, [initEngine, settings, setSessionActive, cleanupConnections, connectWebRTC]);

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
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'c' && e.shiftKey) {
        const text = useUIStore.getState().sessionState?.translatedText;
        if (text) void navigator.clipboard.writeText(text);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
        e.preventDefault();
        void swapAndRestart();
      }
      if (e.key === ' ' && e.target === document.body) {
        e.preventDefault();
        void toggleSession();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSession, swapAndRestart]);

  useEffect(() => () => cleanupConnections(), [cleanupConnections]);

  return {
    toggleSession,
    swapAndRestart,
    stopSession,
    clearConversation: async () => {
      cleanupConnections();
      sessionRef.current?.clearConversation();
      await useUIStore.getState().clearConversation();
    },
    isSessionActive,
  };
}
