import { useUIStore, getLanguagePairLabel } from './stores/ui-store';
import {
  TranscriptPanel,
  TranslationPanel,
  ConversationHistory,
  StatusBar,
  ErrorBanner,
  getLangLabel,
} from './components/Panels';
import { SettingsPanel } from './components/SettingsPanel';
import { useTranslationSession } from './hooks/useTranslationSession';

export default function App() {
  const settings = useUIStore((s) => s.settings);
  const sessionState = useUIStore((s) => s.sessionState);
  const showSettings = useUIStore((s) => s.showSettings);
  const toggleSettings = useUIStore((s) => s.toggleSettings);
  const { toggleSession, swapAndRestart, isSessionActive, clearConversation: clearAll } =
    useTranslationSession();

  const state = sessionState ?? {
    status: 'idle' as const,
    sourceTranscript: '',
    translatedText: '',
    partialSource: '',
    partialTranslation: '',
    turns: [],
    latencyMs: null,
    error: null,
    audioLevel: 0,
  };

  const handleCopy = () => {
    if (state.translatedText) void navigator.clipboard.writeText(state.translatedText);
  };

  const handleClear = () => {
    if (state.turns.length === 0) return;
    if (window.confirm('Clear all conversation history?')) {
      void clearAll();
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Live AI Interpreter</h1>
          <p className="text-sm text-muted mt-0.5">
            Real-time Australian English ↔ Hindi
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => void swapAndRestart()}
            className="px-3 py-1.5 rounded-lg border border-border hover:bg-surface-raised text-sm transition-colors"
            title="Swap languages (Cmd+L)"
          >
            {getLanguagePairLabel(settings.sourceLang, settings.targetLang)}
          </button>
          <button
            onClick={toggleSettings}
            className="p-2 rounded-lg border border-border hover:bg-surface-raised transition-colors"
            title="Settings"
            aria-label="Settings"
          >
            ⚙
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-6 py-8 flex flex-col gap-6">
        {state.error && state.status === 'error' && (
          <ErrorBanner message={state.error} onRetry={() => void toggleSession()} />
        )}

        {state.status === 'reconnecting' && (
          <div className="rounded-lg border border-yellow-400/30 bg-yellow-400/10 px-4 py-3">
            <p className="text-sm text-yellow-400">Connection lost. Reconnecting…</p>
          </div>
        )}

        <TranscriptPanel
          label="Original"
          text={state.sourceTranscript}
          partial={state.partialSource}
          lang={getLangLabel(settings.sourceLang)}
          isActive={isSessionActive}
        />

        <TranslationPanel
          text={state.translatedText}
          lang={getLangLabel(settings.targetLang)}
          status={state.status}
          onCopy={handleCopy}
          isActive={isSessionActive}
        />

        <ConversationHistory turns={state.turns} onClear={handleClear} />

        <StatusBar state={state} isActive={isSessionActive} onToggle={() => void toggleSession()} />
      </main>

      {showSettings && <SettingsPanel onClose={toggleSettings} />}
    </div>
  );
}
