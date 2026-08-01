import { LANGUAGE_LABELS, formatTurnLanguages, type DialogueTurn, type SessionState } from '@live-translator/shared';

interface TranscriptPanelProps {
  label: string;
  text: string;
  partial: string;
  lang: string;
  isActive: boolean;
}

export function TranscriptPanel({ label, text, partial, lang, isActive }: TranscriptPanelProps) {
  const displayText = partial || text;

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface-raised p-5 min-h-[140px]">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide">{label}</h2>
        <span className="text-xs text-muted/60">{lang}</span>
      </div>
      <p className="text-lg leading-relaxed whitespace-pre-wrap">
        {displayText || (
          <span className="text-muted/40 italic">
            {isActive ? 'Waiting for speech…' : 'Press Start to begin interpreting'}
          </span>
        )}
        {partial && (
          <span className="inline-block w-0.5 h-5 bg-accent ml-0.5 animate-pulse align-middle" />
        )}
      </p>
    </section>
  );
}

interface TranslationPanelProps {
  text: string;
  lang: string;
  status: SessionState['status'];
  onCopy: () => void;
  isActive: boolean;
}

export function TranslationPanel({ text, lang, status, onCopy, isActive }: TranslationPanelProps) {
  const placeholder =
    status === 'translating'
      ? '🟢 Translating…'
      : isActive
        ? 'Waiting for complete sentence…'
        : 'Your translations are saved below';

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-accent/30 bg-surface-raised p-5 min-h-[140px]">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-accent uppercase tracking-wide">
          Translation
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted/60">{lang}</span>
          {text && (
            <button
              onClick={onCopy}
              className="text-xs px-2 py-1 rounded-md bg-border hover:bg-accent/20 transition-colors"
              title="Copy translation (Cmd+Shift+C)"
            >
              Copy
            </button>
          )}
        </div>
      </div>
      <p className="text-xl leading-relaxed font-medium whitespace-pre-wrap">
        {text || (
          <span className="text-muted/40 italic font-normal">{placeholder}</span>
        )}
      </p>
    </section>
  );
}

interface ConversationHistoryProps {
  turns: DialogueTurn[];
  onClear: () => void;
}

export function ConversationHistory({ turns, onClear }: ConversationHistoryProps) {
  if (turns.length === 0) return null;

  return (
    <section className="mt-2 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs text-muted uppercase tracking-wide">
          Conversation ({turns.length} {turns.length === 1 ? 'turn' : 'turns'})
        </h3>
        <button
          onClick={onClear}
          className="text-xs text-muted hover:text-danger transition-colors"
        >
          Clear history
        </button>
      </div>
      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {turns.map((turn) => (
          <TurnCard key={turn.id} turn={turn} />
        ))}
      </div>
    </section>
  );
}

function TurnCard({ turn }: { turn: DialogueTurn }) {
  const time = new Date(turn.completedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="text-sm rounded-lg border border-border/50 px-3 py-2.5 bg-surface-raised/50">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-muted/60">
          {formatTurnLanguages(turn.sourceLang, turn.targetLang)}
        </span>
        <span className="text-xs text-muted/40">{time}</span>
      </div>
      <p className="text-muted">{turn.sourceText}</p>
      <p className="text-white mt-1">{turn.translatedText}</p>
      {turn.latencyMs > 0 && (
        <p className="text-xs text-muted/40 mt-1">{turn.latencyMs}ms</p>
      )}
    </div>
  );
}

interface StatusBarProps {
  state: SessionState;
  isActive: boolean;
  onToggle: () => void;
}

export function StatusBar({ state, isActive, onToggle }: StatusBarProps) {
  const statusLabel: Record<SessionState['status'], string> = {
    idle: 'Ready',
    connecting: 'Connecting…',
    listening: '🟡 Listening…',
    translating: '🟢 Translating…',
    error: 'Error',
    reconnecting: 'Reconnecting…',
  };

  const statusColor: Record<SessionState['status'], string> = {
    idle: 'text-muted',
    connecting: 'text-yellow-400',
    listening: 'text-yellow-400',
    translating: 'text-success',
    error: 'text-danger',
    reconnecting: 'text-yellow-400',
  };

  return (
    <footer className="flex items-center justify-between gap-4 pt-2">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggle}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-medium transition-all ${
            isActive
              ? 'bg-danger/20 text-danger hover:bg-danger/30 border border-danger/30'
              : 'bg-accent text-white hover:bg-accent-hover'
          }`}
        >
          {isActive && state.status === 'listening' && (
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 listening-pulse" />
          )}
          {isActive && state.status === 'translating' && (
            <span className="w-2.5 h-2.5 rounded-full bg-success listening-pulse" />
          )}
          {isActive ? 'Stop' : 'Start'}
        </button>

        <span className={`text-sm ${statusColor[state.status]}`}>
          {statusLabel[state.status]}
        </span>

        {state.audioLevel > 0 && isActive && (
          <div className="flex items-end gap-0.5 h-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="w-1 bg-accent/60 rounded-full transition-all"
                style={{
                  height: `${Math.max(2, (state.audioLevel / 100) * 16 * ((i + 1) / 8))}px`,
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 text-sm text-muted">
        {state.latencyMs !== null && (
          <span>
            Latency:{' '}
            <span className="text-white font-mono">{state.latencyMs}ms</span>
          </span>
        )}
        <span className="text-xs text-muted/50 hidden sm:inline">
          Space: toggle · Cmd+L: swap · Cmd+Shift+C: copy
        </span>
      </div>
    </footer>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 flex items-center justify-between">
      <p className="text-sm text-danger">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-sm px-3 py-1 rounded-md bg-danger/20 hover:bg-danger/30 transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function getLangLabel(code: string): string {
  return LANGUAGE_LABELS[code as keyof typeof LANGUAGE_LABELS] ?? code;
}
